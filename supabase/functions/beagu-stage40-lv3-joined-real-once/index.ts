// One-shot earned Lv2 → Auth GoTrue → original-device → Lv3 → revoke: RETIRED.
// Historical real HTTP server 19/19: GitHub Actions run #45061101959
// Verification used one synthetic referral credit, not a real respondent.
// All test accounts, sessions, codes, member links and referral rows removed.
// Disposable staging SQL fixture function was dropped afterward.
Deno.serve((_req:Request)=>new Response(JSON.stringify({
 status:"DISABLED",reason:"STAGE40_REAL_JOINED_LV3_19_CASES_COMPLETED"
}),{status:410,headers:{"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}}));