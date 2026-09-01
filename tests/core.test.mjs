import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import {
  PRACTICE_TYPES,
  allocateCounts,
  answerFor,
  buildEndlessRound,
  buildTenQuestionSet,
  buildWeakQuestionSet,
  companionAnswerFor,
  compoundAnswerPresetForOptions,
  compoundOptionsForAnswerPreset,
  compoundVariantsForOptions,
  createFormulaEntry,
  compoundCategory,
  evaluateAnswer,
  evaluateIonEntry,
  historyKey,
  hintFor,
  ionCategory,
  ionInputHtml,
  itemAvailableAtDifficulty,
  itemVariants,
  neutralFormula,
  normalizeFormula,
  normalizeName,
  normalizeCompoundSelectionState,
  recordCompoundSelectionPresentation,
  recordHistory,
  recordRecentPresentation,
  removeWeakHistoryItems,
  validateData,
  weakHistoryItems,
} from "../js/core.js";

const load = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const ions = await load("../data/ions.json");
const compounds = await load("../data/compounds.json");
const settings = await load("../data/difficulty.json");
const ionById = new Map(ions.map((ion) => [ion.id, ion]));
const advancedIonIds = [
  "chromium3", "manganese2", "tin2", "tin4", "gold3",
  "lead2", "lead4",
  "sulfite", "nitrite", "hypochlorite", "chlorate", "thiosulfate", "thiocyanate", "cyanide", "iodate",
  "permanganate", "chromate", "dichromate",
];
const advancedCompoundFormulas = {
  chromium3_chloride: "CrCl3",
  manganese2_chloride: "MnCl2",
  tin2_chloride: "SnCl2",
  tin4_chloride: "SnCl4",
  gold3_chloride: "AuCl3",
  sodium_sulfite: "Na2SO3",
  sodium_nitrite: "NaNO2",
  sodium_hypochlorite: "NaClO",
  potassium_chlorate: "KClO3",
  sodium_thiosulfate: "Na2S2O3",
  potassium_thiocyanate: "KSCN",
  potassium_cyanide: "KCN",
  potassium_iodate: "KIO3",
  potassium_permanganate: "KMnO4",
  potassium_chromate: "K2CrO4",
  potassium_dichromate: "K2Cr2O7",
  silver_chromate: "Ag2CrO4",
  chromium3_oxide: "Cr2O3",
  manganese2_oxide: "MnO",
  tin2_sulfide: "SnS",
  manganese2_sulfide: "MnS",
  lead2_fluoride: "PbF2",
  lead4_fluoride: "PbF4",
  lead2_oxide: "PbO",
  lead2_sulfide: "PbS",
  lead2_chloride: "PbCl2",
  lead2_bromide: "PbBr2",
  lead2_iodide: "PbI2",
  lead2_nitrate: "Pb(NO3)2",
  lead2_sulfate: "PbSO4",
  lead2_carbonate: "PbCO3",
  lead2_chromate: "PbCrO4",
  chromium3_sulfide: "Cr2S3",
  chromium3_sulfate: "Cr2(SO4)3",
  manganese2_sulfate: "MnSO4",
  manganese2_carbonate: "MnCO3",
  tin2_oxide: "SnO",
  tin4_sulfide: "SnS2",
  tin2_sulfate: "SnSO4",
  sodium_permanganate: "NaMnO4",
  sodium_chromate: "Na2CrO4",
  sodium_dichromate: "Na2Cr2O7",
  barium_chromate: "BaCrO4",
  calcium_hypochlorite: "Ca(ClO)2",
  silver_cyanide: "AgCN",
  silver_thiocyanate: "AgSCN",
  lead4_oxide: "PbO2",
  tin4_oxide: "SnO2",
};

function randomFrom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

test("published data includes the lithium, nitride, and lead expansions", () => {
  assert.equal(ions.length, 46);
  assert.equal(compounds.length, 156);
  assert.equal(new Set(ions.map((item) => item.id)).size, 46);
  assert.equal(new Set(compounds.map((item) => item.id)).size, 156);
  assert.deepEqual(ions.find((item) => item.id === "lithium"), {
    id: "lithium", formula: "Li", charge: 1, name: "リチウムイオン", type: "cation",
    atomicity: "monatomic", requiresOxidationNumeral: false, enabled: true,
  });
  assert.equal(ions.find((item) => item.id === "nitride").charge, -3);
  assert.equal(ions.find((item) => item.id === "lead2").charge, 2);
  assert.equal(ions.find((item) => item.id === "lead4").charge, 4);
  for (const [id, formula] of [["lithium_nitride", "Li3N"], ["magnesium_nitride", "Mg3N2"], ["calcium_nitride", "Ca3N2"], ["barium_nitride", "Ba3N2"], ["zinc_nitride", "Zn3N2"], ["aluminum_nitride", "AlN"]]) {
    assert.equal(compounds.find((item) => item.id === id).formula, formula);
  }
  assert.equal(compounds.find((item) => item.id === "lead4_oxide").name, "酸化鉛(Ⅳ)");
  assert.equal(compounds.find((item) => item.id === "tin4_oxide").name, "酸化スズ(Ⅳ)");
});

