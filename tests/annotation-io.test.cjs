const {test}=require('node:test'),assert=require('node:assert/strict');
const {createAnnotationIO}=require('../extension/annotation_io.js'),math=require('../extension/geometry_math.js');
const copy=x=>structuredClone(x),points=x=>[x,0,1,0,0,0,4,2,2,0,0,0,0,0,0,0];
function fixture(initial=null,schema=null){
 const labels=schema||[{id:7,name:'vehicles',attributes:[]}];let data=initial||{tracks:[38,63,79].map((clientID,i)=>({clientID,id:48950+i,label_id:7,frame:0,group:0,attributes:[],shapes:[0,7,14].map(frame=>({id:100000+clientID*100+frame,type:'cuboid',frame,points:points(clientID+frame),outside:false,occluded:false,z_order:0,rotation:0,attributes:[]}))})),shapes:[],tags:[],intervals:[]};
 const history=[],commits=[];let locked=false,saveFail=null;
 const job={startFrame:0,stopFrame:59,labels,annotations:{export:async()=>copy(data),get:async frame=>{
  const states=[];
  for(const kind of ['tracks','shapes'])for(const obj of data[kind]){
   if(kind==='shapes'&&obj.frame!==frame)continue;
   const shape=kind==='tracks'?(obj.shapes.find(x=>x.frame===frame)||obj.shapes.filter(x=>x.frame<=frame).at(-1)||obj.shapes[0]):obj;
   const state={clientID:obj.clientID,serverID:obj.id,objectType:kind==='tracks'?'track':'shape',shapeType:'cuboid',frame,label:labels.find(l=>l.id===obj.label_id),points:shape.points.slice(),keyframe:kind==='tracks'&&obj.shapes.some(x=>x.frame===frame),outside:shape.outside,lock:!!obj.lock,attributes:{},
    async save(){if(saveFail===frame)throw new Error('injected native failure');history.push(copy(data));
     if(kind==='tracks'){
      if(this.keyframe===false)obj.shapes=obj.shapes.filter(x=>x.frame!==frame);
      else{const saved={...shape,frame,points:this.points.slice(),outside:this.outside,occluded:this.occluded,z_order:this.zOrder,rotation:this.rotation,attributes:Object.entries(this.attributes).filter(([id])=>this.label.attributes.some(a=>a.id===+id&&a.mutable)).map(([spec_id,value])=>({spec_id:+spec_id,value}))};const index=obj.shapes.findIndex(x=>x.frame===frame);if(index<0){delete saved.id;obj.shapes.push(saved);}else obj.shapes[index]=saved;obj.shapes.sort((a,b)=>a.frame-b.frame);}
     }else Object.assign(obj,{points:this.points.slice(),outside:this.outside,occluded:this.occluded,z_order:this.zOrder,rotation:this.rotation});obj.label_id=this.label.id;obj.attributes=Object.entries(this.attributes).filter(([id])=>kind==='shapes'||this.label.attributes.some(a=>a.id===+id&&!a.mutable)).map(([spec_id,value])=>({spec_id:+spec_id,value}));return this;}};
   states.push(state);
  }return states;
 },group:async(states,reset)=>{history.push(copy(data));const assigned=reset?0:1+Math.max(0,...data.tracks.map(t=>t.group||0));for(const state of states){const item=[...data.tracks,...data.shapes].find(t=>t.clientID===state.clientID);item.group=assigned;}return assigned;},commit:async(add,remove)=>{history.push(copy(data));commits.push({add:copy(add),remove:copy(remove)});let next=Math.max(79,...data.tracks.map(x=>x.clientID));
  for(const kind of ['tracks','shapes']){data[kind]=data[kind].filter(x=>!(remove[kind]||[]).some(y=>y.clientID===x.clientID));for(const item of add[kind]||[])data[kind].push({...copy(item),clientID:++next});}}}};
 const snapshot={connected:true,sessionId:'fixture',jobId:1224,frame:0};
 const io=createAnnotationIO({math,job:()=>job,snapshot:()=>snapshot,origin:()=> 'https://cvat.test',assertEditable(){},lock:v=>locked=v,refresh:async()=>{}});
 return {io,job,snapshot,commits,history,get data(){return data;},get locked(){return locked;},undo(){data=history.pop();},failAt:f=>saveFail=f};
}
test('export includes exact native display and database IDs, including unsaved objects',async()=>{
 const f=fixture();delete f.data.tracks[2].id;
 const result=await f.io.exported({jobId:1224});assert.deepEqual(result.data.tracks.map(x=>x.clientID),[38,63,79]);assert.equal(result.startFrame,0);assert.equal(result.stopFrame,59);assert.equal(result.data.tracks[0].id,48950);assert.equal(result.data.c3d.source,'native-editor-including-unsaved');assert.equal(result.data.tracks[2].id,undefined);
});

