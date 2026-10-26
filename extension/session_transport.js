/* Isolated content world: same-origin requests retain CVAT's session/CSRF.
 * Runtime-only messages; no API operation or credentials use CustomEvent. */
function createSessionTransport(env) {
 let importSubmitted=false,formats=null;
 const supported3D=item=>item?.enabled!==false&&(item?.dimension==='3d'||(!item?.dimension&&/3d|point.?cloud|kitti raw/i.test(item?.name||'')));
 const context=()=>{
  const s=env.snapshot(),match=new URL(env.url()).pathname.match(/\/jobs\/(\d+)(?:\/|$)/);
  if(!s?.connected||!match||Number(match[1])!==s.jobId)throw new Error('CVAT editor is not ready');
  return s;
 };
 return async request=>{
  const s=context(),origin=new URL(env.url()).origin;
  if(request.origin!==origin||request.jobId!==s.jobId)throw new Error('CVAT job changed');
  const root='/api/jobs/'+s.jobId;
  const mutable=['export','import','native-export'].includes(request.operation);
  if(mutable&&importSubmitted)throw new Error('Import already submitted; reload CVAT before further operations');
  if(mutable&& !['saved','local'].includes(s.saveState))throw new Error('Save CVAT changes before Import/Export');
  let path,method='GET',body;
  switch(request.operation){
   case 'context':return {jobId:s.jobId,saveState:s.saveState,dimension:'3d'};
   case 'user':path='/api/users/self';break;
   case 'formats':path='/api/server/annotation/formats';break;
   case 'status':path='/api/requests/'+encodeURIComponent(request.requestId);break;
   case 'export':
    if(!formats?.exporters.some(f=>f.name===request.format))throw new Error('Load and select a supported 3D export format first');
    path=root+'/dataset/export?'+new URLSearchParams({format:request.format,save_images:'false',location:'local'});method='POST';break;
   case 'native-export':path=root+'/annotations';break;
   case 'import':
    if(request.confirmJob!==s.jobId||!s.capabilities?.edit)throw new Error('Confirm the editable destination job');
    if(!formats?.importers.some(f=>f.name===request.format))throw new Error('Load and select a supported 3D import format first');
    if(!request.file||request.file.bytes.length>8*1024*1024)throw new Error('File exceeds 8 MiB transfer limit');
    body=new FormData();body.append('annotation_file',new Blob([Uint8Array.from(request.file.bytes)]),request.file.name);
    path=root+'/annotations/?'+new URLSearchParams({format:request.format,location:'local',use_default_location:'false'});method='POST';break;
   case 'download':{
    const url=new URL(request.url,origin);
    if(url.origin!==origin||!(url.pathname.startsWith(root+'/dataset/')||url.pathname.startsWith('/api/requests/')))throw new Error('Unsafe download URL');
    path=url.pathname+url.search;break;
   }
   default:throw new Error('Unsupported session operation');
  }
  const csrf=env.cookie().split(';').map(x=>x.trim()).find(x=>x.startsWith('csrftoken='))?.slice(10);
  const headers={Accept:'application/vnd.cvat+json'};if(method!=='GET'&&csrf)headers['X-CSRFToken']=decodeURIComponent(csrf);
  if(request.operation==='import'){importSubmitted=true;env.onImportSubmitted?.();}
  const response=await env.fetch(origin+path,{method,body,headers,credentials:'include',redirect:'error'});
  if(!response.ok)throw new Error(request.operation==='export'&&response.status===403?'CVAT refuses dataset export (403). Ask the owner/admin, or use native JSON export if annotation reading is permitted.':response.status===401||response.status===403?'Session expired, CSRF rejected, or permission denied ('+response.status+')':'CVAT API error '+response.status);
  if(context().jobId!==s.jobId)throw new Error('Job changed; check server Requests before retrying');
  if(request.operation==='download'){
   if(Number(response.headers?.get('content-length'))>8*1024*1024)throw new Error('Download exceeds 8 MiB; use CVAT native export');
   const buffer=await response.arrayBuffer();if(buffer.byteLength>8*1024*1024)throw new Error('Download exceeds 8 MiB; use CVAT native export');
   if(context().jobId!==s.jobId)throw new Error('Job changed; download discarded');
   const bytes=new Uint8Array(buffer);
   if(bytes.length<4||bytes[0]!==80||bytes[1]!==75||![[3,4],[5,6],[7,8]].some(([a,b])=>bytes[2]===a&&bytes[3]===b))throw new Error('CVAT did not return a ZIP archive; no file saved');
   return {bytes:Array.from(bytes)};
  }
  const data=response.status===204?{}:await response.json();
  if(context().jobId!==s.jobId)throw new Error('Job changed; response discarded');
  if(request.operation==='formats'){
   formats={exporters:(data.exporters||[]).filter(supported3D),importers:(data.importers||[]).filter(supported3D)};
   return {...formats,dimension:'3d',preferredExport:formats.exporters.find(f=>f.name==='Datumaro 3D 1.0')?.name||formats.exporters[0]?.name||null};
  }
  if(request.operation==='native-export'){
   if(!['tags','shapes','tracks'].every(key=>Array.isArray(data[key])))throw new Error('Invalid native annotation response; no file saved');
   const result={schema:'cvat-3d-tool-native-annotations/v1',origin,jobId:s.jobId,exportedAt:new Date().toISOString(),source:'saved-server-annotations',labels:s.labels||[],annotations:data};
   if(new TextEncoder().encode(JSON.stringify(result)).length>8*1024*1024)throw new Error('JSON exceeds 8 MiB transfer limit');
   return result;
  }
  return data;
 };
}
if(typeof module!=='undefined')module.exports={createSessionTransport};
if(typeof window!=='undefined')window.__C3D_CREATE_SESSION_TRANSPORT=createSessionTransport;
