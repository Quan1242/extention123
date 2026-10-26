const {test,expect}=require('@playwright/test');
const fs=require('node:fs');

async function fixture(page){
    await page.goto('http://127.0.0.1:4173/demo/index.html');
    // Exercise the extension storage API, including reload persistence.
    await page.evaluate(()=>window.__CVAT_COPILOT_PANEL.dispose());
    await page.evaluate(()=>{
        window.chrome={storage:{local:{
            async get(key){return {[key]:JSON.parse(localStorage.getItem(key)||'null')};},
            async set(values){for(const [key,value] of Object.entries(values))localStorage.setItem(key,JSON.stringify(value));}
        }}};
        window.requests=[];
        window.addEventListener('c3d:request:v2',e=>requests.push(JSON.parse(e.detail)));
    });
    await page.addScriptTag({content:fs.readFileSync('extension/content_script.js','utf8')});
    await expect(page.locator('#c3d-btn-settings')).toBeEnabled();
}

test('shrink settings save, validate, persist, reset and reach Auto Adjust commands',async({page})=>{
    await fixture(page);await page.locator('#c3d-btn-settings').click();
    const distance=page.getByRole('spinbutton',{name:'Maximum shrink distance (cm)',exact:true}),percent=page.getByRole('spinbutton',{name:'Maximum shrink (%)',exact:true});
    await expect(distance).toHaveValue('10');await expect(percent).toHaveValue('5');
    await distance.fill('25');await percent.click();await percent.fill('20');await distance.click();
    await distance.fill('41');await percent.click();await expect(distance).toHaveAttribute('aria-invalid','true');
    await distance.fill('25');await percent.click();
    await page.screenshot({path:'docs/verification/shrink-settings-1.11.0.png'});
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await expect(page.locator('#c3d-btn-adjust')).toHaveAttribute('title',/25 cm or 20%/);
    await page.keyboard.press('Alt+Shift+B');
    await expect.poll(()=>page.evaluate(()=>requests.filter(r=>r.type==='AUTO_ADJUST').length)).toBe(1);
    expect(await page.evaluate(()=>{const p=requests.find(r=>r.type==='AUTO_ADJUST').payload;return [p.maxShrinkDistance,p.maxShrinkPercent];})).toEqual([.25,20]);
    await page.reload();await page.locator('#c3d-btn-settings').click();await expect(distance).toHaveValue('25');await expect(percent).toHaveValue('20');
    await page.getByRole('button',{name:'Reset shrink limits',exact:true}).click();await expect(distance).toHaveValue('10');await expect(percent).toHaveValue('5');
});

test('settings record single keys, reject duplicates, persist direction and refresh hints',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await fixture(page);
    await page.locator('#c3d-keep-direction').check();
    await expect(page.locator('#c3d-adjust-direction')).not.toBeChecked();
    await page.locator('#c3d-adjust-direction').check();
    await page.locator('#c3d-btn-settings').click();
    await page.getByRole('button',{name:'Record Ground Snap shortcut',exact:true}).click();
    await page.keyboard.press('Alt+Shift+A');
    await expect(page.locator('#c3d-shortcut-message')).toContainText('Already assigned');
    await page.keyboard.press('Escape');
    await expect(page.locator('#c3d-shortcut-message')).toHaveText('Recording cancelled');
    await page.getByRole('button',{name:'Record Ground Snap shortcut',exact:true}).click();
    await page.keyboard.press('Shift');
    await expect(page.locator('#c3d-shortcut-message')).toContainText('supported key');
    await page.keyboard.press('z');
    await expect(page.locator('#c3d-shortcut-message')).toHaveText('Saved');
    await page.screenshot({path:'docs/verification/shortcuts-1.10.0.png'});
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await expect(page.locator('#c3d-btn-ground')).toHaveAttribute('title','Ground Snap · Z');
    await page.screenshot({path:'docs/verification/direction-controls-1.10.0.png'});
    await page.keyboard.press('Alt+Shift+A');
    await expect.poll(()=>page.evaluate(()=>requests.filter(r=>r.type==='AUTO_FIT').length)).toBe(1);
    expect(await page.evaluate(()=>requests.find(r=>r.type==='AUTO_FIT').payload.keepDirection)).toBe(true);
    await page.reload();
    await expect(page.locator('#c3d-keep-direction')).toBeChecked();
    await expect(page.locator('#c3d-adjust-direction')).toBeChecked();
    await expect(page.locator('#c3d-btn-ground')).toHaveAttribute('title','Ground Snap · Z');
    expect(errors).toEqual([]);
});

