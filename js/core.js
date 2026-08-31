export const PRACTICE_TYPES = ["ion", "ionFormula", "ionName", "random"];

export const PRACTICE_TYPE_LABELS = {
  ion: "イオン",
  ionFormula: "イオン式 → 化合物",
  ionName: "イオン名 → 化合物",
  random: "ランダム",
};

export const VARIANTS = {
  ion: ["ionNameToFormula", "ionFormulaToName"],
  ionFormula: ["ionsToFormula", "ionsToName"],
  ionName: ["ionNamesToFormula", "ionNamesToName"],
  random: ["ionsToFormula", "ionsToName", "ionNamesToFormula", "ionNamesToName"],
};

export const VARIANT_LABELS = {
  ionNameToFormula: "イオン名 → イオン式",
  ionFormulaToName: "イオン式 → イオン名",
  ionsToFormula: "イオン式 → 組成式",
  ionsToName: "イオン式 → 化合物名",
  ionNamesToFormula: "イオン名 → 組成式",
  ionNamesToName: "イオン名 → 化合物名",
};

const SUBSCRIPT_DIGITS = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

const SUPERSCRIPT_DIGITS = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
};

export const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export function normalizeFormula(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (digit) => SUBSCRIPT_DIGITS[digit])
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (digit) => SUPERSCRIPT_DIGITS[digit])
    .replace(/[＋﹢]/g, "+")
    .replace(/[−ー―‐‑‒–—－﹣]/g, "-")
    .replace(/[（）]/g, (character) => character === "（" ? "(" : ")")
    .replace(/[\s\u3000]/g, "")
    .replace("^", "");
}

export function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[（）]/g, (character) => character === "（" ? "(" : ")")
    .replace(/[\s\u3000]/g, "");
}

export function ionAnswer(ion) {
  const magnitude = Math.abs(ion.charge);
  return `${ion.formula}${magnitude === 1 ? "" : magnitude}${ion.charge > 0 ? "+" : "-"}`;
}

export function ionFormulaHtml(ion) {
  const magnitude = Math.abs(ion.charge);
  const charge = `${magnitude === 1 ? "" : magnitude}${ion.charge > 0 ? "＋" : "－"}`;
  return `${formulaHtml(ion.formula)}<sup>${charge}</sup>`;
}

// Formula digits and charge digits can be adjacent (NO3-, NH4+, SO42-).
// Use the registered ion's canonical input form when available rather than
// trying to infer the split from the final digit alone.
export function ionInputHtml(value, ions = []) {
  const normalized = normalizeFormula(value);
  if (!normalized) return "";
  const ion = ions.find((item) => ionAnswer(item) === normalized);
  if (ion) return ionFormulaHtml(ion);
  const sign = normalized.match(/[+-]$/)?.[0];
  if (!sign) return formulaHtml(normalized);
  return `${formulaHtml(normalized.slice(0, -1))}<sup>${sign === "+" ? "＋" : "－"}</sup>`;
}

export function formulaHtml(formula) {
  if (!formula) return "";
  let html = "";
  for (const character of String(formula)) html += /[0-9]/.test(character) ? `<sub>${character}</sub>` : escapeHtml(character);
  return html;
}

export function formulaText(formula) {
  const subscripts = "₀₁₂₃₄₅₆₇₈₉";
  return String(formula ?? "").replace(/[0-9]/g, (digit) => subscripts[Number(digit)]);
}

function gcd(a, b) {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right) [left, right] = [right, left % right];
  return left;
}

function ionTerm(ion, count) {
  if (count === 1) return ion.formula;
  return `${ion.atomicity === "polyatomic" ? `(${ion.formula})` : ion.formula}${count}`;
}

export function neutralFormula(cation, anion) {
  if (!cation || !anion || cation.charge <= 0 || anion.charge >= 0) return null;
  const divisor = gcd(cation.charge, anion.charge);
  const cationCount = Math.abs(anion.charge) / divisor;
  const anionCount = cation.charge / divisor;
  return {
    formula: `${ionTerm(cation, cationCount)}${ionTerm(anion, anionCount)}`,
    cationCount,
    anionCount,
    totalCharge: Math.abs(cation.charge * cationCount),
  };
}

export function ionCategory(ion) {
  if (ion.requiresOxidationNumeral) return "ionVariableOx";
  if (ion.atomicity === "polyatomic") return "ionPolyatomic";
  return "ionSimple";
}

