// QA-only one-shot real GoTrue signup verification test with synthetic, NEVER emailed identities.
// Only a signed OIDC token from a pinned GitHub QA workflow may execute. No secrets leave server.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {createRemoteJWKSet,jwtVerify} from "https://esm.sh/jose@5.10.0";
const PROJECT="ycwuugggqbunlbwuzvbx";
const ORIGIN="https://"+PROJECT+".supabase.co";
const REPO="noam0127/beagu-index-qa";
const WORKFLOW=REPO+"/.github/workflows/stage40-gotrue-confirmation-once.yml@refs/heads/main";
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const send=(status:number,result:any)=>new Response(JSON.stringify(result),{status,headers:{
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"
}});
const U=Deno.env.get("SUPABASE_URL")||"";
const S=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||"";
const admin=createClient(U,S,{auth:{persistSession:false,autoRefreshToken:false}});
const client=createClient(U,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
function assert(ok:boolean,label:string){if(!ok)throw new Error(label)}
async function go(){
 assert(U===ORIGIN && S.length>35 && ANON.length>35,"STAGING_ENVIRONMENT_INVALID");
 const {data:existing,error:existingError}=await admin.auth.admin.listUsers({page:1,perPage:1});
 assert(!existingError && existing.users.length===0,"QA_AUTH_USER_PRESENT");
 const {count:members,error:memberError}=await admin.from("beagu_postit_member_accounts").select("auth_user_id",{count:"exact",head:true});
 assert(!memberError&&members===0,"QA_MEMBER_RECORD_PRESENT");
 let checks=0,userId:string|null=null,cleaned=false,reason="NONE";
 const nonce=crypto.randomUUID().replaceAll("-","");
 const email="qa-gotrue-stage40-"+nonce+"@example.invalid";
 const password=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("")+"Aa1!";
 try{
  const {data:link,error:linkError}=await admin.auth.admin.generateLink({
   type:"signup",email,password
  });
  assert(!linkError && !!link?.user?.id && !!link?.properties?.hashed_token,"SIGNUP_LINK_GENERATION_FAILED");
  userId=String(link.user.id);
  // The generated token is never returned/logged or written to GitHub.
  checks++;
  const before=await admin.auth.admin.getUserById(userId);
  assert(!before.error && !before.data.user?.email_confirmed_at,"SIGNUP_ALREADY_CONFIRMED");
  checks++;
  const early=await client.auth.signInWithPassword({email,password});
  assert(!!early.error && !early.data.session,"UNVERIFIED_LOGIN_ALLOWED");
  checks++;
  const typ=link.properties?.verification_type;
  const type=(typ==="email"||typ==="signup")?typ:"signup";
  const proof=await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type});
  assert(!proof.error&&!!proof.data.session?.access_token&&proof.data.user?.id===userId,
   "REAL_GOTRUE_CONFIRMATION_FAILED");
  checks++;
  const after=await admin.auth.admin.getUserById(userId);
  assert(!after.error&&!!after.data.user?.email_confirmed_at,"CONFIRMED_DATE_MISSING");
  checks++;
  await client.auth.signOut();
  const login=await client.auth.signInWithPassword({email,password});
  assert(!login.error&&!!login.data.session?.access_token&&login.data.user?.id===userId,
   "POST_CONFIRM_PASSWORD_LOGIN_FAILED");
  checks++;
  const verified=await client.auth.getUser(login.data.session.access_token);
  assert(!verified.error && verified.data.user?.id===userId &&
         !!verified.data.user.email_confirmed_at,"AUTH_JWT_SERVER_VALIDATION_FAILED");
  checks++;
  const replay=await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type});
  assert(!!replay.error,"ONE_TIME_CONFIRMATION_REPLAY_ACCEPTED");
  checks++;
  await client.auth.signOut();
 }catch(e){reason=e instanceof Error?e.message:"UNEXPECTED_ERROR";}
 finally{
  if(userId){
    try {
      const d=await admin.auth.admin.deleteUser(userId);
      cleaned=!d.error;
      const listing=await admin.auth.admin.listUsers({page:1,perPage:1});
      cleaned=cleaned&&!listing.error&&(listing.data.users||[]).length===0;
    }catch{cleaned=false;}
  }
 }
 const ok=checks===8&&cleaned&&reason==="NONE";
 return {status:ok?"PASS":"BLOCKED",checks_passed:checks,reason,
  cleanup_ok:cleaned,scope:"real hosted GoTrue generateLink signup, unverified deny, token_hash verifyOtp, password login and JWT; NO inbox delivery or referral Lv3",production_untouched:true};
}
Deno.serve(async req=>{
 if(req.method!=="POST")return send(405,{status:"METHOD_NOT_ALLOWED"});
 const token=(req.headers.get("Authorization")||"").match(/^Bearer ([A-Za-z0-9._-]{100,5000})$/)?.[1];
 if(!token)return send(401,{status:"SIGNED_QA_REQUEST_REQUIRED"});
 try{
  const {payload}=await jwtVerify(token,JWKS,{issuer:"https://token.actions.githubusercontent.com",
   audience:"beagu-stage40-gotrue-confirm"});
  if(payload.repository!==REPO||payload.ref!=="refs/heads/main"||
     payload.workflow_ref!==WORKFLOW||
     !["push","workflow_dispatch"].includes(String(payload.event_name||"")))
    return send(403,{status:"QA_SIGNED_CLAIMS_REJECTED"});
 }catch{return send(403,{status:"QA_OIDC_SIGNATURE_REJECTED"});}
 try {
  const result=await go();
  return send(result.status==="PASS"?200:503,result);
 }catch(e){
  console.error("STAGE40_QA_GOTRUE",e instanceof Error?e.message:"UNEXPECTED");
  return send(503,{status:"BLOCKED",reason:"ENVIRONMENT_OR_AUTH_CHECK_FAILED"});
 }
});
