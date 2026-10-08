import { readGithubProfile, writeGithubProfile } from './github-profile.js?v=20261009-complex-only-v1';
import { escapeHtml, buildTenQuestionSet, validateData } from './core.js?v=20261009-complex-only-v1';
import { composePublishedBundle } from './data-migrations.js?v=20261009-complex-only-v1';
import { INITIAL_PASSWORD_RECORD, currentPasswordRecord, verifyPassword, changeAdminPassword } from './admin-lock.js?v=20261009-complex-only-v1';
import { ITEM_DIFFICULTY_LABELS, CATEGORY_LABELS, PROFILE_CATEGORIES, questionProfileCatalog, validateQuestionProfile, itemDifficulty, toggleItemDifficulty, profileCandidates } from './question-profile.js?v=20261009-complex-only-v1';
import { PROFILE_KEY, LEGACY_DATA_KEY, LEGACY_BACKUP_KEY, profileFromLegacy } from './profile-storage.js?v=20261009-complex-only-v1';
import { searchMatches } from './admin-search.js?v=20261009-complex-only-v1';

const elements = Object.fromEntries([
 'admin-lock-screen','admin-editor','unlock-form','unlock-password','unlock-status','lock-button','change-password-form','change-password-status',
 'import-file','export-profile','export-backup','save-local','reset-local','save-status','validation-panel','profile-tabs','list-controls','search-input','difficulty-filter','complex-filter','row-count','profile-content',
].map(id=>[id.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),document.getElementById(id)]));
// The lock handlers use these aliases to keep the existing password lifecycle.
elements.lockScreen=elements.adminLockScreen; elements.editor=elements.adminEditor;
let bundle, pack, publishedProfile, state, catalog, saved;
let githubSha;
let saving=false;
let activeTab='ratio';
let initialized=false;
let validationTimer;
const clone=value=>structuredClone(value);
const labels=ITEM_DIFFICULTY_LABELS;

function showStatus(message,error=false) {
 elements.saveStatus.textContent=message;
 elements.saveStatus.classList.toggle('is-error',error);
}
function dirty() { return state && JSON.stringify(state)!==saved; }
function updateSaveButton() { elements.saveLocal.disabled=saving || !githubSha || !state || !dirty(); }
function edit(update) {
 const next=clone(state);update(next);state=next;
 showStatus('未保存の変更があります。');updateSaveButton();
 clearTimeout(validationTimer);validationTimer=setTimeout(validateAndShow,150);
}
async function fetchJson(path) {
 const response=await fetch(path,{cache:"no-store"});if(!response.ok)throw new Error(`${path}を読み込めません。`);return response.json();
}
function assignmentKey(domain) { return `${domain}Difficulties`; }
function eligible(domain,level,complexEnabled=true) { return profileCandidates(bundle,state,domain,level,complexEnabled); }

