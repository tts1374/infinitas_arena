"""Provision condition revision 2 before any of its model sessions starts.

Use after compare.prepare. Prior failed trials remain immutable. The workload
Goal/AC/seed/quality thresholds are unchanged; toolchain/access corrections are
applied to both lanes and recorded as a new environment revision.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import subprocess

import compare
import environment
import probes
import verify_frozen

GUARD='''\n環境revision2の共通追加条件: 最初に .tmp/toolchain/node.exe --version と .tmp/toolchain/npm.cmd --version、Get-Command node/npm、CLI内の実環境を.tmp/evidence/environment.jsonへread-backしてください。Nodeはv22.23.4、npmは10.9.9を使用します。PATH先頭にこのrepoの.tmp/toolchainが設定されています。異なるversionを代用して実装・検証せず、環境不一致ならBLOCKEDを保存して停止してください。実行は全方式で同じローカル権限、外部MCP/apps/plugins無効です。権限が広くても他repo/秘密/非所有process/外部write禁止は維持します。browserの固定pathは.tmp/comparison/runtime.jsonとreference/visual.jsonです。C2共通追加試験は node --import tsx --test .tmp/comparison/c2-barrier.test.mjs ですが、unitを実hibernationや実local DO restartと混同しません。C3の旧consumer sourceと値fixtureは.tmp/comparison/old-consumersとsnapshot-values.jsonです。\n'''


def freeze(source,directory,reference):
    source=Path(source).resolve();directory=Path(directory).resolve();reference=Path(reference).resolve()
    if (directory/'runs').exists() or (directory/'ready.json').exists():raise ValueError('never change an executed/frozen environment')
    h=compare.pinned(source)
    original=json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
    probe=probes.prepare(source,directory,h,compare.legacy_export)
    compare.dump(directory/'setup/probe-environment.json',probe)
    node=Path(subprocess.check_output(['node','-p','process.execPath']).decode().strip())
    if subprocess.check_output([str(node),'--version']).decode().strip()!='v22.23.4':raise ValueError('wrong host toolchain')
    binary='C:/Users/tts13/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe'
    playwright='C:/Users/tts13/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs'
    records=[]
    for path in sorted((directory/'trial-records').glob('*.json')):
        row=json.loads(path.read_text(encoding='utf-8'));root=Path(row['root'])
        compare.write(directory/'trial-records-initial'/path.name,path.read_bytes())
        row['prompt']=row.get('prompt',compare.COMMON)+GUARD
        row['environment_revision']='I198-conditions-2'
        if row['run_id']=='C1-legacy-1':row['environment_retry_of']='issue198-20261026-b/C1-legacy-1-attempt0 (only permitted environment retry)'
        path.write_bytes(compare.json_bytes(row) if hasattr(compare,'json_bytes') else (json.dumps(row,ensure_ascii=False,indent=2)+'\n').encode())
        shutil.copytree(node.parent,root/'.tmp/toolchain')
        if row['case']!='P1-P8':
            for name in ['browser_fixture.mjs','visual-fixture.tsx','c2-barrier.test.mjs']:
                compare.write(root/'.tmp/comparison'/name+'.new',b'') if False else None
                (root/'.tmp/comparison'/name).write_bytes((compare.ROOT/'tools/harness-comparison'/name).read_bytes())
            shutil.copytree(reference,root/'.tmp/comparison/reference')
            compare.dump(root/'.tmp/comparison/runtime.json',{'node':'22.23.4','npm':'10.9.9','browser_executable':binary,'playwright':playwright,'scope':'owned loopback only; never reuse existing listener/process','worker_runtime':'new isolated persistence under .tmp only; no production vars/resources; wrangler dev --local with allocated free port'})
            if row['case']=='C3':
                for scope in ['apps/client/src','packages/shared/src']:
                    shutil.copytree(root/scope,root/'.tmp/comparison/old-consumers'/scope)
                compare.dump(root/'.tmp/comparison/snapshot-values.json',{'variants':[{}, {'quick_chat_available':True},{'quick_chat_available':False},{'quick_chat_available':None},{'quick_chat_available':'invalid'},{'quick_chat_available':1}],'save_version':'unchanged; actual serializers/readers required, no type casts as evidence'})
        records.append(row)
    def install(row):
        root=Path(row['root'])
        return compare.run_command([str(root/'.tmp/toolchain/npm.cmd'),'ci','--no-audit','--no-fund'],root,directory/'setup'/(row['run_id']+'-npm-ci.log'))
    with ThreadPoolExecutor(max_workers=2) as pool:dependencies=list(pool.map(install,records))
    compare.dump(directory/'setup/dependencies.json',dependencies)
    if any(x['exit_code'] for x in dependencies):raise ValueError('dependency installation failed; preserve this environment')
    for row in records:
        result=environment.inspect(row['root'],sandbox='danger-full-access',toolchain=True)
        compare.dump(directory/'setup/readback-final'/(row['run_id']+'.json'),result)
    final={**original,'revision':'I198-conditions-2','frozen_at':compare.utc(),'sandbox':'danger-full-access',
           'toolchain':{'node':'22.23.4','npm':'10.9.9','source_node_sha256':compare.sha(node.read_bytes()),'local_copy':'.tmp/toolchain','actual_model_shell_guard':True},
           'environment_change':{'previous':'issue198-20261026-b','reason':'workspace-write shell could not read pinned runtime/browser dependencies and fell back to unsupported Node25; first run invalid. Same explicit local toolchain/access correction for both lanes; all workload criteria unchanged.', 'first_failure_retained':True},
           'retry_ledger':{'C1/legacy':{'environment_retries_used':1,'previous':'issue198-20261026-b/C1-legacy-1-attempt0','further_retry_allowed':False}},
           'probes':probe,'prompts':{r['run_id']:compare.sha(r['prompt'].encode()) for r in records}}
    compare.dump(directory/'execution-manifest.json',final)
    preflight={'at':compare.utc(),'helper_hashes':{p.name:compare.sha(p.read_bytes()) for p in (compare.ROOT/'tools/harness-comparison').glob('*') if p.is_file()},'reference_hashes':{p.name:compare.sha(p.read_bytes()) for p in reference.glob('*') if p.is_file()},'workload_input_unchanged':True,'original_manifest_sha256':compare.sha((directory/'manifest.json').read_bytes()),'environment_revision':'I198-conditions-2'}
    compare.dump(directory/'preflight.json',preflight)
    verify_frozen.attest(directory)
    compare.dump(directory/'ready.json',{'status':'READY','at':compare.utc(),'manifest_file':'execution-manifest.json','manifest_sha256':compare.sha((directory/'execution-manifest.json').read_bytes()),'preflight_sha256':compare.sha((directory/'preflight.json').read_bytes()),'schedule_sha256':compare.sha((directory/'schedule.json').read_bytes())})
    return {'status':'READY','trials':len(records),'manifest_sha256':compare.sha((directory/'execution-manifest.json').read_bytes())}


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--directory',required=True);p.add_argument('--reference',required=True)
    a=p.parse_args();print(json.dumps(freeze(a.source,a.directory,a.reference)))
