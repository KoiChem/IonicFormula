import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
test('supplementary evidence and color survive independently of playable chemistry',async()=>{
 const compounds=await load('../data/compounds.json');const pack=await load('../data/complex-chemistry.json');const metadata=await load('../data/chemistry-metadata.json');
 const chloride=compounds.find(i=>i.id==='sodium_chloride');
 assert.equal(Object.hasOwn(chloride,'solidColor'),false);
 assert.equal(Object.hasOwn(compounds.find(i=>i.id==='chromium3_chloride'),'referenceUrl'),false);
 assert.match(metadata.compounds.chromium3_chloride.referenceUrl,/^https:\/\/pubchem\.ncbi\.nlm\.nih\.gov\/compound\//);
 assert.equal(metadata.compounds.salt_k_au_cl_2.evidence.status,'unverified');
 assert.equal(metadata.ions.complex_ag_nh3_2.curriculumLevel,'standard');
 assert.equal(Object.hasOwn(pack.ions[0],'evidence'),false);
 assert.equal(Object.hasOwn(pack.ions[0],'curriculumLevel'),false);
 assert.ok(pack.ions[0].complex.ligands.length>0);
});
