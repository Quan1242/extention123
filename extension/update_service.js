/* Service-worker-only release checks and native updater orchestration. */
(function(root){
'use strict';
const REPO='ManhLD-LDM/CVAT_Tool',HOST='net.vantix.cvat3dtool.updater';
function version(value){if(typeof value!=='string'||!/^v?\d+(?:\.\d+){2,3}$/.test(value))throw new Error('Invalid release version');return value.replace(/^v/,'').split('.').map(Number);}
function compare(a,b){const aa=version(a),bb=version(b);for(let i=0;i<4;i++){const d=(aa[i]||0)-(bb[i]||0);if(d)return Math.sign(d);}return 0;}
function createUpdateService(env){
 const {chrome,fetch}=env;let checking=null,busy=false;
 const installed=()=>chrome.runtime.getManifest().version;
 async function check(){
  if(checking)return checking;
  checking=(async()=>{
   try{
    const response=await fetch('https://api.github.com/repos/'+REPO+'/releases/latest',{credentials:'omit',cache:'no-store',headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(response.status===404?'Repo chưa có release công khai hoặc cần quyền truy cập':'GitHub HTTP '+response.status);
    const release=await response.json();if(release.draft||release.prerelease)throw new Error('Không có release ổn định');
    const latest=version(release.tag_name).join('.'),order=compare(latest,installed());
    const asset=release.assets?.find(a=>a.name==='CVAT-3D-Tool-Extension-'+latest+'.zip');
    if(order>0&&!asset)throw new Error('Release mới chưa có gói extension đúng tên');
    return {state:order>0?'available':order<0?'ahead':'current',latest,current:installed()};
   }catch(error){return {state:'unavailable',current:installed(),error:error.message};}
  })();try{return await checking;}finally{checking=null;}
 }
 async function native(message){
  let result;
  try{result=await (env.native?env.native(message):chrome.runtime.sendNativeMessage(HOST,message));}
  catch(_){throw new Error('Chưa kết nối updater Windows. Mở “Cài updater” để cài một lần.');}
  if(!result?.ok)throw new Error(result?.error||'Updater không trả về kết quả');return result.result;
 }
 async function tabRequest(id,type){const r=await chrome.tabs.sendMessage(id,{type});if(!r?.ok)throw new Error('Tab '+id+': '+(r?.error||'không phản hồi; chưa reload'));return r.result;}
 async function safeReload(install){
  if(busy)throw new Error('Một cập nhật/reload khác đang chạy');busy=true;
  const held=[];let scheduled=false,stage=null;
  try{
   if(install){const release=await check();if(release.state!=='available')throw new Error(release.error||'Không có release mới để cài');
    stage=await native({action:'prepare',currentVersion:installed(),version:release.latest});}
   const tabs=(await chrome.tabs.query({})).filter(t=>/^https?:\/\//.test(t.url||'')&&/\/jobs\/\d+(?:\/|$)/.test(new URL(t.url).pathname));
   if(!tabs.length)throw new Error('Không tìm thấy tab CVAT; chưa reload');
   const states=[];
   for(const tab of tabs){const state=await tabRequest(tab.id,'C3D_RELOAD_STATE');if(!state.connected)throw new Error('Tab '+tab.id+' chưa kết nối CVAT');states.push({tab,state});}
   // Two editors for the same job can overwrite each other's revisions.
   const groups=new Map();for(const item of states){const key=item.state.origin+':'+item.state.jobId,group=groups.get(key)||[];group.push(item);groups.set(key,group);}
   for(const group of groups.values())if(group.length>1&&group.some(i=>i.state.saveState!=='saved'))throw new Error('Cùng job đang mở nhiều tab và còn thay đổi; đóng tab trùng trước khi Reload');
   for(const {tab} of states){held.push(tab.id);await tabRequest(tab.id,'C3D_RELOAD_HOLD');}
   for(const {tab,state} of states){const verified=await tabRequest(tab.id,'C3D_RELOAD_VERIFY');if(verified.jobId!==state.jobId||verified.origin!==state.origin)throw new Error('Tab đã đổi job trong khi lưu');}
   // Recheck the tab set so a newly opened job cannot be silently invalidated.
   const now=(await chrome.tabs.query({})).filter(t=>/^https?:\/\//.test(t.url||'')&&/\/jobs\/\d+(?:\/|$)/.test(new URL(t.url).pathname));
   if(now.length!==tabs.length||now.some(t=>!tabs.some(old=>old.id===t.id&&old.url===t.url)))throw new Error('Danh sách tab CVAT đã đổi; thử lại Reload');
   // runtime.reload invalidates all content scripts; a durable plan restores every saved tab.
   await chrome.storage.local.set({'c3d.reload.plan':{tabs:tabs.map(t=>({id:t.id,url:t.url})),created:Date.now()}});
   if(stage)await native({action:'commit',token:stage.token,currentVersion:installed()});
   scheduled=true;setTimeout(()=>chrome.runtime.reload(),100);return {reloading:true,updated:!!stage};
  }finally{
   if(!scheduled){await chrome.storage.local.remove('c3d.reload.plan').catch(()=>{});for(const id of held)try{await tabRequest(id,'C3D_RELOAD_RELEASE');}catch(_){}}
   busy=false;
  }
 }
 async function resume(){
  const key='c3d.reload.plan',plan=(await chrome.storage.local.get(key))[key];if(!plan)return;
  await chrome.storage.local.remove(key);
  if(!Number.isFinite(plan.created)||Date.now()-plan.created>120000||!Array.isArray(plan.tabs))return;
  for(const tab of plan.tabs)try{if((await chrome.tabs.get(tab.id)).url===tab.url)await chrome.tabs.reload(tab.id);}catch(_){}
 }
 return {check,safeReload,resume};
}
root.__C3D_UPDATES={createUpdateService,compare};
if(typeof module!=='undefined')module.exports={createUpdateService,compare};
})(typeof globalThis!=='undefined'?globalThis:this);
