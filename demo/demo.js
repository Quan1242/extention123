import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const math=window.__CVAT_COPILOT_MATH;
const source=window.__JOB_9426_FALLBACK_SHAPES;
const stage=document.getElementById('demo-stage'), canvas=document.getElementById('demo-canvas');
const scene=new THREE.Scene();scene.background=new THREE.Color('#0b1016');
const camera=new THREE.PerspectiveCamera(50,1,0.1,600);camera.up.set(0,0,1);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=0.1;controls.maxDistance=220;
const labels=[{id:7803,name:'vehicles',color:'#60a5fa'},{id:7802,name:'two-wheels',color:'#a78bfa'},{id:7801,name:'pedestrian',color:'#34d399'},{id:7804,name:'Animal',color:'#fb923c'}];
const plane=math.makePlane(0,0,0);
const seedBoxes=source.map((s,i)=>{
    const points=[...s.points];const snap=math.snapGroundPoints(points,plane);points[2]=snap.newCz;
    return {id:i+1,clientId:i+1,serverId:s.id,frame:29,objectType:'shape',labelId:s.label_id,label_name:s.label_name,
        labelColor:labels.find(l=>l.id===s.label_id)?.color||'#94a3b8',points,locked:false,hidden:false};
});
let boxes=structuredClone(seedBoxes), revision=1, active=2, colors=new Map(), history=[], redo=[], freeCam=false;
const sessionId='offline-demo-v2', meshes=new Map(), boxGeometry=new THREE.BoxGeometry(1,1,1), boxEdges=new THREE.EdgesGeometry(boxGeometry);
// Deliberate demo cases. Point-cloud evidence remains fixed while boxes move.
boxes[1].points[2]+=0.65;boxes[2].points[2]-=0.45;boxes[3].points[6]=1.8;
boxes[10].points=[...boxes[9].points];boxes[10].points[0]+=0.35;
const initial=structuredClone(boxes);
let randomSeed=9426;
const random=()=>{randomSeed=(1664525*randomSeed+1013904223)>>>0;return randomSeed/4294967296;};
const cloudPoints=[], cloudColors=[];
function addPoint(p,c){cloudPoints.push(p);cloudColors.push(c);}
for(let x=-48;x<=67;x+=0.35)for(let y=-38;y<=43;y+=0.35)addPoint([x+(random()-.5)*.12,y+(random()-.5)*.12,plane.getTargetZ(x,y)+(random()-.5)*.012],[.31,.37,.42]);
for(const box of seedBoxes){
    const [x,y,z,rx,ry,rz,l,w,h]=box.points, rotation=new THREE.Euler(rx,ry,rz,'XYZ');
    for(let i=0;i<160;i++){
        const v=new THREE.Vector3((random()-.5)*l,(random()-.5)*w,(random()-.5)*h);
        const face=i%3;if(face===0)v.x=(random()>.5?1:-1)*l/2;else if(face===1)v.y=(random()>.5?1:-1)*w/2;else v.z=h/2;
        v.applyEuler(rotation).add(new THREE.Vector3(x,y,z));addPoint([v.x,v.y,v.z],[.72,.79,.84]);
    }
}
const cloudGeometry=new THREE.BufferGeometry();cloudGeometry.setAttribute('position',new THREE.Float32BufferAttribute(cloudPoints.flat(),3));cloudGeometry.setAttribute('color',new THREE.Float32BufferAttribute(cloudColors.flat(),3));
scene.add(new THREE.Points(cloudGeometry,new THREE.PointsMaterial({size:.065,vertexColors:true,sizeAttenuation:true})));
const groundIndex=new math.GroundIndex(cloudPoints);
const grid=new THREE.GridHelper(120,24,'#293744','#18222c');grid.rotation.x=Math.PI/2;grid.position.z=-.2;scene.add(grid);
function updateMeshes(){
    for(const box of boxes){
        let record=meshes.get(box.id);
        if(!record){
            const group=new THREE.Group();group.userData.boxId=box.id;
            const fill=new THREE.Mesh(boxGeometry,new THREE.MeshBasicMaterial({color:box.labelColor,transparent:true,opacity:.035,depthWrite:false}));
            const wire=new THREE.LineSegments(boxEdges,new THREE.LineBasicMaterial({color:box.labelColor}));
            const heading=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,.52),.7,0xe2e8f0,.13,.08);
            fill.userData.boxId=box.id;group.add(fill,wire,heading);scene.add(group);record={group,fill,wire,heading};meshes.set(box.id,record);
        }
        const p=box.points;record.group.position.set(...p.slice(0,3));record.group.rotation.set(...p.slice(3,6),'XYZ');record.group.scale.set(...p.slice(6,9));
        const color=colors.get(box.id)||box.labelColor;record.wire.material.color.set(color);record.fill.material.color.set(color);record.fill.material.opacity=box.id===active ? .18 : .045;
        record.heading.setColor(box.id===active?0xffffff:0x64748b);record.heading.visible=box.id===active;
    }
}
function snapshot(){return {sessionId,mode:'demo',connected:true,jobId:9426,frame:29,revision,activeBoxId:active,boxes:structuredClone(boxes),labels,saveState:'local',freeCam,
    pointCount:cloudPoints.length,capabilities:{read:true,selection:true,edit:true,appearance:true,ground:true,freeCam:true}};}