test('owner JSON old/new tracks 48950 and 48975 replace every keyframe while retaining native #38/#63',{skip:!process.env.CVAT_IO_OLD||!process.env.CVAT_IO_NEW},async()=>{
 const fs=require('node:fs'),oldBytes=fs.readFileSync(process.env.CVAT_IO_OLD),newBytes=fs.readFileSync(process.env.CVAT_IO_NEW);
 const old=JSON.parse(oldBytes),incoming=JSON.parse(newBytes),labels=[];
 for(const id of new Set(incoming.tracks.map(t=>t.label_id))){
  const specs=new Map();for(const t of incoming.tracks.filter(t=>t.label_id===id)){
   for(const a of t.attributes||[])specs.set(a.spec_id,{id:a.spec_id,name:'attr-'+a.spec_id,mutable:false,default_value:''});
   for(const sh of t.shapes)for(const a of sh.attributes||[])specs.set(a.spec_id,{id:a.spec_id,name:'attr-'+a.spec_id,mutable:true,default_value:''});
  }labels.push({id,name:'label-'+id,attributes:[...specs.values()]});
 }
 old.tracks.forEach((t,i)=>t.clientID=i+1);const f=fixture(copy(old),labels),before=copy(f.data);
 const file={tracks:incoming.tracks.filter(t=>[48950,48975].includes(t.id)),shapes:[]};
 const p=await f.io.preview({payload:file});assert.deepEqual(p.rows.map(r=>r.targetClientId),[38,63]);
 const result=await f.io.apply({token:p.token,keys:p.rows.map(r=>r.key)});assert.equal(result.error,null);
 for(const target of file.tracks){const actual=f.data.tracks.find(t=>t.id===target.id);
  assert.equal(actual.clientID,target.id===48950?38:63);assert.equal(actual.shapes.length,target.shapes.length);
  for(const shape of target.shapes){const applied=actual.shapes.find(s=>s.frame===shape.frame);assert.deepEqual(applied.points,shape.points);assert.equal(applied.outside,shape.outside);}
 }
 for(const t of before.tracks.filter(t=>![48950,48975].includes(t.id)))assert.deepEqual(f.data.tracks.find(x=>x.id===t.id),t);
 assert.deepEqual(fs.readFileSync(process.env.CVAT_IO_OLD),oldBytes);assert.deepEqual(fs.readFileSync(process.env.CVAT_IO_NEW),newBytes);
});
test('selected Replace preserves #38/#63 identities and replaces the complete keyframe sets without touching #79',async()=>{
 const f=fixture(),before=copy(f.data),data=(await f.io.exported()).data;data.tracks=data.tracks.slice(0,2);
 for(const t of data.tracks){t.shapes=t.shapes.filter(s=>s.frame!==7);t.shapes[1].points=points(100);t.shapes.push({...copy(t.shapes[0]),frame:29,points:points(200),outside:true});}
 const plan=await f.io.preview({jobId:1224,mode:'replace',payload:data});assert.deepEqual(plan.rows.map(x=>x.targetClientId),[38,63]);
 const result=await f.io.apply({token:plan.token,keys:plan.rows.map(r=>r.key),scope:'selected'});
 assert.equal(result.error,null);assert.deepEqual(result.changed,[38,63]);assert.deepEqual(result.added,[]);assert.deepEqual(f.data.tracks[2],before.tracks[2]);assert.equal(f.commits.length,0);
 for(const t of f.data.tracks.slice(0,2)){assert.deepEqual(t.shapes.map(s=>s.frame),[0,14,29]);assert.equal(t.shapes[2].outside,true);assert.equal(t.shapes[1].points[0],100);}
 assert.deepEqual(f.data.tracks.map(t=>[t.clientID,t.id]),before.tracks.map(t=>[t.clientID,t.id]));
 while(f.history.length)f.undo();assert.deepEqual(f.data,before);
});
test('Replace all deletes omitted IDs only after keeping the matched identities',async()=>{
 const f=fixture(),data=(await f.io.exported()).data;data.tracks=data.tracks.slice(0,2);
 const p=await f.io.preview({mode:'replace',payload:data});const result=await f.io.apply({token:p.token,keys:p.rows.map(r=>r.key),scope:'all'});
 assert.equal(result.error,null);assert.deepEqual(result.removed,[79]);assert.deepEqual(f.data.tracks.map(t=>t.clientID),[38,63]);assert.equal(f.commits[0].add.tracks,undefined);
});
test('Add creates only selected objects, strips server IDs recursively and leaves existing IDs untouched',async()=>{
 const f=fixture(),before=copy(f.data),data=(await f.io.exported()).data;
 const p=await f.io.preview({mode:'append',payload:data});const result=await f.io.apply({token:p.token,keys:[p.rows[1].key]});
 assert.equal(result.error,null);assert.deepEqual(result.added,[{kind:'tracks',clientID:80}]);assert.deepEqual(f.data.tracks.slice(0,3),before.tracks);
 const add=f.commits[0].add.tracks[0];assert.equal(add.id,undefined);assert.equal(add.clientID,undefined);assert.ok(add.shapes.every(s=>s.id===undefined));assert.equal(add.shapes.length,3);
});
test('raw legacy JSON maps by server ID, never guesses its array position as display ID',async()=>{
 const f=fixture(),data=copy(f.data);delete data.c3d;for(const t of data.tracks)delete t.clientID;
 data.tracks.reverse();const p=await f.io.preview({payload:data});assert.deepEqual(p.rows.map(x=>x.targetClientId),[79,63,38]);
});
test('unknown IDs, foreign job, duplicate IDs and stale previews fail before writes',async()=>{
 for(const scenario of ['unknown','foreign','duplicate','stale','scope']){
  const f=fixture(),data=(await f.io.exported()).data;
  if(scenario==='unknown'){data.tracks[0].id=123456;delete data.tracks[0].clientID;}
  if(scenario==='foreign')data.c3d.jobId=9;
  if(scenario==='duplicate')data.tracks.push(copy(data.tracks[0]));
  if(['foreign','duplicate'].includes(scenario))await assert.rejects(f.io.preview({payload:data}));
  else{const p=await f.io.preview({payload:data});if(scenario==='stale')f.data.tracks[0].shapes[0].points[0]+=.2;
   await assert.rejects(f.io.apply({token:p.token,keys:[p.rows[0].key],scope:scenario==='scope'?'all':'selected'}));}
  assert.equal(f.history.length,0);
 }
});
test('invalid geometry, start-frame changes and protected targets stop before any edit',async()=>{
 for(const scenario of ['geometry','frame','lock']){
  const f=fixture(),data=(await f.io.exported()).data;
  if(scenario==='geometry')data.tracks[0].shapes[0].points[6]=-1;
  if(scenario==='group')data.tracks[0].group=3;
  if(scenario==='frame'){data.tracks[0].frame=7;data.tracks[0].shapes.shift();}
  if(scenario==='lock')f.data.tracks[0].lock=true;
  if(scenario==='geometry')await assert.rejects(f.io.preview({payload:data}));
  else {const p=await f.io.preview({payload:data});await assert.rejects(f.io.apply({token:p.token,keys:[p.rows[0].key]}));}
  assert.equal(f.history.length,0);
 }
});

