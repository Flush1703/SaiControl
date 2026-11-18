import test from "node:test";
import assert from "node:assert/strict";
import { budgetAfterShare, invoiceBalance, shareAmounts } from "../src/shareAmounts.ts";

test("sums booked shares and shows the remaining amount and percentage", () => {
  assert.deepEqual(shareAmounts(120, [{ amount: 72, percentage: 60 }], "40"),
    { assigned: 7200, remaining: 4800, remainingPercent: 40, preview: 4800, exceeds: false });
});

test("rounds half a cent up and catches amount overflow even at exactly 100 percent", () => {
  const result = shareAmounts(0.01, [{ amount: 0.01, percentage: 50 }], "50");
  assert.equal(result.preview, 1);
  assert.equal(result.exceeds, true);
});

test("catches percentage overflow even when the amount still fits", () => {
  assert.equal(shareAmounts(0.01, [{ amount: 0, percentage: 40 }], "61").exceeds, true);
});

test("accepts four decimal places and leaves an empty value without a preview", () => {
  assert.equal(shareAmounts(100, [{ amount: 0, percentage: 99.9999 }], "0.0001").exceeds, false);
  assert.equal(shareAmounts(100, [], "").preview, null);
});

test("shows unpaid, partial, and settled invoice balances in exact cents", () => {
  assert.equal(invoiceBalance(120.01, 0), 120.01);
  assert.equal(invoiceBalance(0.3, 0.1), 0.2);
  assert.equal(invoiceBalance(120.01, 120.01), 0);
});

test("projects remaining budget for included, excluded, and over-budget shares", () => {
  assert.equal(budgetAfterShare(53.25, 125, "DA_RENDICONTARE"), 52);
  assert.equal(budgetAfterShare(53.25, 125, "ESCLUSO"), 53.25);
  assert.equal(budgetAfterShare(0.3, 31, "IN_VERIFICA"), -0.01);
});