test("advanced ions and verified compounds are enabled only for hard questions", () => {
  for (const id of advancedIonIds) {
    const ion = ions.find((item) => item.id === id);
    assert.equal(ion.enabled, true, id);
    assert.equal(ion.difficulty, "hard", id);
    assert.equal(ion.compoundPromptDisplay, "formulaAndName", id);
    assert.equal(ion.ionQuestionEnabled, false, id);
    assert.equal(itemAvailableAtDifficulty(ion, "normal"), false, id);
    assert.equal(itemAvailableAtDifficulty(ion, "hard"), true, id);
  }
  for (const [id, formula] of Object.entries(advancedCompoundFormulas)) {
    const compound = compounds.find((item) => item.id === id);
    assert.equal(compound.formula, formula, id);
    assert.equal(compound.enabled, true, id);
    assert.equal(compound.difficulty, "hard", id);
    assert.match(compound.referenceUrl, /^https:\/\/pubchem\.ncbi\.nlm\.nih\.gov\/compound\//, id);
  }
});

test("formula normalization accepts width and subscript variants without ignoring case", () => {
  assert.equal(normalizeFormula(" ＣａＣｌ₂ "), "CaCl2");
  assert.equal(normalizeFormula("Ａｌ₂（ＳＯ₄）₃"), "Al2(SO4)3");
  assert.equal(normalizeFormula("N³⁻"), "N3-");
  assert.notEqual(normalizeFormula("Nacl"), normalizeFormula("NaCl"));
  assert.notEqual(normalizeFormula("CaOH2"), normalizeFormula("Ca(OH)2"));
});

test("ion input preview preserves formula subscripts beside a charge", () => {
  assert.equal(ionInputHtml("NO3-", ions), "NO<sub>3</sub><sup>－</sup>");
  assert.equal(ionInputHtml("NH4+", ions), "NH<sub>4</sub><sup>＋</sup>");
  assert.equal(ionInputHtml("SO42-", ions), "SO<sub>4</sub><sup>2－</sup>");
  assert.equal(ionInputHtml("Ca2+", ions), "Ca<sup>2＋</sup>");
  assert.equal(ionInputHtml("N3-", ions), "N<sup>3－</sup>");
});

test("Japanese name normalization accepts Roman numeral and parenthesis variants", () => {
  assert.equal(normalizeName("硫酸銅（Ⅱ）"), normalizeName("硫酸銅(II)"));
  assert.equal(normalizeName("酸化鉄（Ⅲ）"), "酸化鉄(III)");
});

test("acetate accepts the cation-first alternative and gives the displayed-form recommendation", () => {
  const lithium = compounds.find((item) => item.id === "lithium_acetate");
  const specification = { type: "formula", canonical: lithium.formula, accepted: lithium.acceptedFormulaVariants };
  assert.equal(evaluateAnswer("CH3COOLi", specification).matchedAnswerKind, "canonical");
  const alternative = evaluateAnswer("LiCH3COO", specification);
  assert.equal(alternative.correct, true);
  assert.equal(alternative.matchedAnswerKind, "acceptedAlternative");
  assert.match(alternative.note, /CH₃COOLi/);
  assert.equal(evaluateAnswer("LiC2H3O2", specification).correct, false);
});

test("neutral formula generator uses the simplest whole-number ratio", () => {
  assert.deepEqual(neutralFormula(ionById.get("aluminum"), ionById.get("oxide")), {
    formula: "Al2O3", cationCount: 2, anionCount: 3, totalCharge: 6,
  });
  assert.equal(neutralFormula(ionById.get("lithium"), ionById.get("nitride")).formula, "Li3N");
  assert.equal(neutralFormula(ionById.get("calcium"), ionById.get("nitride")).formula, "Ca3N2");
  assert.equal(neutralFormula(ionById.get("ammonium"), ionById.get("sulfate")).formula, "(NH4)2SO4");
});

test("categories are derived from ion data with variable oxidation state taking priority", () => {
  assert.equal(ionCategory(ionById.get("lithium")), "ionSimple");
  assert.equal(ionCategory(ionById.get("nitride")), "ionSimple");
  assert.equal(ionCategory(ionById.get("sulfate")), "ionPolyatomic");
  assert.equal(ionCategory(ionById.get("iron3")), "ionVariableOx");
  assert.equal(compoundCategory(compounds.find((item) => item.id === "aluminum_nitride"), ionById), "simple11");
  assert.equal(compoundCategory(compounds.find((item) => item.id === "lithium_nitride"), ionById), "simpleRatio");
  assert.equal(compoundCategory(compounds.find((item) => item.id === "lithium_hydroxide"), ionById), "polyatomic");
});

test("published data passes validation and reports only intentional acetate warnings", () => {
  const result = validateData(ions, compounds, settings);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 3);
  assert.ok(result.warnings.every((warning) => warning.includes("許容別表記登録済み")));
});

