import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import {
  allocateCounts,
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

test("attached source data was imported completely", () => {
  assert.equal(ions.length, 29);
  assert.equal(compounds.length, 93);
  assert.equal(new Set(ions.map((item) => item.id)).size, 29);
  assert.equal(new Set(compounds.map((item) => item.id)).size, 93);
});

test("formula normalization accepts width and subscript variants without ignoring case", () => {
  assert.equal(normalizeFormula(" ＣａＣｌ₂ "), "CaCl2");
  assert.equal(normalizeFormula("Ａｌ₂（ＳＯ₄）₃"), "Al2(SO4)3");
  assert.equal(normalizeFormula("Ca²⁺"), "Ca2+");
  assert.notEqual(normalizeFormula("Nacl"), normalizeFormula("NaCl"));
  assert.notEqual(normalizeFormula("CaOH2"), normalizeFormula("Ca(OH)2"));
});

test("Japanese name normalization accepts Roman numeral and parenthesis variants", () => {
  assert.equal(normalizeName("硫酸銅（Ⅱ）"), normalizeName("硫酸銅(II)"));
  assert.equal(normalizeName("酸化鉄（Ⅲ）"), "酸化鉄(III)");
});

test("acetate stored and cation-first formulas are both correct, but only registered aliases", () => {
  const sodium = compounds.find((item) => item.id === "sodium_acetate");
  const specification = { type: "formula", canonical: sodium.formula, accepted: sodium.acceptedFormulaVariants };
  assert.deepEqual(evaluateAnswer("CH3COONa", specification).matchedAnswerKind, "canonical");
  const alternative = evaluateAnswer("NaCH3COO", specification);
  assert.equal(alternative.correct, true);
  assert.equal(alternative.matchedAnswerKind, "acceptedAlternative");
  assert.match(alternative.note, /CH₃COONa/);
  assert.equal(evaluateAnswer("NaC2H3O2", specification).correct, false);
});

test("neutral formula generator uses the simplest whole-number ratio", () => {
  assert.deepEqual(neutralFormula(ionById.get("aluminum"), ionById.get("oxide")), {
    formula: "Al2O3", cationCount: 2, anionCount: 3, totalCharge: 6,
  });
  assert.equal(neutralFormula(ionById.get("calcium"), ionById.get("hydroxide")).formula, "Ca(OH)2");
  assert.equal(neutralFormula(ionById.get("ammonium"), ionById.get("sulfate")).formula, "(NH4)2SO4");
});

test("categories are derived from ion data with variable oxidation state taking priority", () => {
  assert.equal(ionCategory(ionById.get("sodium")), "ionSimple");
  assert.equal(ionCategory(ionById.get("sulfate")), "ionPolyatomic");
  assert.equal(ionCategory(ionById.get("iron3")), "ionVariableOx");
  assert.equal(compoundCategory(compounds.find((item) => item.id === "sodium_chloride"), ionById), "simple11");
  assert.equal(compoundCategory(compounds.find((item) => item.id === "calcium_chloride"), ionById), "simpleRatio");
  assert.equal(compoundCategory(compounds.find((item) => item.id === "calcium_hydroxide"), ionById), "polyatomic");
  assert.equal(compoundCategory(compounds.find((item) => item.id === "iron3_sulfate"), ionById), "variableOx");
});

test("published data passes validation and reports only the two intentional acetate warnings", () => {
  const result = validateData(ions, compounds, settings);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 2);
  assert.ok(result.warnings.every((warning) => warning.includes("許容別表記登録済み")));
});

test("Fe(OH)3 is absent and iron(III) hydroxide is name-only", () => {
  assert.equal(JSON.stringify({ ions, compounds }).includes("Fe(OH)3"), false);
  assert.equal(JSON.stringify({ ions, compounds }).includes("Fe(OH)₃"), false);
  const item = compounds.find((compound) => compound.id === "iron3_hydroxide");
  assert.equal(item.formula, null);
  assert.deepEqual(itemVariants("compound", item), ["ionsToName"]);

  const invalid = structuredClone(compounds);
  invalid.find((compound) => compound.id === "iron3_hydroxide").formula = "Fe(OH)3";
  const result = validateData(ions, invalid, settings);
  assert.ok(result.errors.some((error) => error.includes("禁止")));
});