test('standalone cuboid Replace keeps its native display/database ID and leaves tracks untouched',async()=>{
 const f=fixture();f.data.shapes.push({clientID:91,id:80001,type:'cuboid',frame:0,label_id:7,points:points(1),group:0,attributes:[]});
 const before=copy(f.data.tracks),file={tracks:[],shapes:[{...copy(f.data.shapes[0]),points:points(7)}]};
 const p=await f.io.preview({payload:file});const result=await f.io.apply({token:p.token,keys:[p.rows[0].key]});
 assert.equal(result.error,null);assert.equal(f.data.shapes[0].id,80001);assert.equal(f.data.shapes[0].clientID,91);assert.equal(f.data.shapes[0].points[0],7);assert.deepEqual(f.data.tracks,before);
});

test('an unknown database ID never falls back to a coincidentally matching display ID',async()=>{
 const f=fixture(),file=(await f.io.exported()).data;file.tracks[0].id=12345678;
 const p=await f.io.preview({payload:file});assert.equal(p.rows[0].matched,false);
 await assert.rejects(f.io.apply({token:p.token,keys:[p.rows[0].key]}),/not found/);assert.equal(f.history.length,0);
});

test('unsaved display-only IDs are replaceable only in the same editor session',async()=>{
 const f=fixture();delete f.data.tracks[0].id;const file=(await f.io.exported()).data;
 let p=await f.io.preview({payload:file});assert.equal(p.rows[0].matched,true);
 file.c3d.sessionId='a-previous-editor';p=await f.io.preview({payload:file});assert.equal(p.rows[0].matched,false);
 await assert.rejects(f.io.apply({token:p.token,keys:[p.rows[0].key]}),/not found/);assert.equal(f.history.length,0);
});

