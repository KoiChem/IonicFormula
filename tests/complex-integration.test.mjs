import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildTenQuestionSet,buildWeakQuestionSet,buildEndlessRound,neutralFormula,validateData,hintFor} from '../js/core.js';
import {classifyBracketFlick} from '../js/formula-keyboard-gesture.js';
const load=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const baseIons=await load('../data/ions.json');
const compounds=await load('../data/compounds.json');
const settings=await load('../data/difficulty.json');
const complex={id:'complex_test',formula:'[Cu(NH3)4]',charge:2,name:'テトラアンミン銅(II)イオン',type:'cation',atomicity:'polyatomic',requiresOxidationNumeral:true,enabled:true,chemistryClass:'complex',curriculumLevel:'standard',complex:{centralElement:'Cu',oxidationState:2,ligands:[{formula:'NH3',charge:0,count:4,denticity:1}],coordinationNumber:4}};
const salt={id:'salt_test',cation:complex.id,anion:'nitrate',formula:'[Cu(NH3)4](NO3)2',name:'硝酸テトラアンミン銅(II)',enabled:true,questionModes:{ionsToFormula:true,ionsToName:true,ionNamesToFormula:true,ionNamesToName:true}};
test('bracket flick accepts both vertical directions and cancels horizontal/cancel distance',()=>{
 assert.equal(classifyBracketFlick(0,0),'tap');
 assert.equal(classifyBracketFlick(0,18),'alternate');
 assert.equal(classifyBracketFlick(0,-18),'alternate');
 assert.equal(classifyBracketFlick(20,18),'cancel');
 assert.equal(classifyBracketFlick(20,0),'cancel');
});
test('OFF excludes complex ions and referenced salts from all round routes',()=>{
 for(const builder of [buildTenQuestionSet,buildWeakQuestionSet,buildEndlessRound]) for(const practiceType of ['ion','compound']) {
 const result=builder({practiceType,difficulty:'normal',ions:[...baseIons,complex],compounds:[...compounds,salt],settings,history:{'ion:complex_test:ionNameToFormula':{score:5,scoredAttempts:1,firstTryCorrects:0}},random:()=>0.5});
 assert.ok(result.questions.every(q=>q.itemId!==complex.id&&q.itemId!==salt.id));
 }
});
test('ON makes complex eligible while disabled source ions exclude salts',()=>{
 const options={practiceType:'ion',difficulty:'normal',ions:[complex],compounds:[],settings,complexEnabled:true};
 assert.equal(buildTenQuestionSet(options).questions.length,1);
 const ionById=new Map([...baseIons,complex].map(x=>[x.id,x]));
 const anion=ionById.get('nitrate');
 assert.equal(neutralFormula(complex,anion).formula,salt.formula);
 assert.equal(buildTenQuestionSet({...options,practiceType:'compound',ions:[...baseIons,{...complex,enabled:false}],compounds:[salt]}).questions.length,0);
});
test('repeated complex groups do not get extra round parentheses',()=>{
 assert.equal(neutralFormula({...complex,charge:1},{id:'sulfate',formula:'SO4',charge:-2,atomicity:'polyatomic'}).formula,'[Cu(NH3)4]2SO4');
});
test('complex validation rejects metadata charge mismatch and excluded ligand families',()=>{
 const bad={...complex,charge:3};
 assert.equal(validateData([...baseIons,bad],[],settings).valid,false);
 const aqua={...complex,formula:'[Cu(H2O)4]',complex:{...complex.complex,ligands:[{formula:'H2O',charge:0,count:4,denticity:1}]}};
 assert.equal(validateData([...baseIons,aqua],[],settings).valid,false);
});
test('complex hints explain obsolete naming and complex acids',()=>{
 const byId=new Map([...baseIons,complex].map(x=>[x.id,x]));
 const h=hintFor({domain:'ion',variant:'ionFormulaToName'},complex,byId,'テトラアミン銅(II)イオン');
 assert.match(h,/アンミン/);
 const acid={...salt,id:'acid_test',compoundKind:'acid',name:'テトラクロリド金(III)酸'};
 assert.match(hintFor({domain:'compound',variant:'ionsToName'},acid,byId,''),/酸/);
});

test('compound imports reject excluded coordination formulas in accepted aliases',()=>{
 const by=[...baseIons,complex];
 for(const formula of ['[Cu(H2O)6]SO4','Na3[Ag(S2O3)2]','［Cu(H₂O)6］SO4']) assert.equal(validateData(by,[{...salt,acceptedFormulaVariants:[{formula}]}],settings).valid,false);
 assert.equal(validateData(by,[salt],settings).valid,true);
});

test('published pack preserves the OFF question sequence and remains valid when all entries are enabled',async()=>{
 const {composePublishedBundle}=await import('../js/data-migrations.js');
 const pack=await load('../data/complex-chemistry.json');
 const bundle=composePublishedBundle({ions:baseIons,compounds,difficulty:settings},pack);
 assert.equal(validateData(bundle.ions,bundle.compounds,settings).valid,true);
 for(const builder of [buildTenQuestionSet,buildEndlessRound]) for(const practiceType of ['ion','compound']) {
  const before=builder({practiceType,difficulty:'normal',ions:baseIons,compounds,settings,random:()=>.5});
  const after=builder({practiceType,difficulty:'normal',ions:bundle.ions,compounds:bundle.compounds,settings,complexEnabled:false,random:()=>.5});
  assert.deepEqual(after.questions,before.questions);
 }
 assert.equal(validateData(bundle.ions.map(x=>({...x,enabled:true})),bundle.compounds.map(x=>({...x,enabled:true})),settings).valid,true);
});

test('offline shell contains every new dependency with its release query',async()=>{
 const worker=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
 for(const path of ['js/admin-lock.js','js/admin-search.js','js/data-migrations.js','js/chemistry/complex-policy.js','js/chemistry/formula-syntax.js']) assert.ok(worker.includes(`"./${path}?v=20261004-question-profile-v1"`));
 assert.ok(worker.includes('"./data/complex-chemistry.json"'));
});
