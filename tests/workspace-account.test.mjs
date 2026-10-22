import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const helper=fs.readFileSync(new URL('../tools/workspace-account.js',import.meta.url),'utf8');
const tasks=fs.readFileSync(new URL('../tools/favorites-tasks.js',import.meta.url),'utf8');
const {createWorkspaceAccountGuard:bind}=vm.runInNewContext(helper+'\n({createWorkspaceAccountGuard,nativeWorkspaceAccountId})');
test('unknown or replaced account snapshot fails before enabling mutations',()=>{
 const original=[];assert.throws(()=>bind({session:{loggedIn:false,userId:1}},original,()=>original));
 assert.throws(()=>bind({session:{loggedIn:true,userId:1}},original,()=>[]));
});
test('live namespace getter detects replacement even if an old session object remains logged in',()=>{
 const original=[],services={session:{loggedIn:true,userId:1},accountId:()=>current};let current=1;
 const check=bind(services,original,()=>original);assert.equal(check(),1);current=2;assert.throws(check,/登录账号已变化/);
});
function fixture({binding=true,switchOnRemove=false,throwOnRemove=false}={}){
 let account=1,calls=[],list=[{id:'one'},{id:'two'}];const original=list;
 const items=list.map(item=>({gifId:item.id,label:item.id,url:'https://example.test/'+item.id,selected:true}));
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,hidden:false,replaceChildren(){},append(){},focus(){},addEventListener(){}});return nodes.get(id)};
 const check=binding?bind({accountId:()=>account},original,()=>list):()=>{throw Error('not bound')};
 const context=vm.createContext({items,scanning:false,deleting:false,stop:false,deleteNeedsReview:false,pending:[],importingBusy:false,
  busy:()=>false,selection:()=>items.filter(i=>i.selected&&!i.deleted),selectionOutside:()=>0,assertWorkspaceAccount:check,
  $:node,document:{createElement:()=>({})},count(){},render(){},openDialog(){node('#deletion').open=true;return true},closeDialog(){},
  setTimeout:fn=>queueMicrotask(fn),
  liveSource:()=>({list,actions:{async actionRemoveCustomStickers(ids){calls.push([...ids]);if(throwOnRemove)throw Error('private');list=list.filter(i=>!ids.includes(i.id));if(switchOnRemove){account=2;list=[{id:'one'},{id:'two'}];}}}}),
 });
 vm.runInContext(tasks.slice(tasks.indexOf('  const pause =')),context);
 return {open:()=>node('#remove').onclick(),confirm:()=>node('#deleteConfirm').onclick(),setAccount:id=>account=id,calls,node,items};
}
test('account switch after confirmation preview prevents any deletion',async()=>{
 const f=fixture();f.open();f.setAccount(2);await f.confirm();assert.equal(f.calls.length,0);assert.match(f.node('#deleteProgress').textContent,/账号已变化/);
});
test('account switch during first deletion cannot delete a shared resource in the next account',async()=>{
 const f=fixture({switchOnRemove:true});f.open();await f.confirm();assert.deepEqual(f.calls,[['one']]);assert.equal(f.items[1].deleted,undefined);
});
test('normal account-bound removal still processes the confirmed selection once',async()=>{
 const f=fixture();f.open();await f.confirm();assert.deepEqual(f.calls,[['one'],['two']]);assert.ok(f.items.every(i=>i.deleted&&!i.selected));
});
test('unbound workspace never opens removal or calls native actions',async()=>{
 const f=fixture({binding:false});f.open();await f.confirm();assert.equal(f.calls.length,0);assert.ok(!f.node('#deletion').open);
});
test('native exception stops batch without retry and hides raw error',async()=>{
 const f=fixture({throwOnRemove:true});f.open();await f.confirm();assert.equal(f.calls.length,1);assert.doesNotMatch(f.node('#deleteProgress').textContent,/private/);
});
