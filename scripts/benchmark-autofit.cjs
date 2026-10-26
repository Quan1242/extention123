/* Synthetic CPU benchmark. Does not measure native CVAT render/network latency. */
const {performance}=require('node:perf_hooks'),fs=require('node:fs'),path=require('node:path');
const math=require('../extension/geometry_math.js');
const time=fn=>{const start=performance.now();const result=fn();return {result,ms:performance.now()-start};};
const box={points:[.5,0,1,0,0,Math.PI/2,1,1,2,0,0,0,0,0,0,0],ground:{a:0,b:0,c:0,accepted:true,confidence:.99}};
const total=500000,index=new math.SpatialPointIndex(total);
const build=time(()=>{for(let i=0;i<total;i++){if(i<60000)index.add((i%100)*.04-2,(Math.floor(i/100)%40)*.04-.8,1+(i%3)*.2);else index.add(30+(i%500)*.1,30+Math.floor(i/500)*.1,0);}});
const query=time(()=>index.query([-14,-14,-.4],[14,14,2.4]));
const cluster=time(()=>math.selectSeedCluster(query.result,box,box.ground));
const fit=time(()=>math.fitBoxToCluster(cluster.result,'vehicles',box));
const version=require('../extension/manifest.json').version;
const report={date:new Date().toISOString(),version,scope:'synthetic Node CPU; not live CVAT SLA',framePoints:total,roiPoints:query.result.length,clusterPoints:cluster.result.length,ms:{indexBuild:build.ms,roiQuery:query.ms,cluster:cluster.ms,fit:fit.ms,warmAutoFit:query.ms+cluster.ms+fit.ms},fittedPoints:fit.result};
fs.writeFileSync(path.resolve(__dirname,`../docs/verification/autofit-performance-${version}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
