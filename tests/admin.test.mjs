import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createPasswordRecord, verifyPassword, changeAdminPassword, ADMIN_PASSWORD_KEY, INITIAL_PASSWORD_RECORD } from "../js/admin-lock.js";
import { searchMatches } from "../js/admin-search.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("PBKDF2 record verifies exact password without storing plaintext", async () => {
  const record = await createPasswordRecord("CaseSensitive9", webcrypto, new Uint8Array(16).fill(7));
  assert.equal(record.algorithm, "PBKDF2-SHA-256");
  assert.equal(JSON.stringify(record).includes("CaseSensitive9"), false);
  assert.equal(await verifyPassword("CaseSensitive9", record, webcrypto), true);
  assert.equal(await verifyPassword("casesensitive9", record, webcrypto), false);
  assert.equal(await verifyPassword("CaseSensitive9 ", record, webcrypto), false);
});

test("configured initial verifier accepts the specified initial value", async () => {
  const initial = String.fromCharCode(53, 49, 107, 101, 110, 111, 107, 97, 103, 97, 57);
  assert.equal(await verifyPassword(initial, INITIAL_PASSWORD_RECORD, webcrypto), true);
  assert.equal(await verifyPassword(`${initial} `, INITIAL_PASSWORD_RECORD, webcrypto), false);
});

test("password change requires current value, matching confirmation, and persists only verifier", async () => {
  const storage = memoryStorage();
  const initial = await createPasswordRecord("before", webcrypto, new Uint8Array(16).fill(3));
  await assert.rejects(changeAdminPassword("wrong", "after", "after", { storage, cryptoApi: webcrypto, initialRecord: initial }));
  await assert.rejects(changeAdminPassword("before", "after", "mismatch", { storage, cryptoApi: webcrypto, initialRecord: initial }));
  assert.equal(storage.getItem(ADMIN_PASSWORD_KEY), null);
  await changeAdminPassword("before", "after", "after", { storage, cryptoApi: webcrypto, initialRecord: initial });
  const saved = storage.getItem(ADMIN_PASSWORD_KEY);
  assert.equal(saved.includes("after"), false);
  assert.equal(await verifyPassword("after", JSON.parse(saved), webcrypto), true);
  assert.equal(await verifyPassword("before", JSON.parse(saved), webcrypto), false);
});

test("failed password storage leaves previous verifier intact", async () => {
  const initial = await createPasswordRecord("before", webcrypto, new Uint8Array(16).fill(3));
  const saved = JSON.stringify(initial);
  const storage = { getItem: () => saved, setItem: () => { throw new Error("quota"); } };
  await assert.rejects(changeAdminPassword("before", "after", "after", { storage, cryptoApi: webcrypto, initialRecord: initial }));
  assert.equal(storage.getItem(ADMIN_PASSWORD_KEY), saved);
});

test("search targets only selected field and normalizes formula typography", () => {
  const ion = { id: "complex_iron", formula: "[Fe(CN)6]", charge: -4, name: "ヘキサシアニド鉄(II)酸イオン", referenceUrl: "https://example.test/unique" };
  assert.equal(searchMatches(ion, "UNIQUE", "id"), false);
  assert.equal(searchMatches(ion, "鉄", "id"), false);
  assert.equal(searchMatches(ion, "Ｆｅ（ＣＮ）₆", "formula"), true);
  assert.equal(searchMatches(ion, "[Fe(CN)₆]⁴⁻", "formula"), true);
  assert.equal(searchMatches(ion, "[fe(cn)6]", "formula"), false);
  assert.equal(searchMatches(ion, "鉄（Ⅱ）", "name"), true);
  assert.equal(searchMatches(ion, "", "name"), true);
});
