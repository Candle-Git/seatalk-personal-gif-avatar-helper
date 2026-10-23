import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../tools/helper-split-layout.js', import.meta.url), 'utf8');
const plan = vm.runInNewContext(source.slice(0, source.indexOf('function installHelperLayout()')) + '\nplanHelperSplit');
test('wide favorites layout reserves at least 900px of native chat without browser scaling', () => {
 const p=plan(1920,'favorites');assert.equal(p.width,730);assert.equal(p.nativeWidth,1154);assert.ok(p.nativeWidth>=900);
});
test('avatar helper uses compact sidebar with the same native minimum',()=>{
 const p=plan(1440,'avatar');assert.equal(p.width,390);assert.equal(p.nativeWidth,1014);
});
test('inadequate viewport, missing native window or no helper keeps original layout',()=>{
 assert.equal(plan(1280,'favorites'),null);assert.equal(plan(1270,'avatar'),null);
 assert.equal(plan(1920,'favorites',undefined,false),null);assert.equal(plan(1920,null),null);
});
test('divider extremes never collapse the native chat or exceed sidebar limits',()=>{
 for(const viewport of [1396,1440,1600,1920,2560])for(const preferred of [-9999,0,460,650,99999,NaN,Infinity]){
  const p=plan(viewport,'favorites',preferred);assert.ok(p.width>=460);assert.ok(p.width<=800);assert.ok(p.nativeWidth>=900);
 }
});
test('enough viewport width is needed before automatic docking resumes',()=>{
 assert.equal(plan(1395,'favorites'),null);assert.equal(plan(1396,'favorites').width,460);
 assert.equal(plan(1275,'avatar'),null);assert.equal(plan(1276,'avatar').width,340);
});
