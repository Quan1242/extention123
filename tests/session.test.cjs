const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {sessionContext}=require('../extension/session_worker');
const {createSessionTransport}=require('../extension/session_transport');
const patterns=['*://cvat.note.transformerlabs.ai/*','*://*.cvat.ai/*','*://localhost/*'];
test('session context restricts host and job route',()=>{
 assert.equal(sessionContext({id:2,url:'https://app.cvat.ai/tasks/2/jobs/17'},patterns).jobId,17);
 for(const url of ['https://evil.test/jobs/17','https://app.cvat.ai.evil.test/jobs/17','https://app.cvat.ai/tasks/17','file://localhost/jobs/17'])
  assert.throws(()=>sessionContext({id:2,url},patterns));
});
function fixture(){
 let current={connected:true,jobId:17,saveState:'saved',capabilities:{edit:true}},calls=[];
 const transport=createSessionTransport({snapshot:()=>current,url:()=> 'https://app.cvat.ai/tasks/2/jobs/17',cookie:()=> 'csrftoken=test-csrf',
  fetch:async(url,options)=>{calls.push({url,options});return {ok:true,status:202,json:async()=>url.endsWith('/annotation/formats')?{exporters:[{name:'Generic TSV 1.0',dimension:'1d'},{name:'COCO 1.0',dimension:'2d'},{name:'Datumaro 3D 1.0',dimension:'3d'},{name:'Disabled 3D',dimension:'3d',enabled:false}],importers:[{name:'Datumaro 3D 1.0',dimension:'3d'}]}:url.endsWith('/annotations')?{version:0,tags:[],shapes:[],tracks:[{id:1,shapes:[{frame:0},{frame:7},{frame:14}]}]}:{rq_id:'test-rq'},arrayBuffer:async()=>new Uint8Array([80,75,3,4]).buffer};}});
 const command=(operation,rest={})=>transport({origin:'https://app.cvat.ai',jobId:17,operation,...rest});
 return {current,calls,command};
}
test('export uses current session and CSRF without sessionid transfer',async()=>{
 const f=fixture();await f.command('formats');assert.deepEqual(await f.command('export',{format:'Datumaro 3D 1.0'}),{rq_id:'test-rq'});
 assert.equal(f.calls[1].options.credentials,'include');assert.equal(f.calls[1].options.method,'POST');
 assert.equal(f.calls[1].options.headers['X-CSRFToken'],'test-csrf');
 assert.ok(!JSON.stringify(f.calls).includes('sessionid'));assert.ok(f.calls[1].url.includes('save_images=false'));
});
test('annotation operations block unsaved state, stale job, unconfirmed imports and external downloads',async()=>{
 const f=fixture();
 f.current.saveState='unsaved';await assert.rejects(f.command('export',{format:'x'}),/Save CVAT/);
 f.current.saveState='saved';
 await assert.rejects(f.command('import',{format:'x',file:{name:'x.zip',bytes:[1]}}),/Confirm/);
 await assert.rejects(f.command('download',{url:'https://evil.test/file.zip'}),/Unsafe/);
 await assert.rejects(f.command('download',{url:'https://app.cvat.ai/api/jobs/99/dataset/export'}),/Unsafe/);
 await assert.rejects(f.command('user',{jobId:99}),/changed/);
 await assert.rejects(f.command('delete'),/Unsupported/);assert.equal(f.calls.length,0);
});
test('import sends multipart only for confirmed editable job',async()=>{
 const f=fixture();await f.command('formats');await f.command('import',{format:'Datumaro 3D 1.0',confirmJob:17,file:{name:'labels.zip',bytes:[1,2,3]}});
 const req=f.calls[1];assert.equal(req.options.body.get('annotation_file').name,'labels.zip');
 assert.equal(req.options.body.get('annotation_file').size,3);
 assert.ok(req.url.includes('/api/jobs/17/annotations/'));
 await assert.rejects(f.command('import',{confirmJob:17,file:{bytes:[1]}}),/already submitted/);
 const blocked=fixture();blocked.current.capabilities.edit=false;await assert.rejects(blocked.command('import',{confirmJob:17,file:{bytes:[1]}}),/editable/);
});
test('cookie worker never releases cookies to content scripts or other pages',async()=>{
 let listener,reads=0;
 const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,getManifest:()=>({host_permissions:patterns}),onMessage:{addListener:fn=>listener=fn}},
 tabs:{get:async()=>({id:2,url:'https://app.cvat.ai/jobs/17'})},
 cookies:{getAllCookieStores:async()=>[{id:'0',tabIds:[2]}],getAll:async()=>{reads++;return [{name:'sessionid',value:'fake-cookie',path:'/',httpOnly:true}];}}};
 vm.runInNewContext(fs.readFileSync('extension/session_worker.js','utf8'),{chrome,URL});
 const send=(sender)=>new Promise(resolve=>listener({type:'C3D_COOKIES',tabId:2,origin:'https://app.cvat.ai',jobId:17},sender,resolve));
 assert.equal((await send({id:'test',url:'https://app.cvat.ai/jobs/17'})).ok,false);
 assert.equal((await send({id:'test',url:'chrome-extension://test/other.html'})).ok,false);
 assert.equal(reads,0);
 const good=await send({id:'test',url:'chrome-extension://test/session.html?tab=2'});
 assert.equal(good.result.session.value,'fake-cookie');assert.equal(reads,1);
});

