/* Isolated-world HUD. Reads unsaved CVAT editor snapshots via the bridge.
 * No credentials, cached-job fallback or direct annotation REST writes.
 */
(function () {
    'use strict';
    window.__CVAT_COPILOT_PANEL?.dispose();
    const pending = new Map();
    const shortcuts=window.__C3D_SHORTCUTS,settingsKey='c3d.settings.v1';
    let settings=shortcuts.defaults(),settingsReady=false,recording=null,settingsPanel=null;
    let saveQueue=Promise.resolve();
    let followSyncKey='';
    let backgroundSyncKey='';
    function syncBackground(){
        if(!settingsReady||!snapshot?.connected||!settings.backgroundColor)return;
        const key=`${snapshot.sessionId}:${settings.backgroundColor}`;
        if(backgroundSyncKey===key)return;
        backgroundSyncKey=key;
        request('SET_BACKGROUND',{color:settings.backgroundColor}).catch(error=>{backgroundSyncKey='';status(error.message);});
    }
    async function chooseBackground(color){
        try{
            await request('SET_BACKGROUND',{color});
            settings.backgroundColor=color;saveSettings();backgroundSyncKey='';syncBackground();
            el('c3d-background-color').value=color||'#111827';
            toast(color?'3D background saved':'CVAT background restored');
        }catch(error){toast(error.message,true);}
    }
    function syncFollowCamera(){
        if(!settingsReady||!snapshot?.connected||!snapshot.capabilities?.followCamera)return;
        const key=`${snapshot.sessionId}:${settings.followSelected}`;
        if(followSyncKey===key||!!snapshot.followCameraEnabled===settings.followSelected)return;
        followSyncKey=key;
        request('FOLLOW_CAMERA',{enabled:settings.followSelected}).catch(error=>toast(error.message,true));
    }
    async function loadSettings(){
        try{
            const stored=globalThis.chrome?.storage?.local ? (await chrome.storage.local.get(settingsKey))[settingsKey] : JSON.parse(localStorage.getItem(settingsKey)||'null');
            settings=shortcuts.normalize(stored);
        }catch(error){console.warn('[CVAT 3D TOOL] Settings unavailable:',error.message);}
        settingsReady=true;refreshShortcutHints();renderInspector();syncFollowCamera();syncBackground();
        if(el('c3d-background-color'))el('c3d-background-color').value=settings.backgroundColor||'#111827';
    }
    function saveSettings(){
        const value=JSON.parse(JSON.stringify(settings));
        saveQueue=saveQueue.then(async()=>{
            if(globalThis.chrome?.storage?.local)await chrome.storage.local.set({[settingsKey]:value});
            else localStorage.setItem(settingsKey,JSON.stringify(value));
        }).catch(error=>toast('Could not save settings: '+error.message,true));
        refreshShortcutHints();
    }
    function refreshShortcutHints(){
        if(!root)return;
        for(const d of shortcuts.definitions){
            const node=el(d.button);if(!node)continue;
            const hint=shortcuts.format(settings.bindings[d.id]);
            node.title=d.id==='MOVE_TO_MOUSE'&&!snapshot?.capabilities?.moveToMouse?'Move to mouse unavailable: top-view camera or canvas API missing':`${d.label} · ${hint}`;
            if(d.id==='AUTO_ADJUST')node.title+=` · Shrink toward nearby supported faces within ${+(settings.maxShrinkDistance*100).toFixed(2)} cm or ${settings.maxShrinkPercent}% of the dimension, whichever is smaller`;
            const kbd=node.querySelector('kbd');if(kbd)kbd.textContent=hint;
        }
        if(el('c3d-keep-direction')){el('c3d-keep-direction').checked=settings.keepDirection;el('c3d-keep-direction').disabled=!settingsReady||busy;}
        if(el('c3d-adjust-direction')){el('c3d-adjust-direction').checked=settings.adjustMoveDirection;el('c3d-adjust-direction').disabled=!settingsReady||busy;}
        if(el('c3d-follow-selected')){
            const input=el('c3d-follow-selected');input.checked=settings.followSelected;input.disabled=!settingsReady||!snapshot?.capabilities?.followCamera;
            input.parentElement.title=snapshot?.capabilities?.followCamera?'Follow the last selected track between frames; preserve orbit angle and zoom. Pauses when the track is absent or hidden.':'Follow unavailable: perspective camera or orbit controls missing';
            text('c3d-follow-status',settings.followSelected?(snapshot?.followCameraStatus||'Waiting for camera'):'');
        }
        for(const [id,key] of [['c3d-origin-ground','useOriginGround'],['c3d-ground-height','fallbackGroundHeight'],['c3d-move-longitudinal','moveLongitudinal'],['c3d-move-lateral','moveLateral']]){
            const input=el(id);if(!input)continue;
            if(input.type==='checkbox')input.checked=settings[key];else if(document.activeElement!==input)input.value=String(settings[key]);
            input.disabled=!settingsReady||busy;
        }
        if(el('c3d-btn-settings'))el('c3d-btn-settings').disabled=!settingsReady;
    }
    function closeSettings(){recording=null;settingsPanel?.remove();settingsPanel=null;el('c3d-btn-settings')?.focus();}
    function openSettings(){
        if(settingsPanel||!settingsReady)return;
        settingsPanel=document.createElement('div');settingsPanel.className='c3d-shortcut-settings';settingsPanel.setAttribute('role','dialog');settingsPanel.setAttribute('aria-label','Keyboard shortcuts');
        const shrinkHeading=document.createElement('strong');shrinkHeading.textContent='Auto Adjust Box — shrink limits';
        const shrinkNote=document.createElement('p');shrinkNote.textContent='Use the smaller of these limits per face. Only nearby supported points permit shrinking. Zero disables shrinking; expansion and ground contact remain active.';
        const shrinkFields=document.createElement('div');
        const inputs={};
        for(const [key,label,max,scale] of [['maxShrinkDistance','Maximum shrink distance (cm)',40,100],['maxShrinkPercent','Maximum shrink (%)',50,1]]){
            const row=document.createElement('label');row.className='c3d-shrink-field';row.textContent=label;
            const input=document.createElement('input');input.type='number';input.min='0';input.max=String(max);input.step='any';input.value=String(+(settings[key]*scale).toFixed(4));input.setAttribute('aria-label',label);inputs[key]=input;
            input.onchange=()=>{
                if(!input.value.trim()||!input.checkValidity()){input.setAttribute('aria-invalid','true');message.textContent=`Enter a value from 0 to ${max}`;return;}
                input.removeAttribute('aria-invalid');settings[key]=input.valueAsNumber/scale;saveSettings();message.textContent='Shrink limits saved';
            };
            row.append(input);shrinkFields.append(row);
        }
        const resetShrink=document.createElement('button');resetShrink.className='c3d-btn-secondary';resetShrink.textContent='Reset shrink limits';resetShrink.onclick=()=>{const defaults=shortcuts.defaults();for(const key of Object.keys(inputs)){settings[key]=defaults[key];inputs[key].value=String(defaults[key]*(key==='maxShrinkDistance'?100:1));inputs[key].removeAttribute('aria-invalid');}saveSettings();message.textContent='Shrink defaults restored';};
        const heading=document.createElement('strong');heading.textContent='Keyboard shortcuts';
        const note=document.createElement('p');note.textContent='Click a shortcut, then press a key combination. Escape cancels recording. Browser-reserved keys may be unavailable; CVAT shortcuts may conflict.';
        const list=document.createElement('div');
        const message=document.createElement('p');message.setAttribute('role','status');message.id='c3d-shortcut-message';
        function render(){
            list.replaceChildren();
            for(const d of shortcuts.definitions){
                const row=document.createElement('div');row.className='c3d-shortcut-row';
                const label=document.createElement('span');label.textContent=d.label;
                const record=document.createElement('button');record.className='c3d-btn-mini';record.dataset.action=d.id;record.setAttribute('aria-label',`Record ${d.label} shortcut`);record.textContent=recording===d.id?'Press keys…':shortcuts.format(settings.bindings[d.id]);
                record.onclick=()=>{recording=d.id;message.textContent='Press a key combination; Escape cancels.';render();list.querySelector(`[data-action="${d.id}"]`)?.focus();};
                const clear=document.createElement('button');clear.className='c3d-btn-mini';clear.textContent='Clear';clear.setAttribute('aria-label',`Clear ${d.label} shortcut`);
                const reset=document.createElement('button');reset.className='c3d-btn-mini';reset.textContent='Reset';reset.setAttribute('aria-label',`Reset ${d.label} shortcut`);
                function set(value){try{shortcuts.assign(settings,d.id,value);recording=null;saveSettings();message.textContent='Saved';render();}catch(error){message.textContent=error.message;}}
                clear.onclick=()=>set(null);reset.onclick=()=>set(d.binding);
                row.append(label,record,clear,reset);list.append(row);
            }
        }
        const resetAll=document.createElement('button');resetAll.className='c3d-btn-secondary';resetAll.textContent='Reset all shortcuts';resetAll.onclick=()=>{settings.bindings=shortcuts.defaults().bindings;recording=null;saveSettings();message.textContent='Defaults restored';render();};
        const close=document.createElement('button');close.className='c3d-btn-secondary';close.textContent='Close';close.onclick=closeSettings;
        settingsPanel.addEventListener('keydown',event=>{
            if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(recording){recording=null;message.textContent='Recording cancelled';render();}else closeSettings();return;}
            if(!recording)return;
            event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
            const value=shortcuts.fromEvent(event);
            if(!value){message.textContent='Press a supported key, with optional modifiers';return;}
            try{shortcuts.assign(settings,recording,value);recording=null;saveSettings();message.textContent='Saved';render();}catch(error){message.textContent=error.message;}
        },true);
        settingsPanel.append(shrinkHeading,shrinkNote,shrinkFields,resetShrink,heading,note,list,message,resetAll,close);root.append(settingsPanel);render();close.focus();settingsPanel.scrollTop=0;
    }
    function geometry(required=true) {
        const api=window.__CVAT_COPILOT_MATH;
        if(api && ['makePlane','parseCVAT16Points','auditFrame'].every(name=>typeof api[name]==='function'))return api;
        if(required)throw new Error('Geometry library not loaded. Reload extension and refresh CVAT tab.');
        return null;
    }
    let batchUI=null,updateUI=null,importUI=null,serverImportPending=false;
    let root = null, snapshot = null, issues = [], grounds = {}, busy = false, disposed = false;
    let autoQc = true, qcColors = true, filter = 'ALL', selectedIssue = null, lastRevisionKey = '', seq = 0;
    let qcTimer = null, toastTimer = null, groundRun = 0, routeTimer = null, manualQcRunning = false;
    const el = id => root?.querySelector('#' + id);
    const text = (id, value) => { const node=el(id); if(node) node.textContent=value; };
    const scopeKey = s => s ? `${s.sessionId}:${s.jobId}:${s.frame}` : '';
    function request(type, payload = {}) {
        if(serverImportPending&&['EXPORT_ALL_ANNOTATIONS','PREVIEW_ANNOTATION_IMPORT','IMPORT_ALL_ANNOTATIONS'].includes(type))return Promise.reject(new Error('Đã gửi import server; nạp lại kết quả trước khi dùng editor JSON'));
        return new Promise((resolve,reject) => {
            const requestId=`hud-${Date.now()}-${++seq}-${Math.random().toString(36).slice(2,7)}`;
            const isLong = type.startsWith('BATCH_') || type.includes('_ALL_ANNOTATIONS') || type==='PREPARE_RELOAD';
            const timeout = setTimeout(()=>{
                pending.delete(requestId);
                reject(new Error(isLong ? 'Thao tác quá thời gian chờ (180s) từ server CVAT' : 'CVAT did not respond; check bridge connection'));
            }, isLong ? 180000 : 20000);
            pending.set(requestId,{resolve,reject,timeout});
            window.dispatchEvent(new CustomEvent('c3d:request:v2',{detail:JSON.stringify({protocol:2,requestId,type,payload})}));
        });
    }
    function receive(event) {
        if(typeof event.detail!=='string') return;
        let response; try {response=JSON.parse(event.detail);} catch(_){return;}
        const waiter=pending.get(response.requestId);if(!waiter)return;
        pending.delete(response.requestId);clearTimeout(waiter.timeout);
        if(response.ok)waiter.resolve(response.result);else waiter.reject(new Error(response.error || 'Operation failed'));
    }
    function receiveSnapshot(event) {
        if(typeof event.detail!=='string') return;
        try {acceptSnapshot(JSON.parse(event.detail));} catch(error){console.warn('[CVAT 3D TOOL] snapshot:',error.message);}
    }
    function reference(id = snapshot?.activeBoxId) {
        if(!snapshot?.connected || id == null)throw new Error('Select a box in CVAT or list first');
        return {sessionId:snapshot.sessionId,jobId:snapshot.jobId,frame:snapshot.frame,revision:snapshot.revision,clientId:Number(id)};
    }
    function toast(message,error=false) {
        text('c3d-toast',message);const node=el('c3d-toast');if(!node)return;
        node.dataset.error=String(error);node.style.display='block';clearTimeout(toastTimer);
        toastTimer=setTimeout(()=>{node.style.display='none';},5000);
    }
    function status(message) {text('c3d-status-msg',message);}
    async function action(type,payload={}) {
        if(busy||!settingsReady)return;
        // Capture settings and reference before asynchronous work begins.
        if(type==='AUTO_FIT'){
            const box=snapshot?.boxes.find(b=>b.id===snapshot.activeBoxId),preset=box&&geometry().resolveFitPreset(box.label_name,box.subType,settings.presetOverrides);
            if(!preset?.dimensions){toast('Set and save L/W/H preset for this class/subtype first',true);return;}
            payload={...payload,keepDirection:settings.keepDirection,presetDimensions:preset.dimensions};
        }
        if(type==='AUTO_ADJUST')payload={...payload,maxShrinkDistance:settings.maxShrinkDistance,maxShrinkPercent:settings.maxShrinkPercent};
        if(['SNAP_GROUND','MOVE_TO_MOUSE','AUTO_ADJUST','AUTO_FIT'].includes(type))payload={...payload,useOriginGround:settings.useOriginGround,fallbackGroundHeight:settings.fallbackGroundHeight};
        if(type==='MOVE_TO_MOUSE')payload={...payload,adjustDirection:settings.adjustMoveDirection,moveLongitudinal:settings.moveLongitudinal,moveLateral:settings.moveLateral};
        let ref;try{if(type!=='FREECAM')ref=reference();}catch(error){toast(error.message,true);return;}
        busy=true;renderInspector();status('Processing…');
        try {
            if(type==='AUTO_FIT'){toast(payload.keepDirection?'Auto-Fitting: keeping direction…':'Auto-Fitting: applying fixed preset, aligning position/direction and checking ground…');await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));}
            const result=await request(type,type==='FREECAM'?payload:{ref,...payload});
            if(type==='AUTO_FIT'){
                const timing=Number.isFinite(result.elapsedMs)?` · ${(result.elapsedMs/1000).toFixed(2)}s`:'';
                toast((result.previousFrame?result.message:`Auto-Fit updated${payload.keepDirection?' · direction preserved':''}${result.preset?' · '+result.preset.dimensions.join(' × ')+' m · grounded':''}${result.warning?' · '+result.warning:''} · review box and Save CVAT`)+timing);
                if(result.timingsMs)console.info('[CVAT 3D TOOL] Auto-Fit timings (ms)',result.timingsMs);
            }
            else if(type==='MOVE_TO_MOUSE')toast(result.previousFrame?result.message:`${result.refined?'Box centered on nearby object':'Moved to mouse; center not refined'}${result.directionAdjusted?` · direction aligned (${result.directionDeltaDegrees>=0?'+':''}${result.directionDeltaDegrees.toFixed(1)}°)`:payload.adjustDirection?' · direction unchanged':''}${Object.values(result.alignment||{}).some(v=>v!=='none')?' · face aligned: '+Object.values(result.alignment).filter(v=>v!=='none').join(' + '):''}${result.groundSource==='coordinate-origin'?' · origin ground Z '+payload.fallbackGroundHeight.toFixed(2)+'m':result.groundSource?' · snapped to ground':''}${result.warning?' · '+result.warning:''} · Save CVAT`);
            else if(type==='AUTO_ADJUST')toast(result.previousFrame?result.message:result.unchanged?`Auto Adjust: no supported local correction${result.warning?' · '+result.warning:''}`:`Auto Adjust updated sides/top · direction preserved · bottom on ${result.groundSource==='coordinate-origin'?'origin ground':'local road'}${result.warning?' · '+result.warning:''} · review box and Save CVAT`);
            else if(type==='RESIZE_TRACK')toast(`Size ${result.dimensions.map(value=>value.toFixed(2)).join(' × ')}m applied to ${result.applied} keyframes · position and direction preserved · Save CVAT`);
            else if(type==='ROTATE'||type==='SNAP_GROUND'||type==='SET_LABEL') {
                toast(result.previousFrame ? result.message : type==='SNAP_GROUND' ? `Box snapped to ${result.groundSource==='coordinate-origin'?'coordinate origin + offset':'ground'} · ΔZ ${result.deltaZ.toFixed(2)}m · save via Save CVAT` : 'Editor updated · save via Save CVAT');
            } else if(type==='FREECAM')toast(result.enabled?'Free Cam: WASD/QE · Shift fast · right-click drag to look · Esc exit':'Returned camera control to CVAT');
            acceptSnapshot(await request('GET_SNAPSHOT'));
            status('Ready');
        } catch(error) {status('Operation incomplete');toast(error.message,true);}
        finally {busy=false;renderInspector();}
    }
    async function selectBox(id,focus=false,issueId=null) {
        selectedIssue=issueId;
        if(issueId){filter='ALL';if(el('c3d-filter'))el('c3d-filter').value='ALL';}
        try {const result=await request('SELECT_OBJECT',{ref:reference(id),focus});acceptSnapshot(await request('GET_SNAPSHOT'));if(focus&&result.focused===false)toast(result.message||'Box selected; camera does not support Focus',true);}
        catch(error){toast(error.message,true);renderInspector();}
    }
    function acceptSnapshot(next) {
        if(!next || !Array.isArray(next.boxes) || !Array.isArray(next.labels))return;
        const previousScope=scopeKey(snapshot), nextScope=scopeKey(next);
        if(previousScope!==nextScope) {grounds={};issues=[];selectedIssue=null;groundRun++;lastRevisionKey='';}
        snapshot=next;
        syncBackground();
        syncFollowCamera();
        if(!root && shouldShow())createHUD();
        if(!root)return;
        renderInspector();
        renderIssues();
        const key=`${nextScope}:${next.revision}`;
        if(key!==lastRevisionKey) {
            lastRevisionKey=key;
            if(autoQc && !manualQcRunning) {clearTimeout(qcTimer);qcTimer=setTimeout(()=>runQC(true),140);}
        }
    }
    function createHUD() {
        if(root)return;
        root=document.createElement('section');root.id='cvat-3d-copilot-root';root.setAttribute('aria-label','CVAT 3D TOOL');
        root.innerHTML=`
            <header class="c3d-header"><div class="c3d-header-brand"><svg class="c3d-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2 21 7v10l-9 5-9-5V7l9-5Zm0 10v10m0-10 9-5m-9 5L3 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="m12 2 9 5-9 5-9-5 9-5Z" fill="currentColor" opacity=".18"/></svg><span class="c3d-title">CVAT 3D TOOL</span><span id="c3d-badge-conn" class="c3d-badge-status">Connecting</span><button id="c3d-btn-reload" class="c3d-btn-reload" title="Kiểm tra bản mới, lưu CVAT rồi reload" aria-label="Reload extension">🔄 Reload</button></div><button id="c3d-btn-toggle" class="c3d-btn-icon" aria-label="Toggle panel">−</button></header>
            <div class="c3d-update-row"><span data-update-status role="status">Cập nhật: chỉ có trong extension</span><button data-update-install hidden>Cập nhật</button><button data-update-local hidden>Reload bản hiện tại</button><button data-update-setup hidden>Cài updater</button></div>
            <div id="c3d-content-body">
                <div class="c3d-context"><span id="c3d-context-label">Waiting for editor</span><span id="c3d-save-state">Unknown save state</span></div>
                <div class="c3d-action-grid"><button id="c3d-batch" class="c3d-btn-secondary">Batch Track Review</button><button id="c3d-session" class="c3d-btn-secondary">Phiên CVAT & Import/Export</button></div>
                <div style="margin-top:4px;">
                    <button id="c3d-btn-export-ann" class="c3d-btn-secondary" style="width:100%;margin-bottom:4px;" title="Export toàn bộ annotations 3D của tất cả frame trong Job này ra file JSON">⬇ Export Toàn Bộ Job (.json)</button>
                    <button id="c3d-btn-cuboid-stats" class="c3d-btn-secondary" style="width:100%;" title="Đếm cuboid theo clientID trên toàn bộ Job, bao gồm keyframe outside">Thống kê cuboid theo ID</button>
                    <div id="c3d-cuboid-stats" class="c3d-cuboid-stats" role="status" aria-live="polite" hidden></div>
                </div>
                <div class="c3d-action-grid" style="margin-top:2px;">
                    <button id="c3d-btn-import-replace" class="c3d-btn-secondary" title="Xóa annotations cũ và thay thế toàn bộ bằng file JSON mới">🔄 Import (Ghi Đè / Replace)</button>
                    <button id="c3d-btn-import-append" class="c3d-btn-secondary" title="Giữ nguyên annotations hiện có và nạp thêm các tracks mới từ file JSON">➕ Import (Thêm Vào / Append)</button>
                </div>
                <input type="file" id="c3d-file-import" accept=".json" style="display:none" />
                <div class="c3d-metrics-bar"><div class="c3d-metric-item"><span class="c3d-metric-label">BOXES</span><strong id="c3d-val-count">0</strong></div><div class="c3d-metric-item"><span class="c3d-metric-label">AFFECTED</span><strong id="c3d-val-affected">0</strong></div><div class="c3d-metric-item"><span class="c3d-metric-label">ISSUES</span><strong id="c3d-val-issues">0</strong></div></div>
                <div class="c3d-toolbar"><button id="c3d-btn-scan" class="c3d-btn-primary">RUN QC NOW <kbd>Alt Shift L</kbd></button><div class="c3d-toggles"><label><input id="c3d-auto" type="checkbox" checked> Auto QC</label><label><input id="c3d-colors" type="checkbox" checked> 3D Error Colors</label></div>
                    <div class="c3d-action-grid"><button id="c3d-btn-ground" class="c3d-btn-secondary" title="Alt+Shift+G · Chỉ snap box đang chọn ở frame hiện tại">Snap box sát mặt đường</button><button id="c3d-btn-freecam" class="c3d-btn-secondary" title="Alt+Shift+C">Free Cam</button></div>
                    <div class="c3d-fit-row"><button id="c3d-btn-autofit" class="c3d-btn-primary">AUTO-FIT BOX <kbd></kbd></button><label><input id="c3d-keep-direction" type="checkbox"> Keep direction</label></div>
                    <fieldset class="c3d-preset"><legend>Auto-Fit preset (metres)</legend><div id="c3d-preset-summary">Select a box</div><div class="c3d-preset-fields"><label>L <input id="c3d-preset-l" aria-label="Preset length" type="number" min="0.1" max="30" step="0.05"></label><label>W <input id="c3d-preset-w" aria-label="Preset width" type="number" min="0.1" max="8" step="0.05"></label><label>H <input id="c3d-preset-h" aria-label="Preset height" type="number" min="0.1" max="8" step="0.05"></label></div><div class="c3d-action-grid"><button id="c3d-preset-save" class="c3d-btn-mini">Save preset</button><button id="c3d-preset-reset" class="c3d-btn-mini">Reset preset</button></div></fieldset>
                    <button id="c3d-btn-adjust" class="c3d-btn-secondary">Auto Adjust Box <kbd></kbd></button>
                    <div class="c3d-fit-row c3d-placement-options"><label title="Unchecked: use surrounding road, including below Z = 0. Checked: use the coordinate origin plus offset."><input id="c3d-origin-ground" type="checkbox"> Use origin ground (Z = 0 + offset)</label></div>
                    <div class="c3d-fit-row c3d-placement-options"><label>Origin ground offset (m) <input id="c3d-ground-height" type="number" step="any" value="0" style="width:80px" title="Signed road elevation in Z relative to the origin"></label></div>
                    <div class="c3d-fit-row"><button id="c3d-btn-move" class="c3d-btn-secondary">Move to mouse <kbd></kbd></button><label title="Align the longest box axis with the object's longest axis; maximum 30° correction; size stays unchanged"><input id="c3d-adjust-direction" type="checkbox"> Adjust direction</label></div>
                    <div class="c3d-fit-row c3d-placement-options"><label>Longitudinal <select id="c3d-move-longitudinal"><option value="none">None</option><option value="forward">Push forward</option><option value="backward">Push backward</option></select></label><label>Lateral <select id="c3d-move-lateral"><option value="none">None</option><option value="left">Push left</option><option value="right">Push right</option></select></label></div>
                    <div class="c3d-fit-row"><label>Nền 3D <input id="c3d-background-color" type="color" value="#111827" aria-label="Màu nền point cloud 3D"></label><button id="c3d-background-reset" class="c3d-btn-mini">Mặc định</button></div>
                    <button id="c3d-btn-settings" class="c3d-btn-secondary">Settings &amp; shortcuts</button>
                    <button id="c3d-btn-export-fit" class="c3d-btn-secondary" title="Chỉ export 1 box đang chọn + LiDAR xung quanh để debug thuật toán">Export Auto-Fit Case (Debug 1 Box)</button>
                    <div class="c3d-rot-grid"><button id="c3d-btn-rot-left" class="c3d-btn-mini" title="Alt+Shift+[">−90°</button><button id="c3d-btn-rot-right" class="c3d-btn-mini" title="Alt+Shift+]">+90°</button><button id="c3d-btn-flip" class="c3d-btn-mini" title="Alt+Shift+F">180°</button></div>
                </div>
                <div class="c3d-inspector-card"><div class="c3d-inspector-header"><span class="c3d-inspector-title">SELECTED BOX</span><button id="c3d-btn-focus" class="c3d-btn-mini">Focus</button></div>
                    <label class="c3d-follow-option"><input id="c3d-follow-selected" type="checkbox"> Follow selected object</label><div id="c3d-follow-status" class="c3d-follow-status" role="status"></div>
                    <select id="c3d-select-box" aria-label="Select CVAT box" class="c3d-inspector-selector"></select>
                    <div class="c3d-class-row"><span>Class</span><select id="c3d-select-class" aria-label="Change box class" class="c3d-inspector-selector"></select></div>
                    <div class="c3d-inspector-grid">
                        <div class="c3d-prop-row"><span class="c3d-prop-label">Subtype</span><span class="c3d-prop-val" id="c3d-prop-subtype">—</span></div>
                        <div class="c3d-prop-row"><span class="c3d-prop-label">Position</span><span class="c3d-prop-val" id="c3d-prop-pos">—</span></div>
                        <div class="c3d-prop-row"><span class="c3d-prop-label">L × W × H</span><span class="c3d-prop-val" id="c3d-prop-size">—</span></div>
                        <div class="c3d-prop-row"><span class="c3d-prop-label">Yaw</span><span class="c3d-prop-val" id="c3d-prop-yaw">—</span></div>
                        <div class="c3d-prop-row"><span class="c3d-prop-label">Bottom Z</span><span class="c3d-prop-val" id="c3d-prop-zbot">—</span></div>
                    </div>
                    <fieldset class="c3d-track-size"><legend>Đổi size toàn bộ keyframe (m)</legend>
                        <div class="c3d-preset-fields"><label>L <input id="c3d-track-size-l" aria-label="Track length" type="number" min="0.01" max="30" step="any"></label><label>W <input id="c3d-track-size-w" aria-label="Track width" type="number" min="0.01" max="8" step="any"></label><label>H <input id="c3d-track-size-h" aria-label="Track height" type="number" min="0.01" max="8" step="any"></label></div>
                        <label class="c3d-track-size-confirm"><input id="c3d-track-size-confirm" type="checkbox"> Xác nhận áp dụng cho mọi keyframe của track đang chọn</label>
                        <button id="c3d-btn-track-size" class="c3d-btn-secondary">Áp dụng size cho mọi keyframe</button>
                    </fieldset>
                    <div id="c3d-road-info" class="c3d-ground-info">Ground: LiDAR not loaded</div>
                </div>
                <div class="c3d-issue-header-bar"><span class="c3d-config-label">GEOMETRY ISSUES</span><select id="c3d-filter" aria-label="Filter severity"><option value="ALL">All</option><option value="CRITICAL">Critical</option><option value="WARNING">Warning</option><option value="INFO">Info</option></select></div>
                <div class="c3d-legend"><span class="c3d-dot critical"></span> Critical <span class="c3d-dot warning"></span> Warning <span class="c3d-dot info"></span> Info / Unchecked</div>
                <div id="c3d-issue-list" role="list" aria-label="QC issue list"></div>
                <div class="c3d-footer"><span>v1.16.0 · Reference QC thresholds</span><span id="c3d-status-msg">Waiting for editor</span></div>
            </div><div id="c3d-toast" role="status" aria-live="polite"></div>`;
        document.body.appendChild(root);
        updateUI=window.__C3D_UPDATE_CLIENT?.mount({root,request,toast,flush:()=>saveQueue,importPending:()=>serverImportPending});
        el('c3d-btn-reload')?.addEventListener('click',()=>{
            if(updateUI?.reload)updateUI.reload();else toast('Demo không có updater; chỉ cập nhật được trong extension.',true);
        });
        function getJobId() {
            let id = snapshot?.jobId;
            if (!id) {
                const match = window.location.pathname.match(/\/jobs\/(\d+)/);
                if (match) id = Number(match[1]);
            }
            if (!id) throw new Error('Không xác định được Job ID từ URL');
            return Number(id);
        }
        el('c3d-btn-export-ann')?.addEventListener('click', async () => {
            try {
                toast('Đang đọc annotation và ID từ editor CVAT...');
                const jobId = getJobId();
                const res = await request('EXPORT_ALL_ANNOTATIONS', { jobId, sessionId: snapshot?.sessionId });
                const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `cvat-job-${res.jobId}-annotations.json`;
                document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
                toast(`Export thành công ${res.trackCount} tracks (${res.shapeCount} shapes)!`);
            } catch (error) { toast('Lỗi export: ' + error.message, true); }
        });
        el('c3d-btn-cuboid-stats')?.addEventListener('click', async () => {
            const button=el('c3d-btn-cuboid-stats'),output=el('c3d-cuboid-stats');
            const selectedScope=scopeKey(snapshot);
            button.disabled=true;output.hidden=false;output.textContent='Đang đọc toàn bộ cuboid từ editor CVAT…';
            try {
                const result=await request('EXPORT_ALL_ANNOTATIONS',{jobId:getJobId(),sessionId:snapshot?.sessionId});
                if(selectedScope!==scopeKey(snapshot))throw new Error('Job/editor đã thay đổi; hãy chạy thống kê lại');
                const rows=window.__C3D_ANNOTATION_STATS.countCuboidsById(result.data,result.startFrame,result.stopFrame);
                output.replaceChildren();
                const heading=document.createElement('strong');
                const totals=rows.reduce((sum,row)=>({cuboids:sum.cuboids+row.cuboids,outside:sum.outside+row.outside}),{cuboids:0,outside:0});
                heading.textContent=`Job ${result.jobId} · ${rows.length} ID · ${totals.cuboids} cuboid frames · ${totals.outside} outside frames`;
                output.append(heading);
                const table=document.createElement('table');table.className='c3d-cuboid-stats-table';
                table.setAttribute('aria-label','Thống kê cuboid theo ID');
                const thead=document.createElement('thead'),header=document.createElement('tr');
                for(const label of ['clientID','DB ID','Class','Cuboid frames','Outside frames']){
                    const cell=document.createElement('th');cell.scope='col';cell.textContent=label;header.append(cell);
                }
                thead.append(header);table.append(thead);
                const tbody=document.createElement('tbody');
                if(!rows.length){
                    const row=document.createElement('tr'),cell=document.createElement('td');
                    cell.colSpan=5;cell.textContent='Không có cuboid trong Job này.';row.append(cell);tbody.append(row);
                }
                for(const row of rows){
                    const line=document.createElement('tr');
                    for(const value of [`#${row.clientID}`,row.serverID??'—',row.label,row.cuboids,row.outside]){
                        const cell=document.createElement('td');cell.textContent=String(value);line.append(cell);
                    }
                    tbody.append(line);
                }
                table.append(tbody);output.append(table);
            } catch(error) {
                output.textContent='Lỗi thống kê: '+error.message;
                toast('Lỗi thống kê cuboid: '+error.message,true);
            } finally {
                button.disabled=false;
            }
        });
        let currentImportMode = 'replace';
        el('c3d-btn-import-replace')?.addEventListener('click', () => {
            currentImportMode = 'replace';
            el('c3d-file-import')?.click();
        });
        el('c3d-btn-import-append')?.addEventListener('click', () => {
            currentImportMode = 'append';
            el('c3d-file-import')?.click();
        });
        el('c3d-file-import')?.addEventListener('change', async (event) => {
            const file = event.target.files?.[0]; if (!file) return; event.target.value = '';
            try {
                if(file.size>32*1024*1024)throw new Error('JSON vượt 32 MiB; chia nhỏ file trước khi import');
                const text = await file.text(), parsed = JSON.parse(text),json=parsed.annotations||parsed;
                if (!json.tracks && !json.shapes) throw new Error('File không chứa mảng tracks hoặc shapes của CVAT');
                if(!window.__C3D_ANNOTATION_IO_UI)throw new Error('Import selection UI unavailable; reload extension');
                importUI?.dispose();
                importUI=window.__C3D_ANNOTATION_IO_UI.mount({request,toast,jobId:getJobId(),sessionId:snapshot?.sessionId,mode:currentImportMode,data:json});
                await importUI.open();
            } catch (error) { toast('Lỗi import: ' + error.message, true); }
        });
        el('c3d-keep-direction').addEventListener('change',event=>{settings.keepDirection=event.target.checked;saveSettings();});
        for(const [id,key] of [['c3d-origin-ground','useOriginGround'],['c3d-ground-height','fallbackGroundHeight'],['c3d-move-longitudinal','moveLongitudinal'],['c3d-move-lateral','moveLateral']])el(id).addEventListener('change',event=>{
            const input=event.target;
            if(input.type==='number'&&(!input.value.trim()||!Number.isFinite(input.valueAsNumber))){input.value=String(settings[key]);toast('Enter a finite signed ground height in meters',true);return;}
            settings[key]=input.type==='checkbox'?input.checked:input.type==='number'?input.valueAsNumber:input.value;
            saveSettings();renderInspector();
        });
        el('c3d-adjust-direction').addEventListener('change',event=>{settings.adjustMoveDirection=event.target.checked;saveSettings();});
        el('c3d-follow-selected').addEventListener('change',event=>{settings.followSelected=event.target.checked;followSyncKey='';saveSettings();syncFollowCamera();});
        el('c3d-btn-settings').addEventListener('click',openSettings);
        function editPreset(reset=false){
            const box=snapshot?.boxes.find(b=>b.id===snapshot.activeBoxId),math=geometry(),preset=box&&math.resolveFitPreset(box.label_name,box.subType);
            if(!preset||busy||!settingsReady)return;
            const values=['l','w','h'].map(axis=>Number(el('c3d-preset-'+axis).value));
            if(reset)delete settings.presetOverrides[preset.key];
            else {if(!math.validFitPreset(values)){toast('Use positive dimensions: L 0.1–30m, W/H 0.1–8m',true);return;}settings.presetOverrides[preset.key]=values;}
            saveSettings();el('c3d-preset-summary').dataset.signature='';renderInspector();toast('Preset '+(reset?'reset':'saved')+' for '+preset.key+' · applies when you next run Auto-Fit');
        }
        el('c3d-preset-save').onclick=()=>editPreset();el('c3d-preset-reset').onclick=()=>editPreset(true);
        // Placement requires hovering the canvas; the button explains its shortcut.
        el('c3d-btn-move').addEventListener('click',()=>toast(`Hover over the object in the top view, then press ${shortcuts.format(settings.bindings.MOVE_TO_MOUSE)}${settings.bindings.MOVE_TO_MOUSE?'':' (assign a shortcut in settings)'}`));
        batchUI=window.__C3D_BATCH_UI?.mount({root,request,snapshot:()=>snapshot,reference,toast});

        el('c3d-session').disabled=!globalThis.chrome?.runtime?.id;
        el('c3d-session').addEventListener('click',async()=>{
            try{
                const response=await chrome.runtime.sendMessage({type:'C3D_OPEN_SESSION'});
                if(!response?.ok)throw new Error(response?.error||'Extension unavailable');
            }catch(error){toast(error.message,true);}
        });
        el('c3d-btn-toggle').addEventListener('click',()=>{const body=el('c3d-content-body');body.hidden=!body.hidden;el('c3d-btn-toggle').textContent=body.hidden?'+':'−';});
        el('c3d-btn-scan').addEventListener('click',()=>runManualQC());
        el('c3d-background-color').value=settings.backgroundColor||'#111827';
        el('c3d-background-color').addEventListener('change',event=>chooseBackground(event.target.value));
        el('c3d-background-reset').addEventListener('click',()=>chooseBackground(null));
        el('c3d-btn-ground').addEventListener('click',()=>action('SNAP_GROUND'));
        el('c3d-btn-track-size').addEventListener('click',()=>{
            const inputs=['l','w','h'].map(axis=>el('c3d-track-size-'+axis));
            const confirmation=el('c3d-track-size-confirm');
            if(!inputs.every(input=>input.checkValidity())){
                inputs.find(input=>!input.checkValidity())?.reportValidity();
                return;
            }
            if(!confirmation.checked){toast('Confirm that you want to resize every keyframe of the selected track.',true);return;}
            const dimensions=inputs.map(input=>input.valueAsNumber);
            confirmation.checked=false;
            action('RESIZE_TRACK',{dimensions});
        });
        for(const id of ['c3d-track-size-l','c3d-track-size-w','c3d-track-size-h'])
            el(id).addEventListener('input',()=>{el('c3d-track-size-confirm').checked=false;renderInspector();});
        el('c3d-track-size-confirm').addEventListener('change',renderInspector);
        el('c3d-btn-autofit').addEventListener('click',()=>action('AUTO_FIT'));
        el('c3d-btn-adjust').addEventListener('click',()=>action('AUTO_ADJUST'));
        el('c3d-btn-export-fit').addEventListener('click',async()=>{
            try {
                const data=await request('EXPORT_FIT_CASE',{ref:reference()});
                const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
                const link=document.createElement('a');link.href=url;link.download=`autofit-job${data.jobId}-frame${data.frame}-box${data.clientId}.json`;
                document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
                toast('Exported case: LiDAR points + seed/fitted boxes + current box');
            }catch(error){toast(error.message,true);}
        });
        el('c3d-btn-freecam').addEventListener('click',()=>action('FREECAM',{enabled:!snapshot?.freeCam}));
        el('c3d-btn-rot-left').addEventListener('click',()=>action('ROTATE',{degrees:-90}));
        el('c3d-btn-rot-right').addEventListener('click',()=>action('ROTATE',{degrees:90}));
        el('c3d-btn-flip').addEventListener('click',()=>action('ROTATE',{degrees:180}));
        el('c3d-btn-focus').addEventListener('click',()=>selectBox(snapshot.activeBoxId,true));
        el('c3d-select-box').addEventListener('change',event=>selectBox(Number(event.target.value)));
        el('c3d-select-class').addEventListener('change',event=>action('SET_LABEL',{labelId:Number(event.target.value)}));
        el('c3d-auto').addEventListener('change',event=>{autoQc=event.target.checked;if(autoQc)runQC(true);});
        el('c3d-colors').addEventListener('change',event=>{qcColors=event.target.checked;applyColors();});
        el('c3d-filter').addEventListener('change',event=>{filter=event.target.value;renderIssues();});
        let drag=null;
        root.querySelector('.c3d-header').addEventListener('pointerdown',event=>{
            if(event.target.closest('button'))return;
            const rect=root.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};event.target.setPointerCapture?.(event.pointerId);
        });
        root.addEventListener('pointermove',event=>{if(!drag)return;root.style.right='auto';root.style.left=Math.max(0,Math.min(window.innerWidth-root.offsetWidth,drag.left+event.clientX-drag.x))+'px';root.style.top=Math.max(0,Math.min(window.innerHeight-60,drag.top+event.clientY-drag.y))+'px';});
        root.addEventListener('pointerup',()=>{drag=null;});
        renderInspector();
    }
    function options(select,values,placeholder) {
        const key=JSON.stringify(values);if(select.dataset.options===key)return;
        select.dataset.options=key;select.replaceChildren();
        if(placeholder){const option=document.createElement('option');option.value='';option.textContent=placeholder;select.appendChild(option);}
        for(const [value,label] of values){const option=document.createElement('option');option.value=String(value);option.textContent=label;select.appendChild(option);}
    }
    function renderInspector() {
        if(!root)return;
        const math=geometry(false);
        const s=snapshot,box=s?.boxes.find(b=>b.id===s.activeBoxId),geom=box&&math?.parseCVAT16Points(box.points);
        const cap=s?.capabilities || {};
        const preset=box&&math?.resolveFitPreset(box.label_name,box.subType,settings.presetOverrides),signature=JSON.stringify(preset);
        const summary=el('c3d-preset-summary');
        if(summary.dataset.signature!==signature){
            summary.dataset.signature=signature;
            summary.textContent=preset?preset.key+' · '+(preset.custom?'custom':preset.dimensions?'starting preset — review':'configure dimensions'):'Select a supported class';
            ['l','w','h'].forEach((axis,i)=>{el('c3d-preset-'+axis).value=preset?.dimensions?.[i]??'';});
        }
        for(const id of ['c3d-preset-l','c3d-preset-w','c3d-preset-h','c3d-preset-save','c3d-preset-reset'])el(id).disabled=!preset||!settingsReady||busy;
        text('c3d-badge-conn',s?.connected?(s.mode==='demo'?'OFFLINE DEMO':'LIVE EDITOR'):'WAITING CVAT');
        el('c3d-badge-conn').classList.toggle('c3d-status-err',!s?.connected);
        text('c3d-context-label',s?.connected?`Job ${s.jobId} · Frame ${s.frame} · clientID`:(s?.reason||'Finding CVAT editor…'));
        const saveLabels={unsaved:'Unsaved · Save CVAT',saving:'CVAT saving…',saved:'CVAT: no unsaved changes',unknown:'Save via Save CVAT',local:'Offline demo · not sent to server'};
        text('c3d-save-state',saveLabels[s?.saveState]||saveLabels.unknown);
        text('c3d-val-count',s?.boxes.length||0);
        options(el('c3d-select-box'),(s?.boxes||[]).map(b=>[b.id,`#${b.id} · ${b.label_name}${b.subType ? ` (${b.subType})` : ''}${b.locked?' · locked':''}`]),'Select box…');
        el('c3d-select-box').value=box?String(box.id):'';
        options(el('c3d-select-class'),(s?.labels||[]).map(l=>[l.id,l.name]),'—');el('c3d-select-class').value=box?String(box.labelId):'';
        el('c3d-select-class').title=box?.label_name==='vehicles' ? (box.subType ? `Vehicle (${box.subType})` : 'Vehicle profile') : '';
        const canEdit=!!box&&!box.locked&&!box.groundTruth&&cap.edit&&!busy;
        for(const id of ['c3d-btn-rot-left','c3d-btn-rot-right','c3d-btn-flip','c3d-select-class'])el(id).disabled=!canEdit;
        const ground=box&&grounds[box.id];el('c3d-btn-ground').disabled=!canEdit||!settingsReady||(!settings.useOriginGround&&!math?.canManuallySnapGround(ground));
        const sizeInputs=['l','w','h'].map(axis=>el('c3d-track-size-'+axis));
        const sizeSelection=`${s?.sessionId}:${s?.jobId}:${s?.frame}:${box?.id}`;
        if(el('c3d-track-size-l').dataset.selection!==sizeSelection){
            sizeInputs.forEach((input,index)=>{input.value=geom?String(geom.dimensions[index]):'';});
            el('c3d-track-size-l').dataset.selection=sizeSelection;
            el('c3d-track-size-confirm').checked=false;
        }
        const canResize=canEdit&&box.objectType==='track'&&!!geom;
        for(const input of sizeInputs)input.disabled=!canResize;
        el('c3d-track-size-confirm').disabled=!canResize;
        el('c3d-btn-track-size').disabled=!canResize||!el('c3d-track-size-confirm').checked;
        el('c3d-btn-track-size').title=canResize?'Changes L/W/H on every native keyframe; preserves each keyframe position and direction. Save CVAT afterward.':'Select an editable cuboid track.';
        el('c3d-btn-autofit').disabled=!canEdit||!cap.ground;
        el('c3d-btn-autofit').disabled ||= !settingsReady;
        el('c3d-btn-adjust').disabled=!canEdit||!cap.ground||!settingsReady;
        el('c3d-btn-move').disabled=!canEdit||!cap.moveToMouse||!settingsReady;
        refreshShortcutHints();
        el('c3d-batch').disabled=!box||box.objectType!=='track'||!cap.batch||busy;
        el('c3d-batch').title=cap.batch?'Review one track across frames':'Requires native CVAT cuboid tracks';
        el('c3d-btn-export-fit').disabled=!box||busy||s?.mode==='demo';
        el('c3d-btn-freecam').disabled=!cap.freeCam||busy;el('c3d-btn-freecam').classList.toggle('c3d-active',!!s?.freeCam);
        el('c3d-btn-focus').disabled=!box||!cap.selection;el('c3d-btn-scan').disabled=manualQcRunning;
        text('c3d-prop-subtype',box?.subType ? box.subType.toUpperCase() : (box ? 'None' : '—'));
        text('c3d-prop-pos',geom?geom.center.map(n=>n.toFixed(2)).join(' / ')+' m':'—');
        text('c3d-prop-size',geom?geom.dimensions.map(n=>n.toFixed(2)).join(' × ')+' m':'—');
        text('c3d-prop-yaw',geom?geom.yawDeg.toFixed(1)+'°':'—');text('c3d-prop-zbot',geom?geom.zBottom.toFixed(2)+' m':'—');
        text('c3d-road-info',settings.useOriginGround?`Origin ground Z ${settings.fallbackGroundHeight.toFixed(2)}m`:
            'Ground base: surrounding road · '+(ground?.accepted?`QC measured road${ground.confidence<.65 ? ' estimated · QC only' : ''} · ${(ground.confidence*100).toFixed(0)}% · ${ground.inlierCount} pts · RMSE ${(ground.rmse*100).toFixed(1)}cm`:ground?.reason?`Ground: ${ground.reason}`:'QC road: reading LiDAR points…'));
    }
    async function loadGround(reportErrors=false) {
        const s=snapshot;if(!s?.connected||!s.capabilities.ground||!s.boxes.length)return false;
        const scope=scopeKey(s), revision=s.revision, run=++groundRun;
        try {
            const data=await request('GET_GROUNDS',{ref:reference(s.boxes[0].id),ids:s.boxes.map(b=>b.id)});
            if(run!==groundRun||scope!==scopeKey(snapshot)||revision!==snapshot.revision)return;
            const math=geometry();
            grounds=Object.fromEntries(Object.entries(data).map(([id,g])=>[id,g.accepted?math.makePlane(g.a,g.b,g.c,g):g]));
            evaluateQC();renderInspector();return true;
        }catch(error){if(run===groundRun&&scope===scopeKey(snapshot)){status(settings.useOriginGround?'Origin ground active':'QC road unavailable');text('c3d-road-info',settings.useOriginGround?`Origin ground Z ${settings.fallbackGroundHeight.toFixed(2)}m`:`Ground base: surrounding road · QC road unavailable: ${error.message}`);}if(reportErrors)throw error;return false;}
    }
    function evaluateQC() {
        if(!snapshot)return;
        const math=geometry();
        issues=math.auditFrame(snapshot.boxes,grounds);
        text('c3d-val-issues',issues.filter(i=>i.severity!=='INFO').length);
        text('c3d-val-affected',new Set(issues.filter(i=>i.severity!=='INFO').flatMap(i=>i.boxIds)).size);
        renderIssues();applyColors();
    }
    async function runQC(withGround=false) {
        if(manualQcRunning)return;
        if(!snapshot?.connected)return;
        try {evaluateQC();status('QC updated');if(withGround)await loadGround();}
        catch(error){status('QC not run');toast(error.message,true);}
    }
    async function runManualQC() {
        if(manualQcRunning)return;
        manualQcRunning=true;clearTimeout(qcTimer);groundRun++;
        renderInspector();status('QC: reading current frame…');toast('QC: reading current frame…');
        try {
            const fresh=await request('GET_SNAPSHOT');
            if(!fresh?.connected)throw new Error(fresh?.reason || 'CVAT 3D editor is not connected. Open a 3D job and wait for the canvas.');
            if(!Array.isArray(fresh.boxes)||!Array.isArray(fresh.labels))throw new Error('Invalid CVAT snapshot; reload the extension and CVAT tab.');
            acceptSnapshot(fresh);grounds={};evaluateQC();
            if(!fresh.boxes.length){status('QC: no cuboids in this frame');toast('QC: no cuboids in this frame.');return;}
            const scope=scopeKey(fresh),revision=fresh.revision;
            status('QC: checking LiDAR ground…');
            let groundError=null;
            try {await loadGround(true);}catch(error){groundError=error.message;}
            if(scope!==scopeKey(snapshot)||revision!==snapshot.revision){status('QC interrupted');toast('Frame or annotations changed during QC. Run QC Now again.',true);return;}
            const count=issues.filter(i=>i.severity!=='INFO').length;
            const trusted=Object.values(grounds).filter(g=>g.accepted!==false&&(g.confidence==null||g.confidence>=.65)).length;
            const summary=`QC: ${fresh.boxes.length} boxes · ${count} issues · ground ${trusted}/${fresh.boxes.length}`;
            status(summary);
            toast(summary+(groundError?` · Ground unavailable: ${groundError}`:'')+(snapshot.activeBoxId!=null?` · List shows selected box #${snapshot.activeBoxId}.`:'')+(filter!=='ALL'?` · Filter: ${filter}.`:''),!!groundError);
        }catch(error){status('QC not run');toast(error.message,true);}
        finally{manualQcRunning=false;renderInspector();}
    }
    function applyColors() {
        if(!snapshot?.connected || !snapshot.capabilities.appearance)return;
        const levels={INFO:0,WARNING:1,CRITICAL:2}, severity=new Map();
        for(const issue of issues)for(const id of issue.boxIds)if((levels[severity.get(id)]??-1)<levels[issue.severity])severity.set(id,issue.severity);
        const colors=Array.from(severity).map(([id,level])=>({id,color:{CRITICAL:'#f87171',WARNING:'#fbbf24',INFO:'#94a3b8'}[level]}));
        request(qcColors?'SET_QC_APPEARANCE':'CLEAR_QC_APPEARANCE',qcColors?{colors}:{}).catch(error=>status(error.message));
    }
    function renderIssues() {
        const container=el('c3d-issue-list');if(!container)return;
        const scroll=container.scrollTop;container.replaceChildren();
        const activeId=snapshot?.activeBoxId;
        const filtered=issues.filter(i=>(activeId==null||i.boxIds.includes(activeId))&&(filter==='ALL'||i.severity===filter));
        const heading=root.querySelector('.c3d-issue-header-bar');
        if(heading)heading.querySelector('.c3d-config-label').textContent=activeId==null?'GEOMETRY ISSUES':`ISSUES: BOX #${activeId}`;
        if(!filtered.length){const empty=document.createElement('div');empty.className='c3d-empty-state';empty.textContent=snapshot?.connected?(activeId==null?'No geometry issues under current rule set and filters. Ground is evaluated when sufficient points exist.':`Box #${activeId}: no geometry issues under current rules and filters.`):'Waiting for CVAT 3D connection';container.appendChild(empty);return;}
        for(const issue of filtered) {
            const row=document.createElement('div');row.className='c3d-issue-item';row.setAttribute('role','listitem');
            row.classList.toggle('c3d-active-item',issue.boxIds.includes(snapshot?.activeBoxId));
            const choose=document.createElement('button');choose.className='c3d-issue-select';choose.dataset.issueId=issue.id;
            const heading=document.createElement('div');heading.className='c3d-issue-row';
            const tag=document.createElement('span');tag.className='c3d-tag c3d-tag-'+issue.severity.toLowerCase();tag.textContent=issue.severity;
            const target=document.createElement('span');target.className='c3d-issue-target';target.textContent='Box '+issue.boxIds.map(id=>'#'+id).join(' / ');
            const message=document.createElement('div');message.className='c3d-issue-desc';message.textContent=issue.message;
            const code=document.createElement('div');code.className='c3d-issue-code';code.textContent=issue.code;
            heading.append(tag,target);choose.append(heading,message,code);choose.addEventListener('click',()=>selectBox(issue.boxId,true,issue.id));
            const footer=document.createElement('div');footer.className='c3d-issue-actions';
            const copy=document.createElement('button');copy.className='c3d-btn-mini';copy.textContent='Copy issue';copy.addEventListener('click',async()=>{
                try{await navigator.clipboard.writeText(`[QC ${issue.severity}] Box ${issue.boxIds.map(id=>'#'+id).join('/')} | ${issue.code} | ${issue.message}`);toast('Issue copied to clipboard');}
                catch(_){toast('Clipboard access failed; copy description manually',true);}
            });footer.appendChild(copy);
            if(issue.boxIds.length>1){const other=document.createElement('button');other.className='c3d-btn-mini';other.textContent='Select #'+issue.boxIds[1];other.addEventListener('click',()=>selectBox(issue.boxIds[1],true,issue.id));footer.appendChild(other);}
            row.append(choose,footer);container.appendChild(row);
        }
        container.scrollTop=scroll;
    }
    function keydown(event) {
        if(!root||!settingsReady||settingsPanel||event.repeat||event.isComposing||event.target?.closest?.('input:not([type="checkbox"]):not([type="radio"]),textarea,select,[contenteditable]:not([contenteditable="false"]),[role="dialog"],dialog')||document.querySelector('[role="dialog"],dialog[open]'))return;
        const pressed=shortcuts.fromEvent(event);if(!pressed)return;
        const match=shortcuts.definitions.find(d=>settings.bindings[d.id]&&shortcuts.signature(settings.bindings[d.id])===shortcuts.signature(pressed));
        if(!match)return;
        event.preventDefault();event.stopImmediatePropagation();
        const actions={AUTO_FIT:()=>action('AUTO_FIT'),AUTO_ADJUST:()=>action('AUTO_ADJUST'),SNAP_GROUND:()=>action('SNAP_GROUND'),MOVE_TO_MOUSE:()=>action('MOVE_TO_MOUSE'),FLIP:()=>action('ROTATE',{degrees:180}),ROTATE_LEFT:()=>action('ROTATE',{degrees:-90}),ROTATE_RIGHT:()=>action('ROTATE',{degrees:90}),QC:()=>runQC(true),FREECAM:()=>action('FREECAM',{enabled:!snapshot?.freeCam})};
        if(match.id==='MOVE_TO_MOUSE'&&!snapshot?.capabilities?.moveToMouse){toast('Move to mouse unavailable: top-view camera or canvas API missing',true);return;}
        if(match.id==='QC')runManualQC();else actions[match.id]();
    }
    function shouldShow(){
        if(document.documentElement.dataset.c3dDemo==='true')return true;
        const path=window.location.pathname;
        if(/\/jobs\/\d+/.test(path)||/\/tasks\/\d+/.test(path))return true;
        return !!(document.querySelector('#cvat-app')||document.querySelector('.cvat-canvas-container')||document.querySelector('.cvat-objects-sidebar'));
    }
    function routeCheck(){
        if(disposed)return;
        if(shouldShow()){if(!root)createHUD();if(!snapshot?.connected)request('GET_SNAPSHOT').then(acceptSnapshot).catch(()=>status('Bridge not ready'));}
        else if(root){closeSettings();batchUI?.dispose();batchUI=null;updateUI?.dispose();updateUI=null;root.remove();root=null;grounds={};issues=[];snapshot=null;lastRevisionKey='';groundRun++;request('CLEAR_QC_APPEARANCE').catch(()=>{});}
    }
    function dispose(){
        disposed=true;importUI?.dispose();updateUI?.dispose();updateUI=null;closeSettings();batchUI?.dispose();batchUI=null;if(globalThis.chrome?.runtime?.id)chrome.runtime.onMessage.removeListener(sessionMessage);clearInterval(routeTimer);clearTimeout(qcTimer);clearTimeout(toastTimer);groundRun++;
        window.removeEventListener('c3d:response:v2',receive);window.removeEventListener('c3d:snapshot:v2',receiveSnapshot);window.removeEventListener('keydown',keydown,true);
        for(const waiter of pending.values()){clearTimeout(waiter.timeout);waiter.reject(new Error('Panel stopped'));}pending.clear();root?.remove();root=null;
    }
    const sessionTransport=window.__C3D_CREATE_SESSION_TRANSPORT?.({snapshot:()=>snapshot,url:()=>location.href,cookie:()=>document.cookie,fetch:(...args)=>fetch(...args),onImportSubmitted:()=>{serverImportPending=true;}});
    function sessionMessage(message,sender,reply){
        if(message?.type!=='C3D_SESSION_API')return;
        if(sender.id!==globalThis.chrome?.runtime?.id||sender.url?.split('?')[0]!==chrome.runtime.getURL('session.html'))return;
        if(updateUI?.isHolding?.()){reply({ok:false,error:'Đang lưu/cập nhật extension; chờ reload xong trước khi dùng phiên CVAT'});return true;}
        if(message.operation==='native-export'){
            if(serverImportPending){reply({ok:false,error:'Đã gửi import; reload kết quả import trước khi export editor'});return true;}
            if(message.jobId!==snapshot?.jobId||message.origin!==location.origin){reply({ok:false,error:'Job/server changed'});return true;}
            request('EXPORT_ALL_ANNOTATIONS',{jobId:message.jobId,sessionId:snapshot.sessionId}).then(result=>reply({ok:true,result:{schema:'cvat-3d-tool-native-annotations/v2',jobId:result.jobId,source:'native-editor-including-unsaved',annotations:result.data}}),error=>reply({ok:false,error:error.message}));return true;
        }
        sessionTransport(message).then(result=>reply({ok:true,result}),error=>reply({ok:false,error:error.message}));
        return true;
    }
    if(sessionTransport&&globalThis.chrome?.runtime?.id)chrome.runtime.onMessage.addListener(sessionMessage);
    window.__CVAT_COPILOT_PANEL={dispose};
    window.addEventListener('c3d:response:v2',receive);window.addEventListener('c3d:snapshot:v2',receiveSnapshot);window.addEventListener('keydown',keydown,true);
    function start(){loadSettings();routeCheck();request('GET_SNAPSHOT').then(acceptSnapshot).catch(()=>status('Bridge not connected'));routeTimer=setInterval(routeCheck,1500);}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
