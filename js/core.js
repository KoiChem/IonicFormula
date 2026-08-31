// The UI exposes the two learning domains below. The three legacy compound
// types remain in VARIANTS for imported history/settings compatibility.
export const PRACTICE_TYPES = ["ion", "compound"];

export const PRACTICE_TYPE_LABELS = {
  ion: "イオン",
  compound: "化合物",
  ionFormula: "イオン式 → 化合物",
  ionName: "イオン名 → 化合物",
  random: "ランダム",
};

export const VARIANTS = {
  ion: ["ionNameToFormula", "ionFormulaToName"],
  compound: [
    "ionsToFormula", "ionsToName", "ionsToBoth",
    "ionNamesToFormula", "ionNamesToName", "ionNamesToBoth",
    "mixedIonsToFormula", "mixedIonsToName", "mixedIonsToBoth",
  ],
  ionFormula: ["ionsToFormula", "ionsToName"],
  ionName: ["ionNamesToFormula", "ionNamesToName"],
  random: ["ionsToFormula", "ionsToName", "ionNamesToFormula", "ionNamesToName", "mixedIonsToFormula", "mixedIonsToName"],
};

export const VARIANT_LABELS = {
  ionNameToFormula: "イオン名 → イオン式",
  ionFormulaToName: "イオン式 → イオン名",
  ionsToFormula: "イオン式 → 組成式",
  ionsToName: "イオン式 → 化合物名",
  ionNamesToFormula: "イオン名 → 組成式",
  ionNamesToName: "イオン名 → 化合物名",
  mixedIonsToFormula: "イオン名・式 → 組成式",
  mixedIonsToName: "イオン名・式 → 化合物名",
  ionsToBoth: "イオン式 → 式＆名称",
  ionNamesToBoth: "イオン名 → 式＆名称",
  mixedIonsToBoth: "イオン名・式 → 式＆名称",
};

export const DEFAULT_COMPOUND_OPTIONS = Object.freeze({
  promptFormula: true,
  promptName: true,
  answerFormula: true,
  answerName: true,
  answerBoth: false,
});

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

export function createFormulaEntry() {
  return { tokens: [], cursor: 0, charge: null };
}

export function formulaEntryCore(entry) {
  return normalizeFormula((entry?.tokens ?? []).join(""));
}

export function formulaEntryValue(entry) {
  const core = formulaEntryCore(entry);
  const charge = entry?.charge;
  if (!charge) return core;
  return `${core}${charge.magnitude === 1 ? "" : charge.magnitude}${charge.sign}`;
}

// Ion charges are deliberately accepted only from the dedicated charge keys.
// A trailing sign in the formula body must never be reinterpreted as charge.
export function evaluateIonEntry(entry, ion) {
  const actualFormula = formulaEntryCore(entry);
  const charge = entry?.charge;
  if (!actualFormula || !charge) return { correct: false, empty: !actualFormula && !charge, matchedAnswerKind: null, note: null };
  const expectedMagnitude = Math.abs(Number(ion.charge));
  const expectedSign = Number(ion.charge) > 0 ? "+" : "-";
  const correct = charge.source === "chargeButton"
    && actualFormula === normalizeFormula(ion.formula)
    && Number(charge.magnitude) === expectedMagnitude
    && charge.sign === expectedSign;
  return { correct, empty: false, matchedAnswerKind: correct ? "canonical" : null, note: null };
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
  if (variant === "ionsToBoth") return Boolean(modes.ionsToFormula && modes.ionsToName);
  if (variant === "ionNamesToBoth") return Boolean((modes.ionNamesToFormula ?? modes.ionsToFormula) && (modes.ionNamesToName ?? modes.ionsToName));
  if (variant === "mixedIonsToBoth") return Boolean(modes.ionsToFormula && modes.ionsToName && (modes.ionNamesToFormula ?? modes.ionsToFormula) && (modes.ionNamesToName ?? modes.ionsToName));
  if (variant === "ionNamesToFormula") return modes.ionNamesToFormula ?? modes.ionsToFormula ?? false;
  if (variant === "ionNamesToName") return modes.ionNamesToName ?? modes.ionsToName ?? false;
  if (variant === "mixedIonsToFormula") return Boolean(modes.ionsToFormula && (modes.ionNamesToFormula ?? modes.ionsToFormula));
  if (variant === "mixedIonsToName") return Boolean(modes.ionsToName && (modes.ionNamesToName ?? modes.ionsToName));
  return modes[variant] ?? false;
}

