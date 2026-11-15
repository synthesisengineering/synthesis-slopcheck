// Slopcheck email-in Worker.
//
// Forward any email to `check@<your-domain>` and the Worker:
//   1. Parses the MIME body for plain text or text/html → text.
//   2. Calls the hosted-tier slopcheck Function with the text as content.
//   3. Replies to the sender with the structured analysis.
//
// Architecture decision: this is a SEPARATE Cloudflare Worker (not a Pages
// Function) because Email Workers require an Email Routing binding and a
// different deployment kind. The Email Worker itself is small and stateless;
// the heavy lifting still goes through the existing hosted-tier Function
// (which gives us the same seven safety layers — rate limit, kill switch,
// input size cap, model allowlist, Turnstile bypass for email, etc.).
//
// Privacy: the Worker does not store any email content. The reply is sent
// back to the original sender and forgotten. Cloudflare Email Routing logs
// metadata (sender, recipient, timestamp) the same way it would for any
// routed mail; that is outside this Worker's control.
//
// Bypass discipline: email path does NOT use Turnstile (impractical for
// email). Instead, sender-based rate limiting is applied (10 messages per
// sender per UTC day) plus the same global budget kill switch as the hosted
// tier. Sender addresses are HMAC-hashed before they touch KV, same as IPs.

import PostalMime, { decodeWords } from "postal-mime";
import { EmailMessage } from "cloudflare:email";

const MAX_INPUT_CHARS = 200000;
const PER_SENDER_DAILY_LIMIT = 10;
const SLOPCHECK_HOSTED_URL = "https://tools.synthesiswriting.org/slopcheck/api/hosted/analyze";

const encoder = new TextEncoder();

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export default {
  async email(message, env, ctx) {
    // Bindings expected:
    //   env.SLOPCHECK_KV         — KV namespace for sender rate limiting
    //   env.SENDER_HASH_SALT     — secret salt for HMAC hashing of sender addresses
    //   env.INTERNAL_PROXY_KEY   — secret shared with the hosted-tier Function
    //                              (header used to bypass Turnstile from server-side)
    if (!env.SLOPCHECK_KV) {
      console.error("SLOPCHECK_KV binding missing");
      return;
    }

    const sender = (message.from || "").toLowerCase().trim();
    if (!sender) {
      message.setReject("Slopcheck couldn't read a sender address.");
      return;
    }

    // Per-sender daily limit.
    const today = utcDateKey();
    const hashedSender = await hmacSha256Hex(env.SENDER_HASH_SALT || "default-salt", sender);
    const rlKey = `email_rl:${hashedSender}:${today}`;
    const rlRaw = await env.SLOPCHECK_KV.get(rlKey);
    const rlCount = rlRaw ? parseInt(rlRaw, 10) : 0;
    if (rlCount >= PER_SENDER_DAILY_LIMIT) {
      await replyWith(
        message,
        `Slopcheck: you've hit the per-sender daily limit of ${PER_SENDER_DAILY_LIMIT}. Try again tomorrow, or use the web app at https://tools.synthesiswriting.org/slopcheck with your own API key for unlimited use.`
      );
      return;
    }

    // Parse the email body.
    let bodyText = "";
    try {
      const parser = new PostalMime();
      const raw = new Response(message.raw);
      const parsed = await parser.parse(await raw.arrayBuffer());
      bodyText = parsed.text || stripHtml(parsed.html || "") || "";
    } catch (e) {
      await replyWith(message, "Slopcheck couldn't parse the email body. Make sure you sent plain text or HTML.");
      return;
    }

    bodyText = bodyText.trim();
    if (!bodyText) {
      await replyWith(message, "Slopcheck: the email body was empty. Paste the content to analyze in the body of the email.");
      return;
    }
    if (bodyText.length > MAX_INPUT_CHARS) {
      await replyWith(
        message,
        `Slopcheck: this email body is ${bodyText.length.toLocaleString()} characters, over the ${MAX_INPUT_CHARS.toLocaleString()} email-channel limit. Trim or use the web app with your own API key.`
      );
      return;
    }

    // Increment the rate-limit counter before doing the (longer) API call so
    // partial failures still consume quota and prevent retry abuse.
    await env.SLOPCHECK_KV.put(rlKey, String(rlCount + 1), { expirationTtl: 90000 });

    // Call the hosted-tier Function. We bypass Turnstile by sending the
    // internal proxy key in a header that only this Worker knows.
    let analysis;
    try {
      analysis = await callHostedTier({
        env,
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        systemPrompt: buildSystemPrompt(),
        userPrompt: buildUserPrompt(bodyText),
        userContent: bodyText,
        maxTokens: 6000,
      });
    } catch (e) {
      console.error("Slopcheck hosted call failed:", e);
      await replyWith(
        message,
        `Slopcheck encountered an error processing your email: ${e.message || "unknown error"}. Try again later or use the web app.`
      );
      return;
    }

    await replyWith(message, buildEmailReply(analysis));
  },
};

