#!/usr/bin/env python3
"""slopcheck CLI: command-line slop detection.

Applies the synthesis-engineering open-source slop detection methodology to
a piece of text and prints a structured analysis. BYOK (bring your own key).

Usage:
    # Analyze a file
    slopcheck article.md

    # Analyze from stdin
    cat article.md | slopcheck

    # Analyze a URL (fetches the content first)
    slopcheck https://example.com/article

    # Choose provider and model
    slopcheck --provider anthropic --model claude-opus-4-7 article.md
    slopcheck --provider openai --model gpt-5.5 article.md
    slopcheck --provider google --model gemini-3.1-pro-preview article.md

    # Override the API key (default: read from env vars ANTHROPIC_API_KEY,
    # OPENAI_API_KEY, or GOOGLE_API_KEY based on provider)
    slopcheck --api-key sk-ant-... article.md

    # Choose detector mode
    slopcheck --mode full-response article.md   # default: artifact
    slopcheck --mode artifact article.md

    # Save output to file
    slopcheck article.md --output analysis.md

Single dependency: the `requests` library (or use `--use-urllib` for
stdlib-only mode). No build step needed; this is a single-file CLI.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

MANIFEST_URL = (
    "https://raw.githubusercontent.com/synthesisengineering/synthesis-skills/"
    "main/tools/slop-detection/manifest.md"
)


# ---------- Model catalog (mirrors engines.yaml; see synthesis-slopcheck/providers.js) ----------

PROVIDERS = {
    "anthropic": {
        "name": "Anthropic (Claude)",
        "models": [
            {"id": "claude-opus-4-7", "label": "Claude Opus 4.7", "context_limit": 1000000},
            {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6", "context_limit": 1000000},
            {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5", "context_limit": 200000},
        ],
        "default_model": "claude-opus-4-7",
        "env_var": "ANTHROPIC_API_KEY",
    },
    "openai": {
        "name": "OpenAI (ChatGPT)",
        "models": [
            {"id": "gpt-5.5-pro", "label": "GPT-5.5 Pro", "context_limit": 1000000},
            {"id": "gpt-5.5", "label": "GPT-5.5", "context_limit": 1000000},
            {"id": "gpt-5.4-mini", "label": "GPT-5.4 Mini", "context_limit": 400000},
        ],
        "default_model": "gpt-5.5",
        "env_var": "OPENAI_API_KEY",
    },
    "google": {
        "name": "Google (Gemini)",
        "models": [
            {"id": "gemini-3.1-pro-preview", "label": "Gemini 3.1 Pro", "context_limit": 1048576},
            {"id": "gemini-3-flash-preview", "label": "Gemini 3 Flash", "context_limit": 1048576},
            {"id": "gemini-3.1-flash-lite-preview", "label": "Gemini 3.1 Flash Lite", "context_limit": 1048576},
        ],
        "default_model": "gemini-3-flash-preview",
        "env_var": "GOOGLE_API_KEY",
    },
}


# ---------- Network and skill loading ----------


def fetch_text(url: str) -> str:
    """Fetch a URL and return the body as text."""
    req = urllib.request.Request(url, headers={"User-Agent": "slopcheck-cli/0.1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8")


def load_all_skill_files() -> dict[str, str]:
    """Fetch the manifest from GitHub, then fetch every skill URL it lists."""
    eprint("Fetching skill manifest from GitHub...")
    manifest_text = fetch_text(MANIFEST_URL)
    urls = extract_skill_urls(manifest_text)
    eprint(f"Fetching {len(urls)} skill files...")
    skills = {}
    for url in urls:
        text = fetch_text(url)
        relative = relative_path_from_url(url)
        skills[relative] = text
    return skills


def extract_skill_urls(manifest_text: str) -> list[str]:
    import re

    pattern = re.compile(
        r"https://raw\.githubusercontent\.com/synthesisengineering/synthesis-skills/[^\s)]+\.md"
    )
    seen = set()
    ordered = []
    for url in pattern.findall(manifest_text):
        if url not in seen:
            seen.add(url)
            ordered.append(url)
    return ordered


def relative_path_from_url(url: str) -> str:
    import re

    match = re.search(r"/main/(.+)$", url)
    return match.group(1) if match else url


# ---------- Token estimation ----------


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


# ---------- Provider adapters ----------


def call_anthropic(
    api_key: str, model: str, system_prompt: str, user_prompt: str, max_tokens: int = 8000
) -> str:
    data = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(data).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if payload.get("content") and payload["content"]:
            return payload["content"][0].get("text", "")
        raise RuntimeError("Anthropic returned an empty response.")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
            message = parsed.get("error", {}).get("message", body)
        except json.JSONDecodeError:
            message = body
        raise RuntimeError(f"Anthropic API error ({e.code}): {message}") from e


def call_openai(
    api_key: str, model: str, system_prompt: str, user_prompt: str, max_tokens: int = 8000
) -> str:
    data = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_completion_tokens": max_tokens,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(data).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as response:
            payload = json.loads(response.read().decode("utf-8"))
        choices = payload.get("choices") or []
        if choices and "message" in choices[0]:
            return choices[0]["message"].get("content", "")
        raise RuntimeError("OpenAI returned an empty response.")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
            message = parsed.get("error", {}).get("message", body)
        except json.JSONDecodeError:
            message = body
        raise RuntimeError(f"OpenAI API error ({e.code}): {message}") from e


def call_google(
    api_key: str, model: str, system_prompt: str, user_prompt: str, max_tokens: int = 8000
) -> str:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    data = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.3},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as response:
            payload = json.loads(response.read().decode("utf-8"))
        candidates = payload.get("candidates") or []
        if candidates and "content" in candidates[0]:
            parts = candidates[0]["content"].get("parts") or []
            if parts and "text" in parts[0]:
                return parts[0]["text"]
        raise RuntimeError("Google returned an empty response.")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
            message = parsed.get("error", {}).get("message", body)
        except json.JSONDecodeError:
            message = body
        raise RuntimeError(f"Google API error ({e.code}): {message}") from e


PROVIDER_CALL = {
    "anthropic": call_anthropic,
    "openai": call_openai,
    "google": call_google,
}


# ---------- Orchestrator (single-pass and multi-pass strategies) ----------


def assemble_skill_content(skill_files: dict[str, str], paths: list[str]) -> str:
    pieces = []
    for path in paths:
        text = skill_files.get(path)
        if text:
            pieces.append(f"\n\n# ===== SKILL FILE: {path} =====\n\n{text}")
    return "\n".join(pieces)


def build_single_pass_system_prompt(skill_content: str) -> str:
    return (
        "You are an editorial analyst applying the synthesis engineering open-source slop "
        "detection methodology. The full methodology is below. Read it carefully before "
        "analyzing the user's content.\n\n"
        "Detect SLOP, not AI provenance alone. High-quality AI-collaborated content can be "
        "excellent; styled empty human content is slop. Your analysis targets quality, not "
        "provenance. The two axes (AI-provenance and slop-independence) are reported "
        "separately; do not collapse them.\n\n"
        "Honor the methodology's calibration discipline: ESL safe-harbor (do not flag uniform "
        "paragraph length + restricted vocabulary + heavy transitions as AI unless a "
        "register-specific AI marker is also present); zone-conditional detection (apply "
        "patterns per the requested detector mode); per-family base-rate weighting (em-dash "
        "density signal is HIGH for Claude, LOW for GPT-5.1+ and Llama).\n\n"
        "Apply the methodology faithfully. Do not invent patterns. Where evidence is thin, "
        "say so. Use zero em-dashes in your output (criterion A3-SS-001 of the methodology).\n\n"
        "=== METHODOLOGY (skill files) ===\n"
        f"{skill_content}\n"
        "=== END METHODOLOGY ==="
    )


def build_user_prompt(user_content: str, mode: str) -> str:
    if mode == "artifact":
        mode_line = (
            "Detector mode: artifact mode. The user is providing only the produced artifact, "
            "not a chat transcript. Apply BODY-PERSISTENT, HYBRID, and MID-BODY-INSERT "
            "patterns. Skip WRAPPER-OPENER and WRAPPER-CLOSER patterns."
        )
    else:
        mode_line = (
            "Detector mode: full-response mode. The user is providing a full LLM response "
            "including the conversational wrapper. Apply all patterns including wrapper-zone "
            "patterns."
        )
    return (
        "Apply the synthesis engineering slop detection methodology to the content below.\n\n"
        f"{mode_line}\n\n"
        "Produce a structured analysis in this format:\n\n"
        "## AI-provenance signals (Axis 1)\n"
        "List high-signal patterns triggered with short quoted snippets (under 20 words each). "
        "Family attribution if discernible. Apply ESL safe-harbor. Conclude with provenance "
        "confidence rating: Strong AI / Likely AI / Mixed / Likely human / Strong human.\n\n"
        "## Slop-independence (Axis 2)\n"
        "Apply the 5-minute A2 substance-and-depth editorial workflow on three sample "
        "paragraphs. Conclude with slop verdict: Substantive / Mostly substantive / Mixed / "
        "Slop-leaning / Heavy slop.\n\n"
        "## Pattern catalog highlights\n"
        "Most informative A3 criteria and B2 combined-signal fingerprints.\n\n"
        "## Fact-check items\n"
        "Only if content has citations, quotes, or named studies.\n\n"
        "## Top revision recommendations\n"
        "3 to 5 specific, line-anchored changes.\n\n"
        "## Overall verdict\n"
        "One paragraph synthesizing the two axes.\n\n"
        "Here is the user's content:\n\n"
        f"{user_content}"
    )


def get_context_limit(provider: str, model: str) -> int:
    p = PROVIDERS.get(provider)
    if not p:
        return 100000
    for m in p["models"]:
        if m["id"] == model:
            return m["context_limit"]
    return 100000


def run_single_pass(
    provider: str,
    model: str,
    api_key: str,
    skill_files: dict[str, str],
    user_content: str,
    mode: str,
    max_tokens: int = 8000,
) -> str:
    """Single-pass: include all skill content in one API call."""
    all_skills = assemble_skill_content(skill_files, list(skill_files.keys()))
    system_prompt = build_single_pass_system_prompt(all_skills)
    user_prompt = build_user_prompt(user_content, mode)
    return PROVIDER_CALL[provider](api_key, model, system_prompt, user_prompt, max_tokens)


# ---------- Multi-pass strategy ----------

MULTI_PASS_DEFINITIONS = [
    {
        "id": "A1",
        "name": "AI-provenance signals (model-family fingerprinting)",
        "skill_files": [
            "synthesis-content-quality/SKILL.md",
            "synthesis-content-quality/references/model-family-fingerprints.md",
            "synthesis-content-quality/references/historical-patterns.md",
        ],
        "instruction": (
            "Identify AI-provenance signals in the user's content. Apply the v4.0 A1 model-family "
            "fingerprinting patterns from the skill files. Output: patterns triggered with quoted "
            "evidence (under 20 words per quote), family attribution, ESL safe-harbor check, "
            "provenance confidence rating. Use zero em-dashes."
        ),
    },
    {
        "id": "A2",
        "name": "Substance and depth (slop-independence)",
        "skill_files": [
            "synthesis-content-quality/SKILL.md",
            "synthesis-content-quality/references/substance-and-depth.md",
            "synthesis-writing-pitfalls/SKILL.md",
            "synthesis-writing-craft/SKILL.md",
        ],
        "instruction": (
            "Apply the 5-minute A2 substance-and-depth editorial workflow. Sample three "
            "paragraphs (strongest, average, weakest). Score deletion test, specificity, "
            "load-bearing claims, novelty, generic insight, pseudo-profundity, "
            "survey-without-claim. Slop verdict. Use zero em-dashes."
        ),
    },
    {
        "id": "A3-B2",
        "name": "Pattern catalog and combined-signal fingerprints",
        "skill_files": [
            "synthesis-content-quality/SKILL.md",
            "synthesis-content-quality/references/detailed-criteria.md",
            "synthesis-content-quality/references/combined-signal-fingerprints.md",
            "synthesis-content-quality/references/calibration-tables.md",
        ],
        "instruction": (
            "Scan the user's content against the 76 A3 criteria and 86 B2 combined-signal "
            "fingerprints. List triggered criteria with quoted evidence. List triggered "
            "B2 combos. Apply B3 calibration with per-family weighting. Use zero em-dashes."
        ),
    },
]

SYNTHESIS_PASS = {
    "id": "synthesis",
    "name": "Synthesis (final user-facing analysis)",
    "skill_files": [
        "synthesis-content-quality/SKILL.md",
        "synthesis-fact-checking/SKILL.md",
        "synthesis-writing-pitfalls/SKILL.md",
        "synthesis-writing-craft/SKILL.md",
        "synthesis-clean-text/SKILL.md",
    ],
}


def needs_fact_check_pass(content: str) -> bool:
    import re

    indicators = [
        r"\([A-Z][a-z]+(?:\s+(?:et\s+al\.|and\s+[A-Z][a-z]+))?,\s*\d{4}\)",
        r"https?://",
        r"doi:?\s*10\.",
        r"arxiv[:.\s]\s*\d{4}\.\d+",
        r'"[^"]{20,}"',
        r"according to",
        r"studies show",
        r"research(?:\s+by|\s+from|\s+indicates)",
    ]
    text = content.lower()
    for pat in indicators:
        if re.search(pat, text, flags=re.IGNORECASE):
            return True
    return False


FACT_CHECK_PASS = {
    "id": "C1",
    "name": "Fact-checking (per-family hallucination signatures and C1 protocols)",
    "skill_files": [
        "synthesis-fact-checking/SKILL.md",
        "synthesis-fact-checking/references/detailed-protocols.md",
        "synthesis-fact-checking/references/per-family-hallucination-signatures.md",
        "synthesis-fact-checking/references/citation-laundering-detection.md",
    ],
    "instruction": (
        "Apply v2.0 fact-checking methodology. Per-family hallucination signature check "
        "(Claude DOI, GPT URL, Gemini vague attribution, DeepSeek language-mixing, Llama "
        "long-context, Grok tweet). C1 protocols (nested attribution, paraphrase drift, "
        "composite quotes, position-shifting, source-translation drift, URL rot vs "
        "hallucination, AI-generated synthetic sources, citation laundering chains). "
        "List verifiability findings with quoted evidence. Use zero em-dashes."
    ),
}


def run_multi_pass(
    provider: str,
    model: str,
    api_key: str,
    skill_files: dict[str, str],
    user_content: str,
    mode: str,
) -> str:
    """Multi-pass: run each analytical pass with its skill subset, then synthesize."""
    passes = list(MULTI_PASS_DEFINITIONS)
    if needs_fact_check_pass(user_content):
        passes.append(FACT_CHECK_PASS)

    findings: dict[str, str] = {}
    total = len(passes) + 1

    for i, p in enumerate(passes, start=1):
        eprint(f"Pass {i} of {total}: {p['name']}")
        skill_content = assemble_skill_content(skill_files, p["skill_files"])
        system_prompt = (
            "You are an editorial analyst applying one analytical pass of the synthesis "
            "engineering slop detection methodology. The relevant skill files for this pass "
            "are below. Apply them to the user's content. Use zero em-dashes.\n\n"
            "=== SKILL FILES FOR THIS PASS ===\n"
            f"{skill_content}\n"
            "=== END SKILL FILES ==="
        )
        user_prompt = (
            f"{p['instruction']}\n\n"
            "Here is the user's content:\n\n"
            f"{user_content}"
        )
        findings[p["id"]] = PROVIDER_CALL[provider](
            api_key, model, system_prompt, user_prompt, max_tokens=4000
        )

    eprint(f"Pass {total} of {total}: {SYNTHESIS_PASS['name']}")
    skill_content = assemble_skill_content(skill_files, SYNTHESIS_PASS["skill_files"])
    findings_block = "\n\n".join(
        f"## Findings from pass {pid}\n\n{text}" for pid, text in findings.items()
    )
    mode_line = "artifact mode" if mode == "artifact" else "full-response mode"
    system_prompt = (
        "You are the synthesis pass of a multi-pass slop detection analysis. Previous "
        "analytical passes produced findings; your job is to synthesize them into the "
        "final user-facing analysis. The methodology SKILL.md files are below for framing. "
        "Use zero em-dashes. Apply two-axis discipline: AI-provenance and slop-independence "
        "are reported separately.\n\n"
        "=== METHODOLOGY (SKILL.md framing) ===\n"
        f"{skill_content}\n"
        "=== END METHODOLOGY ==="
    )
    user_prompt = (
        f"Detector mode for the original analysis: {mode_line}.\n\n"
        "Synthesize the previous-pass findings into the final structured analysis with "
        "sections: AI-provenance signals (Axis 1), Slop-independence (Axis 2), Pattern "
        "catalog highlights, Fact-check items, Top revision recommendations, Overall "
        "verdict. Use zero em-dashes.\n\n"
        "## Previous-pass findings\n\n"
        f"{findings_block}\n\n"
        "## Original user content\n\n"
        f"{user_content}"
    )
    return PROVIDER_CALL[provider](
        api_key, model, system_prompt, user_prompt, max_tokens=8000
    )


# ---------- Strategy selection ----------


def analyze(
    provider: str,
    model: str,
    api_key: str,
    user_content: str,
    mode: str,
) -> str:
    """Pick single-pass or multi-pass based on the model's context limit."""
    skill_files = load_all_skill_files()
    all_skill_chars = sum(len(t) for t in skill_files.values())
    all_skill_tokens = all_skill_chars // 4
    user_tokens = estimate_tokens(user_content)
    overhead = 5000
    response_reserve = 8000
    safety_margin = max(get_context_limit(provider, model) * 0.1, 8000)
    context_limit = get_context_limit(provider, model)

    if all_skill_tokens + user_tokens + overhead + response_reserve + safety_margin <= context_limit:
        eprint(
            f"Strategy: single-pass ({all_skill_tokens:,} skill + {user_tokens:,} content tokens "
            f"fits in {context_limit:,}-token context)"
        )
        return run_single_pass(provider, model, api_key, skill_files, user_content, mode)
    else:
        eprint(
            f"Strategy: multi-pass (full methodology of {all_skill_tokens:,} tokens exceeds "
            f"{context_limit:,}-token context; splitting into analytical passes plus synthesis)"
        )
        return run_multi_pass(provider, model, api_key, skill_files, user_content, mode)


