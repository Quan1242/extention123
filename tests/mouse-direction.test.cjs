const {test}=require('node:test');
const assert=require('node:assert/strict');
const math=require('../extension/geometry_math.js');
const radians=degrees=>degrees*Math.PI/180;
const angular=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const box=(yaw=0,l=2.2,w=.8)=>({points:[0,0,.9,0,0,yaw,l,w,1.8,0,0,0,0,0,0,0]});
function diamond(yaw,l=2.2,w=.8,cx=.3,cy=-.2){
    const out=[],c=Math.cos(yaw),s=Math.sin(yaw);
    for(let i=-30;i<=30;i++)for(let j=-15;j<=15;j++){
        if(Math.abs(i/30)+Math.abs(j/15)>1)continue;
        const x=i/30*l/2,y=j/15*w/2;
        for(const z of [.6,.8,1])out.push([cx+c*x-s*y,cy+s*x+c*y,z]);
    }
    return out;
}
test('diamond footprint follows its longest diagonal and ignores duplicate height/side return density',()=>{
    const target=box(radians(5)),points=diamond(radians(24));
    const a=math.estimateFootprintHeading(points,target);
    assert.equal(a.accepted,true);assert.ok(Math.abs(angular(a.yaw,radians(24)))<radians(2));
    const biased=[...points,...Array(5000).fill(points[20])];
    assert.deepEqual(math.estimateFootprintHeading(biased,target),a);
});
test('longest box axis matches longest object axis without swapping width and length',()=>{
    const target=box(0,.8,2.2),r=math.estimateFootprintHeading(diamond(radians(105)),target);
    assert.equal(r.accepted,true);assert.ok(Math.abs(angular(r.yaw,radians(15)))<radians(2));
});
test('direction chooses closest facing through angle wrap and rejects corrections over 30 degrees',()=>{
    const near=math.estimateFootprintHeading(diamond(radians(-175)),box(radians(179)));
    assert.equal(near.accepted,true);assert.ok(Math.abs(near.deltaDegrees-6)<2);
    assert.ok(Math.abs(angular(near.yaw,radians(-175)))<radians(2));
    const far=math.estimateFootprintHeading(diamond(radians(45)),box());
    assert.equal(far.accepted,false);assert.equal(far.yaw,0);assert.match(far.reason,/30°/);
    const crosswise=math.estimateFootprintHeading(diamond(Math.PI/2),box());
    assert.equal(crosswise.accepted,false);assert.equal(crosswise.yaw,0);
});
test('sparse, symmetric, square-box and tilted evidence leave direction unchanged',()=>{
    const symmetric=[];for(let i=-10;i<=10;i++)for(let j=-10;j<=10;j++)symmetric.push([i*.06,j*.06,1]);
    for(const points of [[],diamond(.1).slice(0,6),symmetric])assert.equal(math.estimateFootprintHeading(points,box()).accepted,false);
    assert.equal(math.estimateFootprintHeading(diamond(.1),box(0,1,1)).accepted,false);
    const tilted=box();tilted.points[3]=.1;
    assert.equal(math.estimateFootprintHeading(diamond(.1),tilted).accepted,false);
});
test('direction option is independent of center refinement and preserves dimensions and roll/pitch',()=>{
    const target=box(),points=diamond(radians(18)),ground=math.makePlane(0,0,0,{accepted:true,confidence:1});
    const off=math.refineCenterNearPointer(points,target,ground);
    assert.equal(off.refined,true);assert.equal(off.points[5],0);assert.equal(off.directionAdjusted,false);
    const on=math.refineCenterNearPointer(points,target,ground,[],{adjustDirection:true});
    assert.equal(on.refined,true);assert.equal(on.directionAdjusted,true);
    assert.ok(Math.abs(angular(on.points[5],radians(18)))<radians(2));
    assert.deepEqual(on.points.slice(6),target.points.slice(6));assert.deepEqual(on.points.slice(3,5),target.points.slice(3,5));
    assert.ok(Math.abs(on.points[0]-.3)<.08);assert.ok(Math.abs(on.points[1]+.2)<.08);
    const skip=math.refineCenterNearPointer(diamond(radians(45)),target,ground,[],{adjustDirection:true});
    assert.equal(skip.refined,true);assert.equal(skip.points[5],0);assert.match(skip.directionWarning,/30°/);
});

test('face alignment follows the automatically corrected heading',()=>{
    const target=box(),points=diamond(radians(18)),ground=math.makePlane(0,0,0,{accepted:true,confidence:1});
    const base=math.refineCenterNearPointer(points,target,ground,[],{adjustDirection:true});
    const r=math.refineCenterNearPointer(points,target,ground,[],{adjustDirection:true,moveLongitudinal:'forward',moveLateral:'left'});
    assert.equal(r.directionAdjusted,true);assert.equal(r.points[5],base.points[5]);
    const c=Math.cos(r.points[5]),s=Math.sin(r.points[5]),dx=r.points[0]-base.points[0],dy=r.points[1]-base.points[1];
    assert.ok(c*dx+s*dy>=0);assert.ok(-s*dx+c*dy>=0);assert.deepEqual(r.points.slice(6),target.points.slice(6));
});
