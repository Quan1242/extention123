/* Own implementation: position-only proposals, no SUSTechPOINTS code copied. */
(function(root){
'use strict';
function refinePosition(math,points,current,ground,neighbors=[]){
 const seed=new Set(math.extractBoxROI(points,{points:current},.4)),other=new Set();
 for(const box of neighbors)for(const q of math.extractBoxROI(points,box,-.15))if(!seed.has(q))other.add(q);
 if(other.size)points=points.filter(q=>!other.has(q));
 if(Math.abs(Math.sin(current[3]))>1e-3||Math.abs(Math.sin(current[4]))>1e-3)return {status:'review',flags:['Tilted box: position refinement not supported'],beforeCount:0,afterCount:0};
 const original=current.slice(),usable=math.canManuallySnapGround(ground);
 const object=points.filter(p=>p.every(Number.isFinite)&&p[2]>(usable?ground.a*p[0]+ground.b*p[1]+ground.c:original[2]-original[8]/2)+.1);
 const insideBefore=math.extractBoxROI(object,{points:original},0).length;
 const flags=[];if(object.length<20)return {status:'review',flags:['Too few object points'],beforeCount:insideBefore,afterCount:insideBefore};
 const cluster=math.selectSeedCluster(object,{points:original},usable?ground:null,.3);
 if(cluster.length<20)return {status:'review',flags:['Unable to isolate target points'],beforeCount:insideBefore,afterCount:insideBefore};
 const c=Math.cos(original[5]),s=Math.sin(original[5]),xs=[],ys=[];
 for(const p of cluster){const x=p[0]-original[0],y=p[1]-original[1];xs.push(c*x+s*y);ys.push(-s*x+c*y);}
 xs.sort((a,b)=>a-b);ys.sort((a,b)=>a-b);
 const bounds=a=>[a[Math.floor((a.length-1)*.01)],a[Math.ceil((a.length-1)*.99)]];
 const [x0,x1]=bounds(xs),[y0,y1]=bounds(ys);
 if(x1-x0>original[6]*1.5||y1-y0>original[7]*1.5)
  return {status:'review',flags:['Cluster may contain another object'],beforeCount:insideBefore,afterCount:insideBefore};
 const dx=(x0+x1)/2,dy=(y0+y1)/2,proposed=original.slice();
 proposed[0]+=c*dx-s*dy;proposed[1]+=s*dx+c*dy;
 if(usable&&ground?.accepted&&ground.confidence>=.65){
  const plane=math.makePlane(ground.a,ground.b,ground.c);
  proposed[2]=math.snapGroundPoints(proposed,plane).newPoints[2];
 }else flags.push('Ground uncertain: Z preserved');
 const shift=Math.hypot(proposed[0]-original[0],proposed[1]-original[1]);
 if(shift>1.2||Math.abs(proposed[2]-original[2])>.5)
  return {status:'review',flags:['Correction too large; add a reviewed keyframe'],beforeCount:insideBefore,afterCount:insideBefore};
 const insideAfter=math.extractBoxROI(object,{points:proposed},0).length;
 if(insideAfter<insideBefore*.9)return {status:'review',flags:['Proposal loses point support'],beforeCount:insideBefore,afterCount:insideAfter};
 if(insideAfter<20)flags.push('Sparse support: inspect occlusion/range');
 const delta=proposed.slice(0,3).map((x,i)=>x-original[i]);
 const moved=Math.hypot(...delta)>.025;
 return {status:moved?'proposal':'unchanged',proposed:moved?proposed:null,delta,beforeCount:insideBefore,afterCount:insideAfter,
  flags:[...flags,'Geometry proposal, not verified tracking'],clusterCount:cluster.length};
}
function sampleROI(points,box,limit=4000){
 const sampled=[],step=Math.max(1,Math.ceil(points.length/limit));
 for(let i=0;i<points.length;i+=step)sampled.push(points[i]);
 return sampled;
}
const api={refinePosition,sampleROI};root.__C3D_BATCH_MATH=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
