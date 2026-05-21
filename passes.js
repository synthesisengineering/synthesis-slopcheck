// slopcheck: pass definitions for the multi-pass analysis orchestrator.
//
// Each pass is a discrete analytical step. The orchestrator runs them in order,
// accumulating structured findings. The synthesis pass at the end combines findings
// into the final user-facing analysis.
//
// Each pass declares which skill files it needs. The orchestrator fetches them
// via the manifest, builds the per-pass prompt, and calls the LLM.

const ANALYSIS_PASSES = [
  {
    id: "A1",
    name: "AI-provenance signals (model-family fingerprinting)",
    skillFiles: [
      "synthesis-content-quality/SKILL.md",
      "synthesis-content-quality/references/model-family-fingerprints.md",
      "synthesis-content-quality/references/historical-patterns.md",
    ],
    estimatedSkillTokens: 84000,
    buildInstruction({ mode }) {
      const modeLine =
        mode === "artifact"
          ? "Apply BODY-PERSISTENT, HYBRID, and MID-BODY-INSERT patterns. Skip WRAPPER-OPENER and WRAPPER-CLOSER patterns (the user is providing only the artifact, not a chat transcript)."
          : "Apply all patterns including WRAPPER-OPENER and WRAPPER-CLOSER patterns (the user is providing a full LLM response including conversational framing).";
      return [
        "# Pass 1 of N: AI-provenance signals",
        "",
        "Your task in this pass: identify AI-provenance signals in the user's content. Apply the synthesis-content-quality v4.0 methodology (section A1 model-family fingerprinting plus the historical-patterns catalog) loaded in the skill files above.",
        "",
        modeLine,
        "",
        "Produce structured findings in this format:",
        "",
        "## A1 model-family fingerprinting findings",
        "",
        "**Patterns triggered.** For each model-family pattern that triggered in the user's content, list the pattern ID (e.g. A1-CLAUDE-001), the pattern name, and up to 5 short quoted snippets (under 20 words each) from the user's content as evidence. Group by family (Claude / GPT / Gemini / Llama / Grok / DeepSeek / Mistral / Qwen).",
        "",
        "**Historical-era patterns.** If any historical or deprecated era patterns triggered (e.g. 'As an AI language model' preamble, 'Here's the thing' colloquial intensifier, Bard 'As a large language model trained by' preamble), list them with era of prevalence.",
        "",
        "**Family attribution.** Based on the patterns triggered, name the most likely family (Claude / GPT / Gemini / Llama / Grok / DeepSeek / Mistral / Qwen / mixed / unable to attribute / appears human). State confidence: Strong / Likely / Weak.",
        "",
        "**ESL safe-harbor check.** Does the content show the cornerstone signature (uniform paragraph length + restricted vocabulary + heavy transitions) WITHOUT any register-specific AI marker? If yes, mark NEGATIVE marker triggered: the content is more likely non-native English human writing than AI-generated. Do not flag as AI.",
        "",
        "**Provenance confidence.** Strong AI / Likely AI / Mixed / Likely human / Strong human.",
        "",
        "Output findings only. Do not yet produce the final user-facing analysis; that comes in the synthesis pass. Be concrete with quoted evidence. Do not invent patterns. If nothing triggered, say so. Use zero em-dashes in your output (per criterion A3-SS-001 of the methodology you are applying).",
      ].join("\n");
    },
  },

  {
    id: "A2",
    name: "Substance and depth (slop independence)",
    skillFiles: [
      "synthesis-content-quality/SKILL.md",
      "synthesis-content-quality/references/substance-and-depth.md",
      "synthesis-writing-pitfalls/SKILL.md",
      "synthesis-writing-craft/SKILL.md",
      "synthesis-writing-pitfalls/references/detailed-pitfalls.md",
    ],
    estimatedSkillTokens: 38000,
    buildInstruction() {
      return [
        "# Pass 2 of N: Substance and depth",
        "",
        "Your task in this pass: assess substance and depth in the user's content. Apply section A2 of synthesis-content-quality v4.0 (the 17 sub-patterns and the 5-minute editorial workflow), with secondary input from synthesis-writing-pitfalls and synthesis-writing-craft.",
        "",
        "Slop is the enemy, not just AI. High-quality AI-collaborated content can be excellent here. Empty content fails regardless of provenance. Score this axis independently of pass 1's provenance verdict.",
        "",
        "Produce structured findings:",
        "",
        "## A2 substance and depth findings",
        "",
        "**5-minute editorial workflow.** Pick three sample paragraphs from the user's content (the strongest, an average one, and the weakest). For each paragraph:",
        "- A2-SUB-001 deletion test: how many sentences in the paragraph would, if removed, lose no claim, evidence, or transition?",
        "- A2-SUB-002 specificity test: how many sentences would apply equally to any subject in this genre?",
        "- A2-SUB-003 load-bearing claims: how many sentences carry claims the rest of the piece depends on?",
        "- A2-SUB-006 any-company test: if business content, do paragraphs apply equally to any company?",
        "",
        "**A2 sub-patterns triggered across the full piece.** For each of A2-SUB-004 novelty, A2-SUB-009 generic insight, A2-SUB-008 survey-without-claim, A2-SUB-010 both-sides-without-position, A2-SUB-011 pseudo-profundity, A2-SUB-012 conclusion-shaped paragraphs that do not conclude, A2-SUB-013 frictionless-transition padding: note whether it triggered, with short quoted examples (under 20 words each).",
        "",
        "**Human-source patterns from synthesis-writing-pitfalls.** If any cringe (humble-bragging, defensive disclaimers, third-person self-reference in personal writing), throat-clearing, caveat overload, cliché reliance, or stilted formality patterns triggered, note them.",
        "",
        "**Positive principles from synthesis-writing-craft.** Where the content shines on positive principles (specificity, voice, structural integrity, etc.), note that too.",
        "",
        "**Slop verdict.** Substantive / Mostly substantive / Mixed / Slop-leaning / Heavy slop.",
        "",
        "Output findings only. Be concrete with quoted evidence. Use zero em-dashes.",
      ].join("\n");
    },
  },

  {
    id: "A3-B2",
    name: "Pattern catalog and combined-signal fingerprints",
    skillFiles: [
      "synthesis-content-quality/SKILL.md",
      "synthesis-content-quality/references/detailed-criteria.md",
      "synthesis-content-quality/references/combined-signal-fingerprints.md",
      "synthesis-content-quality/references/calibration-tables.md",
    ],
    estimatedSkillTokens: 96000,
    buildInstruction() {
      return [
        "# Pass 3 of N: Pattern catalog (A3) and combined-signal fingerprints (B2)",
        "",
        "Your task in this pass: scan the user's content against the 76 A3 criteria and the 86 B2 combined-signal fingerprints. Apply the calibration framework from B3.",
        "",
        "Produce structured findings:",
        "",
        "## A3 criteria findings",
        "",
        "**Triggered criteria.** List each A3 criterion (using the new ID scheme like A3-LT-001, A3-SS-001, A3-BT-001, A3-CS-001, etc.) that triggered, with up to 5 short quoted examples from the user's content. Group by thematic section (Language and Tone, Style and Structural, Technical and Formatting, Citation and Sourcing, Context-Specific, Hyperbolic and Dramatic, Confidentiality and Exposure, Behavioral and Tonal, Frame and Audience, Social-register).",
        "",
        "## B2 combined-signal fingerprint findings",
        "",
        "**Triggered combos.** For each of the 86 B2 combos, check whether the constituent criteria are all present in the user's content. List each combo that fired (e.g. B2-COMBO-001 ChatGPT 4o tell, B2-COMBO-003 Claude.ai default, B2-COMBO-007 fake-expertise stack), with the contributing criteria and short quoted evidence.",
        "",
        "Highlight the highest-yield combos. B2-COMBO-003 (Claude.ai default: em-dashes + bulleted bolded lead-ins + uniform paragraph length) is the single most diagnostic fingerprint in our archive. If it fires at full strength, the content was very likely generated or polished by Claude.",
        "",
        "## B3 calibration",
        "",
        "**Per-family base-rate consideration.** Given the family attribution from pass 1 and the patterns triggered in this pass, note any calibration adjustments. For example, if em-dash density fires but the family attribution is GPT-5.1+ or Llama, weight the em-dash signal lower (post-2025 GPT-5.1 trained out em-dashes; Llama never had high baseline). Use the calibration tables loaded in the skill files for the per-family weighting.",
        "",
        "Output findings only. Be concrete with quoted evidence. Use zero em-dashes.",
      ].join("\n");
    },
  },

  {
    id: "C1",
    name: "Fact-checking (per-family hallucination signatures and C1 protocols)",
    conditional({ content }) {
      // Only run this pass if the content appears to contain citations, quotes, or named studies.
      const indicators = [
        /\([A-Z][a-z]+(?:\s+(?:et\s+al\.|and\s+[A-Z][a-z]+))?,\s*\d{4}\)/, // (Smith et al., 2023)
        /https?:\/\//, // URLs
        /doi:?\s*10\./i, // DOI
        /arxiv[:.\s]\s*\d{4}\.\d+/i, // arxiv refs
        /"[^"]{20,}"/, // long quoted strings
        /according to/i,
        /studies show/i,
        /research(?:\s+by|\s+from|\s+indicates)/i,
        /(?:Journal|Proceedings|Conference)\s+of/i,
      ];
      return indicators.some((re) => re.test(content));
    },
    skillFiles: [
      "synthesis-fact-checking/SKILL.md",
      "synthesis-fact-checking/references/detailed-protocols.md",
      "synthesis-fact-checking/references/per-family-hallucination-signatures.md",
      "synthesis-fact-checking/references/citation-laundering-detection.md",
    ],
    estimatedSkillTokens: 79000,
    buildInstruction({ priorFindings }) {
      const familyHint = priorFindings.A1
        ? "Pass 1 attributed the content to a specific LLM family; if the attribution was strong, weight your fact-check toward that family's hallucination signature (Claude DOI fabrication, GPT URL fabrication, Gemini vague attribution, DeepSeek language-mixing, Llama long-context fabrication, Grok tweet fabrication)."
        : "Apply all per-family hallucination signature checks since family attribution from pass 1 was inconclusive.";
      return [
        "# Pass 4 of N: Fact-checking",
        "",
        "Your task in this pass: apply the synthesis-fact-checking v2.0 methodology to the user's content. The content contains citations, quotes, URLs, named studies, or other verifiable claims (otherwise this pass would not run).",
        "",
        familyHint,
        "",
        "Produce structured findings:",
        "",
        "## C1 fact-check findings",
        "",
        "**Per-family hallucination signature check.** Apply the family-specific checks. For Claude content: verify every DOI looks plausible (correct format) AND check whether it resolves. For GPT content: verify every URL looks plausible AND check whether it resolves. For Gemini content: flag every vague attribution (\"studies show,\" \"research indicates\") without specific source.",
        "",
        "**C1 protocols.** Apply the nine new protocol sections from v2.0:",
        "- C1-NESTED-001 second-party and third-party quote handling",
        "- C1-PARAPH-001 paraphrase boundary drift",
        "- C1-COMPOSITE-001 composite quotes (non-contiguous source fragments stitched into single quoted utterance)",
        "- C1-POSSHIFT-001 position-shifting (framing drift from source's stated position)",
        "- C1-TRANS-001 source-translation drift",
        "- C1-URLROT-001 URL rot vs hallucination distinction (six-category taxonomy)",
        "- C1-SYNTH-001 AI-generated synthetic sources",
        "- C1-LAUNDER-001 citation laundering chains (verify graph independence, not raw source count)",
        "- C1-TOOLHALL-001 tool-specific hallucination patterns",
        "",
        "**Common error patterns (4a through 4g refresh).** Wrong framing of correct numbers, conflated findings, wrong specifics from correct general findings, incorrect organization names, misattributed quotes, hallucinated citations, outdated data.",
        "",
        "**Verifiability notes.** For each citation, quote, or named study in the content, note whether it appears verifiable based on the format and your training knowledge. Flag any that look suspicious. Do not invent verification you cannot do; if the content cites a real-looking paper you cannot confirm exists, say so explicitly.",
        "",
        "Output findings only. Be concrete with quoted evidence. Use zero em-dashes.",
      ].join("\n");
    },
  },
];

