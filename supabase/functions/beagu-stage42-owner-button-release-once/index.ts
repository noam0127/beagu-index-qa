// QA-ONLY signed bridge: actual owner TOTP AAL2 -> real RC admin button ->
// staging-only release job queue -> separately signed GitHub worker -> real QA Pages.
// The status endpoint deliberately reports a SYNTHETIC baseline to enable the
// unchanged release-center button. No production-sha DB value is ever written.
// DO NOT deploy to snvzwrexuqavnfvzgxqj or allow production domain Origins.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {createRemoteJWKSet,jwtVerify} from "https://esm.sh/jose@5.10.0";
const REF="ycwuugggqbunlbwuzvbx";
const ROOT="https://"+REF+".supabase.co";
const QA_REPO="noam0127/beagu-index-qa";
const WORKFLOW=QA_REPO+"/.github/workflows/stage42-owner-button-queue-real.yml@refs/heads/main";
const A="640f66c844a10bd894d4f6d31d0f4601c38d5b33";
const B="5c95aadad971901a8222f83c52e93bf901a3aeb7";
const VERSION="v1.1.0-stage42-qa";
const ORIGIN="http://127.0.0.1:38738";
const PROJECT_URL=Deno.env.get("SUPABASE_URL")||"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(PROJECT_URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const send=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":ORIGIN,
  "Access-Control-Allow-Headers":"authorization,apikey,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"
}});
const err=(reason:string,status=403)=>send({error:reason},status);
const validUuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function must(ok:unknown,reason:string):asserts ok{if(!ok)throw Error(reason);}
async function baseGuard(){
 must(PROJECT_URL===ROOT&&KEY.length>35,"WRONG_PROJECT");
 const anchor=await db.from("schools").select("school_id").eq("school_id","STAGE38-FICTIONAL-001").maybeSingle();
 must(!anchor.error&&!!anchor.data,"QA_ANCHOR_MISSING");
 const {data:s,error:se}=await db.from("beagu_site_release_state_v1").select("*").eq("id",1).single();
 must(!se&&!!s&&s.production_sha===null,"QA_PRODUCTION_STATE_NOT_EMPTY");
 const p=await db.from("beagu_site_release_jobs_v1").select("id",{count:"exact",head:true}).eq("target","production");
 const h=await db.from("beagu_site_release_history_v1").select("id",{count:"exact",head:true}).eq("target","production");
 must(!p.error&&!h.error&&p.count===0&&h.count===0,"QA_PRODUCTION_RECORDS_PRESENT");
 return s;
}
async function list(table:string,fields:string){
 const {data,error}=await db.from(table).select(fields).order("created_at",{ascending:true}).limit(5);
 if(error)throw Error("QA_READ_"+table+"_FAILED");
 return data||[];
}
async function jobs(){
 const {data,error}=await db.from("beagu_site_release_jobs_v1").select("*").order("created_at",{ascending:true}).limit(5);
 if(error)throw Error("QA_JOB_QUERY_FAILED");
 must((data||[]).every(j=>j.target==="staging"&&j.version===VERSION),"FOREIGN_JOB_PRESENT");
 return data||[];
}
async function histories(){
 const {data,error}=await db.from("beagu_site_release_history_v1").select("*").order("deployed_at",{ascending:true}).limit(5);
 if(error)throw Error("QA_HISTORY_QUERY_FAILED");
 must((data||[]).every(j=>j.target==="staging"&&j.version===VERSION),"FOREIGN_HISTORY_PRESENT");
 return data||[];
}
async function githubClaims(jwt:string){
 try{
  const {payload}=await jwtVerify(jwt,JWKS,{issuer:"https://token.actions.githubusercontent.com",
   audience:"beagu-stage42-owner-button-release-qa"});
  if(payload.repository===QA_REPO&&payload.ref==="refs/heads/main"&&
    payload.workflow_ref===WORKFLOW&&
    ["push","workflow_dispatch"].includes(String(payload.event_name))&&
    /^[a-f0-9]{40}$/.test(String(payload.sha||"")))return true;
 }catch{}
 return false;
}
async function realOwner(jwt:string){
 const {data:user,error}=await db.auth.getUser(jwt);
 if(error||!user.user?.id)return null;
 let claims:Record<string,unknown>={};
 try{
  const p=jwt.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
  claims=JSON.parse(atob(p.padEnd(Math.ceil(p.length/4)*4,"=")));
 }catch{return null;}
 if(claims.sub!==user.user.id||claims.aal!=="aal2"||
    typeof claims.session_id!=="string"||!validUuid.test(claims.session_id))return null;
 const a=await db.from("beagu_admin_accounts").select("role,enabled")
   .eq("user_id",user.user.id).maybeSingle();
 if(a.error||a.data?.enabled!==true||a.data?.role!=="owner")return null;
 const m=await db.rpc("beagu_admin_active_mfa_session",{
    p_user:user.user.id,p_session:claims.session_id});
 if(m.error||m.data!==true)return null;
 return user.user.id;
}
async function createUser(input:any){
 const s=await baseGuard();
 const u=await db.auth.admin.listUsers({page:1,perPage:2});
 const a=await db.from("beagu_admin_accounts").select("*",{count:"exact",head:true});
 must(!u.error&&!a.error&&u.data.users.length===0&&a.count===0,
  "QA_AUTH_USER_OR_ADMIN_EXISTS");
 must(s.staging_sha===null&&(await jobs()).length===0&&(await histories()).length===0,
  "QA_RELEASE_STATE_NOT_PRISTINE");
 const email=String(input.email||"");
 const password=String(input.password||"");
 must(/^qa-stage42-[a-f0-9]{32}@example\.invalid$/.test(email)
   &&password.length>=65&&password.length<=128,"QA_SETUP_INPUT_INVALID");
 const made=await db.auth.admin.createUser({email,password,email_confirm:true});
 must(!made.error&&!!made.data.user?.id,"QA_AUTH_CREATE_FAILED_"+String(made.error?.code||"UNKNOWN"));
 const user=made.data.user.id;
 const own=await db.from("beagu_admin_accounts").insert({
    user_id:user,role:"owner",enabled:true
 });
 if(own.error){await db.auth.admin.deleteUser(user);throw Error("QA_OWNER_INSERT_FAILED");}
 return {ok:true,scope:"one synthetic AAL1 owner only"};
}
async function adminAction(action:string,actor:string){
 const state=await baseGuard();const queued=await jobs();
 const hist=await histories();
 if(action==="status"){
  // Synthetic status is ONLY to exercise the original RC update button.
  // Never write production_sha or assert there was an actual live deploy.
  return {mode:"qa_simulated_production_baseline_for_button_only",
   qa_synthetic_baseline:true,release_actions_enabled:true,
   state:{...state,production_sha:A,production_version:"QA SYNTHETIC ONLY",
      draft_sha:B,draft_version:VERSION,draft_summary:"독립 QA 관리자 시험 요청"},
   job:queued.find(j=>["queued","running"].includes(j.status))||null,
   head_sha:B,suggested_draft:null,
   staging_history:hist.slice().reverse(),production_history:[],
   staging_url:"https://noam0127.github.io/beagu-index-qa/",
   production_url:null};
 }
 if(action!=="stage_apply")throw Error("QA_PRODUCTION_AND_ROLLBACK_COMMANDS_DISABLED");
 must(queued.length===0&&hist.length===0&&state.staging_sha===null,
   "QA_RELEASE_ALREADY_STARTED");
 const {data,error}=await db.from("beagu_site_release_jobs_v1").insert({
   action:"stage_apply",target:"staging",status:"queued",
   from_sha:null,to_sha:B,version:VERSION,
   summary:"AAL2 owner clicked actual reviewed release-center Stage Apply in isolated QA",
   created_by:actor
 }).select("id").single();
 must(!error&&!!data?.id,"QA_ENQUEUE_FAILED");
 const audit=await db.from("beagu_admin_audit_events").insert({
   actor_user_id:actor,event_type:"site_release_stage_apply",outcome:"success",
   details:{job_id:data.id,target:"staging",version:VERSION,synthetic:true}
 });
 must(!audit.error,"QA_AUDIT_APPEND_FAILED");
 return {queued:true,job_id:data.id,action:"stage_apply",service:"QA signed GitHub worker only"};
}
async function workerAction(action:string){
 const state=await baseGuard(),queue=await jobs(),history=await histories();
 if(action==="worker_claim"){
  must(queue.length===1&&history.length===0&&queue[0].status==="queued"&&
    queue[0].action==="stage_apply"&&queue[0].from_sha===null&&
    queue[0].to_sha===B,"QA_CLAIM_GUARD_FAILED");
  const r=await db.from("beagu_site_release_jobs_v1").update({
    status:"running",started_at:new Date().toISOString()
  }).eq("id",queue[0].id).eq("status","queued").select("id").single();
  must(!r.error&&!!r.data,"QA_CLAIM_FAILED");
  return {claimed:true,action:"stage_apply",id:r.data.id};
 }
 if(action==="worker_complete"){
  must(queue.length===1&&history.length===0&&queue[0].action==="stage_apply"&&
    queue[0].status==="running"&&state.staging_sha===null,"QA_COMPLETE_GUARD_FAILED");
  const s=await db.from("beagu_site_release_state_v1").update({
    staging_sha:B,staging_version:VERSION,updated_at:new Date().toISOString()
  }).eq("id",1).is("staging_sha",null).select("id").single();
  must(!s.error&&s.data,"QA_COMPLETE_STATE_FAILED");
  const h=await db.from("beagu_site_release_history_v1").insert({
    job_id:queue[0].id,target:"staging",action:"stage_apply",version:VERSION,
    summary:"QA-only real Pages B HTTPS previously verified",from_sha:null,to_sha:B,
    deployed_url:"https://noam0127.github.io/beagu-index-qa/"
  }).select("job_id").single();
  must(!h.error&&!!h.data,"QA_COMPLETE_AUDIT_FAILED");
  const j=await db.from("beagu_site_release_jobs_v1").update({
    status:"deployed",finished_at:new Date().toISOString(),
    deployed_url:"https://noam0127.github.io/beagu-index-qa/"
  }).eq("id",queue[0].id).eq("status","running").select("id").single();
  must(!j.error&&j.data,"QA_COMPLETE_JOB_FAILED");
  return {ok:true,stage:B};
 }
 if(action==="worker_rollback_begin"){
  must(queue.length===1&&history.length===1&&queue[0].status==="deployed"&&
    state.staging_sha===B&&history[0].action==="stage_apply",
    "QA_ROLLBACK_BEGIN_REJECTED");
  const j=await db.from("beagu_site_release_jobs_v1").insert({
    action:"stage_rollback",target:"staging",status:"queued",
    from_sha:B,to_sha:null,version:VERSION,
    summary:"Restore independent QA Pages A; no production action"
  }).select("id").single();
  must(!j.error&&j.data,"QA_ROLLBACK_ENQUEUE_FAILED");
  return {queued:true,action:"stage_rollback"};
 }
 if(action==="worker_rollback_claim"){
  const row=queue.find(q=>q.action==="stage_rollback");
  must(queue.length===2&&history.length===1&&row?.status==="queued"&&
   state.staging_sha===B,"QA_ROLLBACK_CLAIM_REJECTED");
  const r=await db.from("beagu_site_release_jobs_v1").update({
   status:"running",started_at:new Date().toISOString()
  }).eq("id",row.id).eq("status","queued").select("id").single();
  must(!r.error&&r.data,"QA_ROLLBACK_CLAIM_FAILED");
  return {claimed:true,action:"stage_rollback"};
 }
 if(action==="worker_rollback_complete"){
  const row=queue.find(q=>q.action==="stage_rollback");
  must(queue.length===2&&history.length===1&&row?.status==="running"&&
   state.staging_sha===B,"QA_ROLLBACK_COMPLETE_REJECTED");
  const s=await db.from("beagu_site_release_state_v1").update({
   staging_sha:null,staging_version:null,updated_at:new Date().toISOString()
  }).eq("id",1).eq("staging_sha",B).select("id").single();
  must(!s.error&&s.data,"QA_ROLLBACK_STATE_FAILED");
  const h=await db.from("beagu_site_release_history_v1").insert({
   job_id:row.id,target:"staging",action:"stage_rollback",version:VERSION,
   summary:"QA-only real Pages A HTTPS restored and verified",from_sha:B,to_sha:null,
   deployed_url:"https://noam0127.github.io/beagu-index-qa/"
  }).select("job_id").single();
  must(!h.error&&h.data,"QA_ROLLBACK_AUDIT_FAILED");
  const j=await db.from("beagu_site_release_jobs_v1").update({
   status:"deployed",finished_at:new Date().toISOString()
  }).eq("id",row.id).eq("status","running").select("id").single();
  must(!j.error&&j.data,"QA_ROLLBACK_JOB_FAILED");
  return {ok:true,stage:null};
 }
 if(action==="worker_audit"){
  must(state.staging_sha===null&&queue.length===2&&history.length===2&&
    queue.every(j=>j.status==="deployed")&&
    history[0].action==="stage_apply"&&history[1].action==="stage_rollback"&&
    queue[0].created_by!==null,"QA_EXPECTED_AUDIT_MISSING");
  return {passed:true,actions:history.map(x=>x.action),
    original_real_admin_button:true,qa_synthetic_baseline:true,
    production_sha_null:true};
 }
 if(action==="worker_cleanup"||action==="worker_recover"){
  must(action==="worker_recover"||state.staging_sha===null,"QA_STAGE_STILL_DEPLOYED");
  must(queue.length<=2&&history.length<=2,"QA_UNKNOWN_QUEUE");
  if(state.staging_sha!==null){
   must(state.staging_sha===B,"QA_UNKNOWN_STAGE_SHA");
   const s=await db.from("beagu_site_release_state_v1").update({
     staging_sha:null,staging_version:null,updated_at:new Date().toISOString()
   }).eq("id",1).eq("staging_sha",B);
   must(!s.error,"QA_RECOVER_STAGE_RESET_FAILED");
  }
  for(const item of history){
    const r=await db.from("beagu_site_release_history_v1").delete().eq("id",item.id);
    must(!r.error,"QA_HISTORY_CLEANUP_FAILED");
  }
  for(const item of queue){
    const r=await db.from("beagu_site_release_jobs_v1").delete().eq("id",item.id);
    must(!r.error,"QA_JOB_CLEANUP_FAILED");
  }
  const accounts=await db.from("beagu_admin_accounts").select("user_id");
  must(!accounts.error&&accounts.data?.length===1,"QA_OWNER_CLEANUP_IDENTITY_MISSING");
  const id=accounts.data[0].user_id;
  const u=await db.auth.admin.getUserById(id);
  must(!u.error&&/^qa-stage42-[a-f0-9]{32}@example\.invalid$/.test(String(u.data.user?.email||"")),
   "QA_USER_NOT_SYNTHETIC");
  const a=await db.from("beagu_admin_accounts").delete().eq("user_id",id);
  must(!a.error,"QA_OWNER_REMOVE_FAILED");
  const d=await db.auth.admin.deleteUser(id);
  must(!d.error,"QA_USER_REMOVE_FAILED");
  const again=await db.auth.admin.listUsers({page:1,perPage:2});
  must(!again.error&&again.data.users.length===0&&(await jobs()).length===0&&
    (await histories()).length===0,"QA_FINAL_CLEANUP_INCOMPLETE");
  return {clean:true,qa_only:true,production_untouched:true,
    synthetic_audit_events_retained_until_guarded_sql:true};
 }
 throw Error("QA_ACTION_NOT_ALLOWED");
}
Deno.serve(async req=>{
 const origin=req.headers.get("Origin")||"";
 if(origin&&origin!==ORIGIN)return err("origin_not_allowed");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
   "Access-Control-Allow-Origin":ORIGIN,
   "Access-Control-Allow-Headers":"authorization,apikey,content-type",
   "Access-Control-Allow-Methods":"POST,OPTIONS"
 }});
 if(req.method!=="POST")return err("method_not_allowed",405);
 const token=(req.headers.get("Authorization")||"").match(/^Bearer ([A-Za-z0-9._-]{20,5000})$/)?.[1]||"";
 if(!token)return err("authentication_required",401);
 let input:any;
 try{
  const raw=await req.text();must(raw.length<=2048,"BODY_TOO_LARGE");
  input=JSON.parse(raw);must(input&&typeof input==="object"&&!Array.isArray(input),"BAD_BODY");
 }catch{return err("invalid_request",400);}
 const act=String(input.action||"");
 try {
  if(await githubClaims(token)){
    must(!origin,"WORKER_ORIGIN_MUST_BE_EMPTY");
    const s=await baseGuard();void s;
    if(act==="setup")return send(await createUser(input));
    if(act.startsWith("worker_"))return send(await workerAction(act));
    throw Error("WORKER_ACTION_DENIED");
  }
  if(origin!==ORIGIN)return err("qa_browser_origin_required");
  const actor=await realOwner(token);
  if(!actor)return err("owner_mfa_required");
  if(act!=="status"&&act!=="stage_apply")return err("staging_read_only");
  return send(await adminAction(act,actor),act==="status"?200:202);
 }catch(e){
  const reason=e instanceof Error?e.message:"QA_INTERNAL";
  console.error("STAGE42_QA_ERROR",reason);
  return send({error:"qa_operation_blocked",code:reason},409);
 }
});
