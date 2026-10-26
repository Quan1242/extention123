const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
async function editorFixture(page){
    await page.setContent('<html data-c3d-demo="true"><body></body></html>');
    await page.evaluate(()=>{
        const snapshot={sessionId:'loading-test',mode:'demo',connected:true,jobId:1,frame:0,revision:1,activeBoxId:1,
            boxes:[{id:1,clientId:1,labelId:1,label_name:'vehicles',points:[0,0,1,0,0,0,4,2,2,0,0,0,0,0,0,0]}],
            labels:[{id:1,name:'vehicles'}],saveState:'local',capabilities:{read:true,ground:true,edit:true,selection:true}};
        window.addEventListener('c3d:request:v2',event=>{
            const req=JSON.parse(event.detail);
            const result=req.type==='GET_SNAPSHOT'?snapshot:req.type==='GET_GROUNDS'?{1:{a:0,b:0,c:0,accepted:true,confidence:.99,inlierCount:100,rmse:.001}}:{};
            window.dispatchEvent(new CustomEvent('c3d:response:v2',{detail:JSON.stringify({requestId:req.requestId,ok:true,result})}));
        });
    });
}
test('QC reports a missing dependency and recovers when geometry loads late',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await editorFixture(page);
    await page.addScriptTag({content:fs.readFileSync('extension/shortcut_settings.js','utf8')});
    await page.addScriptTag({content:fs.readFileSync('extension/content_script.js','utf8')});
    await expect(page.locator('#c3d-val-count')).toHaveText('1');
    await page.locator('#c3d-btn-scan').click();
    await expect(page.locator('#c3d-toast')).toContainText(/Geometry library not loaded|Thư viện geometry chưa nạp/i);
    await page.addScriptTag({content:fs.readFileSync('extension/geometry_math.js','utf8')});
    await page.locator('#c3d-btn-scan').click();
    await expect(page.locator('#c3d-road-info')).toContainText('99%');
    await expect(page.locator('#c3d-val-issues')).toHaveText('0');
    expect(errors).toEqual([]);
});
test('manifest panel initializes its own geometry before QC, without a page global',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await editorFixture(page);
    expect(await page.evaluate(()=>window.__CVAT_COPILOT_MATH)).toBeUndefined();
    const manifest=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));
    const isolated=manifest.content_scripts.find(entry=>entry.world!=='MAIN');
    for(const name of isolated.js)await page.addScriptTag({content:fs.readFileSync('extension/'+name,'utf8')});
    await page.locator('#c3d-btn-scan').click();
    await expect(page.locator('#c3d-road-info')).toContainText('99%');
    expect(errors).toEqual([]);
});

test('clicking one QC issue focuses its box and retains all three issues including other severities',async({page})=>{
 await page.setContent('<html data-c3d-demo="true"><body></body></html>');
 await page.evaluate(()=>{
  const snapshot={sessionId:'multi',mode:'demo',connected:true,jobId:1,frame:0,revision:1,activeBoxId:null,
   boxes:[{id:17,labelId:1,label_name:'vehicles',points:[10,0,3,0,0,0,1,1,1]}],labels:[{id:1,name:'vehicles'}],
   capabilities:{read:true,edit:true,ground:false,selection:true},saveState:'local'};
  window.lastSelection=null;
  window.addEventListener('c3d:request:v2',e=>{
   const q=JSON.parse(e.detail);let result={};
   if(q.type==='SELECT_OBJECT'){window.lastSelection=q.payload;snapshot.activeBoxId=q.payload.ref.clientId;result={selected:snapshot.activeBoxId,focused:q.payload.focus};}
   if(q.type==='GET_SNAPSHOT')result=snapshot;
   window.dispatchEvent(new CustomEvent('c3d:response:v2',{detail:JSON.stringify({requestId:q.requestId,ok:true,result})}));
  });
 });
 await page.addScriptTag({content:fs.readFileSync('extension/geometry_math.js','utf8')});
 await page.addScriptTag({content:fs.readFileSync('extension/shortcut_settings.js','utf8')});
    await page.addScriptTag({content:fs.readFileSync('extension/content_script.js','utf8')});
 await page.locator('#c3d-btn-scan').click();
 await expect(page.locator('.c3d-issue-select')).toHaveCount(3);
 await page.locator('#c3d-filter').selectOption('WARNING');
 await expect(page.locator('.c3d-issue-select')).toHaveCount(3);
 await page.locator('.c3d-issue-select').first().click();
 await expect(page.locator('#c3d-filter')).toHaveValue('ALL');
 await expect(page.locator('.c3d-issue-select')).toHaveCount(3);
 expect(await page.evaluate(()=>window.lastSelection)).toMatchObject({ref:{clientId:17},focus:true});
});
