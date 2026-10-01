import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tryModule = async (path) => import(path).catch(() => ({}));
const policy = await tryModule('../js/chemistry/complex-policy.js');
const syntax = await tryModule('../js/chemistry/formula-syntax.js');
const migrations = await tryModule('../js/data-migrations.js');
const pack = await readFile(new URL('../data/complex-chemistry.json', import.meta.url), 'utf8').then(JSON.parse, () => ({}));
const baseIons = JSON.parse(await readFile(new URL('../data/ions.json', import.meta.url), 'utf8'));
const baseCompounds = JSON.parse(await readFile(new URL('../data/compounds.json', import.meta.url), 'utf8'));
const baseDifficulty = JSON.parse(await readFile(new URL('../data/difficulty.json', import.meta.url), 'utf8'));
const base = { ions: baseIons, compounds: baseCompounds, difficulty: baseDifficulty };

const ionById = () => new Map([...baseIons, ...(pack.supportIons ?? []), ...(pack.ions ?? [])].map((ion) => [ion.id, ion]));

test('catalog keeps the approved 17 ions and 36 compounds with separate charge and original IDs', () => {
  assert.equal(pack.ions?.length, 17);
  assert.equal(pack.compounds?.length, 36);
  assert.equal(new Set(pack.ions.map((item) => item.id)).size, 17);
  assert.equal(new Set(pack.compounds.map((item) => item.id)).size, 36);
  assert.deepEqual(pack.ions.map((item) => item.curriculumLevel).reduce((result, level) => ({ ...result, [level]: (result[level] ?? 0) + 1 }), {}), { standard: 10, advanced: 7 });
  assert.deepEqual(pack.compounds.map((item) => item.curriculumLevel).reduce((result, level) => ({ ...result, [level]: (result[level] ?? 0) + 1 }), {}), { standard: 4, advanced: 32 });
  assert.ok([...pack.ions, ...pack.compounds].every((item) => item.enabled === (item.curriculumLevel === 'standard')));
  assert.deepEqual(pack.ions.filter((item) => item.id.startsWith('complex_fe_cn_6_')).map((item) => [item.id, item.formula, item.charge]), [
    ['complex_fe_cn_6_ii', '[Fe(CN)6]', -4],
    ['complex_fe_cn_6_iii', '[Fe(CN)6]', -3],
  ]);
  assert.equal(pack.compounds.find((item) => item.id === 'salt_k_au_cl_2')?.evidence?.status, 'unverified');
  assert.equal(pack.compounds.find((item) => item.id === 'salt_na_au_cl_2')?.evidence?.status, 'unverified');
});

test('all pack compounds have existing, charge-balanced ion references', () => {
  const refs = ionById();
  for (const item of pack.compounds ?? []) {
    const cation = refs.get(item.cation);
    const anion = refs.get(item.anion);
    assert.equal(cation?.type, 'cation', item.id);
    assert.equal(anion?.type, 'anion', item.id);
    assert.equal(item.chemistryClass, 'complex', item.id);
    assert.equal(item.solidColor, null, item.id);
    assert.ok(item.formula.includes('[') && item.formula.includes(']'), item.id);
  }
});

test('complex policy detects tagged ions and compound references', () => {
  assert.equal(typeof policy.isComplexItem, 'function');
  const refs = ionById();
  assert.equal(policy.isComplexItem(baseIons[0], refs), false);
  assert.equal(policy.isComplexItem(pack.ions[0], refs), true);
  assert.equal(policy.isComplexItem({ cation: 'potassium', anion: 'complex_fe_cn_6_ii' }, refs), true);
  assert.equal(policy.complexItemAllowed({ cation: 'potassium', anion: 'complex_fe_cn_6_ii' }, false, refs), false);
  assert.equal(policy.complexItemAllowed({ cation: 'potassium', anion: 'complex_fe_cn_6_ii' }, true, refs), true);
  assert.equal(policy.complexItemAllowed(baseIons[0], false, refs), true);
});

test('formula syntax accepts nested matched brackets and rejects crossed or empty groups', () => {
  assert.equal(typeof syntax.formulaSyntaxValid, 'function');
  for (const formula of ['[Ag(NH3)2]', '[Fe(CN)6]', 'K4[Fe(CN)6]', '(NH4)2[PtCl6]']) assert.equal(syntax.formulaSyntaxValid(formula), true, formula);
  for (const formula of ['[Ag(NH3)2', '[Fe(CN]6)', '[]', '()', 'Na[AuCl2]]', '[Cu(H2O)4]2+']) assert.equal(syntax.formulaSyntaxValid(formula), false, formula);
  assert.equal(syntax.formulaSyntaxValid('[Fe(CN)6]4-', { allowCharge: true }), true);
  assert.equal(syntax.formulaSyntaxValid('[Fe(CN)6]4-'), false);
});

