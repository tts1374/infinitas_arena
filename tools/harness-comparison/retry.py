"""One environmental retry in a new repository; never reset the case/lane cap."""
import argparse
import json
from pathlib import Path
import shutil

import compare
import collect
import environment
import verify_frozen


def provider_usage_limit(path):
    rows,tail=collect.events(path)
    if tail:return False
    return any(row.get('type')=='turn.failed' and 'hit your usage limit' in str(row.get('error',{}).get('message','')).casefold() for row in rows)


def prepare_retry(source,original,run_id,directory):
    source=Path(source).resolve();original=Path(original).resolve();directory=Path(directory).resolve()
    if directory.exists():raise ValueError('preserve existing trial/evidence')
    manifest=json.loads((original/'execution-manifest.json').read_text(encoding='utf-8'))
    row=json.loads((original/'trial-records'/(run_id+'.json')).read_text(encoding='utf-8'))
    key=row['case']+'/'+row['lane']
    ledger=original/'environment-retry-ledger'/(key.replace('/','-')+'.json')
    consumed=dict(manifest.get('retry_ledger',{}))
    for path in (original/'environment-retry-ledger').glob('*.json'):
        entry=json.loads(path.read_text(encoding='utf-8'))
        consumed[entry['case_lane']]=entry
    if key in consumed or ledger.exists():raise ValueError('case/lane environment retry already consumed')
    previous=original/'runs'/(run_id+'-attempt0')
    result=json.loads((previous/'result.json').read_text(encoding='utf-8'))
    if result['exit_code']==0 or not provider_usage_limit(previous/'events.jsonl'):raise ValueError('retry requires evidenced environment interruption, not quality failure')
    h=compare.pinned(source)
    directory.mkdir(parents=True)
    new_id=run_id+'-environment-retry1'
    data=json.loads((original/'inputs'/(row['case']+'.json')).read_text(encoding='utf-8'))
    prepared=compare.prepare_trial(source,directory,{**row,'run_id':new_id},h,data)
    root=Path(prepared['root']);old_root=Path(row['root'])
    frozen=json.loads((original/'ignored-input-attestation.json').read_text(encoding='utf-8'))['runs'][run_id]
    for rel,digest in frozen.items():
        if rel=='.tmp/goal.json':continue  # a new Goal has a fresh request ID/base HEAD
        src=old_root/rel
        if compare.sha(src.read_bytes())!=digest:raise ValueError('original frozen input changed: '+rel)
        target=root/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(src.read_bytes())
    for name in ['C1.json','C2.json','C3.json','requirements.md','prompt.txt','probes.json','probes-scoring.json']:
        p=original/'inputs'/name
        if p.exists():compare.write(directory/'inputs'/name,p.read_bytes())
    record=directory/'trial-records'/(new_id+'.json')
    retry_row=json.loads(record.read_text(encoding='utf-8'))
    retry_row.update(prompt=row['prompt'],environment_revision=manifest['revision'],environment_retry_of=str(previous),environment_retry_number=1)
    record.write_text(json.dumps(retry_row,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    if prepared['product_hashes']!=next(x['product_hashes'] for x in manifest['prepared'] if x['run_id']==run_id):raise ValueError('retry product/seed mismatch')
    dep=compare.run_command([str(root/'.tmp/toolchain/npm.cmd'),'ci','--no-audit','--no-fund'],root,directory/'setup/npm-ci.log')
    compare.dump(directory/'setup/dependencies.json',[dep])
    if dep['exit_code']:raise ValueError('fresh dependency preparation failed; preserve')
    compare.dump(directory/'setup/effective.json',environment.inspect(root,sandbox=manifest['sandbox'],toolchain=True))
    entry={'case_lane':key,'retry_number':1,'previous_run':str(previous),'fresh_run':str(root),'reason':'Provider usage-limit error; fresh context and input retained','at':compare.utc(),'further_retry_allowed':False}
    compare.dump(ledger,entry)
    new_manifest={**manifest,'frozen_at':compare.utc(),'prepared':[prepared],'parent_execution_manifest_sha256':compare.sha((original/'execution-manifest.json').read_bytes()),'retry_ledger':{**consumed,key:entry}}
    compare.dump(directory/'execution-manifest.json',new_manifest)
    compare.write(directory/'preflight.json',(original/'preflight.json').read_bytes())
    compare.dump(directory/'schedule.json',{'runs':[{'run_id':new_id,'case':row['case'],'lane':row['lane'],'replaces_interrupted_attempt_only':run_id}]})
    verify_frozen.attest(directory)
    compare.dump(directory/'ready.json',{'status':'READY','manifest_file':'execution-manifest.json','manifest_sha256':compare.sha((directory/'execution-manifest.json').read_bytes()),'at':compare.utc()})
    return {'run_id':new_id,'directory':str(directory),'status':'READY'}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--original',required=True);p.add_argument('--run-id',required=True);p.add_argument('--directory',required=True)
    a=p.parse_args();print(json.dumps(prepare_retry(a.source,a.original,a.run_id,a.directory)))
