const {test}=require('node:test'),assert=require('node:assert/strict');
const m=require('../extension/geometry_math.js'),settings=require('../extension/shortcut_settings.js');
const ground=m.makePlane(.015,-.01,.12,{accepted:true,confidence:.98});
const box=(yaw=0)=>({points:[.2,-.1,5,0,0,yaw,1,.7,.5,7,8,9,10,11,12,13],ground});
function cloud(l=4.3,w=1.7,yaw=.4){
    const a=[],c=Math.cos(yaw),s=Math.sin(yaw);
    for(let i=0;i<=40;i++)for(let j=0;j<=18;j++){
        const x=(i/40-.5)*l,y=(j/18-.5)*w,wx=c*x-s*y,wy=s*x+c*y;
        a.push([wx,wy,1.4]);
        if(i===0||i===40||j===0||j===18)for(let z=.4;z<1.4;z+=.16)a.push([wx,wy,z]);
    }
    return a;
}
const close=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const grounded=p=>{const z=m.cuboidVertices(p).map(([x,y,z])=>z-ground.getTargetZ(x,y));close(Math.min(...z),0);assert.ok(z.every(v=>v>=-1e-7));};
test('preset fixes tiny floating car, aligns long axis, grounds slope and preserves CVAT16 tail',()=>{
    const seed=box(1.2),before=structuredClone(seed.points),r=m.fitPresetBox(cloud(),'vehicles',seed);
    assert.deepEqual(r.fitted.slice(6,9),[4.5,1.8,1.5]);grounded(r.fitted);
    assert.ok(Math.hypot(r.fitted[0],r.fitted[1])<.12);close(r.fitted[5],.4,.06);
    assert.deepEqual(r.fitted.slice(9),before.slice(9));assert.deepEqual(seed.points,before);
});
test('bike uses occupied XY long axis despite many repeated rider returns, size never shrinks',()=>{
    const source=cloud(1.85,.6,-.65);source.push(...Array.from({length:1500},()=>[0,0,2]));
    const r=m.fitPresetBox(source,'two-wheels',box(-.5));
    assert.deepEqual(r.fitted.slice(6,9),[2,.7,1.6]);close(r.fitted[5],-.65,.12);grounded(r.fitted);
});
test('custom dimensions and Keep direction are exact; repeated fits cannot change dimensions',()=>{
    const seed=box(.4);seed.keepDirection=true;
    const r=m.fitPresetBox(cloud(),'vehicles',seed,[],[4.8,2,1.8]);
    assert.deepEqual(r.fitted.slice(6,9),[4.8,2,1.8]);assert.equal(r.fitted[5],seed.points[5]);grounded(r.fitted);
    const again=m.fitPresetBox(cloud(),'vehicles',{...seed,points:r.fitted},[],[4.8,2,1.8]);
    assert.deepEqual(again.fitted.slice(6,9),[4.8,2,1.8]);grounded(again.fitted);
});
test('unknown subtype needs configuration; class aliases and presets survive settings reload',()=>{
    assert.deepEqual(m.resolveFitPreset('vehicle',' Car ').dimensions,[4.5,1.8,1.5]);
    assert.deepEqual(m.resolveFitPreset('vehicles','Truck').dimensions,[8,2.5,3.2]);
    assert.equal(m.resolveFitPreset('vehicles','other').dimensions,null);
    const value=settings.normalize({...settings.defaults(),presetOverrides:{'vehicles:other':[6,2.2,2], 'vehicles:car':[-1,2,1], 'two-wheels':[2,.8,1.7]}});
    assert.deepEqual(m.resolveFitPreset('vehicles','other',value.presetOverrides).dimensions,[6,2.2,2]);
    assert.equal(Object.hasOwn(value.presetOverrides,'vehicles:car'),false);
    assert.deepEqual(settings.normalize(JSON.parse(JSON.stringify(value))),value);
    assert.throws(()=>m.fitPresetBox(cloud(),'vehicles',{...box(),subType:'other'}),/Configure/);
});
test('unreliable ground, empty points, wrong preset and tilted seed never produce a fitted box',()=>{
    assert.throws(()=>m.fitPresetBox(cloud(),'vehicles',{...box(),ground:{...ground,confidence:.5}}),/ground/);
    assert.throws(()=>m.fitPresetBox([],'vehicles',box()),/10 điểm/);
    assert.throws(()=>m.fitPresetBox(cloud(),'vehicles',box(),[],[0,1,1]),/Configure/);
    const tilted=box();tilted.points[3]=.1;assert.throws(()=>m.fitPresetBox(cloud(),'vehicles',tilted),/upright/);
});
test('partially observed car keeps preset dimensions and reports uncertain centering',()=>{
    const seed=box(.4);seed.points=[0,0,.87,0,0,.4,4.5,1.8,1.5,0,0,0,0,0,0,0];
    const source=cloud().filter(([x,y])=>Math.cos(.4)*x+Math.sin(.4)*y>0);
    const r=m.fitPresetBox(source,'vehicles',seed);
    assert.deepEqual(r.fitted.slice(6,9),[4.5,1.8,1.5]);grounded(r.fitted);
    assert.ok(r.warnings.some(s=>/Partially/.test(s)));assert.ok(Math.hypot(r.fitted[0],r.fitted[1])<.4);
});
test('a bumper-only transverse line must not rotate the car by 90 degrees',()=>{
    const seed=box(0);seed.points=[0,0,.9,0,0,0,4.5,1.8,1.5,0,0,0,0,0,0,0];
    const source=[];for(let y=-.8;y<=.8;y+=.05)for(let z=.4;z<=1.4;z+=.1)source.push([2,y,z]);
    const result=m.fitPresetBox(source,'vehicles',seed);
    assert.equal(result.fitted[5],0);assert.deepEqual(result.fitted.slice(6,9),[4.5,1.8,1.5]);
    assert.ok(result.warnings.some(s=>/Uncertain long axis/.test(s)));grounded(result.fitted);
});
