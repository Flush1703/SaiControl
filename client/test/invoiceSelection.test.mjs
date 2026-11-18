import test from "node:test";
import assert from "node:assert/strict";
import { invoiceSelection } from "../src/invoiceSelection.ts";

test("folder import preserves same filenames in separate paths and ignores unrelated files", () => {
  const file = (path) => Object.assign(new File(["test"], "invoice.XML.P7M"), { webkitRelativePath: path });
  const result = invoiceSelection([file("2026/11/invoice.XML.P7M"), file("2026/12/invoice.XML.P7M"),
    new File(["test"], "note.txt")], true, true);
  assert.equal(result.ignored, 1);
  assert.deepEqual(result.body.getAll("paths"), ["2026/11/invoice.XML.P7M", "2026/12/invoice.XML.P7M"]);
  assert.equal(result.body.getAll("files").length, 2);
  assert.equal(result.body.get("applyRules"), "true");
});

test("individual attachments retain format flexibility", () => {
  const notes = new File(["test"], "note.txt");
  assert.throws(() => invoiceSelection([notes], true, false), /almeno un file/);
  assert.equal(invoiceSelection([notes], false, false).body.getAll("files").length, 1);
});
