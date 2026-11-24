import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({TextEncoder,TextDecoder,btoa,atob});
vm.runInContext(fs.readFileSync(new URL('../tools/personal-settings-core.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../tools/sticker-send-core.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../tools/sticker-share.js',import.meta.url),'utf8')+';this.api={splitPersonalKeywords,applyPersonalRecordEdit,normalizePersonalRecord,parsePersonalImport,readPersonalImportFile,exportPersonalSettings,mergePersonalRecord,personalMetadataMatches,validateSettingsSnapshot,mergeSharedPersonalRecord,planPersonalOrganization,personalBackupEntries,mergePersonalBackup,sendSelectedStickers,currentStickerSendTarget,sameStickerSendTarget,findStickerSendReceipt,encodeStickerShare,decodeStickerShare};',ctx);
const api=ctx.api,plain=v=>JSON.parse(JSON.stringify(v));
const id=n=>'a'.repeat(33)+'b0705'+String(n).padStart(26,'0');
const row=(n,extra={})=>({gifId:id(n),name:'Work '+n,keywords:['office','工作'],visibleText:'工作',note:'private',source:'manual',...extra});
test('schema 3 backs up public sticker fields and typed review state only',()=>{
  const source=row(1,{visibleText:'on image',note:'not for export',reviewReason:'internal review',needsReview:true,confidence:'low',animationOverride:'static'});
  const file=api.exportPersonalSettings([source]);
  const doc=JSON.parse(file), r=api.parsePersonalImport(file);
  assert.equal(doc.schema,3);assert.equal(r.kind,'backup');
  assert.deepEqual(doc.items[0],{gifId:id(1),name:'Work 1',keywords:['office','工作'],source:'manual',confidence:'low',needsReview:true,animationOverride:'static'});
  for (const text of ['on image','not for export','internal review','visibleText','"note"','reviewReason']) assert.ok(!file.includes(text));
  assert.equal(r.items[0].note,'');assert.equal(r.items[0].animationOverride,'static');
  assert.deepEqual(JSON.parse(api.exportPersonalSettings([])).items,[]);
});
test('a large restorable account with non-ASCII keywords round trips through the file import path',async()=>{
  const limit=10*1024*1024;
  const keywords=Array.from({length:30},(_,i)=>'字'.repeat(57)+i);
  const records=Array.from({length:4600},(_,i)=>api.normalizePersonalRecord({gifId:id(i),name:'名称',keywords}));
  assert.ok(JSON.stringify({kind:'save',revision:1,items:records,groups:[]}).length<limit);
  const file=new Blob([api.exportPersonalSettings(records)]);
  assert.ok(file.size>limit);
  const restored=await api.readPersonalImportFile(file);
  assert.equal(restored.items.length,records.length);
  assert.deepEqual(plain(restored.items.at(-1).keywords),keywords);
  const tooLarge={size:3*limit+1,text:()=>assert.fail('oversize file was read')};
  await assert.rejects(api.readPersonalImportFile(tooLarge),/METADATA_INVALID/);
  assert.throws(()=>api.parsePersonalImport(' '.repeat(limit+1)),/METADATA_INVALID/);
});
test('candidate files retain classification and reject legacy descriptive fields',()=>{
  const item={gifId:id(1),index:1,name:'Office',keywords:['work'],confidence:'low',needsReview:true};
  const parse=item=>api.parsePersonalImport(JSON.stringify({metadata:{count:1},items:[item]}));
  assert.equal(parse(item).items[0].source,'ai');assert.equal(parse(item).items[0].needsReview,true);
  for (const field of ['note','visibleText','reviewReason','url']) assert.throws(()=>parse({...item,[field]:''}),/METADATA_INVALID/);
});
test('old public import files are rejected independently of live account storage',()=>{
  for (const schema of [1,2]) assert.throws(()=>api.parsePersonalImport(JSON.stringify({kind:'seatalk-personal-settings',schema,items:[]})),/METADATA_INVALID/);
  assert.throws(()=>api.parsePersonalImport(JSON.stringify([{gifId:id(1),label:'Old label'}])),/METADATA_INVALID/);
});
test('strict schema 3 validation rejects legacy fields, duplicates, invalid IDs and unknown top-level data',()=>{
  const item={gifId:id(1),name:'One',keywords:[]};
  const backup={kind:'seatalk-personal-settings',schema:3,items:[item],groups:[]};
  for(const value of [{...backup,items:[{...item,url:'https://example.test'}]},{...backup,items:[{...item,note:'secret'}]},{...backup,items:[{...item,visibleText:'secret'}]},{...backup,items:[{...item,reviewReason:'secret'}]},{...backup,items:[item,item]},{...backup,items:[{...item,gifId:'invalid'}]},{...backup,token:'secret'}])assert.throws(()=>api.parsePersonalImport(JSON.stringify(value)),/METADATA_/);
});
test('manual names survive default merges while keywords deduplicate case-insensitively',()=>{const merged=api.mergePersonalRecord(row(1,{name:'Mine',keywords:['Office']}),row(1,{name:'Shared',keywords:['office','工作'],source:'shared'}));assert.equal(merged.name,'Mine');assert.equal(merged.source,'manual');assert.equal(merged.note,'private');assert.deepEqual(plain(merged.keywords),['Office','工作']);});
test('explicit replacement uses incoming name and can avoid keyword merging',()=>{const merged=api.mergePersonalRecord(row(1),row(1,{name:'Incoming',keywords:['new']}),true,false);assert.equal(merged.name,'Incoming');assert.deepEqual(plain(merged.keywords),['new']);});
test('search covers name, keywords, visible text and private notes with AND terms',()=>{assert.equal(api.personalMetadataMatches(row(1),'OFFICE 工作'),true);assert.equal(api.personalMetadataMatches(row(1),'private'),true);assert.equal(api.personalMetadataMatches(row(1),'work absent'),false);});
test('share v3 transfers names and keywords only',()=>{
  const share={gifId:id(1),label:'Office',keywords:['work','WORK']};
  const code=api.encodeStickerShare([share]);
  assert.match(code,/^STGIF3\./);
  assert.deepEqual(plain(api.decodeStickerShare(code)),[{...share,keywords:['work']}]);
  for (const field of ['visibleText','note','reviewReason']) assert.throws(()=>api.encodeStickerShare([{...share,[field]:'private'}]));
});
test('share maximum keyword and name payload fits a full selection',()=>{
  const stickers=Array.from({length:100},(_,n)=>({gifId:id(n),label:'猫'.repeat(80),keywords:Array.from({length:30},(_,i)=>String(i)+'字'.repeat(57))}));
  assert.equal(api.decodeStickerShare(api.encodeStickerShare(stickers)).length,100);
});
test('account snapshots require a nonnegative integer revision and bounded records',()=>{assert.equal(api.validateSettingsSnapshot({schema:1,revision:0,items:[]}).revision,0);assert.throws(()=>api.validateSettingsSnapshot({schema:1,revision:-1,items:[]}));});
function sendFixture(options={}){let account=1,target=42,stopped=false,called=0,guardCalls=0;const issued=[];return {issued,run:()=>api.sendSelectedStickers([1,2].map(n=>({gifId:id(n)})),{guard(){guardCalls++;if(account!==1||target!==42)throw Error('CHANGED');},stopped:()=>stopped,async preview(){if(options.switchPreview)target=43;return {width:170,height:170};},async send(item){called++;issued.push(item.gifId);if(options.reject)throw Error('native raw error');return {};},async receipt(){if(options.switchReceipt)account=2;if(options.stop)stopped=true;return options.pending?'pending':options.failed?'failed':'confirmed';},pause:async()=>{},report(){}})};}
test('sending is sequential and proceeds only after confirmed receipts',async()=>{const f=sendFixture();assert.equal((await f.run()).sent,2);assert.deepEqual(f.issued,[id(1),id(2)]);});
test('switching targets during preview prevents the first native send',async()=>{const f=sendFixture({switchPreview:true});await assert.rejects(f.run(),/CHANGED/);assert.equal(f.issued.length,0);});
test('account switch after native send stops later stickers',async()=>{const f=sendFixture({switchReceipt:true});await assert.rejects(f.run(),/CHANGED/);assert.equal(f.issued.length,1);});
test('unconfirmed send has no automatic retry or later sends',async()=>{const f=sendFixture({pending:true});await assert.rejects(f.run(),/SEND_UNCONFIRMED/);assert.equal(f.issued.length,1);});
test('native rejection is sanitized and never retried',async()=>{const f=sendFixture({reject:true});await assert.rejects(f.run(),/SEND_UNCONFIRMED/);assert.equal(f.issued.length,1);});
test('stop waits for the current receipt before skipping later sends',async()=>{const f=sendFixture({stop:true});const result=await f.run();assert.equal(result.sent,1);assert.equal(result.stopped,true);assert.equal(f.issued.length,1);});
test('thread and missing-name targets are rejected',()=>{const services={store:{getState:()=>({messages:{selectedSession:{id:42,type:'group'},currentThreadId:'thread'},contact:{groupInfo:{42:{name:'Demo'}}}})}};assert.throws(()=>api.currentStickerSendTarget(services,true));});
test('receipt needs a new CID, matching sender/target/resource and a server timestamp',()=>{const target={id:42,type:'group'},message={cid:'new',mid:'00000000000000af',serverTimeStamp:1,senderId:1,tag:'sticker',content:{fileId:id(1)}};assert.equal(api.findStickerSendReceipt({'group-42-x':message},new Set(),target,id(1),1,'sticker').status,'confirmed');for(const altered of [{...message,serverTimeStamp:0},{...message,mid:'local'},{...message,senderId:2}])assert.notEqual(api.findStickerSendReceipt({'group-42-x':altered},new Set(),target,id(1),1,'sticker').status,'confirmed');assert.equal(api.findStickerSendReceipt({'group-42-x':message},new Set(['new']),target,id(1),1,'sticker').status,'pending');});
test('two new matching receipts are ambiguous rather than assumed successful',()=>{const m={cid:'a',mid:'0000000000000001',serverTimeStamp:1,senderId:1,tag:'sticker',content:{fileId:id(1)}};assert.equal(api.findStickerSendReceipt({'group-42-a':m,'group-42-b':{...m,cid:'b'}},new Set(),{id:42,type:'group'},id(1),1,'sticker').status,'ambiguous');});
function storageFixture({account=1,stored={schema:1,revision:0,items:[]},fail=false,locks}={}){
 const handlers=new Map(),responses=[],reads=[],writes=[];
 const window={addEventListener:(name,fn)=>handlers.set(name,fn),dispatchEvent:event=>{if(event.type==='spga:settings-response')responses.push(JSON.parse(event.detail));}};
 const context=vm.createContext({window,navigator:{locks},URL,Set,JSON,Date,Number,Map,CustomEvent:class{constructor(type,data){this.type=type;this.detail=data.detail;}},unsafeWindow:{Function:()=>async()=>account},GM_getValue:key=>{reads.push(key);return stored;},GM_setValue:(key,value)=>{if(fail)throw Error('private disk error');writes.push({key,value});stored=value;}});
 vm.runInContext(fs.readFileSync(new URL('../tools/personal-settings-core.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../tools/personal-settings-bridge.js',import.meta.url),'utf8')+';installPersonalSettingsBridge();',context);
 return {reads,writes,responses,async request(data){await handlers.get('spga:settings-request')({detail:JSON.stringify({id:'fixture-123456',account:1,...data})});return responses.at(-1);}};
}
test('storage independently checks the live account before reading a namespace',async()=>{const f=storageFixture({account:2});assert.equal((await f.request({kind:'load'})).error,'METADATA_ACCOUNT_CHANGED');assert.equal(f.reads.length,0);});
test('storage writes only the account-scoped metadata key and increments the revision',async()=>{const f=storageFixture();const result=await f.request({kind:'save',revision:0,items:[row(1)]});assert.equal(result.ok,true);assert.equal(result.value.revision,1);assert.equal(f.writes[0].key,'seatalk-personal-sticker-settings-v1:1');});
test('stale revisions never overwrite another window\'s notes',async()=>{const f=storageFixture({stored:{schema:1,revision:2,items:[row(1)]}});assert.equal((await f.request({kind:'save',revision:0,items:[]})).error,'METADATA_CHANGED');assert.equal(f.writes.length,0);});
test('invalid existing storage is preserved rather than replaced with an empty collection',async()=>{const f=storageFixture({stored:{schema:99,items:[]}});assert.equal((await f.request({kind:'save',revision:0,items:[]})).error,'METADATA_STORAGE_INVALID');assert.equal(f.writes.length,0);});
test('storage errors expose only a bounded public error code',async()=>{const f=storageFixture({fail:true});const result=await f.request({kind:'save',revision:0,items:[row(1)]});assert.equal(result.error,'METADATA_SAVE_FAILED');assert.equal(JSON.stringify(result).includes('private'),false);});

