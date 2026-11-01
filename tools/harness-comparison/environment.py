"""Read back actual invocation settings without saving raw config or auth."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import tomllib

import compare
import probes

OVERRIDES = ['model="gpt-6.1-sol"','model_reasoning_effort="high"','windows.sandbox="elevated"','sandbox_mode="workspace-write"','approval_policy="never"',
             'features.apps=false','features.plugins=false', compare.MCP_DISABLED,
             'features.unbounded_connection_retries=false']


def inspect(root,sandbox='workspace-write',toolchain=False):
    root=Path(root).resolve()
    name='i198-readback-'+root.name
    profile=Path(os.environ.get('CODEX_HOME',str(Path.home()/'.codex')))/(name+'.config.toml')
    data=('[projects.'+json.dumps(str(root))+']\ntrust_level="trusted"\n').encode()
    compare.write(profile,data)
    # app-server rejects --profile and session-flag trust does not activate the
    # project layer here. This is a preliminary user/tool/skill read-back only.
    # profile_probe.py verifies the exact named-profile model invocation.
    argv=['codex','app-server','-c','projects.'+json.dumps(str(root))+'.trust_level="trusted"']
    for setting in OVERRIDES:
        if setting.startswith('sandbox_mode='):setting='sandbox_mode='+json.dumps(sandbox)
        argv += ['-c',setting]
    if toolchain:
        shell_env={'PATH':str(root/'.tmp/toolchain')+';'+os.environ.get('PATH',''),'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8','WRANGLER_SEND_METRICS':'false'}
        argv+=['-c','shell_environment_policy.set={'+','.join(k+'='+json.dumps(v) for k,v in shell_env.items())+'}']
    p=subprocess.Popen(argv,cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                       text=True,encoding='utf-8',env={**os.environ,'PYTHONUTF8':'1'})
    messages=queue.Queue()
    error_hashes=[]
    error_messages=[]
    def read():
        for line in p.stdout:
            try: messages.put(json.loads(line))
            except json.JSONDecodeError: messages.put({'error':'invalid protocol JSON'})
        messages.put({'error':'app-server closed'})
    def errors():
        h=compare.tool(compare.ROOT)
        for line in p.stderr:
            error_hashes.append(compare.sha(line.encode()))
            error_messages.append(h.redact(line))
    threading.Thread(target=read,daemon=True).start()
    threading.Thread(target=errors,daemon=True).start()
    def call(id,method,params):
        p.stdin.write(json.dumps({'id':id,'method':method,'params':params})+'\n');p.stdin.flush()
        while True:
            row=messages.get(timeout=60)
            if row.get('id')==id:
                if 'error' in row: raise ValueError('app-server method failed: '+method)
                return row['result']
            if 'error' in row: raise ValueError(row['error']+' '+''.join(error_messages)[:1500])
    try:
        init=call(1,'initialize',{'clientInfo':{'name':'issue198-readback','version':'1'},'capabilities':{'experimentalApi':True}})
        p.stdin.write('{"method":"initialized","params":{}}\n');p.stdin.flush()
        config=call(2,'config/read',{'cwd':str(root),'includeLayers':True})
        skills=call(3,'skills/list',{'cwds':[str(root)],'forceReload':True})
        c=config['config']
        safe={k:c.get(k) for k in ['model','model_reasoning_effort','service_tier','approval_policy','sandbox_mode','agents']}
        safe['mcp_servers']={k:{'enabled':v.get('enabled')} for k,v in c.get('mcp_servers',{}).items()}
        safe['features']={k:c.get('features',{}).get(k) for k in ['apps','plugins','multi_agent','unbounded_connection_retries']}
        safe['shell_environment_set']={k:c.get('shell_environment_policy',{}).get('set',{}).get(k) for k in ['PATH','PYTHONUTF8','PYTHONIOENCODING','WRANGLER_SEND_METRICS']}
        catalog=[];errors=[]
        for group in skills.get('data',[]):
            for s in group.get('skills',[]):
                catalog.append({k:s.get(k) for k in ['name','path','enabled','scope']})
            errors += [{'path':e.get('path'),'message_sha256':compare.sha(e.get('message','').encode())} for e in group.get('errors',[])]
        agents=[]
        for f in sorted((root/'.codex/agents').glob('*.toml')):
            a=tomllib.loads(f.read_text(encoding='utf-8'))
            agents.append({'name':a['name'],'effort':a.get('model_reasoning_effort'),'model':a.get('model','inherited gpt-6.1-sol'),'sha256':compare.sha(f.read_bytes())})
        if safe['model']!='gpt-6.1-sol' or safe['model_reasoning_effort']!='high':
            raise ValueError('effective parent model/effort mismatch')
        if any(v.get('enabled') is not False for v in safe['mcp_servers'].values()):
            raise ValueError('external MCP remains enabled')
        active=not any(x.get('disabledReason') for x in config.get('layers') or [] if x.get('name',{}).get('type')=='project')
        return {'at':compare.utc(),'root':str(root),'client':init.get('userAgent'),'effective':safe,'project_config_active_in_this_probe':active,
                'skills':catalog,'skill_errors':errors,'agent_assets':agents,'stderr_line_hashes':error_hashes,
                'layers':[{'name':x.get('name'),'disabledReason':x.get('disabledReason')} for x in config.get('layers') or []],
                'limitation':'app-server does not accept --profile; its session-flag trust does not activate project config on this CLI. Do not treat null agents as actual exec settings. Exact-profile prompt probe and real model trace are required separately.'}
    finally:
        p.terminate()
        try:p.wait(timeout=5)
        except subprocess.TimeoutExpired:p.kill();p.wait(timeout=5)
        if profile.exists() and profile.read_bytes()==data:profile.unlink()


def prepare(directory,source):
    directory=Path(directory).resolve(); source=Path(source).resolve()
    h=compare.pinned(source)
    probe=probes.prepare(source,directory,h,compare.legacy_export)
    compare.dump(directory/'setup/probe-environment.json',probe)
    commands=[['codex','--version'],['node','--version'],['npm','--version'],['python','--version'],['cargo','--version'],['rustc','--version']]
    versions=[compare.run_command(cmd,compare.ROOT,directory/'setup'/('version-'+cmd[0]+'.log'),60) for cmd in commands]
    compare.dump(directory/'setup/versions.json',versions)
    roots=[Path(json.loads(p.read_text(encoding='utf-8'))['root']) for p in sorted((directory/'trial-records').glob('*.json'))]
    def read(root):
        data=inspect(root)
        compare.dump(directory/'setup'/('effective-'+root.name+'.json'),data)
        return {'root':str(root),'model':data['effective']['model'],'effort':data['effective']['model_reasoning_effort'],'agents':[a['name'] for a in data['agent_assets']],'project_skills':[s for s in data['skills'] if str(root).lower().replace('\\','/') in str(s['path']).lower().replace('\\','/')]}
    with ThreadPoolExecutor(max_workers=2) as pool:rows=list(pool.map(read,roots))
    compare.dump(directory/'setup/readback-summary.json',rows)
    return rows


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',required=True);p.add_argument('--source',required=True)
    a=p.parse_args();print(json.dumps(prepare(a.directory,a.source),ensure_ascii=True,indent=2))
