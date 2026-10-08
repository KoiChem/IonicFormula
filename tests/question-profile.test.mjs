import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { composePublishedBundle } from '../js/data-migrations.js';
import * as profile from '../js/question-profile.js';
import * as persistence from '../js/profile-storage.js';
const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const base = { ions: await load('../data/ions.json'), compounds: await load('../data/compounds.json'), difficulty: await load('../data/difficulty.json') };
const pack = await load('../data/complex-chemistry.json');
const bundle = composePublishedBundle(base, pack);
const defaults = await load('../data/question-profile.json');
const catalog = () => profile.questionProfileCatalog(bundle);
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };

test('catalog excludes support-only ions but retains all compound references', () => {
 const c = catalog();
 assert.equal(c.ions.length, 46); assert.equal(c.compounds.length, 194);
 assert.equal(c.ions.some(i => i.id === 'hydrogen' || i.id === 'chromium3'), false);
 assert.equal(c.ions.find(i => i.id === 'sodium').formula, 'Na+');
 assert.equal(c.ions.find(i => i.id === 'complex_fe_cn_6_ii').formula, '[Fe(CN)6]4-');
 assert.equal(c.compounds.find(i => i.id === 'salt_k_au_cl_2').defaultDifficulty, 'off');
});

test('two difficulty buttons cover both, one level and off', () => {
 assert.equal(profile.toggleItemDifficulty('both','normal'), 'hard');
 assert.equal(profile.toggleItemDifficulty('hard','hard'), 'off');
 assert.equal(profile.toggleItemDifficulty('off','normal'), 'normal');
 assert.equal(profile.toggleItemDifficulty('normal','hard'), 'both');
});

test('profile validation refuses unknown IDs, malformed memberships and non-finite weights', () => {
 for (const patch of [p => p.ionDifficulties.unknown = 'off', p => p.compoundDifficulties.sodium_chloride = 'easy', p => p.ionDifficulties.sodium=['both'], p => p.rules.ion.hard.complexPercent = 19, p => p.rules.ion.normal.categoryWeights = { ionSimple: NaN }, p => p.rules.ion.normal.categoryWeights = { ionSimple: 0 }, p => p.rules.ion.normal.categoryWeights = { unknown: 1 }]) {
  const p = structuredClone(defaults); patch(p); assert.throws(() => profile.validateQuestionProfile(p,catalog()));
 }
 assert.deepEqual(profile.validateQuestionProfile(defaults,catalog()), defaults);
});

test('compound membership is independent of single-ion off and supports explicit hard 1:1 assignment', () => {
 const p = structuredClone(defaults); p.ionDifficulties.sodium = 'off';
 assert.ok(profile.profileCandidates(bundle,p,'compound','normal',false).some(i => i.id === 'sodium_chloride'));
 assert.equal(profile.profileCandidates(bundle,p,'ion','normal',false).some(i => i.id === 'sodium'),false);
 assert.equal(profile.profileCandidates(bundle,p,'compound','hard',false).some(i => i.id === 'sodium_chloride'),false);
 p.compoundDifficulties.sodium_chloride = 'both';
 assert.ok(profile.profileCandidates(bundle,p,'compound','hard',false).some(i => i.id === 'sodium_chloride'));
});

test('zero ordinary category weights exclude ordinary items without excluding complex candidates', () => {
 const p = structuredClone(defaults); p.rules.ion.normal.categoryWeights = { ionSimple: 1, ionPolyatomic: 0, ionVariableOx: 0 };
 const candidates = profile.profileCandidates(bundle,p,'ion','normal',true);
 assert.equal(candidates.some(i => i.id === 'sulfate'),false);
 assert.ok(candidates.some(i => i.id === 'complex_ag_nh3_2'));
 assert.equal(profile.profileCandidates(bundle,p,'ion','normal',false).some(i => i.complex),false);
});

test('migration backs up exact legacy bytes and retains exclusions and custom weights without importing edited chemistry', () => {
 const s = storage(); const old = structuredClone(bundle);
 old.ions.find(i => i.id === 'sodium').enabled = false;
 old.ions.find(i => i.id === 'potassium').name = '旧名称編集';
 old.compounds = old.compounds.filter(i => i.id !== 'sodium_chloride');
 old.difficulty.categoryWeights.ion.normal = { ionSimple: 1, ionPolyatomic: 0, ionVariableOx: 0 };
 const raw = JSON.stringify(old,null,2); s.setItem(persistence.LEGACY_DATA_KEY,raw);
 const result = persistence.loadQuestionProfile(s,defaults,bundle,pack);
 assert.equal(result.profile.ionDifficulties.sodium,'off');
 assert.equal(result.profile.compoundDifficulties.sodium_chloride,'off');
 assert.deepEqual(result.profile.rules.ion.normal.categoryWeights,{ ionSimple: 1, ionPolyatomic: 0, ionVariableOx: 0 });
 assert.equal(s.getItem(persistence.LEGACY_BACKUP_KEY), raw);
 assert.equal(s.getItem(persistence.LEGACY_DATA_KEY), raw);
 assert.equal(bundle.ions.find(i => i.id === 'potassium').name,'カリウムイオン');
 assert.deepEqual(persistence.loadQuestionProfile(s,defaults,bundle,pack).profile,result.profile);
});

test('failed migration storage leaves legacy data and saved profile untouched', () => {
 const raw = JSON.stringify(bundle); const s = { getItem: key => key === persistence.LEGACY_DATA_KEY ? raw : null, setItem: () => { throw new Error('quota'); } };
 assert.throws(() => persistence.loadQuestionProfile(s,defaults,bundle,pack), /保存|quota/);
 assert.equal(s.getItem(persistence.LEGACY_DATA_KEY),raw);
 assert.equal(s.getItem(persistence.PROFILE_KEY),null);
});

test('invalid saved profile cannot overwrite or silently replace user data', () => {
 const s = storage(); s.setItem(persistence.PROFILE_KEY,'{"version":999}');
 assert.throws(() => persistence.loadQuestionProfile(s,defaults,bundle,pack));
 assert.equal(s.getItem(persistence.PROFILE_KEY),'{"version":999}');
});

test('legacy unmarked complex ID collisions refuse migration before any write', () => {
 const s = storage(); const old = structuredClone(base); old.ions.push({ ...pack.ions[0] });
 const raw=JSON.stringify(old); s.setItem(persistence.LEGACY_DATA_KEY,raw);
 assert.throws(() => persistence.loadQuestionProfile(s,defaults,bundle,pack),/衝突/);
 assert.equal(s.getItem(persistence.PROFILE_KEY),null); assert.equal(s.getItem(persistence.LEGACY_DATA_KEY),raw);
});