test('static b0702 favorites support metadata backup and v3 sharing',()=>{const gifId='a'.repeat(33)+'b0702'+'0'.repeat(26);const note=row(1,{gifId});assert.equal(api.parsePersonalImport(api.exportPersonalSettings([note])).items[0].gifId,gifId);assert.equal(api.decodeStickerShare(api.encodeStickerShare([{gifId,label:'Static sticker',keywords:['still']}]))[0].gifId,gifId);});

test('existing schema 1 account settings keep all legacy notes and start ungrouped',async()=>{
  const v1={schema:1,revision:7,items:[row(1)]};
  const normalized=api.validateSettingsSnapshot(v1);
  assert.deepEqual(plain(normalized.groups),[]);
  assert.equal(normalized.items[0].note,'private');
  const f=storageFixture({stored:v1});
  const plan=api.planPersonalOrganization(normalized,[id(1)],{group:'Work'});
  const result=await f.request({kind:'save',revision:7,items:plan.items,groups:plan.groups});
  assert.equal(result.value.schema,2);
  assert.equal(result.value.revision,8);
  assert.deepEqual(result.value.items,plain(normalized.items));
  assert.equal(f.writes[0].key,'seatalk-personal-sticker-settings-v1:1');
});

test('clearing the last keyword or restoring the only format to automatic drops just the metadata row',()=>{
  const groups=[{name:'Team',gifIds:[id(1)]}];
  for (const original of [{keywords:['cat'],animationOverride:'auto'},{keywords:[],animationOverride:'animated'}]) {
    const records=new Map(), fields={name:'',keywords:[],animationOverride:'auto',acceptReview:false};
    assert.equal(api.applyPersonalRecordEdit(records,id(1),{...fields,...original}),true);
    assert.equal(records.get(id(1)).name,'');
    assert.equal(api.applyPersonalRecordEdit(records,id(1),fields),true);
    assert.equal(api.applyPersonalRecordEdit(records,id(1),fields),false);
    const saved=api.validateSettingsSnapshot({schema:2,revision:1,items:[...records.values()],groups});
    assert.deepEqual(plain(saved.items),[]);assert.deepEqual(plain(saved.groups),groups);
  }
});
test('an edit retaining only legacy local text preserves the row and omits it from backup',()=>{
  for (const legacy of [{visibleText:'on image',note:''},{visibleText:'',note:'device only'}]) {
    const value=api.normalizePersonalRecord({gifId:id(1),name:'Old name',keywords:['cat'],...legacy});
    const records=new Map([[id(1),value]]);
    assert.equal(api.applyPersonalRecordEdit(records,id(1),{name:'',keywords:[],animationOverride:'auto'}),true);
    const local=records.get(id(1));assert.equal(local.visibleText,legacy.visibleText);assert.equal(local.note,legacy.note);
    assert.equal(api.personalMetadataMatches(local,legacy.note || legacy.visibleText),true);
    assert.deepEqual(JSON.parse(api.exportPersonalSettings([local])).items,[]);
  }
});

