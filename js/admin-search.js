import { ionAnswer, normalizeFormula, normalizeName } from "./core.js?v=20261009-prompt-fit-v1";

export function searchMatches(item, query, field) {
  if (!String(query).trim()) return true;
  if (field === "id") return String(item.id ?? "").normalize("NFKC").toLowerCase().includes(String(query).trim().normalize("NFKC").toLowerCase());
  if (field === "name") return normalizeName(item.name ?? "").includes(normalizeName(query));
  if (field === "formula") {
    const needle = normalizeFormula(query);
    const formula = normalizeFormula(item.formula ?? "");
    const displayed = Number.isFinite(item.charge) ? normalizeFormula(ionAnswer(item)) : "";
    return formula.includes(needle) || displayed.includes(needle);
  }
  return false;
}
