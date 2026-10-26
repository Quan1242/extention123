/* Current offline verification; leaves historical evidence untouched. No credentials or HTTP. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),math=require('../extension/geometry_math.js');
if(process.argv.includes('--live')){console.error('Live verification needs authenticated editor and native Save/reload checks. This script makes no live requests.');process.exit(1);}
const ctx=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(path.join(root,'extension/job_9426_fallback.js'),'utf8'),ctx);
const shapes=ctx.window.__JOB_9426_FALLBACK_SHAPES,issues=math.auditFrame(shapes);
const tests=fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.cjs')).map(f=>path.join(root,'tests',f));
const result=spawnSync(process.execPath,['--test',...tests],{cwd:root,encoding:'utf8'});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
const files=['README.md','extension/manifest.json','extension/geometry_math.js','extension/cvat_adapter.js','extension/main_world_bridge.js','extension/content_script.js','extension/copilot_main.js','extension/copilot_panel.js','demo/demo.js','dist/CVAT-3D-Copilot-Demo.html'];
const tally=values=>values.reduce((a,x)=>(a[x]=(a[x]||0)+1,a),{});
const report={verifiedAt:new Date().toISOString(),version:JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8')).version,scope:'offline math and mocked native adapter; no live writes',unitTests:{passed:result.status===0,exitCode:result.status,output:result.stdout},fixture:{count:shapes.length,ground:'not audited: no LiDAR in fixture',issueEntries:issues.length,affectedBoxes:new Set(issues.flatMap(i=>i.boxIds)).size,severity:tally(issues.map(i=>i.severity))},browserTests:{evidence:'Run node node_modules/@playwright/test/cli.js test; see tests/browser and demo-1.2.png. Not run by this script.'},live:{editsVerified:false,selectionVerified:false,saveReloadVerified:false},hashes:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]))};
fs.writeFileSync(path.join(root,'docs/verification/current-verification.json'),JSON.stringify(report,null,2)+'\n');process.exitCode=result.status===0?0:1;
