# slopcheck CLI

Command-line slop detection for journalists, editors, writers, and engineers. Applies the synthesis-engineering open-source slop detection methodology (synthesis-content-quality v4.0 + synthesis-fact-checking v2.0) to text content and prints a structured analysis.

## Review and manual setup

Requires Python 3.9 or newer. The CLI is a single Python file using the standard library. Analysis fetches the current methodology from GitHub and sends content to your chosen model provider with your API key. It needs an internet connection; provider charges apply.

Review [the source repository](https://github.com/synthesisengineering/synthesis-slopcheck), including `cli/slopcheck.py` and the package scripts. Record the exact commit you reviewed. A coding agent can inspect dependencies, network destinations, file writes and overwrite behavior, then propose setup for your approval. Source review does not require executing downloaded code.

After approving the reviewed source, use it directly from the repository root:

```sh
python3 cli/slopcheck.py --help
python3 cli/slopcheck.py --list-models
```

The examples below run from that same directory. They do not install a global command or change your agent configuration.

Homebrew, npm/bun and AUR distributions are unavailable. This repository does not provide a pip distribution. The curl installer is not a verified setup route; use the reviewed source directly.

## Quick start

Set your API key as an env var (BYOK):

```sh
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
# or
export GOOGLE_API_KEY=AIza...
```

Analyze a file:

```sh
python3 cli/slopcheck.py article.md
```

Analyze from stdin:

```sh
cat article.md | python3 cli/slopcheck.py
pbpaste | python3 cli/slopcheck.py
```

Analyze a URL (the CLI fetches the content first):

```sh
python3 cli/slopcheck.py https://example.com/article
```

Choose a specific model:

```sh
python3 cli/slopcheck.py --provider anthropic --model claude-opus-4-7 article.md
python3 cli/slopcheck.py --provider openai --model gpt-5.5 article.md
python3 cli/slopcheck.py --provider google --model gemini-3.1-pro-preview article.md
```

Save output to a file:

```sh
python3 cli/slopcheck.py article.md --output analysis.md
```

List available models:

```sh
python3 cli/slopcheck.py --list-models
```

## Detector modes

```sh
# Artifact mode (default): the input is the produced artifact (an article, draft)
python3 cli/slopcheck.py article.md

# Full-response mode: the input includes the LLM's conversational wrapper
python3 cli/slopcheck.py --mode full-response chat-transcript.md
```

## Strategy

The CLI uses the same orchestrator strategy as the web app:

- **Single-pass** when the full methodology fits in the model's context (most modern models with 1M+ context).
- **Multi-pass** when context is constrained (Claude Haiku 4.5 with 200K context; GPT-5.4 Mini 400K can be close depending on content length). Each analytical pass runs against a skill subset; a final synthesis pass produces the user-facing analysis.

The CLI tells you which strategy was selected.

## Output

The analysis follows the methodology's two-axis structure:

- AI-provenance signals (Axis 1): which model-family patterns triggered, family attribution, ESL safe-harbor calibration, provenance confidence rating.
- Slop-independence (Axis 2): substance and depth verdict.
- Pattern catalog highlights.
- Fact-check items (if the content has citations or quotes).
- Top revision recommendations.
- Overall verdict.

Output is markdown. Pipe to any markdown renderer (`glow`, `mdcat`, etc.) or save with `--output`.

## Privacy

BYOK: your API key reads from your environment, runs once for the analysis, and is never written anywhere. The CLI sends your content directly to the provider you choose; no slopcheck server is involved at any point.

The CLI fetches the skill files from `raw.githubusercontent.com/synthesisengineering/synthesis-skills` at the start of each run. The skill files are public open-source content; fetching them reveals nothing about you that is not already implied by running this tool.

## Future work

- pip-installable package.
- Conversation chunking for very-large user content (>40K tokens on smaller-context models).
- Cached skill download (avoid re-fetching across runs).
- `--watch` mode that re-analyzes a file when it changes.
- `--diff` mode that analyzes a draft and shows specific revision suggestions in a patch format.

## License

MIT.
