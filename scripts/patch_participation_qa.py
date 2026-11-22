#!/usr/bin/env python3
"""QA-only participation-code desktop refinement, without enabling authentication.

Only generated GitHub Pages files are changed. The upstream pinned RC, hosted
production site and Supabase databases are untouched. Existing CSP keeps
connect-src and form-action at 'none'. The input is for dummy text only.
"""
import hashlib
import json
import pathlib
import re
import sys

RC = "5c95aadad971901a8222f83c52e93bf901a3aeb7"

CSS = """
<style id="beagu-qa-participation-desktop-css">
/* Only the independent QA demonstration, not the application RC. */
#beaguParticipationOverlay .beagu-participation-dialog {
  box-sizing:border-box; margin:auto;
}
#beaguParticipationOverlay .beagu-participation-field input:focus {
  caret-color:#2159b9; border-color:#2666ce !important;
  outline:3px solid rgba(38,102,206,.18) !important;
  outline-offset:2px; box-shadow:0 0 0 4px rgba(38,102,206,.09) !important;
}
#beaguParticipationOverlay .beagu-participation-field input:disabled {
  cursor:not-allowed; opacity:.55;
}
#beaguQaParticipationNote {
  background:#fff8ed;border:1px solid #f6d9a7;
  border-radius:11px;padding:10px 12px;
  color:#905019;font-size:12px;line-height:1.6;
  margin:12px 0 17px;font-weight:650;word-break:keep-all;
}
#beaguParticipationMessage {min-height:1.5em}
@media (min-width: 800px) {
  #beaguParticipationOverlay {
    padding:34px;
    background:rgba(13,31,55,.66);
  }
  #beaguParticipationOverlay .beagu-participation-dialog {
    width:min(100%,520px);max-height:calc(100dvh - 68px);
    padding:36px 38px 30px;border-radius:23px;
    border:1px solid #dae5f5;
    box-shadow:0 26px 80px rgba(8,27,56,.31);
  }
  #beaguParticipationOverlay .beagu-participation-eyebrow {
    letter-spacing:.14em;font-size:11px;color:#6480a4;
  }
  #beaguParticipationOverlay .beagu-participation-dialog h2 {
    font-size:27px;line-height:1.32;margin:10px 0 10px;
  }
  #beaguParticipationDescription {font-size:14px;line-height:1.65;margin-bottom:0}
  #beaguParticipationForm {gap:12px}
  #beaguParticipationForm label {font-size:14px}
  #beaguParticipationOverlay .beagu-participation-field input {
    height:56px;min-width:0;width:100%;padding-left:16px;
    padding-right:80px;border-radius:13px;font-size:16px;
    color:#172f4b;background:white;
  }
  #beaguParticipationOverlay .beagu-participation-field button {
    top:8px;right:8px;height:40px;
  }
  #beaguParticipationSubmit {
    width:100%;min-height:51px;font-size:15px;
  }
  #beaguParticipationOverlay .beagu-participation-links {
    margin-top:20px;gap:11px;
  }
  #challengeAccessPanel.beagu-participation-host {
    width:min(100%,720px);max-width:720px;
    margin-left:auto;margin-right:auto;
    padding:26px 30px !important;border-radius:19px;
  }
  #challengeAccessPanel.beagu-participation-host .beagu-participation-intro {
    font-size:15px;line-height:1.65;
  }
  #challengeAccessPanel.beagu-participation-host .beagu-participation-inline-trigger {
    display:inline-flex;align-items:center;justify-content:center;
    width:min(100%,340px);max-width:340px;min-height:49px;
  }
}
@media (max-width:799px) {
  #beaguParticipationOverlay .beagu-participation-dialog {
    width:min(100%,440px);padding:25px 20px 21px;
  }
}
</style>
"""

