#!/usr/bin/env python3
"""Slopcheck Slack bot.

A self-hosted Slack bot. When mentioned in a channel or DM'd, it grabs the
message text (or a thread parent's text), runs slopcheck on it via the hosted
tier (or BYOK if configured), and replies with the analysis.

Architecture: thin wrapper around the existing slopcheck hosted-tier Function.
This bot does not duplicate any analysis logic — it sends the text to
https://tools.synthesiswriting.org/slopcheck/api/hosted/analyze and posts the response
back.

Privacy: this bot does not store conversation history. Slack itself keeps the
messages in the workspace, same as any other Slack interaction.

Deployment options:
  1. Fly.io / Render / Railway / your own server. Python 3.10+.
  2. Cloudflare Workers (would require rewriting in JS; this scaffold is
     Python for simplicity and self-host friendliness).

Required environment variables:
  SLACK_BOT_TOKEN          — xoxb-... from your Slack app's OAuth & Permissions
  SLACK_SIGNING_SECRET     — from your Slack app's Basic Information
  SLOPCHECK_HOSTED_URL     — optional; default https://tools.synthesiswriting.org/slopcheck/api/hosted/analyze
  SLOPCHECK_INTERNAL_KEY   — optional; shared secret to bypass Turnstile on the hosted tier
  SLOPCHECK_BYOK_PROVIDER  — optional; if set, use BYOK instead of hosted tier
  SLOPCHECK_BYOK_KEY       — required if SLOPCHECK_BYOK_PROVIDER is set
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request

try:
    from slack_bolt import App
    from slack_bolt.adapter.socket_mode import SocketModeHandler
except ImportError:
    sys.stderr.write(
        "slack_bolt is required. Install with: pip install slack-bolt\n"
    )
    sys.exit(2)


SLOPCHECK_HOSTED_URL = os.environ.get(
    "SLOPCHECK_HOSTED_URL", "https://tools.synthesiswriting.org/slopcheck/api/hosted/analyze"
)
INTERNAL_KEY = os.environ.get("SLOPCHECK_INTERNAL_KEY", "")
BYOK_PROVIDER = os.environ.get("SLOPCHECK_BYOK_PROVIDER", "")
BYOK_KEY = os.environ.get("SLOPCHECK_BYOK_KEY", "")
DEFAULT_MODEL = "claude-haiku-4-5-20251001"
MAX_INPUT_CHARS = 200000


app = App(
    token=os.environ["SLACK_BOT_TOKEN"],
    signing_secret=os.environ["SLACK_SIGNING_SECRET"],
)


@app.event("app_mention")
def handle_mention(event, say, client):
    """Respond when @slopcheck is mentioned in a channel."""
    text = strip_mentions(event.get("text", ""))
    # If the mention has no content, try the thread parent.
    if not text.strip() and event.get("thread_ts"):
        text = fetch_thread_parent(client, event["channel"], event["thread_ts"])
    if not text.strip():
        say(
            text="Mention me with the text to slopcheck, or use me in a thread to slopcheck the thread's first message.",
            thread_ts=event.get("ts"),
        )
        return

    if len(text) > MAX_INPUT_CHARS:
        say(
            text=(
                f"That's {len(text):,} characters — over the {MAX_INPUT_CHARS:,} cap on this channel. "
                "Use the web app at tools.synthesiswriting.org/slopcheck with your own API key for longer documents."
            ),
            thread_ts=event.get("ts"),
        )
        return

    say(text="Analyzing…", thread_ts=event.get("ts"))
    try:
        analysis = run_slopcheck(text)
    except Exception as e:
        say(text=f"Slopcheck error: {e}", thread_ts=event.get("ts"))
        return

    say(text=format_slack_response(analysis), thread_ts=event.get("ts"))


@app.event("message")
def handle_dm(event, say, client):
    """Respond to direct messages."""
    if event.get("channel_type") != "im":
        return
    if event.get("subtype") or event.get("bot_id"):
        return
    text = event.get("text", "").strip()
    if not text:
        return

    if len(text) > MAX_INPUT_CHARS:
        say(text=(
            f"That's {len(text):,} characters — over the {MAX_INPUT_CHARS:,} cap. "
            "Use the web app at tools.synthesiswriting.org/slopcheck with your own API key for longer documents."
        ))
        return

    say(text="Analyzing…")
    try:
        analysis = run_slopcheck(text)
    except Exception as e:
        say(text=f"Slopcheck error: {e}")
        return
    say(text=format_slack_response(analysis))


def strip_mentions(text: str) -> str:
    """Remove <@U123456> mentions so the model sees clean content."""
    return re.sub(r"<@[A-Z0-9]+>", "", text).strip()


def fetch_thread_parent(client, channel: str, thread_ts: str) -> str:
    try:
        result = client.conversations_replies(channel=channel, ts=thread_ts, limit=1)
        messages = result.get("messages", [])
        if messages:
            return strip_mentions(messages[0].get("text", ""))
    except Exception:
        return ""
    return ""


def run_slopcheck(text: str) -> str:
    """Send the text to the hosted-tier Function (or BYOK if configured)."""
    if BYOK_PROVIDER:
        return call_byok(text)
    return call_hosted(text)


def call_hosted(text: str) -> str:
    payload = {
        "provider": "anthropic",
        "model": DEFAULT_MODEL,
        "systemPrompt": build_system_prompt(),
        "userPrompt": build_user_prompt(text),
        "maxTokens": 6000,
    }
    headers = {"Content-Type": "application/json"}
    if INTERNAL_KEY:
        headers["X-Internal-Proxy-Key"] = INTERNAL_KEY
    req = urllib.request.Request(
        SLOPCHECK_HOSTED_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("text", "") or "(empty response)"
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"hosted-tier {e.code}: {body[:200]}")


def call_byok(text: str) -> str:
    """Direct provider call when BYOK environment is set."""
    if BYOK_PROVIDER != "anthropic":
        raise RuntimeError(f"BYOK provider '{BYOK_PROVIDER}' not supported in this scaffold; only 'anthropic'.")
    if not BYOK_KEY:
        raise RuntimeError("SLOPCHECK_BYOK_KEY is required when SLOPCHECK_BYOK_PROVIDER is set.")
    payload = {
        "model": DEFAULT_MODEL,
        "max_tokens": 6000,
        "system": build_system_prompt(),
        "messages": [{"role": "user", "content": build_user_prompt(text)}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": BYOK_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        content = data.get("content", [])
        if content and content[0].get("text"):
            return content[0]["text"]
        return "(empty response)"


def build_system_prompt() -> str:
    return (
        "You are Slopcheck, an editorial analyst applying the synthesis engineering slop-detection methodology. "
        "Apply the two-axis discipline: AI-provenance signals (Axis 1) and slop-independence (Axis 2). Report both separately. "
        "Honor ESL safe-harbor. Use zero em-dashes in your output. "
        "Keep the response under 1500 words. Use plain-text formatting suitable for Slack (no tables, no fenced code blocks)."
    )


def build_user_prompt(content: str) -> str:
    return (
        "Analyze this content. Return: (1) AI-provenance verdict; (2) slop-independence verdict; "
        "(3) top 3 revision recommendations; (4) one-paragraph overall verdict.\n\n---\n\n" + content
    )


def format_slack_response(analysis: str) -> str:
    return (
        analysis
        + "\n\n"
        + "_Slopcheck open source: github.com/synthesisengineering/synthesis-slopcheck • "
        + "Web app: tools.synthesiswriting.org/slopcheck • Support: github.com/sponsors/rajivpant_"
    )


if __name__ == "__main__":
    socket_token = os.environ.get("SLACK_APP_TOKEN")
    if not socket_token:
        sys.stderr.write(
            "SLACK_APP_TOKEN required for Socket Mode. Create one at "
            "api.slack.com → your app → Basic Information → App-Level Tokens "
            "with the connections:write scope.\n"
        )
        sys.exit(2)
    SocketModeHandler(app, socket_token).start()
