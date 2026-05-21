# @synthesisengineering/slopcheck

Open source slop detection CLI. Slop detection, not just AI detection.

## Install

```sh
npm install -g @synthesisengineering/slopcheck
# or
bun add -g @synthesisengineering/slopcheck
```

Requires Python 3.8+ on the system.

## Use

```sh
# List available models
slopcheck --list-models

# Analyze a file with BYOK
ANTHROPIC_API_KEY=sk-ant-... slopcheck --provider anthropic --model claude-haiku-4-5-20251001 --input ./my-draft.md

# Pipe stdin
cat article.md | slopcheck --provider openai --model gpt-5.4-mini

# Output to file
slopcheck --provider google --model gemini-3.1-flash-lite-preview --input draft.md --output analysis.md
```

## What it does

Applies the open source synthesis engineering skill family (v4.0 content-quality + v2.0 fact-checking) to the provided content. Returns a structured analysis covering two axes: AI-provenance signals (by model family) and slop-independence (substance and depth, regardless of authorship).

## Privacy

The CLI stores nothing. Your content is sent only to the LLM provider you choose, using your own API key. No analytics, no telemetry.

## Related

- Web app: https://tools.synthesiswriting.org/slopcheck
- Slopcheck GPT in the OpenAI GPT Store
- Slopcheck Claude Project at https://claude.ai/projects
- Browser extension, Apple Shortcut, Homebrew, AUR, and more: https://github.com/synthesisengineering/synthesis-slopcheck

## Support the open source work

If slopcheck is useful to you, you can support the synthesis open-source mission on [GitHub Sponsors](https://github.com/sponsors/rajivpant). One-time or recurring, any amount, not a gate on anything.

## License

MIT.
