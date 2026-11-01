"""Archive one run without converting executor claims into acceptance."""
import argparse
from datetime import datetime
import json
from pathlib import Path
import subprocess
import compare
import collect
import redact


def archive(experiment,run_id,output):
    experiment=Path(experiment).resolve();output=Path(output).resolve()
    if output.exists():raise ValueError('keep prior archive; select a new output')
    source=experiment/'runs'/(run_id+'-attempt0')
    invocation=json.loads((source/'invocation.json').read_text(encoding='utf-8'))
    row=invocation['input'];root=Path(row['root']);h=compare.tool(compare.ROOT)
    raw=collect.summary(source/'events.jsonl')
    family=collect.linked_traces(raw['thread_id']) if raw['thread_id'] else {'all_agents_total_tokens':None,'spawn_ids':None}
    executor=root/'.tmp/evidence/executor.json'
    executor_data=json.loads(executor.read_text(encoding='utf-8')) if executor.exists() else None
    result_file=source/'result.json'
    result=json.loads(result_file.read_text(encoding='utf-8')) if result_file.exists() else None
    process=json.loads((source/'process.json').read_text(encoding='utf-8'))
    parent=next((t for t in family.get('traces',[]) if t['thread_id']==raw['thread_id']),{})
    terminal=parent.get('terminal') or {}
    wall_to_terminal=None
    if terminal.get('at'):
        wall_to_terminal=(datetime.fromisoformat(terminal['at'].replace('Z','+00:00'))-datetime.fromisoformat(process['started_at'])).total_seconds()
    patch=compare.git(root,'diff','--binary',row['head'])
    untracked={}
    for rel in compare.git(root,'ls-files','--others','--exclude-standard','-z').split(b'\0'):
        if not rel:continue
        name=rel.decode('utf-8');path=root/name
        if not path.is_file() or path.is_symlink():raise ValueError('non-regular trial output: '+name)
        untracked[name]={'sha256':compare.sha(path.read_bytes()),'content':path.read_text(encoding='utf-8')}
    artifact={'archived_at':compare.utc(),'experiment':experiment.name,'run_id':run_id,'case':row['case'],'lane':row['lane'],
              'input_hash':row['input_sha256'],'initial_head':row['head'],'manifest_sha256':invocation['manifest_sha256'],
              'executor_claim':executor_data,'independent_comparison_verdict':'pending; this collector makes no quality decision',
              'runtime_result':result,'events':raw,'family_telemetry':family,
              'timing':{'started_at':process['started_at'],'model_terminal_at':terminal.get('at'),'wall_to_model_terminal_seconds':wall_to_terminal,'cli_wall_seconds':result.get('wall_seconds') if result else None,'active_seconds':None},
              'after':h.snapshot(root),'untracked_files':untracked,'tracked_patch_sha256':compare.sha(patch),
              'raw_capture':str(source/'events.jsonl'),'raw_capture_sha256':compare.sha((source/'events.jsonl').read_bytes()),
              'cost_scope':'CLI parent and linked children only. Shared preparation/comparison adjudication costs are separate and not fully measured.'}
    output.mkdir(parents=True)
    compare.write(output/'tracked.patch',patch)
    compare.dump(output/'evidence.json',redact.exported(artifact))
    return {'run_id':run_id,'output':str(output),'parent_terminal':terminal,'cli_wall_seconds':artifact['timing']['cli_wall_seconds'],'all_agents_total_tokens':family.get('all_agents_total_tokens'),'spawn_ids':family.get('spawn_ids')}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--experiment',required=True);p.add_argument('--run-id',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();print(json.dumps(archive(a.experiment,a.run_id,a.output),ensure_ascii=True))