JS = """
<script id="beagu-qa-participation-demo-js">
(function(){
  'use strict';
  function setup() {
    const modal=document.getElementById('beaguParticipationOverlay');
    const input=modal && modal.querySelector('#beaguParticipationCode');
    const form=modal && modal.querySelector('#beaguParticipationForm');
    const button=modal && modal.querySelector('#beaguParticipationSubmit');
    const message=modal && modal.querySelector('#beaguParticipationMessage');
    const description=modal && modal.querySelector('#beaguParticipationDescription');
    if(!input || !form || !button || !message)return;
    // The upstream static guard first disables ALL password/email inputs.
    // Restore only the non-transmitting participation field for UI testing.
    input.disabled=false;
    input.readOnly=false;
    input.value='';
    input.placeholder='예시코드 입력 (TESTCODE1234)';
    input.dataset.qaDemoOnly='true';
    if(description)description.textContent=
      '참여코드 입력창의 디자인과 키보드 작동을 확인하는 화면입니다.';
    const note=document.createElement('p');
    note.id='beaguQaParticipationNote';
    note.textContent='시험 전용 · 실제 참여코드나 개인정보 입력 금지 · 서버 인증 불가';
    form.before(note);
    input.setAttribute('aria-describedby','beaguParticipationDescription beaguQaParticipationNote');
    button.textContent='입력 동작 확인';
    button.type='button'; // No form POST, not even a synthetic login.
    function demoCheck(){
      const sample=input.value.trim();
      message.textContent=/^[A-Za-z0-9-]{8,120}$/.test(sample)
        ? '입력 및 버튼 동작이 정상입니다. 실제 인증은 수행하지 않습니다.'
        : '예시코드를 영문·숫자 8자 이상 입력해 주세요.';
      input.value='';
      input.focus();
    }
    button.addEventListener('click',function(e){
      e.preventDefault();e.stopImmediatePropagation();demoCheck();
    },true);
    input.addEventListener('keydown',function(e){
      if(e.key==='Enter'){
        e.preventDefault();e.stopImmediatePropagation();demoCheck();
      }
    },true);
    // The built-in modal already calls input.focus() upon opening.
    // Extra focus provides an accessible fallback for delayed rendering.
    window.addEventListener('beagu:participation-open',function(){
      if(!modal.hidden)queueMicrotask(function(){if(!modal.hidden)input.focus();});
    });
  }
  // Run after the original DOMContentLoaded credential guard, but before
  // any user interaction. Never re-enable admin or email/password fields.
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',setup,{once:true});
  } else setup();
})();
</script>
"""

def run(site: pathlib.Path) -> dict:
    manifest_path = site / "stage38-static-mirror.json"
    meta = json.loads(manifest_path.read_text(encoding="utf8"))
    if meta.get("source_sha") != RC or meta.get("staging_ref") != "ycwuugggqbunlbwuzvbx":
        raise RuntimeError("Expected immutable staging RC")
    if meta.get("login_enabled") is not False or meta.get("api_calls_enabled") is not False:
        raise RuntimeError("Preview must remain authentication-disabled")
    if (site / "CNAME").exists():
        raise RuntimeError("Live CNAME forbidden in QA distribution")
    changed = {}
    for page in site.rglob("*.html"):
        html = page.read_text(encoding="utf8")
        if "beagu-participation-auth-v2.js" not in html:
            continue
        if "stage38-public-static-warning" not in html:
            raise RuntimeError("Missing visible safety warning: " + str(page))
        if "connect-src 'none'" not in html or "form-action 'none'" not in html:
            raise RuntimeError("Unexpected API/form policy: " + str(page))
        if "beagu-qa-participation-demo-js" in html:
            raise RuntimeError("Duplicate QA injection")
        updated,n1=re.subn(r"(?i)</head>",CSS + "</head>",html,count=1)
        updated,n2=re.subn(r"(?i)</body>",JS + "</body>",updated,count=1)
        if (n1,n2)!=(1,1):
            raise RuntimeError("Missing head/body: "+str(page))
        page.write_text(updated,encoding="utf8")
        rel=page.relative_to(site).as_posix()
        changed[rel]=hashlib.sha256(updated.encode("utf8")).hexdigest()
    if not changed:
        raise RuntimeError("Participation UI script not found in HTML pages")
    meta["qa_participation_demo_enabled"] = True
    meta["qa_participation_ui_html_sha256"] = changed
    meta["real_codes_allowed"] = False
    meta["login_enabled"] = False
    meta["api_calls_enabled"] = False
    manifest_path.write_text(json.dumps(meta,ensure_ascii=False,sort_keys=True)+"\n",encoding="utf8")
    record={
        "schema":"beagu-qa-participation-desktop-demo-v1",
        "source_sha":RC,
        "staging_ref":"ycwuugggqbunlbwuzvbx",
        "scope":"independent-github-pages-static-only",
        "real_codes_allowed":False,
        "login_enabled":False,
        "api_calls_enabled":False,
        "modified_pages":sorted(changed)
    }
    (site/"qa-participation-ui-manifest.json").write_text(
        json.dumps(record,ensure_ascii=False,sort_keys=True)+"\n",encoding="utf8"
    )
    print("PASS: QA desktop participation UI + safe focus/typing demo on",len(changed),"pages")
    return record

if __name__=="__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 qa/scripts/patch_participation_qa.py SITE")
    run(pathlib.Path(sys.argv[1]).resolve())
