export const ADMIN_PASSWORD_KEY = "ionicFormula.adminPassword.v1";
const ITERATIONS = 150000;
export const INITIAL_PASSWORD_RECORD = Object.freeze({
  algorithm: "PBKDF2-SHA-256",
  iterations: ITERATIONS,
  salt: "DpjZqBo8YqT6wmM2VKm8Zg==",
  hash: "NU27Ab0R3ivUMMpD9GnHiDnt3WLdohkvsowqlv/yWWg=",
});

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function derive(password, salt, iterations, cryptoApi) {
  const key = await cryptoApi.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await cryptoApi.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256));
}

export async function createPasswordRecord(password, cryptoApi = globalThis.crypto, salt = cryptoApi.getRandomValues(new Uint8Array(16))) {
  if (typeof password !== "string" || !password) throw new Error("新しいパスワードを入力してください。");
  if (!(salt instanceof Uint8Array) || salt.length < 16) throw new Error("saltが不正です。");
  return { algorithm: "PBKDF2-SHA-256", iterations: ITERATIONS, salt: toBase64(salt), hash: toBase64(await derive(password, salt, ITERATIONS, cryptoApi)) };
}

export async function verifyPassword(password, record, cryptoApi = globalThis.crypto) {
  if (typeof password !== "string" || record?.algorithm !== "PBKDF2-SHA-256" || !Number.isInteger(record.iterations) || record.iterations < ITERATIONS) return false;
  try {
    const salt = fromBase64(record.salt);
    const expected = fromBase64(record.hash);
    if (salt.length < 16 || expected.length !== 32) return false;
    const actual = await derive(password, salt, record.iterations, cryptoApi);
    let difference = 0;
    for (let i = 0; i < expected.length; i += 1) difference |= expected[i] ^ actual[i];
    return difference === 0;
  } catch {
    return false;
  }
}

export function currentPasswordRecord(storage, initialRecord) {
  const saved = storage.getItem(ADMIN_PASSWORD_KEY);
  return saved === null ? initialRecord : JSON.parse(saved);
}

export async function changeAdminPassword(current, next, confirmation, { storage, cryptoApi = globalThis.crypto, initialRecord }) {
  if (next !== confirmation) throw new Error("新しいパスワードが一致しません。");
  if (!await verifyPassword(current, currentPasswordRecord(storage, initialRecord), cryptoApi)) throw new Error("現在のパスワードが違います。");
  const record = await createPasswordRecord(next, cryptoApi);
  storage.setItem(ADMIN_PASSWORD_KEY, JSON.stringify(record));
}
