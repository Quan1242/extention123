const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.C3D_PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json'};
const server=http.createServer((req,res)=>{
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch(_){res.writeHead(400).end();return;}
    const filename=path.resolve(root,'.'+(pathname==='/'?'/demo/index.html':pathname));
    if(!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    if(!['/demo/','/extension/','/dist/'].some(prefix=>pathname.startsWith(prefix))&&pathname!=='/'){res.writeHead(404).end();return;}
    fs.readFile(filename,(error,data)=>{if(error){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});
});
server.listen(port,'127.0.0.1',()=>console.log(`Demo: http://127.0.0.1:${port}/`));