function profileProblems(profile) {
 try { validateQuestionProfile(profile,catalog); } catch(error) { return [error.message]; }
 const errors=new Set();
 for(const domain of ['ion','compound']) for(const difficulty of ['normal','hard']) for(const complexEnabled of [false,true]) {
  // Check each supported prompt/answer combination so the name-only exception
  // cannot produce an empty formula-answer quiz after a successful save.
  const formats=domain==='ion'?[{ionAnswerPreset:'random'}]:[false,true].flatMap(answerBoth=>[
   {compoundOptions:{promptFormula:true,promptName:false,answerFormula:true,answerName:true,answerBoth}},
   {compoundOptions:{promptFormula:false,promptName:true,answerFormula:true,answerName:true,answerBoth}},
  ]).concat([
   {compoundOptions:{promptFormula:true,promptName:true,answerFormula:true,answerName:false,answerBoth:false}},
   {compoundOptions:{promptFormula:true,promptName:true,answerFormula:false,answerName:true,answerBoth:false}},
  ]);
  for(const format of formats) try {
   const round=buildTenQuestionSet({practiceType:domain,difficulty,complexEnabled,ions:bundle.ions,compounds:bundle.compounds,settings:bundle.difficulty,questionProfile:profile,random:()=>.5,...format});
   if(!round.questions.length)throw new Error('出題できる候補がありません。');
  } catch(error) { errors.add(`${domain==='ion'?'イオン':'化合物'}・${labels[difficulty]}・錯イオン${complexEnabled?'ON':'OFF'}：${error.message}`); }
 }
 return [...errors];
}
function validateAndShow() {
 if(!state)return [];
 const errors=profileProblems(state);
 elements.validationPanel.className=`validation-panel ${errors.length?'invalid':'valid'}`;
 elements.validationPanel.innerHTML=errors.length?`<strong>保存前に出題設定を調整してください。</strong><ul>${errors.map(error=>`<li>${escapeHtml(error)}</li>`).join('')}</ul>`:'<strong>✓ 出題設定を確認しました。</strong><span> 変更はGitHubへの保存と公開完了後、次の学習開始から反映されます。</span>';
 return errors;
}
function ratioMarkup() {
 return `<p class="profile-help">錯イオンON時の割合と、通常問題のカテゴリ配分を調整します。10問単位で端数を切り上げます。</p><div class="profile-rule-grid">${['ion','compound'].flatMap(domain=>['normal','hard'].map(level=>{
  const rule=state.rules[domain][level], candidates=eligible(domain,level), ordinary=candidates.filter(i=>!i.complex), complex=candidates.filter(i=>i.complex);
  const categories=PROFILE_CATEGORIES[domain];
  const weights=categories.map(key=>rule.categoryWeights===null?ordinary.filter(i=>i.category===key).length:(rule.categoryWeights[key]??0));
  const sum=weights.reduce((a,b)=>a+b,0), quota=Math.ceil(10*rule.complexPercent/100);
  return `<section class="profile-rule"><h2>${domain==='ion'?'イオン':'化合物'}・${labels[level]}</h2><label>錯イオン${domain==='compound'?'を含む問題':''}の割合（%）<input type="number" min="${level==='hard'?20:0}" max="100" step="1" value="${rule.complexPercent}" data-rule="percent" data-domain="${domain}" data-level="${level}"></label>${level==='hard'?'<p class="profile-help">ややむずは20%以上です。</p>':''}<p>10問あたり：通常 ${10-quota}問 ／ 錯イオン ${quota}問</p><p>候補数：通常 ${ordinary.length}件 ／ 錯イオン ${complex.length}件</p><h3>通常問題のカテゴリ配分</h3><p class="profile-help">${rule.categoryWeights===null?'各項目を均等に抽選します。':'重みの比率でカテゴリを抽選します。0のカテゴリは出題しません。'}</p>${categories.map((key,i)=>`<label class="profile-weight">${CATEGORY_LABELS[key]}<input type="number" min="0" max="10000" step="1" value="${weights[i]}" aria-label="${domain==='ion'?'イオン':'化合物'} ${labels[level]} ${CATEGORY_LABELS[key]}の重み" data-rule="weight" data-domain="${domain}" data-level="${level}" data-category="${key}"><span>${sum?(weights[i]/sum*100).toFixed(1):'0.0'}%</span></label>`).join('')}<button type="button" data-action="uniform" data-domain="${domain}" data-level="${level}">各項目を均等に戻す</button>${domain==='compound'&&level==='hard'?'<p class="profile-help">1対1の通常化合物は初期状態で除外します。一覧で難易度を指定すると出題対象にできます。</p>':''}</section>`;
 })).join('')}</div><p class="profile-help">候補数は項目数です。解答方式の制約により実際の候補数が変わる場合があります。苦手優先と直近の出題回避は引き続き適用されます。</p>`;
}
function exclusionNote(item,domain) {
 const assignments=state[assignmentKey(domain)], membership=itemDifficulty(item,assignments);
 if(item.complex)return '';
 const blocked=['normal','hard'].filter(level=>(membership===level||membership==='both')&&!eligible(domain,level,false).some(i=>i.id===item.id));
 if(!blocked.length)return '';
 return `<small class="profile-exclusion">${blocked.map(level=>`${labels[level]}：${state.rules[domain][level].categoryWeights===null?'初期の1対1除外（ボタンで指定して解除）':'カテゴリの重み0で除外'}`).join(' ／ ')}</small>`;
}
function listMarkup() {
 const domain=activeTab, assignments=state[assignmentKey(domain)], items=catalog[domain==='ion'?'ions':'compounds'];
 const query=elements.searchInput.value, filter=elements.difficultyFilter.value, complex=elements.complexFilter.value;
 const visible=items.filter(item=>(!query||searchMatches({...item,formula:item.formula},query,'name')||searchMatches(item,query,'formula'))&&(filter==='all'||itemDifficulty(item,assignments)===filter)&&(complex==='all'||item.complex===(complex==='complex')));
 elements.rowCount.textContent=`${visible.length} / ${items.length}件`;
 return `<p class="profile-help">両方のボタンをOFFにすると「出題しない」になります。${domain==='ion'?'イオン単独の設定は化合物の出題に影響しません。':'構成イオンは教材マスターから参照します。'}</p>${visible.length?visible.map(item=>{
  const value=itemDifficulty(item,assignments);
  return `<div class="profile-item" data-item-id="${escapeHtml(item.id)}"><div class="profile-item-description"><strong>${escapeHtml(item.formula||'名称のみ')}</strong> ${escapeHtml(item.name)}<small>${CATEGORY_LABELS[item.category]}${item.complex?`・${domain==='ion'?'錯イオン':'錯イオンを含む'}`:''}</small>${exclusionNote(item,domain)}</div><div class="question-difficulty-toggle" role="group" aria-label="${escapeHtml(item.name)}の出題難易度"><div class="question-difficulty-buttons">${['normal','hard'].map(level=>{
   const selected=value===level||value==='both';return `<button type="button" class="question-difficulty-button" aria-pressed="${selected}" aria-label="${labels[level]}" data-action="difficulty" data-id="${escapeHtml(item.id)}" data-level="${level}"><span aria-hidden="true">${selected?'✓':'&nbsp;'}</span>${labels[level]}</button>`;
  }).join('')}</div><span class="question-difficulty-status ${value==='off'?'is-off':''}" aria-live="polite">${labels[value]}</span></div></div>`;
 }).join(''):'<p class="profile-empty">条件に一致する項目がありません。</p>'}`;
}
function renderActive() {
 if(!state)return;
 elements.listControls.hidden=activeTab==='ratio';
 for(const button of elements.profileTabs.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.tab===activeTab));
 elements.profileContent.innerHTML=activeTab==='ratio'?ratioMarkup():listMarkup();
 updateSaveButton();
}
function download(filename,value,raw=false) {
 const blob=new Blob([raw?value:`${JSON.stringify(value,null,2)}\n`],{type:'application/json'});
 const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}
