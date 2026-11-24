import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = ['personal-settings-core','workspace-account','sticker-send-core','sticker-send-ui','quick-picker-workspace']
  .map(name => fs.readFileSync(new URL('../tools/' + name + '.js', import.meta.url), 'utf8')).join('\n');
const id = n => 'f'.repeat(33) + 'b0705' + String(n).padStart(26,'0');

function fixture() {
  let account = 7, chat = 7;
  let list = [{id:id(1),name:'Office'}, {url:id(2),name:'Vacation'}];
  const messages = {}, sends = [], subscribers = new Set();
  const services = {
    store:{
      getState:() => ({messages:{customStickers:list,selectedSession:{id:chat,type:'buddy'},messages},contact:{userInfo:{7:{name:'Me'},8:{name:'Second'}}}}),
      subscribe:fn => { subscribers.add(fn); return () => subscribers.delete(fn); },
    },
    accountId:() => account, tag:'sticker', previewDimensions:async () => ({width:16,height:16}),
    sendSticker({session,customSticker}) {
      sends.push(session.id);
      const cid = String(sends.length);
      messages['buddy-' + session.id + '-' + cid] = {cid,mid:cid.padStart(16,'0'),serverTimeStamp:1,senderId:account,tag:'sticker',content:{fileId:customSticker.url}};
      for (const notify of subscribers) notify();
    },
  };
  const fakeButton = {addEventListener() {},setAttribute() {},removeAttribute() {}};
  const context = vm.createContext({
    services, __SPGA_TEST_MODE__:true, host:{}, $:() => fakeButton, count() {}, ui:(zh,en) => en,
    document:{querySelectorAll:() => [{getClientRects:() => [1]}]}, liveSource(){throw Error('native Favorites not mounted');},
    assertWorkspaceAccount(){if(account!==7) throw Error('changed');},setTimeout,clearTimeout,
  });
  const api = vm.runInContext(source + `
    let sendingBusy=false,sendPreparing=false,metadataSaving=false,scanning=false;
    const busy=()=>sendingBusy || sendPreparing;
    const initial={services,account:7,target:currentStickerSendTarget(services,true),status:{},grid:$()};
    quickView=initial;
    ({accept:acceptQuickStickerClick, rows:quickFavoriteRows, filter:filterQuickFavorites, list:() => currentQuickList(services),
      run:gifId=>sendQuickSticker(initial,{gifId}), discard:()=>{quickView=null;}, uncertain:()=>sendUncertain,
      status:()=>initial.status.textContent})
    `,context);
  const notify = () => { for (const fn of subscribers) fn(); };
  return {api,sends,services, subscribers, setChat(value){chat=value;notify();},setAccount(value){account=value;notify();},setList(value){list=value;notify();}};
}

test('quick filters use private notes, metadata and both search terms, keep native order, and ignore duplicate IDs', () => {
  const {api}=fixture();
  const list=[{id:id(1),name:'First'},{url:id(2),name:'Second'},{id:id(1),name:'Repeated'},{id:'broken'}];
  const records=new Map([[id(1),{name:'',note:'Team greeting',keywords:['ＨＥＬＬＯ']}],[id(2),{name:'New Year',visibleText:'2027'}]]);
  const rows=api.rows(list,records,new Map(),String);
  assert.equal(rows.length,2);
  assert.equal(api.filter(rows,'first hello',true)[0].gifId,id(1));
  assert.equal(api.filter(rows,'2027 year',true)[0].gifId,id(2));
  assert.equal(api.filter(rows,'',false)[0].gifId,id(2));
  assert.equal(rows[0].gifId,id(1));
});

test('only one trusted click in a double-click gesture sends; keyboard activation and a later click work', async () => {
  const {api,sends}=fixture();
  assert.equal(api.accept({isTrusted:false,detail:1},{}),false);
  assert.equal(api.accept({isTrusted:true,detail:0},{}),true);
  const replaced={button:{isConnected:false},time:100,x:60,y:100};
  assert.equal(api.accept({isTrusted:true,detail:1,timeStamp:180,clientX:61,clientY:102},{},replaced),false);
  assert.equal(api.accept({isTrusted:true,detail:1,timeStamp:1200,clientX:61,clientY:102},{},replaced),true);
  for (const detail of [1,2,1]) if (api.accept({isTrusted:true,detail},{})) await api.run(id(1));
  assert.deepEqual(sends,[7,7]);
  assert.equal(api.status(),'Sent');
});

test('quick can read already-loaded favorites without opening the native picker, and describes a cold empty store as unverified', () => {
  const f=fixture();
  assert.equal(f.api.list().rows.length,2);
  f.setList([]);
  assert.equal(f.api.list().verified,false);
});

for (const reason of ['chat','account','closed','removed','inflight']) {
  test('one-tap sticker handles ' + reason + ' during image decoding', async () => {
    const f=fixture();
    let resume;
    f.services.previewDimensions=()=>new Promise(resolve=>{resume=()=>resolve({width:32,height:32});});
    const first=f.api.run(id(1));
    switch (reason) {
      case 'chat': f.setChat(8); f.setChat(7); break;
      case 'account': f.setAccount(9); f.setAccount(7); break;
      case 'closed': f.api.discard(); break;
      case 'removed': f.setList([{id:id(2)}]); break;
      case 'inflight': await f.api.run(id(1)); break;
    }
    resume(); await first;
    assert.deepEqual(f.sends,reason==='inflight'?[7]:[]);
    assert.equal(f.api.uncertain(),false);
    assert.equal(f.subscribers.size,0);
  });
}

test('quick prevents further sends when the native sender rejects without a receipt',async()=>{
  const f=fixture();
  let issued=0;
  f.services.sendSticker=()=>{issued++;return Promise.reject(Error('fixture'));};
  await f.api.run(id(1));
  assert.equal(f.api.uncertain(),true);
  await f.api.run(id(1));
  assert.equal(issued,1);
});