function stripHtml(html) {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function buildSystemPrompt() {
  return [
    "You are Slopcheck, an editorial analyst applying the synthesis engineering slop-detection methodology.",
    "Apply the two-axis discipline: AI-provenance signals (Axis 1) and slop-independence (Axis 2). Report both separately.",
    "Honor ESL safe-harbor. Use zero em-dashes in your output.",
    "Output the analysis in plain text or basic Markdown suitable for an email reply (no tables, no code fences, short headings).",
  ].join("\n");
}

function buildUserPrompt(content) {
  return `Analyze this content. Return: (1) AI-provenance signals with provenance verdict; (2) slop-independence with verdict; (3) top 3 revision recommendations; (4) one-paragraph overall verdict.\n\n---\n\n${content}`;
}

function buildEmailReply(analysisText) {
  return [
    "Slopcheck analysis:",
    "",
    analysisText,
    "",
    "---",
    "This analysis was produced by the open source synthesis engineering skill family.",
    "Web app: https://tools.synthesiswriting.org/slopcheck",
    "Open source: https://github.com/synthesisengineering/synthesis-slopcheck",
    "Privacy: email content and analysis are not stored in this Worker's KV database. A hashed sender-address rate-limit counter expires after 90,000 seconds (25 hours). Email services and the analysis provider have their own logging and retention policies.",
    "Support the open source work: https://github.com/sponsors/rajivpant",
  ].join("\n");
}

async function callHostedTier({ env, provider, model, systemPrompt, userPrompt, userContent, maxTokens }) {
  const response = await fetch(SLOPCHECK_HOSTED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Proxy-Key": env.INTERNAL_PROXY_KEY || "",
    },
    body: JSON.stringify({ provider, model, systemPrompt, userPrompt, userContent, maxTokens }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`hosted-tier ${response.status}: ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  if (!data.text) throw new Error("hosted-tier returned empty body");
  return data.text;
}

function headerText(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function utf8Base64(value) {
  return btoa(Array.from(encoder.encode(value), (byte) => String.fromCharCode(byte)).join(""));
}

function encodedSubject(value) {
  // Fold at Unicode character boundaries; each encoded word stays below 75 bytes.
  const chunks = [];
  let chunk = "";
  for (const char of value) {
    if (encoder.encode(chunk + char).length > 42) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) chunks.push(chunk);
  return chunks.map((part) => `=?UTF-8?B?${utf8Base64(part)}?=`).join("\r\n ");
}

async function replyWith(message, body) {
  try {
    const messageId = headerText(message.headers.get("Message-ID"));
    const references = headerText(message.headers.get("References"));
    const subject = decodeWords(headerText(message.headers.get("Subject"))) || "Slopcheck";
    const headers = [
      `From: ${headerText(message.to)}`,
      `To: ${headerText(message.from)}`,
      `Subject: ${encodedSubject(`Re: ${subject}`)}`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
    ];
    if (messageId) headers.push(`In-Reply-To: ${messageId}`);
    const replyReferences = [references, messageId].filter(Boolean).join(" ");
    if (replyReferences) headers.push(`References: ${replyReferences}`);
    const encodedBody = utf8Base64(body).match(/.{1,76}/g)?.join("\r\n") || "";
    const raw = [...headers, "", encodedBody, ""].join("\r\n");
    await message.reply(new EmailMessage(message.to, message.from, raw));
  } catch (e) {
    console.error("reply failed:", e);
  }
}
