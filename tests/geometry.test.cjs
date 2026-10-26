const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../extension/geometry_math.js');
const box = (id = 1, x = 0, y = 0, z = 1, l = 4, w = 2, h = 2) => ({id, label_name:'vehicles', points:[x,y,z,0,0,0,l,w,h,0,0,0,0,0,0,0]});
const close = (a,b,t=1e-8) => assert.ok(Math.abs(a-b)<t, `${a} != ${b}`);

test('Keep direction fits extents in the chosen heading and recenters without changing yaw',()=>{
    const yaw=.43,points=[];
    for(let x=-2;x<=2;x+=.2)for(let y=-.8;y<=.8;y+=.2)points.push([3+Math.cos(yaw)*x-Math.sin(yaw)*y,-2+Math.sin(yaw)*x+Math.cos(yaw)*y,1.7]);
    const seed=box().points;seed[5]=yaw;
    const fitted=m.fitBoxToCluster(points,'vehicles',{points:seed,ground:m.makePlane(0,0,0,{accepted:true,confidence:1}),keepDirection:true});
    assert.equal(fitted[5],yaw);close(fitted[0],3);close(fitted[1],-2);close(fitted[6],4);close(fitted[7],1.6);
    const weak=m.fitBoxToCluster(points,'vehicles',{points:seed,ground:{accepted:false},allowGroundFallback:true,keepDirection:true});
    assert.equal(weak[5],yaw);assert.equal(weak[2],seed[2]);assert.equal(weak[8],seed[8]);
    // An intentionally different heading must change the measured extents.
    seed[5]=yaw+.1;
    const offAxis=m.fitBoxToCluster(points,'vehicles',{points:seed,ground:m.makePlane(0,0,0,{accepted:true,confidence:1}),keepDirection:true});
    assert.equal(offAxis[5],seed[5]);close(offAxis[6],4*Math.cos(.1)+1.6*Math.sin(.1));close(offAxis[7],1.6*Math.cos(.1)+4*Math.sin(.1));
    seed[3]=.1;
    assert.throws(()=>m.fitBoxToCluster(points,'vehicles',{points:seed,keepDirection:true}),/upright/);
});
test('rotation is immutable, preserves geometry and wraps after a full turn', () => {
    const p=box().points; let r=p;
    for(let i=0;i<4;i++) r=m.rotateYawPoints(r,90);
    close(r[5],0); assert.equal(p[5],0); assert.deepEqual(r.slice(0,5),p.slice(0,5)); assert.deepEqual(r.slice(6),p.slice(6));
    close(m.rotateYawPoints(p,180)[5],Math.PI);
});
test('non-finite coordinates and nonpositive dimensions are rejected', () => {
    for(const value of [NaN,Infinity,-Infinity]) {const b=box();b.points[0]=value;assert.equal(m.parseCVAT16Points(b.points),null);}
    for(const value of [0,-1]) {const b=box();b.points[6]=value;assert.equal(m.parseCVAT16Points(b.points),null);}
});
test('snap supports XYZ Euler tilt and slope without any penetrating vertex', () => {
    const b=box(), plane=m.makePlane(0.03,-0.02,0.2); b.points[3]=Math.PI/4;b.points[4]=0.15;b.points[5]=0.4;
    const result=m.snapGroundPoints(b.points,plane), residuals=m.cuboidVertices(result.newPoints).map(v=>v[2]-plane.getTargetZ(v[0],v[1]));
    close(Math.min(...residuals),0);assert.ok(residuals.every(r=>r>=-1e-8));assert.deepEqual(result.newPoints.slice(3),b.points.slice(3));
});
test('oriented IoU detects true intersections and avoids close but disjoint boxes', () => {
    close(m.orientedIoU(box().points,box().points),1);
    close(m.orientedIoU(box(1,0,0,1,0.1,0.1,0.1).points,box(2,0.9,0,1,0.1,0.1,0.1).points),0);
    close(m.orientedIoU(box(1,0,0,1,8,2,2).points,box(2,2,0,1,8,2,2).points),0.6);
    const rotated=box();rotated.points[5]=Math.PI/2;close(m.orientedIoU(box().points,rotated.points),1/3);
    assert.equal(m.orientedIoU(box().points,box(2,0,0,10).points),0);
    rotated.points[3]=0.2;assert.equal(m.orientedIoU(box().points,rotated.points),null);
});
test('QC checks width/height maximums and never assumes unknown class is vehicles', () => {
    const large=box(1,0,0,5,4,5,10), codes=m.auditCuboid(large).issues.map(i=>i.code);
    assert.ok(codes.includes('OVERSIZED_WIDTH'));assert.ok(codes.includes('OVERSIZED_HEIGHT'));
    large.label_name='unconfigured';assert.deepEqual(m.auditCuboid(large).issues.map(i=>i.code),['NO_CLASS_RULE']);
});
test('frame QC emits one pair issue linked to both boxes; no ground means no ground verdict', () => {
    const result=m.auditFrame([box(1),box(2,0.1)]);
    assert.equal(result.filter(i=>i.code==='DUPLICATE_COLLISION').length,1);
    assert.deepEqual(result.find(i=>i.code==='DUPLICATE_COLLISION').boxIds,[1,2]);
    assert.ok(!result.some(i=>/GROUND/.test(i.code)));
});
test('local LiDAR ground is independent of box bottom and rejects sparse support', () => {
    const points=[];
    for(let x=-8;x<=8;x+=0.35) for(let y=-8;y<=8;y+=0.35) points.push([x,y,0.04*x-0.025*y+0.2]);
    // Roof clutter should not move the annulus estimate.
    for(let x=-2;x<=2;x+=0.2) for(let y=-1;y<=1;y+=0.2) points.push([x,y,2]);
    const index=new m.GroundIndex(points), low=index.estimate(box(1,0,0,-2)), high=index.estimate(box(1,0,0,5));
    assert.ok(low.accepted);assert.ok(high.accepted);close(low.a,0.04);close(low.b,-0.025);close(low.c,0.2);close(high.c,low.c);
    assert.equal(new m.GroundIndex(points.slice(0,8)).estimate(box()).accepted,false);
});
test('plane fitter rejects collinear points rather than inventing ground',()=> {
    assert.equal(m.fitPlane([[0,0,0],[1,0,1],[2,0,2]]),null);
});