function publish(){updateMeshes();updateHistory();window.dispatchEvent(new CustomEvent('c3d:snapshot:v2',{detail:JSON.stringify(snapshot())}));}
function validate(ref,edit=false){if(ref?.sessionId!==sessionId||ref.jobId!==9426||ref.frame!==29)throw new Error('Invalid demo job/frame');if(edit&&ref.revision!==revision)throw new Error('Box was modified; please retry');const box=boxes.find(b=>b.id===ref.clientId);if(!box)throw new Error('Box not found');return box;}
function update(box,change){history.push({id:box.id,before:structuredClone(box)});redo=[];Object.assign(box,change);revision++;publish();return {applied:true,saveState:'local',revision};}
function focusBox(id){const b=boxes.find(b=>b.id===id);if(!b)return;const [x,y,z]=b.points;const center=new THREE.Vector3(x,y,z),direction=camera.getWorldDirection(new THREE.Vector3()),radius=Math.hypot(...b.points.slice(6,9))/2;
const vertical=camera.fov*Math.PI/360,angle=Math.min(vertical,Math.atan(Math.tan(vertical)*camera.aspect));
camera.position.copy(center).addScaledVector(direction,-radius*1.25/Math.sin(angle));controls.target.copy(center);controls.update();}
function configuredGround(payload){
    if(!payload.useOriginGround)return groundIndex.estimate(boxes.find(b=>b.id===payload.ref.clientId));
    const height=payload.fallbackGroundHeight??0;if(!Number.isFinite(height))throw new Error('Invalid origin ground offset');
    return {...math.makePlane(0,0,height),accepted:true,confidence:1,configured:true,source:'coordinate-origin'};
}
async function command(type,payload={}){
    switch(type){
        case 'GET_SNAPSHOT':return snapshot();
        case 'SELECT_OBJECT':{const box=validate(payload.ref);active=box.id;if(payload.focus)focusBox(active);publish();return {selected:active,focused:!!payload.focus};}
        case 'ROTATE':{const box=validate(payload.ref,true);if(![-90,90,180].includes(payload.degrees))throw new Error('Invalid rotation angle');return update(box,{points:math.rotateYawPoints(box.points,payload.degrees)});}
        case 'SET_LABEL':{const box=validate(payload.ref,true),label=labels.find(l=>l.id===payload.labelId);if(!label)throw new Error('Invalid class');return update(box,{labelId:label.id,label_name:label.name,labelColor:label.color});}
        case 'AUTO_FIT':{const box=validate(payload.ref,true),ground=configuredGround(payload),preset=math.resolveFitPreset(box.label_name,box.subType),selection=math.fitPresetBox(cloudPoints,box.label_name,{points:box.points,ground,keepDirection:payload.keepDirection===true},boxes.filter(b=>b.id!==box.id),payload.presetDimensions??preset?.dimensions);const finalGround=ground;if(!math.canManuallySnapGround(finalGround)||finalGround.confidence<.65)throw new Error('Reliable ground unavailable under final preset footprint; box unchanged');const fitted=math.snapGroundPoints(selection.fitted,math.makePlane(finalGround.a,finalGround.b,finalGround.c)).newPoints;return {...update(box,{points:fitted}),preset:selection.preset,warning:selection.warnings.join(' · '),groundFallback:false};}
        case 'AUTO_ADJUST':{const box=validate(payload.ref,true),ground=configuredGround(payload),adjusted=math.autoAdjustBox(cloudPoints,box,ground,boxes.filter(b=>b.id!==box.id),payload);if(!adjusted.changed)return {unchanged:true};return {...update(box,{points:adjusted.points}),warning:[adjusted.limitedFaces.length?'Some face corrections limited to 0.4m':null,adjusted.retainedFaces.length?'Faces without nearby surface support preserved':null,adjusted.rejectedBoundaryCandidates?'Weak boundary patches ignored':null].filter(Boolean).join(' · ')||null};}
        case 'GET_GROUNDS':{validate(payload.ref);const result={};for(const id of payload.ids||[]){const box=boxes.find(b=>b.id===id);if(!box)continue;const {getTargetZ,...data}=groundIndex.estimate(box);result[id]=data;if(id%5===0)await new Promise(r=>setTimeout(r,0));}return result;}
        case 'SNAP_GROUND':{const box=validate(payload.ref,true),ground=configuredGround(payload);const snap=math.snapGroundPoints(box.points,ground);if(Math.abs(snap.deltaZ)>1.5&&!payload.allowLargeAdjustment)throw new Error('Ground adjustment exceeds 1.5m; box unchanged');return {...update(box,{points:snap.newPoints}),deltaZ:snap.deltaZ,confidence:null,groundSource:ground.source,groundHeight:ground.c};}
        case 'SET_QC_APPEARANCE':colors=new Map((payload.colors||[]).map(c=>[c.id,c.color]));updateMeshes();return {colored:colors.size};
        case 'CLEAR_QC_APPEARANCE':colors.clear();updateMeshes();return {cleared:true};
        case 'FREECAM':setFreeCam(!!payload.enabled);publish();return {enabled:freeCam};
        default:throw new Error('Command not supported in demo');
    }
}
const results=new Map(), inflight=new Set();
window.addEventListener('c3d:request:v2',async event=>{
    let r;try{r=JSON.parse(event.detail);}catch(_){return;}if(r.protocol!==2)return;
    const respond=data=>window.dispatchEvent(new CustomEvent('c3d:response:v2',{detail:JSON.stringify(data)}));
    if(results.has(r.requestId)){respond(results.get(r.requestId));return;}if(inflight.has(r.requestId))return;inflight.add(r.requestId);
    let result;try{result={requestId:r.requestId,ok:true,result:await command(r.type,r.payload)};}catch(e){result={requestId:r.requestId,ok:false,error:e.message};}
    inflight.delete(r.requestId);results.set(r.requestId,result);if(results.size>100)results.delete(results.keys().next().value);respond(result);
});
const raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2();
let pointerStart=null;
canvas.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointerup',e=>{
    if(freeCam||!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>5)return;
    const rect=canvas.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);
    const hits=raycaster.intersectObjects(Array.from(meshes.values()).map(r=>r.fill));if(hits[0]){active=hits[0].object.userData.boxId;publish();}
});
function updateHistory(){document.getElementById('demo-undo').disabled=!history.length;document.getElementById('demo-redo').disabled=!redo.length;document.getElementById('demo-edit-count').textContent=`${history.length} operations in demo`;}
function undo(){const entry=history.pop();if(!entry)return;const index=boxes.findIndex(b=>b.id===entry.id);redo.push({id:entry.id,before:structuredClone(boxes[index])});boxes[index]=entry.before;revision++;publish();}
function redoEdit(){const entry=redo.pop();if(!entry)return;const index=boxes.findIndex(b=>b.id===entry.id);history.push({id:entry.id,before:structuredClone(boxes[index])});boxes[index]=entry.before;revision++;publish();}
document.getElementById('demo-undo').addEventListener('click',undo);document.getElementById('demo-redo').addEventListener('click',redoEdit);
document.getElementById('demo-reset').addEventListener('click',()=>{boxes=structuredClone(initial);history=[];redo=[];revision++;active=2;setFreeCam(false);focusBox(2);publish();});
document.querySelectorAll('[data-case]').forEach(button=>button.addEventListener('click',()=>{active=Number(button.dataset.case);focusBox(active);publish();}));
const pressed=new Set();let look=false,lastTime=0;
function setFreeCam(enabled){freeCam=enabled;controls.enabled=!enabled;pressed.clear();look=false;lastTime=0;
    if(!enabled){const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);controls.target.copy(camera.position).addScaledVector(forward,10);controls.update();}
    document.getElementById('demo-camera-mode').textContent=enabled?'FREE CAM · WASD / QE · right click to look':'ORBIT · drag to rotate · scroll to zoom';}
