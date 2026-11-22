// Isolated one-shot hosted QA: REAL earned-code session -> GoTrue confirmation
// -> original-device proof -> real postit member binding -> Lv3 tier -> revocation.
// The "one credited referral" is a SYNTHETIC fixture (not a real respondent).
// Strict GitHub OIDC signed workflow, no secrets or identifiers leave the function.
// Deploy only on ycwuugggqbunlbwuzvbx, retire API + SQL fixture immediately.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {createRemoteJWKSet,jwtVerify} from "https://esm.sh/jose@5.10.0";
const STAGE="ycwuugggqbunlbwuzvbx";
const ORIGIN="https://"+STAGE+".supabase.co";
const REPO="noam0127/beagu-index-qa";
const WORKFLOW=REPO+"/.github/workflows/stage40-lv3-joined-real-once.yml@refs/heads/main";
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const PROJECT_URL=Deno.env.get("SUPABASE_URL")||"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const admin=createClient(PROJECT_URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const publicAuth=createClient(PROJECT_URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
const h=(bytes:Uint8Array)=>[...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
const rand=()=>h(crypto.getRandomValues(new Uint8Array(32)));
const hash=async(s:string)=>h(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));
const resp=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
function gate(ok:unknown,label:string):asserts ok{if(!ok)throw Error(label);}
async function fixture(action:string,visitor:string,code:string,deviceHash?:string,refHash?:string){
 const {data,error}=await admin.rpc("beagu_stage40_earned_lv3_fixture_once",{
  p_action:action,p_visitor:visitor,p_identity_code:code,
  p_device_hash:deviceHash||null,p_referral_hash:refHash||null
 });
 if(error||data!==true)throw Error("FIXTURE_"+action.toUpperCase()+"_REJECTED");
}
async function api(action:string,levelToken:string|null,authToken:string|null,base="beagu-level-api",more:any={}){
 const headers:Record<string,string>={"Content-Type":"application/json"};
 if(levelToken)headers["X-Beagu-Session"]=levelToken;
 if(base==="beagu-postit-api-v1"&&levelToken)headers["X-Beagu-Level-Session"]=levelToken;
 if(authToken)headers.Authorization="Bearer "+authToken;
 const url=ORIGIN+"/functions/v1/"+base;
 const response=await fetch(url,{method:"POST",cache:"no-store",headers,
    body:JSON.stringify({action,...more})});
 const body=await response.json().catch(()=>({}));
 return {status:response.status,body};
}
async function writerStatus(levelToken:string,authToken:string){
 const r=await fetch(ORIGIN+"/functions/v1/beagu-postit-api-v1?action=writer_status",{
  method:"GET",headers:{"X-Beagu-Level-Session":levelToken,
   "Authorization":"Bearer "+authToken},cache:"no-store"});
 const data=await r.json().catch(()=>({}));
 return {status:r.status,linked:data.linked===true};
}
async function count(table:string){
 const {count,error}=await admin.from(table).select("*",{count:"exact",head:true});
 if(error)throw Error("READ_"+table.toUpperCase()+"_FAILED");
 return count||0;
}
async function journey(){
 gate(PROJECT_URL===ORIGIN&&KEY.length>35&&ANON.length>35,"QA_PROJECT_MISMATCH");
 const marker=await admin.from("schools").select("school_id").eq("school_id","STAGE38-FICTIONAL-001").maybeSingle();
 gate(!marker.error&&!!marker.data,"QA_ANCHOR_MISSING");
 const pre=await admin.auth.admin.listUsers({page:1,perPage:1});
 gate(!pre.error&&pre.data.users.length===0,"QA_USERS_PRESENT");
 gate(await count("beagu_level_sessions")===0&&await count("beagu_postit_member_accounts")===0,
   "QA_SESSIONS_PRESENT");
 gate(await count("beagu_site_release_jobs_v1")===0,"QA_RELEASE_WORK_ONGOING");
 const visitor=crypto.randomUUID();
 const code="QA-"+crypto.randomUUID().replaceAll("-","").slice(0,24);
 const deviceSecret=rand(),referral=rand();
 const email="qa-stage40-joined-"+crypto.randomUUID().replaceAll("-")+"@example.invalid";
 const password=rand()+"Aa1!";
 let id:string|null=null,sessionToken:string|null=null,created=false;
 let checks=0,reason="NONE",cleaned=false;
 function passed(cond:unknown,label:string){gate(cond,label);checks++;}
 try{
  await fixture("create",visitor,code,await hash(deviceSecret),await hash(referral));
  created=true;checks++;
  // Direct code login must fail before a synthetic referral credit is added.
  const earlyCode=await api("login",null,null,"beagu-level-api",{code});
  passed(earlyCode.status===401&&earlyCode.body.error==="INVALID_CODE","UNEARNED_CODE_ACCEPTED");
  await fixture("upgrade",visitor,code);checks++;
  const validCode=await api("login",null,null,"beagu-level-api",{code});
  passed(validCode.status===200&&validCode.body.level===2
    &&typeof validCode.body.token==="string","EARNED_LV2_LOGIN_FAILED");
  sessionToken=validCode.body.token;
  const tier2=await api("verify",sessionToken,null);
  passed(tier2.status===200&&tier2.body.level===2,"REAL_LV2_VERIFY_FAILED");
  const {data:link,error:le}=await admin.auth.admin.generateLink({type:"signup",email,password});
  gate(!le&&!!link?.user?.id&&!!link?.properties?.hashed_token,"GOTRUE_SIGNUP_FAILED");
  id=link.user.id;checks++;
  const unverified=await publicAuth.auth.signInWithPassword({email,password});
  passed(!!unverified.error&&!unverified.data.session,"UNVERIFIED_LOGIN_ALLOWED");
  // This consumes the actual hosted Auth token, NOT a received Gmail link.
  const typ=link.properties.verification_type;
  const proof=await publicAuth.auth.verifyOtp({
    token_hash:link.properties.hashed_token,
    type:typ==="email"||typ==="signup"?typ:"signup"
  });
  passed(!proof.error&&!!proof.data.user?.email_confirmed_at,"GOTRUE_CONFIRM_FAILED");
  await publicAuth.auth.signOut();
  const login=await publicAuth.auth.signInWithPassword({email,password});
  passed(!login.error&&login.data.user?.id===id&&!!login.data.session?.access_token,
    "CONFIRMED_LOGIN_FAILED");
  const jwt=login.data.session.access_token;
  const stillLv2=await api("verify",sessionToken,jwt);
  passed(stillLv2.status===200&&stillLv2.body.level===2,"UNLINKED_USER_GAINED_LV3");
  const unlinked=await writerStatus(sessionToken,jwt);
  passed(unlinked.status===200&&!unlinked.linked,"UNLINKED_WRITER_PERMITTED");
  const wrongDevice=await api("link_member",sessionToken,jwt,"beagu-postit-api-v1",{
     deviceSecret:rand()
  });
  passed(wrongDevice.status===403&&wrongDevice.body.error==="DEVICE_OWNERSHIP_NOT_VERIFIED",
    "WRONG_DEVICE_ACCEPTED");
  const linked=await api("link_member",sessionToken,jwt,"beagu-postit-api-v1",{
    deviceSecret
  });
  passed(linked.status===200&&linked.body.linked===true,"REAL_DEVICE_BIND_FAILED");
  const nowLv3=await api("verify",sessionToken,jwt);
  passed(nowLv3.status===200&&nowLv3.body.level===3,"REAL_LV3_NOT_GRANTED");
  const noAuth=await api("verify",sessionToken,null);
  passed(noAuth.status===200&&noAuth.body.level===2,"CODE_ALONE_GRANTED_LV3");
  const writer=await writerStatus(sessionToken,jwt);
  passed(writer.status===200&&writer.linked===true,"LINKED_WRITER_STATUS_FAILED");
  await fixture("revoke",visitor,code);checks++;
  const revoked=await api("verify",sessionToken,jwt);
  passed(revoked.status===401&&revoked.body.error==="AUTH_REQUIRED",
    "REVOKED_REFERRAL_STILL_GRANTS_LV3");
  const revokedWriter=await writerStatus(sessionToken,jwt);
  passed(revokedWriter.status===403,"REVOKED_REFERRAL_STILL_WRITES");
 }catch(e){
  reason=e instanceof Error?e.message:"UNKNOWN_JOURNEY_FAILURE";
 }finally{
  try{await publicAuth.auth.signOut()}catch{}
  try{
   if(sessionToken){
    const digest=await hash(sessionToken);
    const r=await admin.from("beagu_level_sessions").delete().eq("token_sha256",digest);
    if(r.error)throw Error("SESSION_CLEANUP_FAILED");
   }
   if(id){
    const r=await admin.from("beagu_postit_member_accounts").delete().eq("auth_user_id",id);
    if(r.error)throw Error("MEMBER_CLEANUP_FAILED");
    const d=await admin.auth.admin.deleteUser(id);
    if(d.error)throw Error("AUTH_CLEANUP_FAILED");
   }
   if(created)await fixture("cleanup",visitor,code);
   const users=await admin.auth.admin.listUsers({page:1,perPage:1});
   cleaned=!users.error&&users.data.users.length===0&&
      await count("beagu_level_sessions")===0&&
      await count("beagu_postit_member_accounts")===0;
  }catch(e){cleaned=false;reason=reason==="NONE"?"CLEANUP_FAILED":reason;}
 }
 const ok=checks===19&&reason==="NONE"&&cleaned;
 return {status:ok?"PASS":"BLOCKED",checks_passed:checks,
  reason:ok?"NONE":reason,cleanup_ok:cleaned,
  scope:"real hosted earned code Lv2 (synthetic referral credit) -> GoTrue signup confirmation -> actual API device bind -> Lv3 -> revocation. No inbox click, real respondent or browser UI.",
  production_untouched:true};
}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return resp({error:"METHOD_NOT_ALLOWED"},405);
 const token=(req.headers.get("Authorization")||"").match(/^Bearer ([A-Za-z0-9._-]{100,5000})$/)?.[1];
 if(!token)return resp({error:"SIGNED_QA_ONLY"},401);
 try{
  const {payload}=await jwtVerify(token,JWKS,{
    issuer:"https://token.actions.githubusercontent.com",
    audience:"beagu-stage40-joined-lv3-qa"
  });
  if(payload.repository!==REPO||payload.ref!=="refs/heads/main"||
    payload.workflow_ref!==WORKFLOW||!["push","workflow_dispatch"].includes(String(payload.event_name)))
     return resp({error:"OIDC_CLAIMS_REJECTED"},403);
 }catch{return resp({error:"OIDC_INVALID"},403);}
 try{
  const result=await journey();
  return resp(result,result.status==="PASS"?200:503);
 }catch(e){
  const reason=e instanceof Error?e.message:"UNKNOWN_ERROR";
  console.error("STAGE40_SIGNED_QA_FAIL",reason);
  return resp({status:"BLOCKED",reason:"STAGE40_QA_ENVIRONMENT_REJECTED"},503);
 }
});
