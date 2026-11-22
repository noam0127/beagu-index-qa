// ONE-SHOT STAGING SIGNUP TOKEN VERIFICATION: RETIRED (DO NOT REACTIVATE).
// Historical real hosted GoTrue proof: GitHub Actions #45060519102, 8/8 checks.
// After the test the synthetic Auth user was deleted. Generated-token
// verification is NOT a real inbox click, and referral→Lv3 remains unverified.
Deno.serve((_req:Request)=>new Response(JSON.stringify({
  status:"DISABLED", reason:"STAGE40_REAL_GOTRUE_CONFIRMATION_QA_COMPLETE"
}),{status:410,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff"
}}));