test("zero-weight categories are completely excluded", () => {
  const ionSet = buildTenQuestionSet({ domain: "ion", difficulty: "hard", ions, compounds, settings, random: randomFrom(2) });
  assert.ok(ionSet.questions.every((question) => question.category !== "ionSimple"));
  const compoundSet = buildTenQuestionSet({ domain: "compound", difficulty: "hard", ions, compounds, settings, random: randomFrom(3) });
  assert.ok(compoundSet.questions.every((question) => question.category !== "simple11"));
});

test("hard ion 0:4:6 target is safely redistributed to 0:6:4 with current capacity", () => {
  const available = { ionSimple: 14, ionPolyatomic: 11, ionVariableOx: 4 };
  const counts = allocateCounts(settings.categoryWeights.ion.hard, 10, available, randomFrom(4));
  assert.deepEqual(counts, { ionSimple: 0, ionPolyatomic: 6, ionVariableOx: 4 });
});

test("ten-question sets contain unique item IDs and balanced variants", () => {
  for (const [domain, difficulty, seed] of [["ion", "standard", 10], ["compound", "standard", 11], ["compound", "hard", 12]]) {
    const result = buildTenQuestionSet({ domain, difficulty, ions, compounds, settings, random: randomFrom(seed) });
    assert.equal(result.questions.length, 10);
    assert.equal(new Set(result.questions.map((question) => question.itemId)).size, 10);
    const variants = Object.values(result.questions.reduce((counts, question) => ({ ...counts, [question.variant]: (counts[question.variant] ?? 0) + 1 }), {})).sort();
    assert.deepEqual(variants, domain === "ion" ? [5, 5] : [2, 2, 3, 3]);
  }
});

test("all difficulty presets repeatedly produce complete, unique ten-question sets", () => {
  for (const domain of ["ion", "compound"]) {
    for (const difficulty of ["easy", "standard", "hard"]) {
      for (let seed = 1; seed <= 30; seed += 1) {
        const result = buildTenQuestionSet({ domain, difficulty, ions, compounds, settings, random: randomFrom(seed) });
        assert.equal(result.questions.length, 10, `${domain}.${difficulty}, seed=${seed}`);
        assert.equal(new Set(result.questions.map((question) => question.itemId)).size, 10, `${domain}.${difficulty}, seed=${seed}`);
      }
    }
  }
});

test("endless hard ion round visits every eligible item exactly once", () => {
  const result = buildEndlessRound({ domain: "ion", difficulty: "hard", ions, compounds, settings, random: randomFrom(20) });
  assert.equal(result.questions.length, 15);
  assert.equal(new Set(result.questions.map((question) => question.itemId)).size, 15);
  assert.equal(result.questions.filter((question) => question.category === "ionSimple").length, 0);
  assert.equal(result.questions.filter((question) => question.category === "ionPolyatomic").length, 11);
  assert.equal(result.questions.filter((question) => question.category === "ionVariableOx").length, 4);
});

test("weak history is isolated by domain, item and variant", () => {
  const history = {};
  const question = { domain: "compound", itemId: "calcium_chloride", variant: "nameToFormula" };
  recordHistory(history, question, { passed: false, usedHint: false, hadWrong: true }, 1);
  assert.equal(history[historyKey("compound", "calcium_chloride", "nameToFormula")].score, 1);
  assert.equal(history[historyKey("compound", "calcium_chloride", "formulaToName")], undefined);
  recordHistory(history, question, { passed: false, usedHint: false, hadWrong: false }, 2);
  assert.equal(history[historyKey("compound", "calcium_chloride", "nameToFormula")].score, 0);
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