# ---------- I/O ----------


def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)


def read_input(source: Optional[str]) -> str:
    """Read content from a file path, URL, or stdin (if source is None or '-')."""
    if source is None or source == "-":
        return sys.stdin.read()
    if source.startswith(("http://", "https://")):
        eprint(f"Fetching content from {source}...")
        return fetch_text(source)
    return Path(source).read_text(encoding="utf-8")


def resolve_api_key(provider: str, override: Optional[str]) -> str:
    if override:
        return override
    env_var = PROVIDERS[provider]["env_var"]
    key = os.environ.get(env_var, "").strip()
    if not key:
        raise SystemExit(
            f"No API key. Set {env_var} environment variable, or pass --api-key."
        )
    return key


# ---------- CLI ----------


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="slopcheck CLI: command-line slop detection for journalists, editors, writers, and readers.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  slopcheck article.md\n"
            "  cat article.md | slopcheck\n"
            "  slopcheck https://example.com/article\n"
            "  slopcheck --provider anthropic --model claude-opus-4-7 article.md\n"
            "  slopcheck --mode full-response chat-transcript.md\n\n"
            "Set API keys via env vars: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY.\n"
            "Or pass --api-key on the command line.\n"
        ),
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="File path, URL, or '-' for stdin (default: stdin)",
    )
    parser.add_argument(
        "--provider",
        choices=list(PROVIDERS.keys()),
        default="anthropic",
        help="LLM provider (default: anthropic)",
    )
    parser.add_argument(
        "--model",
        help="Model ID (default: provider's default model)",
    )
    parser.add_argument(
        "--api-key",
        help="API key (default: read from env var)",
    )
    parser.add_argument(
        "--mode",
        choices=["artifact", "full-response"],
        default="artifact",
        help="Detector mode (default: artifact)",
    )
    parser.add_argument(
        "--output", "-o",
        help="Output file path (default: stdout)",
    )
    parser.add_argument(
        "--list-models",
        action="store_true",
        help="Print the model catalog and exit",
    )
    return parser.parse_args(argv)