test("Fe(OH)3 is absent and iron(III) hydroxide is name-only in both ion prompt styles", () => {
  assert.equal(JSON.stringify({ ions, compounds }).includes("Fe(OH)3"), false);
  assert.equal(JSON.stringify({ ions, compounds }).includes("Fe(OH)₃"), false);
  const item = compounds.find((compound) => compound.id === "iron3_hydroxide");
  assert.equal(item.formula, null);
  assert.deepEqual(itemVariants("ionFormula", item), ["ionsToName"]);
  assert.deepEqual(itemVariants("ionName", item), ["ionNamesToName"]);
  assert.deepEqual(itemVariants("random", item), ["ionsToName", "ionNamesToName", "mixedIonsToName"]);
  const invalid = structuredClone(compounds);
  invalid.find((compound) => compound.id === "iron3_hydroxide").formula = "Fe(OH)3";
  const result = validateData(ions, invalid, settings);
  assert.ok(result.errors.some((error) => error.includes("禁止")));
});

test("normal and hard category ratios allocate their stated ten-question targets", () => {
  assert.deepEqual(allocateCounts(settings.categoryWeights.ion.normal, 10, {}, randomFrom(1)), { ionSimple: 6, ionPolyatomic: 3, ionVariableOx: 1 });
  assert.deepEqual(allocateCounts(settings.categoryWeights.ion.hard, 10, {}, randomFrom(2)), { ionSimple: 2, ionPolyatomic: 6, ionVariableOx: 2 });
  assert.deepEqual(allocateCounts(settings.categoryWeights.compound.normal, 10, {}, randomFrom(3)), { simple11: 3, simpleRatio: 4, polyatomic: 2, variableOx: 1 });
  assert.deepEqual(allocateCounts(settings.categoryWeights.compound.hard, 10, {}, randomFrom(4)), { simple11: 0, simpleRatio: 1, polyatomic: 5, variableOx: 4 });
  const hardSet = buildTenQuestionSet({ practiceType: "compound", difficulty: "hard", ions, compounds, settings, random: randomFrom(41) });
  const actual = hardSet.questions.reduce((counts, question) => ({ ...counts, [question.category]: (counts[question.category] ?? 0) + 1 }), {});
  assert.deepEqual({ simple11: 0, simpleRatio: 0, polyatomic: 0, variableOx: 0, ...actual }, { simple11: 0, simpleRatio: 1, polyatomic: 5, variableOx: 4 });
});

test("advanced ions stay out of the ion game and their compounds are hard-only", () => {
  const normalIons = buildEndlessRound({ practiceType: "ion", difficulty: "normal", ions, compounds, settings, random: randomFrom(31) });
  const hardIons = buildEndlessRound({ practiceType: "ion", difficulty: "hard", ions, compounds, settings, random: randomFrom(32) });
  const normalCompounds = buildEndlessRound({ practiceType: "compound", difficulty: "normal", ions, compounds, settings, random: randomFrom(33) });
  let selectionState = normalizeCompoundSelectionState();
  const hardCompoundIds = new Set();
  for (let seed = 34; seed < 54; seed += 1) {
    const hardCompounds = buildEndlessRound({ practiceType: "compound", difficulty: "hard", ions, compounds, settings, selectionState, random: randomFrom(seed) });
    for (const question of hardCompounds.questions) {
      hardCompoundIds.add(question.itemId);
      selectionState = recordCompoundSelectionPresentation(selectionState, question);
    }
  }
  const ids = (round) => new Set(round.questions.map((question) => question.itemId));
  for (const id of advancedIonIds) {
    assert.equal(ids(normalIons).has(id), false, id);
    assert.equal(ids(hardIons).has(id), false, id);
  }
  for (const id of Object.keys(advancedCompoundFormulas)) {
    assert.equal(ids(normalCompounds).has(id), false, id);
    assert.equal(hardCompoundIds.has(id), true, id);
  }
});

