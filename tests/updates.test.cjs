const {test}=require('node:test'),assert=require('node:assert/strict');
const {createUpdateService,compare}=require('../extension/update_service.js');
function fixture(options={}){
 const calls=[],stored={},tabs=options.tabs||[{id:1,url:'https://cvat.test/tasks/2/jobs/3'}];let reloads=0,reads=0;
 const chrome={runtime:{getManifest:()=>({version:'1.15.0'}),reload:()=>reloads++},
  storage:{local:{get:async key=>({[key]:stored[key]}),set:async value=>Object.assign(stored,value),remove:async key=>delete stored[key]}},
  tabs:{query:async()=>tabs,get:async id=>tabs.find(t=>t.id===id),sendMessage:async(id,message)=>{calls.push([id,message.type]);
   if(options.fail===message.type)throw new Error('injected failure');
   return {ok:true,result:message.type==='C3D_RELOAD_HOLD'?{saved:true}:{connected:true,origin:'https://cvat.test',jobId:3,saveState:options.dirty?'unsaved':'saved'}};},reload:async id=>calls.push(['reload',id])}};
 const service=createUpdateService({chrome,fetch:async(url,config)=>{reads++;assert.equal(config.credentials,'omit');assert.equal(url,'https://api.github.com/repos/ManhLD-LDM/CVAT_Tool/releases/latest');
  return {ok:options.http!==404,status:options.http||200,json:async()=>({tag_name:options.version||'v1.15.1',assets:[{name:'CVAT-3D-Tool-Extension-'+(options.version||'v1.15.1').replace(/^v/,'')+'.zip'}]})};},
  native:async message=>{calls.push(['native',message.action]);if(options.nativeFail)throw new Error('host missing');return {ok:true,result:{token:'test-stage'}};}});
 return {service,calls,stored,get reads(){return reads;},get reloads(){return reloads;}};
}
test('version comparison is numeric and invalid tags are not silently accepted',()=>{
 assert.equal(compare('1.15.10','v1.15.9'),1);assert.equal(compare('v1.15.0','1.15.0.0'),0);assert.throws(()=>compare('latest','1.15.0'));
});
test('release checks distinguish current, ahead, available and inaccessible; never send CVAT credentials',async()=>{
 for(const [version,state] of [['1.15.0','current'],['1.14.7','ahead'],['1.15.1','available']]){
  const f=fixture({version});assert.equal((await f.service.check()).state,state);assert.equal(f.reads,1);
 }
 const inaccessible=await fixture({http:404}).service.check();assert.equal(inaccessible.state,'unavailable');assert.match(inaccessible.error,/release/);
});
test('concurrent checks share a request; subsequent explicit check does contact GitHub again',async()=>{
 const f=fixture();await Promise.all([f.service.check(),f.service.check()]);assert.equal(f.reads,1);await f.service.check();assert.equal(f.reads,2);
});
test('updater stages before save, verifies held tabs before commit, and resumes only once',async()=>{
 const f=fixture();const result=await f.service.safeReload(true);assert.equal(result.updated,true);
 assert.deepEqual(f.calls,[['native','prepare'],[1,'C3D_RELOAD_STATE'],[1,'C3D_RELOAD_HOLD'],[1,'C3D_RELOAD_VERIFY'],['native','commit']]);
 assert.deepEqual(f.stored['c3d.reload.plan'].tabs,[{id:1,url:'https://cvat.test/tasks/2/jobs/3'}]);await f.service.resume();await f.service.resume();
 assert.equal(f.calls.filter(c=>c[0]==='reload').length,1);
});
test('save failure blocks commit/reload, releases held tabs, and removes durable plan',async()=>{
 const f=fixture({fail:'C3D_RELOAD_HOLD'});await assert.rejects(f.service.safeReload(true),/failure/);
 assert.ok(f.calls.some(c=>c[1]==='C3D_RELOAD_RELEASE'));assert.ok(!f.calls.some(c=>c[1]==='commit'));assert.equal(f.stored['c3d.reload.plan'],undefined);assert.equal(f.reloads,0);
});
test('missing native host leaves every CVAT tab untouched',async()=>{
 const f=fixture({nativeFail:true});await assert.rejects(f.service.safeReload(true),/updater Windows/);assert.deepEqual(f.calls,[['native','prepare']]);
});
test('two dirty editors of same job block automatic saving to avoid overwriting revisions',async()=>{
 const f=fixture({dirty:true,tabs:[{id:1,url:'https://cvat.test/jobs/3'},{id:2,url:'https://cvat.test/jobs/3'}]});
 await assert.rejects(f.service.safeReload(false),/nhiều tab/);assert.ok(!f.calls.some(c=>c[1]==='C3D_RELOAD_HOLD'));
});
test('failed final clean-state verification cannot commit an update',async()=>{
 const f=fixture({fail:'C3D_RELOAD_VERIFY'});await assert.rejects(f.service.safeReload(true));assert.ok(!f.calls.some(c=>c[1]==='commit'));assert.ok(f.calls.some(c=>c[1]==='C3D_RELOAD_RELEASE'));
});
test('durable reload plan skips a tab that has navigated away from the saved job',async()=>{
 const tabs=[{id:1,url:'https://cvat.test/tasks/2/jobs/3'}],f=fixture({tabs});
 await f.service.safeReload(false);tabs[0].url='https://other.test/form';await f.service.resume();
 assert.ok(!f.calls.some(c=>c[0]==='reload'));
});
