const {test,expect}=require('@playwright/test'),fs=require('node:fs');
async function setup(page,stop=14){
 await page.setContent('<html data-c3d-demo="true"><body><input role="spinbutton" aria-valuemin="0" aria-valuemax="14" type="number" value="7"></body></html>');
 await page.evaluate(stop=>{
  const shapes=new Map([0,7,stop].map(f=>[f,{frame:f,type:'cuboid',outside:false,points:[f*.1,0,.9,0,0,0,1.8,.8,1.6,0,0,0,0,0,0,0]}]));
  const history=[],listeners=[],label={id:1,name:'two-wheels',color:'#a78bfa',attributes:[]};
  function stateAt(frame){
   const frames=[...shapes.keys()].sort((a,b)=>a-b),a=frames.filter(x=>x<=frame).at(-1),b=frames.find(x=>x>=frame);
   const p=shapes.get(a).points.slice(),ratio=b===a?0:(frame-a)/(b-a);
   if(b!=null)for(let i=0;i<9;i++)p[i]+=(shapes.get(b).points[i]-p[i])*ratio;
   return {clientID:5,serverID:42339,objectType:'track',shapeType:'cuboid',frame,points:p,label,attributes:{},keyframe:shapes.has(frame),outside:false,
    async save(){history.push({frame,before:shapes.get(frame)});shapes.set(frame,{frame,type:'cuboid',outside:false,points:this.points.slice()});return this;}};
  }
  function blob(frame){
   const pts=[];
   for(let x=-8;x<=8;x+=.4)for(let y=-6;y<=6;y+=.4)pts.push([x,y,0]);
   for(let x=-.9;x<=.91;x+=.1)for(let y=-.4;y<=.41;y+=.1)for(const z of [.35,.7,1.1,1.6])pts.push([frame*.1+x,.4*Math.sin(Math.PI*frame/7)+y,z]);
   const n=String.fromCharCode(10);
   return new Blob([['VERSION .7','FIELDS x y z','SIZE 4 4 4','TYPE F F F','COUNT 1 1 1','WIDTH '+pts.length,'HEIGHT 1','POINTS '+pts.length,'DATA ascii',...pts.map(p=>p.join(' ')),''].join(n)]);
  }
  const job={id:601,dimension:'3d',startFrame:0,stopFrame:stop,labels:[label],actions:{get:async()=>({undo:history.map(h=>['CHANGED_POINTS',h.frame]),redo:[]})},
   annotations:{hasUnsavedChanges:()=>history.length>0,export:async()=>({tracks:[{clientID:5,id:42339,shapes:[...shapes.values()].sort((a,b)=>a.frame-b.frame)}]}),get:async frame=>[stateAt(frame)]},
   frames:{get:async frame=>({deleted:false,data:async()=>({imageData:blob(frame)})})}};
  let state;
  const notify=()=>listeners.forEach(fn=>fn());
  const canvas={mode:()=> 'idle',activate(){},focus(){},html:()=>({perspective:{dispatchEvent(e){if(e.type==='canvas.selected'){state.annotation.annotations.activatedStateID=e.detail.clientID;notify();}}}}),
   view:{views:{perspective:{scene:{traverse(){}}}},drawnObjects:{},receiveShapeColor:()=> '#fff'}};
  state={annotation:{job:{instance:job},player:{frame:{number:7}},annotations:{states:[stateAt(7)],activatedStateID:5},canvas:{instance:canvas},workspace:'standard3d'}};
  window.__store__={getState:()=>state,subscribe:fn=>{listeners.push(fn);return()=>{};},dispatch(action){if(action.type==='UPDATE_ANNOTATIONS_SUCCESS'){state.annotation.annotations.states=action.payload.states;notify();}}};
  document.querySelector('input[role=spinbutton]').addEventListener('keydown',e=>{if(e.key==='Enter'){state.annotation.player.frame.number=Number(e.target.value);state.annotation.annotations.states=[stateAt(Number(e.target.value))];notify();}});
  window.__batchFixture={shapes,history,job};
 },stop);
 await page.addStyleTag({content:fs.readFileSync('extension/styles.css','utf8')});
 await page.addScriptTag({content:fs.readFileSync('extension/copilot_main.js','utf8')});
 await page.addScriptTag({content:fs.readFileSync('extension/copilot_panel.js','utf8')});
 await expect(page.locator('#c3d-batch')).toBeEnabled();
 await page.locator('#c3d-batch').click();
 await expect(page.locator('[data-progress]')).toContainText('Preview only');
}
test('batch shows real PCD projections and protects native keyframes without changing annotations',async({page})=>{
 await setup(page);
 await expect(page.locator('.c3d-batch-card')).toHaveCount(7);
 await expect(page.locator('.c3d-batch-card[data-frame="0"] [data-accept]')).toHaveCount(0);
 await expect(page.locator('.c3d-batch-card canvas')).toHaveCount(21);
 await expect(page.locator('[data-accept="3"]')).toBeVisible();
 expect(await page.evaluate(()=>__batchFixture.history.length)).toBe(0);
 await page.screenshot({path:'docs/verification/batch-track-preview-1.8.0.png'});
 await page.locator('[data-action="close"]').click();
 expect(await page.evaluate(()=>__batchFixture.shapes.size)).toBe(3);
});
test('batch applies only explicitly selected frames through native state save',async({page})=>{
 await setup(page);
 const before=await page.evaluate(()=>JSON.stringify([...__batchFixture.shapes.values()]));
 await page.locator('[data-accept="3"]').check();

 await page.locator('[data-action="apply"]').click();await page.getByRole('button',{name:'Confirm Apply',exact:true}).click();
 await expect(page.locator('[data-progress]')).toContainText('Applied: 3');
 expect(await page.evaluate(()=>__batchFixture.history.map(h=>h.frame))).toEqual([3]);
 const anchors=await page.evaluate(()=>JSON.stringify([...__batchFixture.shapes.values()].filter(s=>[0,7,14].includes(s.frame))));
 expect(anchors).toBe(before);
 await expect(page.locator('[data-action="apply"]')).toBeDisabled();
});
test('review protection removes proposal; stale track changes cannot be applied',async({page})=>{
 await setup(page);
 await page.locator('.c3d-batch-card[data-frame="3"]').getByRole('button',{name:'Protect this frame',exact:true}).click();
 await expect(page.locator('[data-accept="3"]')).toHaveCount(0);
 await page.locator('[data-accept="4"]').check();
 await page.evaluate(()=>__batchFixture.shapes.get(7).points[0]+=.1);
 await page.locator('[data-action="apply"]').click();await page.getByRole('button',{name:'Confirm Apply',exact:true}).click();
 await expect(page.locator('[data-progress]')).toContainText('Track changed');
 expect(await page.evaluate(()=>__batchFixture.history.length)).toBe(0);
});
test('opening a batch card navigates native frame and selects the same track',async({page})=>{
 await setup(page);
 await page.locator('.c3d-batch-card[data-frame="3"]').getByRole('button',{name:'Open in CVAT',exact:true}).click();
 await expect(page.locator('.c3d-batch-dialog')).toHaveCount(0);
 await expect(page.locator('#c3d-toast')).toContainText('CVAT frame 3 selected');
 await expect(page.locator('#c3d-context-label')).toContainText('Frame 3');
 expect(await page.evaluate(()=>__store__.getState().annotation.annotations.activatedStateID)).toBe(5);
 expect(await page.evaluate(()=>__batchFixture.history.length)).toBe(0);
});

