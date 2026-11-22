#!/usr/bin/env python3
"""Construct one explicit temporary *hosted QA auth* route from the pinned RC.

Never publish real credentials. The root Pages distribution remains the existing
static-only UI demonstrator. A separate, temporary /__stage40_auth__/admin.html
contains the unmodified pinned RC admin/Auth scripts and talks ONLY to the
isolated staging backend. The deploy workflow restores static-only Pages even
when its hosted browser test fails.
"""
from __future__ import annotations
import hashlib
import json
import pathlib
import re
import sys

RC="5c95aadad971901a8222f83c52e93bf901a3aeb7"
STAGING="ycwuugggqbunlbwuzvbx"
PROD="snvzwrexuqavnfvzgxqj"
SUBPATH="/beagu-index-qa/"
TEST_ROUTE="__stage40_auth__/admin.html"
# Temporary clones retain the original staging API authorization code but accept
# only the isolated github.io test origin. No existing API is modified.
STAGE40_PROXY_JS = '''<script id="stage40-qa-api-proxy">
(()=>{'use strict';
 const host='https://ycwuugggqbunlbwuzvbx.supabase.co';
 const prefix='/functions/v1/';
 const routes={
  'beagu-admin-access':'beagu-stage40-admin-access',
  'beagu-admin-dashboard-v1':'beagu-stage40-admin-dashboard-v1',
  'beagu-admin-members-v1':'beagu-stage40-admin-members-v1',
  'beagu-2026-review-admin':'beagu-stage40-2026-review-admin',
  'beagu-release-manager-v1':'beagu-stage40-release-manager-v1'
 };
 const original=window.fetch.bind(window);
 window.fetch=(input,options)=>{
  const value=input instanceof Request?input.url:String(input);
  const target=new URL(value,location.href);
  if(target.origin===host && target.pathname.startsWith(prefix)){
   const slug=target.pathname.slice(prefix.length);
   if(routes[slug]){
    target.pathname=prefix+routes[slug];
    if(input instanceof Request){
      const adapted=new Request(target.href,input);
      return original(adapted,options);
    }
    return original(target.href,options);
   }
  }
  return original(input,options);
 };
})();
</script>'''
NOTICE=(
 '<aside role="alert" id="stage40-disposable-auth-notice" '
 'style="position:sticky;top:0;z-index:2147483644;padding:12px;'
 'background:#312e81;color:white;font:700 13px system-ui;'
 'text-align:center;pointer-events:none">'
 '일회성 독립 시험 웹 · 임시 테스트 계정 전용 · 실제 회원 계정과 개인정보 입력 금지'
 '</aside>'
)
# Strictly keep all browser API calls inside the staging Supabase project.
CSP=(
  "default-src 'self' https: data: blob: 'unsafe-inline'; "
  "connect-src 'self' https://"+STAGING+".supabase.co wss://"+STAGING+".supabase.co; "
  "form-action 'self'; object-src 'none'; base-uri 'self'"
)

def manifest(site:pathlib.Path):
    obj=json.loads((site/"stage38-release-manifest.json").read_text())
    if obj.get("source_sha")!=RC or obj.get("supabase_project_ref")!=STAGING:
        raise RuntimeError("Pinned candidate or staging ref mismatch")
    if (site/"CNAME").exists():raise RuntimeError("Live custom domain forbidden")

def capture(site:pathlib.Path,target:pathlib.Path):
    manifest(site)
    html=(site/"admin.html").read_text(encoding="utf8")
    if any(t in html for t in [PROD,"https://baeguindex.com","stage38-cdn-static-guard"]):
        raise RuntimeError("Unauthenticated/pre-mirror source or production origin not isolated")
    if "beagu-admin-access-v1.js" not in html or "connect-src 'self' https://"+STAGING+".supabase.co" not in html:
        raise RuntimeError("Trusted RC admin UI/staging-only CSP missing")
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(html,encoding="utf8")
    print("PASS: captured pinned RC admin page before no-auth public mirror rewrite")

def install(site:pathlib.Path,captured:pathlib.Path):
    manifest(site)
    mirror=json.loads((site/"stage38-static-mirror.json").read_text())
    if mirror.get("login_enabled") is not False or mirror.get("api_calls_enabled") is not False:
        raise RuntimeError("Regular public site must remain static only")
    original=captured.read_text(encoding="utf8")
    if "stage38-cdn-static-guard" in original:
        raise RuntimeError("Static guard contaminated disposable auth route")
    # The GitHub Pages project is mounted in /beagu-index-qa/. Repair only the
    # temporary copy. Root, production and the reviewed RC files are unchanged.
    rewritten=re.sub(r'(?i)(href|src|action)=(["\u0027])/(?!/|beagu-index-qa/)',
       lambda m:m.group(1)+"="+m.group(2)+SUBPATH,original)
    rewritten=re.sub(r'(?i)<head(?:\s[^>]*)?>',
      lambda m:m.group(0)+'<base href="'+SUBPATH+'">'+
        '<meta name="robots" content="noindex,nofollow,noarchive">'+
        '<meta http-equiv="Content-Security-Policy" content="'+CSP+'">'+STAGE40_PROXY_JS,
      rewritten,count=1)
    rewritten=re.sub(r'(?i)<body(?:\s[^>]*)?>',lambda m:m.group(0)+NOTICE,rewritten,count=1)
    # Fail-closed link navigation: prevent any public-domain changes or
    # out-of-scope operations while the disposable auth page exists.
    guard="""<script id="stage40-hosted-qa-route-guard">
    (()=>{'use strict';
      const root='/beagu-index-qa/';
      document.addEventListener('click',event=>{
       const a=event.target.closest?.('a[href]');if(!a)return;
       const dest=new URL(a.href,location.href);
       if(dest.origin!==location.origin || !dest.pathname.startsWith(root)){
        event.preventDefault();event.stopImmediatePropagation();
       }
      },true);
    })();
    </script>"""
    rewritten=rewritten.replace("</body>",guard+"</body>")
    output=site/TEST_ROUTE
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(rewritten,encoding="utf8")
    if PROD in rewritten or "stage38-cdn-static-guard" in rewritten or "connect-src 'none'" in rewritten:
        raise RuntimeError("Unsafe disposable auth page")
    if (site/"admin.html").read_text().find("stage38-cdn-static-guard")<0:
        raise RuntimeError("Root admin page must remain auth-disabled")
    (site/"stage40-hosted-auth-test-manifest.json").write_text(json.dumps({
      "kind":"disposable-hosted-staging-admin-auth-only",
      "source_sha":RC,"staging_ref":STAGING,
      "test_route":TEST_ROUTE,"test_auth_only":True,
      "root_static_auth_disabled":True,"no_real_user_credentials":True,
      "sha256":hashlib.sha256(rewritten.encode()).hexdigest()
    },sort_keys=True)+"\n",encoding="utf8")
    print("PASS: added temporary auth route; public root remains login-disabled")

if __name__=="__main__":
    if len(sys.argv)!=4 or sys.argv[1] not in {"capture","install"}:
        raise SystemExit("usage: stage40_hosted_admin.py capture|install <site> <tmp_file>")
    site=pathlib.Path(sys.argv[2]).resolve()
    temp=pathlib.Path(sys.argv[3]).resolve()
    if sys.argv[1]=="capture":capture(site,temp)
    else:install(site,temp)
