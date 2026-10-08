import { isComplexItem } from './chemistry/complex-policy.js?v=20261009-prompt-fit-v1';

export const ITEM_DIFFICULTY_LABELS = Object.freeze({ normal: 'やさしめ', hard: 'ややむず', both: '両方', off: '出題しない' });
export const CATEGORY_LABELS = Object.freeze({ ionSimple: '単原子イオン', ionPolyatomic: '多原子イオン', ionVariableOx: '酸化数を表すイオン', simple11: '単原子イオン・1対1', simpleRatio: '単原子イオン・異なる比率', polyatomic: '多原子イオンを含む', variableOx: '酸化数を表す化合物' });
export const PROFILE_CATEGORIES = Object.freeze({ ion: ['ionSimple','ionPolyatomic','ionVariableOx'], compound: ['simple11','simpleRatio','polyatomic','variableOx'] });

function defaultDifficulty(item) { return !item.enabled ? 'off' : item.difficulty ?? 'both'; }
function gcd(a,b) { return b ? gcd(b,a%b) : Math.abs(a); }
function category(item,ionById) {
 if ('charge' in item) return item.requiresOxidationNumeral ? 'ionVariableOx' : item.atomicity === 'polyatomic' ? 'ionPolyatomic' : 'ionSimple';
 const c=ionById.get(item.cation), a=ionById.get(item.anion);
 if (!c || !a) throw new Error(`構成イオンが見つかりません：${item.id}`);
 if (c.requiresOxidationNumeral || a.requiresOxidationNumeral) return 'variableOx';
 if (c.atomicity === 'polyatomic' || a.atomicity === 'polyatomic') return 'polyatomic';
 const d=gcd(c.charge,a.charge);
 return Math.abs(a.charge)/d===1 && c.charge/d===1 ? 'simple11' : 'simpleRatio';
}

export function questionProfileCatalog(bundle) {
 const ionById=new Map(bundle.ions.map(i=>[i.id,i]));
 const describe=item=>({ id:item.id, formula:'charge' in item ? `${item.formula}${Math.abs(item.charge)===1?'':Math.abs(item.charge)}${item.charge>0?'+':'-'}` : item.formula ?? '', name:item.name, complex:isComplexItem(item,ionById), category:category(item,ionById), defaultDifficulty:defaultDifficulty(item) });
 return { ions:bundle.ions.filter(i=>i.ionQuestionEnabled!==false).map(describe), compounds:bundle.compounds.map(describe) };
}

export function itemDifficulty(item,overrides) { return overrides[item.id] ?? item.defaultDifficulty; }
export function toggleItemDifficulty(value,level) {
 const normal=(value==='normal'||value==='both') !== (level==='normal');
 const hard=(value==='hard'||value==='both') !== (level==='hard');
 return normal ? (hard?'both':'normal') : (hard?'hard':'off');
}

function object(value) {
 if (!value || typeof value!=='object' || Array.isArray(value)) throw new TypeError('出題設定の形式が不正です。');
 return value;
}
function keys(value,allowed,required=allowed) {
 object(value);
 if (Object.keys(value).some(k=>!allowed.includes(k)) || required.some(k=>!Object.hasOwn(value,k))) throw new TypeError('出題設定の項目が不正です。');
}

export function validateQuestionProfile(raw,catalog) {
 keys(raw,['version','rules','ionDifficulties','compoundDifficulties','weakQuestionTarget'],['version','rules','ionDifficulties','compoundDifficulties']);
 if (raw.version!==1) throw new TypeError('出題設定の版が不正です。');
 keys(raw.rules,['ion','compound']);
 for (const mode of ['ion','compound']) {
  keys(raw.rules[mode],['normal','hard']);
  for (const level of ['normal','hard']) {
   const rule=raw.rules[mode][level]; keys(rule,['complexPercent','categoryWeights']);
   if (!Number.isInteger(rule.complexPercent) || rule.complexPercent<(level==='hard'?20:0) || rule.complexPercent>100) throw new TypeError('錯イオンの割合が不正です。');
   if (rule.categoryWeights!==null) {
    keys(rule.categoryWeights,PROFILE_CATEGORIES[mode],[]);
    const values=Object.values(rule.categoryWeights);
    if (values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>10000) || values.reduce((sum,v)=>sum+v,0)<=0) throw new TypeError('カテゴリの重みが不正です。');
   }
  }
  const assignments=object(raw[`${mode}Difficulties`]);
  const ids=new Set(catalog[mode==='ion'?'ions':'compounds'].map(i=>i.id));
  if (Object.entries(assignments).some(([id,v])=>!ids.has(id) || typeof v!=='string' || !Object.hasOwn(ITEM_DIFFICULTY_LABELS,v))) throw new TypeError('教材の難易度が不正です。');
 }
 if (raw.weakQuestionTarget!==undefined) {
  keys(raw.weakQuestionTarget,['ten','endlessPerTen']);
  if (Object.values(raw.weakQuestionTarget).some(v=>!Number.isInteger(v)||v<0||v>10)) throw new TypeError('苦手問題数が不正です。');
 }
 return structuredClone(raw);
}

export function profileCandidates(bundle,profile,domain,level,complexEnabled,complexOnly=false) {
 const catalog=questionProfileCatalog(bundle), assignments=profile[`${domain}Difficulties`];
 const weights=profile.rules[domain][level].categoryWeights;
 return catalog[domain==='ion'?'ions':'compounds'].filter(item=>{
  if (complexOnly) return item.complex;
  const membership=itemDifficulty(item,assignments);
  if (membership!==level && membership!=='both') return false;
  if (item.complex) return complexEnabled===true;
  if (weights!==null) return (weights[item.category]??0)>0;
  return !(domain==='compound' && level==='hard' && item.category==='simple11' && !Object.hasOwn(assignments,item.id));
 });
}
