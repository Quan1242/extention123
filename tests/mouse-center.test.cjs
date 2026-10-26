const {test}=require('node:test');
const assert=require('node:assert/strict');
const math=require('../extension/geometry_math.js');
const ground=math.makePlane(0,0,0,{accepted:true,confidence:1});
const seed=(yaw=0)=>[0,0,1,0,0,yaw,4,2,2,0,0,0,0,0,0,0];
function object(cx,cy,l=2,w=1,yaw=0){
    const out=[],c=Math.cos(yaw),s=Math.sin(yaw);
    for(let i=0;i<=20;i++)for(let j=0;j<=10;j++){
        const x=(i/20-.5)*l,y=(j/10-.5)*w;
        for(const z of [.8,1,1.2])out.push([cx+c*x-s*y,cy+s*x+c*y,z]);
    }
    return out;
}
test('mouse refinement finds an offset object center in the chosen heading, not the point mean',()=>{
    const yaw=.45,c=Math.cos(yaw),s=Math.sin(yaw),p=seed(yaw),points=object(.6,-.2,2,1,yaw);
    // Dense returns from one side must not dominate the center estimate.
    for(let i=0;i<5000;i++)points.push([.6+c*.8,-.2+s*.8,1]);
    const r=math.refineCenterNearPointer(points,{points:p},ground);
    assert.equal(r.refined,true);assert.ok(Math.abs(r.points[0]-.6)<.06);assert.ok(Math.abs(r.points[1]+.2)<.06);
    assert.deepEqual(r.points.slice(2),p.slice(2));assert.deepEqual(p,seed(yaw));
});
test('pointer proximity wins over the point count of a separate nearby object',()=>{
    const near=object(.6,0),far=object(-2.1,0,1,.8);
    const r=math.refineCenterNearPointer([...near,...far,...far,...far],{points:seed()},ground);
    assert.equal(r.refined,true);assert.ok(Math.abs(r.points[0]-.6)<.06);
});
test('ambiguous, sparse, oversized, tilted, or already annotated clusters keep mouse placement',()=>{
    const p=seed();
    for(const points of [[],object(.5,0).slice(0,9),[...object(0,-.9,1.2,.8),...object(0,.9,1.2,.8)],object(0,0,8,3)]){
        const r=math.refineCenterNearPointer(points,{points:p},ground);assert.equal(r.refined,false);assert.deepEqual(r.points,p);assert.ok(r.reason);
    }
    const tilted=p.slice();tilted[3]=.1;
    assert.equal(math.refineCenterNearPointer(object(0,0),{points:tilted},ground).refined,false);
    const neighbor={points:[0,0,1,0,0,0,3,1.8,2,0,0,0,0,0,0,0]};
    assert.equal(math.refineCenterNearPointer(object(0,0),{points:p},ground,[neighbor]).refined,false);
});

for(const yaw of [0,.7,Math.PI/2,-2.5])for(const longitudinal of ['none','forward','backward'])for(const lateral of ['none','left','right'])test(`face alignment ${yaw} ${longitudinal} ${lateral}`,()=>{
    const target={points:seed(yaw)},points=object(.4,-.2,2,1,yaw);
    const base=math.refineCenterNearPointer(points,target,ground);
    const r=math.refineCenterNearPointer(points,target,ground,[],{moveLongitudinal:longitudinal,moveLateral:lateral});
    assert.equal(r.refined,true);assert.deepEqual(r.alignment,{longitudinal,lateral});
    const dx=r.points[0]-base.points[0],dy=r.points[1]-base.points[1],c=Math.cos(yaw),sn=Math.sin(yaw);
    assert.ok(Math.abs(c*dx+sn*dy-({none:0,forward:1,backward:-1}[longitudinal]))<.07);
    assert.ok(Math.abs(-sn*dx+c*dy-({none:0,left:.5,right:-.5}[lateral]))<.07);
    assert.deepEqual(r.points.slice(2),target.points.slice(2));
});
test('oversized evidence skips only the selected oversized axis',()=>{
    const r=math.refineCenterNearPointer(object(0,0,4.6,1),{points:seed()},ground,[],{moveLongitudinal:'forward',moveLateral:'right'});
    assert.equal(r.refined,true);assert.equal(r.alignment.longitudinal,'none');assert.equal(r.alignment.lateral,'right');assert.match(r.alignmentWarning,/span exceeds/);
});
