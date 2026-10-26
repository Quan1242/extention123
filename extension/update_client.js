/* Update controls live in ISOLATED world; no CVAT cookies go to GitHub/host. */
(function(root){
'use strict';
function mount(env){
 const runtime=globalThis.chrome?.runtime;if(!runtime?.id)return {dispose(){}};
 const node=env.root.querySelector('[data-update-status]'),install=env.root.querySelector('[data-update-install]'),local=env.root.querySelector('[data-update-local]'),setup=env.root.querySelector('[data-update-setup]');
 let disposed=false,busy=false,hold=null,releaseTimer=null;
 async function send(type,rest={}){const response=await runtime.sendMessage({type,...rest});if(!response?.ok)throw new Error(response?.error||'Không liên lạc được updater');return response.result;}
 function show(result){
  if(disposed)return;
  const labels={current:'Đã cập nhật',ahead:'Bản trên máy mới hơn release',available:'Có bản mới '+result.latest,unavailable:'Chưa kiểm tra được cập nhật'};
  node.textContent=labels[result.state]||result.message||'Đang kiểm tra cập nhật…';node.dataset.state=result.state||'checking';
  node.title=result.error||('Đang dùng '+runtime.getManifest().version+' · '+(result.latest?'GitHub '+result.latest:'GitHub Releases'));
  install.hidden=result.state!=='available';local.hidden=!['available','unavailable'].includes(result.state);
 }
 async function check(){show({message:'Đang kiểm tra cập nhật…'});const result=await send('C3D_UPDATE_CHECK');show(result);return result;}
 async function run(installUpdate=false){
  if(busy)return;busy=true;
  try{
   node.textContent=installUpdate?'Đang tải/kiểm tra bản cập nhật…':'Đang lưu CVAT để reload…';
   await env.flush();await send('C3D_SAFE_RELOAD',{install:installUpdate});
  }catch(error){node.textContent=error.message;node.dataset.state='unavailable';setup.hidden=false;local.hidden=false;env.toast(error.message,true);}
  finally{busy=false;}
 }
 async function reload(){
  if(busy)return;busy=true;
  try{const result=await check();if(result.state==='available')env.toast('Có bản '+result.latest+'. Nhấn Cập nhật để cài; CVAT sẽ được lưu trước khi reload.');
   else if(result.state==='current'||result.state==='ahead'){busy=false;await run(false);}}
  catch(error){show({state:'unavailable',error:error.message});}
  finally{busy=false;}
 }
 async function release(){
  clearTimeout(releaseTimer);hold?.remove();hold=null;
  try{await env.request('RELEASE_RELOAD');}catch(_){}
 }
 async function guard(){
  if(env.importPending?.())throw new Error('Đã gửi import: dùng Nạp lại tab trên màn hình import; không tự Save editor cũ');
  const snap=await env.request('GET_SNAPSHOT');
  if(!snap.connected)throw new Error('Tab CVAT chưa kết nối; chưa thể lưu an toàn');
  if(document.querySelector('dialog[open],[role="dialog"]'))throw new Error('Đóng cửa sổ chỉnh sửa/Batch trước khi Reload');
  hold=document.createElement('dialog');hold.className='c3d-reload-hold';hold.textContent='Đang lưu CVAT và chuẩn bị reload. Vui lòng chờ…';
  hold.addEventListener('cancel',event=>event.preventDefault());hold.addEventListener('keydown',event=>event.stopPropagation());document.body.append(hold);hold.showModal();
  // A lost worker/connection must not leave the editor locked indefinitely.
  releaseTimer=setTimeout(release,240000);
  try{await env.flush();return await env.request('PREPARE_RELOAD',{jobId:snap.jobId,sessionId:snap.sessionId});}
  catch(error){await release();throw error;}
 }
 function listener(message,sender,reply){
  if(sender.id!==runtime.id||!['C3D_RELOAD_STATE','C3D_RELOAD_HOLD','C3D_RELOAD_VERIFY','C3D_RELOAD_RELEASE'].includes(message?.type))return;
  (async()=>{
   if(message.type==='C3D_RELOAD_RELEASE'){await release();return {};}
   if(message.type==='C3D_RELOAD_HOLD')return guard();
   const s=await env.request('GET_SNAPSHOT');
   if(message.type==='C3D_RELOAD_VERIFY'&&(!hold||!s.connected||s.saveState!=='saved'))throw new Error('Tab chưa được khóa/lưu; không reload');
   return {connected:s.connected,jobId:s.jobId,saveState:s.saveState,origin:location.origin};
  })().then(result=>reply({ok:true,result}),error=>reply({ok:false,error:error.message}));return true;
 }
 setup.hidden=false;
 install.onclick=()=>run(true);local.onclick=()=>run(false);setup.onclick=()=>send('C3D_UPDATER_SETUP').catch(error=>env.toast(error.message,true));
 runtime.onMessage.addListener(listener);check().catch(error=>show({state:'unavailable',error:error.message}));
 return {reload,isHolding:()=>!!hold,dispose(){disposed=true;runtime.onMessage.removeListener(listener);release();}};
}
root.__C3D_UPDATE_CLIENT={mount};
})(typeof window!=='undefined'?window:globalThis);