test("zero-weight categories are completely excluded", () => {
  const compoundSet = buildTenQuestionSet({ practiceType: "ionFormula", difficulty: "hard", ions, compounds, settings, random: randomFrom(5) });
  assert.ok(compoundSet.questions.every((question) => question.category !== "simple11"));
});

test("all four problem types produce complete unique sets across both difficulties", () => {
  for (const practiceType of PRACTICE_TYPES) {
    for (const difficulty of ["normal", "hard"]) {
      for (let seed = 1; seed <= 30; seed += 1) {
        const result = buildTenQuestionSet({ practiceType, difficulty, ions, compounds, settings, random: randomFrom(seed) });
        assert.equal(result.questions.length, 10, `${practiceType}.${difficulty}, seed=${seed}`);
        assert.equal(new Set(result.questions.map((question) => question.itemId)).size, 10, `${practiceType}.${difficulty}, seed=${seed}`);
        assert.ok(result.questions.every((question) => question.practiceType === practiceType));
      }
    }
  }
});

test("direct modes preserve their prompt type and random uses formula, name, and mixed skills", () => {
  const formula = buildTenQuestionSet({ practiceType: "ionFormula", difficulty: "normal", ions, compounds, settings, random: randomFrom(8) });
  assert.deepEqual([...new Set(formula.questions.map((question) => question.variant))].sort(), ["ionsToFormula", "ionsToName"]);
  const named = buildTenQuestionSet({ practiceType: "ionName", difficulty: "normal", ions, compounds, settings, random: randomFrom(9) });
  assert.deepEqual([...new Set(named.questions.map((question) => question.variant))].sort(), ["ionNamesToFormula", "ionNamesToName"]);
  const random = buildTenQuestionSet({ practiceType: "random", difficulty: "normal", ions, compounds, settings, random: randomFrom(10) });
  assert.deepEqual([...new Set(random.questions.map((question) => question.variant))].sort(), ["ionNamesToFormula", "ionNamesToName", "ionsToFormula", "ionsToName", "mixedIonsToFormula", "mixedIonsToName"]);
  assert.equal(answerFor(random.questions.find((question) => question.variant === "ionsToFormula"), compounds.find((item) => item.id === random.questions.find((question) => question.variant === "ionsToFormula").itemId)).type, "formula");
});

test("compound toggles make formula, name and mixed prompts equally eligible", () => {
  const options = { promptFormula: true, promptName: true, answerFormula: true, answerName: false, answerBoth: false };
  assert.deepEqual(compoundVariantsForOptions(options), ["ionsToFormula", "ionNamesToFormula", "mixedIonsToFormula"]);
  const result = buildTenQuestionSet({ practiceType: "compound", difficulty: "normal", ions, compounds, settings, compoundOptions: options, random: randomFrom(75) });
  assert.equal(result.questions.length, 10);
  assert.deepEqual([...new Set(result.questions.map((question) => question.variant))].sort(), ["ionNamesToFormula", "ionsToFormula", "mixedIonsToFormula"]);
  assert.deepEqual([...new Set(result.questions.filter((question) => question.variant.startsWith("mixed")).map((question) => question.promptStyle))].sort(), ["formulaName", "nameFormula"]);
});

test("compound answer presets preserve prompt settings and map to valid answer modes", () => {
  const base = { promptFormula: false, promptName: true, answerFormula: true, answerName: true, answerBoth: false };
  assert.equal(compoundAnswerPresetForOptions(base), "random");
  assert.deepEqual(compoundOptionsForAnswerPreset("formula", base), {
    promptFormula: false, promptName: true, answerFormula: true, answerName: false, answerBoth: false,
  });
  assert.equal(compoundAnswerPresetForOptions(compoundOptionsForAnswerPreset("name", base)), "name");
  assert.equal(compoundAnswerPresetForOptions(compoundOptionsForAnswerPreset("both", base)), "both");
});

