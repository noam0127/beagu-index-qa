#!/usr/bin/env python3
"""Provide a keyboard-accessible demo-only participation code input in public static QA.

This runs after the upstream static mirror sanitizer. Public QA never sends
credentials to any API; connect-src 'none' and form-action 'none' remain in
all pages. It does not touch or rewrite source repo, production, or staging.
"""
from pathlib import Path
import json
import re

SITE = Path(__file__).resolve().parents[1] / "source" / "_preview_standalone_site"
# When invoked in GitHub Actions the qa and source checkouts are siblings.
if not SITE.exists():
    SITE = Path(__file__).resolve().parents[2] / "source" / "_preview_standalone_site"

STYLE = r"""
<style id="beagu-qa-participation-desktop-style">
@media (min-width: 800px) {
 .beagu-participation-overlay {padding:32px; background:rgba(11,28,49,.66)}
 .beagu-participation-dialog {
  width:min(100%,520px); max-height:min(740px,calc(100dvh - 64px));
  padding:36px 38px 32px; border-radius:24px;
  border:1px solid #dae5f5; box-shadow:0 28px 90px rgba(8,25,51,.3);
 }
 .beagu-participation-dialog h2 {font-size:27px; letter-spacing:-.04em;line-height:1.35}
 #beaguParticipationDescription {font-size:14px;line-height:1.7;margin-bottom:22px}
 #beaguParticipationForm {gap:14px}
 .beagu-participation-field input {
  width:100%;height:56px;min-width:0;padding:0 75px 0 17px;
  border:1.5px solid #c6d5e9;border-radius:13px;
  font-size:16px;line-height:1.45;color:#122b45;background:#fff;
 }
 #beaguParticipationSubmit {width:100%;min-height:52px;font-size:15px}
 .beagu-participation-host .beagu-participation-inline-trigger {
  width:min(100%,330px);max-width:100%;
 }
}
@media (max-width: 799px) {
 .beagu-participation-dialog {width:min(100%,440px);padding:28px 22px 22px}
 .beagu-participation-field input {min-width:0;font-size:16px}
}
.beagu-participation-field input:not(:disabled):focus {
 caret-color:#1d56b2;outline:3px solid rgba(52,124,239,.23)!important;
 outline-offset:2px;border-color:#2463c8!important;
 box-shadow:0 0 0 4px rgba(52,124,239,.11)!important;
}
#beaguParticipationMessage {min-height:1.5em}
</style>
"""

SCRIPT = r"""
<script id="beagu-qa-demo-participation" type="text/javascript">
(function(){
 'use strict';
 function initDemo(){
  const modal=document.getElementById('beaguParticipationOverlay');
  const code=modal && modal.querySelector('#beaguParticipationCode');
  const form=modal && modal.querySelector('#beaguParticipationForm');
  if(!modal || !code || !form) return;
  // Static guard disabled password inputs on DOMContentLoaded.
  // Enable only this field, never email, account, admin or other credentials.
  code.disabled=false;
  code.readOnly=false;
  code.autocomplete='off';
  code.placeholder='예시코드 입력 (예: TESTCODE1234)';
  code.setAttribute('aria-describedby','beaguParticipationDescription beaguQaDemoNotice');
  code.setAttribute('data-qa-local-demo','true');
  const description=modal.querySelector('#beaguParticipationDescription');
  if(description) description.textContent='키보드와 화면 구성을 확인하는 시험입니다. 실제 참여코드는 입력하지 마세요.';
  const notice=document.createElement('p');
  notice.id='beaguQaDemoNotice';
  notice.style.cssText='margin:8px 0 2px;color:#9a3412;font-size:12px;font-weight:700;line-height:1.6';
  notice.textContent='시험 전용 · 예시코드만 입력 · 인증 및 서버 전송 불가';
  form.before(notice);
  const submit=modal.querySelector('#beaguParticipationSubmit');
  if(submit)submit.textContent='입력 동작 확인';
  const msg=modal.querySelector('#beaguParticipationMessage');
  // Capture runs before the production authentication handler.
  // Never call fetch(), localStorage or sessionStorage with this value.
  form.addEventListener('submit',function(event){
   event.preventDefault();
   event.stopImmediatePropagation();
   const entered=code.value.trim();
   if(msg)msg.textContent=entered.length>=8
     ?'입력과 버튼 동작 확인 완료. 이 화면에서는 인증하지 않습니다.'
     :'예시코드를 8자 이상 입력해 주세요.';
   code.value='';
   code.focus();
  },true);
 }
 // This listener is registered after the upstream head guard, so only the
 // named code input is re-enabled after the guard has disabled credentials.
 if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',initDemo,{once:true});
 else initDemo();
})();
</script>
"""

def main():
    manifest=json.loads((SITE/"stage38-static-mirror.json").read_text(encoding="utf8"))
    assert manifest["login_enabled"] is False and manifest["api_calls_enabled"] is False
    assert manifest["source_sha"]=="5c95aadad971901a8222f83c52e93bf901a3aeb7"
    assert not (SITE/"CNAME").exists()
    changed=0
    for page in SITE.rglob("*.html"):
        original=page.read_text(encoding="utf8")
        assert "stage38-public-static-warning" in original,page
        assert "connect-src 'none'" in original,page
        assert "form-action 'none'" in original,page
        assert "beagu-qa-demo-participation" not in original,page
        assert "</head>" in original.lower() and "</body>" in original.lower(),page
        updated=re.sub(r"(?i)</head>",STYLE+"\n</head>",original,count=1)
        updated=re.sub(r"(?i)</body>",SCRIPT+"\n</body>",updated,count=1)
        page.write_text(updated,encoding="utf8")
        changed+=1
    assert changed>=20,changed
    (SITE/"qa-participation-demo.json").write_text(json.dumps({
        "purpose":"static-only keyboard/focus visual QA",
        "source_sha":manifest["source_sha"],
        "login_enabled":False,
        "api_calls_enabled":False,
        "real_codes_allowed":False,
        "changed_html_pages":changed
    },ensure_ascii=False,sort_keys=True)+"\n",encoding="utf8")
    print(f"PASS: {changed} QA HTML pages have demo-only, focusable participation input")
if __name__=="__main__":
    main()
