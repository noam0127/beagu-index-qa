// STAGE40: temporary GitHub OIDC-only disposable Auth fixture.
// Project is HARD-PINNED to isolated staging. No production data or user
// credentials. Disable this function permanently once the one-shot CI completes.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {createRemoteJWKSet,jwtVerify} from "https://esm.sh/jose@5.10.0";

const PROJECT="ycwuugggqbunlbwuzvbx";
const STAGING_URL="https://"+PROJECT+".supabase.co";
const REPO="noam0127/beagu-index-qa";
const WORKFLOW=REPO+"/.github/workflows/stage40-hosted-auth-once.yml@refs/heads/main";
const AUDIENCE="beagu-stage40-qa-ci";
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const reply=(status:number,value:Record<string,unknown>)=>new Response(JSON.stringify(value),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}
});
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
const dbUrl=Deno.env.get("SUPABASE_URL")||"";
const dbKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return reply(405,{error:"method"});
  if(req.headers.has("Origin"))return reply(403,{error:"browser_origin_forbidden"});
  const token=req.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
  if(!token)return reply(401,{error:"signed_runner_required"});
  let runId="";
  try{
    const {payload}=await jwtVerify(token,JWKS,{
      issuer:"https://token.actions.githubusercontent.com",audience:AUDIENCE,
      algorithms:["RS256"]
    });
    if(payload.repository!==REPO || payload.ref!=="refs/heads/main" ||
      payload.workflow_ref!==WORKFLOW ||
      !["push","workflow_dispatch"].includes(String(payload.event_name||""))) {
      return reply(403,{error:"unauthorized_workflow"});
    }
    runId=String(payload.run_id||"");
    if(!/^[0-9]{8,20}$/.test(runId))return reply(403,{error:"invalid_run_id"});
  }catch{return reply(403,{error:"invalid_oidc"});}
  if(dbUrl!==STAGING_URL||!dbKey)return reply(503,{error:"isolated_staging_only"});
  const db=createClient(dbUrl,dbKey,{auth:{persistSession:false,autoRefreshToken:false}});
  let action="";
  try{
    const body=await req.text();
    if(body.length>200)throw Error("oversize");
    const value=JSON.parse(body);
    action=String(value.action||"");
  }catch{return reply(400,{error:"invalid_request"});}
  if(!["create","cleanup"].includes(action))return reply(400,{error:"invalid_action"});
  let users=[];
  try{
    for(let page=1;page<=5;page++){
      const {data,error}=await db.auth.admin.listUsers({page,perPage:200});
      if(error)throw error;
      const batch=data.users||[];
      users.push(...batch);
      if(batch.length<200)break;
    }
  }catch{return reply(503,{error:"inventory_unavailable"});}
  const matching=users.filter(u=>
    u.app_metadata?.stage40_qa===true&&String(u.app_metadata?.stage40_run_id||"")===runId);
  if(action==="cleanup"){
    let deleted=0,failed=0;
    for(const user of matching){
      const grant=await db.from("beagu_admin_accounts").delete().eq("user_id",user.id);
      const auth=await db.auth.admin.deleteUser(user.id);
      if(grant.error||auth.error)failed++;else deleted++;
    }
    return reply(failed?503:200,{ok:failed===0,deleted,failed});
  }
  // Fail closed: no pre-existing identities or administration records.
  const {count,error:adminError}=await db.from("beagu_admin_accounts")
    .select("user_id",{count:"exact",head:true});
  if(adminError || count!==0 || users.length!==0 || matching.length!==0)
    return reply(409,{error:"staging_fixture_baseline_not_empty"});
  const provisioned=[];
  const cleanup=async()=>{
    for(const uid of provisioned.reverse()){
      try{await db.from("beagu_admin_accounts").delete().eq("user_id",uid);}catch{}
      try{await db.auth.admin.deleteUser(uid);}catch{}
    }
  };
  let phase="start";
  try{
    const suffix=crypto.randomUUID().slice(0,8);
    const adminEmail="stage40-browser-"+runId+"-"+suffix+"@example.invalid";
    const memberEmail="stage40-member-"+runId+"-"+suffix+"@example.invalid";
    const adminPassword=secret(),memberPassword=secret();
    phase="create_admin";
    const a=await db.auth.admin.createUser({
      email:adminEmail,password:adminPassword,email_confirm:true,
      app_metadata:{stage40_qa:true,stage40_run_id:runId,qa_role:"admin"}
    });
    if(a.error||!a.data.user?.id)throw Error("admin_fixture_failure");
    provisioned.push(a.data.user.id);
    phase="create_member";
    const b=await db.auth.admin.createUser({
      email:memberEmail,password:memberPassword,email_confirm:true,
      app_metadata:{stage40_qa:true,stage40_run_id:runId,qa_role:"member"}
    });
    if(b.error||!b.data.user?.id)throw Error("member_fixture_failure");
    provisioned.push(b.data.user.id);
    phase="grant_owner";
    const owner=await db.from("beagu_admin_accounts").insert({
      user_id:a.data.user.id,role:"owner",enabled:true
    });
    if(owner.error)throw Error("admin_grant_failure");
    return reply(200,{
      ok:true,admin_email:adminEmail,admin_password:adminPassword,
      member_email:memberEmail,member_password:memberPassword,
      email_verified_by_real_inbox:false,fixture_admin_confirmed:true
    });
  }catch{
    await cleanup();
    return reply(503,{error:"fixture_create_failed_"+phase+"_and_cleanup_attempted"});
  }
});
