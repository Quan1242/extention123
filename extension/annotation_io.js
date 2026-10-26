/* Native 3D JSON round-trip. Existing objects are edited, never recreated. */
(function(root){
'use strict';
const clone=value=>JSON.parse(JSON.stringify(value)),kinds=['tracks','shapes'];
const attrs=list=>Object.fromEntries((list||[]).map(a=>[a.spec_id,String(a.value)]));
function createAnnotationIO(env){
 let plan=null,seq=0,running=false;
 function context(payload={}){
  const s=env.snapshot(),job=env.job();
  if(!s.connected||payload.jobId!=null&&payload.jobId!==s.jobId||payload.sessionId!=null&&payload.sessionId!==s.sessionId)throw new Error('Job/session changed; reopen import');
  if(!job?.annotations?.export||!job.annotations.get)throw new Error('Native annotation APIs unavailable');
  return {s,job};
 }
 function editable(){env.assertEditable();if(running)throw new Error('Annotation import already in progress');}
 async function exported(payload){
  if(running)throw new Error('Wait for annotation import before exporting');
  const {s,job}=context(payload),data=clone(await job.annotations.export());context({jobId:s.jobId,sessionId:s.sessionId});
  data.c3d={schema:'cvat-3d-tool-annotations/v2',jobId:s.jobId,origin:env.origin(),sessionId:s.sessionId,identity:'clientID is the CVAT display ID in this editor; id is the database ID',source:'native-editor-including-unsaved'};
  data.labels_manifest=clone(job.labels||[]);
  return {success:true,jobId:s.jobId,startFrame:job.startFrame,stopFrame:job.stopFrame,data,trackCount:data.tracks?.length||0,shapeCount:data.shapes?.length||0};
 }
 function remap(input,job,data){
  const labels=job.labels||[],source=data.labels_manifest||[],item=clone(input),src=source.find(l=>l.id===item.label_id);
  const label=src?labels.find(l=>l.name===src.name):labels.find(l=>l.id===item.label_id);
  if(!label)throw new Error('Cannot map label '+item.label_id+' exactly; labels_manifest required');
  const targetAttrs=label.attributes||[];
  function mapAttrs(values){
   return (values||[]).map(a=>{
    const from=src?.attributes?.find(x=>x.id===a.spec_id),to=from?targetAttrs.find(x=>x.name===from.name&&x.mutable===from.mutable):targetAttrs.find(x=>x.id===a.spec_id);
    if(!to)throw new Error('Cannot map attribute '+a.spec_id+' exactly; import stopped');
    return {spec_id:to.id,value:String(a.value)};
   });
  }
  item.label_id=label.id;item.attributes=mapAttrs(item.attributes);
  for(const shape of item.shapes||[])shape.attributes=mapAttrs(shape.attributes);
  return item;
 }
 function validate(item,kind,job){
  if(item.elements?.length)throw new Error('Skeleton import is not supported by 3D ID-preserving import');
  const shapes=kind==='tracks'?item.shapes:[item];
  if(!Array.isArray(shapes)||!shapes.length)throw new Error('Track must contain keyframes');
  const frames=new Set();
  for(const s of shapes){
   if(s.type!=='cuboid'||!env.math.parseCVAT16Points(s.points)||!Number.isInteger(s.frame)||s.frame<job.startFrame||s.frame>job.stopFrame||frames.has(s.frame))throw new Error('Invalid/duplicate/out-of-job cuboid frame');
   if(s.outside!=null&&typeof s.outside!=='boolean'||s.occluded!=null&&typeof s.occluded!=='boolean')throw new Error('Invalid visibility flags');
   frames.add(s.frame);
  }
  if(kind==='tracks'&&item.frame!==Math.min(...frames))throw new Error('Track frame must equal its first keyframe');
  if(item.group!=null&&(!Number.isInteger(item.group)||item.group<0))throw new Error('Invalid group');
 }
 async function preview(payload){
  editable();const {s,job}=context(payload),data=payload.payload;
  if(!data||!Array.isArray(data.tracks||[])||!Array.isArray(data.shapes||[]))throw new Error('Invalid annotation file');
  if((data.tags||[]).length||(data.intervals||[]).length)throw new Error('This 3D import supports cuboid tracks/shapes only; tags/intervals are not silently discarded');
  if(data.c3d&&(data.c3d.jobId!==s.jobId||data.c3d.origin!==env.origin())&&payload.mode!=='append')throw new Error('File belongs to another job/server. Use Add; Replace cannot reuse foreign IDs');
  const current=clone(await job.annotations.export()),rows=[],seen=new Set(),mode=payload.mode==='append'?'append':'replace';
  for(const kind of kinds)for(let i=0;i<(data[kind]||[]).length;i++){
   const original=data[kind][i],key=kind+':'+i,item=remap(original,job,data);validate(item,kind,job);
   // Server IDs map raw exports safely. Display IDs are only trusted with same-job metadata.
   const target=(current[kind]||[]).find(t=>Number.isInteger(item.id)&&t.id===item.id)||
    (data.c3d?.sessionId===s.sessionId&&item.id==null&&Number.isInteger(item.clientID)&&(current[kind]||[]).find(t=>t.clientID===item.clientID));
   if(mode==='replace'&&target){const identity=kind+':'+target.clientID;if(seen.has(identity))throw new Error('Duplicate target ID in file');seen.add(identity);}
   rows.push({key,kind,item,target,sourceClientId:original.clientID??null,sourceServerId:original.id??null,
    targetClientId:target?.clientID??null,label:job.labels.find(l=>l.id===item.label_id).name,frames:kind==='tracks'?item.shapes.length:1});
  }
  if(!rows.length)throw new Error('No cuboid objects in file');
  editable();context({jobId:s.jobId,sessionId:s.sessionId});
  plan={token:'io-'+(++seq),job,s,mode,current,signature:JSON.stringify(current),rows};
  return {token:plan.token,mode,jobId:s.jobId,existing:kinds.reduce((n,k)=>n+(current[k]?.length||0),0),
   rows:rows.map(({item,target,...r})=>({...r,matched:!!target})),note:mode==='append'?'Add creates new CVAT IDs. Source IDs are shown for selection only.':'Replace keeps existing display/database IDs; selected tracks are replaced across all their keyframes.'};
 }
 async function getState(job,kind,item){
  const frame=kind==='tracks'?Math.min(...item.shapes.map(s=>s.frame)):item.frame;
  return (await job.annotations.get(frame,true,[])).find(s=>s.clientID===item.clientID&&s.objectType===(kind==='tracks'?'track':'shape'));
 }
 async function apply(payload){
  editable();const {s,job}=context(payload),p=plan;
  if(!p||p.token!==payload.token||p.job!==job||p.s.sessionId!==s.sessionId)throw new Error('Import preview expired');
  if(!Array.isArray(payload.keys)||!payload.keys.length||new Set(payload.keys).size!==payload.keys.length)throw new Error('Choose at least one ID');
  const selected=payload.keys.map(key=>p.rows.find(row=>row.key===key));if(selected.some(r=>!r))throw new Error('Unknown file selection');
  if(JSON.stringify(await job.annotations.export())!==p.signature)throw new Error('Annotations changed after preview; reopen file');
  const scope=payload.scope==='all'?'all':'selected';
  if(scope==='all'&&(selected.length!==p.rows.length||p.mode!=='replace'))throw new Error('Replace all requires all file IDs');
  const removals={tracks:[],shapes:[]};
  if(p.mode==='replace'){
   if(selected.some(r=>!r.target))throw new Error('Selected replacement ID not found. Use Add for new objects; no automatic new IDs during Replace');
   for(const row of selected){
    if(row.kind==='tracks'&&row.item.frame!==row.target.frame||row.kind==='shapes'&&row.item.frame!==row.target.frame)throw new Error('Moving an object start frame is unsupported without changing identity; import stopped');
    if((row.item.group||0)!==(row.target.group||0)&&!job.annotations.group)throw new Error('Group changed but native grouping API is unavailable');
    const state=await getState(job,row.kind,row.target);if(!state||typeof state.save!=='function'||state.lock||state.isGroundTruth)throw new Error('Target ID #'+row.target.clientID+' is missing/locked/read-only');
    if(row.kind==='tracks')for(const shape of row.item.shapes){const state=(await job.annotations.get(shape.frame,true,[])).find(x=>x.clientID===row.target.clientID);if(!state||state.lock||state.isGroundTruth)throw new Error('A target frame is protected');}
   }
   if(scope==='all'){
    if((p.current.tags||[]).length||(p.current.intervals||[]).length)throw new Error('Replace all would remove tags/intervals; use selected IDs');
    for(const kind of kinds)for(const target of p.current[kind]||[])if(!selected.some(r=>r.kind===kind&&r.target.clientID===target.clientID)){
     const state=await getState(job,kind,target);if(!state||state.lock||state.isGroundTruth)throw new Error('An omitted ID is locked/missing; cannot Replace all');removals[kind].push(target);
    }
   }
  }
  if((p.mode==='append'||kinds.some(k=>removals[k].length))&&typeof job.annotations.commit!=='function')throw new Error('Native commit API unavailable');
  if(JSON.stringify(await job.annotations.export())!==p.signature)throw new Error('Annotations changed during preflight');
  context({jobId:s.jobId,sessionId:s.sessionId});env.assertEditable();
  if(running||plan!==p)throw new Error('Import preview was consumed or replaced');
  if(p.mode==='append'&&selected.some(r=>r.item.group)&&!job.annotations.group)throw new Error('Grouped Add requires native grouping API');
  running=true;plan=null;env.lock(true);const changed=[],added=[],removed=[],groups=[];let error=null,edits=0;
  try{
   if(p.mode==='append'){
    const clean=(item)=>{const out=clone(item);delete out.id;delete out.clientID;out.group=0;for(const shape of out.shapes||[]){delete shape.id;delete shape.clientID;}return out;};
    const add={tracks:[],shapes:[]};for(const row of selected)add[row.kind].push(clean(row.item));
    await job.annotations.commit(add,{},s.frame);
    const after=await job.annotations.export();
    for(const kind of kinds)for(const item of after[kind]||[])if(!(p.current[kind]||[]).some(x=>x.clientID===item.clientID))added.push({kind,clientID:item.clientID});
    if(added.length!==selected.length)throw new Error('Native Add count was not confirmed; inspect Undo');
    for(const kind of kinds){const rows=selected.filter(r=>r.kind===kind),created=added.filter(r=>r.kind===kind);rows.forEach((r,i)=>r.addedId=created[i].clientID);}
   }else{
    for(const row of selected){
     env.assertEditable();context({jobId:s.jobId,sessionId:s.sessionId});
     const shapes=row.kind==='tracks'?row.item.shapes.slice().sort((a,b)=>a.frame-b.frame):[row.item];
     const label=job.labels.find(l=>l.id===row.item.label_id),defaults=Object.fromEntries((label.attributes||[]).map(a=>[a.id,a.defaultValue??a.default_value??a.values?.[0]??'']));
     let resolvedAttributes={...defaults,...attrs(row.item.attributes)};
     for(const shape of shapes){
      const state=(await job.annotations.get(shape.frame,true,[])).find(x=>x.clientID===row.target.clientID);
      if(!state||state.lock||state.isGroundTruth)throw new Error('Target became protected during import');
      state.label=label;state.points=shape.points.slice();
      state.rotation=shape.rotation||0;state.outside=shape.outside||false;state.occluded=shape.occluded||false;state.zOrder=shape.z_order||0;
      // ObjectState merges attributes; pass every schema field to clear stale values.
      resolvedAttributes={...resolvedAttributes,...attrs(shape.attributes)};state.attributes={...resolvedAttributes};
      if(row.kind==='tracks')state.keyframe=true;
      await state.save();if(!changed.includes(row.target.clientID))changed.push(row.target.clientID);
      if(++edits%20===0)await new Promise(resolve=>setTimeout(resolve,0));
     }
     if(row.kind==='tracks')for(const old of row.target.shapes)if(!row.item.shapes.some(x=>x.frame===old.frame)){
      const state=(await job.annotations.get(old.frame,true,[])).find(x=>x.clientID===row.target.clientID);state.keyframe=false;await state.save();
     }
     const actual=(await job.annotations.export())[row.kind].find(x=>x.clientID===row.target.clientID);
     if(!actual||actual.id!==row.target.id||actual.label_id!==row.item.label_id)throw new Error('Replacement identity/label changed; inspect Undo');
     const actualShapes=row.kind==='tracks'?actual.shapes:[actual];
     if(actualShapes.length!==shapes.length||shapes.some(shape=>{const found=actualShapes.find(x=>x.frame===shape.frame);return !found||!!found.outside!==!!shape.outside||!!found.occluded!==!!shape.occluded||(found.z_order||0)!==(shape.z_order||0)||Math.abs((found.rotation||0)-(shape.rotation||0))>1e-4||found.points.slice(0,9).some((v,i)=>Math.abs(i>=3&&i<=5?Math.atan2(Math.sin(v-shape.points[i]),Math.cos(v-shape.points[i])):v-shape.points[i])>1e-4);} ))throw new Error('Replacement geometry/keyframe set not confirmed; inspect Undo');
     let expectedAttrs={...defaults,...attrs(row.item.attributes)};
     for(const shape of shapes){
      expectedAttrs={...expectedAttrs,...attrs(shape.attributes)};
      const saved=actualShapes.find(x=>x.frame===shape.frame),actualAttrs={...attrs(actual.attributes),...attrs(saved.attributes)};
      if((label.attributes||[]).some(a=>String(actualAttrs[a.id])!==String(expectedAttrs[a.id])))throw new Error('Replacement attributes not confirmed; inspect Undo');
     }
    }
   }
   // Group numbers are local to a collection. Recreate changed grouping among
   // selected objects only; never attach them to unrelated existing members.
   const changedGroups=new Set(selected.filter(r=>p.mode==='append'?!!r.item.group:(r.item.group||0)!==(r.target.group||0)).map(r=>r.item.group||0));
   for(const sourceGroup of changedGroups){
    context({jobId:s.jobId,sessionId:s.sessionId});env.assertEditable();
    const rows=selected.filter(r=>(r.item.group||0)===sourceGroup),states=[];
    const after=await job.annotations.export();
    for(const row of rows){const actual=after[row.kind].find(t=>t.clientID===(p.mode==='append'?row.addedId:row.target.clientID));states.push(await getState(job,row.kind,actual));}
    const assigned=await job.annotations.group(states,sourceGroup===0);groups.push({source:sourceGroup,assigned});
    const grouped=await job.annotations.export();
    if(rows.some(row=>{const actual=grouped[row.kind].find(t=>t.clientID===(p.mode==='append'?row.addedId:row.target.clientID));return !actual||(actual.group||0)!==assigned;}))throw new Error('Native grouping not confirmed');
   }
   if(p.mode==='replace'&&kinds.some(k=>removals[k].length)){
     context({jobId:s.jobId,sessionId:s.sessionId});env.assertEditable();
     await job.annotations.commit({},removals,s.frame);
     const after=await job.annotations.export();
     for(const kind of kinds)for(const target of removals[kind])if(!(after[kind]||[]).some(x=>x.clientID===target.clientID))removed.push(target.clientID);
     if(removed.length!==kinds.reduce((n,k)=>n+removals[k].length,0))throw new Error('Deletion not fully confirmed; inspect Undo');
   }
  }catch(e){error=e.message;}
  finally{try{await env.refresh(job);}catch(e){error=(error?error+'; ':'')+'Render refresh failed: '+e.message;}env.lock(false);running=false;}
  return {success:!error,error,changed,added,removed,groups,saveRequired:true,
   message:error?'Import stopped; earlier native edits may remain. Inspect Undo before retrying.':'Editor updated. Save CVAT to persist; no page reload needed.'};
 }
 return {exported,preview,apply};
}
root.__C3D_ANNOTATION_IO={createAnnotationIO};if(typeof module!=='undefined')module.exports={createAnnotationIO};
})(typeof window!=='undefined'?window:globalThis);
