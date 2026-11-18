import assert from "node:assert/strict";
import test from "node:test";
import { importError } from "../src/importError.ts";

test("replaces Safari network errors with local recovery instructions", () => {
  assert.match(importError(new TypeError("Load failed")), /run-local\.sh/);
});

test("preserves actionable API errors", () => {
  assert.equal(importError(new Error("File non valido.")), "File non valido.");
});
