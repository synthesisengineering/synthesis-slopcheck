#!/usr/bin/env python3
"""Slopcheck Discord bot.

A self-hosted Discord bot. Slash command `/slopcheck` accepts a text argument
(or runs on the message a user replied to) and returns the analysis.

Architecture mirrors the Slack scaffold: this bot is a thin wrapper around
the slopcheck hosted-tier Function or a BYOK provider call. Stateless.

Privacy: this bot does not store conversation history. Discord itself keeps
the messages in the server, same as any other Discord interaction.

Required environment variables:
  DISCORD_BOT_TOKEN        — from your Discord application's Bot section
  SLOPCHECK_HOSTED_URL     — optional; default https://tools.synthesiswriting.org/slopcheck/api/hosted/analyze
  SLOPCHECK_INTERNAL_KEY   — optional; shared secret to bypass Turnstile on the hosted tier
  SLOPCHECK_BYOK_PROVIDER  — optional; if set, BYOK is used instead of the hosted tier
  SLOPCHECK_BYOK_KEY       — required if SLOPCHECK_BYOK_PROVIDER is set
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

try:
    import discord
    from discord import app_commands
except ImportError:
    sys.stderr.write(
        "discord.py is required. Install with: pip install -U discord.py\n"
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


intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)


@client.event
async def on_ready():
    await tree.sync()
    print(f"Slopcheck logged in as {client.user} (ready).")


@tree.command(name="slopcheck", description="Run slopcheck on the provided text.")
@app_commands.describe(text="The content to analyze. For long content, use the web app.")
async def slopcheck_command(interaction: discord.Interaction, text: str):
    await interaction.response.defer(thinking=True)

    if len(text) > MAX_INPUT_CHARS:
        await interaction.followup.send(
            f"That's {len(text):,} characters — over the {MAX_INPUT_CHARS:,} cap. "
            "Use the web app at tools.synthesiswriting.org/slopcheck with your own API key for longer documents."
        )
        return

    try:
        analysis = run_slopcheck(text)
    except Exception as e:
        await interaction.followup.send(f"Slopcheck error: {e}")
        return

    # Discord messages cap at 2000 chars; split if needed.
    for chunk in split_for_discord(format_response(analysis)):
        await interaction.followup.send(chunk)


@tree.context_menu(name="Slopcheck this message")
async def slopcheck_context(interaction: discord.Interaction, message: discord.Message):
    await interaction.response.defer(thinking=True)

    text = (message.content or "").strip()
    if not text:
        await interaction.followup.send("That message has no text to analyze.")
        return
    if len(text) > MAX_INPUT_CHARS:
        await interaction.followup.send(
            f"That message is {len(text):,} characters — over the {MAX_INPUT_CHARS:,} cap. "
            "Use the web app with your own API key for longer documents."
        )
        return

    try:
        analysis = run_slopcheck(text)
    except Exception as e:
        await interaction.followup.send(f"Slopcheck error: {e}")
        return

    for chunk in split_for_discord(format_response(analysis)):
        await interaction.followup.send(chunk)


def run_slopcheck(text: str) -> str:
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
        "Keep the response under 1500 words. Use plain-text formatting suitable for Discord (no tables, no fenced code blocks)."
    )


def build_user_prompt(content: str) -> str:
    return (
        "Analyze this content. Return: (1) AI-provenance verdict; (2) slop-independence verdict; "
        "(3) top 3 revision recommendations; (4) one-paragraph overall verdict.\n\n---\n\n" + content
    )


def format_response(analysis: str) -> str:
    return (
        analysis
        + "\n\n"
        + "_Slopcheck open source: github.com/synthesisengineering/synthesis-slopcheck • "
        + "Web app: tools.synthesiswriting.org/slopcheck • Support: github.com/sponsors/rajivpant_"
    )


def split_for_discord(text: str, limit: int = 1900):
    """Discord caps single messages at 2000 chars; chunk just below to be safe."""
    if len(text) <= limit:
        return [text]
    chunks = []
    while text:
        cut = text[:limit]
        # Try to break at a paragraph or sentence boundary near the limit.
        nl = cut.rfind("\n\n")
        if nl > limit // 2:
            chunks.append(text[:nl])
            text = text[nl:].lstrip()
            continue
        period = cut.rfind(". ")
        if period > limit // 2:
            chunks.append(text[: period + 1])
            text = text[period + 1 :].lstrip()
            continue
        chunks.append(cut)
        text = text[limit:]
    return chunks


if __name__ == "__main__":
    token = os.environ.get("DISCORD_BOT_TOKEN")
    if not token:
        sys.stderr.write("DISCORD_BOT_TOKEN required.\n")
        sys.exit(2)
    client.run(token)
