const {test}=require('node:test');
const assert=require('node:assert/strict');
const THREE=require('three');
const math=require('../extension/geometry_math.js');
const {createCvatAdapter}=require('../extension/cvat_adapter.js');

function fixture({orbitControls=false,transformed=false}={}){
    const camera=new THREE.PerspectiveCamera(50,1,.1,1000);camera.position.set(10,-8,6);
    const target=new THREE.Vector3(),calls=[],tasks=new Map(),events={};let sequence=0,saves=0,mode='idle',time=0;
    camera.lookAt(target);camera.updateMatrixWorld();
    const controls=orbitControls?{target,update(){camera.lookAt(target);}}:{getTarget:out=>out.copy(target),setLookAt(x,y,z,tx,ty,tz){camera.position.set(x,y,z);target.set(tx,ty,tz);camera.lookAt(target);calls.push(camera.position.toArray());},update(){}};
    const box={clientID:1,serverID:8,objectType:'track',shapeType:'cuboid',frame:0,points:[2,3,1,0,0,.2,4,2,2,0,0,0,0,0,0,0],label:{id:1},async save(){saves++;}};
    const parent=new THREE.Group();if(transformed){parent.position.set(20,10,0);parent.rotation.z=.4;}
    const mesh=new THREE.Object3D();parent.add(mesh);
    controls.enabled=true;
    const view={views:{perspective:{camera,controls,renderer:{domElement:{}}}},model:{data:{imageID:0}},drawnObjects:{}};
    const canvas={view,mode:()=>mode,render(){},activate(){},html:()=>({perspective:{dispatchEvent(){}}})};
    const annotation={job:{instance:{id:10,dimension:'3d',labels:[]}},player:{frame:{number:0}},annotations:{states:[box],activatedStateID:1},canvas:{instance:canvas,ready:true},workspace:'standard3d'};
    const store={getState:()=>({annotation}),subscribe:()=>()=>{},dispatch(){throw new Error('Camera follow must not dispatch annotation edits');}};
    const win={location:{pathname:'/jobs/10'},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},setInterval:()=>1,clearInterval(){},addEventListener(name,fn){events[name]=fn;},removeEventListener(name){delete events[name];},requestAnimationFrame(fn){tasks.set(++sequence,fn);return sequence;},cancelAnimationFrame(id){tasks.delete(id);}};
    const adapter=createCvatAdapter({window:win,document:{getElementById:()=>null},store,math});adapter.start();
    function render(){view.model.data.imageID=annotation.player.frame.number;mesh.position.set(...box.points.slice(0,3));view.drawnObjects[box.clientID]={data:{points:box.points.slice()},cuboid:{perspective:mesh}};}
    function tick(n=2){for(let i=0;i<n;i++){time+=16;const run=[...tasks.values()];tasks.clear();run.forEach(fn=>fn(time));}}
    function frame(number,center,{ready=true}={}){annotation.player.frame.number=number;box.frame=number;box.points.splice(0,3,...center);if(ready)render();adapter.getSnapshot();}
    render();return {adapter,annotation,box,camera,controls,target,tick,frame,render,tasks,calls,view,parent,events,setMode:v=>{mode=v;},saves:()=>saves};
}
const near=(a,b)=>assert.ok(a.distanceTo(b)<1e-8,`${a.toArray()} != ${b.toArray()}`);

test('follow translates the orbit target across forward, backward and skipped frames preserving manual orbit/zoom',async()=>{
    const h=fixture(),offset=h.camera.position.clone().sub(h.target);
    assert.equal(h.adapter.getSnapshot().followCameraEnabled,false);assert.equal(h.tasks.size,0);
    await h.adapter.command('FOLLOW_CAMERA',{enabled:true});h.tick();
    near(h.target,new THREE.Vector3(2,3,1));near(h.camera.position,h.target.clone().add(offset));
    h.camera.position.copy(h.target).add(new THREE.Vector3(-5,7,3));h.camera.lookAt(h.target);h.tick(1);
    for(const frame of [1,7,2]){h.frame(frame,[frame,frame*2,1.5]);h.tick();near(h.target,new THREE.Vector3(frame,frame*2,1.5));near(h.camera.position,h.target.clone().add(new THREE.Vector3(-5,7,3)));}
    assert.equal(h.saves(),0);await h.adapter.command('FOLLOW_CAMERA',{enabled:false});const before=h.camera.position.clone();h.frame(3,[100,200,1]);h.tick();near(h.camera.position,before);assert.equal(h.tasks.size,0);h.adapter.dispose();
});