export function compoundCategory(compound, ionById) {
  const cation = ionById.get(compound.cation);
  const anion = ionById.get(compound.anion);
  if (!cation || !anion) return null;
  if (cation.requiresOxidationNumeral || anion.requiresOxidationNumeral) return "variableOx";
  if (cation.atomicity === "polyatomic" || anion.atomicity === "polyatomic") return "polyatomic";
  const composition = neutralFormula(cation, anion);
  return composition?.cationCount === 1 && composition?.anionCount === 1 ? "simple11" : "simpleRatio";
}

export function domainForPracticeType(practiceType) {
  return practiceType === "ion" ? "ion" : "compound";
}

function compoundModeEnabled(item, variant) {
  const modes = item.questionModes ?? {};
  if (variant === "ionNamesToFormula") return modes.ionNamesToFormula ?? modes.ionsToFormula ?? false;
  if (variant === "ionNamesToName") return modes.ionNamesToName ?? modes.ionsToName ?? false;
  return modes[variant] ?? false;
}

export function itemVariants(practiceType, item) {
  if (practiceType === "ion") return VARIANTS.ion;
  return VARIANTS[practiceType].filter((variant) => compoundModeEnabled(item, variant));
}

export function historyKey(questionOrDomain, itemId, variant) {
  if (typeof questionOrDomain === "object") {
    const question = questionOrDomain;
    return `${question.domain}:${question.itemId}:${question.skill ?? question.variant}`;
  }
  return `${questionOrDomain}:${itemId}:${variant}`;
}

export function resultScore({ passed, usedHint, hadWrong }) {
  if (passed) return 3;
  if (usedHint) return 2;
  if (hadWrong) return 1;
  return -1;
}

export function recordHistory(history, question, result, now = Date.now()) {
  const key = historyKey(question);
  const previous = history[key] ?? { score: 0, attempts: 0 };
  const delta = resultScore(result);
  history[key] = {
    score: Math.max(-20, Math.min(20, previous.score + delta)),
    attempts: previous.attempts + 1,
    lastResult: result.passed ? "pass" : result.usedHint ? "hintedCorrect" : result.hadWrong ? "retryCorrect" : "firstTryCorrect",
    lastSeenAt: now,
  };
  return history[key];
}

