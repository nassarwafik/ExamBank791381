#!/usr/bin/env node
// Phase 21B real Chromium certification. Run after npm run build; requires playwright-core + system Chrome.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-21b"));
const checks = [];
const check = (name, ok, detail="") => { checks.push({ name, ok:!!ok, detail }); console.log((ok?"PASS":"FAIL")+" "+name+" "+detail); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root,"package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out,{recursive:true,force:true});
await build({configFile:path.join(root,"vite.config.ts"),root,logLevel:"warn",build:{outDir:out,emptyOutDir:true,rollupOptions:{input:path.join(root,"browser-harness/function-surfaces.html")}}});
const MIME={".js":"text/javascript",".html":"text/html; charset=utf-8",".css":"text/css",".svg":"image/svg+xml",".woff2":"font/woff2"};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,"http://localhost");
  const full=path.resolve(out,"."+decodeURIComponent(url.pathname));
  if(!full.startsWith(out+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);res.end("not found");return;}
  res.writeHead(200,{"content-type":MIME[path.extname(full)]||"application/octet-stream","cache-control":"no-store"});
  fs.createReadStream(full).pipe(res);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:["--no-sandbox"]});
const errors=[],foreign=[],report={};
try{
  for(const width of [320,360,600,800,1024,1280]){
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
    page.on("pageerror",e=>errors.push(String(e)));
    page.on("request",r=>{if(!r.url().startsWith(origin))foreign.push(r.url());});
    await page.goto(origin+"/browser-harness/function-surfaces.html",{waitUntil:"networkidle"});
    await page.waitForSelector('[data-testid="surface-dome"] .ex3d-scene');
    const info=await page.evaluate(()=>({
      viewport:innerWidth,doc:document.documentElement.scrollWidth,
      figures:document.querySelectorAll(".ex3d").length,
      scenes:document.querySelectorAll(".ex3d-scene").length,
      polygons:document.querySelectorAll('[data-testid="surface-paraboloid"] .ex3d-scene polygon').length,
      rtl:document.documentElement.dir,
      arabic:document.querySelector("h1")?.textContent,
      svg:document.querySelector('[data-testid="surface-paraboloid"] .ex3d-scene')?.getBoundingClientRect().width
    }));
    report[width]=info;
    check("B"+width+" RTL four surfaces / no page overflow",info.rtl==="rtl"&&info.figures>=5&&info.scenes>=5&&info.polygons>0&&info.doc<=info.viewport+2&&info.svg>=150,JSON.stringify(info));
    await page.screenshot({path:path.join(out,"surface-"+width+".png"),fullPage:true});

    if(width===360){
      const q=page.locator('[data-testid="surface-paraboloid"]');
      const svg=q.locator(".ex3d-scene");
      const first=()=>q.locator(".ex3d-scene polygon").first().getAttribute("points");
      const before=await first();
      await svg.focus();
      await page.keyboard.press("ArrowRight");
      const keyboard=await first();
      check("K1 keyboard arrow rotates surface",keyboard!==before);
      await page.keyboard.press("Home");
      check("K2 Home restores authored/default camera",(await first())===before);
      const box=await svg.boundingBox();
      if(box){
        await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
        await page.mouse.down();
        await page.mouse.move(box.x+box.width*.68,box.y+box.height*.58,{steps:5});
        await page.mouse.up();
      }
      check("P1 pointer drag rotates the same surface",(await first())!==before);
      await q.getByRole("button",{name:"إعادة العرض"}).click();
      check("P2 reset button restores surface",(await first())===before);
    }

    if(width===1024){
      const q=page.locator('[data-testid="surface-paraboloid"]');
      const pdf=await page.pdf({format:"A4",printBackground:true});
      check("R1 browser print PDF nonempty",pdf.length>10000,"bytes="+pdf.length);
      fs.writeFileSync(path.join(out,"surface-print.pdf"),pdf);
      await page.emulateMedia({media:"print"});
      const print=await q.evaluate(el=>{
        const vis=n=>!!n&&getComputedStyle(n).display!=="none"&&n.getBoundingClientRect().width>0;
        return {
          scene:vis(el.querySelector(".ex3d-scene")),
          controls:vis(el.querySelector(".ex3d-controls")),
          help:vis(el.querySelector(".ex3d-help")),
          table:vis(el.querySelector(".ex3d-scroll"))
        };
      });
      check("R2 print keeps surface/table and hides interaction chrome",print.scene&&!print.controls&&!print.help&&print.table,JSON.stringify(print));
      await page.emulateMedia({media:"screen"});
    }
    await page.close();
  }
  check("S1 no JavaScript runtime exceptions",errors.length===0,errors.slice(0,4).join(" | "));
  check("S2 no external asset/network hosts",foreign.length===0,foreign.slice(0,4).join(" | "));
}finally{
  fs.writeFileSync(path.join(out,"report.json"),JSON.stringify({checks,report,errors,foreign},null,2)+"\n");
  await browser.close(); await new Promise(resolve=>server.close(resolve));
}
if(checks.some(c=>!c.ok)) process.exitCode=1;