test('group moves are unique, independent of notes, and preserve empty groups',()=>{
  const snapshot={schema:2,revision:4,items:[],groups:[{name:'Work',gifIds:[id(1)]}]};
  const plan=api.planPersonalOrganization(snapshot,[id(1),id(2),id(2)],{group:' ＷＯＲＫ '});
  assert.equal(plan.group,'Work');
  assert.equal(plan.selectedCount,2);
  assert.equal(plan.movedCount,1);
  assert.deepEqual(plain(plan.items),[]);
  assert.deepEqual(plain(plan.groups),[{name:'Work',gifIds:[id(1),id(2)]}]);
  const removed=api.planPersonalOrganization({schema:2,revision:5,items:plan.items,groups:plan.groups},[id(1),id(2)],{group:''});
  assert.equal(removed.movedCount,2);
  assert.deepEqual(plain(removed.groups),[{name:'Work',gifIds:[]}]);
  assert.deepEqual(snapshot.groups,[{name:'Work',gifIds:[id(1)]}]);
});

test('bulk keywords append once and preserve private local information',()=>{
  const snapshot=api.validateSettingsSnapshot({schema:2,revision:1,items:[
    row(1,{keywords:['Ｗｏｒｋ'],source:'ai',needsReview:true,animationOverride:'static'}),
    row(2,{keywords:['work','team']})
  ],groups:[]});
  const ids=[id(1),id(2),id(3),id(3)];
  const input=api.splitPersonalKeywords(' work，team, TEAM\n ＴＥＡＭ ');
  const plan=api.planPersonalOrganization(snapshot,ids,{group:'Team',keywords:input},'2026-11-25T12:00:00Z');
  assert.equal(plan.selectedCount,3);assert.equal(plan.keywordChangedCount,2);assert.equal(plan.movedCount,3);
  assert.deepEqual(plain(plan.items[0]),{...plain(snapshot.items[0]),keywords:['Ｗｏｒｋ','team'],updatedAt:'2026-11-25T12:00:00Z'});
  assert.deepEqual(plain(plan.items[1]),plain(snapshot.items[1]));
  assert.equal(plan.items[2].name,'');assert.deepEqual(plain(plan.items[2].keywords),['work','team']);
  assert.equal(api.personalMetadataMatches(plan.items[2],'team'),true);
  const blank=api.planPersonalOrganization(snapshot,ids,{keywords:[]});
  assert.equal(blank.keywordChangedCount,0);assert.deepEqual(plain(blank.items),plain(snapshot.items));
  assert.throws(()=>api.planPersonalOrganization(snapshot,ids,{note:'deprecated'}),/METADATA_INVALID/);
});
test('bulk keyword capacity is checked per sticker before applying other changes',()=>{
  const full=row(2,{keywords:Array.from({length:30},(_,i)=>'term'+i)});
  const snapshot={schema:2,revision:3,groups:[],items:[row(1),full]};
  const before=JSON.stringify(snapshot);
  assert.throws(()=>api.planPersonalOrganization(snapshot,[id(1),id(2)],{group:'Draft',name:'New',keywords:['overflow']}),/METADATA_KEYWORDS_LIMIT/);
  assert.throws(()=>api.splitPersonalKeywords(Array.from({length:31},(_,i)=>'term'+i).join(',')),/METADATA_KEYWORDS_LIMIT/);
  assert.equal(JSON.stringify(snapshot),before);
});
test('bulk rename assigns the same searchable name to distinct stickers and preserves other metadata',()=>{
  const snapshot=api.validateSettingsSnapshot({schema:2,revision:2,groups:[],items:[
    row(1,{source:'ai',confidence:'low',needsReview:true,reviewReason:'review',animationOverride:'animated'}),
    row(2,{name:'奶龙',updatedAt:'2026-11-24T12:00:00Z'}),
    row(3,{name:'',note:'独立备注'})
  ]});
  const timestamp='2026-11-25T12:00:00Z';
  const ids=[id(1),id(2),id(3),id(4),id(4)];
  const plan=api.planPersonalOrganization(snapshot,ids,{name:'  奶龙  '},timestamp);
  assert.equal(plan.selectedCount,4);
  assert.equal(plan.nameChangedCount,3);
  assert.equal(plan.nameOverwriteCount,1);
  assert.equal(plan.keywordChangedCount,0);
  assert.deepEqual(plain(plan.items[0]),{...plain(snapshot.items[0]),name:'奶龙',updatedAt:timestamp});
  assert.deepEqual(plain(plan.items[1]),plain(snapshot.items[1]));
  assert.deepEqual(plain(plan.items[2]),{...plain(snapshot.items[2]),name:'奶龙',updatedAt:timestamp});
  assert.equal(plan.items[3].source,'manual');
  assert.equal(plan.items[3].note,'');
  assert.deepEqual(plain(plan.items[3].keywords),[]);
  assert.ok(plan.items.every(item=>api.personalMetadataMatches(item,'奶龙')));
  const restored=api.parsePersonalImport(api.exportPersonalSettings(plan.items));
  assert.deepEqual(plain(restored.items.map(row=>row.name)),plain(plan.items.map(row=>row.name)));
  assert.ok(restored.items.every(row=>!row.visibleText && !row.note));
  const shared=api.decodeStickerShare(api.encodeStickerShare(plan.items.map(({gifId,name})=>({gifId,label:name}))));
  assert.deepEqual(plain(shared.map(item=>item.label)),['奶龙','奶龙','奶龙','奶龙']);
});

