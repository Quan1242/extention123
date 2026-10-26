(function(root){
'use strict';
function mount(env){
 let dialog=null,working=false;
 async function open(){
  const preview=await env.request('PREVIEW_ANNOTATION_IMPORT',{jobId:env.jobId,sessionId:env.sessionId,payload:env.data,mode:env.mode});
  dialog=document.createElement('dialog');dialog.className='c3d-import-dialog';dialog.setAttribute('aria-label','Chọn ID import');
  const title=document.createElement('h2');title.textContent=env.mode==='replace'?'Replace annotation theo ID':'Add ID từ file JSON';dialog.append(title);
  const note=document.createElement('p');note.textContent=(env.mode==='replace'?'Replace sửa đúng đối tượng đang có và giữ số ID hiển thị. Toàn bộ keyframe của mỗi ID được chọn sẽ được thay bằng file.':'Add giữ nguyên dữ liệu hiện tại và tạo đối tượng mới. Số ID nguồn chỉ để chọn; CVAT cấp ID mới, không ghi đè ID đang tồn tại.')+' Group thay đổi trong file được tạo lại giữa các ID đã chọn; số group có thể đổi, không ghép vào đối tượng ngoài lựa chọn.';dialog.append(note);
  const scopeLabel=document.createElement('label'),scope=document.createElement('select');scope.setAttribute('aria-label','Phạm vi replace');
  if(env.mode==='replace'){
   for(const [value,text] of [['selected','Chỉ replace ID đã chọn'],['all','Replace toàn bộ job bằng toàn bộ ID trong file']]){const option=document.createElement('option');option.value=value;option.textContent=text;scope.append(option);}
   scopeLabel.append(scope);dialog.append(scopeLabel);
  }
  const filter=document.createElement('input');filter.type='search';filter.placeholder='Tìm số ID hoặc class';filter.setAttribute('aria-label','Tìm ID import');dialog.append(filter);
  const all=document.createElement('button');all.textContent='Chọn tất cả';const none=document.createElement('button');none.textContent='Bỏ chọn';dialog.append(all,none);
  const summary=document.createElement('p');summary.setAttribute('role','status');dialog.append(summary);
  const table=document.createElement('div');table.className='c3d-import-rows';dialog.append(table);
  const selections=new Map();
  const update=()=>{const selected=[...selections.values()].filter(x=>x.check.checked).length;summary.textContent=selected+' / '+preview.rows.length+' ID được chọn · Job '+env.jobId+(env.mode==='replace'&&scope.value==='all'?' · ID hiện tại không có trong file sẽ bị xóa.':'');};
  for(const row of preview.rows){
   const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=env.mode==='append'||row.matched;check.dataset.importKey=row.key;
   const source=row.sourceClientId==null?'không có số hiển thị':'#'+row.sourceClientId;
   const text='Nguồn '+source+' · DB '+(row.sourceServerId??'chưa lưu')+' → '+(env.mode==='append'?'ID mới':row.matched?'CVAT #'+row.targetClientId:'không tìm thấy ID đích')+' · '+row.label+' · '+row.frames+' keyframe';
   label.append(check,document.createTextNode(text));label.dataset.search=text.toLowerCase();table.append(label);selections.set(row.key,{check,label,row});check.onchange=update;
  }
  filter.oninput=()=>{for(const {label} of selections.values())label.hidden=!label.dataset.search.includes(filter.value.toLowerCase());};
  all.onclick=()=>{for(const {check} of selections.values())check.checked=true;update();};none.onclick=()=>{for(const {check} of selections.values())check.checked=false;update();};
  scope.onchange=()=>{if(scope.value==='all')for(const {check} of selections.values())check.checked=true;update();};
  const warning=document.createElement('label'),confirm=document.createElement('input');confirm.type='checkbox';confirm.setAttribute('aria-label','Xác nhận thay đổi annotation');warning.append(confirm,document.createTextNode(' Tôi đã kiểm tra ID/phạm vi ở trên. Áp dụng vào editor; Save CVAT để lưu server.'));dialog.append(warning);
  const apply=document.createElement('button');apply.textContent=env.mode==='replace'?'Áp dụng Replace':'Áp dụng Add';dialog.append(apply);
  const close=document.createElement('button');close.textContent='Đóng';dialog.append(close);
  close.onclick=()=>{if(!working){dialog.remove();dialog=null;}};
  dialog.addEventListener('cancel',event=>{if(working)event.preventDefault();});dialog.addEventListener('keydown',event=>event.stopPropagation());
  apply.onclick=async()=>{
   if(working)return;if(!confirm.checked){summary.textContent='Đánh dấu xác nhận sau khi kiểm tra ID/phạm vi.';return;}
   const keys=[...selections].filter(([,x])=>x.check.checked).map(([key])=>key);
   if(!keys.length){summary.textContent='Chọn ít nhất một ID.';return;}
   working=true;dialog.querySelectorAll('input,button,select').forEach(n=>n.disabled=true);summary.textContent='Đang cập nhật native editor…';
   try{
    const result=await env.request('IMPORT_ALL_ANNOTATIONS',{jobId:env.jobId,sessionId:env.sessionId,token:preview.token,keys,scope:scope.value||'selected'});
    summary.textContent=(result.error?'Dừng: '+result.error+' · ':'')+'Đã sửa #'+result.changed.join(', #')+' · Đã thêm #'+result.added.map(x=>x.clientID).join(', #')+' · Đã xóa #'+result.removed.join(', #')+'. '+result.message;
    env.toast(result.error||'Editor đã cập nhật. Save CVAT để lưu; không cần reload.',!!result.error);apply.hidden=true;
   }catch(error){summary.textContent=error.message;env.toast(error.message,true);apply.hidden=true;}
   finally{working=false;close.disabled=false;}
  };
  document.body.append(dialog);dialog.showModal();update();
 }
 return {open,dispose(){if(!working){dialog?.remove();dialog=null;}}};
}
root.__C3D_ANNOTATION_IO_UI={mount};
})(typeof window!=='undefined'?window:globalThis);
