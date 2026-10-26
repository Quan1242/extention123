const {test}=require('node:test'),assert=require('node:assert/strict');
const math=require('../extension/geometry_math.js'),batchMath=require('../extension/batch_math.js');
const {createBatchController}=require('../extension/batch_controller.js');
function cloud(frame){
 const out=[];for(let x=-8;x<=8;x+=.4)for(let y=-6;y<=6;y+=.4)out.push(x,y,0);
 const cx=frame*.1,cy=.4*Math.sin(Math.PI*frame/7);
 for(let x=-.9;x<=.91;x+=.1)for(let y=-.4;y<=.41;y+=.1)for(const z of [.35,.7,1.1,1.6])out.push(cx+x,cy+y,z);
 return new Float32Array(out);
}
function fixture(stop=14){
 const shapes=new Map([0,7,stop].map(f=>[f,{frame:f,points:[f*.1,0,.9,0,0,0,1.8,.8,1.6,0,0,0,0,0,0,0],outside:false,type:'cuboid'}]));
 const history=[],snapshot={sessionId:'test',jobId:601,frame:7,boxes:[{id:5,objectType:'track'}]};
 let loads=0,refreshes=0,locked=false,failFrame=null,editable=true;
 const exportTrack=()=>({clientID:5,id:42339,label_id:1,frame:0,shapes:[...shapes.values()].sort((a,b)=>a.frame-b.frame).map(s=>structuredClone(s))});
 function stateAt(frame){
  const sorted=[...shapes.keys()].sort((a,b)=>a-b),a=sorted.filter(x=>x<=frame).at(-1),b=sorted.find(x=>x>=frame);
  const p=shapes.get(a).points.slice(),ratio=b===a?0:(frame-a)/(b-a);
  if(b!=null)for(let i=0;i<9;i++)p[i]+=(shapes.get(b).points[i]-p[i])*ratio;
  return {clientID:5,serverID:42339,shapeType:'cuboid',objectType:'track',frame,keyframe:shapes.has(frame),points:p,outside:false,label:{name:'two-wheels'},
   async save(){if(frame===failFrame)throw new Error('injected save failure');history.push(frame);shapes.set(frame,{frame,points:this.points.slice(),outside:false,type:'cuboid'});return this;}};
 }
 const job={id:601,startFrame:0,stopFrame:stop,annotations:{export:async()=>({tracks:[exportTrack()]}),get:async f=>[stateAt(f)]},
  frames:{get:async f=>({deleted:false,data:async()=>{loads++;return {imageData:new Blob([cloud(f).buffer])};}})}};
 let currentJob=job;
 const controller=createBatchController({math,batchMath,job:()=>currentJob,snapshot:()=>snapshot,parsePCD:buffer=>new Float32Array(buffer),
  assertEditable:()=>{if(!editable)throw new Error('read-only');},lock:v=>locked=v,refresh:async()=>refreshes++});
 return {controller,shapes,history,snapshot,job,exportTrack,get loads(){return loads;},get refreshes(){return refreshes;},get locked(){return locked;},
 fail:f=>failFrame=f,readonly:()=>editable=false,changeJob:()=>{currentJob={...job};}};
}
test('position refinement preserves yaw/dimensions and rejects oversized/tilted evidence',()=>{
 const original=[.3,0,.9,0,0,0,1.8,.8,1.6,0,0,0,0,0,0,0],ground=math.makePlane(0,0,0,{accepted:true,confidence:.9});
 const raw=cloud(3),points=[];for(let i=0;i<raw.length;i+=3)points.push(Array.from(raw.slice(i,i+3)));
 const r=batchMath.refinePosition(math,points,original,ground);
 assert.equal(r.status,'proposal');assert.deepEqual(r.proposed.slice(3),original.slice(3));assert.ok(r.afterCount>=r.beforeCount);
 assert.ok(r.proposed[1]>.25&&r.proposed[1]<.5);
 assert.equal(batchMath.refinePosition(math,points,[...original.slice(0,3),.2,...original.slice(4)],ground).status,'review');
 assert.equal(batchMath.refinePosition(math,[],original,ground).status,'review');
});
test('native batch reads unsaved track, protects anchors and caches only local frames',async()=>{
 const f=fixture(),meta=await f.controller.open(5);
 assert.deepEqual(meta.keyframes,[0,7,14]);assert.equal(meta.serverId,42339);
 const card=await f.controller.read({token:meta.token,frame:3});
 assert.equal(card.status,'proposal');assert.ok(card.points.length<=4000);
 await f.controller.read({token:meta.token,frame:3});assert.equal(f.loads,1);
 const anchor=await f.controller.read({token:meta.token,frame:7});assert.equal(anchor.protected,true);assert.equal(anchor.proposed,undefined);
 await assert.rejects(f.controller.apply({token:meta.token,frames:[7]}),/editable proposal/);
 assert.equal(f.history.length,0);
});
test('native batch applies position proposals without touching any original keyframe',async()=>{
 const f=fixture(),meta=await f.controller.open(5),before=structuredClone(f.exportTrack());
 for(const frame of [3,10])assert.equal((await f.controller.read({token:meta.token,frame})).status,'proposal');
 const result=await f.controller.apply({token:meta.token,frames:[3,10]});
 assert.deepEqual(result.appliedFrames,[3,10]);assert.equal(result.error,null);assert.equal(f.refreshes,1);assert.equal(f.locked,false);
 for(const s of before.shapes)assert.deepEqual(f.shapes.get(s.frame),s);
 for(const frame of [3,10])assert.deepEqual(f.shapes.get(frame).points.slice(3),before.shapes[0].points.slice(3));
 await assert.rejects(f.controller.apply({token:meta.token,frames:[3]}),/already applied/);
});
test('stale anchor changes, reviewed frames, read-only workspace and job changes block batch apply',async()=>{
 for(const scenario of ['changed','protected','readonly','job']){
  const f=fixture(),meta=await f.controller.open(5);await f.controller.read({token:meta.token,frame:3});
  if(scenario==='changed')f.shapes.get(7).points[0]+=.1;
  if(scenario==='protected')await f.controller.protect({token:meta.token,frame:3});
  if(scenario==='readonly')f.readonly();
  if(scenario==='job')f.changeJob();
  await assert.rejects(f.controller.apply({token:meta.token,frames:[3]}));assert.equal(f.history.length,0);
 }
});
test('partial native failures report applied frames accurately and release lock',async()=>{
 const f=fixture(),meta=await f.controller.open(5);
 for(const frame of [3,10])await f.controller.read({token:meta.token,frame});
 f.fail(10);const result=await f.controller.apply({token:meta.token,frames:[3,10]});
 assert.deepEqual(result.appliedFrames,[3]);assert.equal(result.partial,true);assert.match(result.error,/save failed/);
 assert.equal(f.shapes.has(10),false);assert.equal(f.locked,false);assert.equal(f.refreshes,1);
});
test('cancel invalidates batch token and never writes annotations',async()=>{
 const f=fixture(),meta=await f.controller.open(5);f.controller.cancel();
 await assert.rejects(f.controller.read({token:meta.token,frame:3}),/expired/);assert.equal(f.history.length,0);
});

