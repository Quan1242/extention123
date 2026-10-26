const {test}=require('node:test');
const assert=require('node:assert/strict');
const m=require('../extension/geometry_math.js');
const plane=m.makePlane(0,0,0,{accepted:true,confidence:.99});
const box=(l=2,w=1,h=1.5,yaw=0)=>({points:[0,0,h/2,0,0,yaw,l,w,h,0,0,0,0,0,0,0]});
function cloud({xmin=-1,xmax=1,ymin=-.5,ymax=.5,top=1.5,yaw=0,ground=plane,roofOnly=false}={}){
    const out=[],c=Math.cos(yaw),s=Math.sin(yaw);
    for(let i=0;i<=30;i++)for(let j=0;j<=16;j++){
        const x=xmin+(xmax-xmin)*i/30,y=ymin+(ymax-ymin)*j/16,wx=c*x-s*y,wy=s*x+c*y;
        out.push([wx,wy,top]);
        if(!roofOnly&&(i===0||i===30||j===0||j===16))for(let z=ground.getTargetZ(wx,wy)+.15;z<top;z+=.15)out.push([wx,wy,z]);
    }
    return out;
}
function bounds(points){const p=points,c=Math.cos(p[5]),s=Math.sin(p[5]),x=c*p[0]+s*p[1],y=-s*p[0]+c*p[1];return [x-p[6]/2,x+p[6]/2,y-p[7]/2,y+p[7]/2,p[2]+p[8]/2];}
const close=(a,b,t=.012)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);

test('configurable shrink limits require both distance and percentage and retain distant faces on repeat',()=>{
    const original=box(4,2,1.8),source=cloud({xmin:-1.8,xmax:2,ymin:-1,ymax:1,top:1.8});
    const run=options=>m.autoAdjustBox(source,original,plane,[],options);
    close(bounds(run().points)[0],-2);
    close(bounds(run({maxShrinkDistance:.25,maxShrinkPercent:10}).points)[0],-1.83);
    close(bounds(run({maxShrinkDistance:.1,maxShrinkPercent:50}).points)[0],-2);
    close(bounds(run({maxShrinkDistance:.4,maxShrinkPercent:2}).points)[0],-2);
    for(const options of [{maxShrinkDistance:0,maxShrinkPercent:50},{maxShrinkDistance:.4,maxShrinkPercent:0}])close(bounds(run(options).points)[0],-2);
    const distant=cloud({xmin:-1.5,xmax:2,ymin:-1,ymax:1,top:1.8});let current=original;
    for(let i=0;i<4;i++){current={points:m.autoAdjustBox(distant,current,plane,[],{maxShrinkDistance:.25,maxShrinkPercent:50}).points};close(bounds(current.points)[0],-2);}
    const lowered=m.autoAdjustBox(cloud({xmin:-2,xmax:2,ymin:-1,ymax:1,top:1.6}),original,plane,[],{maxShrinkDistance:.25,maxShrinkPercent:20});close(lowered.points[8],1.63);
    for(const options of [{maxShrinkDistance:.41},{maxShrinkDistance:-1},{maxShrinkPercent:51},{maxShrinkPercent:NaN},{maxShrinkDistance:'0.2'}])assert.throws(()=>run(options),/Shrink limits/);
});

