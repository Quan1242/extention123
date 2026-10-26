// Optional replay of a local CVAT annotation file. No network or source-file writes.
// Point evidence and native ObjectState are simulated: this tests the batch contract,
// not LiDAR alignment quality or the installed CVAT runtime.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const math=require('../extension/geometry_math.js');
const {createBatchController}=require('../extension/batch_controller.js');
const input=process.env.CVAT_BATCH_ANNOTATIONS;
for(const thin of [false,true])test('local annotation replay '+(thin?'with simulated sparse anchors':'unchanged input')+': 60-frame review/apply/undo preserves anchors and metadata',{skip:!input},async()=>{
 const bytes=fs.readFileSync(input),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),data=JSON.parse(bytes);
 if(thin)for(const track of data.tracks){const shapes=track.shapes.slice().sort((a,b)=>a.frame-b.frame);
  track.shapes=shapes.filter((shape,i)=>i===0||i===shapes.length-1||shape.outside||shapes[i-1]?.outside!==shape.outside||shapes[i+1]?.outside!==shape.outside);}
 const original=structuredClone(data);let proposedFrames=0,anchorFrames=0,outsideFrames=0,reviewFrames=0,fullTracks=0;
 assert.ok(data.tracks.length);assert.equal(data.shapes.length,0);
 for(let index=0;index<data.tracks.length;index++){
  const target=data.tracks[index],baseline=structuredClone(target),clientID=index+10001,history=[];
  const exported=()=>({...structuredClone(target),clientID});
  const stateAt=frame=>{
   const shapes=target.shapes.slice().sort((a,b)=>a.frame-b.frame),left=shapes.filter(s=>s.frame<=frame).at(-1),right=shapes.find(s=>s.frame>frame);
   const shape=left||shapes[0],points=shape.points.slice();
   if(left&&right&&!left.outside&&!right.outside){
    const ratio=(frame-left.frame)/(right.frame-left.frame);
    for(let i=0;i<9;i++){let delta=right.points[i]-points[i];if(i>=3&&i<=5)delta=Math.atan2(Math.sin(delta),Math.cos(delta));points[i]+=delta*ratio;}
   }
   return {clientID,objectType:'track',shapeType:'cuboid',frame,points,outside:!left||shape.outside,
    keyframe:target.shapes.some(s=>s.frame===frame),label:{name:'label-'+target.label_id},
    async save(){assert.equal(this.keyframe,false);history.push(frame);
     target.shapes.push({...structuredClone(shape),id:undefined,frame,points:this.points.slice(),outside:false});return this;}};
  };
  const job={startFrame:0,stopFrame:59,annotations:{export:async()=>({tracks:[exported()]}),get:async f=>[stateAt(f)]},
   frames:{get:async()=>({data:async()=>({imageData:new Blob([])})})}};
  const snapshot={sessionId:'offline-replay',jobId:1224,boxes:[{id:clientID,objectType:'track'}]};
  const controller=createBatchController({math,job:()=>job,snapshot:()=>snapshot,parsePCD:()=>new Float32Array(),
   // Explicitly injected position proposal to exercise Apply without inventing LiDAR evidence.
   batchMath:{sampleROI:()=>[],refinePosition:(_math,_roi,p)=>{const proposed=p.slice();proposed[0]+=.05;
    return {status:'proposal',proposed,delta:[.05,0,0],beforeCount:0,afterCount:0,flags:['Simulated proposal: no PCD supplied']};}},
   assertEditable(){},lock(){},refresh:async()=>{}});
  const meta=await controller.open(clientID);assert.equal(meta.serverId,target.id);
  await controller.begin({token:meta.token,from:0,to:59});const cards=[];
  for(let frame=0;frame<60;frame++)cards.push(await controller.read({token:meta.token,frame}));
  const selected=cards.filter(c=>c.status==='proposal').map(c=>c.frame);
  anchorFrames+=cards.filter(c=>c.status==='anchor').length;outsideFrames+=cards.filter(c=>c.status==='outside').length;reviewFrames+=cards.filter(c=>c.status==='review').length;
  if(baseline.shapes.length===60)fullTracks++;
  assert.deepEqual(target,baseline,'Compute must not modify annotations');
  if(selected.length){const result=await controller.apply({token:meta.token,frames:selected});
   assert.equal(result.error,null);assert.deepEqual(result.appliedFrames,selected);assert.deepEqual(history,selected);
   for(const s of baseline.shapes)assert.deepEqual(target.shapes.find(x=>x.frame===s.frame),s);
   for(const frame of selected){const card=cards[frame],saved=target.shapes.find(s=>s.frame===frame);
    assert.deepEqual(saved.points.slice(3),card.original.slice(3));assert.deepEqual(saved.points,card.proposed);}
   // Simulated native Undo, one entry per inserted frame, restores the whole file.
   while(history.length){const frame=history.pop();target.shapes.splice(target.shapes.findIndex(s=>s.frame===frame),1);}
  }
  proposedFrames+=selected.length;assert.deepEqual(target,baseline);controller.cancel();
 }
 assert.deepEqual(data,original);assert.equal(hash(fs.readFileSync(input)),hash(bytes));
 if(thin)assert.ok(proposedFrames>0,'Derived sparse fixture must exercise Apply');
 console.log(JSON.stringify({job:1224,derivedSparseFixture:thin,tracks:data.tracks.length,computedFrames:data.tracks.length*60,fullTracks,anchorFrames,outsideFrames,reviewFrames,simulatedAppliedFrames:proposedFrames,sourceSHA256:hash(bytes),evidence:'annotation-contract replay; synthetic proposals, simulated native save and undo; no PCD or live CVAT writes'}));
});
