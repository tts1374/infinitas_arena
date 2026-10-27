"""Attest and check ignored workload inputs separately from executor evidence."""
import argparse
import json
from pathlib import Path
import compare


def inventory(root):
    root=Path(root)
    paths=[]
    for scope in ['.tmp/comparison','.tmp/probes','.tmp/toolchain']:
        paths.extend(p for p in (root/scope).rglob('*') if p.is_file())
    if (root/'.tmp/goal.json').is_file():paths.append(root/'.tmp/goal.json')
    return {p.relative_to(root).as_posix():compare.sha(p.read_bytes()) for p in sorted(paths)}


def attest(directory):
    directory=Path(directory)
    rows={};records={}
    preflight=json.loads((directory/'preflight.json').read_text(encoding='utf-8'))
    for file in sorted((directory/'trial-records').glob('*.json')):
        row=json.loads(file.read_text(encoding='utf-8'));root=Path(row['root'])
        input_file=root/('.tmp/probes/inputs.json' if row['case']=='P1-P8' else '.tmp/comparison/input.json')
        if compare.sha(input_file.read_bytes())!=row['input_sha256']:raise ValueError('original input differs: '+row['run_id'])
        if row['case']!='P1-P8':
            for name in ['browser_fixture.mjs','visual-fixture.tsx']:
                if compare.sha((root/'.tmp/comparison'/name).read_bytes())!=preflight['helper_hashes'][name]:raise ValueError('helper differs from original preflight')
            for name,digest in preflight['reference_hashes'].items():
                if compare.sha((root/'.tmp/comparison/reference'/name).read_bytes())!=digest:raise ValueError('reference differs from original preflight')
        rows[row['run_id']]=inventory(root)
        records[row['run_id']]=compare.sha(file.read_bytes())
    compare.dump(directory/'ignored-input-attestation.json',{'at':compare.utc(),'note':'Original input/helper/reference hashes checked. Adapter/old-reader files attested before their sessions; first legacy C1 has no v2 adapter. Does not re-freeze workload expectations.','runs':rows,'records':records})
    return rows


def check(directory,run_id):
    directory=Path(directory)
    attestation=json.loads((directory/'ignored-input-attestation.json').read_text(encoding='utf-8'))
    frozen=attestation['runs'][run_id]
    record=directory/'trial-records'/(run_id+'.json')
    if run_id in attestation.get('records',{}) and compare.sha(record.read_bytes())!=attestation['records'][run_id]:raise ValueError('trial record changed')
    row=json.loads(record.read_text(encoding='utf-8'))
    if inventory(row['root'])!=frozen:raise ValueError('ignored workload input changed: '+run_id)
    return {'status':'PASS','run_id':run_id,'at':compare.utc(),'input_inventory_sha256':compare.sha(json.dumps(frozen,sort_keys=True).encode())}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--directory',required=True);p.add_argument('--attest',action='store_true');p.add_argument('--run-id')
    a=p.parse_args();result=attest(a.directory) if a.attest else check(a.directory,a.run_id)
    print(json.dumps({'runs':list(result)} if a.attest else result,ensure_ascii=True))