test('name, group and keywords can change together without touching old notes',()=>{
  const snapshot={schema:2,revision:4,groups:[],items:[row(1),row(2,{name:'大笑',keywords:['一起']})]};
  const plan=api.planPersonalOrganization(snapshot,[id(1),id(2),id(3)],{group:'反应',name:'大笑',keywords:['一起']});
  assert.deepEqual([plan.movedCount,plan.nameChangedCount,plan.nameOverwriteCount,plan.keywordChangedCount],[3,2,1,2]);
  assert.deepEqual(plain(plan.groups),[{name:'反应',gifIds:[id(1),id(2),id(3)]}]);
  assert.equal(plan.items[0].note,'private');assert.equal(plan.items[0].visibleText,'工作');
  const blank=api.planPersonalOrganization(snapshot,[id(1),id(3)],{name:'  ',keywords:[]});
  assert.deepEqual(plain(blank.items),plain(api.validateSettingsSnapshot(snapshot).items));
  for(const name of ['a'.repeat(81),'two\nlines']) assert.throws(()=>api.planPersonalOrganization(snapshot,[id(1)],{name,group:'跳过',keywords:[]}),/METADATA_INVALID/);
  assert.deepEqual(snapshot.groups,[]);assert.equal(snapshot.items[0].name,'Work 1');
});
test('schema 3 recovers groups and keyword-only rows and omits purely private rows',()=>{
  const original=api.validateSettingsSnapshot({schema:2,revision:9,items:[
    row(1),row(2,{name:'',note:'private-only',keywords:[]}),row(4,{name:'',keywords:['look up'],note:''})
  ],groups:[{name:'Team',gifIds:[id(1),id(3)]},{name:'Empty',gifIds:[]}]});
  const file=api.exportPersonalSettings(original.items,undefined,original.groups);
  const doc=JSON.parse(file);assert.equal(doc.schema,3);assert.equal(doc.revision,undefined);assert.equal(doc.items.length,2);
  const parsed=api.parsePersonalImport(file),dest=api.validateSettingsSnapshot({schema:1,revision:0,items:[]});
  const entries=api.personalBackupEntries(parsed,dest);
  assert.equal(entries.length,4);
  const restored=api.mergePersonalBackup(dest,entries,true);
  assert.deepEqual(plain(restored.groups),plain(original.groups));
  assert.deepEqual(plain(restored.items.find(row=>row.gifId===id(4)).keywords),['look up']);
  assert.equal(restored.items[0].note,'');
});
test('restoring even a replacement backup never overwrites device-only sticker text or notes',()=>{
  const local=api.validateSettingsSnapshot({schema:2,revision:5,items:[row(1)],groups:[]});
  const parsed=api.parsePersonalImport(api.exportPersonalSettings([row(1,{name:'Updated',note:'remote note',visibleText:'remote text'})]));
  const entries=api.personalBackupEntries(parsed,local).map(entry=>({...entry,replace:true}));
  const [restored]=api.mergePersonalBackup(local,entries,false).items;
  assert.equal(restored.name,'Updated');assert.equal(restored.note,'private');assert.equal(restored.visibleText,'工作');
});

