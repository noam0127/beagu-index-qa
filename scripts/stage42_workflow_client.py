#!/usr/bin/env python3
"""One-shot QA GitHub OIDC helper for real admin button -> stage queue -> Pages B/A.
No production credentials, real respondents, GitHub PAT, or deploy key.
The fixture is ephemeral on the GitHub Actions runner, never committed or logged.
"""
import json,os,pathlib,secrets,sys,urllib.request,urllib.error,urllib.parse
ROOT=pathlib.Path(__file__).resolve().parents[1]
FILE=ROOT/".stage42-qa-fixture.json"
API="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-stage42-owner-button-release-once"
ACTIONS={"setup","worker_claim","worker_complete","worker_rollback_begin",
         "worker_rollback_claim","worker_rollback_complete","worker_audit",
         "worker_cleanup","worker_recover"}
def oidc():
 url=os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
 url+=("&" if "?" in url else "?")+"audience="+urllib.parse.quote("beagu-stage42-owner-button-release-qa")
 req=urllib.request.Request(url,headers={
   "Authorization":"Bearer "+os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
 with urllib.request.urlopen(req,timeout=25) as res:
   value=json.load(res)["value"]
 if not value or len(value)<100:
   raise RuntimeError("missing signed OIDC assertion")
 return value
def perform(action):
 if action=="prepare":
  if FILE.exists():
   raise RuntimeError("do not reuse prior QA credentials")
  email="qa-stage42-"+secrets.token_hex(16)+"@example.invalid"
  password=secrets.token_hex(48)+"Aa1!"
  FILE.write_text(json.dumps({"admin_email":email,"admin_password":password})+"\n",encoding="utf8")
  FILE.chmod(0o600)
  print("PASS ephemeral QA fixture generated locally (no secrets printed)")
  return
 if action=="scrub":
  FILE.unlink(missing_ok=True)
  print("PASS ephemeral QA fixture deleted")
  return
 if action not in ACTIONS:raise SystemExit("unsupported QA action")
 payload={"action":action}
 if action=="setup":
  x=json.loads(FILE.read_text(encoding="utf8"))
  payload.update({"email":x["admin_email"],"password":x["admin_password"]})
 req=urllib.request.Request(API,method="POST",
   headers={"Authorization":"Bearer "+oidc(),"Content-Type":"application/json",
            "User-Agent":"beagu-stage42-independent-qa-worker"},
   data=json.dumps(payload).encode("utf8"))
 try:
  with urllib.request.urlopen(req,timeout=45) as res:
   body=json.load(res);code=res.status
 except urllib.error.HTTPError as e:
  body=json.loads(e.read().decode());code=e.code
 if code>=300:raise RuntimeError("QA-only signed server action "+action+" rejected: "+str(code)+
  " "+str(body.get("code") or body.get("error")))
 if action=="worker_audit":
  if body.get("passed") is not True or body.get("actions")!=["stage_apply","stage_rollback"]:
   raise RuntimeError("real QA Pages A/B/A audit sequence missing")
  if body.get("qa_synthetic_baseline") is not True or body.get("production_sha_null") is not True:
   raise RuntimeError("staging state invariant failed")
 if action in ("worker_cleanup","worker_recover"):
  if body.get("clean") is not True or body.get("production_untouched") is not True:
   raise RuntimeError("test-only cleanup must be verified")
 # Never print a password, token, email or internal user ID.
 print("PASS signed stage42",action,{k:v for k,v in body.items()
   if k in ("ok","clean","qa_only","action","stage","passed","actions",
            "production_sha_null","production_untouched")})
if __name__=="__main__":
 if len(sys.argv)!=2:raise SystemExit("usage: stage42_workflow_client.py ACTION")
 perform(sys.argv[1])