async function initialize() {
 try {
  const [ions,compounds,difficulty,chemistryPack,profile]=await Promise.all(['data/ions.json','data/compounds.json','data/difficulty.json','data/complex-chemistry.json','data/question-profile.json'].map(fetchJson));
  pack=chemistryPack;bundle=composePublishedBundle({ions,compounds,difficulty},pack);catalog=questionProfileCatalog(bundle);publishedProfile=validateQuestionProfile(profile,catalog);
  const validation=validateData(bundle.ions,bundle.compounds,bundle.difficulty);
  if(!validation.valid)throw new Error(`教材マスターに${validation.errors.length}件のエラーがあります。`);
  const result=await readGithubProfile();
  githubSha=result.sha;publishedProfile=validateQuestionProfile(result.profile,catalog);
  state=clone(publishedProfile);saved=JSON.stringify(state);renderActive();validateAndShow();showStatus("GitHubの共通設定を読み込みました。旧端末内設定は学習に適用しません。");
 } catch(error) {
  elements.validationPanel.className='validation-panel invalid';elements.validationPanel.textContent=`読み込み失敗：${error.message}。初期設定に戻すか、元の保存データを書き出して確認してください。`;
  elements.saveLocal.disabled=true;
 }
 elements.resetLocal.disabled=!publishedProfile;
 initialized=true;
}