test('a partial restore keeps existing group conflicts unless replacement is selected',()=>{
  const local=api.validateSettingsSnapshot({schema:2,revision:5,items:[row(1,{note:'mine'})],groups:[{name:'Local',gifIds:[id(1)]}]});
  const parsed=api.parsePersonalImport(api.exportPersonalSettings([],undefined,[{name:'Imported',gifIds:[id(1),id(2)]}]));
  const [first,second]=api.personalBackupEntries(parsed,local);
  assert.equal(first.hasConflict,true);
  assert.equal(second.hasConflict,false);
  const kept=api.mergePersonalBackup(local,[first],true);
  assert.deepEqual(plain(kept.groups),plain(local.groups));
  const replaced=api.mergePersonalBackup(local,[{...first,replace:true}],false);
  assert.deepEqual(plain(replaced.groups),[{name:'Local',gifIds:[]},{name:'Imported',gifIds:[id(1)]}]);
  assert.deepEqual(plain(replaced.items),plain(local.items));
});

test('invalid group fields, duplicate ownership and duplicate normalized names reject the whole import',()=>{
  for(const groups of [
    [{name:'A',gifIds:['bad']}],
    [{name:'A',gifIds:[],token:'secret'}],
    [{name:'A',gifIds:[id(1)]},{name:'B',gifIds:[id(1)]}],
    [{name:'A',gifIds:[]},{name:'ａ',gifIds:[]}],
    [{name:' ',gifIds:[]}]
  ]) assert.throws(()=>api.parsePersonalImport(JSON.stringify({kind:'seatalk-personal-settings',schema:3,items:[],groups})),/METADATA_/);
  assert.throws(()=>api.encodeStickerShare([{gifId:id(1),label:'Shared',group:'Local'}]));
});

