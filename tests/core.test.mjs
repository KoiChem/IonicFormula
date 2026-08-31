import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import {
  PRACTICE_TYPES,
  allocateCounts,
  answerFor,
  buildEndlessRound,
  buildTenQuestionSet,
  compoundCategory,
  evaluateAnswer,
  historyKey,
  ionCategory,
  itemVariants,
  neutralFormula,
  normalizeFormula,
  normalizeName,
  recordHistory,
  validateData,
} from "../js/core.js";

const load = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const ions = await load("../data/ions.json");
const compounds = await load("../data/compounds.json");
const settings = await load("../data/difficulty.json");
const ionById = new Map(ions.map((ion) => [ion.id, ion]));

function randomFrom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

test("published data includes the lithium and nitride expansion", () => {
  assert.equal(ions.length, 31);
  assert.equal(compounds.length, 111);
  assert.equal(new Set(ions.map((item) => item.id)).size, 31);
  assert.equal(new Set(compounds.map((item) => item.id)).size, 111);
  assert.deepEqual(ions.find((item) => item.id === "lithium"), {
    id: "lithium", formula: "Li", charge: 1, name: "リチウムイオン", type: "cation",
    atomicity: "monatomic", requiresOxidationNumeral: false, enabled: true,
  });
  assert.equal(ions.find((item) => item.id === "nitride").charge, -3);
  for (const [id, formula] of [["lithium_nitride", "Li3N"], ["magnesium_nitride", "Mg3N2"], ["calcium_nitride", "Ca3N2"], ["barium_nitride", "Ba3N2"], ["zinc_nitride", "Zn3N2"], ["aluminum_nitride", "AlN"]]) {
    assert.equal(compounds.find((item) => item.id === id).formula, formula);
  }
});

test("complex chromium and manganese content is disabled by default", () => {
  for (const id of ["permanganate", "chromate", "dichromate"]) assert.equal(ions.find((item) => item.id === id).enabled, false);
  for (const id of ["potassium_permanganate", "potassium_chromate", "potassium_dichromate"]) assert.equal(compounds.find((item) => item.id === id).enabled, false);
});

test("formula normalization accepts width and subscript variants without ignoring case", () => {
  assert.equal(normalizeFormula(" ＣａＣｌ₂ "), "CaCl2");
  assert.equal(normalizeFormula("Ａｌ₂（ＳＯ₄）₃"), "Al2(SO4)3");
  assert.equal(normalizeFormula("N³⁻"), "N3-");
  assert.notEqual(normalizeFormula("Nacl"), normalizeFormula("NaCl"));
  assert.notEqual(normalizeFormula("CaOH2"), normalizeFormula("Ca(OH)2"));
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
  assert.deepEqual(itemVariants("random", item), ["ionsToName", "ionNamesToName"]);
  const invalid = structuredClone(compounds);
  invalid.find((compound) => compound.id === "iron3_hydroxide").formula = "Fe(OH)3";
  const result = validateData(ions, invalid, settings);
  assert.ok(result.errors.some((error) => error.includes("禁止")));
});

test("normal and hard category ratios allocate their stated ten-question targets", () => {
  assert.deepEqual(allocateCounts(settings.categoryWeights.ion.normal, 10, {}, randomFrom(1)), { ionSimple: 6, ionPolyatomic: 3, ionVariableOx: 1 });
  assert.deepEqual(allocateCounts(settings.categoryWeights.ion.hard, 10, {}, randomFrom(2)), { ionSimple: 2, ionPolyatomic: 6, ionVariableOx: 2 });
  assert.deepEqual(allocateCounts(settings.categoryWeights.compound.normal, 10, {}, randomFrom(3)), { simple11: 3, simpleRatio: 4, polyatomic: 2, variableOx: 1 });
  assert.deepEqual(allocateCounts(settings.categoryWeights.compound.hard, 10, {}, randomFrom(4)), { simple11: 0, simpleRatio: 3, polyatomic: 5, variableOx: 2 });
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

test("direct modes balance answer forms and random uses all four actual skills", () => {
  const formula = buildTenQuestionSet({ practiceType: "ionFormula", difficulty: "normal", ions, compounds, settings, random: randomFrom(8) });
  assert.deepEqual([...new Set(formula.questions.map((question) => question.variant))].sort(), ["ionsToFormula", "ionsToName"]);
  const named = buildTenQuestionSet({ practiceType: "ionName", difficulty: "normal", ions, compounds, settings, random: randomFrom(9) });
  assert.deepEqual([...new Set(named.questions.map((question) => question.variant))].sort(), ["ionNamesToFormula", "ionNamesToName"]);
  const random = buildTenQuestionSet({ practiceType: "random", difficulty: "normal", ions, compounds, settings, random: randomFrom(10) });
  assert.deepEqual([...new Set(random.questions.map((question) => question.variant))].sort(), ["ionNamesToFormula", "ionNamesToName", "ionsToFormula", "ionsToName"]);
  assert.equal(answerFor(random.questions.find((question) => question.variant === "ionsToFormula"), compounds.find((item) => item.id === random.questions.find((question) => question.variant === "ionsToFormula").itemId)).type, "formula");
});

test("endless rounds visit all eligible items exactly once and omit disabled material", () => {
  for (const [practiceType, difficulty] of [["ion", "hard"], ["random", "hard"]]) {
    const result = buildEndlessRound({ practiceType, difficulty, ions, compounds, settings, random: randomFrom(20) });
    assert.equal(new Set(result.questions.map((question) => question.itemId)).size, result.questions.length);
    assert.ok(!result.questions.some((question) => ["permanganate", "chromate", "dichromate", "potassium_permanganate", "potassium_chromate", "potassium_dichromate"].includes(question.itemId)));
  }
});

test("weak history is shared by actual skill, not by the random menu choice", () => {
  const history = {};
  const question = { domain: "compound", itemId: "calcium_chloride", practiceType: "random", variant: "ionNamesToFormula", skill: "ionNamesToFormula" };
  recordHistory(history, question, { passed: false, usedHint: false, hadWrong: true }, 1);
  assert.equal(history[historyKey(question)].score, 1);
  assert.equal(history[historyKey("compound", "calcium_chloride", "ionsToFormula")], undefined);
  recordHistory(history, { ...question, practiceType: "ionName" }, { passed: false, usedHint: false, hadWrong: false }, 2);
  assert.equal(history[historyKey(question)].score, 0);
});

test("all app-shell assets use repository-relative paths and exist", async () => {
  const htmlFiles = ["../index.html", "../admin.html"];
  for (const htmlFile of htmlFiles) {
    const html = await readFile(new URL(htmlFile, import.meta.url), "utf8");
    const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((path) => !path.startsWith("#"));
    assert.ok(paths.every((path) => !path.startsWith("/")), `${htmlFile} contains a root-relative path`);
    for (const path of paths) await access(new URL(`../${path.replace(/^\.\//, "")}`, import.meta.url));
  }
  const manifest = await load("../manifest.webmanifest");
  for (const icon of manifest.icons) await access(new URL(`../${icon.src}`, import.meta.url));
});
