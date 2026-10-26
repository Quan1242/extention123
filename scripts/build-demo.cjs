const fs=require('node:fs');const path=require('node:path');const esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
async function main(){
    const result=await esbuild.build({entryPoints:[path.join(root,'demo/demo.js')],bundle:true,format:'iife',write:false,minify:true,legalComments:'eof'});
    const bundle=result.outputFiles[0].text;fs.writeFileSync(path.join(root,'demo/demo.bundle.js'),bundle);
    let html=fs.readFileSync(path.join(root,'demo/index.html'),'utf8');
    html=html.replace('<link rel="stylesheet" href="../extension/styles.css">',()=>'<style>'+fs.readFileSync(path.join(root,'extension/styles.css'),'utf8')+'</style>');
    for(const [url,file] of [['../extension/geometry_math.js','extension/geometry_math.js'],['../extension/job_9426_fallback.js','extension/job_9426_fallback.js'],['demo.bundle.js',null],['../extension/shortcut_settings.js','extension/shortcut_settings.js'],['../extension/content_script.js','extension/content_script.js']]){
        const code=(file?fs.readFileSync(path.join(root,file),'utf8'):bundle).replace(/<\/script/gi,'<\\/script');
        html=html.replace(`<script src="${url}"></script>`,()=>'<script>'+code+'</script>');
    }
    const out=path.join(root,'dist');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'CVAT-3D-Copilot-Demo.html'),html);
    fs.writeFileSync(path.join(out,'THIRD_PARTY_LICENSES.txt'),fs.readFileSync(path.join(root,'node_modules/three/LICENSE'),'utf8'));
    console.log('Built standalone offline demo: dist/CVAT-3D-Copilot-Demo.html');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
