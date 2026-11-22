#!/usr/bin/env python3
"""Signed one-shot QA release queue client. Absolutely no production operations.
Only GitHub Actions from the fixed QA workflow can obtain accepted OIDC claims.
No service_role key, PAT, real login, school data or credentials.
"""
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

API="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-stage40-release-queue-oidc-once"
AUDIENCE="beagu-stage40-signed-qa-release"
ROOT=pathlib.Path(__file__).resolve().parents[1]
A_FILE=ROOT/".stage40_signed_apply_id"
R_FILE=ROOT/".stage40_signed_rollback_id"
ACTIONS={"begin","claim","complete","queue_rollback","claim_rollback",
         "complete_rollback","status","cleanup","recover_after_verified_restore"}
def token():
    raw_url=os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    bearer=os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]
    sep="&" if "?" in raw_url else "?"
    url=raw_url+sep+"audience="+urllib.parse.quote(AUDIENCE)
    with urllib.request.urlopen(urllib.request.Request(url,headers={
        "Authorization":"Bearer "+bearer}),timeout=20) as response:
        token=json.load(response)["value"]
    if not token or len(token)<100:raise RuntimeError("GitHub OIDC token unavailable")
    return token
def invoke(action):
    if action not in ACTIONS:raise ValueError("Invalid QA-only operation")
    sha=os.environ["GITHUB_SHA"]
    if len(sha)!=40 or any(c not in "0123456789abcdef" for c in sha):
        raise RuntimeError("Invalid immutable Actions SHA")
    body={"action":action,"sha":sha}
    if action in ("claim","complete"):
        body["id"]=A_FILE.read_text(encoding="utf8").strip()
    elif action in ("claim_rollback","complete_rollback"):
        body["id"]=R_FILE.read_text(encoding="utf8").strip()
    elif action=="recover_after_verified_restore":
        body["restored"]=True
    req=urllib.request.Request(API,data=json.dumps(body).encode("utf8"),method="POST",
       headers={"Authorization":"Bearer "+token(),"Content-Type":"application/json",
                "User-Agent":"beagu-stage40-qa-signed-only"})
    try:
        with urllib.request.urlopen(req,timeout=30) as response:
            result=json.load(response)
    except urllib.error.HTTPError as error:
        # Never show a token or other secure request header.
        body=error.read(1200).decode("utf8","replace")
        raise RuntimeError("QA-only action "+action+" HTTP "+str(error.code)+": "+body) from None
    if action=="begin":A_FILE.write_text(result["job_id"]+"\n",encoding="utf8")
    elif action=="queue_rollback":R_FILE.write_text(result["job_id"]+"\n",encoding="utf8")
    elif action=="status":
        assert result["production_sha"] is None,"Production SHA unexpectedly changed"
        assert result["staging_sha"] is None,"QA staging rollback failed"
        assert result["history"]==["stage_apply","stage_rollback"],"Incomplete remote release history"
        assert len(result["jobs"])==2 and all(x["status"]=="deployed" for x in result["jobs"])
    elif action in ("cleanup","recover_after_verified_restore"):
        assert result["clean"] is True and result["production_unchanged"] is True
        A_FILE.unlink(missing_ok=True)
        R_FILE.unlink(missing_ok=True)
    print("PASS signed QA release operation",action,json.dumps(result,ensure_ascii=False))
if __name__=="__main__":
    if len(sys.argv)!=2:
        raise SystemExit("usage: python3 qa/scripts/stage40_signed_release_qa.py ACTION")
    invoke(sys.argv[1])
