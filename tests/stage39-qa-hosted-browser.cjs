/* Hosted Chromium E2E for PUBLIC STATIC QA only.
 * No account creation, credentials, real participation codes, Supabase login,
 * database mutation, service_role, production website or production APIs.
 */
'use strict';
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://noam0127.github.io/beagu-index-qa/';
const RC = '5c95aadad971901a8222f83c52e93bf901a3aeb7';
const TEST_INPUT = 'TESTCODE1234';
const OUT = path.resolve('artifacts/stage39-qa-hosted-browser');
fs.mkdirSync(OUT, {recursive:true});

async function run() {
  // The hosted origin's strict CSP is expected to block page fetch. Fetch
  // manifest from Node (not the page) and ensure disabled authentication.
  const json=await new Promise((resolve,reject)=>{
    require('https').get(new URL('stage38-static-mirror.json',BASE),r=>{
      if(r.statusCode!==200){r.resume();return reject(new Error('manifest HTTP '+r.statusCode));}
      let s='';r.setEncoding('utf8');r.on('data',x=>s+=x);r.on('end',()=>{
        try { resolve(JSON.parse(s)); } catch(e) { reject(e); }
      });
    }).on('error',reject);
  });
  assert.equal(json.source_sha,RC);
  assert.equal(json.login_enabled,false);
  assert.equal(json.api_calls_enabled,false);
  assert.equal(json.qa_participation_demo_enabled,true);
  assert.equal(json.real_codes_allowed,false);

  const browser=await chromium.launch({headless:true});
  const results=[];
  try {
    for(const variant of ['desktop','mobile']){
      const context=await browser.newContext({
        viewport:variant==='desktop'?{width:1440,height:900}:{width:390,height:844},
        deviceScaleFactor:variant==='desktop'?1:2,
        isMobile:variant==='mobile',
        hasTouch:variant==='mobile',
        locale:'ko-KR'
      });
      const page=await context.newPage();
      const networkResponses=[];
      const productionRequests=[];
      page.on('request',request=>{
        const url=request.url();
        if(/^https:\/\/(?:www\.)?baeguindex\.com(?:\/|$)/i.test(url) ||
           /^https:\/\/snvzwrexuqavnfvzgxqj\.supabase\.co(?:\/|$)/i.test(url))
          productionRequests.push(url.split('?')[0]);
      });
      page.on('response',response=>{
        if(response.url().includes('supabase.co/functions/') ||
           response.url().includes('supabase.co/rest/v1/'))
          networkResponses.push(response.status());
      });
      try {
        let res=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:45000});
        assert.equal(res.status(),200,variant+' home HTTP');
        await page.locator('#beaguLevelState').waitFor({state:'visible',timeout:25000});
        await page.locator('#stage38-public-static-warning').waitFor({state:'visible'});
        await page.locator('#beaguLevelState').click();
        const dialog=page.locator('#beaguParticipationOverlay');
        await dialog.waitFor({state:'visible'});
        const field=page.locator('#beaguParticipationCode');
        await field.waitFor({state:'visible'});
        assert.equal(await field.isEnabled(),true,variant+' demo input must be enabled');
        assert.equal(await field.getAttribute('data-qa-demo-only'),'true');
        await field.focus();
        assert.equal(await field.evaluate(el=>document.activeElement===el),true,
          variant+' keyboard focus');
        await field.fill(TEST_INPUT);
        assert.equal(await field.inputValue(),TEST_INPUT);
        await page.locator('#beaguParticipationToggle').click();
        assert.equal(await field.getAttribute('type'),'text');
        await page.locator('#beaguParticipationToggle').click();
        assert.equal(await field.getAttribute('type'),'password');
        await page.screenshot({path:path.join(OUT,variant+'-code-dialog.png')});
        const submit=page.locator('#beaguParticipationSubmit');
        assert.equal(await submit.getAttribute('type'),'button',variant+' demo cannot submit');
        await submit.click();
        await page.getByText('입력 및 버튼 동작이 정상입니다. 실제 인증은 수행하지 않습니다.').waitFor();
        assert.equal(await field.inputValue(),'');
        await page.locator('[data-beagu-close]').click();
        await dialog.waitFor({state:'hidden'});
        await page.locator('#beaguLevelState').click();
        await dialog.waitFor({state:'visible'});
        await field.fill(TEST_INPUT);
        await field.press('Enter');
        await page.getByText('입력 및 버튼 동작이 정상입니다. 실제 인증은 수행하지 않습니다.').waitFor();
        await field.press('Escape');
        await dialog.waitFor({state:'hidden'});
        const challenge=await page.goto(new URL('challenge.html',BASE).toString(),{
          waitUntil:'domcontentloaded',timeout:45000
        });
        assert.equal(challenge.status(),200);
        await page.locator('#stage38-public-static-warning').waitFor({state:'visible'});
        await page.locator('#beaguLevelState').waitFor({state:'visible'});
        assert.equal(productionRequests.length,0,'no requests to production origins');
        assert.equal(networkResponses.length,0,'no successful Supabase API responses');
        results.push({variant,result:'PASS',demo_only:true,production_requests:0,api_responses:0});
        console.log('PASS '+variant+': home and challenge HTTP, focus, typing, toggle, button, Enter/Escape, API deny');
      } finally {
        await context.close();
      }
    }
    fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify({
      rc_sha:RC,origin:BASE,results,
      real_signup_verified:false,real_admin_mfa_verified:false,
      production_release_approved:false
    },null,2));
  } finally {
    await browser.close();
  }
}
run().catch(e=>{console.error('FAIL staged hosted browser test:',e);process.exitCode=1;});