test('follow waits for frame geometry and survives native camera reset without capturing the reset pose',async()=>{
    const h=fixture(),offset=h.camera.position.clone();await h.adapter.command('FOLLOW_CAMERA',{enabled:true});h.tick();const before=h.camera.position.clone();
    h.frame(1,[10,20,1],{ready:false});h.tick(4);near(h.camera.position,before);
    h.camera.position.set(100,100,100);h.target.set(0,0,0);h.render();
    h.view.drawnObjects[1].data.points[0]=-50;h.tick(3);near(h.camera.position,new THREE.Vector3(100,100,100));
    h.render();h.tick();near(h.target,new THREE.Vector3(10,20,1));near(h.camera.position,h.target.clone().add(offset));h.adapter.dispose();
});

test('follow pauses for absent/hidden tracks, free camera and interactions; resumes the same client ID',async()=>{
    const h=fixture();await h.adapter.command('FOLLOW_CAMERA',{enabled:true});h.tick();const before=h.camera.position.clone();
    h.frame(1,[10,20,1]);h.box.outside=true;h.annotation.annotations.activatedStateID=null;h.tick();near(h.camera.position,before);
    h.box.outside=false;h.box.hidden=true;h.tick();near(h.camera.position,before);
    h.box.hidden=false;h.setMode('draw');h.tick();near(h.camera.position,before);
    h.setMode('idle');await h.adapter.command('FREECAM',{enabled:true});h.tick();assert.match(h.adapter.getSnapshot().followCameraStatus,/Free Cam/);
    await h.adapter.command('FREECAM',{enabled:false});h.tick();near(h.target,new THREE.Vector3(10,20,1));assert.equal(h.saves(),0);h.adapter.dispose();assert.equal(h.tasks.size,0);
});

test('follow uses transformed rendered centers with OrbitControls and never matches by server ID',async()=>{
    const h=fixture({orbitControls:true,transformed:true});await h.adapter.command('FOLLOW_CAMERA',{enabled:true});h.tick();
    near(h.target,h.view.drawnObjects[1].cuboid.perspective.getWorldPosition(new THREE.Vector3()));
    const before=h.camera.position.clone();h.annotation.annotations.activatedStateID=null;h.annotation.annotations.states=[{...h.box,clientID:8,frame:1}];h.frame(1,[100,100,1]);h.tick();near(h.camera.position,before);
    h.adapter.dispose();
});

test('follow changes tracks on selection and releases frame-local shapes and old jobs',async()=>{
    const h=fixture();await h.adapter.command('FOLLOW_CAMERA',{enabled:true});h.tick();
    h.box.clientID=2;h.box.serverID=9;h.annotation.annotations.activatedStateID=2;h.box.points[0]=15;h.render();h.tick();near(h.target,new THREE.Vector3(15,3,1));
    h.box.objectType='shape';h.tick();assert.match(h.adapter.getSnapshot().followCameraStatus,/Select a track/);
    h.box.objectType='track';h.annotation.annotations.activatedStateID=null;h.annotation.job.instance.id=20;h.tick();assert.match(h.adapter.getSnapshot().followCameraStatus,/Select a track/);h.adapter.dispose();
});

test('follow reports unavailable orbit APIs without enabling or scheduling work',async()=>{
    const h=fixture();h.view.views.perspective.controls={};assert.equal(h.adapter.getSnapshot().capabilities.followCamera,false);
    await assert.rejects(h.adapter.command('FOLLOW_CAMERA',{enabled:true}),/unavailable/);assert.equal(h.tasks.size,0);h.adapter.dispose();
});

