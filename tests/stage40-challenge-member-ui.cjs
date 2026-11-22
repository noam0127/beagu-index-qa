#!/usr/bin/env node
"use strict";
/* Real immutable RC challenge member UI and user gestures. All responses fake.
 * No real Auth signup, mail, referral, GitHub deploy or production HTTP.
 * REAL back-end Lv3 cross-account proof resides in run 45054501623.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve("rc");
const source=fs.readFileSync(path.join(root,"challenge.html"),"utf8")
 .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
const js=fs.readFileSync(path.join(root,"js/challenge-member-auth-v1.js"),"utf8");
const STAGE="http://127.0.0.1:43870/challenge.html";
const token="a".repeat(64),deviceSecret="f".repeat(64);
async function run(){
 const browser=await chromium.launch({headless:true});
 try {
  for(const variant of ["desktop","mobile"]){
   const ctx=await browser.newContext({
    viewport:variant==="desktop"?{width:1440,height:900}:{width:390,height:844},
    isMobile:variant==="mobile",hasTouch:variant==="mobile",serviceWorkers:"block"
   });
   const page=await ctx.newPage();
   const realNetwork=[];
   await page.route("**/*",async(route)=>{
    const request=route.request(),u=request.url();
    if(u===STAGE){return route.fulfill({status:200,contentType:"text/html;charset=utf-8",body:source});}
    realNetwork.push(u.split("?")[0]);
    return route.abort();
   });
   await page.addInitScript(({token,deviceSecret})=>{
    sessionStorage.setItem("beagu-level-session-v1",token);
    localStorage.setItem("beagu-referral-device-secret-v1",deviceSecret);
    const state={confirmed:false,signedIn:false,signupRequested:false,linked:false,
      denyFirstLink:true,commands:[],memberLinkedEvents:0};
    window.__stage40member=state;
    window.addEventListener("beagu:member-linked",()=>state.memberLinkedEvents++);
    window.supabaseClient={auth:{
      getSession:async()=>({data:{session:state.signedIn?{access_token:"UI_FAKE_JWT"}:null},error:null}),
      getUser:async()=>({data:{user:state.signedIn&&state.confirmed?
        {id:"fake-only",email_confirmed_at:"2026-11-23T00:00:00Z",is_anonymous:false,
         user_metadata:{beagu_sms_opt_in:false}}:null},error:null}),
      signUp:async({email,password,options})=>{
        assert.match(email,/^stage40-ui@/);
        assert.ok(password.length>=10);
        assert.equal(options.data.beagu_sms_opt_in,false);
        state.signupRequested=true;return {data:{user:null,session:null},error:null};
      },
      signInWithPassword:async()=>{
        if(!state.confirmed)return {error:new Error("email_not_confirmed")};
        state.signedIn=true;return {error:null};
      },
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
      updateUser:async()=>({error:null}),
      signOut:async()=>{state.signedIn=false;return {error:null}}
    }};
    window.fetch=async(input,options={})=>{
      const url=String(input);
      const action=options.body?JSON.parse(options.body).action:"";
      state.commands.push(action||"writer_status");
      const reply=(status,obj)=>({ok:status>=200&&status<300,status,
        json:async()=>structuredClone(obj)});
      if(url.includes("/functions/v1/beagu-level-api")){
        if(action==="verify")return reply(200,{level:state.linked?3:2});
        return reply(403,{error:"NOT_ALLOWED"});
      }
      if(url.includes("/functions/v1/beagu-postit-api-v1")){
        if(url.includes("writer_status"))return reply(200,{linked:state.linked});
        if(action==="link_member"){
          if(state.denyFirstLink){state.denyFirstLink=false;
            return reply(403,{error:"MEMBERSHIP_ALREADY_CLAIMED"});}
          if(options.headers["X-Beagu-Level-Session"]!==token ||
            options.headers["Authorization"]!=="Bearer UI_FAKE_JWT" ||
            JSON.parse(options.body).deviceSecret!==deviceSecret)
            return reply(403,{error:"WRITER_IDENTITY_REQUIRED"});
          state.linked=true;return reply(200,{linked:true});
        }
      }
      throw new Error("Unexpected browser Auth/API call: "+url.slice(0,80));
    };
   },{token,deviceSecret});
   try{
    const r=await page.goto(STAGE,{waitUntil:"domcontentloaded"});
    assert.equal(r.status(),200);
    const state=page.locator("#beaguLevelState");
    await state.evaluate(el=>{el.dataset.level="2";});
    await page.addScriptTag({content:js});
    await page.evaluate(()=>window.dispatchEvent(new Event("beagu:level-state-updated")));
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("beagu:challenge-account-open",
      {detail:{mode:"signup"}})));
    const modal=page.locator("#challengeMemberOverlay");
    await modal.waitFor({state:"visible"});
    assert.equal(await page.locator("#challengeMemberTitle").innerText(),"Lv2 회원가입");
    await page.locator("#challengeMemberEmail").fill("stage40-ui@example.invalid");
    await page.locator("#challengeMemberPassword").fill("fake-ui-password-2026");
    await page.locator("#challengeMemberSubmit").click();
    await page.getByText("회원가입 요청을 완료했습니다. 이메일 인증 후 로그인해 주세요.").waitFor();
    assert.equal(await page.evaluate(()=>window.__stage40member.signupRequested),true);
    assert.equal(await page.locator("#challengeMemberPassword").inputValue(),"");
    await page.locator("#challengeMemberSwitch").click();
    assert.equal(await page.locator("#challengeMemberTitle").innerText(),"Lv2 로그인");
    await page.locator("#challengeMemberEmail").fill("stage40-ui@example.invalid");
    await page.locator("#challengeMemberPassword").fill("fake-ui-password-2026");
    await page.locator("#challengeMemberSubmit").click();
    await page.getByText("로그인에 실패했습니다. 이메일·비밀번호·인증 여부를 확인해 주세요.").waitFor();
    assert.equal(await page.evaluate(()=>window.__stage40member.signedIn),false);
    console.log("PASS "+variant+" RC UI: Lv2 signup message, clears password; unconfirmed account login denied");
    await page.evaluate(()=>{window.__stage40member.confirmed=true;});
    await page.locator("#challengeMemberPassword").fill("fake-ui-password-2026");
    await page.locator("#challengeMemberSubmit").click();
    await page.getByText("로그인 완료. 챌린지 발급 기기 확인을 눌러 작성 권한을 연결하세요.").waitFor();
    const link=page.locator("#challengeMemberLink");
    assert.equal(await link.isVisible(),true);
    await link.click();
    await page.getByText("이미 다른 계정에 연결된 챌린지 권한입니다.").waitFor();
    await link.click();
    await page.getByText("정식 회원 연결 완료. Lv3 인증과 포스트잇 기능을 확인해 주세요.").waitFor();
    assert.equal(await link.isVisible(),false);
    assert.equal(await page.evaluate(()=>window.__stage40member.memberLinkedEvents),1);
    const commands=await page.evaluate(()=>window.__stage40member.commands.slice());
    assert.ok(commands.includes("verify")&&commands.includes("writer_status")&&commands.includes("link_member"));
    assert.ok(realNetwork.every(x=>!x.includes("supabase.co")&&!x.includes("baeguindex.com")),
      "Unexpected production request attempted");
    console.log("PASS "+variant+" RC UI: confirmed mock member, denied foreign bind, correct device-linked event, zero external APIs");
   }finally{await ctx.close();}
  }
 }finally{await browser.close();}
}
run().catch(e=>{console.error("FAIL stage40 challenge UI mock regression:",e.message);process.exitCode=1});