function bikeCluster(length=2,width=.7,yaw=Math.PI/6) {
    const points=[];
    for(let ix=0;ix<=10;ix++)for(let iy=0;iy<=4;iy++)for(const z of [.6,1.6]){
        const x=(ix/10-.5)*length,y=(iy/4-.5)*width;
        points.push([10+Math.cos(yaw)*x-Math.sin(yaw)*y,-3+Math.sin(yaw)*x+Math.cos(yaw)*y,z]);
    }
    return points;
}
const fitBox=()=>({points:[10,-3,1.2,0,0,0,4,2,2,11,12,13,14,15,16,17],ground:m.makePlane(0,0,.2,{accepted:true,confidence:.99})});
test('Auto-Fit bike recovers PCA yaw, extents and bottom while filtering road',()=>{
    const box=fitBox(),before=[...box.points],points=bikeCluster();
    for(let x=7;x<=13;x+=.2)for(let y=-5;y<=-1;y+=.2)points.push([x,y,.2]);
    const result=m.fitBoxToCluster(points,'two-wheels',box);
    assert.equal(result.length,16);close(result[5],Math.PI/6);close(result[0],10);close(result[1],-3);
    close(result[6],2);close(result[7],.7);close(result[8],1.4);close(result[2]-result[8]/2,.2);
    assert.deepEqual(result.slice(9),before.slice(9));assert.deepEqual(box.points,before);
});
test('Auto-Fit clamps sparse bike dimensions, max dimensions and preserves yaw hemisphere',()=>{
    const box=fitBox();box.points[5]=Math.PI/6+Math.PI;
    const fitted=m.fitBoxToCluster(bikeCluster(.8,.2),'two-wheels',box);
    close(fitted[6],1.4);close(fitted[7],.6);
    assert.ok(Math.cos(fitted[5]-box.points[5])>.99);
    const huge=m.fitBoxToCluster(bikeCluster(20,8),'two-wheels',fitBox());
    assert.ok(huge[6]<=m.DIMENSION_SPECS['two-wheels'].maxL);assert.ok(huge[7]<=m.DIMENSION_SPECS['two-wheels'].maxW);
});
test('Auto-Fit rejects sparse post-ground cluster, invalid ground, unknown labels and XY degeneracy',()=>{
    assert.throws(()=>m.fitBoxToCluster(bikeCluster().slice(0,9),'two-wheels',fitBox()),/minimum 10 points|cần ít nhất 10 điểm/i);
    assert.throws(()=>m.fitBoxToCluster(Array.from({length:20},()=>[10,-3,.2]),'two-wheels',fitBox()),/minimum 10 points|cần ít nhất 10 điểm/i);
    assert.throws(()=>m.fitBoxToCluster(bikeCluster(),'unknown',fitBox()),/No dimension rule|quy chuẩn/i);
    assert.throws(()=>m.fitBoxToCluster(bikeCluster(),'two-wheels',{...fitBox(),ground:{a:NaN,b:0,c:0}}),/Invalid ground plane|Ground không hợp lệ/i);
    assert.throws(()=>m.fitBoxToCluster(Array.from({length:20},()=>[10,-3,1]),'two-wheels',fitBox()),/XY spread|phân bố XY/i);
});
test('Auto-Fit bottom touches highest ground corner on a slope, with no penetrating vertices',()=>{
    const box=fitBox();box.ground=m.makePlane(.03,-.02,.2,{accepted:true,confidence:.99});
    const result=m.fitBoxToCluster(bikeCluster(),'two-wheels',box);
    const clearance=m.cuboidVertices(result).map(([x,y,z])=>z-box.ground.getTargetZ(x,y));
    close(Math.min(...clearance),0);assert.ok(clearance.every(z=>z>=-1e-9));
});
test('Auto-Fit ROI expands rotated box in its local frame and excludes outside points',()=>{
    const box=fitBox();box.points[5]=Math.PI/2;
    const points=[[10,-.65,1],[11.3,-3,1],[11.5,-3,1],[10,-3,3]];
    assert.deepEqual(m.extractBoxROI(points,box,.4),points.slice(0,2));
});