test('batch dialog keyboard shortcuts do not trigger normal editor box edits',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{window.batchRequests=[];window.addEventListener('c3d:request:v2',e=>window.batchRequests.push(JSON.parse(e.detail).type));});
 await page.getByRole('dialog',{name:'Batch Track Review',exact:true}).press('Alt+Shift+A');
 expect(await page.evaluate(()=>window.batchRequests.includes('AUTO_FIT'))).toBe(false);
 expect(await page.evaluate(()=>__batchFixture.history.length)).toBe(0);
});


test('60-frame compute retains cross-page selections and never reloads PCD on pagination',async({page})=>{
 test.setTimeout(120000);
 await setup(page,60);
 await page.evaluate(()=>{window.batchReads=[];window.addEventListener('c3d:request:v2',e=>{const r=JSON.parse(e.detail);if(r.type==='BATCH_FRAME')window.batchReads.push(r.payload.frame);});});
 await page.locator('[data-from]').fill('1');await page.locator('[data-to]').fill('60');
 await page.locator('[data-action="load"]').click();
 await expect(page.locator('[data-progress]')).toContainText('Computed 60 frames',{timeout:90000});
 expect(await page.evaluate(()=>batchReads)).toEqual(Array.from({length:60},(_,i)=>i+1));
 await expect(page.locator('.c3d-batch-card')).toHaveCount(7);
 await page.locator('[data-accept="3"]').check();
 await page.locator('[data-action="next"]').click();
 await page.locator('[data-accept="10"]').check();
 await expect(page.locator('[data-summary]')).toContainText('Selected 2');
 await page.locator('[data-action="prev"]').click();
 await expect(page.locator('[data-accept="3"]')).toBeChecked();
 for(let i=0;i<8;i++)await page.locator('[data-action="next"]').click();
 await expect(page.locator('.c3d-batch-card')).toHaveCount(4);
 await expect(page.locator('.c3d-batch-card[data-frame="60"]')).toBeVisible();
 for(let i=0;i<8;i++)await page.locator('[data-action="prev"]').click();
 await expect(page.locator('[data-accept="3"]')).toBeChecked();
 expect(await page.evaluate(()=>batchReads.length)).toBe(60);
 await page.locator('[data-action="apply"]').click();await page.getByRole('button',{name:'Confirm Apply',exact:true}).click();
 await expect(page.locator('[data-progress]')).toContainText('Applied: 3, 10');
 expect(await page.evaluate(()=>__batchFixture.history.map(h=>h.frame))).toEqual([3,10]);
});