test("compound companion answers use curated data and preserve formula exclusions", () => {
  const calciumChloride = compounds.find((item) => item.id === "calcium_chloride");
  assert.deepEqual(companionAnswerFor({ domain: "compound", variant: "ionsToFormula" }, calciumChloride), {
    type: "name", label: "化合物名", canonical: "塩化カルシウム",
  });
  assert.deepEqual(companionAnswerFor({ domain: "compound", variant: "ionsToName" }, calciumChloride), {
    type: "formula", label: "組成式", canonical: "CaCl2",
  });
  const ironHydroxide = compounds.find((item) => item.id === "iron3_hydroxide");
  assert.equal(companionAnswerFor({ domain: "compound", variant: "ionsToName" }, ironHydroxide), null);
  assert.equal(companionAnswerFor({ domain: "compound", variant: "ionsToBoth" }, calciumChloride), null);
  assert.equal(companionAnswerFor({ domain: "ion", variant: "ionNameToFormula" }, ions[0]), null);
});

test("formula-and-name answer is a two-part specification and does not offer Fe(OH)3", () => {
  const result = buildTenQuestionSet({
    practiceType: "compound", difficulty: "normal", ions, compounds, settings,
    compoundOptions: { promptFormula: true, promptName: false, answerFormula: false, answerName: false, answerBoth: true },
    random: randomFrom(76),
  });
  assert.ok(result.questions.every((question) => question.variant === "ionsToBoth"));
  assert.ok(!result.questions.some((question) => question.itemId === "iron3_hydroxide"));
  const item = compounds.find((compound) => compound.id === result.questions[0].itemId);
  assert.equal(answerFor(result.questions[0], item).type, "both");
});

test("ion charge is separate from formula subscripts and must come from charge keys", () => {
  const nitrate = ions.find((ion) => ion.id === "nitrate");
  const nitride = ions.find((ion) => ion.id === "nitride");
  const nitrateEntry = createFormulaEntry();
  nitrateEntry.tokens = ["N", "O", "3"];
  nitrateEntry.cursor = 3;
  nitrateEntry.charge = { magnitude: 1, sign: "-", source: "chargeButton" };
  assert.equal(evaluateIonEntry(nitrateEntry, nitrate).correct, true);
  assert.equal(evaluateIonEntry(nitrateEntry, nitride).correct, false);
  const nitrideEntry = createFormulaEntry();
  nitrideEntry.tokens = ["N"];
  nitrideEntry.cursor = 1;
  nitrideEntry.charge = { magnitude: 3, sign: "-", source: "chargeButton" };
  assert.equal(evaluateIonEntry(nitrideEntry, nitride).correct, true);
  nitrideEntry.charge.source = "typed";
  assert.equal(evaluateIonEntry(nitrideEntry, nitride).correct, false);
});

test("compound prompts use balanced ion order and mixed prompts use exactly one name", () => {
  const mixedStyles = new Set();
  for (let seed = 1; seed <= 30; seed += 1) {
    const result = buildTenQuestionSet({ practiceType: "random", difficulty: "normal", ions, compounds, settings, random: randomFrom(seed) });
    const orders = result.questions.reduce((counts, question) => ({ ...counts, [question.promptOrder]: (counts[question.promptOrder] ?? 0) + 1 }), {});
    assert.deepEqual(orders, { cationFirst: 5, anionFirst: 5 });
    for (const question of result.questions) {
      if (question.variant.startsWith("mixed")) mixedStyles.add(question.promptStyle);
    }
  }
  assert.deepEqual([...mixedStyles].sort(), ["formulaName", "nameFormula"]);

  for (const difficulty of ["normal", "hard"]) {
    const round = buildEndlessRound({ practiceType: "compound", difficulty, ions, compounds, settings, random: randomFrom(difficulty === "normal" ? 71 : 72) });
    const counts = round.questions.reduce((result, question) => ({ ...result, [question.promptOrder]: (result[question.promptOrder] ?? 0) + 1 }), {});
    assert.ok(Math.abs((counts.cationFirst ?? 0) - (counts.anionFirst ?? 0)) <= 1, difficulty);
  }
});

test("ten-question compound sets minimize ion reuse across display variants", () => {
  const compoundById = new Map(compounds.map((item) => [item.id, item]));
  for (const practiceType of ["ionFormula", "ionName", "random"]) {
    for (const difficulty of ["normal", "hard"]) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const result = buildTenQuestionSet({ practiceType, difficulty, ions, compounds, settings, random: randomFrom(seed) });
        const ionUse = {};
        for (const question of result.questions) {
          const item = compoundById.get(question.itemId);
          for (const ionId of [item.cation, item.anion]) ionUse[ionId] = (ionUse[ionId] ?? 0) + 1;
        }
        assert.ok(Math.max(...Object.values(ionUse)) <= 2, `${practiceType}.${difficulty}, seed=${seed}`);
      }
    }
  }
});

