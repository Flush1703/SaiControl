import test from "node:test";
import assert from "node:assert/strict";
import { archive } from "../src/ledgerArchive.ts";

const filters = { search: "", project: "", payment: "", reporting: "", reviewOnly: false, order: "latest" };
const invoice = {
  id: "invoice", supplier: "Fornitore 2", invoice_number: "F12", invoice_date: "2026-11-05",
  total: 100, identity_hash: "hash", reviewed: false, payment_status: "SALDATO", files: [],
  shares: [
    { project_id: "palermo", reporting: "IN_VERIFICA", amount: 40 },
    { project_id: "palermo", reporting: "RENDICONTATO", amount: 20 },
    { project_id: "catania", reporting: "RENDICONTATO", amount: 40 },
  ],
};
const attachment = { ...invoice, id: "attachment", supplier: null, invoice_date: null,
  total: null, identity_hash: null, shares: [], files: [{ filename: "Ricevuta.pdf" }] };

test("a shared invoice appears once and only its selected project's shares count", () => {
  const result = archive([invoice], { ...filters, project: "palermo" });
  assert.equal(result.rows.length, 1);
  assert.equal(result.cents, 6000);
  assert.equal(archive([invoice], filters).cents, 10000);
});

test("project and reporting status apply to the same share", () => {
  assert.equal(archive([invoice], { ...filters, project: "catania", reporting: "IN_VERIFICA" }).rows.length, 0);
  assert.equal(archive([invoice], { ...filters, project: "palermo", reporting: "RENDICONTATO" }).cents, 2000);
});

test("unassigned review queue finds attachment names", () => {
  const result = archive([invoice, attachment], { ...filters, project: "unassigned", reviewOnly: true, search: " PDF " });
  assert.deepEqual(result.rows.map((row) => row.document.id), ["attachment"]);
});

test("date sorting keeps unknown dates last and does not change the source", () => {
  const older = { ...invoice, id: "older", invoice_date: "2026-10-01" };
  const documents = [attachment, invoice, older];
  assert.deepEqual(archive(documents, filters).rows.map((row) => row.document.id), ["invoice", "older", "attachment"]);
  assert.deepEqual(archive(documents, { ...filters, order: "oldest" }).rows.map((row) => row.document.id), ["older", "invoice", "attachment"]);
  assert.equal(documents[0], attachment);
});

test("amount ordering uses filtered shares and payment filtering excludes other states", () => {
  const other = { ...invoice, id: "other", total: 90, payment_status: "NON_SALDATO",
    shares: [{ project_id: "palermo", reporting: "IN_VERIFICA", amount: 90 }] };
  assert.equal(archive([invoice, other], { ...filters, project: "palermo", order: "amount" }).rows[0].document.id, "other");
  assert.equal(archive([invoice, other], { ...filters, payment: "SALDATO" }).rows.length, 1);
});

test("date bounds are inclusive and signed XML is distinct from plain XML", () => {
  const signed = { ...invoice, files: [{ filename: "Fattura.XML.P7M" }] };
  assert.equal(archive([signed], { ...filters, from: "2026-11-05", to: "2026-11-05", format: "p7m" }).rows.length, 1);
  assert.equal(archive([signed], { ...filters, format: "xml" }).rows.length, 0);
  assert.equal(archive([signed, attachment], { ...filters, from: "2026-11-06" }).rows.length, 0);
});

test("finds legacy invoices by the detected project without inflating allocated totals", () => {
  const project = { id: "scigliano", name: "Sai Scigliano" };
  const legacy = { ...invoice, project_reference: "SAI SCIGLIANO", shares: [] };
  const result = archive([legacy], { ...filters, project: project.id }, [project]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.cents, 0);
  assert.equal(archive([legacy], { ...filters, project: project.id, reporting: "RENDICONTATO" }, [project]).rows.length, 0);
  assert.equal(archive([{ ...legacy, manual_project_id: "other" }], { ...filters, project: project.id }, [project]).rows.length, 0);
});
