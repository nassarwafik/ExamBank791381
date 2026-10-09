#!/usr/bin/env node
// 21A.2 real Chromium acceptance. Run after "npm run build"; requires playwright-core
// and system Chrome/Chromium (same provider as the existing 17F browser harness).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-21a2"));
const checks = [];
const check = (name, ok, detail="") => { checks.push({ name, ok:!!ok, detail }); console.log((ok?"PASS":"FAIL") + " " + name + " " + detail); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root,"package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { force:true, recursive:true });
await build({ configFile:path.join(root,"vite.config.ts"),root,logLevel:"warn",build:{outDir:out,emptyOutDir:true,rollupOptions:{input:path.join(root,"browser-harness/function-graphs.html")}}});
const MIME = { ".js":"text/javascript", ".html":"text/html; charset=utf-8",".css":"text/css",".svg":"image/svg+xml",".woff2":"font/woff2" };
const server = http.createServer((req,res)=>{
  const url = new URL(req.url,"http://localhost");
  const full = path.resolve(out,"."+decodeURIComponent(url.pathname));
  if(!full.startsWith(out+path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()){res.writeHead(404);res.end("not found");return;}
  res.writeHead(200,{"content-type":MIME[path.extname(full)]||"application/octet-stream","cache-control":"no-store"});
  fs.createReadStream(full).pipe(res);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:["--no-sandbox"]});
const errors=[],foreign=[],report={};
try{
  for(const width of [320,360,600,800,1024,1280]){
    const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
    page.on("pageerror",e=>errors.push(String(e)));
    page.on("request",r=>{if(!r.url().startsWith(origin))foreign.push(r.url());});
    await page.goto(origin+"/browser-harness/function-graphs.html",{waitUntil:"networkidle"});
    await page.waitForSelector('[data-testid="graph-parametric"] .fg-svg');
    const info=await page.evaluate(()=>({viewport:innerWidth,doc:document.documentElement.scrollWidth,figures:document.querySelectorAll(".fg").length,graphs:document.querySelectorAll(".fg-stage .fg-svg").length,rtl:document.documentElement.dir,arabic:document.querySelector('h1')?.textContent,svg:document.querySelector('[data-testid="graph-question"] .fg-svg')?.getBoundingClientRect().width}));
    report[width]=info;
    check("B"+width+" RTL six kinds of graph / no PAGE horizontal overflow",info.rtl==="rtl" && info.figures>=6 && info.doc<=info.viewport+2 && info.svg>=150,JSON.stringify(info));
    await page.screenshot({path:path.join(out,"graph-"+width+".png"),fullPage:true});
    if(width===360){
      const q=page.locator('[data-testid="graph-question"]');
      await q.locator('[data-fg-option="point:p1"]').click();
      check("K1 accessible selection list emits semantic point ID",(await page.locator('[data-testid="graph-answer"]').textContent()).includes("point:p1"));
      await q.locator('[data-fg-target="point:p2"]').click();
      check("K2 pointer SVG and keyboard list agree on semantic answer",(await page.locator('[data-testid="graph-answer"]').textContent()).includes("point:p2"));
      const stage=q.locator(".fg-stage");
      await stage.focus();
      await page.keyboard.press("ArrowRight");
      check("K3 keyboard curve trace emits live mathematical readout",(await q.locator('[role="status"]').textContent()).includes("x ="));
      await page.keyboard.press("Shift+ArrowRight");
      check("K4 keyboard pan changes viewport",await stage.getAttribute("data-fg-zoomed")==="true");
      await page.keyboard.press("0");
      check("K5 0 restores authored viewport",await stage.getAttribute("data-fg-zoomed")===null);
    }
    if(width===1024){
      const q=page.locator('[data-testid="graph-question"]');
      // Review Fix 1 (C-3): an Arabic target detail keeps right-to-left reading order around its LTR mathematics
      const order=await page.evaluate(()=>{const d=document.querySelector('[data-testid="graph-area-question"] .fg-option-detail');const node=d?.firstChild;const t=node?.textContent??"";
        const left=w=>{const i=t.indexOf(w);if(i<0)return null;const r=document.createRange();r.setStart(node,i);r.setEnd(node,i+w.length);return r.getBoundingClientRect().left;};return{text:t,from:left("من"),to:left("إلى")};});
      check("R1 Arabic target detail reads right to left (\u0645\u0646 right of \u0625\u0644\u0649)",order.from!==null&&order.to!==null&&order.from>order.to,JSON.stringify(order));
      const ticks=sel=>q.evaluate((el,s)=>[...(el.querySelector(s)?.querySelectorAll("text")??[])].map(t=>t.textContent),sel);
      const authored=await ticks(".fg-stage .fg-svg");
      await q.locator('button[aria-label="تكبير"]').click();
      check("P1 original-viewport duplicate exists after zoom",await q.locator(".fg-print svg").count()===1);
      const pdf=await page.pdf({format:"A4",printBackground:true});
      check("P2 browser print PDF nonempty and completed",pdf.length>10000,"bytes="+pdf.length);
      fs.writeFileSync(path.join(out,"graph-print.pdf"),pdf);
      // Review Fix 1 (C-6): under print media the zoomed view and the controls are hidden and the visible drawing is the AUTHORED viewport
      await page.emulateMedia({media:"print"});
      const shown=await q.evaluate(el=>{const vis=n=>!!n&&getComputedStyle(n).display!=="none"&&n.getBoundingClientRect().width>0;
        return{zoomedHidden:!vis(el.querySelector(".fg-stage[data-fg-zoomed] .fg-svg")),printShown:vis(el.querySelector(".fg-print svg")),toolbarHidden:!vis(el.querySelector(".fg-toolbar"))};});
      const printed=await ticks(".fg-print svg"),zoomed=await ticks(".fg-stage .fg-svg");
      check("P4 print media shows only the authored viewport",shown.zoomedHidden&&shown.printShown&&shown.toolbarHidden&&printed.length>0&&JSON.stringify(printed)===JSON.stringify(authored)&&JSON.stringify(zoomed)!==JSON.stringify(authored),JSON.stringify({shown,authored,printed,zoomed}));
      await page.emulateMedia({media:"screen"});
      await q.locator('button[aria-label="إعادة الضبط إلى نافذة العرض الأصلية"]').click();
      check("P3 reset removes print duplicate",await q.locator(".fg-print").count()===0);
    }
    await page.close();
  }
  const touch=await browser.newPage({viewport:{width:360,height:780},hasTouch:true,isMobile:true});
  touch.on("pageerror",e=>errors.push(String(e)));
  await touch.goto(origin+"/browser-harness/function-graphs.html",{waitUntil:"networkidle"});
  await touch.locator('[data-testid="graph-question"] [data-fg-option="point:p1"]').tap();
  check("T1 real touch selection emits the same semantic ID",(await touch.locator('[data-testid="graph-answer"]').textContent()).includes("point:p1"));
  await touch.close();
  check("S1 no JavaScript runtime exceptions",errors.length===0,errors.slice(0,4).join(" | "));
  check("S2 no external asset/network hosts",foreign.length===0,foreign.slice(0,4).join(" | "));
}finally{
  fs.writeFileSync(path.join(out,"report.json"),JSON.stringify({checks,report,errors,foreign},null,2)+"\n");
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
if(checks.some(c=>!c.ok))process.exitCode=1;
