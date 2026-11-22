#!/usr/bin/env node
"use strict";
// Actual PINNED RELEASE-CANDIDATE release-center Chromium button -> actual
// isolated staging Supabase Auth+owner AAL2 -> QA-only real release job insert.
// The API returns a SYNTHETIC status baseline only to enable RC button.
// No baeguindex.com request, no real deploy/production Supabase changes.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {spawn}=require("node:child_process");
const {chromium}=require("playwright");
const REF="ycwuugggqbunlbwuzvbx",PROD="snvzwrexuqavnfvzgxqj";
const LOCAL="http://127.0.0.1:38738";
let phase="init";
const root=path.resolve(process.env.STAGE42_STATIC_DIR||"source/_preview_standalone_site");
const fixtureFile=process.env.STAGE42_FIXTURE_FILE||"qa/.stage42-qa-fixture.json";
function totpSeed(seed){
 const abc="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
 let bits=0,n=0;const r=[];
 for(const ch of seed.toUpperCase().replace(/[\s=]/g,"")){
  const v=abc.indexOf(ch);if(v<0)throw Error("INVALID_B32");
  n=(n<<5)|v;bits+=5;
  if(bits>=8){bits-=8;r.push((n>>>bits)&255)}
 }
 return Buffer.from(r);
}
function totp(seed){
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(
  BigInt(Math.floor(Date.now()/30000)),0);
 const h=crypto.createHmac("sha1",totpSeed(seed)).update(counter).digest();
 const o=h[h.length-1]&15;
 return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,"0");
}
async function main(){
 phase="load_fixture";
 const f=JSON.parse(fs.readFileSync(fixtureFile,"utf8"));
 assert.match(f.admin_email,/^qa-stage42-[a-f0-9]{32}@example\.invalid$/);
 assert.ok(f.admin_password.length>=65);
 assert.ok(fs.existsSync(path.join(root,"admin-updates.html")));
 phase="manifest";
 const m=JSON.parse(fs.readFileSync(path.join(root,"stage38-release-manifest.json"),"utf8"));
 assert.equal(m.supabase_project_ref,REF);
 assert.equal(m.source_sha,"5c95aadad971901a8222f83c52e93bf901a3aeb7");
 const server=spawn("python3",["-m","http.server","38738","--bind","127.0.0.1",
   "--directory",root],{stdio:"ignore"});
 let browser=null;
 try{
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){
   try{
    const resp=await fetch(LOCAL+"/admin.html",{signal:AbortSignal.timeout(1000)});
    if(resp.status===200){ready=true;break}
   }catch{}
   await new Promise(r=>setTimeout(r,250))
  }
  phase="http_ready";
  assert(ready,"local QA static host did not start");
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const context=await browser.newContext({serviceWorkers:"block"});
  const page=await context.newPage();
  const forbidden=[],rewritten=[];
  await context.route("**/*",async route=>{
   const url=route.request().url();let parsed;
   try{parsed=new URL(url)}catch{return route.abort()}
   const host=parsed.hostname.toLowerCase();
   if(["baeguindex.com","www.baeguindex.com",PROD+".supabase.co"].includes(host)){
    forbidden.push(host);return route.abort();
   }
   if(host===REF+".supabase.co"&&
      parsed.pathname==="/functions/v1/beagu-release-manager-v1"){
     parsed.pathname="/functions/v1/beagu-stage42-owner-button-release-once";
     rewritten.push(route.request().method());
     return route.continue({url:parsed.toString()});
   }
   return route.continue();
  });
  phase="admin_login_page";
  await page.goto(LOCAL+"/admin.html",{waitUntil:"domcontentloaded",timeout:35000});
  phase="admin_login_form";
  await page.locator("#adminLogin").waitFor({state:"visible",timeout:20000});
  await page.locator("#adminEmail").fill(f.admin_email);
  await page.locator("#adminPassword").fill(f.admin_password);
  await page.locator("#adminLoginForm button[type=submit]").click();
  phase="password_login_to_mfa";
  await page.locator("#adminMfa").waitFor({state:"visible",timeout:25000});
  assert.equal(await page.locator("#adminDashboard").isVisible(),false);
  console.log("PASS actual pinned RC browser password sign-in AAL1, MFA form visible");
  const enrollment=page.waitForResponse(resp=>
    resp.url().includes("/auth/v1/factors")&&resp.request().method()==="POST"&&resp.status()===200,
    {timeout:20000});
  phase="mfa_enrollment";
  await page.locator("#adminEnroll").click();
  const factor=await (await enrollment).json();
  const seed=factor?.totp?.secret||"";
  assert.match(seed,/^[A-Z2-7]{16,}$/i);
  await page.locator("#adminQrWrap").waitFor({state:"visible",timeout:15000});
  let elevated=false;
  for(let attempt=0;attempt<2&&!elevated;attempt++){
   await page.locator("#adminTotp").fill(totp(seed));
   await page.locator("#adminMfaForm button[type=submit]").click();
   try{
    await page.locator("#adminDashboard").waitFor({state:"visible",timeout:15000});
    elevated=true;
   }catch{}
  }
  phase="totp_elevation";
  assert(elevated,"real pinned RC TOTP UI did not gain AAL2");
  console.log("PASS real pinned RC browser TOTP AAL2 privileged dashboard");
  phase="release_page";
  const release=await page.goto(LOCAL+"/admin-updates.html",{
    waitUntil:"domcontentloaded",timeout:35000});
  assert.equal(release.status(),200);
  phase="release_mfa_gate";
  await page.locator("#releaseDashboard").waitFor({state:"visible",timeout:25000});
  assert.equal(await page.locator("#releaseLogin").isVisible(),false);
  assert.equal(await page.locator("#releaseStageApply").isEnabled(),true,
    "actual RC staging release button stays disabled with synthetic QA baseline");
  assert.equal(await page.locator("#releaseProdApply").isEnabled(),false);
  console.log("PASS real RC release-center AAL2 gate; STAGE button enabled, PRODUCTION button disabled");
  page.on("dialog",async d=>{
   if(d.type()==="confirm"&&d.message().includes("시험 웹"))await d.accept();
   else await d.dismiss();
  });
  phase="click_stage_apply";
  await page.locator("#releaseStageApply").click();
  phase="queue_confirmation";
  await page.waitForFunction(()=>{
   const message=document.querySelector("#releaseStatus")?.textContent||"";
   return message.includes("배포 요청 등록 완료");
  },null,{timeout:25000});
  await page.waitForFunction(()=>{
   const label=document.querySelector("#releaseQueueText")?.textContent||"";
   return label.includes("배포 대기");
  },null,{timeout:25000});
  assert.equal(await page.locator("#releaseStageApply").isEnabled(),false);
  assert.equal(await page.locator("#releaseProdApply").isEnabled(),false);
  assert.deepEqual(forbidden,[],"Production host was contacted!");
  assert(rewritten.length>=3,"Original RC status / apply / refresh API did not reach QA bridge");
  console.log("PASS actual original RC stage_apply BUTTON clicked; real AAL2 owner accepted, staging DB queued, UI displays pending, no production calls");
  await context.close();
 }finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
 }
}
main().catch((err)=>{
 console.error("FAIL stage42 browser at phase="+phase+" type="+String(err?.name||"unknown")+" (secrets suppressed)");
 process.exitCode=1;
});