test('seed cluster grows beyond a rough box and excludes a disconnected neighbor',()=>{
    const points=[];
    for(let x=0;x<=4;x+=.15)for(let y=-.4;y<=.4;y+=.15)points.push([x,y,1]);
    for(let x=0;x<=4;x+=.15)for(let y=3;y<=3.8;y+=.15)points.push([x,y,1]);
    points.push([10,10,1]);
    const box={points:[.3,0,1,0,0,Math.PI/2,1,.7,2,0,0,0,0,0,0,0]};
    const cluster=m.selectSeedCluster(points,box,{a:0,b:0,c:0});
    assert.ok(cluster.some(p=>p[0]>3.5));assert.ok(cluster.every(p=>p[1]<1));
});
test('unreliable ground can fit XY/yaw explicitly while preserving original Z and height',()=>{
    const box=fitBox();box.ground={accepted:false,reason:'one-sided ground'};box.allowGroundFallback=true;
    const fitted=m.fitBoxToCluster(bikeCluster(),'two-wheels',box);
    close(fitted[5],Math.PI/6);assert.equal(fitted[2],box.points[2]);assert.equal(fitted[8],box.points[8]);
    assert.throws(()=>m.fitBoxToCluster(bikeCluster(),'two-wheels',{...box,allowGroundFallback:false}),/one-sided ground/);
});

test('fit heading follows rectangle footprint despite heavily biased roof return density',()=>{
    const yaw=.3,points=[],rotate=(x,y)=>[Math.cos(yaw)*x-Math.sin(yaw)*y,Math.sin(yaw)*x+Math.cos(yaw)*y,1.5];
    for(const x of [-2,2])for(const y of [-.9,.9])points.push(rotate(x,y));
    for(let i=0;i<12000;i++){const x=-1.9+3.8*(i%100)/99;points.push(rotate(x,x*.4));}
    const box={points:[0,0,1,0,0,0,4,2,2,0,0,0,0,0,0,0],ground:{a:0,b:0,c:0,accepted:true,confidence:.99}};
    const fitted=m.fitBoxToCluster(points,'vehicles',box);
    close(fitted[5],yaw);close(fitted[6],4);close(fitted[7],1.8);
});
test('voxel clustering preserves original dense returns and rejects disconnected components',()=>{
    const points=[];for(let i=0;i<20000;i++){const x=(i%80)*.05,y=Math.floor(i/80)%12*.05;points.push([x,y,1+i%4*.1]);}
    points.push([20,20,1]);
    const selected=m.selectSeedCluster(points,{points:[.3,.3,1,0,0,0,1,1,2,0,0,0,0,0,0,0]},{a:0,b:0,c:0});
    assert.equal(selected.length,20000);assert.ok(!selected.some(p=>p[0]===20));
});
test('spatial index queries only local cells and preserves all repeated local returns',()=>{
    const index=new m.SpatialPointIndex(5);index.add(0,0,1);index.add(0,0,1);index.add(10,10,1);index.add(0,0,8);index.add(NaN,0,0);
    assert.equal(index.count,4);assert.deepEqual(index.query([-1,-1,0],[1,1,2]),[[0,0,1],[0,0,1]]);
});

