const {test}=require('node:test'),assert=require('node:assert/strict');
const {replay}=require('../scripts/replay-fit-case.cjs');
const m=require('../extension/geometry_math.js');
const data=require('./fixtures/autofit-job9426-frame29-box62.json');
test('real job 9426 case: recover ground, heading and height without using hand box as input',()=>{
    const r=replay(data);
    assert.ok(r.ground.accepted&&r.ground.confidence>=.65);assert.ok(r.ground.rmse<.04);
    assert.ok(r.after.yawErrorDegrees<2);assert.ok(r.after.iou3D>.75);assert.ok(r.after.iou3D>r.before.iou3D+.35);
    assert.ok(Math.abs(r.after.size[2]-r.reference.size[2])<.15);assert.ok(r.after.centerErrorMetres<.25);
    // Replacing the user's reference must not alter the algorithm's output.
    const alternate=replay({...data,currentBox:{points:[100,100,1,0,0,1,5,3,2,0,0,0,0,0,0,0]}});
    assert.deepEqual(alternate.newBox.points,r.newBox.points);
});
test('real case rotated/translated still finds body axis and ground',()=>{
    const angle=.6,c=Math.cos(angle),s=Math.sin(angle);
    const point=p=>[c*p[0]-s*p[1]+20,s*p[0]+c*p[1]-10,p[2]+2];
    const box=b=>{const p=[...b.points];p.splice(0,3,...point(p));p[5]+=angle;return {...b,points:p};};
    const transformed={...data,roiPoints:data.roiPoints.map(point),groundSupport:data.groundSupport.map(point),seedBox:box(data.seedBox),fittedBox:box(data.fittedBox),currentBox:box(data.currentBox)};
    const r=replay(transformed);assert.ok(r.ground.accepted);assert.ok(r.after.yawErrorDegrees<3);assert.ok(r.after.iou3D>.72);
});
test('height search includes road and roof even when the initial box is only 1m tall',()=>{
    const ground=m.makePlane(0,0,-.1,{accepted:true,confidence:.9});
    const search=m.autoFitSearchBox(data.seedBox,'vehicles',ground),g=m.parseCVAT16Points(search.points);
    assert.ok(g.center[2]-g.height/2<0);assert.ok(g.center[2]+g.height/2>2.09);
});

test('real 1.4.0 regression: expanded height must not join the car to the surrounding scene',()=>{
    const data=require('./fixtures/autofit-job9426-frame29-box63.json'),r=replay(data);
    assert.ok(r.counts.cluster>2000&&r.counts.cluster<5000);
    assert.ok(r.after.iou3D>.7);assert.ok(r.after.centerErrorMetres<.25);
    assert.ok(r.after.yawErrorDegrees<2);
    assert.ok(r.after.size[0]<5&&r.after.size[1]<2.2&&r.after.size[2]<2.2);
    assert.throws(()=>m.fitBoxToCluster(data.clusterPoints,'vehicles',{...data.seedBox,ground:data.ground,rejectOversizedCluster:true}),/exceeds.*dimensions|vượt kích thước/i);
});

test('historical compact truck geometry: ground filtering remains valid within family-size envelope',()=>{
 const d=require('./fixtures/autofit-job9426-frame29-box17.json');
 const cluster=m.selectSeedCluster(d.roiPoints,d.seedBox,d.ground);
 const fitted=m.fitBoxToCluster(cluster,'vehicles',{...d.seedBox,ground:d.ground,allowGroundFallback:true,rejectOversizedCluster:true});
 assert.ok(cluster.length>4000&&cluster.length<7000);
 assert.ok(m.orientedIoU(fitted,d.currentBox.points)>.8);
 assert.equal(fitted[2],d.seedBox.points[2]);assert.equal(fitted[8],d.seedBox.points[8]);
 assert.ok(fitted[6]>5&&fitted[6]<6);assert.ok(fitted[7]<2);
 for(const bad of [{...d.ground,accepted:false},{...d.ground,rmse:.2},{...d.ground,confidence:.2}]){
  assert.equal(m.selectSeedCluster(d.roiPoints,d.seedBox,bad).length,m.selectSeedCluster(d.roiPoints,d.seedBox,null).length);
 }
});

test('box32 dense parking: adaptive seed clustering separates a stable car without a manual reference',()=>{
 const d=require('./fixtures/autofit-job9426-frame29-box32.json');
 const old=m.selectSeedCluster(d.roiPoints,d.seedBox,d.ground);
 assert.throws(()=>m.fitBoxToCluster(old,'vehicles',{...d.seedBox,ground:d.ground}),/exceeds.*dimensions|vượt kích thước/i);
 const r=m.fitSeededBox(d.roiPoints,'vehicles',{...d.seedBox,ground:d.ground});
 assert.equal(r.radius,.3);assert.ok(r.cluster.length>4000&&r.cluster.length<4500);
 assert.ok(r.fitted[6]>4.3&&r.fitted[6]<4.9);assert.ok(r.fitted[7]>1.5&&r.fitted[7]<2);
 assert.ok(Math.abs(r.fitted[5]-d.seedBox.points[5])<.1);
 assert.ok(m.extractBoxROI(r.cluster,{points:r.fitted},.02).length/r.cluster.length>.95);
 const rotated=.6,c=Math.cos(rotated),s=Math.sin(rotated),point=p=>[c*p[0]-s*p[1]+10,s*p[0]+c*p[1]-4,p[2]];
 const seed=[...d.seedBox.points];seed.splice(0,3,...point(seed));seed[5]+=rotated;
 const ground={...d.ground,a:c*d.ground.a-s*d.ground.b,b:s*d.ground.a+c*d.ground.b};
 ground.c=d.ground.c-ground.a*10+ground.b*4;
 const changed=m.fitSeededBox(d.roiPoints.map(point),'vehicles',{points:seed,ground});
 assert.ok(m.orientedIoU(changed.fitted,(()=>{const p=[...r.fitted];p.splice(0,3,...point(p));p[5]+=rotated;return p;})())>.9);
});
