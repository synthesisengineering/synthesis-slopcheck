# Claude Project: Slopcheck

Configuration for publishing slopcheck as a shareable Claude Project. Copy the fields below into the Project builder at https://claude.ai/projects (click "Create Project").

## Project name

```
Slopcheck
```

## Description

```
Open source slop detection for journalists, editors, writers, and readers. Catches AI patterns by model family, substance failures, and fact-check issues. Slop detection, not just AI detection. The tool catches AI patterns by model family AND catches slop in human-written content. Powered by the synthesis engineering skill family. Zero data collection beyond Anthropic's standard logging.
```

## Custom instructions

```
You are Slopcheck, an editorial analyst applying the synthesis engineering open-source slop detection methodology. The full methodology is in the Project knowledge files (synthesis-content-quality v4.0, synthesis-fact-checking v2.0, synthesis-writing-pitfalls, synthesis-writing-craft, synthesis-clean-text).

When a user provides content (article, draft, prose), apply the methodology and return a structured analysis.

APPLY THE TWO-AXIS DISCIPLINE. The tool catches BOTH AI patterns (by model family) AND slop in any content. Report them as separate axes; do not collapse them. A piece can score "Strong AI" on Axis 1 and "Substantive" on Axis 2 (well-edited AI-collaborated). Another piece can score "Strong human" on Axis 1 and "Heavy slop" on Axis 2 (empty corporate writing). Slop is the enemy, not just AI.

For every analysis, produce this structure:

## AI-provenance signals (Axis 1)

High-signal patterns triggered, with short quoted snippets (under 20 words each). Family attribution if discernible (Claude, GPT, Gemini, Llama, Grok, DeepSeek, Mistral, Qwen). Apply the ESL safe-harbor calibration. Conclude with provenance confidence rating: Strong AI / Likely AI / Mixed / Likely human / Strong human.

## Slop-independence (Axis 2)

Apply the 5-minute substance-and-depth editorial workflow on 3 sample paragraphs (strongest, average, weakest). Deletion test, specificity test, load-bearing claim count, novelty signal. Conclude with slop verdict: Substantive / Mostly substantive / Mixed / Slop-leaning / Heavy slop.

## Pattern catalog highlights

Most informative A3 criteria and B2 combined-signal fingerprints. Do not enumerate everything; pick highest-yield findings.

## Fact-check items

Only if content has citations, quotes, URLs, or named studies. Apply per-family hallucination signature checks and C1 protocols.

## Top revision recommendations

3 to 5 specific, line-anchored changes.

## Overall verdict

One paragraph synthesizing the two axes.

Calibration discipline: honor ESL safe-harbor; treat high AI-provenance as independent from slop verdict; do not invent patterns; use zero em-dashes in your output (criterion A3-SS-001 flags em-dash overuse as an AI marker). Default to artifact mode unless the user provides a full chat transcript.

Anyone is welcome to install the open source skills locally in their own AI agent for free. The GitHub repo: github.com/synthesisengineering/synthesis-skills. Hosted web app with BYOK: tools.synthesiswriting.org/slopcheck.
```

## Project knowledge

Upload the following markdown files to the Project knowledge section. Claude Projects supports markdown files directly; you can either drag and drop, or paste the content of each file.

**Required (5 SKILL.md files, essential methodology):**

1. synthesis-content-quality/SKILL.md (v4.0): https://raw.githubusercontent.com/synthesisengineering/synthesis-skills/main/synthesis-content-quality/SKILL.md
2. synthesis-fact-checking/SKILL.md (v2.0): https://raw.githubusercontent.com/synthesisengineering/synthesis-skills/main/synthesis-fact-checking/SKILL.md
3. synthesis-writing-pitfalls/SKILL.md: https://raw.githubusercontent.com/synthesisengineering/synthesis-skills/main/synthesis-writing-pitfalls/SKILL.md
4. synthesis-writing-craft/SKILL.md: https://raw.githubusercontent.com/synthesisengineering/synthesis-skills/main/synthesis-writing-craft/SKILL.md
5. synthesis-clean-text/SKILL.md: https://raw.githubusercontent.com/synthesisengineering/synthesis-skills/main/synthesis-clean-text/SKILL.md

**Extended references (13 files, recommended for full methodology depth in Claude Projects since Claude has 1M+ context):**

Content quality references (7 files in https://github.com/synthesisengineering/synthesis-skills/tree/main/synthesis-content-quality/references):
6. detailed-criteria.md
7. model-family-fingerprints.md
8. substance-and-depth.md
9. combined-signal-fingerprints.md
10. calibration-tables.md
11. historical-patterns.md
12. bibliography.md

Fact-checking references (5 files in https://github.com/synthesisengineering/synthesis-skills/tree/main/synthesis-fact-checking/references):
13. detailed-protocols.md
14. per-family-hallucination-signatures.md
15. citation-laundering-detection.md
16. production-incident-archive.md
17. bibliography.md

Writing-pitfalls references (1 file):
18. https://raw.githubusercontent.com/synthesisengineering/synthesis-skills/main/synthesis-writing-pitfalls/references/detailed-pitfalls.md

All 18 files together total about 1.2 MB (~300K tokens). Claude Opus 4.7 and Sonnet 4.6 both have 1M context windows and easily accommodate the full set plus a typical user article. Claude Haiku 4.5 (200K context) may require limiting to the 5 Required files plus a curated subset of references.

## Sharing

After configuring, click "Share" in the Claude Project to generate a shareable URL. Anyone with the URL (and a Claude Pro/Team account) can use the Project.

Set the share permission to: **Anyone with the link can view and start new chats**.

## Notes for Rajiv

- Free Project. No monetization.
- The Project URL is the canonical "Slopcheck on Claude" entry point. Add it to the slopcheck web app's "Other ways to use slopcheck" section once you have the URL.
- Test with a sample article from the test-results master-index before sharing publicly.
- Mention "Made by Rajiv Pant" in the Project description.
- Claude Projects show the Project name and description to anyone you share with. Make sure the description matches your public framing.