function shuffled(values, random = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function allocateCounts(weights, total, capacities = {}, random = Math.random) {
  const entries = Object.entries(weights).filter(([, weight]) => Number(weight) > 0);
  const result = Object.fromEntries(Object.keys(weights).map((key) => [key, 0]));
  if (!entries.length || total <= 0) return result;
  const weightSum = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
  const exact = entries.map(([key, weight]) => ({ key, exact: total * Number(weight) / weightSum, tie: random() }));
  for (const entry of exact) result[entry.key] = Math.floor(entry.exact);
  let remaining = total - Object.values(result).reduce((sum, value) => sum + value, 0);
  exact.sort((a, b) => (b.exact % 1) - (a.exact % 1) || a.tie - b.tie);
  for (const entry of exact) {
    if (!remaining) break;
    result[entry.key] += 1;
    remaining -= 1;
  }
  let shortage = 0;
  for (const [key] of entries) {
    const capacity = capacities[key] ?? Number.POSITIVE_INFINITY;
    if (result[key] > capacity) {
      shortage += result[key] - capacity;
      result[key] = capacity;
    }
  }
  while (shortage > 0) {
    const candidates = entries
      .filter(([key]) => result[key] < (capacities[key] ?? Number.POSITIVE_INFINITY))
      .sort((a, b) => (result[a[0]] / Number(a[1])) - (result[b[0]] / Number(b[1])) || random() - 0.5);
    if (!candidates.length) break;
    result[candidates[0][0]] += 1;
    shortage -= 1;
  }
  return result;
}

function eligibleItems(practiceType, ions, compounds, categoryWeights) {
  const domain = domainForPracticeType(practiceType);
  const ionById = new Map(ions.map((ion) => [ion.id, ion]));
  const source = domain === "ion" ? ions : compounds;
  return source
    .filter((item) => item.enabled && itemVariants(practiceType, item).length)
    .map((item) => ({ item, category: domain === "ion" ? ionCategory(item) : compoundCategory(item, ionById) }))
    .filter(({ category }) => category && Number(categoryWeights[category]) > 0);
}

function choosePair({ candidates, practiceType, variantRemaining, history, wantWeak, random }) {
  const domain = domainForPracticeType(practiceType);
  const pairs = [];
  for (const candidate of candidates) {
    for (const variant of itemVariants(practiceType, candidate.item)) {
      const weakScore = history[historyKey(domain, candidate.item.id, variant)]?.score ?? 0;
      pairs.push({ candidate, variant, weakScore, variantNeed: variantRemaining[variant] ?? 0, tie: random() });
    }
  }
  pairs.sort((a, b) => {
    if (wantWeak) {
      const weakA = a.weakScore > 0 ? a.weakScore : -100;
      const weakB = b.weakScore > 0 ? b.weakScore : -100;
      if (weakB !== weakA) return weakB - weakA;
    }
    const needA = a.variantNeed > 0 ? a.variantNeed : -1;
    const needB = b.variantNeed > 0 ? b.variantNeed : -1;
    return needB - needA || a.tie - b.tie;
  });
  return pairs[0] ?? null;
}

function makeQuestion(practiceType, pair) {
  const domain = domainForPracticeType(practiceType);
  return {
    practiceType, domain, itemId: pair.candidate.item.id, category: pair.candidate.category,
    variant: pair.variant, skill: pair.variant,
  };
}

function normalizedOptions(options) {
  const practiceType = options.practiceType ?? options.domain ?? "ion";
  return { ...options, practiceType, domain: domainForPracticeType(practiceType) };
}

export function buildTenQuestionSet(rawOptions) {
  const { practiceType, domain, difficulty, ions, compounds, settings, history = {}, random = Math.random } = normalizedOptions(rawOptions);
  const categoryWeights = settings.categoryWeights[domain][difficulty];
  const variantWeights = settings.variantWeights[practiceType];
  const eligible = eligibleItems(practiceType, ions, compounds, categoryWeights);
  const capacity = {};
  for (const candidate of eligible) capacity[candidate.category] = (capacity[candidate.category] ?? 0) + 1;
  const total = Math.min(10, eligible.length);
  const categoryCounts = allocateCounts(categoryWeights, total, capacity, random);
  const variantCounts = allocateCounts(variantWeights, total, {}, random);
  const categorySlots = shuffled(Object.entries(categoryCounts).flatMap(([category, count]) => Array(count).fill(category)), random);
  const remainingVariants = { ...variantCounts };
  const used = new Set();
  const questions = [];
  let weakRemaining = Math.min(Number(settings.weakQuestionTarget?.ten ?? 3), total);
  for (let index = 0; index < categorySlots.length; index += 1) {
    const category = categorySlots[index];
    const candidates = eligible.filter((candidate) => candidate.category === category && !used.has(candidate.item.id));
    const shouldSeekWeak = weakRemaining > 0 && (index % 3 === 0 || categorySlots.length - index <= weakRemaining);
    let pair = choosePair({ candidates, practiceType, variantRemaining: remainingVariants, history, wantWeak: shouldSeekWeak, random });
    if (!pair) continue;
    if (shouldSeekWeak && pair.weakScore <= 0) pair = choosePair({ candidates, practiceType, variantRemaining: remainingVariants, history, wantWeak: false, random });
    else if (pair.weakScore > 0) weakRemaining -= 1;
    used.add(pair.candidate.item.id);
    if (remainingVariants[pair.variant] > 0) remainingVariants[pair.variant] -= 1;
    questions.push(makeQuestion(practiceType, pair));
  }
  return { questions, categoryCounts, variantCounts, availableCount: eligible.length };
}

export function buildEndlessRound(rawOptions) {
  const { practiceType, domain, difficulty, ions, compounds, settings, history = {}, random = Math.random } = normalizedOptions(rawOptions);
  const categoryWeights = settings.categoryWeights[domain][difficulty];
  const variantWeights = settings.variantWeights[practiceType];
  const remaining = eligibleItems(practiceType, ions, compounds, categoryWeights);
  const variantTargets = allocateCounts(variantWeights, remaining.length, {}, random);
  const variantRemaining = { ...variantTargets };
  const drawnByCategory = Object.fromEntries(Object.keys(categoryWeights).map((key) => [key, 0]));
  const questions = [];
  let weakRemaining = Math.ceil(remaining.length * Number(settings.weakQuestionTarget?.endlessPerTen ?? 3) / 10);
  while (remaining.length) {
    const drawnTotal = questions.length;
    const availableCategories = [...new Set(remaining.map((candidate) => candidate.category))];
    const weightSum = Object.entries(categoryWeights)
      .filter(([category, weight]) => availableCategories.includes(category) && Number(weight) > 0)
      .reduce((sum, [, weight]) => sum + Number(weight), 0);
    const category = availableCategories
      .map((key) => ({ key, deficit: ((drawnTotal + 1) * Number(categoryWeights[key]) / weightSum) - drawnByCategory[key], tie: random() }))
      .sort((a, b) => b.deficit - a.deficit || a.tie - b.tie)[0].key;
    const candidates = remaining.filter((candidate) => candidate.category === category);
    const shouldSeekWeak = weakRemaining > 0 && (questions.length % 3 === 0 || remaining.length <= weakRemaining);
    let pair = choosePair({ candidates, practiceType, variantRemaining, history, wantWeak: shouldSeekWeak, random });
    if (shouldSeekWeak && pair?.weakScore <= 0) pair = choosePair({ candidates, practiceType, variantRemaining, history, wantWeak: false, random });
    else if (pair?.weakScore > 0) weakRemaining -= 1;
    if (!pair) break;
    questions.push(makeQuestion(practiceType, pair));
    drawnByCategory[category] += 1;
    if (variantRemaining[pair.variant] > 0) variantRemaining[pair.variant] -= 1;
    remaining.splice(remaining.findIndex((candidate) => candidate.item.id === pair.candidate.item.id), 1);
  }
  return { questions, categoryCounts: drawnByCategory, variantCounts: variantTargets, availableCount: questions.length };
}

export function answerFor(question, item) {
  if (question.domain === "ion") {
    return question.variant === "ionNameToFormula"
      ? { type: "formula", canonical: ionAnswer(item), accepted: [] }
      : { type: "name", canonical: item.name, accepted: [] };
  }
  if (!question.variant.endsWith("ToFormula")) return { type: "name", canonical: item.name, accepted: [] };
  return { type: "formula", canonical: item.formula, accepted: item.acceptedFormulaVariants ?? [] };
}

export function evaluateAnswer(answer, specification) {
  const normalize = specification.type === "formula" ? normalizeFormula : normalizeName;
  const actual = normalize(answer);
  if (!actual) return { correct: false, empty: true, matchedAnswerKind: null, note: null };
  if (actual === normalize(specification.canonical)) return { correct: true, empty: false, matchedAnswerKind: "canonical", note: null };
  const alternative = specification.accepted.find((entry) => actual === normalize(entry.formula ?? entry));
  return alternative
    ? { correct: true, empty: false, matchedAnswerKind: "acceptedAlternative", note: alternative.note ?? null }
    : { correct: false, empty: false, matchedAnswerKind: null, note: null };
}

export function explanationForCompound(compound, ionById) {
  const cation = ionById.get(compound.cation);
  const anion = ionById.get(compound.anion);
  const composition = neutralFormula(cation, anion);
  if (!composition) return "陽イオンと陰イオンの電荷を確認しよう。";
  const plus = `${cation.name.replace("イオン", "")}：＋${cation.charge} × ${composition.cationCount} = ＋${composition.totalCharge}`;
  const minus = `${anion.name.replace("イオン", "")}：${anion.charge} × ${composition.anionCount} = －${composition.totalCharge}`;
  return `${plus}\n${minus}\n全体の電荷が0になる最簡整数比です。`;
}

export function hintFor(question, item, ionById) {
  if (question.domain === "ion") {
    return question.variant === "ionNameToFormula"
      ? "元素記号やイオンを表す式と、電荷の符号・大きさを確認しよう。"
      : "式の元素記号・原子団と、右上の電荷に注目しよう。";
  }
  if (question.variant.endsWith("ToName")) return "陰イオン名、陽イオン名の順につなげよう。必要なら酸化数も付けよう。";
  const cation = ionById.get(item.cation);
  const anion = ionById.get(item.anion);
  const left = Math.abs(cation.charge);
  const right = Math.abs(anion.charge);
  return left === right
    ? "陽イオンと陰イオンを1個ずつ組み合わせると、全体の電荷が0になります。"
    : `＋${left}と－${right}の電荷が打ち消し合う最簡整数比を考えよう。`;
}

export function validateData(ions, compounds, settings) {
  const errors = [];
  const warnings = [];
  const ionIds = new Set();
  for (const [index, ion] of ions.entries()) {
    const path = `ions[${index}]`;
    if (!ion.id) errors.push(`${path}: idがありません。`);
    else if (ionIds.has(ion.id)) errors.push(`${path}: id「${ion.id}」が重複しています。`);
    ionIds.add(ion.id);
    if (!ion.formula || !ion.name) errors.push(`${path}: formulaまたはnameがありません。`);
    if (!Number.isFinite(Number(ion.charge)) || Number(ion.charge) === 0) errors.push(`${path}: chargeは0以外の数値にしてください。`);
    if (ion.type === "cation" && Number(ion.charge) <= 0) errors.push(`${path}: 陽イオンのchargeは正数です。`);
    if (ion.type === "anion" && Number(ion.charge) >= 0) errors.push(`${path}: 陰イオンのchargeは負数です。`);
  }
  const ionById = new Map(ions.map((ion) => [ion.id, ion]));
  const compoundIds = new Set();
  for (const [index, compound] of compounds.entries()) {
    const path = `compounds[${index}]`;
    if (!compound.id) errors.push(`${path}: idがありません。`);
    else if (compoundIds.has(compound.id)) errors.push(`${path}: id「${compound.id}」が重複しています。`);
    compoundIds.add(compound.id);
    const cation = ionById.get(compound.cation);
    const anion = ionById.get(compound.anion);
    if (!cation) errors.push(`${path}: 陽イオン「${compound.cation}」が存在しません。`);
    if (!anion) errors.push(`${path}: 陰イオン「${compound.anion}」が存在しません。`);
    if (cation && cation.type !== "cation") errors.push(`${path}: cation参照先が陽イオンではありません。`);
    if (anion && anion.type !== "anion") errors.push(`${path}: anion参照先が陰イオンではありません。`);
    if (compound.enabled && cation && !cation.enabled) errors.push(`${path}: 有効な化合物が無効な陽イオンを参照しています。`);
    if (compound.enabled && anion && !anion.enabled) errors.push(`${path}: 有効な化合物が無効な陰イオンを参照しています。`);
    if (compound.enabled && !Object.values(compound.questionModes ?? {}).some(Boolean)) errors.push(`${path}: enabledですが全questionModesがfalseです。`);
    const formulaModes = ["nameToFormula", "ionsToFormula", "ionNamesToFormula"];
    if (compound.formula == null && formulaModes.some((mode) => compound.questionModes?.[mode])) errors.push(`${path}: formula=nullで組成式を使う問題が有効です。`);
    const serialized = JSON.stringify({ formula: compound.formula, aliases: compound.acceptedFormulaVariants ?? [] });
    if (serialized.includes("Fe(OH)3") || serialized.includes("Fe(OH)₃")) errors.push(`${path}: Fe(OH)3は禁止されています。`);
    if (cation && anion && compound.formula) {
      const generated = neutralFormula(cation, anion)?.formula;
      const registered = [compound.formula, ...(compound.acceptedFormulaVariants ?? []).map((entry) => entry.formula)];
      if (!registered.some((formula) => normalizeFormula(formula) === normalizeFormula(generated))) errors.push(`${path}: 組成式が電荷の最簡整数比「${generated}」と整合しません。`);
      else if (normalizeFormula(compound.formula) !== normalizeFormula(generated)) warnings.push(`${path}: 保存式「${compound.formula}」は陽イオン先頭式「${generated}」と異なります（許容別表記登録済み）。`);
    }
  }
  for (const domain of ["ion", "compound"]) {
    for (const difficulty of ["normal", "hard"]) {
      const weights = settings?.categoryWeights?.[domain]?.[difficulty];
      if (!weights || Object.values(weights).some((value) => !Number.isFinite(Number(value)) || Number(value) < 0) || !Object.values(weights).some((value) => Number(value) > 0)) errors.push(`difficulty: ${domain}.${difficulty}は0以上で、少なくとも1項目を正数にしてください。`);
    }
  }
  for (const practiceType of PRACTICE_TYPES) {
    const weights = settings?.variantWeights?.[practiceType];
    if (!weights || Object.values(weights).some((value) => !Number.isFinite(Number(value)) || Number(value) < 0) || !Object.values(weights).some((value) => Number(value) > 0)) errors.push(`difficulty: ${practiceType}の出題タイプ比率が不正です。`);
  }
  return { errors, warnings, valid: errors.length === 0 };
}
