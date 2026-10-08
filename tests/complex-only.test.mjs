import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { composePublishedBundle } from '../js/data-migrations.js';
import { questionProfileCatalog, profileCandidates } from '../js/question-profile.js';
import { buildTenQuestionSet, buildEndlessRound, buildWeakQuestionSet } from '../js/core.js';
import { isComplexItem } from '../js/chemistry/complex-policy.js';
const load = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const bundle = composePublishedBundle({ ions: await load('ions'), compounds: await load('compounds'), difficulty: await load('difficulty') }, await load('complex-chemistry'));
const profile = await load('question-profile');
for (const domain of ['ion', 'compound']) {
  const catalog = questionProfileCatalog(bundle);
  for (const item of catalog[domain === 'ion' ? 'ions' : 'compounds']) profile[`${domain}Difficulties`][item.id] = 'off';
  test(`complex-only ${domain} includes every complex item despite OFF and difficulty`, () => {
    for (const difficulty of ['normal', 'hard']) assert.equal(profileCandidates(bundle, profile, domain, difficulty, false, true).length, domain === 'ion' ? 17 : 36);
  });
  for (const difficulty of ['normal', 'hard']) for (const builder of [buildTenQuestionSet, buildEndlessRound, buildWeakQuestionSet]) {
    test(`${builder.name}: complex-only ${domain}/${difficulty} bypasses all OFF settings`, () => {
      const result = builder({ ...bundle, settings: bundle.difficulty, practiceType: domain, difficulty, complexEnabled: false, complexOnly: true, questionProfile: profile });
      assert.equal(result.availableCount, domain === 'ion' ? 17 : 36);
      assert.equal(result.questions.length, 10);
      assert.equal(new Set(result.questions.map(q => q.itemId)).size, 10);
      const items = domain === 'ion' ? bundle.ions : bundle.compounds;
      const ionById = new Map(bundle.ions.map(i => [i.id, i]));
      assert.ok(result.questions.every(q => isComplexItem(items.find(i => i.id === q.itemId), ionById)));
      assert.ok(result.questions.every(q => q.complexOnly === true));
    });
  }
}
