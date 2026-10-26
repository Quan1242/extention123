/* CVAT 2.76 adapter. Uses ObjectState.save + native Redux update/history.
 * No REST writes, server/client ID guessing or position-based mesh matching.
 */
(function (root) {
    'use strict';
    function createCvatAdapter(env = {}) {
        const win = env.window || root, doc = env.document || win.document;
        const math = env.math || win.__CVAT_COPILOT_MATH;
        const later = env.delay || (ms => new Promise(resolve => win.setTimeout(resolve, ms)));
        const sessionId = `c3d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let store = env.store || null, canvas = null, unsubscribe = null, interval = null, disposed = false;
        let signature = '', revision = 0, scope = '', currentSnapshot = null;
        let lastFitCase = null;
        let reloadHold = null;
        let cloudKey = '', cloudIndex = null, spatialIndex = null, cloudLoading = null, groundCache = new Map();
        let qcColors = new Map(), colorView = null, originalColor = null, colorWrapper = null, cameraRestore = null;
        let backgroundColor = null;
        const backgroundScenes = new Map();
        function restoreBackgrounds() {
            for(const [scene,record] of backgroundScenes)if(scene.background===record.applied)scene.background=record.original;
            backgroundScenes.clear();
        }
        function applyBackground() {
            const views=Object.values(canvas?.view?.views || {});
            const scenes=new Set(views.map(v=>v?.scene).filter(Boolean));
            for(const [scene,record] of backgroundScenes)if(!scenes.has(scene)){
                if(scene.background===record.applied)scene.background=record.original;
                backgroundScenes.delete(scene);
            }
            let changed=false;
            if(backgroundColor!==null)for(const view of views){
                const scene=view?.scene;if(!scene)continue;
                let record=backgroundScenes.get(scene);
                if(record&&scene.background===record.applied&&record.color===backgroundColor)continue;
                let color=scene.background?.isColor?scene.background.clone():null;
                if(!color&&view.renderer?.getClearColor)view.renderer.getClearColor({copy(value){color=value.clone();return this;}});
                if(!color?.set)continue;
                if(!record)record={original:scene.background};
                else if(scene.background!==record.applied)record.original=scene.background;
                record.applied=color.set(backgroundColor);record.color=backgroundColor;
                scene.background=record.applied;backgroundScenes.set(scene,record);changed=true;
            }
            if(changed)canvas.render?.();
            return backgroundScenes.size;
        }
        function setBackground(color) {
            if(color!==null&&(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color)))throw new Error('Use a six-digit HEX background color');
            canvas=editor()?.canvas?.instance||null;
            backgroundColor=color;
            if(color===null){restoreBackgrounds();canvas?.render?.();return {reset:true};}
            const count=applyBackground();
            if(!count)throw new Error('3D background unavailable; wait for the point cloud to load');
            return {views:count,color};
        }
        const listeners = new Set(), pendingObjects = new Set();
        const keys = new Set();
        let flightFrame = null, lastFlightTime = 0, looking = false;
        let topPointer = null;
        let followEnabled=false,followTarget=null,followFrame=null,followReady=null,followStatus='Off';
        function followView(){
            const view=canvas?.view?.views?.perspective,camera=view?.camera,controls=view?.controls;
            return camera?.position?.clone && ((typeof controls?.setLookAt==='function'&&typeof controls.getTarget==='function')||controls?.target?.copy) && typeof win.requestAnimationFrame==='function' ? view : null;
        }
        function followMessage(message){if(followStatus!==message){followStatus=message;publish();}}
        function stopFollowing(){
            win.cancelAnimationFrame?.(followFrame);followFrame=null;followTarget=null;followReady=null;
        }
        function followTick(){
            followFrame=null;
            if(disposed||!followEnabled)return;
            try{updateFollowCamera();}catch(_){followMessage('Paused: camera or object view unavailable');}
            if(!disposed&&followEnabled)followFrame=win.requestAnimationFrame(followTick);
        }
        function updateFollowCamera(){
            const ann=editor(),jobId=ann?.job?.instance?.id,frame=ann?.player?.frame?.number;
            canvas=ann?.canvas?.instance||null;
            if(followTarget&&followTarget.jobId!==jobId){followTarget=null;followReady=null;}
            const view=followView();
            if(!view){followMessage('Unavailable: perspective camera controls missing');return;}
            if(cameraRestore){followReady=null;followMessage('Paused during Free Cam');return;}
            if(typeof canvas.mode==='function'&&canvas.mode()!=='idle'){followReady=null;followMessage('Paused during canvas interaction');return;}
            // Redux can advance before the point cloud and cuboids finish loading.
            // Never read a rendered center until it agrees with current-frame state.
            if(ann.player?.fetching||ann.canvas?.ready===false||
                (canvas.view.model?.data?.imageID!=null&&canvas.view.model.data.imageID!==frame)){
                followReady=null;followMessage('Waiting for frame canvas');return;
            }
            const states=ann.annotations?.states||[],active=ann.annotations?.activatedStateID;
            const selected=states.find(s=>s.clientID===active&&(s.frame==null||s.frame===frame));
            if(selected&&selected.objectType!=='track'){followTarget=null;followReady=null;followMessage('Select a track to follow across frames');return;}
            const id=selected?.clientID??followTarget?.clientId;
            const target=states.find(s=>s.clientID===id&&s.objectType==='track'&&s.shapeType==='cuboid'&&(s.frame==null||s.frame===frame));
            if(!target||target.outside||target.hidden){followReady=null;followMessage(followTarget?'Paused: track absent or hidden in this frame':'Select a track to follow across frames');return;}
            if(followTarget&&followTarget.clientId===id&&followTarget.serverId!==target.serverID){followTarget=null;followReady=null;followMessage('Track identity changed; reselect the track');return;}
            const drawn=canvas.view.drawnObjects?.[id],mesh=drawn?.cuboid?.perspective;
            if(!mesh?.getWorldPosition||!drawn.data?.points||drawn.data.points.length!==target.points.length||drawn.data.points.some((v,i)=>Math.abs(v-target.points[i])>1e-6)){
                followReady=null;followMessage('Waiting for current track geometry');return;
            }
            mesh.updateWorldMatrix?.(true,false);
            const center=mesh.getWorldPosition(view.camera.position.clone());
            if(![center.x,center.y,center.z].every(Number.isFinite))return;
            const key=`${jobId}:${frame}:${id}`;
            // Let native setup finish before applying the preserved orbit pose.
            if(followReady!==key){followReady=key;return;}
            const controls=view.controls,camera=view.camera;
            const orbitTarget=typeof controls.getTarget==='function'?controls.getTarget(camera.position.clone(),false):controls.target.clone();
            const offset=camera.position.clone().sub(orbitTarget);
            if(![offset.x,offset.y,offset.z].every(Number.isFinite)||offset.lengthSq()<1e-10)return;
            const previous=followTarget;
            if(!previous||previous.clientId!==id||previous.frame!==frame){
                const position=center.clone().add(previous?.clientId===id?previous.offset:offset);
                if(typeof controls.setLookAt==='function'){
                    controls.setLookAt(position.x,position.y,position.z,center.x,center.y,center.z,false);controls.update?.(0);
                }else{camera.position.copy(position);controls.target.copy(center);camera.lookAt(center);controls.update?.();}
                camera.updateMatrixWorld?.();canvas.render?.();
                followTarget={jobId,clientId:id,serverId:target.serverID,frame,offset:position.clone().sub(center)};
            }else{
                // Capture manual orbit/zoom without pulling the camera every tick.
                followTarget.offset=offset;
            }
            followMessage(`Following track ${id}`);
        }
        function setFollowCamera(enabled){
            if(enabled&&!followView())throw new Error('Follow selected object unavailable: perspective camera controls missing');
            followEnabled=enabled;stopFollowing();followStatus=enabled?'Select a track to follow across frames':'Off';
            if(enabled)followFrame=win.requestAnimationFrame(followTick);
            publish();return {enabled};
        }

        function topView() {
            const view=canvas?.view?.views?.top;
            return view?.camera?.position?.clone && view.camera.projectionMatrixInverse && view?.renderer?.domElement?.getBoundingClientRect ? view : null;
        }
        function clearPointer() { topPointer=null; }
        function pointerOut(event) {
            if(event.target===topView()?.renderer.domElement)clearPointer();
        }
        function pointerWorld(target) {
            const view=topView(),element=view?.renderer.domElement,pointer=topPointer;
            if(!view)throw new Error('Move to mouse unavailable: top-view camera or canvas API missing');
            if(!pointer||pointer.element!==element||pointer.scope!==scope)throw new Error('Hover inside the top-view canvas before moving the box');
            const rect=element.getBoundingClientRect(),{x,y}=pointer;
            if(rect.width<=0||rect.height<=0||x<rect.left||x>=rect.left+rect.width||y<rect.top||y>=rect.top+rect.height)throw new Error('Pointer is outside the top-view canvas');
            if(doc?.elementFromPoint && doc.elementFromPoint(x,y)!==element)throw new Error('Top-view canvas is covered; hover over the visible canvas');
            const nx=(x-rect.left)/rect.width*2-1,ny=1-(y-rect.top)/rect.height*2;
            view.camera.updateMatrixWorld?.(true);
            const near=view.camera.position.clone().set(nx,ny,-1).unproject(view.camera);
            const far=view.camera.position.clone().set(nx,ny,1).unproject(view.camera);
            // Orthographic copies may be rendered under a transformed parent.
            // Box points are expressed in the cuboid parent's local coordinates.
            const parent=canvas?.view?.drawnObjects?.[target.clientID]?.cuboid?.top?.parent;
            if(parent){parent.updateWorldMatrix?.(true,false);parent.worldToLocal(near);parent.worldToLocal(far);}
            const direction=far.clone().sub(near);
            if(Math.abs(direction.z)<1e-9)throw new Error('Top-view camera cannot project onto the box center plane');
            const position=near.addScaledVector(direction,(target.points[2]-near.z)/direction.z);
            if(![position.x,position.y].every(Number.isFinite))throw new Error('Invalid top-view projection');
            return position;
        }

        function discoverStore() {
            for (const candidate of [win.__store__, win.__REDUX_STORE__]) if (validStore(candidate)) return candidate;
            const element = doc?.getElementById('root') || doc?.getElementById('cvat-app');
            if (!element) return null;
            const queue = [];
            for (const key of Object.keys(element)) if (/^(__reactContainer|__reactFiber|_reactRootContainer)/.test(key)) queue.push(element[key]);
            const seen = new Set();
            for (let count = 0; queue.length && count < 12000; count++) {
                const node = queue.shift(); if (!node || seen.has(node)) continue; seen.add(node);
                for (const value of [node.memoizedProps?.store, node.memoizedProps?.value?.store, node.stateNode?.store,
                    node.memoizedState?.store, node.memoizedState?.memoizedState?.store]) if (validStore(value)) return value;
                for (const child of [node.current, node._internalRoot?.current, node.stateNode?.current, node.child, node.sibling, node.return, node.alternate])
                    if (child && !seen.has(child)) queue.push(child);
            }
            return null;
        }
        function validStore(candidate) { return !!candidate && typeof candidate.getState === 'function' && typeof candidate.dispatch === 'function'; }
        function editor() { return store?.getState()?.annotation; }
        function publish() {
            if (disposed) return;
            const snapshot = getSnapshot();
            const serialized = JSON.stringify(snapshot);
            if (serialized !== JSON.stringify(currentSnapshot)) {
                currentSnapshot = snapshot;
                listeners.forEach(fn => fn(snapshot));
            }
        }
        function resolveAttributes(state) {
            const raw = state?.attributes || {};
            const labelAttrs = state?.label?.attributes || [];
            const attrMap = {};
            const idToName = new Map();
            for (const attr of labelAttrs) {
                if (attr && attr.id != null) {
                    idToName.set(String(attr.id), attr.name);
                    idToName.set(Number(attr.id), attr.name);
                }
            }
            for (const [key, val] of Object.entries(raw)) {
                const name = idToName.get(key) || idToName.get(Number(key)) || key;
                attrMap[name] = val;
            }
            return attrMap;
        }
        function resolveSubType(state, attrs = null) {
            const resolved = attrs || resolveAttributes(state);
            const candidate = resolved.type || resolved.vehicle_type || resolved.subtype || resolved.sub_type || resolved.category;
            if (candidate) return String(candidate).trim().toLowerCase();
            const knownSubtypes = ['car', 'truck', 'bus', 'van', 'contruction', 'construction', 'pickup', 'trailer', 'tricycle', 'stroller', 'wheelchair', 'other'];
            for (const val of Object.values(resolved)) {
                if (typeof val === 'string' && knownSubtypes.includes(val.trim().toLowerCase())) {
                    return val.trim().toLowerCase();
                }
            }
            return null;
        }
        function connect() {
            const found = discoverStore();
            if (found && found !== store) {
                unsubscribe?.(); store = found;
                unsubscribe = store.subscribe?.(publish) || null;
            } else if (store && !unsubscribe) unsubscribe = store.subscribe?.(publish) || null;
            canvas = editor()?.canvas?.instance || null;
            applyBackground();
            publish();
        }
        function getSnapshot() {
            const ann = editor(), job = ann?.job?.instance;
            canvas = ann?.canvas?.instance || null;
            const jobId = Number(job?.id || win.location?.pathname?.match(/\/jobs\/(\d+)/)?.[1]) || null;
            const frame = ann?.player?.frame?.number ?? null;
            const nextScope = `${jobId}:${frame}`;
            if (nextScope !== scope) {
                clearPointer();
                scope = nextScope; lastFitCase=null; cloudIndex = null; spatialIndex = null; cloudKey = ''; cloudLoading = null; groundCache.clear();
                clearAppearance();
                if(cameraRestore&&cameraRestore.jobId!==jobId)stopCamera();
                else if(cameraRestore){clearKeys();lastFlightTime=0;}
            }
            const states = (ann?.annotations?.states || []).filter(s => s.shapeType === 'cuboid' && !s.outside &&
                (s.frame == null || s.frame === frame));
            const boxes = states.map(s => {
                const attrs = resolveAttributes(s);
                const subType = resolveSubType(s, attrs);
                return { id: s.clientID, clientId: s.clientID, serverId: s.serverID ?? null,
                    objectType: s.objectType, keyframe:!!s.keyframe, keyframes:s.keyframes, frame, points: Array.from(s.points || []), labelId: s.label?.id ?? null,
                    label_name: s.label?.name || 'Unknown', labelColor: s.label?.color || '#94a3b8',
                    attributes: attrs, subType,
                    locked: !!s.lock, hidden: !!s.hidden, groundTruth: !!s.isGroundTruth };
            });
            const geometrySignature = JSON.stringify([jobId, frame, boxes]);
            if (geometrySignature !== signature) { signature = geometrySignature; revision++; }
            let saveState = 'unknown';
            try {
                const unsaved = job?.annotations?.hasUnsavedChanges?.();
                if (typeof unsaved === 'boolean') saveState = unsaved ? 'unsaved' : 'saved';
                if (ann?.annotations?.saving?.uploading || ann?.annotations?.saving === true) saveState = 'saving';
            } catch (_) { /* not exposed by this build */ }
            const views = canvas?.view?.views;
            const is3D = job?.dimension === '3d' || (!job?.dimension && ann?.workspace === 'standard3d');
            return { sessionId, mode: 'live', connected: !!ann && !!job && !!canvas && is3D, jobId, frame, revision,
                activeBoxId: ann?.annotations?.activatedStateID ?? null, boxes,
                labels: (job?.labels || []).map(l => ({ id: l.id, name: l.name, color: l.color })), saveState,
                freeCam: !!cameraRestore, followCameraEnabled:followEnabled, followCameraStatus:followStatus, pointCount: cloudIndex?.count || 0,
                capabilities: { read: !!ann, selection: !!canvas?.activate && !!canvas?.html,
                    edit: !!store && states.some(s => typeof s.save === 'function') && typeof job?.actions?.get === 'function',
                    appearance: !!canvas?.view?.drawnObjects && typeof canvas?.view?.receiveShapeColor === 'function',
                    batch: !!(env.batchFactory||win.__C3D_CREATE_BATCH_CONTROLLER)&&!!job?.annotations?.export&&!!job?.annotations?.get&&!!job?.frames?.get,
                    moveToMouse: !!topView(), followCamera:!!followView(),
                    ground: !!views?.perspective?.scene, freeCam: !!views?.perspective?.camera && !!views?.perspective?.controls },
                reason: ann ? (!is3D ? 'Only 3D jobs are supported' : canvas ? '' : 'Waiting for 3D canvas') : 'Compatible CVAT editor not found' };
        }
        function validate(ref, forEdit = false) {
            const snap = getSnapshot();
            if (!snap.connected) throw new Error(snap.reason || 'CVAT editor not connected');
            if (ref.sessionId !== sessionId || Number(ref.jobId) !== snap.jobId || ref.frame !== snap.frame)
                throw new Error('Job or frame changed; please reselect box');
            if (forEdit && ref.revision !== snap.revision) throw new Error('Box modified; please retry from newest state');
            const target = editor().annotations.states.find(s => s.clientID === ref.clientId && s.shapeType === 'cuboid' && !s.outside);
            if (!target || (target.frame != null && target.frame !== snap.frame)) throw new Error('Box is no longer in current frame');
            if (forEdit && (target.lock || target.isGroundTruth || String(editor().workspace).toLowerCase() === 'review')) throw new Error('Box is locked or workspace is in review mode');
            if (forEdit && typeof canvas.mode === 'function' && canvas.mode() !== 'idle') throw new Error('Finish current drawing/drag interaction first');
            return { target, snap };
        }
        function focusObject(target) {
            if(cameraRestore)return false;
            const view=canvas?.view?.views?.perspective,cam=view?.camera,controls=view?.controls;
            if(!cam?.getWorldDirection || !controls){
                if(typeof canvas.focus==='function'){canvas.focus(target.clientID);return true;}
                return false;
            }
            stopCamera();
            const center=cam.position.clone().set(...target.points.slice(0,3));
            const direction=cam.getWorldDirection(cam.position.clone()).normalize();
            const radius=Math.hypot(...target.points.slice(6,9))/2;
            const vertical=(cam.fov||50)*Math.PI/360;
            const angle=Math.min(vertical,Math.atan(Math.tan(vertical)*(cam.aspect||1)));
            const distance=Math.max(radius*1.25/Math.sin(angle),radius+(cam.near||.1)*2);
            const position=center.clone().addScaledVector(direction,-distance);
            if(typeof controls.setLookAt==='function'){
                controls.setLookAt(position.x,position.y,position.z,center.x,center.y,center.z,false);
                controls.update?.(0);
            }else if(controls.target?.copy){
                cam.position.copy(position);controls.target.copy(center);cam.lookAt(center);controls.update?.();
            }else return false;
            canvas.render?.();
            return true;
        }
        function selectObject(ref, focus = false) {
            const { target } = validate(ref);
            const perspective = canvas.html().perspective;
            perspective.dispatchEvent(new win.CustomEvent('canvas.selected', { detail: { clientID: target.clientID } }));
            if (getSnapshot().activeBoxId !== target.clientID) throw new Error('CVAT did not accept selection; verify editor state');
            const focused=focus?focusObject(target):false;
            const row = doc?.getElementById(`cvat-objects-sidebar-state-item-${target.clientID}`);
            row?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
            publish(); return { selected: target.clientID,focused,...(focus&&!focused?{message:cameraRestore?'Box selected; turn off Free Cam to focus or resume following':'Box selected; unable to access 3D camera to focus'}:{}) };
        }
        function geometryConfirmed(actual,expected) {
            if(!math.parseCVAT16Points(actual)||!math.parseCVAT16Points(expected))return false;
            // Compare the nine physical 3D fields; CVAT may add/remove unused padding.
            // Native cuboids may also round buffers or normalize Euler angles.
            // Confirm geometry numerically, retaining a strict 0.1 mm / 1e-5 rad bound.
            return actual.slice(0,9).every((value,index)=>{
                const delta=value-expected[index];
                return index>=3&&index<=5 ? Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta)))<=1e-5 : Math.abs(delta)<=1e-4;
            });
        }
        async function updateObject(ref, changes) {
            const { target, snap } = validate(ref, true), job = editor().job.instance;
            if (pendingObjects.size) throw new Error('Previous operation in progress');
            if (typeof target.save !== 'function' || typeof job.actions?.get !== 'function') throw new Error('This build does not support native editing');
            const oldPoints = Array.from(target.points), oldLabel = target.label;
            pendingObjects.add(target.clientID);
            let committed = false;
            try {
                if (changes.points) {
                    if (!math.parseCVAT16Points(changes.points)) throw new Error('Invalid box coordinates');
                    target.points = Array.from(changes.points);
                }
                if (changes.labelId != null) {
                    const label = job.labels.find(l => l.id === changes.labelId);
                    if (!label) throw new Error('Class does not belong to task');
                    target.label = label;
                }
                // Same ObjectState.save + UPDATE_ANNOTATIONS_SUCCESS route as
                // CVAT 2.76 updateAnnotationsAsync. It records native history.
                const saved = await target.save();
                committed = true;
                const history = await job.actions.get();
                const current = getSnapshot();
                if (current.jobId === snap.jobId && current.frame === snap.frame) {
                    store.dispatch({ type: 'UPDATE_ANNOTATIONS_SUCCESS', payload: { states: [saved], history } });
                    if (changes.points) {
                        const actual = getSnapshot().boxes.find(b => b.id === target.clientID);
                        if (!actual || !geometryConfirmed(actual.points,changes.points)) throw new Error('CVAT did not confirm updated geometry');
                    }
                    if (changes.labelId != null && getSnapshot().boxes.find(b => b.id === target.clientID)?.labelId !== changes.labelId)
                        throw new Error('CVAT did not confirm updated class');
                } else {
                    publish(); return { applied: true, previousFrame: true, saveState: 'unsaved', message: 'Updated previous frame; current frame has changed' };
                }
                publish();
                return { applied: true, saveState: getSnapshot().saveState, revision: getSnapshot().revision };
            } catch (error) {
                // Revert only the same ObjectState's uncommitted input. A saved
                // replacement is owned by CVAT and must be reverted via Undo.
                const liveTarget = editor()?.annotations?.states?.find(s => s.clientID === target.clientID);
                if (!committed && liveTarget === target) { target.points = oldPoints; target.label = oldLabel; }
                if (committed) error = new Error('Core CVAT accepted edit but UI confirmation failed; verify box and use Undo if needed. ' + error.message);
                publish(); throw error;
            } finally { pendingObjects.delete(target.clientID); }
        }
        async function resizeTrack(ref, dimensions) {
            const { target, snap } = validate(ref, true), job = editor().job.instance;
            if (target.objectType !== 'track') throw new Error('Select a track to resize it across keyframes');
            if (!Array.isArray(dimensions) || dimensions.length !== 3 ||
                dimensions.some((value, index) => !Number.isFinite(value) || value <= 0 || value > [30, 8, 8][index]))
                throw new Error('Enter valid positive L/W/H dimensions (L ≤ 30m, W/H ≤ 8m)');
            if (pendingObjects.size) throw new Error('Previous operation in progress');
            if (!job.annotations?.export || !job.annotations?.get || typeof job.actions?.get !== 'function')
                throw new Error('Native track keyframe APIs unavailable');
            const initial = await job.annotations.export();
            const track = initial.tracks?.find(item => item.clientID === target.clientID);
            if (!track || track.id !== target.serverID && target.serverID != null)
                throw new Error('Selected native track identity changed');
            if (!Array.isArray(track.shapes) || !track.shapes.length) throw new Error('Selected track has no keyframes');
            const initialSignature = JSON.stringify(track);
            const plan = [];
            for (const shape of track.shapes) {
                if (!Number.isInteger(shape.frame) || shape.type !== 'cuboid' ||
                    !math.parseCVAT16Points(shape.points))
                    throw new Error('Track contains an unsupported or invalid keyframe');
                const states = await job.annotations.get(shape.frame, true, []);
                const state = states.find(item => item.clientID === target.clientID &&
                    item.objectType === 'track' && item.shapeType === 'cuboid' && item.frame === shape.frame);
                if (!state || !state.keyframe || state.lock || state.isGroundTruth)
                    throw new Error('Keyframe is missing, interpolated, locked, or protected at frame ' + shape.frame);
                const oldPoints = Array.from(state.points);
                if (oldPoints.some((value, index) => Math.abs(value - shape.points[index]) > 1e-4))
                    throw new Error('Track changed during preflight at frame ' + shape.frame);
                const nextPoints = oldPoints.slice();
                nextPoints.splice(6, 3, ...dimensions);
                plan.push({ frame: shape.frame, oldPoints, nextPoints });
            }
            const latest = await job.annotations.export();
            const latestTrack = latest.tracks?.find(item => item.clientID === target.clientID);
            if (!latestTrack || JSON.stringify(latestTrack) !== initialSignature)
                throw new Error('Track changed during preflight; retry the operation');
            const current = getSnapshot();
            if (current.sessionId !== snap.sessionId || current.jobId !== snap.jobId || current.frame !== snap.frame ||
                current.revision !== snap.revision || editor()?.job?.instance !== job)
                throw new Error('Job or frame changed during preflight');
            pendingObjects.add(target.clientID);
            const applied = [];
            let failure = null;
            try {
                for (const item of plan) {
                    const states = await job.annotations.get(item.frame, true, []);
                    const live = getSnapshot();
                    const state = states.find(candidate => candidate.clientID === target.clientID &&
                        candidate.objectType === 'track' && candidate.shapeType === 'cuboid' && candidate.frame === item.frame);
                    if (editor()?.job?.instance !== job || live.sessionId !== snap.sessionId ||
                        live.jobId !== snap.jobId || live.frame !== snap.frame ||
                        String(editor().workspace).toLowerCase() === 'review' || canvas?.mode?.() !== 'idle')
                        throw new Error('Job/editor changed during track resize');
                    if (!state || state.lock || state.isGroundTruth || state.keyframe !== true ||
                        state.points.some((value, index) => Math.abs(value - item.oldPoints[index]) > 1e-4))
                        throw new Error('Keyframe changed or became protected at frame ' + item.frame);
                    state.points = item.nextPoints.slice();
                    try {
                        await state.save();
                        applied.push(item.frame);
                    } catch (error) {
                        state.points = item.oldPoints;
                        throw error;
                    }
                }
                const saved = await job.annotations.export();
                const savedTrack = saved.tracks?.find(item => item.clientID === target.clientID);
                if (!savedTrack || savedTrack.shapes.length !== plan.length ||
                    savedTrack.shapes.some(shape => {
                        const entry = plan.find(item => item.frame === shape.frame);
                        return !entry || shape.points.slice(6, 9).some((value, index) =>
                            Math.abs(value - dimensions[index]) > 1e-4);
                    }))
                    throw new Error('CVAT did not confirm the requested size on every keyframe');
            } catch (error) {
                failure = error;
            } finally {
                try {
                    const frame = getSnapshot().frame;
                    const states = await job.annotations.get(frame, true, []);
                    const history = await job.actions.get();
                    if (editor()?.job?.instance === job && getSnapshot().frame === frame)
                        store.dispatch({ type: 'UPDATE_ANNOTATIONS_SUCCESS', payload: { states, history } });
                } catch (error) {
                    failure = new Error((failure ? failure.message + '; ' : '') + 'UI refresh failed: ' + error.message);
                }
                pendingObjects.delete(target.clientID);
                publish();
            }
            if (failure) {
                const progress = applied.length ? 'Applied at frames ' + applied.join(', ') + '; inspect Undo before retrying. ' : '';
                throw new Error(progress + failure.message);
            }
            return { applied: applied.length, frames: applied, dimensions: dimensions.slice(), saveRequired: true };
        }
        async function ensureCloud() {
            const views = canvas?.view?.views, scene = views?.perspective?.scene;
            if (!scene?.traverse) throw new Error('Cannot access frame point cloud');
            const clouds = [];
            scene.traverse(obj => { if ((obj.isPoints || obj.type === 'Points') && obj.geometry?.attributes?.position) clouds.push(obj); });
            if (!clouds.length) throw new Error('Point cloud has not finished loading');
            for(const obj of clouds)obj.updateWorldMatrix?.(true,false);
            const key = scope + ':' + clouds.map(o => `${o.uuid}:${o.geometry.attributes.position.count}:${o.geometry.attributes.position.version || 0}:${o.matrixWorld?.elements?.join(',')||''}`).join('|');
            if (cloudIndex && cloudKey === key) return cloudIndex;
            if (cloudLoading?.key === key) return cloudLoading.promise;
            const requestedScope = scope;
            const promise = (async () => {
                const points = [], total = clouds.reduce((n, o) => n + o.geometry.attributes.position.count, 0);
                const step = Math.max(1, Math.ceil(total / 160000));
                const spatial=new math.SpatialPointIndex(total);
                let scanned=0;
                for (const obj of clouds) {
                    obj.updateWorldMatrix?.(true, false);
                    const attr = obj.geometry.attributes.position, e = obj.matrixWorld?.elements;
                    for (let i = 0; i < attr.count; i++) {
                        const x = attr.getX(i), y = attr.getY(i), z = attr.getZ(i);
                        const wx=e?e[0]*x+e[4]*y+e[8]*z+e[12]:x,wy=e?e[1]*x+e[5]*y+e[9]*z+e[13]:y,wz=e?e[2]*x+e[6]*y+e[10]*z+e[14]:z;
                        spatial.add(wx,wy,wz);
                        if(i%step===0)points.push([wx,wy,wz]);
                        if (++scanned % 32768 === 0) { await later(0); if (scope !== requestedScope) throw new Error('Frame changed while reading LiDAR'); }
                    }
                }
                if (scope !== requestedScope) throw new Error('Frame changed');
                spatialIndex=spatial; cloudIndex = new math.GroundIndex(points); cloudKey = key; groundCache.clear(); publish(); return cloudIndex;
            })();
            cloudLoading = { key, promise };
            try { return await promise; } finally { if (cloudLoading?.promise === promise) cloudLoading = null; }
        }
        function serializedGround(ground) {
            const { getTargetZ, ...dto } = ground; return dto;
        }
        async function extractLocalPoints(ref, margin = 0.4, searchBox = null) {
            validate(ref,true);
            await ensureCloud();
            const { target } = validate(ref,true);
            margin=Math.max(.3,Math.min(.5,margin));
            // Ground indexing is sampled; fitting scans the original buffers
            // so a sparse local object is not lost to global subsampling.
            const roi=searchBox||target;
            const expanded=Array.from(roi.points);
            for(let i=6;i<9;i++)expanded[i]+=2*margin;
            const vertices=math.cuboidVertices(expanded);
            const lo=[0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]))),hi=[0,1,2].map(i=>Math.max(...vertices.map(p=>p[i])));
            const candidates=spatialIndex.query(lo,hi);
            validate(ref,true);
            return math.extractBoxROI(candidates,roi,margin);
        }
        async function getGrounds(ref, ids) {
            validate(ref); const requestedScope = scope, index = await ensureCloud();
            const result = {};
            for (const id of ids) {
                if (scope !== requestedScope) throw new Error('Frame changed; discarded obsolete ground result');
                const box = getSnapshot().boxes.find(b => b.id === id); if (!box) continue;
                const key = JSON.stringify([scope, id, box.points[0], box.points[1], ...box.points.slice(3, 8)]);
                if (!groundCache.has(key)) { groundCache.set(key, index.estimate(box)); await later(0); }
                result[id] = serializedGround(groundCache.get(key));
            }
            return result;
        }
        function clearAppearance() {
            if (colorView && originalColor) {
                if (colorView.receiveShapeColor === colorWrapper) colorView.receiveShapeColor = originalColor;
                for (const record of Object.values(colorView.drawnObjects || {})) {
                    if (record.cuboid?.setColor && record.data) record.cuboid.setColor(originalColor.call(colorView, record.data));
                }
            }
            qcColors.clear(); colorView = null; originalColor = null; colorWrapper = null;
        }
        function setAppearance(colors) {
            const view = canvas?.view;
            if (!view?.drawnObjects || typeof view.receiveShapeColor !== 'function') throw new Error('Canvas does not support QC color layer');
            if (view !== colorView) {
                clearAppearance(); colorView = view; originalColor = view.receiveShapeColor;
                colorWrapper = function (state) { return qcColors.get(state.clientID) || originalColor.call(this, state); };
                view.receiveShapeColor = colorWrapper;
            }
            qcColors = new Map(colors.map(({ id, color }) => [id, color]));
            for (const [id, record] of Object.entries(view.drawnObjects)) {
                const state = editor().annotations.states.find(s => s.clientID === Number(id));
                if (state) record.cuboid.setColor(qcColors.get(Number(id)) || originalColor.call(view, state));
            }
            canvas.render?.(); return { colored: qcColors.size };
        }
        const editable = target => !!target?.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"]');
        function keyDown(event) {
            if (!cameraRestore || editable(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.code === 'Escape') { event.preventDefault();event.stopImmediatePropagation();stopCamera(); publish(); return; }
            if (!['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(event.code))return;
            event.preventDefault();event.stopImmediatePropagation();
            if(event.repeat||!syncFreeCamera())return;
            keys.add(event.code);
        }
        function keyUp(event) { keys.delete(event.code); }
        function clearKeys() { keys.clear(); looking = false; clearPointer(); }
        function pointerDown(event) {
            if(cameraRestore&&!syncFreeCamera())return;
            if (cameraRestore && event.target === cameraRestore.view.renderer.domElement && event.button === 2) {
                looking = true; event.preventDefault(); event.stopImmediatePropagation();
            }
        }
        function pointerUp() { looking = false; }
        function pointerMove(event) {
            const element=topView()?.renderer.domElement;
            // Avoid serializing every annotation on every mouse movement.
            if(element&&event.target===element){
                const ann=editor(),jobId=Number(ann?.job?.instance?.id||win.location?.pathname?.match(/\/jobs\/(\d+)/)?.[1])||null;
                if(`${jobId}:${ann?.player?.frame?.number??null}`!==scope)getSnapshot();
            }
            topPointer=element&&event.target===element&&Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)?{element,x:event.clientX,y:event.clientY,scope}:null;
            if (!cameraRestore || !looking) return;
            if(!syncFreeCamera()||!looking)return;
            const camera = cameraRestore.view.camera, up = camera.position.clone().set(0,0,1);
            camera.quaternion.copy(cameraRestore.quaternion);
            const yaw = camera.quaternion.clone().setFromAxisAngle(up, -(event.movementX || 0) * 0.003);
            camera.quaternion.premultiply(yaw);
            const right = camera.position.clone().set(1,0,0).applyQuaternion(camera.quaternion);
            const pitch = camera.quaternion.clone().setFromAxisAngle(right, -(event.movementY || 0) * 0.003);
            const candidate = camera.quaternion.clone().premultiply(pitch), forward = camera.position.clone().set(0,0,-1).applyQuaternion(candidate);
            if (Math.abs(forward.z) < 0.99) camera.quaternion.copy(candidate);
            cameraRestore.quaternion.copy(camera.quaternion);
            event.preventDefault(); event.stopImmediatePropagation();
        }
        function contextMenu(event) { if (cameraRestore && event.target === cameraRestore.view.renderer.domElement) { event.preventDefault(); event.stopImmediatePropagation(); } }
        function syncFreeCamera(){
            if(!cameraRestore)return false;
            const ann=editor(),jobId=Number(ann?.job?.instance?.id)||null,frame=ann?.player?.frame?.number;
            if(jobId!==cameraRestore.jobId){stopCamera();publish();return false;}
            if(frame!==cameraRestore.frame){cameraRestore.frame=frame;clearKeys();lastFlightTime=0;}
            canvas=ann?.canvas?.instance||null;
            const view=canvas?.view?.views?.perspective;
            if(!view?.camera?.position?.copy||!view.camera.quaternion?.copy||!view.controls)return false;
            if(view.controls!==cameraRestore.controls){
                cameraRestore.controls.enabled=cameraRestore.enabled;
                cameraRestore.controls=view.controls;cameraRestore.enabled=view.controls.enabled;
            }
            cameraRestore.view=view;view.controls.enabled=false;
            return !ann.player?.fetching&&ann.canvas?.ready!==false&&
                (canvas.view.model?.data?.imageID==null||canvas.view.model.data.imageID===frame);
        }
        function applyFreeCameraPose(){
            const {view,position,quaternion,zoom}=cameraRestore,camera=view.camera,controls=view.controls;
            // Keep native orbit transitions (including a native focus/double-click)
            // from overwriting flight. Reapply the exact quaternion afterward.
            const target=position.clone().add(position.clone().set(0,0,-1).applyQuaternion(quaternion).multiplyScalar(10));
            if(typeof controls.setLookAt==='function'){controls.setLookAt(position.x,position.y,position.z,target.x,target.y,target.z,false);controls.update?.(0);}
            else controls.target?.copy?.(target);
            camera.position.copy(position);camera.quaternion.copy(quaternion);
            if(camera.zoom!==zoom){camera.zoom=zoom;camera.updateProjectionMatrix?.();}
            camera.updateMatrixWorld?.();
        }
        function flight(time) {
            if (!cameraRestore || disposed) return;
            const ready=syncFreeCamera();
            if(!cameraRestore)return;
            applyFreeCameraPose();
            const dt = lastFlightTime ? Math.min(0.05, (time-lastFlightTime)/1000) : 0; lastFlightTime = time;
            const camera = cameraRestore.view.camera, speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 18 : 6) * dt;
            if (ready && !doc?.hidden && !editable(doc?.activeElement)) {
                const forward = camera.position.clone().set(0,0,-1).applyQuaternion(camera.quaternion);
                const right = camera.position.clone().set(1,0,0).applyQuaternion(camera.quaternion);
                const direction = camera.position.clone().set(0,0,0);
                direction.addScaledVector(forward, (keys.has('KeyW') ? 1:0)-(keys.has('KeyS') ? 1:0));
                direction.addScaledVector(right, (keys.has('KeyD') ? 1:0)-(keys.has('KeyA') ? 1:0));
                direction.z += (keys.has('KeyE') ? 1:0)-(keys.has('KeyQ') ? 1:0);
                if (direction.lengthSq()) camera.position.addScaledVector(direction.normalize(), speed);
                camera.updateMatrixWorld?.();
            }
            cameraRestore.position.copy(camera.position);cameraRestore.quaternion.copy(camera.quaternion);cameraRestore.zoom=camera.zoom;
            applyFreeCameraPose();
            flightFrame = win.requestAnimationFrame(flight);
        }
        function stopCamera() {
            if (!cameraRestore) return;
            const { view, controls, enabled,position,quaternion,zoom } = cameraRestore, cam = view.camera;
            const distance=followTarget?Math.max(.1,followTarget.offset.length()):10;
            const target = position.clone().add(position.clone().set(0,0,-1).applyQuaternion(quaternion).multiplyScalar(distance));
            controls.setLookAt?.(position.x,position.y,position.z,target.x,target.y,target.z,false);
            controls.target?.copy?.(target);cam.position.copy(position);cam.quaternion.copy(quaternion);
            if(cam.zoom!==zoom){cam.zoom=zoom;cam.updateProjectionMatrix?.();}cam.updateMatrixWorld?.();
            controls.enabled = enabled;
            // Resume following from the flight heading, never a stale pre-flight pose.
            if(followTarget){followTarget.frame=null;followTarget.offset=position.clone().sub(target);followReady=null;}
            win.cancelAnimationFrame?.(flightFrame); cameraRestore = null; lastFlightTime = 0; clearKeys();
        }
        function setFreeCamera(enabled) {
            if (!enabled) { stopCamera(); publish(); return { enabled: false }; }
            if (cameraRestore) return { enabled: true };
            const view = canvas?.view?.views?.perspective;
            if (!view?.camera || !view?.controls || !win.requestAnimationFrame) throw new Error('Cannot access perspective camera');
            cameraRestore = { view, controls:view.controls, enabled: view.controls.enabled,jobId:Number(editor()?.job?.instance?.id)||null,frame:editor()?.player?.frame?.number,
                position:view.camera.position.clone(),quaternion:view.camera.quaternion.clone(),zoom:view.camera.zoom };
            view.controls.enabled = false; flightFrame = win.requestAnimationFrame(flight); publish(); return { enabled: true };
        }
        const batchController=(env.batchFactory||win.__C3D_CREATE_BATCH_CONTROLLER)?.({
            math,batchMath:env.batchMath||win.__C3D_BATCH_MATH,
            parsePCD:env.parsePCD||win.__C3D_PARSE_PCD,
            job:()=>editor()?.job?.instance,snapshot:()=>{if(disposed)throw new Error('Adapter stopped');return getSnapshot();},
            assertEditable:()=>{
                const snap=getSnapshot();
                if(!snap.connected||!snap.capabilities.edit||String(editor().workspace).toLowerCase()==='review'||canvas.mode?.()!=='idle')
                    throw new Error('Batch edit requires editable idle workspace');
                if([...pendingObjects].some(id=>id!=='batch'))throw new Error('Another native edit is pending');
            },
            lock:value=>value?pendingObjects.add('batch'):pendingObjects.delete('batch'),
            refresh:async(job)=>{
                const s=getSnapshot();if(disposed||editor()?.job?.instance!==job)return;
                const states=await job.annotations.get(s.frame,true,[]),history=await job.actions.get();
                const now=getSnapshot();
                if(editor()?.job?.instance===job&&now.frame===s.frame)
                    store.dispatch({type:'UPDATE_ANNOTATIONS_SUCCESS',payload:{states,history}});
                publish();
            }
        });
        const annotationIO=(env.annotationIOFactory||win.__C3D_ANNOTATION_IO?.createAnnotationIO)?.({
            math,origin:()=>win.location?.origin||'',job:()=>editor()?.job?.instance,snapshot:getSnapshot,
            assertEditable:()=>{
                const s=getSnapshot();
                const nativeReady=s.capabilities.edit||!!editor()?.job?.instance?.annotations?.commit;
                if(!s.connected||!nativeReady||String(editor().workspace).toLowerCase()==='review'||canvas?.mode?.()!=='idle'||s.saveState==='saving')throw new Error('Import requires editable idle CVAT');
                if([...pendingObjects].some(id=>id!=='annotation-io'))throw new Error('Another native edit is pending');
            },
            lock:value=>value?pendingObjects.add('annotation-io'):pendingObjects.delete('annotation-io'),
            refresh:async job=>{
                const s=getSnapshot();if(editor()?.job?.instance!==job)throw new Error('Job changed; reopen editor');
                const states=await job.annotations.get(s.frame,true,[]),history=await job.actions.get();
                if(editor()?.job?.instance===job&&getSnapshot().frame===s.frame)store.dispatch({type:'UPDATE_ANNOTATIONS_SUCCESS',payload:{states,history}});
                publish();
            }
        });
        function placementOptions(payload){
            const fallbackGroundHeight=payload.fallbackGroundHeight??0,useOriginGround=payload.useOriginGround??false;
            const moveLongitudinal=payload.moveLongitudinal??'none',moveLateral=payload.moveLateral??'none';
            if(typeof useOriginGround!=='boolean')throw new Error('Invalid origin ground mode');
            if(!Number.isFinite(fallbackGroundHeight))throw new Error('Invalid origin ground offset');
            if(!['none','forward','backward'].includes(moveLongitudinal)||!['none','left','right'].includes(moveLateral))throw new Error('Invalid mouse alignment direction');
            return {useOriginGround,fallbackGroundHeight,moveLongitudinal,moveLateral};
        }
        function originGround(options){
            // A configured geometry constraint, not measured road evidence. Never cache for QC.
            return {...math.makePlane(0,0,options.fallbackGroundHeight),accepted:true,confidence:1,source:'coordinate-origin',configured:true};
        }
        async function operationGround(ref,payload,box=null){
            const options=placementOptions(payload);
            if(options.useOriginGround)return originGround(options);
            if(box){const index=await ensureCloud();validate(ref,true);return index.estimate(box);}
            const grounds=await getGrounds(ref,[ref.clientId]);return grounds[ref.clientId];
        }
        async function command(type, payload = {}) {
            if(reloadHold&&!['GET_SNAPSHOT','PREPARE_RELOAD','RELEASE_RELOAD'].includes(type))throw new Error('Đang lưu để reload; chờ hoàn tất hoặc hủy reload');
            if (disposed) throw new Error('Adapter is stopped');
            switch (type) {
                case 'SET_BACKGROUND': return setBackground(payload.color);
                case 'PREPARE_RELOAD': {
                    const snap=getSnapshot(),job=editor()?.job?.instance;
                    if(!snap.connected||snap.sessionId!==payload.sessionId||snap.jobId!==payload.jobId)throw new Error('Job đã thay đổi; không reload');
                    if(reloadHold){if(reloadHold.job!==job)throw new Error('Job đã đổi trong khi khóa reload');return {jobId:snap.jobId,saved:job.annotations.hasUnsavedChanges()===false};}
                    if(pendingObjects.size||canvas?.mode?.()!=='idle'||snap.saveState==='saving'||editor()?.player?.fetching)throw new Error('CVAT đang thao tác/lưu; chờ xong rồi thử Reload');
                    if(!['saved','unsaved'].includes(snap.saveState))throw new Error('Không xác nhận được trạng thái lưu; không reload');
                    reloadHold={job};pendingObjects.add('reload');
                    try{
                        if(snap.saveState==='unsaved'||(typeof job.frames?.save==='function'&&String(editor().workspace).toLowerCase()!=='review')){
                            if(String(editor().workspace).toLowerCase()==='review'||(snap.saveState==='unsaved'&&typeof job.annotations.save!=='function'))throw new Error('Không thể tự lưu editor này; hãy Save CVAT trước');
                            store.dispatch({type:'SAVE_ANNOTATIONS',payload:{}});
                            try{
                                await job.frames?.save?.();if(snap.saveState==='unsaved')await job.annotations.save();
                                store.dispatch({type:'SAVE_ANNOTATIONS_SUCCESS',payload:{}});
                            }catch(error){store.dispatch({type:'SAVE_ANNOTATIONS_FAILED',payload:{error}});throw error;}
                            if(editor()?.job?.instance!==job)throw new Error('Job đã đổi trong khi lưu; không reload');
                            if(job.annotations.get){
                                const frame=getSnapshot().frame,states=await job.annotations.get(frame,true,[]),history=await job.actions.get();
                                if(editor()?.job?.instance===job&&getSnapshot().frame===frame)store.dispatch({type:'UPDATE_ANNOTATIONS_SUCCESS',payload:{states,history}});
                            }
                        }
                        if(editor()?.job?.instance!==job||job.annotations.hasUnsavedChanges()!==false)throw new Error('CVAT chưa xác nhận lưu hết annotation; không reload');
                        publish();return {jobId:snap.jobId,saved:true};
                    }catch(error){reloadHold=null;pendingObjects.delete('reload');publish();throw error;}
                }
                case 'RELEASE_RELOAD': reloadHold=null;pendingObjects.delete('reload');publish();return {released:true};
                case 'GET_SNAPSHOT': connect(); return getSnapshot();
                case 'BATCH_OPEN': {validate(payload.ref);if(!batchController)throw new Error('Batch module unavailable');return batchController.open(payload.ref.clientId);}
                case 'BATCH_BEGIN': if(!batchController)throw new Error('Batch module unavailable');return batchController.begin(payload);
                case 'BATCH_FRAME': if(!batchController)throw new Error('Batch module unavailable');return batchController.read(payload);
                case 'BATCH_PROTECT': if(!batchController)throw new Error('Batch module unavailable');return batchController.protect(payload);
                case 'BATCH_APPLY': if(!batchController)throw new Error('Batch module unavailable');return batchController.apply(payload);
                case 'BATCH_CANCEL': return batchController?.cancel()||{cancelled:true};
                case 'SELECT_OBJECT': return selectObject(payload.ref, !!payload.focus);
                case 'ROTATE': { const { target } = validate(payload.ref,true); if (![-90,90,180].includes(payload.degrees)) throw new Error('Unsupported rotation angle'); return updateObject(payload.ref,{points:math.rotateYawPoints(target.points,payload.degrees)}); }
                case 'SET_LABEL': return updateObject(payload.ref,{labelId:payload.labelId});
                case 'RESIZE_TRACK': return resizeTrack(payload.ref, payload.dimensions);
                case 'EXPORT_FIT_CASE': {
                    const {target,snap}=validate(payload.ref);
                    if(!lastFitCase||lastFitCase.jobId!==snap.jobId||lastFitCase.frame!==snap.frame||lastFitCase.clientId!==target.clientID)
                        throw new Error('Run Auto-Fit on this box first, adjust manually, then export case');
                    return {...lastFitCase,exportedAt:new Date().toISOString(),currentBox:{points:Array.from(target.points),label:target.label.name},currentBoxRole:'user-reviewed candidate; not automatically certified ground truth'};
                }
                case 'AUTO_FIT': {
                    const now=()=>win.performance?.now?.()??Date.now(),started=now();
                    const initial=validate(payload.ref,true).target;
                    if(Math.abs(initial.points[3])>1e-6||Math.abs(initial.points[4])>1e-6)throw new Error('Auto-Fit supports upright boxes only');
                    const configuredGround=await operationGround(payload.ref,payload);
                    const groundDone=now();
                    const { target } = validate(payload.ref,true);
                    const attrs = resolveAttributes(target);
                    const subType = resolveSubType(target, attrs);
                    const spec = math.resolveDimensionSpec ? math.resolveDimensionSpec(target.label.name, subType) : math.DIMENSION_SPECS[target.label.name];
                    if(!spec)throw new Error(`No dimension rule configured for class: ${target.label.name}${subType ? ` (${subType})` : ''}`);
                    const ground=configuredGround;
                    if(!math.canManuallySnapGround(ground)||ground.confidence<.65)throw new Error('Reliable local ground required; enable origin ground to use Z = 0 + offset');
                    const preset=math.resolveFitPreset(target.label.name,subType);
                    const dimensions=payload.presetDimensions??preset?.dimensions;
                    if(!math.validFitPreset(dimensions))throw new Error('Configure valid L/W/H preset for this class/subtype first');
                    const search=Array.from(target.points),diameter=Math.hypot(dimensions[0],dimensions[1]);
                    search[3]=search[4]=search[5]=0;search[6]=search[7]=diameter*1.6;
                    search[2]=ground.a*search[0]+ground.b*search[1]+ground.c+dimensions[2]/2;search[8]=dimensions[2]+.8;
                    const searchBox={points:search};
                    const points = await extractLocalPoints(payload.ref,.4,searchBox);
                    const roiDone=now();
                    validate(payload.ref,true);
                    lastFitCase={schema:'cvat-3d-tool-fit-case/v1',toolVersion:'1.16.0',jobId:payload.ref.jobId,frame:payload.ref.frame,clientId:target.clientID,
                        coordinateSystem:'world metres, Z up, Euler XYZ radians',seedBox:{points:Array.from(target.points),label:target.label.name,subType,attributes:attrs},
                        searchBox:{points:search,margin:.4},ground,roiPoints:points,groundSupport:cloudIndex.query(target.points[0],target.points[1],15),
                        parameters:{mode:'preset',preset:{key:preset.key,dimensions},clusterRadius:.45,xyzVoxel:.12,groundOffset:.08,keepDirection:payload.keepDirection===true},status:'fit-started'};
                    const neighbors=getSnapshot().boxes.filter(b=>b.id!==target.clientID);
                    lastFitCase.neighborBoxes=neighbors.map(b=>({id:b.id,points:b.points,label:b.label_name,subType:b.subType}));
                    const selection=math.fitPresetBox(points,target.label.name,{points:target.points,ground,subType,attributes:attrs,keepDirection:payload.keepDirection===true},neighbors,dimensions);
                    const {cluster}=selection,clusterDone=now();
                    let fitted=selection.fitted;
                    const finalGround=await operationGround(payload.ref,payload,{points:fitted});
                    if(!math.canManuallySnapGround(finalGround)||finalGround.confidence<.65)throw new Error('Reliable ground unavailable under final preset footprint; box unchanged');
                    if(Math.abs((ground.a*fitted[0]+ground.b*fitted[1]+ground.c)-(finalGround.a*fitted[0]+finalGround.b*fitted[1]+finalGround.c))>.35)throw new Error('Conflicting ground estimates; box unchanged');
                    fitted=math.snapGroundPoints(fitted,finalGround).newPoints;
                    validate(payload.ref,true);
                    lastFitCase.parameters.selectedClusterRadius=selection.radius;
                    lastFitCase.selection={excludedNeighborPoints:selection.excludedNeighborPoints,attempts:selection.attempts};
                    lastFitCase.clusterPoints=cluster;lastFitCase.fittedBox={points:fitted.slice(),label:target.label.name,subType};
                    const fittedKey=JSON.stringify([scope,target.clientID,fitted[0],fitted[1],...fitted.slice(3,8)]);
                    groundCache.delete(fittedKey);
                    const fitDone=now(),updated=await updateObject(payload.ref,{points:fitted}),done=now();
                    if(lastFitCase){lastFitCase.status='applied';lastFitCase.elapsedMs=done-started;}
                    return {...updated,keepDirection:payload.keepDirection===true,preset:selection.preset,warning:selection.warnings.join(' · ')||null,aligned:selection.aligned,pointCount:cluster.length,groundFallback:false,groundSource:ground.source,groundHeight:ground.c,elapsedMs:done-started,
                        timingsMs:{groundAndIndex:groundDone-started,roi:roiDone-groundDone,cluster:clusterDone-roiDone,fit:fitDone-clusterDone,nativeSave:done-fitDone}};
                }
                case 'GET_GROUNDS': return getGrounds(payload.ref, payload.ids || [payload.ref.clientId]);
                case 'AUTO_ADJUST': {
                    const options=math.autoAdjustOptions(payload);
                    const initial=validate(payload.ref,true).target;
                    if(pendingObjects.size)throw new Error('Previous operation in progress');
                    if(Math.abs(initial.points[3])>1e-6||Math.abs(initial.points[4])>1e-6)throw new Error('Auto Adjust supports upright boxes only');
                    const ground=await operationGround(payload.ref,payload);
                    validate(payload.ref,true);
                    if(!math.canManuallySnapGround(ground)||ground.confidence<.65)throw new Error('Reliable ground required for Auto Adjust; box unchanged');
                    const base=math.snapGroundPoints(initial.points,math.makePlane(ground.a,ground.b,ground.c));
                    if(Math.abs(base.deltaZ)>1.5)throw new Error('Ground adjustment exceeds 1.5m; box unchanged');
                    const nearby=await extractLocalPoints(payload.ref,.4,{points:base.newPoints});
                    const {target}=validate(payload.ref,true),neighbors=getSnapshot().boxes.filter(b=>b.id!==target.clientID);
                    const adjustment=math.autoAdjustBox(nearby,target,ground,neighbors,options),points=adjustment.points;
                    const finalGround=await operationGround(payload.ref,payload,{points});
                    if(!math.canManuallySnapGround(finalGround)||finalGround.confidence<.65)throw new Error('Reliable ground unavailable under adjusted box; box unchanged');
                    // Preserve the fitted world-space top while the final footprint's
                    // ground fixes the bottom. This changes height, never heading.
                    const snap=math.snapGroundPoints(points,math.makePlane(finalGround.a,finalGround.b,finalGround.c));
                    if(Math.abs(snap.deltaZ)>1.5||points[8]-snap.deltaZ<.1)throw new Error('Final ground adjustment is unsuitable; box unchanged');
                    points[2]+=snap.deltaZ/2;points[8]-=snap.deltaZ;
                    if(points[8]<target.points[8]-Math.min(options.maxShrinkDistance,target.points[8]*options.maxShrinkPercent/100)-1e-8)throw new Error('Final ground would shrink height beyond the local limit; box unchanged');
                    validate(payload.ref,true);
                    const notes=[];
                    if(adjustment.limitedFaces.length)notes.push('Some outward corrections limited to 0.4m');
                    if(adjustment.retainedFaces.length)notes.push('Faces without nearby surface support preserved');
                    if(adjustment.rejectedBoundaryCandidates)notes.push('Weak boundary patches ignored');
                    const evidence={groundSource:ground.source,groundHeight:ground.c,groundClearance:adjustment.groundClearance,excludedNearGroundPoints:adjustment.excludedNearGroundPoints,rejectedBoundaryCandidates:adjustment.rejectedBoundaryCandidates};
                    if(points.every((v,i)=>Math.abs(v-target.points[i])<=1e-6))return {applied:false,unchanged:true,...evidence,warning:notes.join(' · ')||null};
                    return {...await updateObject(payload.ref,{points}),...evidence,pointCount:adjustment.pointCount,faceChanges:adjustment.faceChanges,warning:notes.join(' · ')||null};
                }
                case 'MOVE_TO_MOUSE': {
                    const options=placementOptions(payload);
                    const {target}=validate(payload.ref,true);
                    if(pendingObjects.size)throw new Error('Previous operation in progress');
                    const position=pointerWorld(target);let points=Array.from(target.points);
                    points[0]=position.x;points[1]=position.y;
                    let alignment={longitudinal:'none',lateral:'none'},alignmentWarning=null;
                    let ground=options.useOriginGround?originGround(options):null;
                    let refined=false,pointCount=0,centerWarning=null,directionWarning=null,directionAdjusted=false,directionDeltaDegrees=0;
                    try {
                        const index=await ensureCloud();
                        validate(payload.ref,true);
                        if(!options.useOriginGround)ground=index.estimate({points});
                        const search=points.slice();search[6]*=2;search[7]*=2;
                        if(math.canManuallySnapGround(ground)){
                            search[2]=ground.a*points[0]+ground.b*points[1]+ground.c+points[8]*.75;
                            search[8]=points[8]*1.5;
                        }
                        const nearby=await extractLocalPoints(payload.ref,.4,{points:search});
                        validate(payload.ref,true);
                        const neighbors=getSnapshot().boxes.filter(b=>b.id!==target.clientID);
                        const refinement=math.refineCenterNearPointer(nearby,{points},ground,neighbors,{adjustDirection:payload.adjustDirection===true,...options});
                        alignment=refinement.alignment||alignment;alignmentWarning=refinement.alignmentWarning||null;
                        refined=refinement.refined;pointCount=refinement.pointCount;
                        directionAdjusted=refinement.directionAdjusted===true;directionDeltaDegrees=refinement.directionDeltaDegrees||0;directionWarning=refinement.directionWarning||null;
                        if(refined){
                            points=refinement.points;
                            if(!options.useOriginGround){ground=null;ground=cloudIndex.estimate({points});}
                        }else centerWarning=refinement.reason;
                    } catch(error) {
                        // A cloud failure permits XY placement; a stale edit never does.
                        validate(payload.ref,true);
                        centerWarning='Nearby object refinement unavailable: '+error.message;
                    }
                    let groundWarning='Ground unavailable or uncertain; kept Z';
                    if(math.canManuallySnapGround(ground)){
                        const snapped=math.snapGroundPoints(points,math.makePlane(ground.a,ground.b,ground.c));
                        if(Math.abs(snapped.deltaZ)<=1.5){points[2]=snapped.newPoints[2];groundWarning=null;}
                        else groundWarning='Ground adjustment exceeds 1.5m; kept Z';
                    }
                    validate(payload.ref,true);
                    const warning=[centerWarning,directionWarning,alignmentWarning,groundWarning].filter(Boolean).join(' · ')||null;
                    return {...await updateObject(payload.ref,{points}),refined,pointCount,directionAdjusted,directionDeltaDegrees,groundFallback:!!groundWarning,groundSource:groundWarning?null:(ground?.source||'point-cloud'),alignment,warning};
                }
                case 'SNAP_GROUND': {
                    const options=placementOptions(payload);
                    validate(payload.ref,true);
                    const ground=await operationGround(payload.ref,payload);
                    if (!math.canManuallySnapGround(ground)) throw new Error('No sufficient quality ground plane to snap');
                    const { target } = validate(payload.ref,true), plane = math.makePlane(ground.a,ground.b,ground.c), snap = math.snapGroundPoints(target.points,plane);
                    if (Math.abs(snap.deltaZ) > 1.5 && !payload.allowLargeAdjustment) throw new Error('ΔZ > 1.5m: verify ground plane before snapping');
                    const result = await updateObject(payload.ref,{points:snap.newPoints}); return {...result,deltaZ:snap.deltaZ,confidence:ground.configured?null:ground.confidence,configured:!!ground.configured,groundHeight:ground.c,groundSource:ground.source||'point-cloud'};
                }
                case 'EXPORT_ALL_ANNOTATIONS': if(!annotationIO)throw new Error('Native JSON module unavailable');return annotationIO.exported(payload);
                case 'PREVIEW_ANNOTATION_IMPORT': if(!annotationIO)throw new Error('Native JSON module unavailable');return annotationIO.preview(payload);
                case 'IMPORT_ALL_ANNOTATIONS': if(!annotationIO)throw new Error('Native JSON module unavailable');return annotationIO.apply(payload);
                case 'SET_QC_APPEARANCE': return setAppearance(payload.colors || []);
                case 'CLEAR_QC_APPEARANCE': clearAppearance(); return {cleared:true};
                case 'FREECAM': return setFreeCamera(!!payload.enabled);
                case 'FOLLOW_CAMERA': return setFollowCamera(payload.enabled===true);
                default: throw new Error('Unsupported command');
            }
        }
        function start() {
            connect(); interval = win.setInterval(connect, 1200);
            for (const [type, fn] of [['keydown',keyDown],['keyup',keyUp],['blur',clearKeys],['pointerdown',pointerDown],['pointerup',pointerUp],['pointermove',pointerMove],['pointerout',pointerOut],['contextmenu',contextMenu]]) win.addEventListener?.(type,fn,true);
        }
        function dispose() {
            if (disposed) return; disposed = true; unsubscribe?.(); win.clearInterval?.(interval); stopFollowing();stopCamera(); clearAppearance(); restoreBackgrounds();canvas?.render?.();listeners.clear();
            for (const [type, fn] of [['keydown',keyDown],['keyup',keyUp],['blur',clearKeys],['pointerdown',pointerDown],['pointerup',pointerUp],['pointermove',pointerMove],['pointerout',pointerOut],['contextmenu',contextMenu]]) win.removeEventListener?.(type,fn,true);
        }
        return {start,dispose,getSnapshot,command,extractLocalPoints,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},_connect:connect};
    }
    root.__CVAT_COPILOT_CREATE_ADAPTER = createCvatAdapter;
    if (typeof module !== 'undefined' && module.exports) module.exports = {createCvatAdapter};
})(typeof window !== 'undefined' ? window : globalThis);
