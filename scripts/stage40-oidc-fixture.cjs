#!/usr/bin/env node
'use strict';
// GitHub Actions only: request GitHub OIDC with fixed audience, send to
// staging-only signed one-shot fixture, never log tokens or credentials.
const {writeFileSync,unlinkSync,existsSync}=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const project='ycwuugggqbunlbwuzvbx';
const audience='beagu-stage40-qa-ci';
const url='https://'+project+'.supabase.co/functions/v1/beagu-stage40-hosted-auth-oidc-once';
const file=process.env.STAGE40_AUTH_FIXTURE_FILE||'';
const cmd=process.argv[2]||'';
if(!['create','cleanup'].includes(cmd)||!file)throw Error('Expected create/cleanup and ephemeral fixture path');
async function main(){
 const endpoint=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
 const secret=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 if(!endpoint||!secret)throw Error('GitHub OIDC permission required');
 const t=await fetch(endpoint+(endpoint.includes('?')?'&':'?')+'audience='+encodeURIComponent(audience),{
  headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(20000)});
 if(!t.ok)throw Error('GitHub OIDC token request denied');
 const signed=(await t.json()).value;
 assert.ok(typeof signed==='string'&&signed.length>100);
 const res=await fetch(url,{
  method:'POST',redirect:'manual',
  headers:{Authorization:'Bearer '+signed,'Content-Type':'application/json'},
  body:JSON.stringify({action:cmd}),signal:AbortSignal.timeout(45000)});
 const value=await res.json().catch(()=>({}));
 if(!res.ok)throw Error('Stage39 OIDC fixture '+cmd+' failed HTTP '+res.status+
     ' code='+String(value?.error||'unknown'));
 if(cmd==='create'){
  assert.equal(value.ok,true);
  assert.match(value.admin_email,/^stage40-browser-[0-9]{8,20}-[a-f0-9]{8}@example\.invalid$/);
  assert.match(value.member_email,/^stage40-member-[0-9]{8,20}-[a-f0-9]{8}@example\.invalid$/);
  assert.ok(value.admin_password.length>=50&&value.member_password.length>=50);
  assert.equal(value.email_verified_by_real_inbox,false);
  writeFileSync(file,JSON.stringify(value),{mode:0o600,flag:'wx'});
  console.log('PASS: two isolated temporary staging Auth identities created for signed workflow');
 }else{
  assert.equal(value.ok,true);
  assert.equal(value.failed,0);
  assert.ok(value.deleted===2||value.deleted===0);
  if(existsSync(file))unlinkSync(file);
  console.log('PASS: signed staging-only temporary Auth cleanup; removed='+value.deleted);
 }
}
main().catch(err=>{
  if(cmd==='cleanup'&&existsSync(file))try{unlinkSync(file)}catch{}
  // Error deliberately contains only a pre-defined status + public error code.
  console.error('FAIL: signed fixture '+cmd+': '+String(err?.message||'unknown').slice(0,160));
  process.exitCode=1;
});
