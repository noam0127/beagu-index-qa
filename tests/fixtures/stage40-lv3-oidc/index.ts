// Historical real two-user Lv3 E2E 45054501623: 15/15 passed and accounts deleted.
// The active staging Edge Function is also permanently disabled.
Deno.serve((_req:Request)=>new Response(JSON.stringify({status:"DISABLED",reason:"STAGE40_LV3_QA_COMPLETED"}),{
 status:410,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
}));
