#!/usr/bin/env node
"use strict";
// STAGE40: disposable staging accounts; actual independent GitHub Pages HTTPS
// admin interface from immutable pinned RC. Browser network restricted to staging.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const crypto=require("node:crypto");
const {chromium}=require("playwright");
const staging="ycwuugggqbunlbwuzvbx";
const production="snvzwrexuqavnfvzgxqj";
const origin="https://noam0127.github.io";
const pageUrl=origin+"/beagu-index-qa/__stage40_auth__/admin.html";
const manifestUrl=origin+"/beagu-index-qa/stage40-hosted-auth-test-manifest.json";
function base32(secret){
 const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
 let bits=0,n=0;const buf=[];
 for(const c of secret.toUpperCase().replace(/[\s=]/g,"")){
  const v=chars.indexOf(c);if(v<0)throw Error("Invalid MFA base32 seed");
  n=(n<<5)|v;bits+=5;
  if(bits>=8){bits-=8;buf.push((n>>>bits)&255);}
 }
 return Buffer.from(buf);
}
function totp(seed,time=Date.now()){
 const counter=Buffer.alloc(8);
 counter.writeBigUInt64BE(BigInt(Math.floor(time/30000)),0);
 const digest=crypto.createHmac("sha1",base32(seed)).update(counter).digest();
 const off=digest[digest.length-1]&0xf;
 const num=(digest.readUInt32BE(off)&0x7fffffff)%1000000;
 return String(num).padStart(6,"0");
}
async function main(){
 const fixtureFile=process.env.STAGE40_AUTH_FIXTURE_FILE||"";
 assert.ok(fixtureFile,"Staging test account fixture path missing");
 const provided=JSON.parse(fs.readFileSync(fixtureFile,"utf8"));
 const fixture={email:provided.admin_email,password:provided.admin_password};
 assert.match(fixture.email,/^stage40-browser-\d+-[a-f0-9]{8}@example\.invalid$/);
 assert.ok(fixture.password&&fixture.password.length>=50,"Test password missing");
 const remoteManifest=await fetch(manifestUrl,{signal:AbortSignal.timeout(20000)});
 assert.equal(remoteManifest.status,200,"Authenticated temporary QA artifact not actually deployed");
 const manifest=await remoteManifest.json();
 assert.equal(manifest.source_sha,"5c95aadad971901a8222f83c52e93bf901a3aeb7");
 assert.equal(manifest.staging_ref,staging);
 assert.equal(manifest.root_static_auth_disabled,true);
 assert.equal(manifest.test_route,"__stage40_auth__/admin.html");
 const ready=await fetch(pageUrl,{signal:AbortSignal.timeout(20000)});
 assert.equal(ready.status,200,"Temporary admin route not available over hosted HTTPS");
 const html=await ready.text();
 assert.ok(html.includes("beagu-admin-access-v1.js"));
 assert.ok(!html.includes("stage38-cdn-static-guard"));
 assert.ok(html.includes("beagu-stage40-admin-access"),"Temporary staging-only endpoint routing missing");
 const rootUI=await fetch(origin+"/beagu-index-qa/admin.html",{signal:AbortSignal.timeout(20000)});
 assert.equal(rootUI.status,200);
 assert.ok((await rootUI.text()).includes("stage38-cdn-static-guard"),
  "Root site must remain login-disabled");
 console.log("PASS: independent hosted QA SHA, HTTPS, login-capable temporary route and public-root disable guard");
 let browser=null;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const context=await browser.newContext({serviceWorkers:"block"});
  const page=await context.newPage();
  const forbidden=[],observed=[];
  await context.route("**/*",async route=>{
   const u=route.request().url();let host="";
   try{host=new URL(u).hostname.toLowerCase();}catch{}
   if(["baeguindex.com","www.baeguindex.com",production+".supabase.co"].includes(host)){
    forbidden.push(host);return route.abort();
   }
   if(host===staging+".supabase.co")observed.push(u.includes("/auth/v1/")?"AUTH":"STAGING_API");
   return route.continue();
  });
  const start=await page.goto(pageUrl,{waitUntil:"domcontentloaded",timeout:30000});
  assert.equal(start?.status(),200);
  await page.locator("#adminLogin").waitFor({state:"visible",timeout:18000});
  assert.equal(await page.locator("#adminDashboard").isVisible(),false);
  console.log("PASS: actual pinned RC Chromium login form visible and privileged dashboard hidden");
  await page.locator("#adminEmail").fill(fixture.email);
  await page.locator("#adminPassword").fill(fixture.password);
  await page.locator("#adminLoginForm button[type=submit]").click();
  await page.locator("#adminMfa").waitFor({state:"visible",timeout:25000});
  assert.equal(await page.locator("#adminDashboard").isVisible(),false);
  assert.equal(await page.locator("#adminPassword").inputValue(),"");
  console.log("PASS: actual Chromium password login AAL1 reached MFA-only screen; password cleared");

  const enrollmentRes=page.waitForResponse(res=>
    res.url().includes("/auth/v1/factors") &&
    res.request().method()==="POST" && res.status()===200, {timeout:15000});
  await page.locator("#adminEnroll").click();
  const mfaResponse=await enrollmentRes;
  const payload=await mfaResponse.json();
  const secret=payload?.totp?.secret||"";
  assert.match(secret,/^[A-Z2-7]{16,}$/i,"MFA enrollment response missing secret");
  await page.locator("#adminQrWrap").waitFor({state:"visible",timeout:15000});
  console.log("PASS: actual browser enrolled a staging-only TOTP factor, QR visible");

  const code=totp(secret);
  await page.locator("#adminTotp").fill(code);
  await page.locator("#adminMfaForm button[type=submit]").click();
  let mfaPass=false;
  try{await page.locator("#adminDashboard").waitFor({state:"visible",timeout:14000});mfaPass=true;}
  catch{
    // If the thirty-second TOTP counter changed during the first attempt,
    // generate a new code and retry once, without exposing the seed.
    await page.locator("#adminTotp").fill(totp(secret));
    await page.locator("#adminMfaForm button[type=submit]").click();
    await page.locator("#adminDashboard").waitFor({state:"visible",timeout:17000});
    mfaPass=true;
  }
  assert.equal(mfaPass,true);
  await page.waitForFunction(()=>{
    const s=document.querySelector("#adminDataAsOf")?.textContent||"";
    return s.includes("집계 시각:");
  },null,{timeout:25000});
  const notice=(await page.locator("#adminNotice").innerText()).trim();
  assert.match(notice,/관리자 인증 완료/);
  console.log("PASS: real Chromium TOTP elevated verified AAL2; privileged dashboard and genuine staging metrics rendered");
  assert.deepEqual(forbidden,[],"Production domain requested during Auth UI E2E");
  assert.ok(observed.includes("AUTH")&&observed.includes("STAGING_API"),
    "Real browser Auth and staging-only API calls were not observed");
  console.log("PASS: real browser called isolated staging Auth/API only; zero production requests");

  // Revocation: a stale AAL2 JWT must no longer authorize admin data.
  const stale=await page.evaluate(async()=>{
    const {data}=await supabaseClient.auth.getSession();
    const old=data?.session?.access_token||"";
    await supabaseClient.auth.signOut();
    return old;
  });
  assert.ok(stale.length>100,"Missing retired admin session JWT");
  const expired=await fetch("https://"+staging+".supabase.co/functions/v1/beagu-admin-access",{
    method:"POST",redirect:"manual",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+stale,
      "Origin":origin},
    body:JSON.stringify({action:"verify"})
  });
  assert.ok([401,403].includes(expired.status),
    "Revoked admin token must fail closed: "+expired.status);
  console.log("PASS: revoked AAL2 admin token denied");

  // A confirmed but non-admin real Auth account must never reach the MFA
  // onboarding screen or dashboard, nor receive an admin status grant.
  await page.setViewportSize({width:390,height:844});
  await page.goto(pageUrl,{waitUntil:"domcontentloaded",timeout:30000});
  await page.locator("#adminLogin").waitFor({state:"visible",timeout:18000});
  await page.locator("#adminEmail").fill(provided.member_email);
  await page.locator("#adminPassword").fill(provided.member_password);
  await page.locator("#adminLoginForm button[type=submit]").click();
  await page.locator("#adminLogin").waitFor({state:"visible",timeout:20000});
  await page.waitForTimeout(1200);
  assert.equal(await page.locator("#adminDashboard").isVisible(),false);
  assert.equal(await page.locator("#adminMfa").isVisible(),false);
  const memberNotice=(await page.locator("#adminNotice").innerText()).trim();
  assert.match(memberNotice,/권한|확인|로그인/, "Ordinary member must remain locked out");
  console.log("PASS: real HTTPS Chromium mobile member denied admin UI (cross-role)");
  assert.deepEqual(forbidden,[],"Production network request in two-user Auth test");
  await context.close();
 }finally{
  if(browser)await browser.close();

 }
}
main().catch(err=>{
 // Never print any password, OAuth bearer, TOTP seed or access token.
 console.error("FAIL: hosted stage40 two-user Auth/MFA E2E (details withheld)");
 process.exitCode=1;
});
