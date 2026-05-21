// slopcheck: analysis orchestrator.
//
// Picks the optimal strategy based on the model's context window:
// - Single-pass when the full methodology fits (Gemini 2.5 Pro 2M, Claude 1M beta)
// - Multi-pass when context is constrained (Claude 200K, GPT-5 200K)
//
// Multi-pass runs analytical passes sequentially, accumulating structured findings.
// A final synthesis pass combines findings into the user-facing analysis.
//
// Document chunking handles cases where the user's content alone is large enough
// to crowd the context window even with a small skill subset.

// Rough heuristic: ~4 characters per token for English text.
function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

function getContextLimit(model) {
  const provider = Object.values(window.SLOPCHECK_PROVIDERS).find((p) =>
    p.models.some((m) => m.id === model)
  );
  const modelDef = provider && provider.models.find((m) => m.id === model);
  return (modelDef && modelDef.contextLimit) || 100000;
}

function buildSafetyMargin(contextLimit) {
  // Reserve 10% of context for safety plus 8K for the response.
  return Math.max(contextLimit * 0.1, 8000);
}

class AnalysisOrchestrator {
  constructor({ provider, model, apiKey, manifestSkillContent }) {
    this.provider = provider;
    this.model = model;
    this.apiKey = apiKey;
    this.skillContent = manifestSkillContent; // map of skill-file-relative-path to text content
    this.contextLimit = getContextLimit(model);
    this.safetyMargin = buildSafetyMargin(this.contextLimit);
    this.findings = {};
  }

  async analyze({ userContent, mode, onProgress }) {
    onProgress({ stage: "planning", message: "Selecting analysis strategy..." });
    const userTokens = estimateTokens(userContent);

    // Estimate total skill tokens (if we were to include everything).
    const allSkillContentBytes = Object.values(this.skillContent).reduce(
      (n, text) => n + (text || "").length,
      0
    );
    const allSkillTokens = Math.ceil(allSkillContentBytes / 4);
    const promptOverhead = 5000;
    const responseReserve = 8000;
    const totalSinglePassTokens =
      allSkillTokens + userTokens + promptOverhead + responseReserve;

    if (totalSinglePassTokens + this.safetyMargin <= this.contextLimit) {
      onProgress({
        stage: "strategy",
        message: `Single-pass strategy: ${allSkillTokens.toLocaleString()} skill tokens + ${userTokens.toLocaleString()} content tokens fits in ${this.contextLimit.toLocaleString()}-token context.`,
      });
      return await this.runSinglePass({ userContent, mode, onProgress });
    }

    onProgress({
      stage: "strategy",
      message: `Multi-pass strategy: full methodology (${allSkillTokens.toLocaleString()} tokens) exceeds ${this.contextLimit.toLocaleString()}-token context. Splitting into analytical passes plus synthesis.`,
    });
    return await this.runMultiPass({ userContent, mode, onProgress });
  }

  // --------- Single-pass strategy ---------

  async runSinglePass({ userContent, mode, onProgress }) {
    onProgress({ stage: "pass", current: 1, total: 1, message: "Running full-methodology pass..." });

    const allSkills = this.assembleSkillContent(Object.keys(this.skillContent));
    const systemPrompt = this.buildSinglePassSystemPrompt(allSkills);
    const userPrompt = this.buildSinglePassUserPrompt({ userContent, mode });

    const result = await this.callProvider({ systemPrompt, userPrompt, maxTokens: 8000 });
    onProgress({ stage: "complete", message: "Analysis complete." });
    return result;
  }

  buildSinglePassSystemPrompt(skillContent) {
    return [
      "You are an editorial analyst applying the synthesis engineering open-source slop detection methodology. The full methodology is below. Read it carefully before analyzing the user's content.",
      "",
      "Apply the two-axis discipline. Report AI-provenance signals (Axis 1) and slop-independence (Axis 2) separately. The tool catches both AI patterns AND slop; do not collapse them. High AI-provenance does not mean slop (well-edited AI-collaborated content can be excellent). Low AI-provenance does not mean substantive (styled empty human content is slop).",
      "",
      "Honor the methodology's calibration discipline: ESL safe-harbor (do not flag uniform paragraph length + restricted vocabulary + heavy transitions as AI unless a register-specific AI marker is also present); zone-conditional detection (apply patterns per the requested detector mode); per-family base-rate weighting (em-dash density signal is HIGH for Claude, LOW for GPT-5.1+ and Llama).",
      "",
      "Apply the methodology faithfully. Do not invent patterns. Where evidence is thin, say so. Use zero em-dashes in your output (criterion A3-SS-001 of the methodology).",
      "",
      "=== METHODOLOGY (skill files) ===",
      skillContent,
      "=== END METHODOLOGY ===",
    ].join("\n");
  }

  buildSinglePassUserPrompt({ userContent, mode }) {
    const modeLine =
      mode === "artifact"
        ? "Detector mode: artifact mode. The user is providing only the produced artifact, not a chat transcript. Apply BODY-PERSISTENT, HYBRID, and MID-BODY-INSERT patterns. Skip WRAPPER-OPENER and WRAPPER-CLOSER patterns."
        : "Detector mode: full-response mode. The user is providing a full LLM response including the conversational wrapper. Apply all patterns including wrapper-zone patterns.";

    return [
      "Apply the synthesis engineering slop detection methodology to the content below.",
      "",
      modeLine,
      "",
      "Produce a structured analysis in this format:",
      "",
      "## AI-provenance signals (Axis 1)",
      "List the high-signal patterns triggered, with short quoted snippets (under 20 words each). Family attribution if discernible. Apply ESL safe-harbor. Conclude with a provenance confidence rating: Strong AI / Likely AI / Mixed / Likely human / Strong human.",
      "",
      "## Slop-independence (Axis 2)",
      "Apply the 5-minute A2 substance-and-depth editorial workflow on three sample paragraphs. Conclude with a slop verdict: Substantive / Mostly substantive / Mixed / Slop-leaning / Heavy slop.",
      "",
      "## Pattern catalog highlights",
      "Pick the most informative A3 criteria and B2 combined-signal fingerprints. Note causal hypothesis.",
      "",
      "## Fact-check items",
      "Only if the content has citations, quotes, or named studies. Apply per-family hallucination signature checks and C1 protocols.",
      "",
      "## Top revision recommendations",
      "3 to 5 specific, line-anchored changes.",
      "",
      "## Overall verdict",
      "One paragraph synthesizing the two axes.",
      "",
      "Here is the user's content:",
      "",
      userContent,
    ].join("\n");
  }

