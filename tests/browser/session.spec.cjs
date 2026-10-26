const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  window.cookieReads=0;window.apiCalls=[];window.downloads=0;
  window.chrome={downloads:{download:async()=>{window.downloads++;return 1;},search:async()=>[{state:'complete'}]},runtime:{getURL:path=>location.origin+'/extension/'+path,sendMessage:async message=>{
   if(message.type==='C3D_CONTEXT')return {ok:true,result:{tabId:2,origin:'https://app.cvat.ai',jobId:17}};
   window.cookieReads++;return {ok:true,result:{session:{value:'fake-session',httpOnly:true,expires:null},csrf:'fake-csrf'}};
  }},tabs:{reload:async()=>{},sendMessage:async(id,q)=>{
   window.apiCalls.push(q);
   const responses={formats:{exporters:[{name:'Datumaro 3D 1.0',dimension:'3d',enabled:true}],importers:[{name:'CVAT 3D',enabled:true}]},
   user:{username:'test-annotator'},export:{rq_id:'export-test'},import:{rq_id:'import-test'},
   status:{status:'finished',result_url:'https://app.cvat.ai/api/jobs/17/dataset/export?download=true'},
   'native-export':{schema:'cvat-3d-tool-native-annotations/v1',jobId:17,annotations:{tags:[],shapes:[],tracks:[{id:1,shapes:[{frame:0},{frame:7},{frame:14}]}]}},download:{bytes:[80,75,3,4]}};
   return {ok:true,result:responses[q.operation]};
  }}};
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.clipboardText=text},configurable:true});
  URL.createObjectURL=()=> 'blob:test';URL.revokeObjectURL=()=>{};
  HTMLAnchorElement.prototype.click=function(){window.downloads++;};
 });
 await page.goto('http://127.0.0.1:4173/extension/session.html?tab=2');
 await expect(page.locator('#context')).toContainText('Job 17');
});
test('session is read only explicitly, masked, cleared, and never embedded in sample script',async({page})=>{
 expect(await page.evaluate(()=>window.cookieReads)).toBe(0);
 await page.locator('#read').click();
 await expect(page.locator('#session')).toHaveValue('fake-session');
 await expect(page.locator('#session')).toHaveAttribute('type','password');
 await page.locator('#copy-session').click();
 expect(await page.evaluate(()=>window.clipboardText)).toBe('fake-session');
 await page.locator('#script').click();
 const script=await page.evaluate(()=>window.clipboardText);
 expect(script).toContain('CVAT_SESSIONID');expect(script).not.toContain('fake-session');
 await page.locator('#clear').click();
 await expect(page.locator('#session')).toHaveValue('');await expect(page.locator('#csrf')).toHaveValue('');
});
test('export uses runtime-only session transport without reading raw cookies',async({page})=>{
 await page.locator('#formats').click();await page.locator('#export').click();
 await expect.poll(()=>page.evaluate(()=>window.downloads)).toBe(1);
 expect(await page.evaluate(()=>window.cookieReads)).toBe(0);
 expect(await page.evaluate(()=>window.apiCalls.map(c=>c.operation))).toEqual(['formats','export','status','download']);
});
test('import requires confirmation, backs up before upload and offers reload',async({page})=>{
 await page.locator('#formats').click();
 await page.locator('#file').setInputFiles({name:'labels.zip',mimeType:'application/zip',buffer:Buffer.from([80,75,1])});
 await page.locator('#import').click();
 await expect(page.locator('#status')).toContainText('xác nhận');
 expect(await page.evaluate(()=>window.apiCalls.some(q=>q.operation==='import'))).toBe(false);
 await page.locator('#confirm').fill('17');await page.locator('#ack').check();
 page.once('dialog',dialog=>dialog.accept());await page.locator('#import').click();
 await expect(page.locator('#reload')).toBeVisible();
 const operations=await page.evaluate(()=>window.apiCalls.map(q=>q.operation));
 expect(operations).toEqual(['formats','export','status','download','import','status']);
 expect(await page.evaluate(()=>window.cookieReads)).toBe(0);
});

test('cancelled backup download prevents any import upload',async({page})=>{
 await page.evaluate(()=>{chrome.downloads.search=async()=>[{state:'interrupted'}];});
 await page.locator('#formats').click();
 await page.locator('#file').setInputFiles({name:'labels.zip',mimeType:'application/zip',buffer:Buffer.from([1])});
 await page.locator('#confirm').fill('17');await page.locator('#ack').check();
 page.once('dialog',d=>d.accept());await page.locator('#import').click();
 await expect(page.locator('#status')).toContainText('Download bị hủy');
 expect(await page.evaluate(()=>window.apiCalls.some(q=>q.operation==='import'))).toBe(false);
});

test('native JSON export uses annotation-read operation and never requests raw cookies or ZIP export',async({page})=>{
 await page.locator('#export-native').click();
 await expect(page.locator('#status')).toContainText('Đã tải JSON native');
 expect(await page.evaluate(()=>window.apiCalls.map(q=>q.operation))).toEqual(['native-export']);
 expect(await page.evaluate(()=>window.cookieReads)).toBe(0);expect(await page.evaluate(()=>window.downloads)).toBe(1);
});

test('dataset export refusal reports permission error; backup failure never uploads annotations',async({page})=>{
 await page.locator('#formats').click();
 await page.evaluate(()=>{const original=chrome.tabs.sendMessage;chrome.tabs.sendMessage=async(id,q)=>q.operation==='export'?{ok:false,error:'CVAT refuses dataset export (403). Ask the owner/admin.'}:original(id,q);});
 await page.locator('#export').click();await expect(page.locator('#status')).toContainText('403');
 expect(await page.evaluate(()=>window.downloads)).toBe(0);
});

test('bundled Python CLI downloads and generated commands bind server/job without cookie values',async({page})=>{
 await page.locator('#python-download').click();await expect(page.locator('#status')).toContainText('Đã tải cvat_annotations.py');
 expect(await page.evaluate(()=>window.downloads)).toBe(1);
 await page.locator('#script').click();
 let command=await page.evaluate(()=>window.clipboardText);
 expect(command).toContain("--server 'https://app.cvat.ai' --job 17 --prompt-auth export-native");
 expect(command).toContain('CVAT_SESSIONID');expect(command).not.toContain('fake-session');
 await page.locator('#python-restore').click();command=await page.evaluate(()=>window.clipboardText);
 expect(command).toContain('import-native');expect(command).toContain('--confirm-job 17 --editor-closed');expect(command).toContain('CLOSE CVAT editor');
 expect(await page.evaluate(()=>window.apiCalls)).toEqual([]);expect(await page.evaluate(()=>window.cookieReads)).toBe(0);
 await page.screenshot({path:'docs/verification/python-cli-1.12.0.png',fullPage:true});
});
