const clone = (value) => structuredClone(value);

function arraysFor(bundle, label) {
  if (!bundle || !Array.isArray(bundle.ions) || !Array.isArray(bundle.compounds) || !bundle.difficulty || typeof bundle.difficulty !== "object") {
    throw new TypeError(`${label}はions・compounds・difficultyを含むBundleが必要です。`);
  }
}

function packEntries(pack) {
  if (!pack || !Array.isArray(pack.supportIons) || !Array.isArray(pack.ions) || !Array.isArray(pack.compounds) || !Number.isInteger(pack.migrationVersion)) {
    throw new TypeError("錯イオンパックの形式が不正です。");
  }
  return { ions: [...pack.supportIons, ...pack.ions], compounds: pack.compounds };
}

function appendNew(base, pack) {
  arraysFor(base, "教材データ");
  const entries = packEntries(pack);
  for (const key of ["ions", "compounds"]) {
    const existing = new Set();
    for (const item of base[key]) {
      if (!item || typeof item.id !== "string" || !item.id || existing.has(item.id)) throw new Error(`${key}のIDが不正または重複しています: ${item?.id ?? "(空)"}`);
      existing.add(item.id);
    }
    for (const item of entries[key]) {
      if (!item || typeof item.id !== "string" || !item.id || existing.has(item.id)) throw new Error(`${key}のID衝突: ${item?.id ?? "(空)"}`);
      existing.add(item.id);
    }
  }
  return {
    ...clone(base),
    schemaVersion: pack.schemaVersion,
    contentVersion: pack.contentVersion,
    migrationVersion: pack.migrationVersion,
    ions: [...clone(base.ions), ...clone(entries.ions)],
    compounds: [...clone(base.compounds), ...clone(entries.compounds)],
  };
}

export function composePublishedBundle(base, pack) {
  return appendNew(base, pack);
}

export function migrateBundle(bundle, pack) {
  arraysFor(bundle, "保存データ");
  packEntries(pack);
  if (bundle.migrationVersion != null && (!Number.isInteger(bundle.migrationVersion) || bundle.migrationVersion < 0)) {
    throw new TypeError("migrationVersionが不正です。");
  }
  if (bundle.migrationVersion >= pack.migrationVersion) return clone(bundle);
  return appendNew(bundle, pack);
}