  // --------- Multi-pass strategy ---------

  async runMultiPass({ userContent, mode, onProgress }) {
    const allPasses = window.SLOPCHECK_PASSES;
    const synthesisPass = window.SLOPCHECK_SYNTHESIS_PASS;

    // Filter passes based on conditional functions (e.g. the C1 fact-check pass only
    // runs when the content has citations or quotes).
    const passesToRun = allPasses.filter((pass) => {
      if (!pass.conditional) return true;
      return pass.conditional({ content: userContent, mode });
    });

    const totalSteps = passesToRun.length + 1; // analytical passes + synthesis

    for (let i = 0; i < passesToRun.length; i++) {
      const pass = passesToRun[i];
      onProgress({
        stage: "pass",
        current: i + 1,
        total: totalSteps,
        message: `Pass ${i + 1} of ${totalSteps}: ${pass.name}`,
      });
      const passResult = await this.runPass(pass, { userContent, mode });
      this.findings[pass.id] = passResult;
      onProgress({
        stage: "pass-complete",
        current: i + 1,
        total: totalSteps,
        message: `Pass ${i + 1} of ${totalSteps} complete (${pass.name}).`,
        partial: { passId: pass.id, passName: pass.name, text: passResult },
      });
    }

    // Synthesis pass.
    onProgress({
      stage: "pass",
      current: totalSteps,
      total: totalSteps,
      message: `Pass ${totalSteps} of ${totalSteps}: ${synthesisPass.name}`,
    });
    const finalResult = await this.runPass(synthesisPass, { userContent, mode });
    onProgress({ stage: "complete", message: "Analysis complete." });
    return finalResult;
  }

  async runPass(pass, { userContent, mode }) {
    const skillContent = this.assembleSkillContent(pass.skillFiles);
    const isSynthesis = pass.id === "synthesis";
    const systemPrompt = isSynthesis
      ? this.buildSynthesisSystemPrompt(skillContent)
      : this.buildPassSystemPrompt(pass, skillContent);
    const userPrompt = this.buildPassUserPrompt(pass, { userContent, mode });
    const maxTokens = isSynthesis ? 8000 : 4000;

    return await this.callProvider({ systemPrompt, userPrompt, maxTokens });
  }

  buildPassSystemPrompt(pass, skillContent) {
    return [
      "You are an editorial analyst applying one analytical pass of the synthesis engineering slop detection methodology. The relevant skill files for this pass are below. Read them and apply them to the user's content.",
      "",
      "Detect SLOP, not AI provenance alone. The full methodology has multiple analytical dimensions; you are doing one of them. Other passes handle the other dimensions; the synthesis pass at the end combines findings. Stay focused on the assignment for this specific pass.",
      "",
      "Do not invent patterns. Use zero em-dashes in your output (criterion A3-SS-001 of the methodology).",
      "",
      "=== SKILL FILES FOR THIS PASS ===",
      skillContent,
      "=== END SKILL FILES ===",
    ].join("\n");
  }

  buildSynthesisSystemPrompt(skillContent) {
    return [
      "You are the synthesis pass of a multi-pass slop detection analysis. Previous analytical passes produced structured findings on AI-provenance signals, substance and depth, the pattern catalog, and (where applicable) fact-checking. Your job: combine those findings into the final user-facing analysis.",
      "",
      "The skill SKILL.md files are loaded below as the framing methodology. The detailed catalog content was already applied in earlier passes; here you have only the SKILL.md files (the methodology framing). Use them to structure the output and apply the two-axis discipline.",
      "",
      "Apply the methodology's calibration discipline: ESL safe-harbor; two-axis separation (AI-provenance and slop-independence are independent verdicts); honor the per-family base-rate weighting; do not invent patterns; use zero em-dashes.",
      "",
      "=== METHODOLOGY (SKILL.md framing) ===",
      skillContent,
      "=== END METHODOLOGY ===",
    ].join("\n");
  }

  buildPassUserPrompt(pass, { userContent, mode }) {
    const instruction = pass.buildInstruction({
      mode,
      priorFindings: this.findings,
    });
    return [
      instruction,
      "",
      "---",
      "",
      "Here is the user's content:",
      "",
      userContent,
    ].join("\n");
  }

  // --------- Helpers ---------

  assembleSkillContent(filePaths) {
    return filePaths
      .map((path) => {
        const text = this.skillContent[path];
        if (!text) return null;
        return `\n\n# ===== SKILL FILE: ${path} =====\n\n${text}`;
      })
      .filter(Boolean)
      .join("\n");
  }

  async callProvider({ systemPrompt, userPrompt, maxTokens }) {
    return await this.provider.analyze({
      apiKey: this.apiKey,
      model: this.model,
      systemPrompt,
      userPrompt,
      maxTokens: maxTokens || 8000,
    });
  }
}

window.SLOPCHECK_ORCHESTRATOR_CLASS = AnalysisOrchestrator;