test('Auto Adjust expands missed points and shrinks empty faces independently while keeping direction and ground',()=>{
    const original=box(2,1,1.5,.37),source=cloud({xmin:-.92,xmax:1.2,ymin:-.455,ymax:.65,top:1.44,yaw:.37});
    const r=m.autoAdjustBox(source,original,plane),b=bounds(r.points);
    assert.equal(r.changed,true);[-.95,1.23,-.485,.68,1.47].forEach((v,i)=>close(b[i],v));
    assert.deepEqual(r.points.slice(3,6),original.points.slice(3,6));close(r.points[2]-r.points[8]/2,0,1e-8);
    assert.equal(m.extractBoxROI(source,{points:r.points},0).length,source.length);
    assert.deepEqual(original.points,box(2,1,1.5,.37).points);
});
test('Auto Adjust keeps the bottom on a sloped ground footprint',()=>{
    const ground=m.makePlane(.04,-.03,.2,{accepted:true,confidence:.99}),original=box(2,1,1.6,.4);
    original.points=m.snapGroundPoints(original.points,ground).newPoints;
    const oldTop=original.points[2]+original.points[8]/2;
    const r=m.autoAdjustBox(cloud({xmin:-.95,xmax:1.1,ymin:-.47,ymax:.6,top:oldTop-.04,yaw:.4,ground}),original,ground);
    const residuals=m.cuboidVertices(r.points).map(([x,y,z])=>z-ground.getTargetZ(x,y));
    close(Math.min(...residuals),0,1e-8);assert.ok(residuals.every(v=>v>=-1e-8));close(r.points[2]+r.points[8]/2,oldTop-.01);
});
test('Auto Adjust preserves side faces with roof-only evidence, caps local corrections, and is idempotent',()=>{
    const original=box(),roof=m.autoAdjustBox(cloud({xmin:-.95,xmax:.95,ymin:-.46,ymax:.46,top:1.44,roofOnly:true}),original,plane);
    close(roof.points[6],2);close(roof.points[7],1);assert.equal(roof.retainedFaces.length,4);close(roof.points[2]+roof.points[8]/2,1.47);
    const large=box(3,1.6,1.8),r=m.autoAdjustBox(cloud({xmin:-.8,xmax:.8,ymin:-.4,ymax:.4,top:1.3}),large,plane);
    assert.deepEqual(r.points,large.points);assert.equal(r.retainedFaces.length,5);
    const source=cloud({xmin:-.94,xmax:1.15,ymin:-.46,ymax:.6,top:1.44}),first=m.autoAdjustBox(source,box(),plane);
    const second=m.autoAdjustBox(source,{points:first.points},plane);assert.equal(second.changed,false);
});
test('Auto Adjust rejects weak ground, empty evidence, tilted boxes, and points owned by another annotation',()=>{
    const original=box(),source=cloud();
    assert.throws(()=>m.autoAdjustBox(source,original,{...plane,confidence:.4}),/Reliable ground/);
    assert.throws(()=>m.autoAdjustBox([],original,plane),/Insufficient object points/);
    const tilted=box();tilted.points[3]=.1;assert.throws(()=>m.autoAdjustBox(source,tilted,plane),/upright/);
    assert.throws(()=>m.autoAdjustBox(source,original,plane,[box(3,2,2)]),/Insufficient object points/);
});
test('Auto Adjust ignores disconnected noise and ground without clamping to class minimum dimensions',()=>{
    const original=box(),source=cloud({xmin:-.8,xmax:.8,ymin:-.4,ymax:.4,top:1.3});
    source.push([1.35,1.35,1.6]);for(let x=-1.3;x<=1.3;x+=.15)for(let y=-.8;y<=.8;y+=.15)source.push([x,y,0]);
    const r=m.autoAdjustBox(source,original,plane);close(r.points[6],2);close(r.points[7],1);close(r.points[8],1.5);
    const connected=cloud();connected.push([1.25,0,1.2]);
    const clean=m.autoAdjustBox(connected,original,plane);close(bounds(clean.points)[1],1.03);
});

test('missing rear returns cannot shrink a car into its visible front, including repeated actions',()=>{
    let current=box(4,1.8,1.6,.25);
    const source=cloud({xmin:0,xmax:2,ymin:-.9,ymax:.9,top:1.6,yaw:.25});
    for(let i=0;i<8;i++){
        const result=m.autoAdjustBox(source,current,plane),b=bounds(result.points);
        close(b[0],-2,1e-8);assert.ok(result.points[6]>=4-1e-8);assert.ok(result.retainedFaces.includes('rear'));
        current={points:result.points};
    }
});

test('shrinking requires a nearby supported surface and preserves distant faces instead of taking capped steps',()=>{
    const original=box(4,2,1.8),source=cloud({xmin:-1.92,xmax:1.5,ymin:-.93,ymax:.7,top:1.5});
    const r=m.autoAdjustBox(source,original,plane),b=bounds(r.points);
    close(b[0],-1.95);close(b[1],2);close(b[2],-.96);close(b[3],1);close(b[4],1.8);
    assert.ok(r.retainedFaces.includes('front'));assert.ok(r.retainedFaces.includes('left'));assert.ok(r.retainedFaces.includes('top'));
    assert.ok(r.points[6]>=3.9);assert.ok(r.points[7]>=1.9);
});