def print_model_catalog():
    for provider_id, p in PROVIDERS.items():
        print(f"\n{p['name']} (--provider {provider_id}, env: {p['env_var']}):")
        for m in p["models"]:
            default_marker = " (default)" if m["id"] == p["default_model"] else ""
            ctx = m["context_limit"]
            ctx_str = f"{ctx // 1000}K" if ctx < 1000000 else f"{ctx // 1000000}M"
            print(f"  {m['id']}: {m['label']} [{ctx_str} context]{default_marker}")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    if args.list_models:
        print_model_catalog()
        return 0

    model = args.model or PROVIDERS[args.provider]["default_model"]
    if not any(m["id"] == model for m in PROVIDERS[args.provider]["models"]):
        eprint(f"Unknown model '{model}' for provider '{args.provider}'.")
        eprint("Run 'slopcheck --list-models' to see available models.")
        return 2

    api_key = resolve_api_key(args.provider, args.api_key)

    eprint(f"Reading input...")
    user_content = read_input(args.input).strip()
    if not user_content:
        eprint("No content provided.")
        return 2

    eprint(
        f"Analyzing: provider={args.provider} model={model} mode={args.mode} "
        f"content={len(user_content):,} chars (~{estimate_tokens(user_content):,} tokens)"
    )

    try:
        result = analyze(args.provider, model, api_key, user_content, args.mode)
    except Exception as e:
        eprint(f"Error: {e}")
        return 1

    if args.output:
        Path(args.output).write_text(result, encoding="utf-8")
        eprint(f"Analysis written to {args.output}")
    else:
        print(result)

    return 0


if __name__ == "__main__":
    sys.exit(main())
