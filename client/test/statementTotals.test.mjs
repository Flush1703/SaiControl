import test from "node:test";
import assert from "node:assert/strict";
import { finalStatement } from "../src/statementTotals.ts";

test("ORD subtotals roll up detail only once and preserve zero rows", () => {
  const account = (account_code, reported) => ({ account_code, description: account_code, reported });
  const data = finalStatement([account("A1E", 10.01), account("A1c", 20), account("F", 2), account("001", 7)]);
  assert.equal(data.rows.find((row) => row.code === "A").cents, 3001);
  assert.equal(data.rows.find((row) => row.code === "Ae").cents, 1001);
  assert.equal(data.rows.find((row) => row.code === "D6").cents, 0);
  assert.equal(data.direct, 3001);
  assert.equal(data.indirect.cents, 200);
  assert.equal(data.otherTotal, 700);
  assert.equal(data.total, 3901);
});

test("actual assignments on a parent code remain separately visible", () => {
  const data = finalStatement([{ account_code: "Ae", description: "Équipe", reported: 3 }]);
  assert.equal(data.rows.filter((row) => row.code === "Ae").length, 2);
  assert.equal(data.total, 300);
});
