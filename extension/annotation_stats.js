(function(root){
'use strict';
function countCuboidsById(data,startFrame,stopFrame){
 if(!data||typeof data!=='object')throw new Error('Invalid annotation data');
 for(const kind of ['tracks','shapes'])if(data[kind]!=null&&!Array.isArray(data[kind]))throw new Error('Invalid '+kind+' annotations');
 if(!Number.isInteger(startFrame)||!Number.isInteger(stopFrame)||stopFrame<startFrame)throw new Error('Invalid job frame range');
 const labels=new Map((data.labels_manifest||[]).map(label=>[label.id,label.name]));
 const counts=new Map();
 function rowFor(item){
  if(!Number.isInteger(item.clientID))throw new Error('Annotation is missing a valid clientID');
  let row=counts.get(item.clientID);
  if(!row){row={clientID:item.clientID,serverID:item.id??null,label:labels.get(item.label_id)||'Unknown',cuboids:0,outside:0};counts.set(item.clientID,row);}
  return row;
 }
 function addFrames(row,shape,from,to){
  if(shape.type!=='cuboid'||to<from)return;
  const count=to-from+1;
  if(shape.outside===true)row.outside+=count;
  else row.cuboids+=count;
 }
 for(const track of data.tracks||[]){
  const keyframes=(track.shapes||[]).filter(shape=>shape.type==='cuboid').slice().sort((a,b)=>a.frame-b.frame);
  if(!keyframes.length)continue;
  const row=rowFor(track);
  for(let i=0;i<keyframes.length;i++){
   const shape=keyframes[i],next=keyframes[i+1];
   if(!Number.isInteger(shape.frame))throw new Error('Track cuboid is missing a valid frame');
   const from=Math.max(startFrame,shape.frame),to=Math.min(stopFrame,(next?.frame??(stopFrame+1))-1);
   addFrames(row,shape,from,to);
  }
 }
 for(const shape of data.shapes||[]){
  if(shape.type!=='cuboid')continue;
  if(!Number.isInteger(shape.frame))throw new Error('Standalone cuboid is missing a valid frame');
  const row=rowFor(shape),frame=shape.frame;
  if(frame>=startFrame&&frame<=stopFrame)addFrames(row,shape,frame,frame);
 }
 return [...counts.values()].filter(row=>row.cuboids||row.outside).sort((a,b)=>a.clientID-b.clientID);
}
root.__C3D_ANNOTATION_STATS={countCuboidsById};
if(typeof module!=='undefined'&&module.exports)module.exports=root.__C3D_ANNOTATION_STATS;
})(typeof window!=='undefined'?window:globalThis);
