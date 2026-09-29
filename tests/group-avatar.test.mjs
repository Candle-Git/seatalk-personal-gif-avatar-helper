import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../SeaTalk-Personal-GIF-Avatar-Helper.user.js', import.meta.url), 'utf8');
function setup() {
  const calls = [], events = [], timers = [];
  let now = 0;
  const props = { info: { type: 'group', id: 12, name: 'Test', icons: [] }, actions: { actionChangeGroupInfo: x => calls.push(x) } };
  const wrapper = { getClientRects: () => [1], querySelector: () => element.parentElement };
  const element = { closest: () => wrapper, getClientRects: () => [], __reactFiber$test: { memoizedProps: props } };
  const doc = { querySelectorAll: () => [element] };
  const code = source.slice(source.indexOf('    let groupRevision ='), source.indexOf('    function startDirectAvatar'));
  const ctx = vm.createContext({ URL, location: {href:"https://seatalkweb.com"}, getComputedStyle: () => ({backgroundImage:"none"}), document: doc, runtime: {}, emit: x => events.push(x), Date: { now: () => now }, isValidGifId: x => x === 'gif', window: { setInterval: fn => (timers.push(fn), timers.length), clearInterval() {} } });
  vm.runInContext(code + '\nthis.api={refreshGroupContext,applyGroupAvatar};',ctx);
  const request = () => {ctx.api.refreshGroupContext(); return { id: 12, name: 'Test', revision: events.at(-1).context.revision, requestId: 1, gifId: 'gif' };};
  return { props, element, wrapper, doc, calls, events, timers, api:ctx.api, request, advance: () => {now = 21000;} };
}
test('group: submits only avatar field to confirmed group', () => {
 const f=setup(); f.api.applyGroupAvatar(f.request());
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{gid:12,info:{i:['gif']}}]);
 f.props.info.icons=['gif']; f.timers.at(-1)(); assert.equal(f.events.at(-1).code,'GROUP_OBSERVED');
});
test('group: switch away and back invalidates confirmation', () => {
 const f=setup(), d=f.request(); f.props.info.id=13;f.api.refreshGroupContext();f.props.info.id=12;f.api.refreshGroupContext();f.api.applyGroupAvatar(d);
 assert.equal(f.calls.length,0);assert.equal(f.events.at(-1).code,'GROUP_TARGET_CHANGED');
});
test('group: private chat, missing editor and invalid GIF cannot submit', () => {
 for(const mode of ['private','missing','invalid']) {const f=setup(),d=f.request();if(mode==='private')f.props.info.type='user';if(mode==='missing')f.doc.querySelectorAll=()=>[];if(mode==='invalid')d.gifId='bad';f.api.applyGroupAvatar(d);assert.equal(f.calls.length,0);}
});
test('group: timeout retains lock and duplicate cannot submit',()=>{
 const f=setup(),d=f.request();f.api.applyGroupAvatar(d);f.advance();f.timers.at(-1)();assert.equal(f.events.at(-1).code,'GROUP_PENDING');f.api.applyGroupAvatar({...d,requestId:2});assert.equal(f.calls.length,1);
});
test('group: synchronous throw remains unconfirmed and locked',()=>{
 const f=setup(),d=f.request();f.props.actions.actionChangeGroupInfo=()=>{throw Error('unknown')};f.api.applyGroupAvatar(d);assert.equal(f.events.at(-1).code,'GROUP_PENDING');f.props.actions.actionChangeGroupInfo=x=>f.calls.push(x);f.api.applyGroupAvatar({...d,requestId:2});assert.equal(f.calls.length,0);
});

test('group: hidden hover overlay still recognizes visible editor',()=>{
 const f=setup(); const d=f.request();assert.equal(d.id,12);f.api.applyGroupAvatar(d);assert.equal(f.calls.length,1);
});
test('group: hidden editor invalidates confirmed target',()=>{
 const f=setup(),d=f.request();f.wrapper.getClientRects=()=>[];f.api.applyGroupAvatar(d);assert.equal(f.calls.length,0);
});
test('group: rendered avatar confirms stale React props and unlocks next update',()=>{
 const f=setup(),d=f.request();
 f.element.parentElement={querySelectorAll:()=>[{tagName:'IMG',src:'https://example.test/download/gif_80?token=redacted'}]};
 f.api.applyGroupAvatar(d);f.timers.at(-1)();assert.equal(f.events.at(-1).code,'GROUP_OBSERVED');
 f.api.applyGroupAvatar({...d,requestId:2});assert.equal(f.calls.length,2);
});
test('group: late observation after timeout unlocks without refreshing',()=>{
 const f=setup(),d=f.request();f.api.applyGroupAvatar(d);f.advance();f.timers.at(-1)();
 assert.equal(f.events.at(-1).code,'GROUP_PENDING');const n=f.events.length;f.timers.at(-1)();assert.equal(f.events.length,n);
 f.props.info.icons=['gif'];f.timers.at(-1)();assert.equal(f.events.at(-1).code,'GROUP_OBSERVED');
 f.api.applyGroupAvatar({...d,requestId:2});assert.equal(f.calls.length,2);
});
test('group: unrelated resource or different group never confirms',()=>{
 const f=setup(),d=f.request();f.element.parentElement={querySelectorAll:()=>[{tagName:'IMG',src:'https://example.test/file/notgif?gif'}]};
 f.api.applyGroupAvatar(d);f.timers.at(-1)();assert.notEqual(f.events.at(-1).code,'GROUP_OBSERVED');
 f.props.info.id=13;f.props.info.icons=['gif'];f.timers.at(-1)();assert.notEqual(f.events.at(-1).code,'GROUP_OBSERVED');
});
