'use strict';
document.getElementById('extension-id').textContent=chrome.runtime.id;
document.getElementById('copy-id').onclick=async()=>{try{await navigator.clipboard.writeText(chrome.runtime.id);document.getElementById('status').textContent='Đã copy ID.';}catch(_){document.getElementById('status').textContent='Hãy chọn và copy ID thủ công.';}};