test('settings suppress actions, support clear/reset and ignore typing, extra modifiers and repeats',async({page})=>{
    await fixture(page);
    await page.locator('#c3d-btn-settings').click();
    await page.keyboard.press('Alt+Shift+A');
    expect(await page.evaluate(()=>requests.filter(r=>r.type==='AUTO_FIT').length)).toBe(0);
    await page.getByRole('button',{name:'Clear Ground Snap shortcut',exact:true}).click();
    await expect(page.getByRole('button',{name:'Record Ground Snap shortcut',exact:true})).toHaveText('Unassigned');
    await page.getByRole('button',{name:'Reset Ground Snap shortcut',exact:true}).click();
    await expect(page.getByRole('button',{name:'Record Ground Snap shortcut',exact:true})).toHaveText('Alt+Shift+G');
    await page.getByRole('button',{name:'Record Auto-Fit shortcut',exact:true}).click();
    await page.keyboard.press('x');
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.evaluate(()=>{
        const field=document.createElement('input');document.body.append(field);field.focus();
    });
    await page.keyboard.press('x');
    await page.evaluate(()=>document.activeElement.blur());
    await page.keyboard.press('Control+x');
    await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyX',repeat:true,bubbles:true})));
    expect(await page.evaluate(()=>requests.filter(r=>r.type==='AUTO_FIT').length)).toBe(0);
    await page.keyboard.press('x');
    await expect.poll(()=>page.evaluate(()=>requests.filter(r=>r.type==='AUTO_FIT').length)).toBe(1);
    await expect(page.locator('#c3d-btn-autofit')).toBeEnabled();
    await page.locator('#c3d-btn-settings').click();
    await page.getByRole('button',{name:'Reset all shortcuts',exact:true}).click();
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await expect(page.locator('#c3d-btn-autofit kbd')).toHaveText('Alt+Shift+A');
    await expect(page.locator('#c3d-btn-move')).toBeDisabled();
});

test('placement controls persist, validate and reach keyboard command payloads',async({page})=>{
    await fixture(page);
    await expect(page.locator('#c3d-origin-ground')).toBeChecked();
    await expect(page.locator('#c3d-ground-height')).toHaveValue('0');
    await expect(page.locator('#c3d-move-longitudinal')).toHaveValue('none');
    await page.locator('#c3d-origin-ground').check();
    await page.locator('#c3d-ground-height').fill('-.3');await page.locator('#c3d-move-longitudinal').selectOption('forward');
    await page.locator('#c3d-move-lateral').selectOption('right');
    await page.locator('.c3d-title').click();
    await page.keyboard.press('Alt+Shift+G');
    await expect.poll(()=>page.evaluate(()=>requests.filter(r=>r.type==='SNAP_GROUND').length)).toBe(1);
    expect(await page.evaluate(()=>{const p=requests.find(r=>r.type==='SNAP_GROUND').payload;return [p.useOriginGround,p.fallbackGroundHeight];})).toEqual([true,-.3]);
    await expect(page.locator('#c3d-btn-adjust')).toBeEnabled();await page.keyboard.press('Alt+Shift+B');await expect.poll(()=>page.evaluate(()=>requests.filter(r=>r.type==='AUTO_ADJUST').length)).toBe(1);
    expect(await page.evaluate(()=>requests.find(r=>r.type==='AUTO_ADJUST').payload.fallbackGroundHeight)).toBe(-.3);
    await expect(page.locator('#c3d-btn-autofit')).toBeEnabled();await page.locator('#c3d-btn-autofit').click();
    await expect.poll(()=>page.evaluate(()=>requests.filter(r=>r.type==='AUTO_FIT').length)).toBe(1);
    expect(await page.evaluate(()=>requests.find(r=>r.type==='AUTO_FIT').payload.fallbackGroundHeight)).toBe(-.3);
    await page.reload();await fixture(page);
    await expect(page.locator('#c3d-origin-ground')).toBeChecked();await expect(page.locator('#c3d-ground-height')).toHaveValue('-0.3');
    await expect(page.locator('#c3d-move-longitudinal')).toHaveValue('forward');await expect(page.locator('#c3d-move-lateral')).toHaveValue('right');
    await page.locator('#c3d-ground-height').fill('');await page.locator('#c3d-move-lateral').click();
    await expect(page.locator('#c3d-ground-height')).toHaveValue('-0.3');
});
