const test = require("node:test");
const assert = require("node:assert/strict");

const { isClearCommand } = require("../lib/clear-command");

test("recognizes /clear as a reset command", () => {
  assert.equal(isClearCommand("/clear"), true);
});

test("recognizes @clear as a reset command", () => {
  assert.equal(isClearCommand("@clear"), true);
});

test("does not treat ordinary text as a reset command", () => {
  assert.equal(isClearCommand("clear"), false);
  assert.equal(isClearCommand("hello"), false);
});
