const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const THREEBundle=require('esbuild').buildSync({stdin:{contents:"window.__TEST_THREE=require('three');",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',minify:true}).outputFiles[0].text;

async function fixture(page,withObject,adjustDirection=false,{command='MOVE_TO_MOUSE',initialPoints=null,expectSave=true,nearGroundNoise=false,boundaryNoise=false,withGround=true,placement=null,groundHeight=0,useOriginGround=true}={}){
    await page.goto('http://127.0.0.1:4173/extension/manifest.json');
    await page.setContent('<html data-c3d-demo="true"><body><canvas id="perspective"></canvas><canvas id="top" style="position:absolute;left:100px;top:200px;width:800px;height:400px"></canvas></body></html>');
    await page.addStyleTag({path:'extension/styles.css'});
    await page.addScriptTag({content:THREEBundle});
    await page.evaluate(({withObject,initialPoints,nearGroundNoise,boundaryNoise,withGround,groundHeight})=>{
        const THREE=window.__TEST_THREE,points=[];
        if(withGround)for(let x=-12;x<=12;x+=.3)for(let y=-12;y<=12;y+=.3)points.push(x,y,groundHeight);
        if(withObject)for(let i=0;i<=20;i++)for(let j=0;j<=10;j++)for(const z of [.6,.8,1,1.2,1.4])points.push(.6+(i/20-.5)*2,.3+(j/10-.5),z);
        if(nearGroundNoise)for(let x=-.75;x<=1.95;x+=.08)for(let y=-.55;y<=1.15;y+=.08)for(const z of [.1,.14,.18,.2])points.push(x,y,z);
        if(boundaryNoise){
            const yaw=initialPoints[5],c=Math.cos(yaw),s=Math.sin(yaw),cx=initialPoints[0],cy=initialPoints[1];
            for(let repeat=0;repeat<100;repeat++)for(const [x,y,z] of [[1.3,0,.8],[1.3,.09,.8],[1.3,.18,.8],[0,0,1.65],[.09,0,1.65],[.18,0,1.65]])points.push(cx+c*x-s*y,cy+s*x+c*y,z);
        }
        const scene=new THREE.Scene(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));scene.add(new THREE.Points(geometry,new THREE.PointsMaterial()));
        const camera=new THREE.OrthographicCamera(-10,10,5,-5,.1,100);camera.position.set(0,0,20);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
        const perspective=document.getElementById('perspective'),top=document.getElementById('top');
        const label={id:1,name:'vehicles',color:'#fff'},history=[];window.savedEdits=history;
        const box={clientID:1,frame:0,objectType:'track',shapeType:'cuboid',outside:false,lock:false,keyframe:false,label,points:[-4,-3,1,0,0,.2,4,2,2,0,0,0,0,0,0,0],async save(){history.push(this.points.slice());return {...this,keyframe:true,points:this.points.slice()};}};
        if(initialPoints)box.points=initialPoints;
        const canvas={activate(){},mode:()=> 'idle',html:()=>({perspective,top}),view:{views:{perspective:{scene},top:{camera,renderer:{domElement:top}}}}};
        const state={annotation:{job:{instance:{id:1,dimension:'3d',labels:[label],actions:{get:async()=>history},annotations:{hasUnsavedChanges:()=>history.length>0}}},player:{frame:{number:0}},annotations:{states:[box],activatedStateID:1},canvas:{instance:canvas},workspace:'standard3d'}};
        const listeners=new Set();
        window.__store__={getState:()=>state,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},dispatch(action){if(action.type==='UPDATE_ANNOTATIONS_SUCCESS')state.annotation.annotations.states=action.payload.states;for(const fn of listeners)fn();}};
    },{withObject,initialPoints,nearGroundNoise,boundaryNoise,withGround,groundHeight});
    for(const file of ['geometry_math.js','cvat_adapter.js','main_world_bridge.js','copilot_panel.js'])await page.addScriptTag({content:fs.readFileSync('extension/'+file,'utf8')});
    await expect(page.locator('#c3d-btn-move')).toBeEnabled();
    await expect(page.locator('#c3d-adjust-direction')).not.toBeChecked();
    if(useOriginGround)await page.locator('#c3d-origin-ground').check();
    else await page.locator('#c3d-origin-ground').uncheck();
    if(adjustDirection)await page.locator('#c3d-adjust-direction').check();
    if(placement){
        if(placement.fallbackGroundHeight!==undefined){await page.locator('#c3d-ground-height').fill(String(placement.fallbackGroundHeight));await page.locator('.c3d-title').click();}
        if(placement.moveLongitudinal)await page.locator('#c3d-move-longitudinal').selectOption(placement.moveLongitudinal);
        if(placement.moveLateral)await page.locator('#c3d-move-lateral').selectOption(placement.moveLateral);
        await page.locator('.c3d-title').click();
    }
    await page.mouse.move(500,400);
    await page.keyboard.press(command==='AUTO_ADJUST'?'Alt+Shift+B':command==='SNAP_GROUND'?'Alt+Shift+G':'Alt+Shift+M');
    if(expectSave)await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(1);
}

test('move shortcut refines nearby object center, preserves geometry, and saves once through the bridge',async({page})=>{
    await fixture(page,true);
    const points=await page.evaluate(()=>savedEdits[0]);
    expect(points[0]).toBeCloseTo(.6,1);expect(points[1]).toBeCloseTo(.3,1);
    expect(points.slice(3)).toEqual([0,0,.2,4,2,2,0,0,0,0,0,0,0]);
    await expect(page.locator('#c3d-toast')).toContainText('Box centered on nearby object');
    expect(await page.evaluate(()=>__store__.getState().annotation.annotations.states[0].keyframe)).toBe(true);
});

test('sparse object evidence keeps exact mouse placement and reports center fallback',async({page})=>{
    await fixture(page,false);
    const points=await page.evaluate(()=>savedEdits[0]);
    expect(points[0]).toBeCloseTo(0,8);expect(points[1]).toBeCloseTo(0,8);
    await expect(page.locator('#c3d-toast')).toContainText('Moved to mouse; center not refined');
    await expect(page.locator('#c3d-toast')).toContainText('No reliable nearby object cluster');
});

test('direction checkbox aligns the long axis within 30 degrees without resizing or extra saves',async({page})=>{
    await fixture(page,true,true);
    const points=await page.evaluate(()=>savedEdits[0]);
    expect(points[5]).toBeCloseTo(0,1);
    expect(points.slice(6)).toEqual([4,2,2,0,0,0,0,0,0,0]);
    expect(points.slice(3,5)).toEqual([0,0]);
    expect(await page.evaluate(()=>savedEdits.length)).toBe(1);
    await expect(page.locator('#c3d-toast')).toContainText('direction aligned');
});

test('Auto Adjust shortcut catches nearby points with fixed direction, ground contact and one save',async({page})=>{
    const original=[.5,.25,.7,0,0,.2,2,1,1.4,0,0,0,0,0,0,0];
    await fixture(page,true,false,{command:'AUTO_ADJUST',initialPoints:original});
    const points=await page.evaluate(()=>savedEdits[0]);
    expect(points.slice(3,6)).toEqual(original.slice(3,6));expect(points[6]).toBeGreaterThan(original[6]);expect(points[7]).toBeGreaterThan(original[7]);
    expect(points[2]-points[8]/2).toBeCloseTo(0,6);
    await expect(page.locator('#c3d-toast')).toContainText('Auto Adjust updated sides/top');
    await expect(page.locator('#c3d-btn-adjust')).toBeEnabled();await page.locator('#c3d-btn-adjust').click();
    await expect(page.locator('#c3d-toast')).toContainText('no supported local correction');
    expect(await page.evaluate(()=>savedEdits.length)).toBe(1);
});

test('Auto Adjust preserves far faces on a partially observed object without saving a smaller box',async({page})=>{
    const original=[.6,.3,1,0,0,.2,4,2,2,0,0,0,0,0,0,0];
    await fixture(page,true,false,{command:'AUTO_ADJUST',initialPoints:original,expectSave:false});
    await expect(page.locator('#c3d-toast')).toContainText('no supported local correction');
    expect(await page.evaluate(()=>savedEdits.length)).toBe(0);
    expect(await page.evaluate(()=>__store__.getState().annotation.annotations.states[0].points)).toEqual(original);
});

test('Auto Adjust ignores connected near-ground noise when measuring box faces',async({page})=>{
    const initialPoints=[.5,.25,.7,0,0,.2,2,1,1.4,0,0,0,0,0,0,0];
    await fixture(page,true,false,{command:'AUTO_ADJUST',initialPoints});
    const clean=await page.evaluate(()=>savedEdits[0]);
    await fixture(page,true,false,{command:'AUTO_ADJUST',initialPoints,nearGroundNoise:true});
    const dirty=await page.evaluate(()=>savedEdits[0]);
    for(const i of [0,1,5,6,7])expect(dirty[i]).toBeCloseTo(clean[i],5);
});

test('near-ground points alone leave the selected box unchanged without a native save',async({page})=>{
    const initialPoints=[.5,.25,.7,0,0,.2,2,1,1.4,0,0,0,0,0,0,0];
    await fixture(page,false,false,{command:'AUTO_ADJUST',initialPoints,nearGroundNoise:true,expectSave:false});
    await expect(page.locator('#c3d-toast')).toContainText('ground exclusion band');
    expect(await page.evaluate(()=>savedEdits.length)).toBe(0);
    expect(await page.evaluate(()=>__store__.getState().annotation.annotations.states[0].points)).toEqual(initialPoints);
});

test('Auto Adjust rejects duplicated high trash patches without losing supported object boundaries',async({page})=>{
    const initialPoints=[.5,.25,.7,0,0,.2,2,1,1.4,0,0,0,0,0,0,0];
    await fixture(page,true,false,{command:'AUTO_ADJUST',initialPoints});const clean=await page.evaluate(()=>savedEdits[0]);
    await fixture(page,true,false,{command:'AUTO_ADJUST',initialPoints,boundaryNoise:true});const dirty=await page.evaluate(()=>savedEdits[0]);
    for(let i=0;i<dirty.length;i++)expect(dirty[i]).toBeCloseTo(clean[i],5);
    await expect(page.locator('#c3d-toast')).toContainText('Weak boundary patches ignored');expect(await page.evaluate(()=>savedEdits.length)).toBe(1);
});

test('combined face alignment crosses the bridge in one unchanged-size edit',async({page})=>{
    await fixture(page,true,true,{placement:{moveLongitudinal:'forward',moveLateral:'right'}});
    const p=await page.evaluate(()=>savedEdits[0]);
    expect(p[0]).toBeCloseTo(1.6,1);expect(p[1]).toBeCloseTo(-.2,1);expect(p.slice(6)).toEqual([4,2,2,0,0,0,0,0,0,0]);
    await expect(page.locator('#c3d-toast')).toContainText('face aligned: forward + right');
});
for(const command of ['MOVE_TO_MOUSE','SNAP_GROUND'])test(`${command} uses configured ground height when cloud is absent`,async({page})=>{
    await fixture(page,false,false,{command,withGround:false,placement:{originGroundFallback:true,fallbackGroundHeight:.25}});
    const p=await page.evaluate(()=>savedEdits[0]);expect(p[2]-p[8]/2).toBeCloseTo(.25,7);
    await expect(page.locator('#c3d-toast')).toContainText(command==='SNAP_GROUND'?'coordinate origin + offset':'origin ground Z');
    await expect(page.locator('#c3d-road-info')).not.toContainText('LiDAR ground');
});

test('origin base overrides an elevated plane and stays unchanged across frames',async({page})=>{
    await fixture(page,false,false,{command:'SNAP_GROUND',groundHeight:1.1});
    await expect(page.locator('#c3d-road-info')).toContainText('Origin ground Z 0.00m');
    expect(await page.evaluate(()=>savedEdits[0][2]-savedEdits[0][8]/2)).toBeCloseTo(0,7);
    await page.evaluate(()=>{
        const ann=__store__.getState().annotation,attribute=ann.canvas.instance.view.views.perspective.scene.children[0].geometry.attributes.position;
        for(let i=0;i<attribute.count;i++)attribute.setZ(i,attribute.getZ(i)+.35);attribute.needsUpdate=true;
        ann.player.frame.number=1;for(const state of ann.annotations.states)state.frame=1;
        __store__.dispatch({type:'TEST_FRAME_CHANGE'});
    });
    await expect(page.locator('#c3d-btn-ground')).toBeEnabled();await page.locator('#c3d-btn-ground').click();
    await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(2);
    expect(await page.evaluate(()=>savedEdits[1][2]-savedEdits[1][8]/2)).toBeCloseTo(0,7);
    await expect(page.locator('#c3d-road-info')).toContainText('Origin ground Z 0.00m');
});

test('origin-ground mode hides irrelevant LiDAR ground segmentation warnings',async({page})=>{
    await fixture(page,false,false,{command:'SNAP_GROUND',withGround:false});
    await expect(page.locator('#c3d-road-info')).toHaveText('Origin ground Z 0.00m');
});

test('checkbox switches between road below origin and the coordinate origin',async({page})=>{
    await fixture(page,false,false,{command:'SNAP_GROUND',groundHeight:-.6,useOriginGround:false});
    await expect(page.locator('#c3d-origin-ground')).not.toBeChecked();
    expect(await page.evaluate(()=>savedEdits[0][2]-savedEdits[0][8]/2)).toBeCloseTo(-.6,6);
    await page.locator('#c3d-origin-ground').check();await expect(page.locator('#c3d-btn-ground')).toBeEnabled();await page.locator('#c3d-btn-ground').click();
    await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(2);
    expect(await page.evaluate(()=>savedEdits[1][2]-savedEdits[1][8]/2)).toBeCloseTo(0,6);
    await expect(page.locator('#c3d-origin-ground')).toBeEnabled();await page.locator('#c3d-origin-ground').uncheck();
    await expect(page.locator('#c3d-btn-ground')).toBeEnabled();await page.locator('#c3d-btn-ground').click();
    await expect.poll(()=>page.evaluate(()=>savedEdits.length)).toBe(3);
    expect(await page.evaluate(()=>savedEdits[2][2]-savedEdits[2][8]/2)).toBeCloseTo(-.6,6);
});