test('batch confirmation can be cancelled or closed without any edits',async({page})=>{
 await setup(page);
 await page.locator('[data-accept="3"]').check();await page.locator('[data-action="apply"]').click();
 await expect(page.getByRole('group',{name:'Confirm batch apply'})).toContainText('frames 3');
 expect(await page.evaluate(()=>__batchFixture.history.length)).toBe(0);
 await page.getByRole('button',{name:'Back to review',exact:true}).click();
 await expect(page.locator('[data-accept="3"]')).toBeChecked();
 await page.locator('[data-action="apply"]').click();await page.locator('[data-action="close"]').click();
 await expect(page.locator('.c3d-batch-dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>__batchFixture.history.length)).toBe(0);
});

test('inclusive range validation and cancellation never apply partial computation',async({page})=>{
 await setup(page,60);
 await page.locator('[data-from]').fill('0');await page.locator('[data-to]').fill('60');
 await page.locator('[data-action="load"]').click();
 await expect(page.locator('[data-progress]')).toContainText('at most 60');
 await page.locator('[data-from]').fill('1');
 await page.evaluate(()=>{const get=__batchFixture.job.frames.get;__batchFixture.job.frames.get=async f=>{await new Promise(r=>setTimeout(r,100));return get(f);};});
 await page.locator('[data-action="load"]').click();
 await expect(page.locator('[data-progress]')).toContainText('Computing');
 await page.locator('[data-action="cancel-compute"]').click();
 await expect(page.locator('[data-progress]')).toContainText('Compute cancelled');
 await expect(page.locator('[data-action="apply"]')).toBeDisabled();
 expect(await page.evaluate(()=>__batchFixture.history.length)).toBe(0);
});


test('failed computation blocks Apply and a fresh compute recovers',async({page})=>{
 await setup(page,60);
 await page.evaluate(()=>{const get=__batchFixture.job.frames.get;window.restoreFrames=()=>__batchFixture.job.frames.get=get;__batchFixture.job.frames.get=async f=>{if(f===10)throw new Error('Injected PCD failure');return get(f);};});
 await page.locator('[data-from]').fill('1');await page.locator('[data-to]').fill('20');
 await page.locator('[data-action="load"]').click();
 await expect(page.locator('[data-progress]')).toContainText('Injected PCD failure');
 await expect(page.locator('[data-action="apply"]')).toBeDisabled();
 expect(await page.evaluate(()=>__batchFixture.history.length)).toBe(0);
 await page.evaluate(()=>restoreFrames());
 await page.locator('[data-action="load"]').click();
 await expect(page.locator('[data-progress]')).toContainText('Computed 20 frames');
 await expect(page.locator('[data-action="apply"]')).toBeEnabled();
});
