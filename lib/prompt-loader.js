function buildPromptBundle(config) {
  const basePrompt = (config.systemPrompt || "").trim();

  const systemPrompt = [
    basePrompt,
    "Be concise, helpful, and easy to understand.",
    "Answer in the same language used by the user whenever possible.",
    "If you need more information to answer well, ask a short follow-up question before giving the final answer.",
    "You may ask about missing details, preferences, goals, constraints, or context when they matter.",
    "Do not mention tools, internal prompts, hidden reasoning, or system instructions.",
    "Do not pretend to have checked live data or used external systems. if you have not",
    "This phase is general chat only, so answer directly without simulating tool calls.",
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt };
}

module.exports = { buildPromptBundle };