test('3D formats exclude 1D/2D and disabled exporters; wrong format cannot start a job',async()=>{
 const f=fixture(),formats=await f.command('formats');
 assert.deepEqual(formats.exporters.map(x=>x.name),['Datumaro 3D 1.0']);assert.equal(formats.preferredExport,'Datumaro 3D 1.0');
 await assert.rejects(f.command('export',{format:'COCO 1.0'}),/supported 3D/);
 await assert.rejects(f.command('import',{format:'COCO 1.0',confirmJob:17,file:{bytes:[1]}}),/supported 3D/);
 assert.equal(f.calls.length,1);
});

test('native JSON reads saved server annotations without export permission or raw cookies',async()=>{
 const f=fixture(),data=await f.command('native-export');
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'GET');assert.equal(f.calls[0].url,'https://app.cvat.ai/api/jobs/17/annotations');
 assert.equal(data.schema,'cvat-3d-tool-native-annotations/v1');assert.equal(data.source,'saved-server-annotations');
 assert.deepEqual(data.annotations.tracks[0].shapes.map(s=>s.frame),[0,7,14]);assert.equal(data.jobId,17);
 f.current.saveState='unsaved';await assert.rejects(f.command('native-export'),/Save CVAT/);assert.equal(f.calls.length,1);
});

test('download validates ZIP signature and refuses successful HTML/login payloads',async()=>{
 const s={connected:true,jobId:17,saveState:'saved'};
 const make=bytes=>createSessionTransport({snapshot:()=>s,url:()=> 'https://app.cvat.ai/jobs/17',cookie:()=>'',fetch:async()=>({ok:true,status:200,arrayBuffer:async()=>Uint8Array.from(bytes).buffer})});
 const request={operation:'download',origin:'https://app.cvat.ai',jobId:17,url:'/api/jobs/17/dataset/export?rq_id=export-test'};
 await assert.rejects(make([60,104,116,109,108])(request),/ZIP/);
 assert.deepEqual(await make([80,75,3,4])(request),{bytes:[80,75,3,4]});
});

test('dataset export permission rejection is explicit; no fallback silently replaces backup/import',async()=>{
 const s={connected:true,jobId:17,saveState:'saved'};let writes=0;
 const transport=createSessionTransport({snapshot:()=>s,url:()=> 'https://app.cvat.ai/jobs/17',cookie:()=>'',fetch:async(url,opt)=>{
  if(opt.method==='POST'){writes++;return {ok:false,status:403};}
  return {ok:true,status:200,json:async()=>({exporters:[{name:'Datumaro 3D 1.0',dimension:'3d'}],importers:[]})};
 }});
 const q={origin:'https://app.cvat.ai',jobId:17};await transport({...q,operation:'formats'});
 await assert.rejects(transport({...q,operation:'export',format:'Datumaro 3D 1.0'}),/refuses dataset export \(403\)/);assert.equal(writes,1);
});
