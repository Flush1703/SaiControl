import test from "node:test";
import assert from "node:assert/strict";
import { planOverview, projectMetadata, projectStatus } from "../src/projectDashboard.ts";

test("shows localized project statuses and omits missing metadata", () => {
  assert.equal(projectStatus("DRAFT"), "Bozza");
  assert.equal(projectStatus("ACTIVE"), "Attivo");
  assert.equal(projectStatus("CLOSED"), "Chiuso");
  assert.equal(projectMetadata({ referenceCode: " P-90 ", funder: "" }), "P-90");
  assert.equal(projectMetadata({}), "");
});

test("distinguishes loading from a zero budget and sums cents", () => {
  assert.equal(planOverview([], true).total, null);
  assert.equal(planOverview([], false).total, 0);
  assert.deepEqual(planOverview([{ allocatedBudget: 0.1 }, { allocatedBudget: 0.2 }], false),
    { count: 2, total: 0.3, emptyMessage: "Nessun conto nel piano." });
});
