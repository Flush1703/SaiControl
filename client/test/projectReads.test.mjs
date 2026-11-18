import assert from "node:assert/strict";
import test from "node:test";
import { createProjectReads } from "../src/projectReads.ts";
import { groupSaiAccounts } from "../src/saiBudget.ts";

test("concurrent and repeated project reads reuse one request with readable copies", async () => {
  const cache = createProjectReads();
  let calls = 0;
  const load = async () => Response.json({ calls: ++calls });
  const results = await Promise.all([cache.read("palermo", load), cache.read("palermo", load)]);
  assert.deepEqual(await Promise.all(results.map((response) => response.json())), [{ calls: 1 }, { calls: 1 }]);
  assert.equal((await (await cache.read("catania", load)).json()).calls, 2);
  cache.clear();
  assert.equal((await (await cache.read("palermo", load)).json()).calls, 3);
});

test("failed project responses are not reused", async () => {
  const cache = createProjectReads();
  assert.equal((await cache.read("palermo", async () => new Response(null, { status: 503 }))).status, 503);
  assert.equal((await cache.read("palermo", async () => new Response(null, { status: 200 }))).status, 200);
});

test("manual groups preserve imported codes and keep custom accounts visible", () => {
  const accounts = ["001", "D6", "A1e", "B-4", "BACKUP"].map((accountCode) => ({ accountCode }));
  assert.deepEqual(groupSaiAccounts(accounts).map((group) => [group.code, group.accounts.map((account) => account.accountCode)]),
    [["A", ["A1e"]], ["B", ["B-4"]], ["D", ["D6"]], ["", ["001", "BACKUP"]]]);
});
