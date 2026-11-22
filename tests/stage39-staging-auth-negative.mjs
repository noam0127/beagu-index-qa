/* Stage39 isolated staging auth/security readiness: negative-path only.
 * Sends NO valid credentials, does NOT sign up, modify Auth, DB, RLS, CORS
 * or deploy any Edge Function. No production URLs are fetched.
 */
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';

const ref = 'ycwuugggqbunlbwuzvbx';
const host = 'https://' + ref + '.supabase.co';
const qaOrigin = 'https://noam0127.github.io';
const pub = 'sb_publishable_c8h7TaIYONfP56Zc05K0Sw_SxyT3lZU';
const report = {
  schema: 'beagu-stage39-negative-auth-evidence-v1',
  project_ref: ref,
  qa_origin: qaOrigin,
  negative_paths: [],
  real_signup_tested: false,
  real_mfa_tested: false,
  live_rc_authenticated_qa_ready: false,
  production_changed: false,
};

function forbidSecret(data, label) {
  assert.equal(typeof data,'object',label);
  assert.ok(data !== null && !Array.isArray(data),label);
  for (const key of [
    'access_token','refresh_token','service_role','user','users','members',
    'email','phone','rows','data','token','authenticated','mfa_factors'
  ]) {
    assert.ok(!Object.prototype.hasOwnProperty.call(data,key),
      label+' unexpected sensitive field '+key);
  }
}
async function post(slug,{origin,auth,body={action:'list'}}={}) {
  const headers = {'Content-Type':'application/json'};
  if (origin) headers.Origin=origin;
  if (auth) headers.Authorization=auth;
  const response=await fetch(host+'/functions/v1/'+slug,{
    method:'POST',redirect:'manual',headers,
    body:JSON.stringify(body),signal:AbortSignal.timeout(20000)
  });
  const raw=await response.text();
  assert.ok(raw.length<12000,slug+' oversized response');
  let json={};
  try {json=JSON.parse(raw)} catch {};
  if (!json || typeof json!=='object' || Array.isArray(json)) json={};
  forbidSecret(json,slug);
  assert.equal(response.headers.get('set-cookie'),null,
    slug+' unexpectedly set cookies');
  return {status:response.status,json,headers:response.headers};
}
async function check({label,slug,origin,auth,accepted,body}) {
  const r=await post(slug,{origin,auth,body});
  assert.ok(accepted.includes(r.status),
    label+' must fail closed (received HTTP '+r.status+')');
  if(origin===qaOrigin){
    assert.notEqual(r.headers.get('access-control-allow-origin'),qaOrigin,
      'Staging origin must stay unapproved until actual auth go/no-go');
  }
  report.negative_paths.push({label,status:r.status,result:'PASS'});
  console.log('PASS '+label+' HTTP '+r.status);
}

await check({label:'admin-members-anonymous',slug:'beagu-admin-members-v1',accepted:[401,403]});
await check({label:'admin-members-invalid-jwt',slug:'beagu-admin-members-v1',
  auth:'Bearer invalid.stage39.unsigned',accepted:[401,403]});
await check({label:'admin-access-fake-aal2',slug:'beagu-admin-access',
  auth:'Bearer invalid.stage39.aal2',body:{action:'verify'},accepted:[401,403]});
await check({label:'staging-admin-hosted-qa-origin-not-approved',slug:'beagu-admin-access',
  origin:qaOrigin,body:{action:'verify'},accepted:[403]});
await check({label:'staging-members-hosted-qa-origin-not-approved',slug:'beagu-admin-members-v1',
  origin:qaOrigin,accepted:[403]});
await check({label:'stage38-browser-fixture-disabled',slug:'beagu-stage38-browser-auth-once',
  body:{action:'create'},accepted:[410]});
await check({label:'stage38-mfa-fixture-disabled',slug:'beagu-stage38-auth-mfa-once',
  body:{action:'create'},accepted:[410]});

// A single nonexistent-login failure proves the isolated GoTrue password
// endpoint is responding without sending mail or creating an account.
{
  const response=await fetch(host+'/auth/v1/token?grant_type=password',{
    method:'POST',redirect:'manual',
    headers:{apikey:pub,'Content-Type':'application/json'},
    body:JSON.stringify({
      email:'stage39-nonexistent-test@example.invalid',
      password:'not-a-real-password-for-negative-test'
    }),signal:AbortSignal.timeout(20000)
  });
  const body=await response.json().catch(()=>({}));
  assert.ok([400,401,422].includes(response.status),
    'Invalid password sign-in must not succeed HTTP '+response.status);
  forbidSecret(body,'auth-password-invalid');
  report.negative_paths.push({
    label:'staging-auth-nonexistent-user-password-rejected',
    status:response.status,result:'PASS'
  });
  console.log('PASS staging isolated GoTrue invalid password HTTP '+response.status);
}
await mkdir('artifacts/stage39-auth-readiness',{recursive:true});
await writeFile('artifacts/stage39-auth-readiness/negative-paths.json',
  JSON.stringify(report,null,2)+'\n');
console.log('STAGE39_NO_GO: real verified email/AAL2/full hosted auth absent; production untouched');
