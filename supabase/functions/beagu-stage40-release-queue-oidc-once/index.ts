// QA-ONLY disposable signed GitHub Actions release queue exercise.
// NEVER connect to the production Supabase project or production GitHub Pages.
// Every action is authorized by GitHub's signed OIDC claims (not unsigned JWT text).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.10.0";
const STAGE="ycwuugggqbunlbwuzvbx";
const ORIGIN="https://"+STAGE+".supabase.co";
const REPO="noam0127/beagu-index-qa";
const WORKFLOW=REPO+"/.github/workflows/stage40-signed-remote-queue.yml@refs/heads/main";
const EXPECTED_A="5c95aadad971901a8222f83c52e93bf901a3aeb7";
const PREFIX="v1.1.0-stage40-signed-qa";
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const SHA=/^[a-f0-9]{40}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const send=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
function fail(msg:string):never{throw new Error("STAGE40_QA_"+msg);}
const db=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{
  auth:{autoRefreshToken:false,persistSession:false}
});
function check<T>(r:{data:T;error?:{message:string}|null},label:string):T{
 if(r.error)fail(label);return r.data;
}
const users=async()=>check(await db.from("schools").select("school_id",{count:"exact",head:true})
 .eq("school_id","STAGE38-FICTIONAL-001"),"ANCHOR_SCHOOL");
