import test from 'node:test';
import assert from 'node:assert/strict';
import { readGithubProfile, writeGithubProfile } from '../js/github-profile.js';
const profile={version:1};
test('reads main JSON and its revision',async()=>{
 const result=await readGithubProfile(async(url,options)=>{assert.match(url,/ref=main/);assert.equal(options.cache,'no-store');return new Response(JSON.stringify({sha:'old',content:Buffer.from(JSON.stringify(profile)).toString('base64')}));});
 assert.deepEqual(result,{profile,sha:'old'});
});
test('writes only designated file with old revision and transient credential',async()=>{
 const result=await writeGithubProfile(profile,'old','test-only',async(url,options)=>{
 assert.equal(url,'https://api.github.com/repos/KoiChem/IonicFormula/contents/data/question-profile.json');
 assert.equal(options.headers.Authorization,'Bearer test-only');
 const body=JSON.parse(options.body);assert.equal(body.sha,'old');assert.equal(body.branch,'main');assert.deepEqual(JSON.parse(Buffer.from(body.content,'base64').toString()),profile);
 return new Response(JSON.stringify({commit:{sha:'new',html_url:'https://github.com/KoiChem/IonicFormula/commit/new'},content:{sha:'newfile'}}));});
 assert.equal(result.sha,'newfile');
});
test('conflict and invalid permissions have actionable errors without echoing token',async()=>{
 for(const status of [409,401,403,422])await assert.rejects(()=>writeGithubProfile(profile,'old','secret',async()=>new Response('{"message":"secret"}',{status})),error=>!error.message.includes('secret'));
});
test('refuses missing credential or revision before sending',async()=>{
 await assert.rejects(()=>writeGithubProfile(profile,'','token',()=>assert.fail('network')));
 await assert.rejects(()=>writeGithubProfile(profile,'sha','',()=>assert.fail('network')));
});