test('published composition adds pack once and rejects collisions', () => {
  assert.equal(typeof migrations.composePublishedBundle, 'function');
  const composed = migrations.composePublishedBundle(base, pack);
  assert.equal(composed.ions.length, baseIons.length + 18);
  assert.equal(composed.compounds.length, baseCompounds.length + 36);
  assert.deepEqual(composed.difficulty, baseDifficulty);
  assert.ok(composed.schemaVersion && composed.contentVersion && composed.migrationVersion);
  assert.throws(() => migrations.composePublishedBundle({ ...base, ions: [...baseIons, { id: pack.ions[0].id }] }, pack), /complex_ag_nh3_2|衝突|conflict/i);
});

test('migration preserves edits and deletions, then never restores deleted pack IDs', () => {
  assert.equal(typeof migrations.migrateBundle, 'function');
  const old = { ...base, ions: baseIons.filter((item) => item.id !== 'lithium').map((item) => item.id === 'sodium' ? { ...item, name: '編集済み' } : item), compounds: baseCompounds.filter((item) => item.id !== 'sodium_chloride') };
  const migrated = migrations.migrateBundle(old, pack);
  assert.equal(migrated.ions.find((item) => item.id === 'sodium')?.name, '編集済み');
  assert.equal(migrated.ions.some((item) => item.id === 'lithium'), false);
  assert.equal(migrated.compounds.some((item) => item.id === 'sodium_chloride'), false);
  assert.equal(migrated.ions.length, old.ions.length + 18);
  assert.equal(migrated.compounds.length, old.compounds.length + 36);
  const withoutNewIon = { ...migrated, ions: migrated.ions.filter((item) => item.id !== pack.ions[0].id) };
  const second = migrations.migrateBundle(withoutNewIon, pack);
  assert.equal(second.ions.some((item) => item.id === pack.ions[0].id), false);
  assert.deepEqual(second.difficulty, old.difficulty);
});

test('migration refuses unmarked ID collisions without altering source', () => {
  const old = structuredClone(base);
  old.ions.push({ id: 'complex_ag_nh3_2', name: '個別編集' });
  const original = structuredClone(old);
  assert.throws(() => migrations.migrateBundle(old, pack), /complex_ag_nh3_2|衝突|conflict/i);
  assert.deepEqual(old, original);
});

test('complex ion validator rejects excluded ligands and metadata that disagrees with the formula', () => {
  assert.equal(typeof policy.validateComplexIon, 'function');
  const copper = pack.ions.find((ion) => ion.id === 'complex_cu_nh3_4');
  assert.deepEqual(policy.validateComplexIon(copper), []);
  assert.ok(policy.validateComplexIon({ ...copper, formula: '[Cu(H2O)4]' }).length > 0);
  assert.ok(policy.validateComplexIon({ ...copper, formula: '[Cu(NH3)5]' }).length > 0);
  assert.ok(policy.validateComplexIon({ ...copper, charge: 3 }).length > 0);
  assert.ok(policy.validateComplexIon({ ...copper, complex: { ...copper.complex, ligands: [{ formula: 'S2O3', charge: -2, count: 2, denticity: 1 }] } }).length > 0);
});

test('complex validation cannot be bypassed by deleting the metadata tag', () => {
  const copper = pack.ions.find((ion) => ion.id === 'complex_cu_nh3_4');
  assert.ok(policy.validateComplexIon({ ...copper, chemistryClass: undefined, formula: '[Cu(H2O)4]' }).length > 0);
});

test('complex validation reports malformed imported records without throwing', () => {
  assert.doesNotThrow(() => policy.validateComplexIon({ chemistryClass: 'complex', formula: 42, complex: { ligands: [null] } }));
  assert.ok(policy.validateComplexIon({ chemistryClass: 'complex', formula: 42, complex: { ligands: [null] } }).length > 0);
});

test('retired acids are removed from v1 and later imports without restoring other deleted pack entries',()=>{
 const acids=[{id:'acid_h_au_cl_4',formula:'H[AuCl4]'},{id:'acid_h2_pt_cl_6',formula:'H2[PtCl6]'}];
 const original={...structuredClone(base),migrationVersion:1,compounds:[...base.compounds,...acids,{id:'edited_custom',name:'保持'}]};
 const migrated=migrations.migrateBundle(original,pack);
 assert.equal(migrated.compounds.some(x=>x.id.startsWith('acid_h')),false);
 assert.equal(migrated.compounds.find(x=>x.id==='edited_custom').name,'保持');
 assert.equal(migrated.ions.some(x=>x.id===pack.ions[0].id),false);
 assert.equal(original.compounds.some(x=>x.id==='acid_h_au_cl_4'),true);
 const imported=migrations.migrateBundle({...migrated,compounds:[...migrated.compounds,...acids]},pack);
 assert.equal(imported.compounds.some(x=>x.id.startsWith('acid_h')),false);
});