test('unknown labels and attributes fail explicitly, without guessing a class or dropping attributes',async()=>{
 const f=fixture(),file=(await f.io.exported()).data;
 file.tracks[0].label_id=99;await assert.rejects(f.io.preview({payload:file}),/label/);file.tracks[0].label_id=7;
 file.tracks[0].attributes=[{spec_id:123,value:'car'}];await assert.rejects(f.io.preview({payload:file}),/attribute/);assert.equal(f.history.length,0);
});

test('source grouping is rebuilt only among selected IDs; unselected members are preserved',async()=>{
 const f=fixture(),file=(await f.io.exported()).data;file.tracks[0].group=5;file.tracks[1].group=5;
 const before=copy(f.data.tracks[2]),p=await f.io.preview({payload:file});const r=await f.io.apply({token:p.token,keys:p.rows.slice(0,2).map(x=>x.key)});
 assert.equal(r.error,null);assert.equal(f.data.tracks[0].group,f.data.tracks[1].group);assert.ok(f.data.tracks[0].group>0);assert.deepEqual(f.data.tracks[2],before);
});

test('Replace copies immutable attributes, inherits mutable keyframe values and resets stale schema fields',async()=>{
 const f=fixture(),label=f.job.labels[0];label.attributes=[{id:1,name:'subtype',mutable:false,default_value:'car'},{id:2,name:'pose',mutable:true,default_value:'standing'}];
 const file=(await f.io.exported()).data;file.tracks=file.tracks.slice(0,1);file.tracks[0].attributes=[{spec_id:1,value:'SUV'}];file.tracks[0].shapes[0].attributes=[{spec_id:2,value:'sitting'}];
 const p=await f.io.preview({payload:file});const result=await f.io.apply({token:p.token,keys:[p.rows[0].key]});
 assert.equal(result.error,null);assert.deepEqual(f.data.tracks[0].attributes,[{spec_id:1,value:'SUV'}]);
 for(const shape of f.data.tracks[0].shapes)assert.deepEqual(shape.attributes,[{spec_id:2,value:'sitting'}]);
});
test('partial native failure releases lock, reports changed IDs and never deletes unrelated IDs',async()=>{
 const f=fixture(),data=(await f.io.exported()).data;data.tracks=data.tracks.slice(0,2);f.failAt(7);
 const p=await f.io.preview({payload:data});const result=await f.io.apply({token:p.token,keys:p.rows.map(r=>r.key),scope:'all'});
 assert.match(result.error,/injected/);assert.deepEqual(result.changed,[38]);assert.deepEqual(result.removed,[]);assert.equal(f.data.tracks.length,3);assert.equal(f.locked,false);
 await assert.rejects(f.io.apply({token:p.token,keys:[p.rows[0].key]}),/expired/);
});

test('concurrent Apply consumes the preview exactly once',async()=>{
 const f=fixture(),data=(await f.io.exported()).data,p=await f.io.preview({payload:data});
 const results=await Promise.allSettled([f.io.apply({token:p.token,keys:[p.rows[0].key]}),f.io.apply({token:p.token,keys:[p.rows[0].key]})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.history.length,3);assert.equal(f.locked,false);
});
