const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const three=require('esbuild').buildSync({stdin:{contents:"window.__TEST_THREE=require('three');",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',minify:true}).outputFiles[0].text;
async function fixture(page,{supported=true}={}){
    await page.goto('http://127.0.0.1:4173/extension/manifest.json');
    await page.setContent('<html data-c3d-demo="true"><body style="background:#111"><canvas id="perspective"></canvas></body></html>');
    await page.addStyleTag({path:'extension/styles.css'});await page.addScriptTag({content:three});
    await page.evaluate(({supported})=>{
        const T=window.__TEST_THREE,camera=new T.PerspectiveCamera(50,1,.1,1000),target=new T.Vector3();camera.position.set(10,-8,6);camera.lookAt(target);
        const controls=supported?{getTarget:out=>out.copy(target),setLookAt(x,y,z,tx,ty,tz){camera.position.set(x,y,z);target.set(tx,ty,tz);camera.lookAt(target);},update(){}}:{};
        const history=[],label={id:1,name:'vehicles',color:'#fff'},mesh=new T.Object3D();
        const box={clientID:1,serverID:8,objectType:'track',shapeType:'cuboid',frame:0,points:[2,3,1,0,0,0,4,2,2,0,0,0,0,0,0,0],label,async save(){history.push(this.points.slice());return this;}};
        const view={views:{perspective:{camera,controls,renderer:{domElement:document.getElementById('perspective')}}},model:{data:{imageID:0}},drawnObjects:{}};
        const canvas={view,render(){},mode:()=> 'idle',activate(){},html:()=>({perspective:document.getElementById('perspective')})};
        const annotation={job:{instance:{id:1,dimension:'3d',labels:[label],actions:{get:async()=>history},annotations:{hasUnsavedChanges:()=>false}}},player:{frame:{number:0}},annotations:{states:[box],activatedStateID:1},canvas:{instance:canvas,ready:true},workspace:'standard3d'};
        const subscribers=new Set();window.__store__={getState:()=>({annotation}),subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn);},dispatch(){throw new Error('Unexpected annotation mutation');}};
        const render=()=>{view.model.data.imageID=annotation.player.frame.number;mesh.position.set(...box.points.slice(0,3));view.drawnObjects[1]={data:{points:box.points.slice()},cuboid:{perspective:mesh}};};render();
        window.testFollow={camera,target,box,history,render,advance(frame,center,ready=true){annotation.player.frame.number=frame;box.frame=frame;box.points.splice(0,3,...center);if(ready)render();for(const fn of subscribers)fn();}};
    },{supported});
    for(const file of ['geometry_math.js','cvat_adapter.js','main_world_bridge.js','copilot_panel.js'])await page.addScriptTag({content:fs.readFileSync('extension/'+file,'utf8')});
    await expect(page.locator('#c3d-follow-selected')).toBeVisible();
}

test('follow checkbox preserves orbit through frame loading and persists across panel/browser reloads',async({page})=>{
    await fixture(page);const checkbox=page.getByRole('checkbox',{name:'Follow selected object',exact:true});await expect(checkbox).not.toBeChecked();
    await checkbox.check();await expect(page.locator('#c3d-follow-status')).toHaveText('Following track 1');
    await page.evaluate(()=>{const h=testFollow;h.camera.position.copy(h.target).add(new __TEST_THREE.Vector3(-5,7,3));h.camera.lookAt(h.target);});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.evaluate(()=>{testFollow.advance(1,[15,20,2],false);testFollow.camera.position.set(100,100,100);});
    await expect(page.locator('#c3d-follow-status')).toHaveText('Waiting for frame canvas');
    expect(await page.evaluate(()=>testFollow.target.toArray())).toEqual([2,3,1]);
    await page.evaluate(()=>testFollow.render());await expect(page.locator('#c3d-follow-status')).toHaveText('Following track 1');
    expect(await page.evaluate(()=>testFollow.target.toArray())).toEqual([15,20,2]);expect(await page.evaluate(()=>testFollow.camera.position.toArray())).toEqual([10,27,5]);
    await fixture(page);await expect(checkbox).toBeChecked();await expect(page.locator('#c3d-follow-status')).toHaveText('Following track 1');
    await checkbox.uncheck();await page.evaluate(()=>testFollow.advance(3,[100,200,3]));
    expect(await page.evaluate(()=>testFollow.target.toArray())).toEqual([2,3,1]);expect(await page.evaluate(()=>testFollow.history.length)).toBe(0);
});

test('follow checkbox explains missing camera APIs and remains disabled',async({page})=>{
    await fixture(page,{supported:false});const checkbox=page.getByRole('checkbox',{name:'Follow selected object',exact:true});
    await expect(checkbox).toBeDisabled();await expect(page.locator('.c3d-follow-option')).toHaveAttribute('title',/camera or orbit controls missing/);
});

test('Free Cam survives frame changes while follow pauses, then resumes the current flight heading',async({page})=>{
    await fixture(page);await page.getByRole('checkbox',{name:'Follow selected object',exact:true}).check();await expect(page.locator('#c3d-follow-status')).toHaveText('Following track 1');
    await page.locator('#c3d-btn-freecam').click();await expect(page.locator('#c3d-follow-status')).toHaveText('Paused during Free Cam');
    await page.evaluate(()=>{
        const surface=document.getElementById('perspective');surface.dispatchEvent(new PointerEvent('pointerdown',{button:2,bubbles:true}));
        surface.dispatchEvent(new PointerEvent('pointermove',{movementX:80,movementY:20,bubbles:true}));
    });
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const before=await page.evaluate(()=>({position:testFollow.camera.position.toArray(),direction:testFollow.camera.getWorldDirection(new __TEST_THREE.Vector3()).toArray()}));
    await page.evaluate(()=>{testFollow.advance(2,[25,30,2],false);testFollow.camera.position.set(100,100,100);testFollow.camera.quaternion.set(0,0,0,1);});
    await expect.poll(()=>page.evaluate(()=>testFollow.camera.position.toArray())).toEqual(before.position);
    await page.evaluate(()=>testFollow.render());
    await expect(page.locator('#c3d-follow-status')).toHaveText('Paused during Free Cam');
    await page.locator('#c3d-btn-focus').click();await expect(page.locator('#c3d-toast')).toContainText('turn off Free Cam');
    expect(await page.evaluate(()=>__CVAT_COPILOT_BRIDGE.adapter.getSnapshot().freeCam)).toBe(true);
    await page.keyboard.press('Escape');await expect(page.locator('#c3d-follow-status')).toHaveText('Following track 1');
    expect(await page.evaluate(()=>testFollow.target.toArray())).toEqual([25,30,2]);
    const direction=await page.evaluate(()=>testFollow.camera.getWorldDirection(new __TEST_THREE.Vector3()).toArray());direction.forEach((v,i)=>expect(v).toBeCloseTo(before.direction[i],8));
    expect(await page.evaluate(()=>testFollow.history.length)).toBe(0);
});
