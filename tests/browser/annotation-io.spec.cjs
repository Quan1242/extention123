const {test,expect}=require('@playwright/test');
async function setup(page,mode='replace'){
 await page.setContent('<html><body></body></html>');await page.addStyleTag({path:'extension/styles.css'});
 await page.evaluate(()=>{window.requests=[];window.changed=false;window.preview={token:'import-fixture',rows:[
  {key:'tracks:0',sourceClientId:38,sourceServerId:48950,targetClientId:38,matched:true,label:'pedestrian',frames:60},
  {key:'tracks:1',sourceClientId:63,sourceServerId:48975,targetClientId:63,matched:true,label:'pedestrian',frames:60},
  {key:'tracks:2',sourceClientId:79,sourceServerId:72716,targetClientId:79,matched:true,label:'vehicles',frames:3}]};});
 await page.addScriptTag({path:'extension/annotation_io_ui.js'});
 await page.evaluate(async mode=>{
  window.ui=__C3D_ANNOTATION_IO_UI.mount({jobId:1224,sessionId:'fixture',mode,data:{tracks:[]},toast:()=>{},request:async(type,payload)=>{
   requests.push({type,payload});if(type==='PREVIEW_ANNOTATION_IMPORT')return preview;changed=true;return {changed:mode==='replace'?[38,63]:[],added:mode==='append'?[{clientID:80}]:[],removed:[],message:'Editor updated; Save CVAT to persist.'};}});await ui.open();
 },mode);
}
test('Replace selection applies exactly chosen #38 and #63 after explicit confirmation, with no page reload',async({page})=>{
 await setup(page);await expect(page.getByRole('dialog',{name:'Chọn ID import'})).toContainText('CVAT #38');
 await page.locator('[data-import-key="tracks:2"]').uncheck();
 await page.getByRole('button',{name:'Áp dụng Replace',exact:true}).click();expect(await page.evaluate(()=>changed)).toBe(false);
 await expect(page.getByRole('status')).toContainText('Đánh dấu xác nhận');
 await page.getByRole('checkbox',{name:'Xác nhận thay đổi annotation'}).check();await page.getByRole('button',{name:'Áp dụng Replace',exact:true}).click();
 expect(await page.evaluate(()=>requests.at(-1).payload)).toEqual({jobId:1224,sessionId:'fixture',token:'import-fixture',keys:['tracks:0','tracks:1'],scope:'selected'});
 await expect(page.getByRole('status')).toContainText('Đã sửa #38, #63');expect(await page.evaluate(()=>changed)).toBe(true);
});
test('Replace entire job selects every file ID and clearly warns about omitted IDs',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Bỏ chọn',exact:true}).click();
 await page.getByRole('combobox',{name:'Phạm vi replace'}).selectOption('all');
 await expect(page.getByRole('status')).toContainText('3 / 3');await expect(page.getByRole('status')).toContainText('sẽ bị xóa');
 await page.getByRole('checkbox',{name:'Xác nhận thay đổi annotation'}).check();await page.getByRole('button',{name:'Áp dụng Replace',exact:true}).click();
 expect(await page.evaluate(()=>requests.at(-1).payload.scope)).toBe('all');
});
test('Add exposes checkboxes per source ID, allows one object, and reports newly allocated ID',async({page})=>{
 await setup(page,'append');await expect(page.getByRole('dialog')).toContainText('CVAT cấp ID mới');
 await expect(page.getByRole('combobox')).toHaveCount(0);await page.getByRole('button',{name:'Bỏ chọn',exact:true}).click();
 await page.locator('[data-import-key="tracks:1"]').check();await page.getByRole('checkbox',{name:'Xác nhận thay đổi annotation'}).check();
 await page.getByRole('button',{name:'Áp dụng Add',exact:true}).click();
 expect(await page.evaluate(()=>requests.at(-1).payload.keys)).toEqual(['tracks:1']);await expect(page.getByRole('status')).toContainText('Đã thêm #80');
});
test('filtering ID list preserves selections and closing preview makes no edits',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Bỏ chọn',exact:true}).click();
 await page.locator('[data-import-key="tracks:1"]').check();await page.getByRole('searchbox',{name:'Tìm ID import'}).fill('vehicles');
 await expect(page.locator('[data-import-key="tracks:1"]')).not.toBeVisible();await expect(page.getByRole('status')).toContainText('1 / 3');
 await page.getByRole('button',{name:'Đóng',exact:true}).click();expect(await page.evaluate(()=>changed)).toBe(false);
});
