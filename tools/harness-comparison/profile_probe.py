"""Inspect model-visible settings through the exact exec profile, without a model call.

app-server's session flag trust does not enable project layers on this CLI.
Do not equate that read-back with the named-profile exec environment.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tomllib

import compare


def inspect(invocation_path,output):
    inv=json.loads(Path(invocation_path).read_text(encoding='utf-8'))
    original=inv['argv'];root=Path(inv['input']['root']);name=original[original.index('-p')+1]
    profile=Path(os.environ.get('CODEX_HOME',str(Path.home()/'.codex')))/(name+'.config.toml')
    data=('[projects.'+json.dumps(str(root))+']\ntrust_level="trusted"\n').encode()
    if compare.sha(data)!=inv['profile_sha256']:raise ValueError('profile reconstruction mismatch')
    created=not profile.exists()
    if created:compare.write(profile,data)
    elif profile.read_bytes()!=data:raise ValueError('profile changed')
    args=[a for a in original[1:] if a not in ['exec','--json','--no-daemon']]
    if args[-1]=='-':args.pop()
    args+=['debug','prompt-input']
    try:
        p=subprocess.run(['codex']+args,cwd=root,capture_output=True,timeout=60)
        if p.returncode:raise ValueError('profile prompt probe failed; stderr sha256='+compare.sha(p.stderr))
        messages=json.loads(p.stdout)
        texts='\n'.join(c.get('text','') for m in messages for c in m.get('content',[]))
        slots=re.findall(r'There are (\d+) available concurrency slots',texts)
        config=tomllib.loads((root/'.codex/config.toml').read_text(encoding='utf-8'))
        expected=config['agents']['max_concurrent_threads_per_session']+1
        if slots!=[str(expected)]:raise ValueError('project config concurrency not active')
        project_disabled=b'Project config.toml files are disabled' in p.stderr
        if project_disabled:raise ValueError('project config was disabled')
        skill_files=[f for scope in ['.agents/skills','.codex/skills'] for f in (root/scope).glob('*/SKILL.md')]
        visible=[f.parent.name for f in skill_files if str(f).replace('\\','/').casefold() in texts.replace('\\','/').casefold()]
        result={'at':compare.utc(),'method':'codex debug prompt-input with exact runtime profile/overrides; no model request',
                'invocation_sha256':compare.sha(Path(invocation_path).read_bytes()),'profile_sha256':compare.sha(data),
                'project_config_sha256':compare.sha((root/'.codex/config.toml').read_bytes()),
                'observed_concurrency_slots_including_parent':int(slots[0]),'expected_child_limit':expected-1,
                'project_config_active':True,'declared_model':config['model'],'declared_subagent_model':config['agents']['default_subagent_model'],
                'prompt_sha256':compare.sha(p.stdout),'stderr_sha256':compare.sha(p.stderr),
                'project_skill_assets':[f.parent.name for f in skill_files],
                'model_visible_project_skills_by_exact_path':visible,
                'limitation':'Exact-profile resolved prompt and unchanged config hash. Filesystem skill assets and exact paths in the model-visible catalog are separate fields; lazy discovery may not appear here. Actual model/effort/custom role/skill use is separately checked in run trace. Raw prompt is not exported.'}
        compare.dump(output,result)
        return result
    finally:
        if created and profile.exists() and profile.read_bytes()==data:profile.unlink()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--invocation',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();print(json.dumps(inspect(a.invocation,a.output),ensure_ascii=True))
