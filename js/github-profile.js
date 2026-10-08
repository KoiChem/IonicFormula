// Credentials exist only in the caller's memory; never persist or log them.
const ENDPOINT='https://api.github.com/repos/KoiChem/IonicFormula/contents/data/question-profile.json';
const HEADERS={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
function apiError(status) {
 if(status===409||status===422)return new Error('GitHubの設定が更新された可能性があります。JSONを書き出して変更を保全し、画面を再読み込みしてください。');
 if(status===401)return new Error('トークンが無効または期限切れです。');
 if(status===403)return new Error('GitHubの書き込み権限またはAPI利用制限を確認してください。対象リポジトリのContentsをRead and writeにしてください。');
 return new Error(`GitHubとの通信に失敗しました（${status}）。変更は画面に残っています。`);
}
function encode(text){return btoa(Array.from(new TextEncoder().encode(text),byte=>String.fromCharCode(byte)).join(''));}
function decode(text){return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0)));}
export async function readGithubProfile(request=fetch) {
 const response=await request(`${ENDPOINT}?ref=main`,{cache:'no-store',headers:HEADERS});
 if(!response.ok)throw apiError(response.status);
 const data=await response.json();
 if(!data.sha||typeof data.content!=='string')throw new Error('GitHubの設定ファイルを確認できません。');
 return {profile:JSON.parse(decode(data.content)),sha:data.sha};
}
export async function writeGithubProfile(profile,sha,token,request=fetch) {
 if(!sha)throw new Error('保存元の版を確認できません。画面を再読み込みしてください。');
 if(!token.trim())throw new Error('GitHubトークンを入力してください。');
 const response=await request(ENDPOINT,{method:'PUT',cache:'no-store',headers:{...HEADERS,Authorization:`Bearer ${token.trim()}`,'Content-Type':'application/json'},body:JSON.stringify({message:'Update question settings from admin',branch:'main',sha,content:encode(`${JSON.stringify(profile,null,2)}\n`)})});
 if(!response.ok)throw apiError(response.status);
 const data=await response.json();
 return {sha:data.content.sha,commitUrl:data.commit.html_url};
}