test('manual ground snap allows supported estimated plane and rejects invalid evidence',()=>{
 const g={a:0,b:0,c:0,accepted:true,confidence:.52,rmse:.02,inlierCount:137};
 assert.ok(m.canManuallySnapGround(g));
 for(const patch of [{accepted:false},{confidence:.4},{rmse:.1},{inlierCount:20},{a:NaN},{a:.5}])
  assert.equal(m.canManuallySnapGround({...g,...patch}),false);
});

test('family vehicles QC accepts compact car, SUV and MPV and flags oversized bus/truck geometry',()=>{
 for(const [l,w,h] of [[3,1.5,1.3],[4.7,1.9,1.8],[5.4,2.1,2.1]]) {
  const codes=m.auditCuboid(box(1,0,0,1,l,w,h)).issues.map(i=>i.code);
  assert.ok(!codes.some(c=>/LENGTH|WIDTH|HEIGHT/.test(c)));
 }
 for(const [l,w,h] of [[8,2.5,3.2],[12,2.6,3.5]]) {
  assert.ok(m.auditCuboid(box(1,0,0,2,l,w,h)).issues.length>0);
 }
 assert.deepEqual(m.DIMENSION_SPECS.vehicles,{minL:2.8,maxL:5.8,minW:1.4,maxW:2.3,minH:1.1,maxH:2.2});
});
test('family Auto-Fit refuses a long vehicle instead of clamping it into a car',()=>{
 const points=[];for(let x=-4;x<=4;x+=.2)for(let y=-1;y<=1;y+=.2)points.push([x,y,1.7]);
 const seed={points:[0,0,1,0,0,0,4,2,2],ground:m.makePlane(0,0,0,{accepted:true,confidence:.9})};
 assert.throws(()=>m.fitBoxToCluster(points,'vehicles',seed),/exceeds.*dimensions|vượt kích thước/i);
});

test('subtype Auto-Fit adapts dimension constraints for bus, truck, and van',()=>{
    const busPoints=[];for(let x=-5;x<=5;x+=.2)for(let y=-1.3;y<=1.3;y+=.2)busPoints.push([x,y,2.5]);
    const seed={points:[0,0,1.5,0,0,0,4,2,2],ground:m.makePlane(0,0,0,{accepted:true,confidence:.9})};
    // Default vehicle (car) refuses 10m long cluster
    assert.throws(()=>m.fitBoxToCluster(busPoints,'vehicles',seed),/exceeds.*dimensions/i);
    // vehicle + bus subtype fits successfully
    const busFitted=m.fitBoxToCluster(busPoints,'vehicles',{...seed,subType:'bus'});
    assert.ok(busFitted[6]>=9.5 && busFitted[6]<=15.0);
    assert.ok(busFitted[7]>=2.2 && busFitted[7]<=3.2);
    // truck subtype fits successfully
    const truckFitted=m.fitBoxToCluster(busPoints,'vehicles',{...seed,subType:'truck'});
    assert.ok(truckFitted[6]>=9.5 && truckFitted[6]<=14.0);
});

test('seeded fit respects neighboring annotation interiors and preserves overlapping seed points',()=>{
 const points=[];for(const cy of [0,2.1])for(let x=-1.8;x<=1.8;x+=.15)for(let y=-.75;y<=.75;y+=.15)for(const z of [.6,1.5])points.push([x,y+cy,z]);
 const current={points:[0,0,1,0,0,0,1,1.8,2],ground:m.makePlane(0,0,0,{accepted:true,confidence:.9})};
 const neighbor={points:[0,2.1,1,0,0,0,4.4,2.2,2]};
 const r=m.fitSeededBox(points,'vehicles',current,[neighbor]);
 assert.ok(r.excludedNeighborPoints>100);
 assert.ok(Math.abs(r.fitted[1])<.2);assert.ok(r.fitted[7]<2);
 const seed=new Set(m.extractBoxROI(points,current,.4));
 const overlapping=m.fitSeededBox(points,'vehicles',current,[current]);
 assert.equal(overlapping.excludedNeighborPoints,0);
 assert.ok(r.cluster.some(p=>seed.has(p)));
});
