/* Shared shortcut definitions and validation. Storage belongs to the isolated HUD. */
(function(root){
    'use strict';
    const definitions = [
        ['AUTO_FIT','Auto-Fit','KeyA','c3d-btn-autofit'],
        ['AUTO_ADJUST','Auto Adjust Box','KeyB','c3d-btn-adjust'],
        ['SNAP_GROUND','Ground Snap','KeyG','c3d-btn-ground'],
        ['MOVE_TO_MOUSE','Move to mouse','KeyM','c3d-btn-move'],
        ['QC','Run QC','KeyL','c3d-btn-scan'],
        ['FREECAM','Free Cam toggle','KeyC','c3d-btn-freecam'],
        ['ROTATE_LEFT','Rotate −90°','BracketLeft','c3d-btn-rot-left'],
        ['ROTATE_RIGHT','Rotate +90°','BracketRight','c3d-btn-rot-right'],
        ['FLIP','Rotate 180°','KeyF','c3d-btn-flip'],
    ].map(([id,label,code,button])=>({id,label,button,binding:{code,alt:true,shift:true,ctrl:false,meta:false}}));
    const validCode=code=>typeof code==='string'&&/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|F([1-9]|1[0-9]|2[0-4])|Arrow(Up|Down|Left|Right)|BracketLeft|BracketRight|Backquote|Backslash|Comma|Period|Slash|Semicolon|Quote|Minus|Equal|Space|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Numpad(Add|Subtract|Multiply|Divide|Decimal|Enter))$/.test(code);
    function binding(value){
        if(!value||!validCode(value.code)||!['alt','shift','ctrl','meta'].every(k=>typeof value[k]==='boolean'))return null;
        return {code:value.code,alt:value.alt,shift:value.shift,ctrl:value.ctrl,meta:value.meta};
    }
    const signature=b=>b?`${b.code}:${+b.alt}${+b.shift}${+b.ctrl}${+b.meta}`:'';
    const fromEvent=e=>binding({code:e.code,alt:!!e.altKey,shift:!!e.shiftKey,ctrl:!!e.ctrlKey,meta:!!e.metaKey});
    function format(b){
        if(!b)return 'Unassigned';
        const names={BracketLeft:'[',BracketRight:']',Backquote:'`',Backslash:'\\',Comma:',',Period:'.',Slash:'/',Semicolon:';',Quote:"'",Minus:'-',Equal:'='};
        return [b.ctrl&&'Ctrl',b.alt&&'Alt',b.shift&&'Shift',b.meta&&'Meta',names[b.code]||b.code.replace(/^Key|^Digit/,'')].filter(Boolean).join('+');
    }
    const defaults=()=>({version:2,backgroundColor:null,keepDirection:false,adjustMoveDirection:false,useOriginGround:true,fallbackGroundHeight:0,moveLongitudinal:'none',moveLateral:'none',presetOverrides:{},followSelected:false,maxShrinkDistance:.1,maxShrinkPercent:5,bindings:Object.fromEntries(definitions.map(d=>[d.id,{...d.binding}]))});
    function normalize(raw){
        const result=defaults();
        result.backgroundColor=null;
        if(!raw||![1,2].includes(raw.version))return result;
        result.keepDirection=raw.keepDirection===true;
        if(typeof raw.backgroundColor==='string'&&/^#[0-9a-f]{6}$/i.test(raw.backgroundColor))result.backgroundColor=raw.backgroundColor;
        result.adjustMoveDirection=raw.adjustMoveDirection===true;
        result.useOriginGround=raw.version===1||raw.useOriginGround!==false;
        if(Number.isFinite(raw.fallbackGroundHeight))result.fallbackGroundHeight=raw.fallbackGroundHeight;
        if(['none','forward','backward'].includes(raw.moveLongitudinal))result.moveLongitudinal=raw.moveLongitudinal;
        if(['none','left','right'].includes(raw.moveLateral))result.moveLateral=raw.moveLateral;
        if(raw.presetOverrides&&typeof raw.presetOverrides==='object')for(const [key,value] of Object.entries(raw.presetOverrides)){
            if(/^(vehicles:[a-z-]+|two-wheels|pedestrian|Animal|Obstacle)$/.test(key)&&Array.isArray(value)&&value.length===3&&value.every((v,i)=>Number.isFinite(v)&&v>=.1&&v<=[30,8,8][i]))result.presetOverrides[key]=value.slice();
        }
        result.followSelected=raw.followSelected===true;
        for(const [key,max] of [['maxShrinkDistance',.4],['maxShrinkPercent',50]])if(Number.isFinite(raw[key])&&raw[key]>=0&&raw[key]<=max)result[key]=raw[key];
        // Load valid custom bindings first so a default cannot steal a saved key.
        const seen=new Set(),missing=[];
        for(const d of definitions){
            if(raw.bindings?.[d.id]===null){result.bindings[d.id]=null;continue;}
            const b=binding(raw.bindings?.[d.id]);
            if(b&&!seen.has(signature(b))){result.bindings[d.id]=b;seen.add(signature(b));}
            else {result.bindings[d.id]=null;missing.push(d);}
        }
        for(const d of missing)if(!seen.has(signature(d.binding))){result.bindings[d.id]={...d.binding};seen.add(signature(d.binding));}
        return result;
    }
    function assign(settings,id,value){
        if(!definitions.some(d=>d.id===id))throw new Error('Unknown action');
        const b=value===null?null:binding(value);
        if(value!==null&&!b)throw new Error('Press a supported key, with optional modifiers');
        const duplicate=b&&definitions.find(d=>d.id!==id&&signature(settings.bindings[d.id])===signature(b));
        if(duplicate)throw new Error(`Already assigned to ${duplicate.label}; clear that binding first`);
        settings.bindings[id]=b;
    }
    const api={definitions,defaults,normalize,assign,format,fromEvent,signature};
    root.__C3D_SHORTCUTS=api;
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
