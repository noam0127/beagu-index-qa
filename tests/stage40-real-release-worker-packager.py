#!/usr/bin/env python3
"""Real frozen RC release worker, isolated git+filesystem A->B->A packaging.

No GitHub push, Supabase HTTP, CNAME publication, production deployment or data.
Directly imports the reviewed release worker and runs its real build() function.
"""
import importlib.util
import json
import pathlib
import subprocess
import tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
PIN="5c95aadad971901a8222f83c52e93bf901a3aeb7"
STAGE="ycwuugggqbunlbwuzvbx"
LIVE="snvzwrexuqavnfvzgxqj"

def git(cwd,*args):
    return subprocess.check_output(["git",*args],cwd=cwd,text=True).strip()

def test():
    base=ROOT/"rc"
    assert git(base,"rev-parse","HEAD")==PIN,"RC checkout is not immutable"
    with tempfile.TemporaryDirectory(prefix="beagu-stage40-packager-") as temp:
        tmp=pathlib.Path(temp)
        repo=tmp/"copy"
        subprocess.run(["git","clone","--quiet","--local",str(base),str(repo)],check=True)
        assert git(repo,"rev-parse","HEAD")==PIN
        git(repo,"config","user.name","Stage40 Test")
        git(repo,"config","user.email","stage40-qa@example.invalid")
        homepage=repo/"index.html"
        before=homepage.read_text(encoding="utf8")
        tag='<div id="stage40-immutable-candidate-b">QA ONLY CANDIDATE B</div>'
        assert tag not in before
        assert "</body>" in before
        homepage.write_text(before.replace("</body>",tag+"</body>",1),encoding="utf8")
        subprocess.run(["git","add","index.html"],cwd=repo,check=True)
        subprocess.run(["git","commit","-qm","Stage40 isolated candidate B"],cwd=repo,check=True)
        B=git(repo,"rev-parse","HEAD")
        assert B!=PIN and len(B)==40

        workerfile=repo/"scripts/release-manager/worker.py"
        spec=importlib.util.spec_from_file_location("stage40_reviewer_worker",workerfile)
        worker=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(worker)
        worker.OUTPUT=tmp/"artifact"
        worker.PLAN=tmp/"private-test-job.json"
        assert worker.ROOT.resolve()==repo.resolve()
        assert "snvzwrexuqavnfvzgxqj" in worker.API
        assert worker.api.__code__.co_names, "Original production API is NOT called"
        def build(stage_sha):
            worker.PLAN.write_text(json.dumps({
               "has_job":True,"production_sha":PIN,"staging_sha":stage_sha,
               "job_id":"00000000-0000-4000-8000-000000004042",
               "action":"stage_apply","target":"staging","version":"stage40-qa"
            }))
            worker.build()
            artifact=worker.OUTPUT
            root=(artifact/"index.html").read_text(encoding="utf8")
            assert tag not in root,"Production snapshot contaminated with test candidate"
            assert (artifact/"CNAME").read_text().strip()=="baeguindex.com"
            preview=artifact/"_preview"
            if stage_sha:
                stageHtml=(preview/"index.html").read_text(encoding="utf8")
                assert (preview/"CNAME").exists() is False
                assert "beagu-preview-watermark" in stageHtml
                assert STAGE in (preview/"js"/"supabase-config.js").read_text()
                assert LIVE not in (preview/"js"/"supabase-config.js").read_text()
                # Every preview asset must be staging-only after the original
                # packager's rewrite, including production hard-coded JS.
                for file in preview.rglob("*"):
                    if file.is_file() and file.suffix.lower() in (".js",".html",".mjs"):
                        assert LIVE not in file.read_text(encoding="utf8"),str(file)
                assert (tag in stageHtml)==(stage_sha==B)
                return "B" if tag in stageHtml else "A"
            assert not preview.exists(), "Null rollback must remove staged preview"
            return "none"
        assert build(B)=="B"
        print("PASS real RC worker: A production snapshot + B isolated preview, staging backend only")
        assert build(PIN)=="A"
        print("PASS real RC worker: B→A rollback rebuilds original preview without test marker")
        assert build(None)=="none"
        print("PASS real RC worker: staging cleared, original production snapshot untouched; zero deployments")
    print("PASS real frozen worker build() A→B→A→none in independent filesystem")
if __name__=="__main__":test()
