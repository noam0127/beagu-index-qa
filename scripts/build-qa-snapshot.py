#!/usr/bin/env python3
"""Isolated QA Pages only; export immutable public assets; no operating DB or credentials."""
import hashlib,json,pathlib,re,shutil,subprocess,sys
source=pathlib.Path(sys.argv[1]).resolve()
config=json.loads(pathlib.Path(sys.argv[2]).read_text())
out=pathlib.Path(sys.argv[3]).resolve()
sha=config['source_sha']
assert re.fullmatch('[0-9a-f]{40}',sha)
def git(*args):return subprocess.check_output(['git','-C',str(source),*args])
assert git('cat-file','-t',sha).strip()==b'commit'
if out.exists():shutil.rmtree(out)
out.mkdir()
data={
'data/class-diary-art-manifest-v1.json','data/percentiles-2023-2025.json',
'data/public-2023-2025-school-records-v2.json','data/public-2025-participation-v1.json',
'data/public-compare-school-directory-v1.json','data/public-lv0-percentiles-v1.2.json',
'data/public-school-reports-v1.json','data/public-statistics-question-catalog-v1.json',
'data/schools.json','data/sejong-school-legal-dong-2025.csv'
}
prod='snvzwrexuqavnfvzgxqj'
prod_key='sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2'
stage='ycwuugggqbunlbwuzvbx'
stage_key='sb_publishable_c8h7TaIYONfP56Zc05K0Sw_SxyT3lZU'
guard="""<meta http-equiv="Content-Security-Policy" content="connect-src 'self'; form-action 'none'; object-src 'none'; base-uri 'self'"><meta name="robots" content="noindex,nofollow,noarchive"><script id="qa-snapshot-safety">
document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation()},true);
function protect(){document.querySelectorAll('input[type=password],input[type=email]').forEach(x=>{x.disabled=true;x.value='';x.placeholder='시험 웹 인증 차단'});}
document.addEventListener('DOMContentLoaded',()=>{protect();new MutationObserver(protect).observe(document.body,{childList:true,subtree:true})},{once:true});
</script>"""
notice='<div role="note" style="position:fixed;bottom:8px;right:8px;z-index:2147483647;pointer-events:none;background:#233b65;color:#fff;padding:8px 12px;border-radius:8px;font:700 12px system-ui">독립 시험 웹 · 실제 개인정보/참여코드 입력 금지 · 운영 API 차단</div>'
seen={}
for row in git('ls-tree','-rz',sha).split(b'\0'):
    if not row:continue
    meta,raw=row.split(b'\t',1)
    mode,typ,blob=meta.decode().split()
    path=raw.decode('utf8')
    p=pathlib.PurePosixPath(path)
    if typ!='blob' or mode not in ('100644','100755') or any(x.startswith('.') for x in p.parts):continue
    suffix=p.suffix.lower()
    allowed=(len(p.parts)==1 and suffix=='.html') or path in data or (p.parts[0]=='assets' and suffix=='.webp') or (p.parts[0]=='js' and suffix in ('.js','.html')) or (p.parts[0] in ('styles','\u200bcss') and suffix=='.css') or (p.parts[0]=='r' and suffix=='.html')
    if not allowed:continue
    body=git('cat-file','blob',blob)
    target=out/path
    target.parent.mkdir(parents=True,exist_ok=True)
    if suffix in ('.js','.html','.css','.json','.csv'):
        text=body.decode('utf8')
        if suffix in ('.js','.html','.css'):
            text=text.replace(prod,stage).replace(prod_key,stage_key)
            relative='../'*(len(p.parts)-1) or './'
            text=re.sub(r'https://(?:www\.)?baeguindex\.com(?:/_preview)?/?',relative,text,flags=re.I)
            if suffix=='.html':
                text=re.sub(r'(?i)(href|src|action)=(["\'])(/)(?!/)',lambda m:m[1]+'='+m[2]+relative,text)
                text,n=re.subn(r'(?i)<head(?:\s[^>]*)?>',lambda m:m[0]+guard,text,count=1)
                assert n==1,path
                text,n=re.subn(r'(?i)<body(?:\s[^>]*)?>',lambda m:m[0]+notice,text,count=1)
                assert n==1,path
        assert prod not in text and prod_key not in text,path
        body=text.encode()
    target.write_bytes(body)
    seen[path]=hashlib.sha256(body).hexdigest()
for path in ('index.html','search.html','search-lv1.html','admin.html','admin-updates.html','challenge.html','statistics.html','teacher-volleyball.html','js/supabase-config.js','data/public-compare-school-directory-v1.json'):
    assert path in seen,path
assert not (out/'CNAME').exists()
(out/'.nojekyll').touch()
(out/'qa-release.json').write_text(json.dumps({'version':config['version'],'source_sha':sha,'environment':'independent-static-qa','production_access':False,'real_credentials_allowed':False,'backend_integration_verified':False,'files':len(seen),'files_sha256':seen},ensure_ascii=False,sort_keys=True))
print('QA snapshot',config['version'],sha,'files',len(seen))