async function trustedEnvironment(){
 const configured=Deno.env.get("SUPABASE_URL")||"";
 if(configured.replace(/\/$/,"")!==ORIGIN)fail("WRONG_SUPABASE_PROJECT");
 await users();
 const {count:anchor,error:ae}=await db.from("schools").select("school_id",{count:"exact",head:true})
  .eq("school_id","STAGE38-FICTIONAL-001");
 if(ae||anchor!==1)fail("QA_ANCHOR_MISSING");
 const {count:authCount,error:ue}=await db.schema("auth").from("users").select("id",{count:"exact",head:true});
 // auth schema is not exposed in all Supabase deployments. Query public QA
 // release state and restrict all mutation to the test-only existing empty queue.
 const {data:state,error:se}=await db.from("beagu_site_release_state_v1").select("*").eq("id",1).single();
 if(se||!state||state.production_sha!==null)fail("PRODUCTION_STATE_NOT_EMPTY");
 const {count:other,error:oe}=await db.from("beagu_site_release_jobs_v1")
   .select("id",{count:"exact",head:true}).eq("target","production");
 if(oe||other!==0)fail("PRODUCTION_JOB_PRESENT");
 const {count:prodHistory,error:pe}=await db.from("beagu_site_release_history_v1")
   .select("id",{count:"exact",head:true}).eq("target","production");
 if(pe||prodHistory!==0)fail("PRODUCTION_HISTORY_PRESENT");
 return state;
}
async function records(){
 const jobs=check(await db.from("beagu_site_release_jobs_v1").select("id,action,target,status,from_sha,to_sha,version"),"JOBS_READ");
 const history=check(await db.from("beagu_site_release_history_v1").select("job_id,action,target,from_sha,to_sha,version"),"HISTORY_READ");
 if((jobs||[]).some((x:any)=>x.target!=="staging"||x.version!==PREFIX)||
   (history||[]).some((x:any)=>x.target!=="staging"||x.version!==PREFIX))
     fail("UNRECOGNIZED_ROWS");
 return {jobs:jobs||[],history:history||[]};
}
async function claim(jobId:string,action:string){
 const {data,error}=await db.from("beagu_site_release_jobs_v1").update({
  status:"running",started_at:new Date().toISOString()
 }).eq("id",jobId).eq("status","queued").eq("action",action).eq("target","staging")
   .eq("version",PREFIX).select("id,status").maybeSingle();
 if(error||!data)fail("CLAIM_FAILED");
 return {claimed:data.id};
}
async function insertJob(action:string,from_sha:string|null,to_sha:string|null){
 return check(await db.from("beagu_site_release_jobs_v1").insert({
  action,target:"staging",status:"queued",from_sha,to_sha,
  version:PREFIX,summary:"signed isolated QA Actions Pages proof only"
 }).select("id").single(),"JOB_CREATE");
}
async function complete(jobId:string,action:string,versionSha:string|null,fromSha:string|null){
 const {data:job,error:je}=await db.from("beagu_site_release_jobs_v1").select("*")
  .eq("id",jobId).eq("status","running").eq("action",action).eq("target","staging")
  .eq("version",PREFIX).maybeSingle();
 if(je||!job||job.to_sha!==versionSha||job.from_sha!==fromSha)fail("JOB_NOT_RUNNING");
 const state=await trustedEnvironment();
 if(state.staging_sha!==fromSha)fail("STAGING_STATE_CHANGED");
 check(await db.from("beagu_site_release_state_v1").update({
  staging_sha:versionSha,staging_version:versionSha?PREFIX:null,updated_at:new Date().toISOString()
 }).eq("id",1).eq("staging_sha",fromSha).select("id").single(),"STATE_COMMIT");
 check(await db.from("beagu_site_release_history_v1").insert({
  job_id:jobId,action,target:"staging",version:PREFIX,
  from_sha:fromSha,to_sha:versionSha,
  summary:"signed queue, real QA-only Pages HTTPS, no real account",
  deployed_url:"https://noam0127.github.io/beagu-index-qa/"
 }).select("job_id").single(),"HISTORY_WRITE");
 check(await db.from("beagu_site_release_jobs_v1").update({
  status:"deployed",finished_at:new Date().toISOString(),
  deployed_url:"https://noam0127.github.io/beagu-index-qa/"
 }).eq("id",jobId).eq("status","running").select("id").single(),"JOB_ACK");
 return {completed:jobId,stage:versionSha,production_unchanged:true};
}
async function run(payload:any,action:string,input:any){
 const sha=String(input.sha||"");
 if(!SHA.test(sha)||sha!==payload.sha)fail("SIGNED_SHA_MISMATCH");
 const state=await trustedEnvironment();
 const {jobs,history}=await records();
 const id=String(input.id||"");
 if(action==="begin"){
  if(state.staging_sha!==null||jobs.length!==0||history.length!==0)fail("NOT_CLEAN");
  const job=await insertJob("stage_apply",null,sha);
  return {job_id:job.id,expected_sha:sha};
 }
 if(action==="claim"||action==="complete"){
  if(!UUID.test(id))fail("JOB_ID_INVALID");
  if(action==="claim")return claim(id,"stage_apply");
  return complete(id,"stage_apply",sha,null);
 }
 if(action==="queue_rollback"){
  if(state.staging_sha!==sha||jobs.length!==1||history.length!==1||
   history[0].action!=="stage_apply")fail("NOT_APPLIED");
  const job=await insertJob("stage_rollback",sha,null);
  return {job_id:job.id,rollback_to:EXPECTED_A};
 }
 if(action==="claim_rollback"||action==="complete_rollback"){
  if(!UUID.test(id))fail("ROLLBACK_JOB_ID_INVALID");
  if(action==="claim_rollback")return claim(id,"stage_rollback");
  return complete(id,"stage_rollback",null,sha);
 }
 if(action==="status"){
  return {jobs:jobs.map((j:any)=>({action:j.action,status:j.status})),
   history:history.map((h:any)=>h.action),staging_sha:state.staging_sha,
   production_sha:state.production_sha};
 }
 if(action==="cleanup"){
  // Cleanup only this workflow's records, never an unrelated job.
  if(state.staging_sha!==null||jobs.some((j:any)=>j.status==="running")||
     jobs.length>2||history.length>2)fail("CLEANUP_UNSAFE");
  for(const row of history)check(await db.from("beagu_site_release_history_v1")
    .delete().eq("job_id",row.job_id).select("job_id").single(),"HISTORY_DELETE");
  for(const row of jobs)check(await db.from("beagu_site_release_jobs_v1")
    .delete().eq("id",row.id).select("id").single(),"JOB_DELETE");
  const after=await records();
  if(after.jobs.length||after.history.length)fail("CLEANUP_INCOMPLETE");
  return {clean:true,production_unchanged:true};
 }
 fail("UNKNOWN_ACTION");
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return send({error:"METHOD_NOT_ALLOWED"},405);
 let token=(req.headers.get("Authorization")||"").match(/^Bearer ([A-Za-z0-9._-]{40,5000})$/)?.[1];
 if(!token)return send({error:"SIGNED_WORKER_REQUIRED"},401);
 let payload:any;
 try {
  const result=await jwtVerify(token,JWKS,{issuer:"https://token.actions.githubusercontent.com",
   audience:"beagu-stage40-signed-qa-release"});
  payload=result.payload;
  if(payload.repository!==REPO||payload.ref!=="refs/heads/main"||
   payload.workflow_ref!==WORKFLOW||
   !["push","workflow_dispatch"].includes(String(payload.event_name))||
   typeof payload.sha!=="string")return send({error:"OIDC_CLAIMS_REJECTED"},403);
 }catch{return send({error:"OIDC_INVALID"},403);}
 try{
  const raw=await req.text();if(raw.length>2048)return send({error:"BODY_TOO_LARGE"},413);
  const input=JSON.parse(raw);
  if(!input||Array.isArray(input)||typeof input!=="object")return send({error:"INVALID_BODY"},400);
  return send(await run(payload,String(input.action||""),input));
 }catch(e){
  const message=e instanceof Error?e.message:"UNKNOWN";
  console.error("STAGE40_QA_RUN_FAIL",message);
  return send({error:"QA_OPERATION_FAILED"},409);
 }
});