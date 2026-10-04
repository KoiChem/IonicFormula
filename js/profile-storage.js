import { migrateBundle } from './data-migrations.js?v=20261004-question-profile-v1';
import { questionProfileCatalog, validateQuestionProfile, itemDifficulty } from './question-profile.js?v=20261004-question-profile-v1';

export const PROFILE_KEY='ionicFormula.questionProfile.v1';
export const LEGACY_DATA_KEY='ionicFormula.adminData.v2';
export const LEGACY_BACKUP_KEY=`${LEGACY_DATA_KEY}.preQuestionProfileBackup`;

export function profileFromLegacy(legacy,published,bundle,pack) {
 const old=migrateBundle(legacy,pack);
 const result=structuredClone(published), catalog=questionProfileCatalog(bundle);
 for (const domain of ['ion','compound']) {
  const collection=domain==='ion'?'ions':'compounds';
  if (new Set(old[collection].map(i=>i.id)).size!==old[collection].length) throw new Error('旧教材のIDが重複しています。');
  const byId=new Map(old[collection].map(i=>[i.id,i]));
  for (const item of catalog[collection]) {
   const previous=byId.get(item.id);
   const value=!previous || !previous.enabled || (domain==='ion' && previous.ionQuestionEnabled===false) ? 'off' : previous.difficulty ?? 'both';
   if (value!==itemDifficulty(item,result[`${domain}Difficulties`])) result[`${domain}Difficulties`][item.id]=value;
  }
  for (const level of ['normal','hard']) {
   const weights=old.difficulty?.categoryWeights?.[domain]?.[level];
   if (!weights) throw new Error('旧教材のカテゴリ設定が不正です。');
   result.rules[domain][level].categoryWeights=structuredClone(weights);
  }
 }
 if (old.difficulty.weakQuestionTarget) result.weakQuestionTarget=structuredClone(old.difficulty.weakQuestionTarget);
 return validateQuestionProfile(result,catalog);
}

export function saveQuestionProfile(storage,profile,bundle) {
 const valid=validateQuestionProfile(profile,questionProfileCatalog(bundle));
 storage.setItem(PROFILE_KEY,JSON.stringify(valid));
 return valid;
}

export function loadQuestionProfile(storage,published,bundle,pack) {
 const catalog=questionProfileCatalog(bundle);
 const raw=storage.getItem(PROFILE_KEY);
 if (raw!==null) return {profile:validateQuestionProfile(JSON.parse(raw),catalog),message:''};
 const legacyRaw=storage.getItem(LEGACY_DATA_KEY);
 if (legacyRaw===null) return {profile:validateQuestionProfile(published,catalog),message:''};
 const migrated=profileFromLegacy(JSON.parse(legacyRaw),published,bundle,pack);
 try {
  if (storage.getItem(LEGACY_BACKUP_KEY)===null) storage.setItem(LEGACY_BACKUP_KEY,legacyRaw);
  saveQuestionProfile(storage,migrated,bundle);
 } catch { throw new Error('出題設定を移行・保存できません。元の教材は保持されています。'); }
 return {profile:migrated,message:'旧教材の出題設定を移行しました。教材編集の原本はバックアップから書き出せます。'};
}
