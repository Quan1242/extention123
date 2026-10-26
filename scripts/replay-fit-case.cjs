/* Reproduce real exports. currentBox is read ONLY after fitting, for evaluation. */
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const math=require('../extension/geometry_math.js');
function replay(data){
    const points=[...new Map([...data.roiPoints,...data.groundSupport].map(p=>[p.join(','),p])).values()];
    const start=performance.now(),index=new math.GroundIndex(points),ground=index.estimate(data.seedBox),groundDone=performance.now();
    const searchBox=math.autoFitSearchBox(data.seedBox,data.seedBox.label,ground),roi=math.extractBoxROI(points,searchBox,searchBox.margin);
    const cluster=math.selectSeedCluster(roi,data.seedBox,ground),clusterDone=performance.now();
    const fitted=math.fitBoxToCluster(cluster,data.seedBox.label,{...data.seedBox,ground,allowGroundFallback:true,rejectOversizedCluster:true}),done=performance.now();
    const reference=data.currentBox.points;
    const metrics=p=>({yawDegrees:p[5]*180/Math.PI,yawErrorDegrees:Math.acos(Math.min(1,Math.abs(Math.cos(p[5]-reference[5]))))*180/Math.PI,
        size:p.slice(6,9),center:p.slice(0,3),bottom:p[2]-p[8]/2,centerErrorMetres:Math.hypot(...p.slice(0,3).map((v,i)=>v-reference[i])),iou3D:math.orientedIoU(p,reference)});
    return {version:'1.4.2',jobId:data.jobId,frame:data.frame,clientId:data.clientId,
        source:'Exported ROI plus sampled groundSupport, deduplicated. Full raw frame was not included in 1.3.3 export. Reference is used only for evaluation.',
        counts:{availablePoints:points.length,roi:roi.length,cluster:cluster.length},ground,heading:math.estimateVerticalHeading(cluster,data.seedBox.points[5]),
        seedBox:data.seedBox,oldBox:data.fittedBox,newBox:{points:fitted,label:data.seedBox.label},referenceBox:data.currentBox,
        before:metrics(data.fittedBox.points),after:metrics(fitted),reference:metrics(reference),
        timingsMs:{ground:groundDone-start,roiAndCluster:clusterDone-groundDone,fit:done-clusterDone,total:done-start},
        timingScope:'Node CPU replay; excludes CVAT rendering and native save'};
}
if(require.main===module){
    const file=process.argv[2]||path.resolve(__dirname,'../tests/fixtures/autofit-job9426-frame29-box62.json');
    const report=replay(JSON.parse(fs.readFileSync(file,'utf8')));
    fs.writeFileSync(path.resolve(__dirname,'../docs/verification/autofit-real-case-1.4.2.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({ground:report.ground,counts:report.counts,before:report.before,after:report.after,timingsMs:report.timingsMs},null,2));
}
module.exports={replay};