test("weak mode prefers a lower first-try success rate while retaining unique items", () => {
  const history = {};
  const weakItem = compounds.find((item) => item.id === "calcium_chloride");
  for (const variant of itemVariants("ionFormula", weakItem)) {
    history[historyKey("compound", weakItem.id, variant)] = {
      score: 8, attempts: 8, scoredAttempts: 8, firstTryCorrects: 0, lastSeenAt: 1,
    };
  }
  const result = buildWeakQuestionSet({ practiceType: "ionFormula", difficulty: "normal", ions, compounds, settings, history, random: randomFrom(31) });
  assert.equal(result.questions.length, 10);
  assert.equal(result.questions[0].itemId, "calcium_chloride");
  assert.equal(new Set(result.questions.map((question) => question.itemId)).size, 10);
});

test("normal sessions do not force the same weak material into question one", () => {
  const constrained = structuredClone(settings);
  constrained.categoryWeights.compound.normal = { simple11: 1, simpleRatio: 0, polyatomic: 0, variableOx: 0 };
  const weakItem = compounds.find((item) => item.id === "sodium_chloride");
  const history = {};
  for (const variant of itemVariants("ionFormula", weakItem)) {
    history[historyKey("compound", weakItem.id, variant)] = { score: 8, scoredAttempts: 8, firstTryCorrects: 0, lastSeenAt: 1 };
  }
  const firstItems = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    const result = buildTenQuestionSet({ practiceType: "ionFormula", difficulty: "normal", ions, compounds, settings: constrained, history, random: randomFrom(seed) });
    firstItems.add(result.questions[0].itemId);
  }
  assert.ok(firstItems.size > 1);
  assert.ok([...firstItems].some((itemId) => itemId !== weakItem.id));
});

test("recently shown compound materials are cooled down for twenty presentations", () => {
  const recent = recordRecentPresentation([], { domain: "compound", itemId: "sodium_chloride" });
  assert.deepEqual(recent, ["compound:sodium_chloride"]);
  let selectionState = normalizeCompoundSelectionState();
  selectionState = recordCompoundSelectionPresentation(selectionState, {
    domain: "compound", itemId: "sodium_chloride", difficulty: "normal",
  });
  const result = buildTenQuestionSet({
    practiceType: "ionFormula", difficulty: "normal", ions, compounds, settings,
    recentPresentations: recent, selectionState, random: randomFrom(83),
  });
  assert.ok(!result.questions.some((question) => question.itemId === "sodium_chloride"));
  for (const itemId of ["lithium_chloride", "potassium_chloride", "calcium_chloride", "magnesium_chloride", "barium_chloride", "zinc_chloride", "silver_chloride", "aluminum_chloride", "copper2_chloride", "iron2_chloride", "iron3_chloride", "lead2_chloride", "chromium3_chloride", "tin2_chloride", "tin4_chloride", "gold3_chloride", "sodium_bromide", "potassium_bromide", "silver_bromide"]) {
    selectionState = recordCompoundSelectionPresentation(selectionState, {
      domain: "compound", itemId, difficulty: "normal",
    });
  }
  assert.equal(selectionState.recentCompoundItems.length, 20);
});

test("compound fairness rotates each category before repeating a material", () => {
  let selectionState = normalizeCompoundSelectionState();
  for (let seed = 1; seed <= 40; seed += 1) {
    const result = buildTenQuestionSet({
      practiceType: "compound", difficulty: "normal", ions, compounds, settings, selectionState, random: randomFrom(seed),
    });
    for (const question of result.questions) selectionState = recordCompoundSelectionPresentation(selectionState, question);
  }
  const counts = selectionState.scopes.normal.shownByItem;
  for (const category of ["simple11", "simpleRatio", "polyatomic", "variableOx"]) {
    const values = compounds
      .filter((item) => item.enabled && itemAvailableAtDifficulty(item, "normal") && compoundCategory(item, ionById) === category)
      .map((item) => counts[item.id] ?? 0);
    assert.ok(Math.max(...values) - Math.min(...values) <= 1, category);
  }
});

