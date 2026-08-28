import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const [compoundsPath, ionsPath] = process.argv.slice(2);
if (!compoundsPath || !ionsPath) {
  throw new Error("Usage: node scripts/import-tsv.mjs <compounds.txt> <ions.txt>");
}

const rows = (text) => {
  const lines = text.replace(/\r/g, "").split("\n");
  const headerIndex = lines.findIndex((line) => line.startsWith("id\t"));
  if (headerIndex < 0) throw new Error("TSV header not found");
  const headers = lines[headerIndex].split("\t");
  return lines.slice(headerIndex + 1).filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
};

const boolean = (value) => value === "TRUE";
const nullable = (value) => value || null;
const ionRows = rows(await readFile(resolve(ionsPath), "utf8"));
const compoundRows = rows(await readFile(resolve(compoundsPath), "utf8"));

const ions = ionRows.map((row) => ({
  id: row.id,
  formula: row.formula,
  charge: Number(row.charge),
  name: row.name,
  type: row.type,
  atomicity: row.atomicity,
  requiresOxidationNumeral: boolean(row.requiresOxidationNumeral),
  enabled: boolean(row.enabled),
}));

const compounds = compoundRows.map((row) => {
  const compound = {
    id: row.id,
    cation: row.cation,
    anion: row.anion,
    formula: nullable(row.formula),
    name: row.name,
    solidColor: nullable(row.solidColor),
    solidColorNote: nullable(row.solidColorNote),
    enabled: boolean(row.enabled),
    questionModes: {
      nameToFormula: boolean(row.nameToFormula),
      formulaToName: boolean(row.formulaToName),
      ionsToFormula: boolean(row.ionsToFormula),
      ionsToName: boolean(row.ionsToName),
    },
  };
  if (row.id === "sodium_acetate") {
    compound.acceptedFormulaVariants = [{ formula: "NaCH3COO", note: "このアプリでは CH₃COONa を推奨表記とします。" }];
  }
  if (row.id === "potassium_acetate") {
    compound.acceptedFormulaVariants = [{ formula: "KCH3COO", note: "このアプリでは CH₃COOK を推奨表記とします。" }];
  }
  return compound;
});

await mkdir(resolve("data"), { recursive: true });
await writeFile(resolve("data/ions.json"), `${JSON.stringify(ions, null, 2)}\n`);
await writeFile(resolve("data/compounds.json"), `${JSON.stringify(compounds, null, 2)}\n`);
console.log(`Imported ${ions.length} ions and ${compounds.length} compounds.`);