const input=(code,extra={})=>({code,preventDefault(){},stopImmediatePropagation(){},...extra});
test('Free Cam retains mode and exact pose through frame reset, clears held keys, and ignores native focus',async()=>{
    const h=fixture();await h.adapter.command('FREECAM',{enabled:true});h.tick();
    h.events.keydown(input('KeyW'));h.tick(3);const before=h.camera.position.clone(),rotation=h.camera.quaternion.clone();
    h.frame(1,[8,10,1],{ready:false});h.camera.position.set(100,200,300);h.camera.quaternion.set(0,0,0,1);h.tick(3);
    assert.equal(h.adapter.getSnapshot().freeCam,true);assert.equal(h.controls.enabled,false);near(h.camera.position,before);assert.ok(h.camera.quaternion.angleTo(rotation)<1e-7);
    h.events.keydown(input('KeyW',{repeat:true}));h.render();h.tick(3);near(h.camera.position,before);
    h.events.keydown(input('KeyW'));h.tick(2);assert.ok(h.camera.position.distanceTo(before)>.01);h.events.keyup(input('KeyW'));
    const snap=h.adapter.getSnapshot(),result=await h.adapter.command('SELECT_OBJECT',{ref:{sessionId:snap.sessionId,jobId:snap.jobId,frame:snap.frame,revision:snap.revision,clientId:1},focus:true});
    assert.equal(result.focused,false);assert.match(result.message,/turn off Free Cam/);
    const flightPose=h.camera.position.clone();h.camera.position.set(-100,-200,50);h.controls.setLookAt(-100,-200,50,0,0,0);h.tick();near(h.camera.position,flightPose);
    assert.equal(h.adapter.getSnapshot().freeCam,true);assert.equal(h.saves(),0);
    h.events.keydown(input('Escape'));assert.equal(h.adapter.getSnapshot().freeCam,false);assert.equal(h.controls.enabled,true);assert.equal(h.tasks.size,0);h.adapter.dispose();
});

test('Free Cam binds replacement cameras/controls and restores each controls enabled state',async()=>{
    const h=fixture();await h.adapter.command('FREECAM',{enabled:true});h.tick();const position=h.camera.position.clone(),quaternion=h.camera.quaternion.clone();
    const replacementCamera=new THREE.PerspectiveCamera(),replacementControls={enabled:true,target:new THREE.Vector3()};
    h.view.views.perspective={camera:replacementCamera,controls:replacementControls,renderer:{domElement:{}}};h.frame(1,[1,2,1]);h.tick();
    assert.equal(h.controls.enabled,true);assert.equal(replacementControls.enabled,false);near(replacementCamera.position,position);assert.ok(replacementCamera.quaternion.angleTo(quaternion)<1e-7);
    await h.adapter.command('FREECAM',{enabled:false});assert.equal(replacementControls.enabled,true);assert.equal(h.tasks.size,0);h.adapter.dispose();
});

test('Free Cam owns the camera while following is enabled and resumes follow with the flight heading',async()=>{
    const h=fixture();await h.adapter.command('FOLLOW_CAMERA',{enabled:true});h.tick();await h.adapter.command('FREECAM',{enabled:true});h.tick();
    h.events.pointerdown(input('',{target:h.view.views.perspective.renderer.domElement,button:2}));h.events.pointermove(input('',{movementX:80,movementY:20}));h.tick();
    const position=h.camera.position.clone(),direction=h.camera.getWorldDirection(new THREE.Vector3());
    h.frame(4,[40,50,1]);h.tick(4);near(h.camera.position,position);assert.match(h.adapter.getSnapshot().followCameraStatus,/Free Cam/);
    await h.adapter.command('FREECAM',{enabled:false});h.tick();near(h.target,new THREE.Vector3(40,50,1));near(h.camera.getWorldDirection(new THREE.Vector3()),direction);assert.equal(h.adapter.getSnapshot().followCameraEnabled,true);
    assert.equal(h.saves(),0);h.adapter.dispose();assert.equal(h.tasks.size,0);
});

test('Free Cam ends on job change and disposal and restores native orbit controls',async()=>{
    const h=fixture();await h.adapter.command('FREECAM',{enabled:true});h.annotation.job.instance.id=11;h.adapter.getSnapshot();assert.equal(h.adapter.getSnapshot().freeCam,false);assert.equal(h.controls.enabled,true);assert.equal(h.tasks.size,0);
    await h.adapter.command('FREECAM',{enabled:true});h.adapter.dispose();assert.equal(h.controls.enabled,true);assert.equal(h.tasks.size,0);
});
