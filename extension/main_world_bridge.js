/* JSON-only command protocol between extension ISOLATED and MAIN worlds.
 * Page scripts share the MAIN trust boundary. Commands are constrained to the
 * current editor and native permissions; no arbitrary eval/network targets.
 */
(function () {
    'use strict';
    if (window.__CVAT_COPILOT_BRIDGE) window.__CVAT_COPILOT_BRIDGE.dispose();
    const adapter = window.__CVAT_COPILOT_CREATE_ADAPTER();
    const requestEvent = 'c3d:request:v2', responseEvent = 'c3d:response:v2', snapshotEvent = 'c3d:snapshot:v2';
    const inflight = new Set(), completed = new Map();
    let disposed = false;
    const dispatch = (type, data) => window.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(data) }));
    const off = adapter.subscribe(snapshot => dispatch(snapshotEvent, snapshot));
    async function receive(event) {
        if (disposed || typeof event.detail !== 'string' || event.detail.length > 100000000) return;
        let request;
        try { request = JSON.parse(event.detail); } catch (_) { return; }
        if (request?.protocol !== 2 || typeof request.requestId !== 'string' || request.requestId.length > 100 || typeof request.type !== 'string') return;
        if (completed.has(request.requestId)) { dispatch(responseEvent, completed.get(request.requestId)); return; }
        if (inflight.has(request.requestId)) return;
        inflight.add(request.requestId);
        let response;
        try { response = {requestId:request.requestId,ok:true,result:await adapter.command(request.type,request.payload || {})}; }
        catch (error) { response = {requestId:request.requestId,ok:false,error:error.message || 'Lệnh thất bại'}; }
        inflight.delete(request.requestId); if(request.type!=='BATCH_FRAME' && !request.type.includes('_ALL_ANNOTATIONS')) completed.set(request.requestId,response);
        if (completed.size > 150) completed.delete(completed.keys().next().value);
        if (!disposed) dispatch(responseEvent,response);
    }
    function dispose() { disposed=true; window.removeEventListener(requestEvent,receive);off();adapter.dispose(); }
    window.__CVAT_COPILOT_BRIDGE = {adapter,dispose};
    window.addEventListener(requestEvent,receive);adapter.start();
})();
