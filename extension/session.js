'use strict';
const el=id=>document.getElementById(id),tabId=Number(new URL(location.href).searchParams.get('tab'));
let context=null,working=false,generation=0,importComplete=false;
const status=(text,error=false)=>{el('status').textContent=text;el('status').classList.toggle('error',error);};
async function runtime(message){const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error||'Extension unavailable');return r.result;}
async function refresh(){
 const c=await runtime({type:'C3D_CONTEXT',tabId});
 if(context&&(c.origin!==context.origin||c.jobId!==context.jobId))throw new Error('Tab đã đổi server/job. Mở lại chức năng từ job đích.');
 context=c;el('context').textContent=c.origin+' · Job '+c.jobId;
 return c;
}
async function api(operation,payload={}){
 await refresh();
 const r=await chrome.tabs.sendMessage(tabId,{type:'C3D_SESSION_API',...context,operation,...payload});
 if(!r?.ok)throw new Error(r?.error||'Reload extension và tab CVAT rồi thử lại');
 return r.result;
}
function clear(){
 generation++;for(const id of ['session','csrf']){el(id).value='';el(id).type='password';}
 el('expiry').textContent='';
}
async function run(fn){
 if(working)return;working=true;
 document.querySelectorAll('button').forEach(b=>b.disabled=true);
 try{await fn();}catch(e){status(e.message,true);}
 finally{working=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
async function save(bytes,name,type='application/zip'){
 const url=URL.createObjectURL(new Blob([Uint8Array.from(bytes)],{type}));
 try{
  const id=await chrome.downloads.download({url,filename:name,saveAs:true});
  for(let i=0;i<600;i++){
   const [download]=await chrome.downloads.search({id});
   if(download?.state==='complete')return;
   if(!download||download.state==='interrupted')throw new Error('Download bị hủy hoặc thất bại; chưa import.');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('Chưa xác nhận tải dự phòng hoàn tất; chưa import.');
 }finally{URL.revokeObjectURL(url);}
}
async function poll(id){
 if(typeof id!=='string'||!id)throw new Error('Server không trả rq_id; kiểm tra Requests của CVAT.');
 for(let i=0;i<600;i++){
  await new Promise(resolve=>setTimeout(resolve,2000));
  const r=await api('status',{requestId:id});
  status('CVAT: '+r.status+(r.progress!=null?' · '+Math.round(r.progress*100)+'%':''));
  if(r.status==='finished')return r;
  if(['failed','canceled','cancelled'].includes(r.status))throw new Error('CVAT request '+r.status+'; xem Requests để biết chi tiết.');
 }
 throw new Error('Chờ quá 20 phút. Kiểm tra Requests trước khi thử lại; tác vụ server có thể vẫn chạy.');
}
async function exportFile(backup=false){
 const format=el('export-format').value;if(!format)throw new Error('Đọc và chọn định dạng export trước');
 status(backup?'Đang tạo bản dự phòng…':'Đang export…');
 const started=await api('export',{format});
 const ready=await poll(started.rq_id);
 if(!ready.result_url)throw new Error('Server không trả file download; chưa import.');
 const file=await api('download',{url:ready.result_url});
 await save(file.bytes,'cvat-job'+context.jobId+(backup?'-backup-':'-')+Date.now()+'.zip');
 status('Đã tải file. Kiểm tra thư mục Downloads.');
}
el('read').onclick=()=>run(async()=>{
 const current=++generation;await refresh();
 const user=await api('user');
 const data=await runtime({type:'C3D_COOKIES',...context});
 if(generation!==current)return;
 el('session').value=data.session?.value||'';el('csrf').value=data.csrf||'';
 el('expiry').textContent=data.session?(data.session.expires?'Hết hạn: '+new Date(data.session.expires*1000).toLocaleString():'Cookie phiên, không có thời hạn cố định'):'Không có cookie sessionid; hệ thống có thể dùng cơ chế xác thực khác.';
 status('Người dùng: '+(user.username||user.id)+'. Phiên sẽ được xóa khỏi màn hình khi rời tab.');
});
el('clear').onclick=clear;
el('reveal').onclick=()=>{for(const id of ['session','csrf'])el(id).type=el(id).type==='password'?'text':'password';};
for(const [button,input] of [['copy-session','session'],['copy-csrf','csrf']])el(button).onclick=()=>run(async()=>{
 if(!el(input).value)throw new Error('Chưa đọc được giá trị này');
 await navigator.clipboard.writeText(el(input).value);status('Đã copy. Clipboard chứa thông tin xác thực.');
});
el('formats').onclick=()=>run(async()=>{
 const f=await api('formats');
 for(const [id,items] of [['export-format',f.exporters],['import-format',f.importers]]){
  el(id).replaceChildren();
  for(const item of items||[])if(item.enabled!==false){const o=document.createElement('option');o.value=item.name;o.textContent=item.name;el(id).append(o);}
 }
 if(f.preferredExport)el('export-format').value=f.preferredExport;
 status(f.exporters?.length?'Đã đọc định dạng 3D từ server. Datumaro 3D được ưu tiên nếu có.':'Server không cung cấp định dạng 3D; có thể thử JSON native nếu có quyền đọc annotation.');
});
el('export').onclick=()=>run(()=>exportFile());
el('export-native').onclick=()=>run(async()=>{
 status('Đang đọc annotation đã Save từ API…');
 const data=await api('native-export');
 await save(Array.from(new TextEncoder().encode(JSON.stringify(data,null,2))),'cvat-job'+context.jobId+'-native-'+Date.now()+'.json','application/json');
 status('Đã tải JSON native từ editor, gồm số ID hiển thị và chỉnh sửa chưa Save. Dùng Import JSON trên HUD để chọn ID; đây không phải ZIP dataset.');
});
el('import').onclick=()=>run(async()=>{
 await refresh();
 if(importComplete)throw new Error('Nạp lại tab CVAT trước khi tiếp tục.');
 const file=el('file').files[0],format=el('import-format').value;
 if(!file||file.size===0||file.size>8*1024*1024)throw new Error('Chọn file không rỗng, tối đa 8 MiB');
 if(!format||!el('ack').checked||el('confirm').value.trim()!==String(context.jobId))throw new Error('Chọn định dạng, xác nhận tác động và nhập đúng job ID.');
 if(!window.confirm(['IMPORT '+file.name,context.origin,'Job '+context.jobId,'Có thể thay thế annotation đã lưu. Tiếp tục sau khi tạo dự phòng?'].join(String.fromCharCode(10))))return;
 await exportFile(true);
 status('Đang upload '+file.name+'…');
 const bytes=Array.from(new Uint8Array(await file.arrayBuffer()));
 const started=await api('import',{format,confirmJob:context.jobId,file:{name:file.name,bytes}});
 await poll(started.rq_id);importComplete=true;el('reload').hidden=false;
 el('ack').checked=false;el('confirm').value='';
 status('Import hoàn tất trên server. Nạp lại tab CVAT trước khi chỉnh sửa tiếp; không Save dữ liệu editor cũ.');
});
el('reload').onclick=()=>run(async()=>{await refresh();await chrome.tabs.reload(tabId);status('Đã nạp lại tab CVAT.');});
async function pythonCommand(command){
 await refresh();
 if(!Number.isSafeInteger(context.jobId)||context.jobId<1)throw new Error('Invalid job');
 const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
 const prefix='python .\\cvat_annotations.py --server '+quote(context.origin)+' --job '+context.jobId+' --prompt-auth ';
 const format=el('export-format').value||'Datumaro 3D 1.0',importFormat=el('import-format').value||format;
 const actions={
  export:prefix+'export --format '+quote(format)+' --output '+quote('job'+context.jobId+'-annotations.zip'),
  'export-native':prefix+'export-native --output '+quote('job'+context.jobId+'-native.json'),
  import:prefix+'import --format '+quote(importFormat)+' --file '+quote('annotations.zip')+' --confirm-job '+context.jobId+' --editor-closed',
  'import-native':prefix+'import-native --file '+quote('job'+context.jobId+'-native.json')+' --confirm-job '+context.jobId+' --editor-closed'
 };
 const intro='# PowerShell. Python 3.10+. No pip install required.\n# Hidden prompts; alternatively set CVAT_SESSIONID / CVAT_CSRFTOKEN and remove --prompt-auth.\n';
 const warning=command.startsWith('import')?'# REPLACES saved annotations. Save and CLOSE CVAT editor first. Verified native JSON backup required; reload after import.\n':'';
 await navigator.clipboard.writeText(intro+warning+actions[command]);status('Đã copy lệnh Python cho server/job này; không chứa cookie.');
}
el('python-download').onclick=()=>run(async()=>{
 const response=await fetch(chrome.runtime.getURL('cvat_annotations.py'));
 if(!response.ok)throw new Error('Không tải được Python CLI; cập nhật extension rồi thử lại.');
 const bytes=Array.from(new Uint8Array(await response.arrayBuffer()));
 await save(bytes,'cvat_annotations.py','text/x-python');status('Đã tải cvat_annotations.py. Chạy thủ công trong terminal; cookie không được nhúng trong file.');
});
for(const [id,command] of [['python-export','export'],['script','export-native'],['python-import','import'],['python-restore','import-native']])el(id).onclick=()=>run(()=>pythonCommand(command));

document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
window.addEventListener('pagehide',clear);
refresh().then(()=>status('Sẵn sàng. Chưa đọc cookie.')).catch(e=>status(e.message,true));