const SYNTHESIS_PASS = {
  id: "synthesis",
  name: "Synthesis (final user-facing analysis)",
  skillFiles: [
    "synthesis-content-quality/SKILL.md",
    "synthesis-fact-checking/SKILL.md",
    "synthesis-writing-pitfalls/SKILL.md",
    "synthesis-writing-craft/SKILL.md",
    "synthesis-clean-text/SKILL.md",
  ],
  estimatedSkillTokens: 25000,
  buildInstruction({ mode, priorFindings }) {
    const findingsText = Object.entries(priorFindings)
      .map(([passId, text]) => `\n## Findings from pass ${passId}\n\n${text}\n`)
      .join("\n");
    return [
      "# Final pass: Synthesis",
      "",
      "Your task in this pass: synthesize the findings from the previous analytical passes into the final user-facing analysis. The skill files loaded above contain the methodology (the SKILL.md files for content-quality, fact-checking, writing-pitfalls, writing-craft, and clean-text); use them to frame and structure the synthesis. The findings from earlier passes are below.",
      "",
      "Produce the final structured analysis in this format:",
      "",
      "## AI-provenance signals (Axis 1)",
      "Summarize the model-family fingerprinting findings from pass 1. List the highest-signal patterns triggered with the strongest quoted examples. Include family attribution and confidence. Note ESL safe-harbor if it triggered. Conclude with the provenance confidence rating.",
      "",
      "## Slop-independence (Axis 2)",
      "Summarize the substance-and-depth findings from pass 2 plus the relevant A3 criteria from pass 3. Apply the two-axis separation discipline: high AI-provenance does NOT automatically mean slop. Conclude with the slop verdict.",
      "",
      "## Pattern catalog highlights",
      "Pick the most informative subset of A3 criteria and B2 combined-signal fingerprints from pass 3. Do not enumerate everything; pick the highest-yield findings. Note any cross-cutting causal hypothesis (RHF, training-data skew, alignment tuning, etc.).",
      "",
      "## Fact-check items",
      "If pass 4 ran, summarize its findings. If pass 4 did not run (content lacked citations or quotes), say so briefly and move on.",
      "",
      "## Top revision recommendations",
      "3 to 5 specific, line-anchored changes the user can make. Prioritize the changes that would most improve the content. Where possible, quote the original passage and propose the revision.",
      "",
      "## Overall verdict",
      "One paragraph synthesizing the two axes. Be direct.",
      "",
      "Calibration discipline reminders: honor ESL safe-harbor; treat high AI-provenance as independent from slop verdict; do not invent patterns; use zero em-dashes in your output.",
      "",
      "---",
      "",
      "## Previous-pass findings",
      findingsText,
    ].join("\n");
  },
};

window.SLOPCHECK_PASSES = ANALYSIS_PASSES;
window.SLOPCHECK_SYNTHESIS_PASS = SYNTHESIS_PASS;
