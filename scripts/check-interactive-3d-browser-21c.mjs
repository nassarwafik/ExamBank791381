#!/usr/bin/env node
// Phase 21C real Chrome certification: mobile/desktop RTL, rotate/zoom, semantic selection, touch and print.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const out=path.resolve(process.env.HARNESS_OUT||path.join(root,".harness-21c"));
const checks=[];const check=(name,ok,detail="")=>{checks.push({name,ok:!!ok,detail});console.log((ok?"PASS":"FAIL")+" "+name+" "+detail);};
let chromium;try{({chromium}=createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR||root,"package.json"))("playwright-core"));}catch{console.error("playwright-core unavailable");process.exit(2);}
fs.rmSync(out,{recursive:true,force:true});
await build({configFile:path.join(root,"vite.config.ts"),root,logLevel:"warn",build:{outDir:out,emptyOutDir:true,rollupOptions:{input:path.join(root,"browser-harness/interactive-3d.html")}}});
const MIME={".js":"text/javascript",".html":"text/html; charset=utf-8",".css":"text/css",".svg":"image/svg+xml",".woff2":"font/woff2"};
const server=http.createServer((req,res)=>{const u=new URL(req.url,"http://localhost"),full=path.resolve(out,"."+decodeURIComponent(u.pathname));
 if(!full.startsWith(out+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);res.end("not found");return;}
 res.writeHead(200,{"content-type":MIME[path.extname(full)]||"application/octet-stream","cache-control":"no-store"});fs.createReadStream(full).pipe(res);});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:["--no-sandbox"]});
const errors=[],foreign=[],report={};
try{
 for(const width of [320,360,600,800,1024,1280]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  page.on("pageerror",e=>errors.push(String(e)));page.on("request",r=>{if(!r.url().startsWith(origin))foreign.push(r.url());});
  await page.goto(origin+"/browser-harness/interactive-3d.html",{waitUntil:"networkidle"});await page.waitForSelector('[data-testid="water"] .i3d-scene');
  const info=await page.evaluate(()=>({viewport:innerWidth,doc:document.documentElement.scrollWidth,figures:document.querySelectorAll(".i3d").length,scenes:document.querySelectorAll(".i3d-scene").length,
    rtl:document.documentElement.dir,arabic:document.querySelector("h1")?.textContent,cube:document.querySelector('[data-testid="cube-question"] .i3d-scene')?.getBoundingClientRect().width}));
  report[width]=info;check("B"+width+" RTL five domains / no page overflow",info.rtl==="rtl"&&info.figures>=5&&info.scenes>=5&&info.doc<=info.viewport+2&&info.cube>=150,JSON.stringify(info));
  await page.screenshot({path:path.join(out,"interactive3d-"+width+".png"),fullPage:true});
  if(width===360){
    const q=page.locator('[data-testid="cube-question"]'),svg=q.locator(".i3d-scene"),face=()=>q.locator(".i3d-face").first().getAttribute("points");
    const before=await face();await svg.focus();await page.keyboard.press("ArrowRight");check("K1 keyboard rotates geometry",(await face())!==before);
    await page.keyboard.press("Home");check("K2 Home restores authored camera",(await face())===before);
    await page.keyboard.press("+");check("K3 keyboard zoom changes projected geometry",(await face())!==before);await page.keyboard.press("Home");
    const box=await svg.boundingBox();if(box){await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.68,box.y+box.height*.58,{steps:5});await page.mouse.up();}
    check("P1 pointer drag rotates geometry",(await face())!==before);await q.getByRole("button",{name:"إعادة العرض"}).click();
    await q.getByRole("button",{name:/الوجه العلوي/}).click();check("S3 semantic list selection emits face key",(await page.locator('[data-testid="cube-answer"]').textContent()).includes("face:top"));
    await page.locator('[data-testid="heart-question"] [data-i3d-target="object:leftVentricle"]').first().click();
    check("S4 SVG anatomy selection emits object key",(await page.locator('[data-testid="heart-answer"]').textContent()).includes("object:leftVentricle"));
  }
  if(width===1024){
    const pdf=await page.pdf({format:"A4",printBackground:true});check("R1 print PDF nonempty",pdf.length>10000,"bytes="+pdf.length);fs.writeFileSync(path.join(out,"interactive3d-print.pdf"),pdf);
    await page.emulateMedia({media:"print"});const print=await page.locator('[data-testid="cube-question"]').evaluate(el=>{const vis=n=>!!n&&getComputedStyle(n).display!=="none"&&n.getBoundingClientRect().width>0;return{scene:vis(el.querySelector(".i3d-scene")),controls:vis(el.querySelector(".i3d-controls")),help:vis(el.querySelector(".i3d-help")),list:vis(el.querySelector(".i3d-target-list"))};});
    check("R2 print preserves model and hides interaction chrome",print.scene&&!print.controls&&!print.help&&!print.list,JSON.stringify(print));await page.emulateMedia({media:"screen"});
  }
  await page.close();
 }
 const touch=await browser.newPage({viewport:{width:360,height:800},hasTouch:true,isMobile:true});
 await touch.goto(origin+"/browser-harness/interactive-3d.html",{waitUntil:"networkidle"});await touch.getByRole("button",{name:/الوجه العلوي/}).tap();
 check("T1 touch semantic selection",(await touch.locator('[data-testid="cube-answer"]').textContent()).includes("face:top"));await touch.close();
 check("S1 no JavaScript runtime exceptions",errors.length===0,errors.slice(0,4).join(" | "));check("S2 no external asset/network hosts",foreign.length===0,foreign.slice(0,4).join(" | "));
}finally{fs.writeFileSync(path.join(out,"report.json"),JSON.stringify({checks,report,errors,foreign},null,2)+"\n");await browser.close();await new Promise(resolve=>server.close(resolve));}
if(checks.some(c=>!c.ok))process.exitCode=1;
