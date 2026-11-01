"""Export scoped execution evidence after blind product scoring; no costs/secrets."""
import argparse
import json
import os
from pathlib import Path

import compare
import collect
import redact


def export(archive,output):
    archive=Path(archive);output=Path(output)
    data=json.loads((archive/'evidence.json').read_text(encoding='utf-8'))
    source=Path(data['raw_capture']).parent
    invocation=json.loads((source/'invocation.json').read_text(encoding='utf-8'))
    root=Path(invocation['input']['root']);h=compare.tool(compare.ROOT)
    home=Path(os.environ.get('CODEX_HOME',str(Path.home()/'.codex')))
    traces=[]
    for thread in data['family_telemetry']['traces']:
        files=list((home/'sessions').glob('**/*'+thread['thread_id']+'*.jsonl'))
        calls=[]
        if len(files)==1:
            for line in files[0].read_text(encoding='utf-8').splitlines():
                row=json.loads(line);p=row.get('payload',{})
                if row.get('type')!='response_item':continue
                if p.get('type')=='custom_tool_call':
                    calls.append({'kind':'custom_tool_call','call_id':p.get('call_id'),'name':p.get('name'),'input':p.get('input')})
                elif p.get('type')=='function_call':
                    try:args=json.loads(p.get('arguments','{}'))
                    except json.JSONDecodeError:args={}
                    args={k:v for k,v in args.items() if k not in ['message','prompt']}
                    calls.append({'kind':'function_call','call_id':p.get('call_id'),'name':p.get('name'),'arguments_without_messages':args})
        traces.append({'thread_id':thread['thread_id'],'metadata':thread['metadata'],'turn_settings':thread['turn_settings'],'terminal':thread['terminal'],'trace_sha256':thread['trace_sha256'],'calls':calls})
    profile=source/'profile-readback.json'
    if not profile.exists():
        candidates=list(source.parents[1].joinpath('setup').glob('exact-profile*.json'))
        candidates=[p for p in candidates if json.loads(p.read_text(encoding='utf-8')).get('invocation_sha256')==compare.sha((source/'invocation.json').read_bytes())]
        profile=candidates[-1] if candidates else None
    goal=root/'.tmp/goal.json'
    packet={'scope':'Post-blind identity/ownership/authority audit. Costs deliberately omitted.',
            'thread_id':data['events']['thread_id'],'initial_head':data['initial_head'],
            'before':data['runtime_result'].get('before') if data['runtime_result'] else None,'after':data['after'],
            'input':json.loads((root/('.tmp/probes/inputs.json' if data['case']=='P1-P8' else '.tmp/comparison/input.json')).read_text(encoding='utf-8')),
            'goal_adapter':json.loads(goal.read_text(encoding='utf-8')) if goal.exists() else None,
            'profile_readback':json.loads(profile.read_text(encoding='utf-8')) if profile and profile.exists() else None,
            'spawn_ids':data['family_telemetry']['spawn_ids'],'traces':traces,
            'root_command_executions':data['events']['commands'],
            'authority':'Only isolated local product edits, validation, evidence and independent review; commit/push/GitHub write/merge/close/deploy/release/cleanup forbidden. User skill reads and pinned dependencies allowed.'}
    compare.dump(output,redact.exported(packet))
    return {'output':str(output),'threads':len(traces)}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--archive',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();print(json.dumps(export(a.archive,a.output)))
