import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildTenQuestionSet,buildWeakQuestionSet,buildEndlessRound,historyKey,ionCategory,compoundCategory} from '../js/core.js';
import {composePublishedBundle} from '../js/data-migrations.js';
import {isComplexItem} from '../js/chemistry/complex-policy.js';
const load=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const base={ions:await load('../data/ions.json'),compounds:await load('../data/compounds.json'),difficulty:await load('../data/difficulty.json')};
const pack=await load('../data/complex-chemistry.json'), bundle=composePublishedBundle(base,pack), defaults=await load('../data/question-profile.json');
const byId=new Map(bundle.ions.map(i=>[i.id,i])), compoundById=new Map(bundle.compounds.map(i=>[i.id,i]));
const options=(domain,level='normal')=>({practiceType:domain,difficulty:level,ions:bundle.ions,compounds:bundle.compounds,settings:bundle.difficulty,questionProfile:structuredClone(defaults),complexEnabled:true,random:()=>.37});
const builders=[buildTenQuestionSet,buildWeakQuestionSet,buildEndlessRound];

test('all practice routes respect exact complex quotas and unique questions',()=>{
 for(const builder of builders) for(const domain of ['ion','compound']) for(const level of ['normal','hard']) {
  const result=builder(options(domain,level));
  assert.equal(result.questions.length,10,`${builder.name} ${domain} ${level}`);
  assert.equal(new Set(result.questions.map(q=>q.itemId)).size,10);
  const complexCount=result.questions.filter(q=>isComplexItem((domain==='ion'?byId:compoundById).get(q.itemId),byId)).length;
  assert.equal(complexCount,level==='hard'?2:1,`${builder.name} ${domain} ${level} quota`);
 }
});

test('single-ion off does not hide its compound even when all single-ion memberships are off',()=>{
 for(const builder of builders) {
  const o=options('compound');o.complexEnabled=false;
  o.questionProfile.ionDifficulties=Object.fromEntries(bundle.ions.filter(i=>i.ionQuestionEnabled!==false).map(i=>[i.id,'off']));
  o.questionProfile.compoundDifficulties=Object.fromEntries(bundle.compounds.map(i=>[i.id,i.id==='sodium_chloride'?'both':'off']));
  assert.deepEqual(builder(o).questions.map(q=>q.itemId),['sodium_chloride']);
 }
});

test('hard explicit 1:1 re-enabling is reflected in actual questions',()=>{
 const o=options('compound','hard');o.complexEnabled=false;
 o.questionProfile.compoundDifficulties=Object.fromEntries(bundle.compounds.map(i=>[i.id,i.id==='sodium_chloride'?'both':'off']));
 assert.deepEqual(buildTenQuestionSet(o).questions.map(q=>q.itemId),['sodium_chloride']);
});

test('uniform item mode gives a rare re-enabled category a real opportunity in full 10-question rounds',()=>{
 const o=options('compound','hard');o.complexEnabled=false;
 o.questionProfile.compoundDifficulties.sodium_chloride='both';
 let seed=34; o.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 let selected=0;
 for(let i=0;i<100;i++)if(buildTenQuestionSet(o).questions.some(q=>q.itemId==='sodium_chloride'))selected++;
 assert.ok(selected>0,'a rare category must not receive zero slots in every round');
 assert.ok(selected<100,'re-enabling should not force the item into every round');
});

test('custom category zero weights apply to actual rounds while complex quota remains independent',()=>{
 const o=options('ion');o.questionProfile.rules.ion.normal.categoryWeights={ionSimple:1,ionPolyatomic:0,ionVariableOx:0};
 const result=buildTenQuestionSet(o);
 assert.equal(result.questions.filter(q=>isComplexItem(byId.get(q.itemId),byId)).length,1);
 assert.ok(result.questions.filter(q=>!isComplexItem(byId.get(q.itemId),byId)).every(q=>ionCategory(byId.get(q.itemId))==='ionSimple'));
});

test('ordinary pool shortage cannot consume extra complex items and complex pool shortage reports clearly',()=>{
 const o=options('compound');o.questionProfile.rules.compound.normal.complexPercent=100;
 assert.throws(()=>buildTenQuestionSet(o),/錯イオン|候補|不足/);
 const p=options('ion');p.questionProfile.ionDifficulties=Object.fromEntries(bundle.ions.filter(i=>i.ionQuestionEnabled!==false&&!isComplexItem(i,byId)).map(i=>[i.id,'off']));
 assert.throws(()=>buildTenQuestionSet(p),/通常|候補|不足/);
});

test('weak review still favors actual weak items inside assigned quota',()=>{
 for(const domain of ['ion','compound']) {
  const o=options(domain);o.history={[historyKey(domain,domain==='ion'?'sodium':'sodium_chloride',domain==='ion'?'ionNameToFormula':'ionsToFormula')]:{score:8,scoredAttempts:3,firstTryCorrects:0,lastSeenAt:1}};
  assert.ok(buildWeakQuestionSet(o).questions.some(q=>q.itemId===(domain==='ion'?'sodium':'sodium_chloride')));
 }
});

test('weak-review rounds present the actual weak question before ordinary fillers',()=>{
 for(const domain of ['ion','compound']) {
  const o=options(domain);o.complexEnabled=false;o.random=()=>.01;
  const id=domain==='ion'?'sodium':'sodium_chloride', variant=domain==='ion'?'ionNameToFormula':'ionsToFormula';
  o.history={[historyKey(domain,id,variant)]:{score:8,scoredAttempts:3,firstTryCorrects:0,lastSeenAt:1}};
  assert.equal(buildWeakQuestionSet(o).questions[0].itemId,id);
 }
});

test('ordinary and complex partitioning share the original weak-review target',()=>{
 const o=options('compound','hard');o.history={};
 for(const id of ['sodium_carbonate','potassium_carbonate','salt_k4_fe_cn_6','salt_k3_fe_cn_6']) {
  o.history[historyKey('compound',id,'ionsToFormula')]={score:8,scoredAttempts:3,firstTryCorrects:0,lastSeenAt:1};
 }
 const round=buildTenQuestionSet(o);
 assert.equal(round.questions.filter(q=>q.isWeakReview).length,2);
});

test('profile-off complex mode excludes complex candidates on all routes',()=>{
 for(const builder of builders) for(const domain of ['ion','compound']) {
  const o=options(domain);o.complexEnabled=false;
  assert.ok(builder(o).questions.every(q=>!isComplexItem((domain==='ion'?byId:compoundById).get(q.itemId),byId)));
 }
});

test('category totals describe actual selected items after profile splitting',()=>{
 for(const domain of ['ion','compound']) {
  const round=buildTenQuestionSet(options(domain));const actual={};
  for(const q of round.questions) {const c=domain==='ion'?ionCategory(byId.get(q.itemId)):compoundCategory(compoundById.get(q.itemId),byId);actual[c]=(actual[c]??0)+1;}
  for(const [key,count] of Object.entries(actual))assert.equal(round.categoryCounts[key],count);
 }
});
