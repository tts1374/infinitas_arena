"""Read-only model-event/telemetry extraction; never infer missing costs."""
import argparse
import json
import os
from pathlib import Path

import compare


def events(path):
    """Accept JSONL and the initial capture's adjacent JSON objects losslessly.

    Frozen prototype redaction serializes each JSON object without its newline.
    The original capture is retained; raw_decode recovers framing without
    modifying values or guessing missing bytes. A partial tail stays unparsed.
    """
    text=Path(path).read_text(encoding='utf-8')
    decoder=json.JSONDecoder();index=0;rows=[]
    while index<len(text):
        while index<len(text) and text[index].isspace():index+=1
        if index==len(text):break
        try:row,end=decoder.raw_decode(text,index)
        except json.JSONDecodeError:break
        rows.append(row);index=end
    return rows, text[index:]


def summary(path):
    rows,tail=events(path)
    messages=[r['item'].get('text') for r in rows if r.get('item',{}).get('type')=='agent_message']
    commands=[{k:r['item'].get(k) for k in ['command','exit_code','status']} for r in rows if r.get('item',{}).get('type')=='command_execution' and r['type']=='item.completed']
    thread=next((r.get('thread_id') for r in rows if r.get('type')=='thread.started'),None)
    return {'thread_id':thread,'events':len(rows),'usage':[r['usage'] for r in rows if r.get('type')=='turn.completed' and 'usage' in r] or None,
            'terminal':[r for r in rows if r.get('type') in ['turn.failed','error','turn.completed']],
            'latest_message':messages[-1] if messages else None,'commands':commands,
            'unparsed_tail_bytes':len(tail.encode()),'events_sha256':compare.sha(Path(path).read_bytes())}


def trace_usage(thread_id,home=None):
    home=Path(home or os.environ.get('CODEX_HOME',str(Path.home()/'.codex')))
    paths=list((home/'sessions').glob('**/*'+thread_id+'*.jsonl'))
    if len(paths)!=1:return {'thread_id':thread_id,'trace_found':False,'usage':None,'spawn_ids':None}
    path=paths[0]
    records=[]; malformed=0
    for line in path.read_text(encoding='utf-8').splitlines():
        try:records.append(json.loads(line))
        except json.JSONDecodeError:malformed+=1;continue
    total=None;spawns=[];meta=None;turn_settings=[];terminal=None
    for r in records:
        payload=r.get('payload',{})
        if r.get('type')=='session_meta':
            meta={k:payload.get(k) for k in ['id','parent_thread_id','agent_role','agent_path','cwd','cli_version','model_provider','source']}
        if r.get('type')=='turn_context':
            terminal=None
            turn_settings.append({k:payload.get(k) for k in ['model','effort','approval_policy','sandbox_policy']})
        if r.get('type')=='event_msg' and payload.get('type')=='task_started':
            terminal=None
        if r.get('type')=='event_msg' and payload.get('type')=='token_count':
            total=(payload.get('info') or {}).get('total_token_usage',total)
        if r.get('type')=='event_msg' and payload.get('type') in ['task_complete','turn_aborted']:
            terminal={'type':payload.get('type'),'at':r.get('timestamp'),'error':bool(payload.get('error'))}
        if r.get('type')=='response_item' and payload.get('type')=='function_call' and str(payload.get('name','')).endswith('spawn_agent'):
            try:args=json.loads(payload.get('arguments','{}'))
            except json.JSONDecodeError:args={}
            spawns.append({'call_id':payload.get('call_id'),'agent_type':args.get('agent_type'),'task_name':args.get('task_name'),'model':args.get('model'),'effort':args.get('reasoning_effort')})
    return {'thread_id':thread_id,'trace_found':True,'trace_sha256':compare.sha(path.read_bytes()),'metadata':meta,
            'turn_settings':turn_settings,'usage':total,'spawn_calls':spawns,'spawn_ids':None,'terminal':terminal,'malformed_lines':malformed,
            'limitation':'Parent trace only; child identities/usage must be linked before reporting all-agent totals. Encrypted payloads are not copied.'}


def linked_traces(thread_id,home=None):
    home=Path(home or os.environ.get('CODEX_HOME',str(Path.home()/'.codex')))
    parent_paths=list((home/'sessions').glob('**/*'+thread_id+'*.jsonl'))
    if len(parent_paths)!=1:return {'status':'unmeasured','traces':[],'all_agents_total_tokens':None}
    cutoff=parent_paths[0].stat().st_ctime-60
    metadata=[]
    # Only metadata of recent candidate files is inspected. No unrelated turns,
    # messages or config are read or exported.
    for path in (home/'sessions').glob('**/*.jsonl'):
        if path.stat().st_ctime<cutoff:continue
        with path.open(encoding='utf-8') as stream:
            try:row=json.loads(stream.readline())
            except json.JSONDecodeError:continue
        if row.get('type')=='session_meta':metadata.append(row.get('payload',{}))
    selected={thread_id};changed=True
    while changed:
        changed=False
        for meta in metadata:
            id=meta.get('id');source=json.dumps(meta.get('source',{}))
            if id not in selected and any(parent in source or meta.get('parent_thread_id')==parent for parent in selected):
                selected.add(id);changed=True
    traces=[trace_usage(id,home) for id in sorted(selected)]
    # Do not add reasoning/cache to totals: those are provider subcategories.
    all_measured=all(t.get('usage') and isinstance(t['usage'].get('total_tokens'),int) and (t.get('terminal') or {}).get('type')=='task_complete' and not (t.get('terminal') or {}).get('error') and t.get('malformed_lines')==0 for t in traces)
    spawn_attempts=sum(len(t.get('spawn_calls',[])) for t in traces)
    coverage=len(selected)-1==spawn_attempts
    return {'status':'linked trace observations; terminal states still require inspection','thread_id':thread_id,
            'spawn_ids':sorted(selected-{thread_id}),'spawn_attempt_count':spawn_attempts,'traces':traces,
            'coverage_complete':coverage,'all_agents_total_tokens':sum(t['usage']['total_tokens'] for t in traces) if all_measured and coverage else None,
            'limitation':'No token inference; missing child telemetry or unmatched spawn makes total null. Provider counters retained verbatim.'}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('path');p.add_argument('--output');p.add_argument('--trace',action='store_true')
    a=p.parse_args();result=summary(a.path)
    if a.trace and result['thread_id']:result['trace']=linked_traces(result['thread_id'])
    if a.output:compare.dump(a.output,result)
    else:print(json.dumps(result,ensure_ascii=True,indent=2))