test('concurrent batch apply cannot create duplicate native edits',async()=>{
 const f=fixture(),meta=await f.controller.open(5);await f.controller.read({token:meta.token,frame:3});
 const results=await Promise.allSettled([f.controller.apply({token:meta.token,frames:[3]}),f.controller.apply({token:meta.token,frames:[3]})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(f.history,[3]);
});
test('cancelled cloud reads cannot populate or mutate a newly opened batch session',async()=>{
 const f=fixture(),meta=await f.controller.open(5),get=f.job.frames.get;
 let release;const waiting=new Promise(resolve=>release=resolve);
 f.job.frames.get=async frame=>{await waiting;return get(frame);};
 const reading=f.controller.read({token:meta.token,frame:3});
 await new Promise(resolve=>setImmediate(resolve));f.controller.cancel();
 const next=await f.controller.open(5);release();
 await assert.rejects(reading,/cancelled|expired/);
 assert.equal((await f.controller.read({token:next.token,frame:3})).status,'proposal');assert.equal(f.history.length,0);
});

test('a track with no following anchor is review-only, never blindly propagated',async()=>{
 const f=fixture();f.shapes.delete(7);f.shapes.delete(14);
 const meta=await f.controller.open(5),card=await f.controller.read({token:meta.token,frame:3});
 assert.equal(card.status,'review');assert.equal(card.proposed,undefined);assert.match(card.flags.join(' '),/bounding keyframes/);
 await assert.rejects(f.controller.apply({token:meta.token,frames:[3]}),/editable proposal/);assert.equal(f.history.length,0);
});


test('compute range reads all 60 frames with bounded clouds, then applies cross-page proposals preserving anchors',async()=>{
 const f=fixture(60),meta=await f.controller.open(5),anchors=structuredClone(f.exportTrack().shapes);
 await assert.rejects(f.controller.begin({token:meta.token,from:0,to:60}),/frames inclusive/);
 await f.controller.begin({token:meta.token,from:1,to:60});
 const cards=[];
 for(let frame=1;frame<=60;frame++)cards.push(await f.controller.read({token:meta.token,frame}));
 assert.equal(cards.length,60);assert.equal(f.loads,60);assert.equal(f.history.length,0);
 const selected=cards.filter(c=>c.status==='proposal').map(c=>c.frame);
 assert.ok(selected.length>20);
 const result=await f.controller.apply({token:meta.token,frames:selected});
 assert.equal(result.error,null);assert.deepEqual(result.appliedFrames,selected);
 for(const anchor of anchors)assert.deepEqual(f.shapes.get(anchor.frame),anchor);
 for(const frame of selected)assert.deepEqual(f.shapes.get(frame).points.slice(3),anchors[0].points.slice(3));
});

test('begin restricts preview range and stale recompute cannot overwrite proposals',async()=>{
 const f=fixture(60),meta=await f.controller.open(5);
 await f.controller.begin({token:meta.token,from:24,to:44});
 await assert.rejects(f.controller.read({token:meta.token,frame:23}),/compute range/);
 await f.controller.read({token:meta.token,frame:25});
 f.shapes.get(7).points[0]+=.1;
 await assert.rejects(f.controller.begin({token:meta.token,from:1,to:60}),/Track changed/);
 assert.equal(f.history.length,0);
});


test('apply failure after twenty edits stops remaining frames and retains accurate native history',async()=>{
 const f=fixture(60),meta=await f.controller.open(5),cards=[];
 await f.controller.begin({token:meta.token,from:1,to:60});
 for(let frame=1;frame<=60;frame++)cards.push(await f.controller.read({token:meta.token,frame}));
 const selected=cards.filter(c=>c.status==='proposal').map(c=>c.frame);
 assert.ok(selected.length>21);f.fail(selected[21]);
 const result=await f.controller.apply({token:meta.token,frames:selected});
 assert.equal(result.partial,true);assert.match(result.error,/save failed/);
 assert.deepEqual(result.appliedFrames,selected.slice(0,21));assert.deepEqual(f.history,result.appliedFrames);
 assert.equal(f.locked,false);assert.equal(f.refreshes,1);
});

test('backend rejects Apply for incomplete computed ranges, even if one proposal exists',async()=>{
 const f=fixture(),meta=await f.controller.open(5);
 await f.controller.begin({token:meta.token,from:1,to:6});
 await f.controller.read({token:meta.token,frame:3});
 await assert.rejects(f.controller.apply({token:meta.token,frames:[3]}),/Compute incomplete/);
 assert.deepEqual(f.history,[]);
});

test('a successful save promise without a committed keyframe is never reported as applied',async()=>{
 const f=fixture(),get=f.job.annotations.get;
 f.job.annotations.get=async frame=>{const states=await get(frame);states[0].save=async()=>states[0];return states;};
 const meta=await f.controller.open(5);await f.controller.read({token:meta.token,frame:3});
 const result=await f.controller.apply({token:meta.token,frames:[3]});
 assert.deepEqual(result.appliedFrames,[]);assert.match(result.error,/not confirmed/);assert.equal(f.locked,false);
});

test('save with wrong committed geometry stops subsequent frames and reports the changed frame',async()=>{
 const f=fixture(),get=f.job.annotations.get;
 f.job.annotations.get=async frame=>{const states=await get(frame),save=states[0].save;
  states[0].save=async function(){this.points[2]+=1;return save.call(this);};return states;};
 const meta=await f.controller.open(5);for(const frame of [3,10])await f.controller.read({token:meta.token,frame});
 const result=await f.controller.apply({token:meta.token,frames:[3,10]});
 assert.deepEqual(result.appliedFrames,[3]);assert.match(result.error,/not confirmed/);assert.equal(f.shapes.has(10),false);
});

test('recompute invalidates in-flight frame analysis from the previous range',async()=>{
 const f=fixture(),meta=await f.controller.open(5),get=f.job.frames.get;
 await f.controller.begin({token:meta.token,from:1,to:6});
 let release;const waiting=new Promise(resolve=>release=resolve);
 f.job.frames.get=async frame=>{await waiting;return get(frame);};
 const read=f.controller.read({token:meta.token,frame:3});
 await new Promise(resolve=>setImmediate(resolve));
 await f.controller.begin({token:meta.token,from:8,to:13});release();
 await assert.rejects(read,/superseded/);
 await assert.rejects(f.controller.apply({token:meta.token,frames:[3]}),/incomplete/);assert.deepEqual(f.history,[]);
});
