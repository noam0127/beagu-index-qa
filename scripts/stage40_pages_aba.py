#!/usr/bin/env python3
"""QA Pages ONLY: label an immutable, credential-disabled RC static build.

No Supabase requests, GitHub writes, secrets, live code, or private data.
Usage: stage40_pages_aba.py prepare SITE A|B
       stage40_pages_aba.py verify URL A|B
"""
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

PIN = "5c95aadad971901a8222f83c52e93bf901a3aeb7"
STAGE = "ycwuugggqbunlbwuzvbx"
BASE = "https://noam0127.github.io/beagu-index-qa/"
TAG = 'name="qa-stage40-release"'
NOTICE = "stage38-public-static-warning"
STATE = "qa-stage40-remote-state.json"

def inspect(site):
    mirror = json.loads((site / "stage38-static-mirror.json").read_text(encoding="utf8"))
    manifest = json.loads((site / "stage38-release-manifest.json").read_text(encoding="utf8"))
    qa = json.loads((site / "qa-participation-ui-manifest.json").read_text(encoding="utf8"))
    for obj in (mirror, manifest, qa):
        assert obj["source_sha"] == PIN, "Wrong immutable RC source"
    assert mirror["staging_ref"] == STAGE and manifest["supabase_project_ref"] == STAGE
    assert mirror["login_enabled"] is False and mirror["api_calls_enabled"] is False
    assert qa["real_codes_allowed"] is False and qa["login_enabled"] is False
    assert qa["api_calls_enabled"] is False
    assert not (site / "CNAME").exists(), "Publishing a production CNAME is forbidden"
    for file in site.rglob("*"):
        assert not file.is_symlink(), "Symlink forbidden"
        if file.suffix.lower() == ".html":
            html = file.read_text(encoding="utf8")
            assert NOTICE in html and "connect-src 'none'" in html
            assert "form-action 'none'" in html
    index = (site / "index.html").read_text(encoding="utf8")
    assert TAG not in index
    return index

def prepare(site, stage):
    assert stage in ("A", "B")
    index = inspect(site)
    meta = '<meta name="qa-stage40-release" content="' + stage + '">'
    assert "</head>" in index
    (site / "index.html").write_text(index.replace("</head>", meta + "</head>", 1), encoding="utf8")
    (site / STATE).write_text(json.dumps({
        "kind": "qa-static-remote-rollback-only",
        "stage": stage, "source_sha": PIN, "staging_ref": STAGE,
        "login_enabled": False, "api_calls_enabled": False,
        "production_release": False
    }, sort_keys=True) + "\n", encoding="utf8")
    print("PASS prepared isolated static QA Pages state", stage)

def get(url):
    request = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "Pragma": "no-cache"})
    with urllib.request.urlopen(request, timeout=20) as result:
        assert result.status == 200
        assert result.url.startswith(BASE), "Unexpected redirect from independent QA site"
        return result.read().decode("utf8")

def verify(base, stage):
    assert stage in ("A", "B")
    assert base.rstrip("/") + "/" == BASE, "Refusing to probe a non-QA site"
    last = None
    for attempt in range(18):
        try:
            cache = "?v=stage40-" + stage + "-" + str(int(time.time()))
            state = json.loads(get(BASE + STATE + cache))
            html = get(BASE + "index.html" + cache)
            assert state["stage"] == stage, "Page state has not propagated"
            assert state["source_sha"] == PIN and state["staging_ref"] == STAGE
            assert state["login_enabled"] is False and state["api_calls_enabled"] is False
            assert state["production_release"] is False
            assert '<meta name="qa-stage40-release" content="' + stage + '">' in html
            assert NOTICE in html and "connect-src 'none'" in html
            assert "form-action 'none'" in html and "beagu-qa-participation-demo-js" in html
            print("PASS real HTTPS QA Pages", stage, "static only; no login/API/forms")
            return
        except (AssertionError, ValueError, OSError) as exc:
            last = str(exc)
            if attempt < 17:
                time.sleep(5)
    raise RuntimeError("QA Pages state " + stage + " not confirmed: " + str(last))

if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("prepare", "verify"):
        raise SystemExit("usage: stage40_pages_aba.py prepare SITE A|B | verify URL A|B")
    if sys.argv[1] == "prepare":
        prepare(pathlib.Path(sys.argv[2]).resolve(), sys.argv[3])
    else:
        verify(sys.argv[2], sys.argv[3])
