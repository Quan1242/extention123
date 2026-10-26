const {test,expect}=require('@playwright/test');
test('preset edits persist per class and Auto-Fit uses exact custom dimensions with undo',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/demo/index.html');
    await page.locator('[data-case="2"]').click();
    await expect(page.locator('#c3d-preset-save')).toBeEnabled();
    const key=await page.locator('#c3d-preset-summary').textContent();
    const before=await page.evaluate(()=>__C3D_DEMO_TEST.snapshot().boxes.find(b=>b.id===2).points);
    const defaults=await page.locator('#c3d-preset-l').inputValue();
    // A generous family-sized preset encloses the chosen synthetic demo vehicle.
    await page.locator('#c3d-preset-l').fill('4.8');await page.locator('#c3d-preset-w').fill('2.0');await page.locator('#c3d-preset-h').fill('1.8');
    await page.locator('#c3d-preset-save').click();await expect(page.locator('#c3d-preset-summary')).toContainText('custom');
    await page.locator('#c3d-btn-autofit').click();await expect(page.locator('#c3d-toast')).toContainText('Auto-Fit updated');
    const fitted=await page.evaluate(()=>__C3D_DEMO_TEST.snapshot().boxes.find(b=>b.id===2).points);
    expect(fitted.slice(6,9)).toEqual([4.8,2,1.8]);
    const clearance=await page.evaluate(p=>Math.min(...__CVAT_COPILOT_MATH.cuboidVertices(p).map(([x,y,z])=>z)),fitted);
    expect(Math.abs(clearance)).toBeLessThan(.06);
    await page.screenshot({path:'docs/verification/preset-fit-1.11.0.png',fullPage:true});
    await page.locator('#demo-undo').click();expect(await page.evaluate(()=>__C3D_DEMO_TEST.snapshot().boxes.find(b=>b.id===2).points)).toEqual(before);
    await page.reload();await page.locator('[data-case="2"]').click();
    await expect(page.locator('#c3d-preset-l')).toHaveValue('4.8');await expect(page.locator('#c3d-preset-summary')).toContainText(key.split(' · ')[0]);
    await page.locator('#c3d-preset-reset').click();await expect(page.locator('#c3d-preset-l')).toHaveValue(defaults);
    expect(errors).toEqual([]);
});
test('invalid preset is not stored and unsaved inputs do not alter Auto-Fit settings',async({page})=>{
    await page.goto('http://127.0.0.1:4173/demo/index.html');await page.locator('[data-case="2"]').click();
    await expect(page.locator('#c3d-preset-save')).toBeEnabled();
    const before=await page.locator('#c3d-preset-summary').textContent();
    await page.locator('#c3d-preset-l').fill('-2');await page.locator('#c3d-preset-save').click();
    await expect(page.locator('#c3d-toast')).toContainText('positive dimensions');
    expect(await page.locator('#c3d-preset-summary').textContent()).toEqual(before);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('c3d.settings.v1')||'null')?.presetOverrides||{})).toEqual({});
});
