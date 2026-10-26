const {test,expect}=require('@playwright/test');
async function setup(page,state='available'){
 await page.setContent('<main><span data-update-status role="status"></span><button data-update-install hidden>Cập nhật</button><button data-update-local hidden>Reload bản hiện tại</button><button data-update-setup hidden>Cài updater</button><button id="reload">Reload</button></main>');
 await page.addStyleTag({path:'extension/styles.css'});
 await page.evaluate(state=>{
  window.updateCalls=[];window.nativeCalls=[];window.listeners=[];window.importPending=false;window.failure=null;
  window.chrome={runtime:{id:'fixture',getManifest:()=>({version:'1.15.0'}),onMessage:{addListener:fn=>listeners.push(fn),removeListener:fn=>listeners.splice(listeners.indexOf(fn),1)},
   sendMessage:async message=>{updateCalls.push(message);if(failure)return {ok:false,error:failure};return {ok:true,result:message.type==='C3D_UPDATE_CHECK'?{state,latest:'1.15.1'}:{reloading:true}};}}};
 },state);
 await page.addScriptTag({path:'extension/update_client.js'});
 await page.evaluate(()=>{
  window.client=__C3D_UPDATE_CLIENT.mount({root:document.querySelector('main'),toast:()=>{},flush:async()=>{},importPending:()=>window.importPending,
   request:async(type)=>{nativeCalls.push(type);if(type==='GET_SNAPSHOT')return {connected:true,saveState:'saved',jobId:3,sessionId:'fixture'};return {saved:true};}});
  document.getElementById('reload').onclick=client.reload;
  window.workerMessage=type=>new Promise(resolve=>listeners[0]({type},{id:'fixture'},resolve));
 });
 await expect(page.locator('[data-update-status]')).not.toContainText('Đang kiểm tra');
}
test('HUD checks at mount and Reload, and offers update without reloading automatically',async({page})=>{
 await setup(page);
 await expect(page.locator('[data-update-status]')).toContainText('Có bản mới 1.15.1');
 expect(await page.evaluate(()=>updateCalls.map(c=>c.type))).toEqual(['C3D_UPDATE_CHECK']);
 await page.getByRole('button',{name:'Reload',exact:true}).click();
 expect(await page.evaluate(()=>updateCalls.map(c=>c.type))).toEqual(['C3D_UPDATE_CHECK','C3D_UPDATE_CHECK']);
 await page.getByRole('button',{name:'Cập nhật',exact:true}).click();
 expect(await page.evaluate(()=>updateCalls.at(-1))).toEqual({type:'C3D_SAFE_RELOAD',install:true});
});
test('current status takes the safe reload route; host failure exposes setup without fallback refresh',async({page})=>{
 await setup(page,'current');await expect(page.locator('[data-update-status]')).toHaveText('Đã cập nhật');
 await page.getByRole('button',{name:'Reload',exact:true}).click();
 expect(await page.evaluate(()=>updateCalls.at(-1))).toEqual({type:'C3D_SAFE_RELOAD',install:false});
 await page.evaluate(()=>failure='Chưa kết nối updater Windows');
 // A direct local reload is still guarded and never calls window.location.reload as a fallback.
 await page.evaluate(()=>document.querySelector('[data-update-local]').hidden=false);
 await page.getByRole('button',{name:'Reload bản hiện tại',exact:true}).click();
 await expect(page.getByRole('button',{name:'Cài updater',exact:true})).toBeVisible();
 await expect(page.locator('[data-update-status]')).toContainText('Chưa kết nối');
});
test('worker save guard locks the page, verifies clean state, then releases on failure/cancel',async({page})=>{
 await setup(page);
 expect((await page.evaluate(()=>workerMessage('C3D_RELOAD_HOLD'))).ok).toBe(true);
 await expect(page.locator('.c3d-reload-hold')).toBeVisible();
 expect((await page.evaluate(()=>workerMessage('C3D_RELOAD_VERIFY'))).ok).toBe(true);
 await page.evaluate(()=>workerMessage('C3D_RELOAD_RELEASE'));
 await expect(page.locator('.c3d-reload-hold')).toHaveCount(0);
 expect(await page.evaluate(()=>nativeCalls)).toContain('PREPARE_RELOAD');
 expect(await page.evaluate(()=>nativeCalls)).toContain('RELEASE_RELOAD');
});
test('pending server import blocks save-before-reload to protect imported annotations',async({page})=>{
 await setup(page);await page.evaluate(()=>window.importPending=true);
 const response=await page.evaluate(()=>workerMessage('C3D_RELOAD_HOLD'));expect(response.ok).toBe(false);expect(response.error).toContain('import');
 expect(await page.evaluate(()=>nativeCalls.includes('PREPARE_RELOAD'))).toBe(false);
});
