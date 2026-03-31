function isClearCommand(text) {
  const normalized = String(text || "").trim().toLowerCase();
  return normalized === "/clear" || normalized === "@clear";
}

module.exports = { isClearCommand };
