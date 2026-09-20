// Email-in worker tests. Run: npm test
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../email-handler.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function makeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async get(k) {
      return store.has(k) ? store.get(k) : null;
    },
    async put(k, v) {
      store.set(k, v);
    },
  };
}

function makeMessage({ from = "ada@example.com", raw = null } = {}) {
  const replies = [];
  return {
    replies,
    message: {
      from,
      raw:
        raw ??
        "From: ada@example.com\r\nContent-Type: text/plain\r\n\r\nHello world, analyze this.",
      async reply(response) {
        replies.push(await response.text());
      },
    },
  };
}

function makeEnv(kv) {
  return {
    SLOPCHECK_KV: kv,
    SENDER_HASH_SALT: "test-salt",
    INTERNAL_PROXY_KEY: "test-key",
  };
}

describe("guards", () => {
  it("returns silently without the KV binding", async () => {
    const { message, replies } = makeMessage();
    await worker.email(message, {}, {});
    assert.equal(replies.length, 0);
  });

  it("replies when the sender is unreadable", async () => {
    const kv = makeKV();
    const { message, replies } = makeMessage({ from: "  " });
    await worker.email(message, makeEnv(kv), {});
    assert.equal(replies.length, 1);
    assert.match(replies[0], /couldn't read a sender/);
  });

  it("enforces the per-sender daily limit without calling the API", async () => {
    let fetched = false;
    globalThis.fetch = async () => {
      fetched = true;
      return new Response(JSON.stringify({ text: "x" }));
    };
    const kv = makeKV();
    // Pre-fill every plausible key is brittle; instead drive 10 sends then 1.
    const env = makeEnv(kv);
    for (let i = 0; i < 10; i++) {
      const { message } = makeMessage();
      await worker.email(message, env, {});
    }
    const { message, replies } = makeMessage();
    await worker.email(message, env, {});
    assert.match(replies[0], /daily limit/);
    assert.equal(kv.store.size, 1);
    assert.equal([...kv.store.values()][0], "10");
    assert.equal(fetched, true); // first 10 went through
  });
});

describe("body handling", () => {
  it("replies on empty body", async () => {
    const kv = makeKV();
    const { message, replies } = makeMessage({
      raw: "From: a@b.co\r\nContent-Type: text/plain\r\n\r\n   ",
    });
    await worker.email(message, makeEnv(kv), {});
    assert.match(replies[0], /body was empty/);
  });

  it("replies on oversized body", async () => {
    const kv = makeKV();
    const big = "x".repeat(200001);
    const { message, replies } = makeMessage({
      raw: `From: a@b.co\r\nContent-Type: text/plain\r\n\r\n${big}`,
    });
    await worker.email(message, makeEnv(kv), {});
    assert.match(replies[0], /over the .* email-channel limit/);
  });

  it("strips HTML to text", async () => {
    let seenBody = null;
    globalThis.fetch = async (url, opts) => {
      seenBody = JSON.parse(opts.body);
      return new Response(JSON.stringify({ text: "analysis" }));
    };
    const kv = makeKV();
    const { message, replies } = makeMessage({
      raw: "From: a@b.co\r\nContent-Type: text/html\r\n\r\n<p>Hello <b>world</b></p><script>evil()</script>",
    });
    await worker.email(message, makeEnv(kv), {});
    assert.match(seenBody.userPrompt, /Hello world/);
    assert.doesNotMatch(seenBody.userPrompt, /evil\(\)/);
    assert.match(replies[0], /Slopcheck analysis:/);
  });
});

describe("happy path", () => {
  it("proxies with the internal key and replies with analysis", async () => {
    let seen = null;
    globalThis.fetch = async (url, opts) => {
      seen = { url, opts };
      return new Response(JSON.stringify({ text: "VERDICT: human" }));
    };
    const kv = makeKV();
    const { message, replies } = makeMessage();
    await worker.email(message, makeEnv(kv), {});
    assert.equal(
      seen.url,
      "https://tools.synthesiswriting.org/slopcheck/api/hosted/analyze"
    );
    assert.equal(seen.opts.headers["X-Internal-Proxy-Key"], "test-key");
    assert.match(replies[0], /VERDICT: human/);
    assert.match(replies[0], /not stored/);
    assert.equal([...kv.store.values()][0], "1");
  });

  it("replies with an error when the hosted tier fails", async () => {
    globalThis.fetch = async () =>
      new Response("bad", { status: 500 });
    const kv = makeKV();
    const { message, replies } = makeMessage();
    await worker.email(message, makeEnv(kv), {});
    assert.match(replies[0], /encountered an error/);
  });
});
