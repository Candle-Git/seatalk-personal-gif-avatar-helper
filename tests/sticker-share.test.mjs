import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx = vm.createContext({ TextEncoder, TextDecoder, btoa, atob });
vm.runInContext(fs.readFileSync(new URL('../tools/sticker-share.js', import.meta.url), 'utf8') + '\nthis.api={encodeStickerShare,decodeStickerShare,addSharedStickers};',ctx);
const { encodeStickerShare: encode, decodeStickerShare: decode, addSharedStickers: add } = ctx.api;
const id = n => 'a'.repeat(33) + 'b0705' + String(n).padStart(26,'0');
const sticker = n => ({gifId:id(n),label:'猫猫🐱 '+n});
const data = value => JSON.parse(JSON.stringify(value));
const raw = value => 'STGIF1.' + Buffer.from(JSON.stringify(value)).toString('base64url');
test('Unicode share code round trip contains only names and resource IDs',()=>{
 const code=encode([sticker(1),sticker(2)]);
 assert.match(code,/^STGIF1\.[A-Za-z0-9_-]+$/);
 assert.deepEqual(data(decode(code)),[sticker(1),sticker(2)]);
 assert.deepEqual(JSON.parse(Buffer.from(code.slice(7),'base64url').toString()),{v:1,stickers:[sticker(1),sticker(2)]});
});
test('duplicate resource IDs are collapsed',()=>assert.equal(decode(encode([sticker(1),sticker(1)])).length,1));
test('100 maximum-length Unicode names generate a readable code within the limit',()=>{
 const items=Array.from({length:100},(_,n)=>({...sticker(n),label:'猫'.repeat(80)}));
 const code=encode(items);assert.ok(code.length<65536);assert.equal(decode(code).length,100);
});
for(const value of ['', 'http://example.test', 'STGIF2.abc', 'STGIF1.%%%%', raw({v:2,stickers:[sticker(1)]}),
 raw({v:1,stickers:[sticker(1)],token:'secret'}), raw({v:1,stickers:[{...sticker(1),url:'https://example.test/?token=secret'}]}),
 raw({v:1,stickers:[{...sticker(1),gifId:'x'.repeat(64)}]}), raw({v:1,stickers:[]})]) {
 test('reject malformed or unsupported share data '+value.slice(0,30),()=>assert.throws(()=>decode(value)));
}
test('encoder rejects empty, excessive, signed or invalid input',()=>{
 for(const input of [[],Array.from({length:101},(_,n)=>sticker(n)),[{...sticker(1),token:'secret'}],[{...sticker(1),label:'\n'}]])assert.throws(()=>encode(input));
});
function fixture(options={}){
 const calls=[],saved=new Set(options.saved||[]),messages=[];let account=123, stopped=false, pauses=0;
 const adapters={accountId:()=>account,active:()=>options.active!==false,stopped:()=>stopped,
 has:id=>saved.has(id),report:t=>messages.push(t),
 async add(item){calls.push(data(item));if(options.throw)throw Error('native failure');if(!options.unconfirmed)saved.add(item.gifId);if(options.switch)account=456;if(options.stop)stopped=true;},
 async pause(){pauses++;},};
 return {run:()=>add([1,2,3].map(n=>({...sticker(n),width:170,height:170})),adapters),calls,messages,get pauses(){return pauses}};
}
test('confirmed batch adds only selected descriptors and skips saved IDs',async()=>{
 const f=fixture({saved:[id(2)]});const result=await f.run();assert.deepEqual(data(result),{added:2,skipped:1,stopped:false});assert.deepEqual(f.calls.map(i=>i.gifId),[id(1),id(3)]);
});
test('stopping waits for current result and prevents later additions',async()=>{
 const f=fixture({stop:true});assert.equal((await f.run()).added,1);assert.equal(f.calls.length,1);
});
test('account switch stops the batch after one native call',async()=>{
 const f=fixture({switch:true});await assert.rejects(f.run(),/账号或窗口状态已变化/);assert.equal(f.calls.length,1);
});
test('unconfirmed first result stops without retries or later additions',async()=>{
 const f=fixture({unconfirmed:true});await assert.rejects(f.run(),/尚未确认/);assert.equal(f.calls.length,1);assert.equal(f.pauses,40);
});
test('native rejection stops without retry',async()=>{
 const f=fixture({throw:true});await assert.rejects(f.run(),/添加请求未确认/);assert.equal(f.calls.length,1);
});
test('inactive account/window makes no native calls',async()=>{
 const f=fixture({active:false});await assert.rejects(f.run(),/状态已变化/);assert.equal(f.calls.length,0);
});
test('bad preview dimensions cannot call native action',async()=>{
 let calls=0;await assert.rejects(add([{...sticker(1),width:0,height:170}],{add:()=>calls++}),/先预览/);assert.equal(calls,0);
});
