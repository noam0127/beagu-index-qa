#!/usr/bin/env node
"use strict";
/* Actual frozen RC admin release-center JS + HTML, Chromium interactions.
 * All API calls terminate in a page-local fake. Neither production nor staging
 * receives any request. This proves UI and request/queue/history contracts,
 * NOT actual GitHub Pages publishing.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve("rc");
const A="a".repeat(40),B="b".repeat(40);
async function run(){
 const html=fs.readFileSync(path.join(root,"admin-updates.html"),"utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
 const script=fs.readFileSync(path.join(root,"js/beagu-admin-updates-v1.js"),"utf8");
 assert.ok(html.includes('id="releaseStageApply"'));
 assert.ok(html.includes('id="releaseStageRollback"'));
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:"block"});
 const page=await context.newPage();
 let attemptedNetwork=[];
 page.on("request",x=>attemptedNetwork.push(x.url()));
 try {
  await page.setContent(html,{waitUntil:"domcontentloaded"});
  await page.evaluate(({A,B})=>{
    const state={
      production_sha:A,production_version:"qa-production-A",
      staging_sha:A,staging_version:"qa-preview-A",
      draft_sha:B,draft_version:"qa-preview-B",draft_summary:"Only QA synthetic UI",
      updated_at:"2026-11-23T00:00:00.000Z"
    };
    const env={
      state, job:null, stageHistory:[],prodHistory:[],commands:[],
      pending:null, deniedProduction:0
    };
    window.__stage40qa=env;
    window.SUPABASE_URL="https://qa.stage40.invalid";
    window.SUPABASE_PUBLISHABLE_KEY="test-no-network";
    window.supabaseClient={auth:{getSession:async()=>({
      data:{session:{access_token:"FAKE_UI_TEST_TOKEN_NOT_AUTH"}},error:null
    })}};
    window.confirm=()=>true;
    window.fetch=async (url,opts={})=>{
      if(!url.startsWith("https://qa.stage40.invalid/")) throw Error("Forbidden external network");
      const body=JSON.parse(opts.body);
      env.commands.push(body.action);
      const response=(code,obj)=>({ok:code>=200&&code<300,status:code,
        json:async()=>structuredClone(obj)});
      if(url.endsWith("beagu-admin-access")) return response(200,{
        permitted:true,mfa_verified:true,role:"owner"
      });
      if(body.action==="status"){
        return response(200,{
          state:env.state,job:env.job,
          staging_history:env.stageHistory,production_history:env.prodHistory,
          head_sha:B,suggested_draft:null
        });
      }
      if(body.action==="stage_apply"){
        if(env.job)return response(409,{error:"release_in_progress"});
        if(env.state.staging_sha===B)return response(409,{error:"already_on_staging"});
        env.job={
          id:"00000000-0000-4000-8000-000000004040",
          status:"queued",version:"qa-preview-B",
          target:"staging",created_at:"2026-11-23T00:00:00.000Z"
        };
        env.pending={action:"stage_apply",from:A,to:B,version:"qa-preview-B"};
        return response(200,{job_id:env.job.id});
      }
      if(body.action==="stage_rollback"){
        if(env.job)return response(409,{error:"release_in_progress"});
        if(env.state.staging_sha!==B)return response(409,{error:"no_staging_rollback"});
        env.job={
          id:"00000000-0000-4000-8000-000000004041",
          status:"queued",version:"qa-preview-A",
          target:"staging",created_at:"2026-11-23T00:05:00.000Z"
        };
        env.pending={action:"stage_rollback",from:B,to:A,version:"qa-preview-A"};
        return response(200,{job_id:env.job.id});
      }
      if(["prod_apply","prod_rollback","bootstrap","worker_next","worker_complete"].includes(body.action)){
        env.deniedProduction++;
        return response(403,{error:"NO_PRODUCTION_ACTION_ALLOWED"});
      }
      return response(400,{error:"UNKNOWN_ACTION"});
    };
    window.__stage40qa.complete=()=>{
      const command=env.pending;
      if(!command)throw Error("No queued simulated command");
      env.state.staging_sha=command.to;
      env.state.staging_version=command.version;
      env.stageHistory.unshift({
        action:command.action,
        version:command.version,
        summary:"Synthetic isolated QA UI test",
        from_sha:command.from,to_sha:command.to,
        deployed_at:"2026-11-23T00:06:00.000Z"
      });
      env.pending=null;env.job=null;
    };
  },{A,B});
  await page.addScriptTag({content:script});
  await page.locator("#releaseDashboard").waitFor({state:"visible",timeout:8000});
  assert.equal(await page.locator("#releaseStageVersion").innerText(),"qa-preview-A");
  assert.equal(await page.locator("#releaseProdVersion").innerText(),"qa-production-A");
  assert.equal(await page.locator("#releaseStageApply").isEnabled(),true);
  assert.equal(await page.locator("#releaseProdApply").isEnabled(),false);
  assert.equal(await page.locator("#releaseProdRollback").isEnabled(),false);
  console.log("PASS actual RC UI: safe A baseline, separate production label, draft B enabled");
  await page.locator("#releaseStageApply").click();
  await page.waitForFunction(()=>window.__stage40qa.pending?.action==="stage_apply");
  assert.equal(await page.locator("#releaseStageApply").isEnabled(),false);
  assert.match(await page.locator("#releaseQueueText").innerText(),/배포 대기/);
  assert.match(await page.locator("#releaseStatus").innerText(),/배포 요청 등록 완료/);
  await page.evaluate(()=>window.__stage40qa.complete());
  await page.locator("#releaseRefresh").click();
  await page.waitForFunction(()=>document.querySelector("#releaseStageVersion").textContent==="qa-preview-B");
  assert.equal(await page.locator("#releaseStageRollback").isEnabled(),true);
  assert.equal(await page.locator("#releaseProdVersion").innerText(),"qa-production-A");
  console.log("PASS actual RC UI: stage A→B queued, displayed only after simulated job completes; production untouched");
  await page.locator("#releaseStageRollback").click();
  await page.waitForFunction(()=>window.__stage40qa.pending?.action==="stage_rollback");
  assert.equal(await page.locator("#releaseStageRollback").isEnabled(),false);
  await page.evaluate(()=>window.__stage40qa.complete());
  await page.locator("#releaseRefresh").click();
  await page.waitForFunction(()=>document.querySelector("#releaseStageVersion").textContent==="qa-preview-A");
  const count=await page.locator("#releaseStageHistory article").count();
  assert.equal(count,2);
  assert.equal(await page.locator("#releaseProdVersion").innerText(),"qa-production-A");
  const evidence=await page.evaluate(()=>({
    commands:window.__stage40qa.commands,
    stage_history:window.__stage40qa.stageHistory.length,
    prod_history:window.__stage40qa.prodHistory.length,
    staging_sha:window.__stage40qa.state.staging_sha,
    production_sha:window.__stage40qa.state.production_sha,
    production_calls_denied:window.__stage40qa.deniedProduction
  }));
  assert.equal(evidence.staging_sha,A);
  assert.equal(evidence.production_sha,A);
  assert.ok(evidence.commands.includes("stage_apply")&&evidence.commands.includes("stage_rollback"));
  assert.ok(!evidence.commands.includes("prod_apply")&&!evidence.commands.includes("prod_rollback"));
  assert.equal(evidence.prod_history,0);
  assert.equal(attemptedNetwork.length,0,"No network requests permitted");
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator("#releaseStageVersion").isVisible(),true);
  assert.equal(await page.locator("#releaseStageRollback").isVisible(),true);
  assert.equal(await page.locator("#releaseProdVersion").isVisible(),true);
  console.log("PASS actual RC UI: stage rollback B→A and 2 history records, mobile visible, zero production activity/network");
  fs.mkdirSync("artifacts/stage40-release-ui",{recursive:true});
  fs.writeFileSync("artifacts/stage40-release-ui/result.json",
    JSON.stringify({result:"PASS",rc_sha:"5c95aadad971901a8222f83c52e93bf901a3aeb7",
      staging_actions:["stage_apply","stage_rollback"],
      history_count:2,production_state_unchanged:true,
      network_requests:0,actual_deployment_performed:false,
      test_type:"actual-ui-chromium-with-local-mocked-release-server",
      real_staging_admin_button_e2e_passed:false},null,2));
 }finally{await context.close();await browser.close();}
}
run().catch(e=>{console.error("FAIL stage40 release-center UI integration:",e.message);process.exitCode=1});