elements.profileTabs.addEventListener('click',event=>{
 const button=event.target.closest('[data-tab]');if(!button)return;
 activeTab=button.dataset.tab;elements.searchInput.value='';elements.difficultyFilter.value='all';elements.complexFilter.value='all';renderActive();
});
for(const element of [elements.searchInput,elements.difficultyFilter,elements.complexFilter])element.addEventListener(element===elements.searchInput?'input':'change',renderActive);
elements.profileContent.addEventListener('click',event=>{
 const button=event.target.closest('button[data-action]');if(!button||!state)return;
 if(button.dataset.action==='difficulty') {
  const domain=activeTab, item=catalog[domain==='ion'?'ions':'compounds'].find(i=>i.id===button.dataset.id), key=assignmentKey(domain);
  edit(next=>{next[key][item.id]=toggleItemDifficulty(itemDifficulty(item,next[key]),button.dataset.level);});
  renderActive();
  elements.profileContent.querySelector(`[data-item-id="${CSS.escape(item.id)}"] button[data-level="${button.dataset.level}"]`)?.focus({preventScroll:true});
 } else if(button.dataset.action==='uniform') {
  edit(next=>{next.rules[button.dataset.domain][button.dataset.level].categoryWeights=null;});renderActive();
 }
});
elements.profileContent.addEventListener('change',event=>{
 const input=event.target.closest('input[data-rule]');if(!input||!state)return;
 const {domain,level,category}=input.dataset;
 edit(next=>{
  const rule=next.rules[domain][level];
  if(input.dataset.rule==='percent')rule.complexPercent=Math.max(level==='hard'?20:0,Math.min(100,Math.round(Number(input.value))));
  else {
   rule.categoryWeights ??=Object.fromEntries(PROFILE_CATEGORIES[domain].map(key=>[key,eligible(domain,level,false).filter(item=>item.category===key).length]));
   rule.categoryWeights[category]=Math.max(0,Math.min(10000,Number(input.value)));
  }
 });renderActive();
});
const saveDialog=document.getElementById('github-save-dialog');
const tokenInput=document.getElementById('github-token');
const saveForm=document.getElementById('github-save-form');
const tokenStatus=document.getElementById('github-save-status');
elements.saveLocal.addEventListener('click',()=>{
 if(!state||saving)return;
 if(validateAndShow().length){showStatus('出題できない組み合わせがあります。設定を確認してください。',true);return;}
 tokenStatus.textContent='';saveDialog.showModal();tokenInput.focus();
});
saveDialog.addEventListener('close',()=>{tokenInput.value='';});
document.getElementById('github-save-cancel').addEventListener('click',()=>saveDialog.close());
saveForm.addEventListener('submit',async(event)=>{
 event.preventDefault();if(saving)return;
 const candidate=validateQuestionProfile(state,catalog), token=tokenInput.value;
 tokenInput.value='';saving=true;updateSaveButton();
 saveForm.querySelector('button[type="submit"]').disabled=true;
 tokenStatus.textContent='GitHubへ保存しています…';
 try {
  const result=await writeGithubProfile(candidate,githubSha,token);
  githubSha=result.sha;saved=JSON.stringify(candidate);publishedProfile=clone(candidate);
  saveDialog.close();showStatus('GitHubへ保存しました。Pagesの公開完了後、次の学習開始から反映されます。');
  const link=document.createElement('a');link.href=result.commitUrl;link.textContent=' 保存コミットを確認';link.target='_blank';link.rel='noopener';elements.saveStatus.append(link);
 }catch(error){tokenStatus.textContent=error.message;showStatus('保存できませんでした。変更は画面に残っています。',true);}
 finally{saving=false;saveForm.querySelector('button[type="submit"]').disabled=false;updateSaveButton();}
});
elements.resetLocal.addEventListener('click',()=>{
 if(!publishedProfile||saving||!confirm('画面の変更を取り消し、読み込み時または保存済みの設定に戻しますか？'))return;
 state=clone(publishedProfile);renderActive();validateAndShow();showStatus('画面の変更を取り消しました。');
});
elements.exportProfile.addEventListener('click',()=>{
 if(state)download('question-profile.json',state);
 else {const raw=localStorage.getItem(PROFILE_KEY);if(raw)download('question-profile-backup.json',raw,true);}
});
elements.exportBackup.addEventListener('click',()=>{
 try {const raw=localStorage.getItem(LEGACY_BACKUP_KEY)??localStorage.getItem(LEGACY_DATA_KEY);if(!raw){showStatus('旧教材のバックアップはありません。');return;}download('ionic-formula-legacy-backup.json',raw,true);}
 catch(error){showStatus(`書き出せませんでした：${error.message}`,true);}
});
elements.importFile.addEventListener('change',async()=>{
 const [file]=elements.importFile.files;if(!file||!bundle)return;
 try {
  if(file.size>2_000_000)throw new Error('JSONは2MB以内にしてください。');
  const raw=await file.text(), value=JSON.parse(raw);
  const candidate=value.ions&&value.compounds?profileFromLegacy(value,publishedProfile,bundle,pack):validateQuestionProfile(value,catalog);
  const errors=profileProblems(candidate);if(errors.length)throw new Error(errors[0]);
  // Preserve imported full chemistry before extracting only its settings.
  if(value.ions&&value.compounds)download('ionic-formula-import-backup.json',raw,true);
  state=candidate;renderActive();validateAndShow();showStatus('JSONを読み込みました。内容を確認して保存してください。');
 } catch(error){showStatus(`Import失敗：${error.message}`,true);}
 finally{elements.importFile.value='';}
});
window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
function lockEditor() {
  elements.editor.hidden = true;
  elements.lockScreen.hidden = false;
  elements.unlockForm.reset();
  elements.changePasswordForm.reset();
  elements.unlockStatus.textContent = "";
  elements.changePasswordStatus.textContent = "";
  elements.unlockPassword.focus();
}

elements.unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.unlockStatus.textContent = "";
  try {
    const record = currentPasswordRecord(localStorage, INITIAL_PASSWORD_RECORD);
    if (!await verifyPassword(elements.unlockPassword.value, record)) {
      elements.unlockStatus.textContent = "パスワードが違います。";
      return;
    }
    elements.unlockForm.reset();
    elements.lockScreen.hidden = true;
    elements.editor.hidden = false;
    if (!initialized) await initialize();
  } catch {
    elements.unlockStatus.textContent = "認証設定を読み込めませんでした。";
  }
});

elements.lockButton.addEventListener("click", lockEditor);
elements.changePasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.changePasswordStatus.textContent = "";
  const current = document.getElementById("current-password").value;
  const next = document.getElementById("new-password").value;
  const confirmation = document.getElementById("confirm-password").value;
  try {
    await changeAdminPassword(current, next, confirmation, { storage: localStorage, initialRecord: INITIAL_PASSWORD_RECORD });
    lockEditor();
    elements.unlockStatus.textContent = "パスワードを変更しました。新しいパスワードで解錠してください。";
  } catch (error) {
    elements.changePasswordStatus.textContent = error.message;
  }
});