test('notes-only callers preserve stored groups and stale grouping cannot partially write',async()=>{
  const groups=[{name:'Local',gifIds:[id(1)]}];
  const f=storageFixture({stored:{schema:2,revision:2,items:[row(1)],groups}});
  assert.equal((await f.request({kind:'save',revision:2,items:[row(1,{note:'edit'})]})).ok,true);
  assert.deepEqual(plain(f.writes[0].value.groups),groups);
  const stale=await f.request({kind:'save',revision:2,items:[],groups:[]});
  assert.equal(stale.error,'METADATA_CHANGED');
  const invalid=await f.request({kind:'save',revision:3,items:[],groups:[{name:'x',gifIds:['invalid']}]});
  assert.equal(invalid.ok,false);
  assert.equal(f.writes.length,1);
});

test('shared name replacement uses only public fields and protects local private note and format',()=>{
  const current=row(1,{note:'only on this device',animationOverride:'static'});
  const shared={label:'New name',keywords:['Shared'],visibleText:'hello',note:'not public',animationOverride:'animated'};
  const merged=api.mergeSharedPersonalRecord(current,shared,id(1),true);
  assert.equal(merged.name,'New name');
  assert.equal(merged.visibleText,current.visibleText);
  assert.deepEqual(plain(merged.keywords),['office','工作','Shared']);
  assert.equal(merged.note,'only on this device');
  assert.equal(merged.animationOverride,'static');
  const fresh=api.mergeSharedPersonalRecord(null,shared,id(2),true);
  assert.equal(fresh.note,'');
  assert.equal(fresh.animationOverride,undefined);
  const onlyPrivate=api.mergeSharedPersonalRecord(row(3,{name:'',keywords:[],note:'keep'}),shared,id(3),false);
  assert.equal(onlyPrivate.name,'New name');
  assert.equal(onlyPrivate.note,'keep');
});

test('a busy same-account write lock rejects without queuing an unconfirmed write',async()=>{
  const calls=[];
  const lockService={request(key,options,callback){calls.push({key,ifAvailable:options.ifAvailable});return callback(null);}};
  const f=storageFixture({locks:lockService});
  const result=await f.request({kind:'save',revision:0,items:[],groups:[{name:'Mine',gifIds:[id(1)]}]});
  assert.equal(result.error,'METADATA_CHANGED');
  assert.deepEqual(calls,[{key:'seatalk-personal-sticker-settings-v1:1',ifAvailable:true}]);
  assert.equal(f.writes.length,0);
});
