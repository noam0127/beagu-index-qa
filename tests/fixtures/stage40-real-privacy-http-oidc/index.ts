// Stage40 real staging HTTP release/privacy E2E. One signed GitHub Actions run
// only, no production URL, credential, school, or user account.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {createRemoteJWKSet,jwtVerify} from "https://esm.sh/jose@5.10.0";

const STAGING_REF="ycwuugggqbunlbwuzvbx";
const STAGING="https://"+STAGING_REF+".supabase.co";
const PUB="sb_publishable_c8h7TaIYONfP56Zc05K0Sw_SxyT3lZU";
const REPO="noam0127/beagu-index-qa";
const WORKFLOW=REPO+"/.github/workflows/stage40-live-privacy-http-once.yml@refs/heads/main";
const AUDIENCE="beagu-stage40-real-privacy-qa";
const school="TST9041";
const JWKS=createRemoteJWKSet(new globalThis.URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const reply=(code:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{
 status:code,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff"}
});
const makeToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),
 b=>b.toString(16).padStart(2,"0")).join("");
async function sha(v:string){
 const b=new TextEncoder().encode(v);
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",b)),
 x=>x.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST"||req.headers.has("Origin"))return reply(403,{error:"METHOD_OR_BROWSER"});
 const jwt=req.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
 if(!jwt)return reply(401,{error:"OIDC_REQUIRED"});
 try{
  const {payload}=await jwtVerify(jwt,JWKS,{
    issuer:"https://token.actions.githubusercontent.com",
    audience:AUDIENCE,algorithms:["RS256"]
  });
  if(payload.repository!==REPO || payload.workflow_ref!==WORKFLOW ||
    payload.ref!=="refs/heads/main" ||
    !["push","workflow_dispatch"].includes(String(payload.event_name||"")))
    return reply(403,{error:"SIGNED_WORKFLOW_DENIED"});
 }catch{return reply(403,{error:"OIDC_DENIED"});}
 const envUrl=Deno.env.get("SUPABASE_URL")||"";
 const role=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(envUrl!==STAGING||!role)return reply(503,{error:"NOT_ISOLATED_STAGING"});
 const db=createClient(envUrl,role,{auth:{persistSession:false,autoRefreshToken:false}});
 const hours=(n:number)=>new Date(Date.now()-n*3600000).toISOString();
 const code1=makeToken(),code2=makeToken();
 const countChecks:string[]=[];
 let materialized=false;
 let cleanupOk=false;
 const check=(label:string,condition:boolean)=>{
   if(!condition)throw Error("CHECK_FAIL_"+label);
   countChecks.push(label);
 };
 async function runApi(token:string,action="percentiles"){
  const response=await fetch(STAGING+"/functions/v1/beagu-level-api",{
    method:"POST",redirect:"manual",
    headers:{"Content-Type":"application/json","apikey":PUB,
      "Origin":"https://noam0127.github.io","X-Beagu-Session":token},
    body:JSON.stringify(action==="percentiles"?
      {action,schoolIds:[school]}:{action}),
    signal:AbortSignal.timeout(18000)
  });
  const value=await response.json().catch(()=>({}));
  return {status:response.status,value};
 }
 const empty=(r:{status:number;value:any})=>
    r.status===200&&Object.keys(r.value?.values||{}).length===0;
 const approved=(r:{status:number;value:any})=>
    r.status===200&&r.value?.values?.[school]===42&&
    Object.keys(r.value?.values||{}).length===1&&
    Object.keys(r.value||{}).length===1;
 const must=async<T>(label:string,operation:Promise<{data:T;error:unknown}>)=>{
   const r=await operation;
   if(r.error)throw Error("STAGING_DB_"+label);
   return r.data;
 };
 try{
  const [metricExisting,snapshotExisting,catalogExisting,sessionExisting]=await Promise.all([
    db.from("beagu_release_metrics_v2").select("school_id",{count:"exact",head:true}).eq("school_id",school),
    db.from("beagu_2026_results_snapshot").select("school_id",{count:"exact",head:true}).eq("school_id",school),
    db.from("beagu_metric_catalog").select("question_id",{count:"exact",head:true}).eq("survey_year",2026).eq("question_id","percentile"),
    db.from("beagu_level_sessions").select("token_sha256",{count:"exact",head:true}).eq("identity_campaign","STAGE40_PRIVACY_HTTP_TEST")
  ]);
  if([metricExisting,snapshotExisting,catalogExisting,sessionExisting].some(r=>r.error||r.count!==0))
    return reply(409,{error:"STAGING_FIXTURE_BASELINE_NOT_EMPTY"});
  materialized=true;
  await must("catalog",db.from("beagu_metric_catalog").insert({
    survey_year:2026,question_id:"percentile",access_level:1,verified:true,
    label:"학교 백분위",meaning:"시험용 서열이 아닌 합성 지표",
    interpretation:"시험 데이터에서 공개 지연만 확인",direction:"higher",
    unit:"점",spatial_scope:"합성 학교",value_type:"number",minimum:0,maximum:100
  }));
  await must("snapshot",db.from("beagu_2026_results_snapshot").insert({
    school_id:school,approved_at:hours(9),approval_status:"APPROVED",
    privacy_reviewed:true,questions:[{question_id:"Q01",value:42}]
  }));
  await must("metric",db.from("beagu_release_metrics_v2").insert({
    school_id:school,survey_year:2026,question_id:"percentile",
    access_level:1,value:"42",release_version:"stage40-qa-v1",
    approval_status:"APPROVED",privacy_status:"PASSED",
    identity_reviewed:true,question_reviewed:true,small_cell_reviewed:true,
    differencing_reviewed:true,approved_at:hours(2),
    approved_by:"STAGE40_SIGNED_QA",approval_evidence:"SYNTHETIC_QA_NOT_REAL_RESPONDENTS"
  }));
  await must("sessions",db.from("beagu_level_sessions").insert([
   {token_sha256:await sha(code1),access_level:1,expires_at:hours(-0.10),identity_campaign:"STAGE40_PRIVACY_HTTP_TEST"},
   {token_sha256:await sha(code2),access_level:2,expires_at:hours(-0.10),identity_campaign:"STAGE40_PRIVACY_HTTP_TEST"}
  ]));
  check("tier1_recent_rejected",empty(await runApi(code1)));
  check("tier2_metric_under_6h_rejected",empty(await runApi(code2)));

  await must("metric_age7",db.from("beagu_release_metrics_v2")
   .update({approved_at:hours(7)}).eq("school_id",school));
  check("tier1_under24h_rejected",empty(await runApi(code1)));
  check("tier2_after6h_allowed",approved(await runApi(code2)));

  await must("snapshot_review_off",db.from("beagu_2026_results_snapshot")
   .update({privacy_reviewed:false}).eq("school_id",school));
  check("tier2_without_snapshot_review_rejected",empty(await runApi(code2)));
  await must("snapshot_review_on",db.from("beagu_2026_results_snapshot")
   .update({privacy_reviewed:true}).eq("school_id",school));

  await must("metric_small_cell_off",db.from("beagu_release_metrics_v2")
   .update({small_cell_reviewed:false}).eq("school_id",school));
  check("tier2_without_small_cell_review_rejected",empty(await runApi(code2)));
  await must("metric_small_cell_on",db.from("beagu_release_metrics_v2")
   .update({small_cell_reviewed:true}).eq("school_id",school));

  await must("metric_age25",db.from("beagu_release_metrics_v2")
   .update({approved_at:hours(25)}).eq("school_id",school));
  check("tier1_after24h_allowed",approved(await runApi(code1)));
  check("tier2_after24h_allowed",approved(await runApi(code2)));

  await must("metric_privacy_fail",db.from("beagu_release_metrics_v2")
   .update({privacy_status:"FAILED"}).eq("school_id",school));
  check("tier1_failed_privacy_rejected",empty(await runApi(code1)));
  check("tier2_failed_privacy_rejected",empty(await runApi(code2)));
  const fake=await runApi(makeToken());
  check("unknown_session_rejected",fake.status===401);
  const invalid=await runApi(code2,"verify");
  check("valid_session_token_only",invalid.status===200&&invalid.value?.level===2);
 }catch(e){
  return reply(503,{error:e instanceof Error?e.message.slice(0,80):"STAGING_TEST_FAILED",
    checks_passed:countChecks.length,cleanup_in_finally:true});
 }finally{
  if(materialized){
   const del=await Promise.allSettled([
    db.from("beagu_level_sessions").delete().eq("identity_campaign","STAGE40_PRIVACY_HTTP_TEST"),
    db.from("beagu_release_metrics_v2").delete().eq("school_id",school),
    db.from("beagu_2026_results_snapshot").delete().eq("school_id",school),
    db.from("beagu_metric_catalog").delete().eq("survey_year",2026).eq("question_id","percentile")
   ]);
   cleanupOk=del.every(r=>r.status==="fulfilled"&&!r.value.error);
   console.log("stage40_test_cleanup",cleanupOk?"OK":"FAILED");
  }
 }
 // Due to JavaScript finally semantics, responses from the try/catch return
 // immediately after cleanup; do not leak any tokens or test row contents.
 return reply(200,{status:"PASS",checks_passed:countChecks.length,
  cleanup_ok:cleanupOk,real_http_tested:true,real_user_data_used:false});
});