test("normal compound sets reserve exactly two actual weak skills", () => {
  const history = {};
  const weakIds = ["calcium_chloride", "barium_nitride", "ammonium_nitrate"];
  for (const itemId of weakIds) {
    const item = compounds.find((compound) => compound.id === itemId);
    for (const variant of itemVariants("compound", item)) {
      history[historyKey("compound", itemId, variant)] = { score: 5, scoredAttempts: 4, firstTryCorrects: 0, lastSeenAt: 1 };
    }
  }
  const mastered = compounds.find((compound) => compound.id === "sodium_chloride");
  for (const variant of itemVariants("compound", mastered)) {
    history[historyKey("compound", mastered.id, variant)] = { score: -5, scoredAttempts: 4, firstTryCorrects: 4, lastSeenAt: 1 };
  }
  const result = buildTenQuestionSet({
    practiceType: "compound", difficulty: "normal", ions, compounds, settings, history, random: randomFrom(91),
  });
  const reviews = result.questions.filter((question) => question.isWeakReview);
  assert.equal(reviews.length, 2);
  assert.equal(new Set(reviews.map((question) => question.itemId)).size, 2);
  assert.ok(reviews.every((question) => weakIds.includes(question.itemId)));
  assert.ok(!reviews.some((question) => question.itemId === mastered.id));
});

test("mastered history does not consume a weak slot and one weak item yields one review", () => {
  const history = {};
  const weak = compounds.find((compound) => compound.id === "calcium_chloride");
  for (const variant of itemVariants("compound", weak)) {
    history[historyKey("compound", weak.id, variant)] = { score: 4, scoredAttempts: 2, firstTryCorrects: 0, lastSeenAt: 1 };
  }
  const mastered = compounds.find((compound) => compound.id === "sodium_chloride");
  for (const variant of itemVariants("compound", mastered)) {
    history[historyKey("compound", mastered.id, variant)] = { score: 0, scoredAttempts: 5, firstTryCorrects: 5, lastSeenAt: 1 };
  }
  const result = buildTenQuestionSet({
    practiceType: "compound", difficulty: "normal", ions, compounds, settings, history, random: randomFrom(92),
  });
  const reviews = result.questions.filter((question) => question.isWeakReview);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].itemId, weak.id);
});

test("endless compound batches are unique, balanced, and omit disabled material", () => {
  const disabledIons = structuredClone(ions);
  disabledIons.find((ion) => ion.id === "lithium").enabled = false;
  const ionResult = buildEndlessRound({ practiceType: "ion", difficulty: "hard", ions: disabledIons, compounds, settings, random: randomFrom(20) });
  assert.equal(new Set(ionResult.questions.map((question) => question.itemId)).size, ionResult.questions.length);
  assert.ok(!ionResult.questions.some((question) => question.itemId === "lithium"));

  const disabledCompounds = structuredClone(compounds);
  disabledCompounds.find((compound) => compound.id === "calcium_chloride").enabled = false;
  const compoundResult = buildEndlessRound({ practiceType: "random", difficulty: "hard", ions, compounds: disabledCompounds, settings, random: randomFrom(21) });
  assert.equal(compoundResult.questions.length, 10);
  assert.equal(new Set(compoundResult.questions.map((question) => question.itemId)).size, 10);
  assert.ok(!compoundResult.questions.some((question) => question.itemId === "calcium_chloride"));
  assert.equal(compoundResult.questions.filter((question) => question.isWeakReview).length, 0);
});

test("weak history is shared by actual skill, not by the random menu choice", () => {
  const history = {};
  const question = { domain: "compound", itemId: "calcium_chloride", practiceType: "random", variant: "ionNamesToFormula", skill: "ionNamesToFormula" };
  recordHistory(history, question, { passed: false, usedHint: false, hadWrong: true }, 1);
  assert.equal(history[historyKey(question)].score, 1);
  assert.equal(history[historyKey(question)].scoredAttempts, 1);
  assert.equal(history[historyKey(question)].firstTryCorrects, 0);
  assert.equal(history[historyKey("compound", "calcium_chloride", "ionsToFormula")], undefined);
  recordHistory(history, { ...question, practiceType: "ionName" }, { passed: false, usedHint: false, hadWrong: false }, 2);
  assert.equal(history[historyKey(question)].score, 0);
  assert.equal(history[historyKey(question)].scoredAttempts, 2);
  assert.equal(history[historyKey(question)].firstTryCorrects, 1);
});

