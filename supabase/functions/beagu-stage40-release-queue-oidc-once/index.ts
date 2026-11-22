// One-shot signed staging-only release queue endpoint: RETIRED after success.
// Historical evidence: https://github.com/noam0127/beagu-index-qa/actions/runs/45059842879
// Real OIDC job registration -> B Pages HTTPS -> audit -> A restore -> clean DB.
// This source deliberately has no secrets, DB access, authentication or deploy.
Deno.serve((_req: Request) => new Response(JSON.stringify({
  status: "DISABLED", reason: "STAGE40_SIGNED_QA_RELEASE_A_B_A_COMPLETED"
}), {status: 410, headers: {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"
}}));