const isInput=target=>target?.closest?.('input,textarea,select,[contenteditable="true"]');
window.addEventListener('keydown',e=>{
    if(isInput(e.target))return;
    if(e.ctrlKey&&e.code==='KeyZ'){e.preventDefault();e.shiftKey?redoEdit():undo();return;}
    if(e.ctrlKey&&e.code==='KeyY'){e.preventDefault();redoEdit();return;}
    if(!freeCam||e.altKey||e.ctrlKey)return;
    if(e.code==='Escape'){setFreeCam(false);publish();return;}
    if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(e.code)){pressed.add(e.code);e.preventDefault();e.stopImmediatePropagation();}
},true);
window.addEventListener('keyup',e=>pressed.delete(e.code));window.addEventListener('blur',()=>{pressed.clear();look=false;});
canvas.addEventListener('pointerdown',e=>{if(freeCam&&e.button===2){look=true;canvas.setPointerCapture(e.pointerId);e.preventDefault();}});
canvas.addEventListener('pointerup',()=>{look=false;});canvas.addEventListener('contextmenu',e=>{if(freeCam)e.preventDefault();});
canvas.addEventListener('pointermove',e=>{
    if(!freeCam||!look)return;
    const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-e.movementX*.003);camera.quaternion.premultiply(yaw);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),pitch=new THREE.Quaternion().setFromAxisAngle(right,-e.movementY*.003);
    const candidate=camera.quaternion.clone().premultiply(pitch),forward=new THREE.Vector3(0,0,-1).applyQuaternion(candidate);if(Math.abs(forward.z)<.99)camera.quaternion.copy(candidate);
});
function frame(time){
    const width=stage.clientWidth,height=stage.clientHeight;if(canvas.width!==Math.floor(width*renderer.getPixelRatio())||canvas.height!==Math.floor(height*renderer.getPixelRatio())){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
    if(freeCam){const dt=lastTime?Math.min(.05,(time-lastTime)/1000):0;lastTime=time;
        if(!document.hidden&&!isInput(document.activeElement)){
            const dir=new THREE.Vector3(),forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion),right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
            dir.addScaledVector(forward,(pressed.has('KeyW')?1:0)-(pressed.has('KeyS')?1:0));dir.addScaledVector(right,(pressed.has('KeyD')?1:0)-(pressed.has('KeyA')?1:0));dir.z+=(pressed.has('KeyE')?1:0)-(pressed.has('KeyQ')?1:0);
            if(dir.lengthSq())camera.position.addScaledVector(dir.normalize(),dt*(pressed.has('ShiftLeft')||pressed.has('ShiftRight')?18:6));
        }
    }else controls.update();renderer.render(scene,camera);requestAnimationFrame(frame);
}
// Test interface exists only on the offline demonstration page.
window.__C3D_DEMO_TEST={snapshot,command,undo,redo:redoEdit,reset:()=>document.getElementById('demo-reset').click(),camera:()=>({position:camera.position.toArray(),quaternion:camera.quaternion.toArray()}),
    color:id=>meshes.get(id)?.wire.material.color.getHexString(),cloudPointCount:cloudPoints.length};
focusBox(2);publish();requestAnimationFrame(frame);