test('Auto Adjust ignores a dense near-ground layer connected to the object',()=>{
    const original=box(),object=cloud(),dirty=object.slice();
    for(let x=-1.35;x<=1.35;x+=.08)for(let y=-.85;y<=.85;y+=.08)for(const z of [.1,.14,.18])dirty.push([x,y,z]);
    const clean=m.autoAdjustBox(object,original,plane),result=m.autoAdjustBox(dirty,original,plane);
    assert.deepEqual(result.points,clean.points);
    assert.equal(result.groundClearance,.2);assert.ok(result.excludedNearGroundPoints>clean.excludedNearGroundPoints);
});

test('ground exclusion follows the local slope and adapts to plane uncertainty',()=>{
    for(const rmse of [undefined,.11]){
        const ground=m.makePlane(.07,-.04,2,{accepted:true,confidence:.99,rmse}),original=box();
        original.points=m.snapGroundPoints(original.points,ground).newPoints;
        const top=original.points[2]+original.points[8]/2,object=cloud({top,ground}),dirty=object.slice();
        const expectedClearance=rmse===undefined?.2:.33;
        for(let x=-1.3;x<=1.3;x+=.09)for(let y=-.8;y<=.8;y+=.09)for(const clearance of [.1,.18,...(rmse?[.26,.31]:[])])dirty.push([x,y,ground.getTargetZ(x,y)+clearance]);
        const clean=m.autoAdjustBox(object,original,ground),result=m.autoAdjustBox(dirty,original,ground);
        assert.deepEqual(result.points,clean.points);close(result.groundClearance,expectedClearance,1e-8);
        close(Math.min(...m.cuboidVertices(result.points).map(([x,y,z])=>z-ground.getTargetZ(x,y))),0,1e-8);
    }
});

test('near-ground returns alone cannot authorize an Auto Adjust edit',()=>{
    const points=[];for(let x=-1.2;x<=1.2;x+=.08)for(let y=-.7;y<=.7;y+=.08)for(const z of [.1,.15,.19,Math.fround(.2)])points.push([x,y,z]);
    assert.throws(()=>m.autoAdjustBox(points,box(),plane),/Insufficient object points/);
});

test('small connected trash patches and duplicate returns cannot pull sides or top outward',()=>{
    for(const yaw of [0,.37]){
        const original=box(2,1,1.5,yaw),source=cloud({yaw}),c=Math.cos(yaw),s=Math.sin(yaw);
        const transform=([x,y,z])=>[c*x-s*y,s*x+c*y,z];
        for(const noise of [
            [[1.25,-.08,.9],[1.25,.01,.9],[1.25,.1,.9]],
            [[-.08,0,1.75],[.01,0,1.75],[.1,0,1.75]],
            [[1.04,-.08,.9],[1.04,.01,.9],[1.04,.1,.9]],
            Array.from({length:8},(_,i)=>[1.25,0,.5+i*.08]),
            [-.4,0,.4].flatMap(y=>[.5,1].map(z=>[1.25,y,z])),
            [-.04,.04].flatMap(y=>[.75,.83,.91].map(z=>[1.25,y,z])),
        ]){
            const dirty=source.concat(Array.from({length:100},()=>noise.map(transform)).flat());
            const clean=m.autoAdjustBox(source,original,plane),result=m.autoAdjustBox(dirty,original,plane);
            result.points.forEach((v,i)=>close(v,clean.points[i],1e-7));
        }
    }
});

test('coherent sparse real extensions still expand while uncertain thin returns do not shrink a face',()=>{
    const original=box(),source=cloud();
    // A spatially supported side patch with only six distinct returns.
    const extension=[];for(const y of [-.2,0,.2])for(const z of [.75,.95])extension.push([1.2,y,z]);
    const extended=m.autoAdjustBox(source.concat(extension),original,plane);close(bounds(extended.points)[1],1.23);
    const sparse=[];for(let z=.4;z<1.5;z+=.18)for(const x of [-.96,.96])sparse.push([x,0,z]);
    for(let x=-.96;x<=.96;x+=.08)sparse.push([x,0,1.3]);
    const uncertain=m.autoAdjustBox(sparse,original,plane);assert.deepEqual(uncertain.points,original.points);assert.equal(uncertain.changed,false);
});

test('uncertain protrusions prevent inward trimming across possibly real parts',()=>{
    const original=box(2.4,1,1.5),source=cloud();
    source.push([1.15,-.08,.9],[1.15,.01,.9],[1.15,.1,.9]);
    const r=m.autoAdjustBox(source,original,plane,[],{maxShrinkDistance:.3,maxShrinkPercent:30});
    close(bounds(r.points)[1],1.2);assert.ok(r.retainedFaces.includes('front'));
});
