// One-shot real staging owner AAL1→TOTP AAL2→release API: RETIRED.
// Historical GitHub run #45061725613: 26/26 real authorization checks PASS,
// but CI failure due missing DELETE grant on append-only audit log in cleanup.
// Exact synthetic principal/factor/allowlist/3 audit rows later deleted with
// strictly guarded stage-only SQL. Production untouched.
// Original historical tester retained only in Git history.
Deno.serve((_req:Request)=>new Response(JSON.stringify({
 status:"DISABLED",reason:"STAGE41_REAL_OWNER_AAL2_AUTHORIZATION_QA_RETIRED"
}),{status:410,headers:{"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}}));