export function compoundVariantsForOptions(rawOptions = DEFAULT_COMPOUND_OPTIONS) {
  const options = { ...DEFAULT_COMPOUND_OPTIONS, ...rawOptions };
  const answerKinds = options.answerBoth
    ? ["Both"]
    : [options.answerFormula && "Formula", options.answerName && "Name"].filter(Boolean);
  const variants = [];
  if (options.promptFormula) variants.push(...answerKinds.map((kind) => `ionsTo${kind}`));
  if (options.promptName) variants.push(...answerKinds.map((kind) => `ionNamesTo${kind}`));
  // Formula-only, name-only and mixed prompts carry the same weight.
  if (options.promptFormula && options.promptName) variants.push(...answerKinds.map((kind) => `mixedIonsTo${kind}`));
  return variants;
}

export function itemVariants(practiceType, item, compoundOptions = DEFAULT_COMPOUND_OPTIONS) {
  if (practiceType === "ion") return VARIANTS.ion;
  if (practiceType === "compound") return compoundVariantsForOptions(compoundOptions).filter((variant) => compoundModeEnabled(item, variant));
  return VARIANTS[practiceType].filter((variant) => compoundModeEnabled(item, variant));
}

export function questionSkills(question) {
  if (!question.variant.endsWith("ToBoth")) return [question.skill ?? question.variant];
  return [
    question.variant.replace("ToBoth", "ToFormula"),
    question.variant.replace("ToBoth", "ToName"),
  ];
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
  const firstTryCorrect = !result.passed && !result.usedHint && !result.hadWrong;
  history[key] = {
    score: Math.max(-20, Math.min(20, previous.score + delta)),
    attempts: previous.attempts + 1,
    scoredAttempts: (Number(previous.scoredAttempts) || 0) + 1,
    firstTryCorrects: (Number(previous.firstTryCorrects) || 0) + (firstTryCorrect ? 1 : 0),
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

export const RECENT_PRESENTATION_LIMIT = 8;

export function presentationKey(question) {
  return `${question.domain}:${question.itemId}`;
}

export function normalizeRecentPresentations(value, limit = RECENT_PRESENTATION_LIMIT) {
  const entries = Array.isArray(value) ? value : value?.items;
  if (!Array.isArray(entries)) return [];
  const unique = [];
  for (const entry of entries) {
    if (typeof entry !== "string" || !/^(ion|compound):[^:]+$/.test(entry)) continue;
    const previous = unique.indexOf(entry);
    if (previous >= 0) unique.splice(previous, 1);
    unique.push(entry);
  }
  return unique.slice(-limit);
}

export function recordRecentPresentation(recent, question, limit = RECENT_PRESENTATION_LIMIT) {
  const key = typeof question === "string" ? question : presentationKey(question);
  return normalizeRecentPresentations([...normalizeRecentPresentations(recent, limit), key], limit);
}

function recentPenalty(recentPresentations, domain, itemId) {
  const index = recentPresentations.lastIndexOf(`${domain}:${itemId}`);
  return index < 0 ? 0 : recentPresentations.length - index;
}

function weakSlots(total, desiredCount, random, { avoidFirst = true } = {}) {
  const start = avoidFirst ? 1 : 0;
  const positions = Array.from({ length: Math.max(0, total - start) }, (_, index) => index + start);
  return new Set(shuffled(positions, random).slice(0, Math.min(desiredCount, positions.length)));
}

function weightedPick(values, weightFor, random) {
  const weights = values.map((value) => Math.max(0, Number(weightFor(value)) || 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return values[Math.floor(random() * values.length)] ?? null;
  let cursor = random() * total;
  for (let index = 0; index < values.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return values[index];
  }
  return values.at(-1) ?? null;
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

export function itemAvailableAtDifficulty(item, difficulty) {
  return !item.difficulty || item.difficulty === difficulty;
}

function eligibleItems(practiceType, ions, compounds, categoryWeights, compoundOptions, difficulty) {
  const domain = domainForPracticeType(practiceType);
  const ionById = new Map(ions.map((ion) => [ion.id, ion]));
  const source = domain === "ion" ? ions : compounds;
  return source
    .filter((item) => item.enabled
      && (domain !== "ion" || item.ionQuestionEnabled !== false)
      && itemAvailableAtDifficulty(item, difficulty)
      && itemVariants(practiceType, item, compoundOptions).length)
    .map((item) => ({ item, category: domain === "ion" ? ionCategory(item) : compoundCategory(item, ionById) }))
    .filter(({ category }) => category && Number(categoryWeights[category]) > 0);
}

function weaknessFor(history, key) {
  const record = history[key];
  if (!record) return { tier: 2, rate: 1, score: 0, lastSeenAt: Number.POSITIVE_INFINITY };
  const scoredAttempts = Number(record.scoredAttempts) || 0;
  if (scoredAttempts > 0) {
    return {
      tier: 0,
      // A small prior keeps one miss from outweighing a longer learning history.
      rate: ((Number(record.firstTryCorrects) || 0) + 1) / (scoredAttempts + 2),
      score: Number(record.score) || 0,
      lastSeenAt: Number(record.lastSeenAt) || 0,
    };
  }
  if ((Number(record.score) || 0) > 0) return { tier: 1, rate: 1, score: Number(record.score), lastSeenAt: Number(record.lastSeenAt) || 0 };
  return { tier: 2, rate: 1, score: Number(record.score) || 0, lastSeenAt: Number(record.lastSeenAt) || 0 };
}

export function weakHistoryItems(history, ions, compounds) {
  const ionById = new Map(ions.map((ion) => [ion.id, ion]));
  const compoundById = new Map(compounds.map((compound) => [compound.id, compound]));
  const grouped = new Map();
  for (const [key, rawRecord] of Object.entries(history ?? {})) {
    const [domain, itemId, skill] = key.split(":");
    const item = domain === "ion" ? ionById.get(itemId) : domain === "compound" ? compoundById.get(itemId) : null;
    const score = Number(rawRecord?.score) || 0;
    if (!item || score <= 0) continue;
    const groupKey = `${domain}:${itemId}`;
    const current = grouped.get(groupKey) ?? {
      domain, itemId, item, score: 0, scoredAttempts: 0, firstTryCorrects: 0, lastSeenAt: 0, skills: [],
    };
    current.score += score;
    current.scoredAttempts += Number(rawRecord?.scoredAttempts) || 0;
    current.firstTryCorrects += Number(rawRecord?.firstTryCorrects) || 0;
    current.lastSeenAt = Math.max(current.lastSeenAt, Number(rawRecord?.lastSeenAt) || 0);
    if (skill && !current.skills.includes(skill)) current.skills.push(skill);
    grouped.set(groupKey, current);
  }
  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      rate: entry.scoredAttempts > 0 ? entry.firstTryCorrects / entry.scoredAttempts : 0,
      skills: entry.skills.sort(),
    }))
    .sort((left, right) => left.rate - right.rate || right.score - left.score || left.lastSeenAt - right.lastSeenAt);
}

function compareWeakness(left, right) {
  if (left.tier !== right.tier) return left.tier - right.tier;
  if (left.rate !== right.rate) return left.rate - right.rate;
  if (left.score !== right.score) return right.score - left.score;
  return left.lastSeenAt - right.lastSeenAt;
}

function candidateIonIds(candidate, domain) {
  return domain === "ion" ? [candidate.item.id] : [candidate.item.cation, candidate.item.anion];
}

function ionReusePenalty(ionIds, usedIonCounts) {
  return ionIds.reduce((total, ionId) => total + (usedIonCounts.get(ionId) ?? 0), 0);
}

function weaknessForVariant(history, domain, itemId, variant) {
  const skills = variant.endsWith("ToBoth")
    ? [variant.replace("ToBoth", "ToFormula"), variant.replace("ToBoth", "ToName")]
    : [variant];
  return skills
    .map((skill) => weaknessFor(history, historyKey(domain, itemId, skill)))
    .sort(compareWeakness)[0];
}

function weakWeight(pair) {
  if (pair.weakness.tier === 2) return 0;
  if (pair.weakness.tier === 1) return 1 + Math.min(6, pair.weakness.score) * .35;
  const accuracyGap = Math.max(0, 1 - pair.weakness.rate);
  return 1 + accuracyGap * 4 + Math.max(0, Math.min(8, pair.weakness.score)) * .2;
}

function choosePair({ candidates, practiceType, compoundOptions, variantRemaining, history, wantWeak, recentPresentations = [], usedIonCounts = new Map(), random }) {
  const domain = domainForPracticeType(practiceType);
  const pairs = [];
  for (const candidate of candidates) {
    for (const variant of itemVariants(practiceType, candidate.item, compoundOptions)) {
      const weakness = weaknessForVariant(history, domain, candidate.item.id, variant);
      const ionIds = candidateIonIds(candidate, domain);
      pairs.push({
        candidate, variant, weakness, ionIds,
        ionPenalty: ionReusePenalty(ionIds, usedIonCounts),
        recentPenalty: recentPenalty(recentPresentations, domain, candidate.item.id),
        variantNeed: variantRemaining[variant] ?? 0, tie: random(),
      });
    }
  }
  if (!pairs.length) return null;

  // Recently displayed materials are held back across sessions, even if the
  // learner returned home before answering them. If all candidates are recent,
  // the least-recently displayed ones remain available.
  const freshestPenalty = Math.min(...pairs.map((pair) => pair.recentPenalty));
  let pool = pairs.filter((pair) => pair.recentPenalty === freshestPenalty);
  if (wantWeak) {
    const weakPool = pool.filter((pair) => pair.weakness.tier < 2);
    if (weakPool.length) {
      return weightedPick(weakPool, (pair) => weakWeight(pair) * (pair.variantNeed > 0 ? 1.2 : .85) / (1 + pair.ionPenalty * .25), random);
    }
  }
  pool.sort((a, b) => {
    if (a.ionPenalty !== b.ionPenalty) return a.ionPenalty - b.ionPenalty;
    const needA = a.variantNeed > 0 ? a.variantNeed : -1;
    const needB = b.variantNeed > 0 ? b.variantNeed : -1;
    return needB - needA || a.tie - b.tie;
  });
  // Keep the existing ion-reuse and variant balance as the primary rule, but
  // randomize among close candidates so a normal session does not look fixed.
  const bestPenalty = pool[0]?.ionPenalty;
  const bestNeed = pool[0]?.variantNeed > 0 ? pool[0].variantNeed : -1;
  const closePool = pool.filter((pair) => pair.ionPenalty === bestPenalty && (pair.variantNeed > 0 ? pair.variantNeed : -1) === bestNeed);
  return closePool[Math.floor(random() * closePool.length)] ?? pool[0] ?? null;
}

function makeQuestion(practiceType, pair, random) {
  const domain = domainForPracticeType(practiceType);
  const promptStyle = domain !== "compound" ? null
    : pair.variant.startsWith("ionNames") ? "nameName"
      : pair.variant.startsWith("ions") ? "formulaFormula"
        : random() < .5 ? "formulaName" : "nameFormula";
  return {
    practiceType, domain, itemId: pair.candidate.item.id, category: pair.candidate.category,
    variant: pair.variant, skill: pair.variant,
    promptStyle,
    promptOrder: domain === "compound" ? (random() < .5 ? "cationFirst" : "anionFirst") : null,
  };
}

function recordPairIons(pair, usedIonCounts) {
  for (const ionId of pair.ionIds) usedIonCounts.set(ionId, (usedIonCounts.get(ionId) ?? 0) + 1);
}

function normalizedOptions(options) {
  const practiceType = options.practiceType ?? options.domain ?? "ion";
  return {
    ...options,
    practiceType,
    domain: domainForPracticeType(practiceType),
    compoundOptions: { ...DEFAULT_COMPOUND_OPTIONS, ...(options.compoundOptions ?? {}) },
    recentPresentations: normalizeRecentPresentations(options.recentPresentations),
  };
}

function variantWeightsFor(practiceType, settings, compoundOptions) {
  if (practiceType === "compound") {
    return Object.fromEntries(compoundVariantsForOptions(compoundOptions).map((variant) => [variant, 1]));
  }
  return settings.variantWeights[practiceType] ?? {};
}

export function buildTenQuestionSet(rawOptions) {
  const { practiceType, domain, difficulty, ions, compounds, settings, history = {}, random = Math.random, compoundOptions, recentPresentations } = normalizedOptions(rawOptions);
  const categoryWeights = settings.categoryWeights[domain][difficulty];
  const variantWeights = variantWeightsFor(practiceType, settings, compoundOptions);
  const eligible = eligibleItems(practiceType, ions, compounds, categoryWeights, compoundOptions, difficulty);
  const capacity = {};
  for (const candidate of eligible) capacity[candidate.category] = (capacity[candidate.category] ?? 0) + 1;
  const total = Math.min(10, eligible.length);
  const categoryCounts = allocateCounts(categoryWeights, total, capacity, random);
  const variantCounts = allocateCounts(variantWeights, total, {}, random);
  const categorySlots = shuffled(Object.entries(categoryCounts).flatMap(([category, count]) => Array(count).fill(category)), random);
  const remainingVariants = { ...variantCounts };
  const used = new Set();
  const usedIonCounts = new Map();
  const questions = [];
  let weakRemaining = Math.min(Number(settings.weakQuestionTarget?.ten ?? 3), total);
  const plannedWeakSlots = weakSlots(total, weakRemaining, random);
  for (let index = 0; index < categorySlots.length; index += 1) {
    const category = categorySlots[index];
    const candidates = eligible.filter((candidate) => candidate.category === category && !used.has(candidate.item.id));
    const positionsAfterThis = categorySlots.length - index - 1;
    const shouldSeekWeak = weakRemaining > 0 && (plannedWeakSlots.has(index) || weakRemaining > positionsAfterThis);
    let pair = choosePair({ candidates, practiceType, compoundOptions, variantRemaining: remainingVariants, history, wantWeak: shouldSeekWeak, recentPresentations, usedIonCounts, random });
    if (!pair) continue;
    if (shouldSeekWeak && pair.weakness.tier === 2) pair = choosePair({ candidates, practiceType, compoundOptions, variantRemaining: remainingVariants, history, wantWeak: false, recentPresentations, usedIonCounts, random });
    else if (pair.weakness.tier < 2) weakRemaining -= 1;
    used.add(pair.candidate.item.id);
    recordPairIons(pair, usedIonCounts);
    if (remainingVariants[pair.variant] > 0) remainingVariants[pair.variant] -= 1;
    questions.push(makeQuestion(practiceType, pair, random));
  }
  return { questions, categoryCounts, variantCounts, availableCount: eligible.length };
}

export function buildWeakQuestionSet(rawOptions) {
  const { practiceType, domain, difficulty, ions, compounds, settings, history = {}, random = Math.random, compoundOptions, recentPresentations } = normalizedOptions(rawOptions);
  const categoryWeights = settings.categoryWeights[domain][difficulty];
  const variantWeights = variantWeightsFor(practiceType, settings, compoundOptions);
  const eligible = eligibleItems(practiceType, ions, compounds, categoryWeights, compoundOptions, difficulty);
  const total = Math.min(10, eligible.length);
  const variantCounts = allocateCounts(variantWeights, total, {}, random);
  const remainingVariants = { ...variantCounts };
  const categoryCounts = Object.fromEntries(Object.keys(categoryWeights).map((category) => [category, 0]));
  const used = new Set();
  const usedIonCounts = new Map();
  const questions = [];
  while (questions.length < total) {
    const candidates = eligible.filter((candidate) => !used.has(candidate.item.id));
    const pair = choosePair({ candidates, practiceType, compoundOptions, variantRemaining: remainingVariants, history, wantWeak: true, recentPresentations, usedIonCounts, random });
    if (!pair) break;
    used.add(pair.candidate.item.id);
    recordPairIons(pair, usedIonCounts);
    categoryCounts[pair.candidate.category] += 1;
    if (remainingVariants[pair.variant] > 0) remainingVariants[pair.variant] -= 1;
    questions.push(makeQuestion(practiceType, pair, random));
  }
  return { questions, categoryCounts, variantCounts, availableCount: eligible.length };
}

export function buildEndlessRound(rawOptions) {
  const { practiceType, domain, difficulty, ions, compounds, settings, history = {}, random = Math.random, compoundOptions, recentPresentations } = normalizedOptions(rawOptions);
  const categoryWeights = settings.categoryWeights[domain][difficulty];
  const variantWeights = variantWeightsFor(practiceType, settings, compoundOptions);
  const remaining = eligibleItems(practiceType, ions, compounds, categoryWeights, compoundOptions, difficulty);
  const variantTargets = allocateCounts(variantWeights, remaining.length, {}, random);
  const variantRemaining = { ...variantTargets };
  const drawnByCategory = Object.fromEntries(Object.keys(categoryWeights).map((key) => [key, 0]));
  const usedIonCounts = new Map();
  const questions = [];
  let weakRemaining = Math.ceil(remaining.length * Number(settings.weakQuestionTarget?.endlessPerTen ?? 3) / 10);
  const plannedWeakSlots = weakSlots(remaining.length, weakRemaining, random);
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
    const positionsAfterThis = remaining.length - 1;
    const shouldSeekWeak = weakRemaining > 0 && (plannedWeakSlots.has(questions.length) || weakRemaining > positionsAfterThis);
    let pair = choosePair({ candidates, practiceType, compoundOptions, variantRemaining, history, wantWeak: shouldSeekWeak, recentPresentations, usedIonCounts, random });
    if (shouldSeekWeak && pair?.weakness.tier === 2) pair = choosePair({ candidates, practiceType, compoundOptions, variantRemaining, history, wantWeak: false, recentPresentations, usedIonCounts, random });
    else if (pair?.weakness.tier < 2) weakRemaining -= 1;
    if (!pair) break;
    questions.push(makeQuestion(practiceType, pair, random));
    drawnByCategory[category] += 1;
    recordPairIons(pair, usedIonCounts);
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
  if (question.variant.endsWith("ToBoth")) {
    return {
      type: "both",
      formula: { type: "formula", canonical: item.formula, accepted: item.acceptedFormulaVariants ?? [] },
      name: { type: "name", canonical: item.name, accepted: [] },
    };
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

export function hintFor(question, item, ionById, wrongAnswer = "") {
  if (question.domain === "ion") {
    return question.variant === "ionNameToFormula"
      ? "元素記号やイオンを表す式と、電荷の符号・大きさを確認しよう。"
      : "式の元素記号・原子団と、右上の電荷に注目しよう。";
  }
  const cation = ionById.get(item.cation);
  const anion = ionById.get(item.anion);
  if (question.variant.endsWith("ToName")) {
    const needsNumeral = cation?.requiresOxidationNumeral || anion?.requiresOxidationNumeral;
    return needsNumeral
      ? "化合物名は陰イオン由来の名前、陽イオン名の順です。鉄や銅では酸化数も確かめよう。"
      : "化合物名は陰イオン由来の名前、陽イオン名の順につなげよう。";
  }
  if (!cation || !anion) return "陽イオンと陰イオンの電荷を確認しよう。";
  const actual = normalizeFormula(wrongAnswer);
  const composition = neutralFormula(cation, anion);
  const reverseFormula = composition ? `${ionTerm(anion, composition.anionCount)}${ionTerm(cation, composition.cationCount)}` : "";
  if (actual && actual === reverseFormula) return "組成式では、陽イオン成分を先、陰イオン成分を後に書こう。";
  if (item.formula?.includes("(") && actual && actual.replace(/[()]/g, "") === item.formula.replace(/[()]/g, "")) {
    return "同じ多原子イオンを複数使うときは、原子団を括弧でまとめよう。";
  }
  const left = Math.abs(cation.charge);
  const right = Math.abs(anion.charge);
  const orderHint = question.promptOrder === "anionFirst" ? "表示は陰イオンが先ですが、組成式は陽イオン成分を先に書きます。" : "";
  const ratioHint = left === right
    ? "陽イオンと陰イオンを1個ずつ組み合わせると、全体の電荷が0になります。"
    : `＋${left}と－${right}の電荷が打ち消し合う最簡整数比を考えよう。`;
  return `${orderHint}${ratioHint}`;
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
    if (ion.difficulty && !["normal", "hard"].includes(ion.difficulty)) errors.push(`${path}: difficultyはnormalまたはhardにしてください。`);
    if (ion.compoundPromptDisplay && ion.compoundPromptDisplay !== "formulaAndName") errors.push(`${path}: compoundPromptDisplayが不正です。`);
    if (ion.ionQuestionEnabled != null && typeof ion.ionQuestionEnabled !== "boolean") errors.push(`${path}: ionQuestionEnabledは真偽値にしてください。`);
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
    if (compound.difficulty && !["normal", "hard"].includes(compound.difficulty)) errors.push(`${path}: difficultyはnormalまたはhardにしてください。`);
    if (compound.enabled && compound.difficulty !== "hard" && cation?.difficulty === "hard") errors.push(`${path}: ややむず限定の陽イオンを使う化合物もdifficultyをhardにしてください。`);
    if (compound.enabled && compound.difficulty !== "hard" && anion?.difficulty === "hard") errors.push(`${path}: ややむず限定の陰イオンを使う化合物もdifficultyをhardにしてください。`);
    if (compound.referenceUrl && !/^https:\/\//.test(compound.referenceUrl)) errors.push(`${path}: referenceUrlはhttps URLにしてください。`);
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
  // Compound variant weights are assembled from the user's prompt/answer
  // toggles, so only the fixed ion-game weights are stored in difficulty.json.
  for (const practiceType of PRACTICE_TYPES.filter((type) => type !== "compound")) {
    const weights = settings?.variantWeights?.[practiceType];
    if (!weights || Object.values(weights).some((value) => !Number.isFinite(Number(value)) || Number(value) < 0) || !Object.values(weights).some((value) => Number(value) > 0)) errors.push(`difficulty: ${practiceType}の出題タイプ比率が不正です。`);
  }
  return { errors, warnings, valid: errors.length === 0 };
}