test("contextual hints prioritize ion order, parentheses, and oxidation numerals", () => {
  const calciumChloride = compounds.find((item) => item.id === "calcium_chloride");
  const calciumHydroxide = compounds.find((item) => item.id === "calcium_hydroxide");
  const ironChloride = compounds.find((item) => item.id === "iron3_chloride");
  const formulaQuestion = { domain: "compound", itemId: calciumChloride.id, variant: "ionsToFormula", promptOrder: "anionFirst" };
  assert.match(hintFor(formulaQuestion, calciumChloride, ionById), /表示は陰イオンが先/);
  assert.match(hintFor({ ...formulaQuestion, promptOrder: "cationFirst" }, calciumChloride, ionById, "Cl2Ca"), /陽イオン成分を先/);
  assert.match(hintFor({ ...formulaQuestion, itemId: calciumHydroxide.id }, calciumHydroxide, ionById, "CaOH2"), /括弧/);
  assert.match(hintFor({ domain: "compound", itemId: ironChloride.id, variant: "ionsToName" }, ironChloride, ionById), /酸化数/);
});

test("weak review groups positive-score skills by one learning item", () => {
  const history = {
    [historyKey("compound", "calcium_chloride", "ionsToFormula")]: { score: 2, scoredAttempts: 3, firstTryCorrects: 0, lastSeenAt: 10 },
    [historyKey("compound", "calcium_chloride", "ionsToName")]: { score: 1, scoredAttempts: 2, firstTryCorrects: 1, lastSeenAt: 20 },
    [historyKey("ion", "sodium", "ionNameToFormula")]: { score: -1, scoredAttempts: 1, firstTryCorrects: 1, lastSeenAt: 30 },
  };
  const entries = weakHistoryItems(history, ions, compounds);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].itemId, "calcium_chloride");
  assert.equal(entries[0].score, 3);
  assert.deepEqual(entries[0].skills, ["ionsToFormula", "ionsToName"]);
  assert.equal(entries[0].rate, 1 / 5);
});

test("removing weak review cards preserves non-weak and unrelated history", () => {
  const formulaKey = historyKey("compound", "calcium_chloride", "ionsToFormula");
  const nameKey = historyKey("compound", "calcium_chloride", "ionsToName");
  const masteredKey = historyKey("compound", "calcium_chloride", "ionNamesToFormula");
  const unrelatedKey = historyKey("ion", "sodium", "ionNameToFormula");
  const history = {
    [formulaKey]: { score: 2 },
    [nameKey]: { score: 1 },
    [masteredKey]: { score: -2 },
    [unrelatedKey]: { score: 3 },
  };
  const entries = weakHistoryItems(history, ions, compounds);
  const remaining = removeWeakHistoryItems(history, [entries.find((entry) => entry.itemId === "calcium_chloride")]);
  assert.equal(remaining[formulaKey], undefined);
  assert.equal(remaining[nameKey], undefined);
  assert.deepEqual(remaining[masteredKey], { score: -2 });
  assert.deepEqual(remaining[unrelatedKey], { score: 3 });
});

test("all app-shell assets use repository-relative paths and exist", async () => {
  const htmlFiles = ["../index.html", "../admin.html", "../soundtest.html"];
  for (const htmlFile of htmlFiles) {
    const html = await readFile(new URL(htmlFile, import.meta.url), "utf8");
    const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((path) => !path.startsWith("#"));
    assert.ok(paths.every((path) => !path.startsWith("/")), `${htmlFile} contains a root-relative path`);
    for (const path of paths) await access(new URL(`../${path.replace(/^\.\//, "").split("?")[0]}`, import.meta.url));
  }
  const manifest = await load("../manifest.webmanifest");
  for (const icon of manifest.icons) await access(new URL(`../${icon.src}`, import.meta.url));
});

test("public home keeps prompt toggles and offers four answer presets without descriptions", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<body class="app-current" data-build="current">/);
  assert.match(html, /data-compound-toggle="promptFormula"[^>]*>イオン式/);
  assert.match(html, /data-compound-toggle="promptName"[^>]*>イオン名/);
  const answerLabels = [...html.matchAll(/data-compound-preset="[^"]+"[^>]*>([^<]+)/g)].map((match) => match[1]);
  assert.deepEqual(answerLabels, ["化合物名", "組成式", "式 or 名", "式 ＆ 名"]);
  assert.match(html, /id="clear-weak-review"[^>]*>全削除/);
  assert.doesNotMatch(html, /compound-preset-description|出題の見せ方|答え方/);
  assert.match(html, /イオンモード/);
  assert.match(html, /化合物モード/);
  assert.match(html, /id="active-game-description"/);
  assert.match(html, /id="feedback-companion-row"/);
  assert.match(html, /id="feedback-companion-toggle" class="companion-reveal"/);
});
