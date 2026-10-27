"""Append-only experiment checkpoint. Claims, adjudication and missing data stay separate."""
import argparse
import json
from pathlib import Path

import compare
import collect


def snapshot(experiments,output):
    manifests=[];runs=[];pending=[];ledger={}
    for name in experiments:
        experiment=Path(name).resolve()
        ready=experiment/'ready.json'
        if ready.exists():
            r=json.loads(ready.read_text(encoding='utf-8'));m=experiment/r.get('manifest_file','manifest.json')
            value=json.loads(m.read_text(encoding='utf-8'))
            manifests.append({'experiment':str(experiment),'path':str(m),'sha256':compare.sha(m.read_bytes()),'revision':value['revision']})
            ledger.update(value.get('retry_ledger',{}))
        for file in (experiment/'environment-retry-ledger').glob('*.json'):
            entry=json.loads(file.read_text(encoding='utf-8'));ledger[entry['case_lane']]=entry
        for record in sorted((experiment/'trial-records').glob('*.json')):
            row=json.loads(record.read_text(encoding='utf-8'))
            path=experiment/'runs'/(row['run_id']+'-attempt0')
            if not (path/'process.json').exists():
                pending.append({'experiment':experiment.name,'run_id':row['run_id'],'case':row['case'],'lane':row['lane'],'status':'not_started','tokens':None})
                continue
            events=collect.summary(path/'events.jsonl')
            family=collect.linked_traces(events['thread_id']) if events['thread_id'] else None
            result=path/'result.json'
            runtime=json.loads(result.read_text(encoding='utf-8')) if result.exists() else None
            executor=Path(row['root'])/'.tmp/evidence/executor.json'
            try:claim=json.loads(executor.read_text(encoding='utf-8')) if executor.exists() else None
            except json.JSONDecodeError:claim={'status':'unproven; incomplete executor JSON at observation'}
            timing=path/'terminal-timing.json'
            recovery=json.loads(timing.read_text(encoding='utf-8')) if timing.exists() else None
            runs.append({'experiment':experiment.name,'run_id':row['run_id'],'case':row['case'],'lane':row['lane'],
                         'environment_retry_of':row.get('environment_retry_of'),'initial_head':row['head'],'input_sha256':row['input_sha256'],
                         'runtime_result':runtime,'recovered_terminal_timing':recovery,
                         'executor_claim':claim,'independent_comparison_adjudication':'separate audit artifact; not inferred here',
                         'provider_terminal_events':events['terminal'],'parent_usage_from_cli':events['usage'],
                         'family_telemetry':family,'capture':str(path/'events.jsonl'),'capture_sha256':events['events_sha256'],
                         'raw_complete_events':events['events'],'unparsed_tail_bytes':events['unparsed_tail_bytes']})
    complete=[r['family_telemetry']['all_agents_total_tokens'] for r in runs if r['family_telemetry'] and r['family_telemetry']['all_agents_total_tokens'] is not None]
    value={'observed_at':compare.utc(),'status':'checkpoint; comparison/adoption not complete',
           'fixed':{'product_base':compare.PRODUCT,'v2_revision':compare.HARNESS,'runtime_sha256':compare.RUNTIME,'model':'gpt-6.1-sol','parent_effort':'high'},
           'manifests':manifests,'recorded_environment_retry_ledger':ledger,'executed_attempts':runs,'not_started':pending,
           'all_executed_families_tokens':sum(complete) if len(complete)==len(runs) else None,
           'known_complete_family_tokens_subtotal':sum(complete) if complete else None,
           'families_without_final_total':len(runs)-len(complete),
           'active_seconds':None,'preparation_and_shared_adjudication_tokens':None,
           'interpretation':'No missing values imputed, no success-only efficiency claim. Failed/interrupted attempts retained. CLI family wall/usage exclude shared preparation and later comparative adjudication.'}
    compare.dump(output,value)
    return {'output':str(output),'executed_attempts':len(runs),'not_started_records':len(pending),'final_total_missing_families':len(runs)-len(complete)}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--experiment',action='append',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();print(json.dumps(snapshot(a.experiment,a.output)))
