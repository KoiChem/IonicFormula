// A compound remains a complex item even if its own metadata was lost in an older export.
export function isComplexItem(item, ionById = new Map()) {
  if (!item || typeof item !== "object") return false;
  if (item.chemistryClass === "complex") return true;
  if (typeof item.formula === "string" && item.formula.includes("[")) return true;
  return [item.cation, item.anion].some((id) => id && ionById.get(id)?.chemistryClass === "complex");
}

export function complexItemAllowed(item, enabled, ionById = new Map()) {
  return !isComplexItem(item, ionById) || enabled === true;
}

// Returns diagnostic strings so import can reject prohibited or inconsistent complex ions.
export function validateComplexIon(ion) {
  const errors = [];
  if (ion?.chemistryClass !== "complex" && !(typeof ion?.formula === "string" && ion.formula.includes("[")) && !ion?.complex) return errors;
  const detail = ion.complex;
  if (!detail || !Array.isArray(detail.ligands) || detail.ligands.length === 0) return ["錯イオンの中心元素と配位子データが必要です。"];
  if (typeof ion.formula !== "string" || !/^\[[A-Z][A-Za-z0-9()]+\]$/.test(ion.formula)) errors.push("錯イオンのformulaは角括弧で囲んだ電荷を含まない本体式にしてください。");
  if (/(?:H2O|S2O3)/i.test(ion.formula ?? "") || detail.ligands.some((ligand) => /^(?:H2O|S2O3)$/i.test(ligand?.formula ?? ""))) errors.push("アクア・チオスルファト錯体は収録できません。");
  const allowed = new Map([["NH3", 0], ["OH", -1], ["CN", -1], ["Cl", -1]]);
  let ligandCharge = 0;
  let coordination = 0;
  for (const ligand of detail.ligands) {
    if (!ligand || typeof ligand !== "object") {
      errors.push("配位子データが不正です。");
      continue;
    }
    if (!allowed.has(ligand.formula) || ligand.charge !== allowed.get(ligand.formula)) errors.push(`配位子「${ligand.formula}」またはその電荷が不正です。`);
    if (!Number.isInteger(ligand.count) || ligand.count < 1 || ligand.denticity !== 1) errors.push("配位子数と配位座数が不正です。");
    ligandCharge += ligand.charge * ligand.count;
    coordination += ligand.count * ligand.denticity;
  }
  if (!Number.isInteger(detail.oxidationState) || detail.oxidationState + ligandCharge !== ion.charge) errors.push("酸化数・配位子電荷と錯イオン電荷が整合しません。");
  if (detail.coordinationNumber !== coordination) errors.push("配位数が配位子データと整合しません。");
  if (!detail.centralElement || !ion.formula?.startsWith(`[${detail.centralElement}`)) errors.push("中心元素が式と一致しません。");
  const expectedFormula = `[${detail.centralElement}${detail.ligands.map((ligand) => ligand ? `${ligand.formula === "Cl" ? "Cl" : `(${ligand.formula})`}${ligand.count}` : "").join("")}]`;
  if (ion.formula !== expectedFormula) errors.push(`配位子の種類と数が式「${ion.formula}」と整合しません。`);
  return errors;
}
