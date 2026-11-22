// Stage41 one-shot, OIDC-signed, isolated real owner AAL1→TOTP AAL2 tests.
// Uses existing QA-only READ-ONLY release-manager, never enqueues or deploys.
// Temporary Auth user, MFA secret and JWT never leave this server and are deleted.
// Production project and operating GitHub repository are never touched.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {createRemoteJWKSet,jwtVerify} from "https://esm.sh/jose@5.10.0";
const REF="ycwuugggqbunlbwuzvbx";
const ORIGIN="https://"+REF+".supabase.co";
const REPO="noam0127/beagu-index-qa";
const WORKFLOW=REPO+"/.github/workflows/stage41-admin-mfa-release-readonly-once.yml@refs/heads/main";
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const PROJECT_URL=Deno.env.get("SUPABASE_URL")||"";
const SECRET=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const PUBLIC=Deno.env.get("SUPABASE_ANON_KEY")||"";
const db=createClient(PROJECT_URL,SECRET,{auth:{persistSession:false,autoRefreshToken:false}});
const auth=createClient(PROJECT_URL,PUBLIC,{auth:{persistSession:false,autoRefreshToken:false}});
const safe=(data:any,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff"}});
function check(ok:any,reason:string){if(!ok)throw new Error(reason);}
const hex=(b:Uint8Array)=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
function b32(secret:string){
 const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits=0,n=0;const out:number[]=[];
 for(const c of secret.toUpperCase().replace(/[\s=]/g,"")){
  const v=alphabet.indexOf(c);if(v<0)throw Error("INVALID_TOTP_SEED");
  n=(n<<5)|v;bits+=5;if(bits>=8){bits-=8;out.push((n>>>bits)&255);}
 }
 return new Uint8Array(out);
}
async function totp(seed:string){
 const raw=b32(seed),counter=Math.floor(Date.now()/30000);
 const buf=new Uint8Array(8);
 let remaining=counter;for(let i=7;i>=0;i--){buf[i]=remaining%256;remaining=Math.floor(remaining/256);}
 const key=await crypto.subtle.importKey("raw",raw,{name:"HMAC",hash:"SHA-1"},false,["sign"]);
 const h=new Uint8Array(await crypto.subtle.sign("HMAC",key,buf));
 const off=h[h.length-1]&15;
 const val=((h[off]&127)<<24)|(h[off+1]<<16)|(h[off+2]<<8)|h[off+3];
 return String((val>>>0)%1000000).padStart(6,"0");
}
async function call(slug:string,action:string,jwt:string,extra:any={},origin?:string){
 const headers:Record<string,string>={"Authorization":"Bearer "+jwt,"Content-Type":"application/json"};
 if(origin)headers.Origin=origin;
 const r=await fetch(ORIGIN+"/functions/v1/"+slug,{
  method:"POST",headers,body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(15000)
 });
 return {status:r.status,body:await r.json().catch(()=>({}))};
}
async function count(table:string){
 const {count,error}=await db.from(table).select("*",{count:"exact",head:true});
 if(error)throw Error("QA_READ_"+table.toUpperCase()+"_FAILED");
 return count||0;
}
async function run(){
 check(PROJECT_URL===ORIGIN && SECRET.length>35 && PUBLIC.length>35,"WRONG_STAGE_PROJECT");
 const anchor=await db.from("schools").select("school_id").eq("school_id","STAGE38-FICTIONAL-001").maybeSingle();
 check(!anchor.error&&!!anchor.data,"QA_ANCHOR_NOT_FOUND");
 const before=await db.auth.admin.listUsers({page:1,perPage:1});
 check(!before.error&&before.data.users.length===0,"QA_EXISTING_AUTH_USER");
 check(await count("beagu_admin_accounts")===0 && await count("beagu_site_release_jobs_v1")===0,
  "QA_ADMIN_OR_RELEASE_ACTIVE");
 const state=await db.from("beagu_site_release_state_v1").select("production_sha,staging_sha").eq("id",1).single();
 check(!state.error&&state.data?.production_sha===null&&state.data?.staging_sha===null,
  "QA_RELEASE_STATE_NOT_ISOLATED");
 let id:string|null=null,checks=0,reason="NONE",cleaned=false;
 const username="qa-stage41-admin-"+crypto.randomUUID().replaceAll("-")+"@example.invalid";
 const password=hex(crypto.getRandomValues(new Uint8Array(32)))+"Aa1!";
 const marks:string[]=[];
 function pass(ok:boolean,name:string){check(ok,name);checks++;marks.push(name);}
 try{
  const newUser=await db.auth.admin.createUser({email:username,password,email_confirm:true});
  check(!newUser.error&&!!newUser.data.user?.id,"SYNTHETIC_OWNER_CREATE_FAILED");
  id=String(newUser.data.user.id);pass(true,"synthetic_owner_created");
  const own=await db.from("beagu_admin_accounts").insert({user_id:id,enabled:true,role:"owner"});
  pass(!own.error,"owner_allowlist_created");
  const signed=await auth.auth.signInWithPassword({email:username,password});
  pass(!signed.error&&!!signed.data.session?.access_token,"aal1_login");
  const token1=signed.data.session.access_token;
  const getClaim=(jwt:string)=>{const s=jwt.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
    return JSON.parse(atob(s.padEnd(Math.ceil(s.length/4)*4,"=")));};
  pass(getClaim(token1).aal==="aal1","real_aal1_claim");
  const adminStatus=await call("beagu-admin-access","status",token1);
  pass(adminStatus.status===200&&adminStatus.body?.permitted===true&&
    adminStatus.body?.mfa_required===true,"aal1_onboarding_only");
  const blockedGate=await call("beagu-admin-access","verify",token1);
  pass(blockedGate.status===403&&blockedGate.body?.error==="mfa_required","aal1_owner_access_denied");
  const blockedRelease=await call("beagu-release-manager-v1","status",token1);
  pass(blockedRelease.status===403&&blockedRelease.body?.error==="admin_mfa_required","aal1_release_status_denied");
  const blockedStage=await call("beagu-release-manager-v1","stage_apply",token1);
  pass(blockedStage.status===403&&blockedStage.body?.error==="admin_mfa_required","aal1_stage_enqueue_denied");
  const factor=await auth.auth.mfa.enroll({factorType:"totp"});
  check(!factor.error&&!!factor.data?.id&&!!factor.data?.totp?.secret,"TOTP_ENROLL_FAILED");
  pass(true,"real_totp_factor_enrolled");
  let upgraded=false;
  for(let attempt=0;attempt<2&&!upgraded;attempt++){
   const challenge=await auth.auth.mfa.challenge({factorId:factor.data.id});
   check(!challenge.error&&!!challenge.data?.id,"TOTP_CHALLENGE_FAILED");
   const verification=await auth.auth.mfa.verify({factorId:factor.data.id,
       challengeId:challenge.data.id,code:await totp(factor.data.totp.secret)});
   if(!verification.error&&!!verification.data?.access_token)upgraded=true;
  }
  pass(upgraded,"real_totp_challenge_verified");
  const session=await auth.auth.getSession();
  check(!session.error&&!!session.data.session?.access_token,"AAL2_SESSION_MISSING");
  const token2=session.data.session.access_token;
  pass(getClaim(token2).aal==="aal2","real_aal2_claim");
  const passGate=await call("beagu-admin-access","verify",token2);
  pass(passGate.status===200&&passGate.body.permitted===true&&passGate.body.role==="owner"&&
   passGate.body.mfa_verified===true,"real_owner_aal2_gate");
  const status=await call("beagu-release-manager-v1","status",token2);
  pass(status.status===200&&status.body.mode==="isolated_preview_read_only"&&
   status.body.release_actions_enabled===false&&status.body.state?.production_sha===null,
   "real_owner_aal2_release_status_read_only");
  const unauthorizedOrigins=await call("beagu-release-manager-v1","status",token2,{},"https://baeguindex.com");
  pass(unauthorizedOrigins.status===403&&unauthorizedOrigins.body.error==="origin_not_allowed",
   "real_owner_staging_rejects_production_origin");
  for(const act of ["register","stage_apply","stage_rollback","prod_apply","prod_rollback","worker_next"]){
   const result=await call("beagu-release-manager-v1",act,token2,{confirmed_tested:true});
   pass(result.status===403&&result.body.error==="staging_read_only",
    "real_owner_"+act+"_blocked");
  }
  const changed=await db.from("beagu_admin_accounts").update({role:"viewer"}).eq("user_id",id);
  pass(!changed.error,"synthetic_role_downgrade_applied");
  const viewer=await call("beagu-release-manager-v1","status",token2);
  pass(viewer.status===403&&viewer.body.error==="owner_required",
    "live_downgrade_revokes_owner_release");
  const disabled=await db.from("beagu_admin_accounts").update({enabled:false}).eq("user_id",id);
  pass(!disabled.error,"disable_synthetic_admin");
  const noAdmin=await call("beagu-admin-access","verify",token2);
  pass(noAdmin.status===403&&noAdmin.body.error==="access_denied",
   "disabled_admin_verify_denied");
  await auth.auth.signOut();
  const stale=await call("beagu-release-manager-v1","status",token2);
  pass([401,403].includes(stale.status),"signed_out_owner_denied");
  pass(await count("beagu_site_release_jobs_v1")===0&&
    await count("beagu_site_release_history_v1")===0,"no_real_release_job_ever_created");
 }catch(e){reason=e instanceof Error?e.message:"UNKNOWN_FAILURE";}
 finally{
  try{await auth.auth.signOut()}catch{}
  try{
   if(id){
     const ar=await db.from("beagu_admin_audit_events").delete().eq("actor_user_id",id);
     if(ar.error)throw Error("AUDIT_CLEANUP_FAILED");
     const del=await db.from("beagu_admin_accounts").delete().eq("user_id",id);
     if(del.error)throw Error("OWNER_CLEANUP_FAILED");
     const u=await db.auth.admin.deleteUser(id);
     if(u.error)throw Error("USER_CLEANUP_FAILED");
   }
   const u=await db.auth.admin.listUsers({page:1,perPage:1});
   cleaned=!u.error&&u.data.users.length===0&&
     await count("beagu_admin_accounts")===0&&
     await count("beagu_site_release_jobs_v1")===0&&
     await count("beagu_site_release_history_v1")===0;
  }catch(e){cleaned=false;reason=reason==="NONE"?"CLEANUP_ERROR":reason;}
 }
 const ok=reason==="NONE"&&cleaned&&checks===26;
 return {status:ok?"PASS":"BLOCKED",checks_passed:checks,
  reason:ok?"NONE":reason,cleanup_ok:cleaned,
  scope:"real staging owner GoTrue AAL1->TOTP AAL2, live QA admin gate and release-manager read-only status; all release mutations denied; not a real admin button or publish",
  production_untouched:true};
}
Deno.serve(async req=>{
 if(req.method!=="POST")return safe({error:"METHOD_NOT_ALLOWED"},405);
 const jwt=(req.headers.get("Authorization")||"").match(/^Bearer ([A-Za-z0-9._-]{100,5000})$/)?.[1];
 if(!jwt)return safe({error:"SIGNED_QA_REQUIRED"},401);
 try {
  const {payload}=await jwtVerify(jwt,JWKS,{issuer:"https://token.actions.githubusercontent.com",
    audience:"beagu-stage41-admin-readonly-qa"});
  if(payload.repository!==REPO||payload.ref!=="refs/heads/main"||
    payload.workflow_ref!==WORKFLOW||!["push","workflow_dispatch"].includes(String(payload.event_name)))
   return safe({error:"OIDC_CLAIMS_REJECTED"},403);
 }catch{return safe({error:"OIDC_INVALID"},403);}
 try {
  const data=await run();
  return safe(data,data.status==="PASS"?200:503);
 }catch(e){
  console.error("STAGE41_ADMIN_QA_DENIED",e instanceof Error?e.message:"UNKNOWN");
  return safe({status:"BLOCKED",reason:"STAGING_ISOLATION_FAILED"},503);
 }
});
