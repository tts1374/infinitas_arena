"""Prepare product-quality evidence without lane names or cost telemetry."""
import argparse
import json
from pathlib import Path
import random
import shutil

import compare
import redact


def scoped_log(root,experiment,value):
    if not isinstance(value,str):return None
    candidate=(Path(root)/value).resolve()
    if not any(candidate.is_relative_to(Path(base).resolve()) for base in [root,experiment]):return None
    return candidate if candidate.is_file() else None


def exit_code(row):
    return row.get('exit_code', row.get('exit'))


def prepare(first,second,directory):
    directory=Path(directory).resolve()
    if directory.exists():raise ValueError('preserve prior blind packet')
    directory.mkdir(parents=True)
    paths=[Path(first),Path(second)];random.Random(compare.SEED+101).shuffle(paths)
    key={}
    for alias,archive in zip(['A','B'],paths):
        data=json.loads((archive/'evidence.json').read_text(encoding='utf-8'))
        invocation=json.loads((Path(data['raw_capture']).parent/'invocation.json').read_text(encoding='utf-8'))
        root=Path(invocation['input']['root']);claim=data['executor_claim'] or {}
        key[alias]={'archive':str(archive),'experiment':data['experiment'],'run_id':data['run_id'],'lane':data['lane'],'evidence_sha256':compare.sha((archive/'evidence.json').read_bytes())}
        def neutral(value):
            if isinstance(value,dict):return {k:neutral(v) for k,v in value.items()}
            if isinstance(value,list):return [neutral(v) for v in value]
            if isinstance(value,str):
                for form in [str(root),str(root).replace('\\','/'),str(root).replace('\\','\\\\')]:value=value.replace(form,'<trial>')
                return value
            return value
        target=directory/alias
        compare.write(target/'tracked.patch',(archive/'tracked.patch').read_bytes())
        compare.dump(target/'untracked-files.json',{k:v for k,v in data['untracked_files'].items() if not k.startswith('tasks/')})
        compare.dump(target/'claims.json',neutral({'status':claim.get('status'),'AC':claim.get('AC',claim.get('acceptance')),'Q':claim.get('Q',claim.get('quality')),'remaining_risks':claim.get('remaining_risks')}))
        commands=claim.get('commands',[])
        if isinstance(commands,dict):commands=[row for group in commands.values() for row in group]
        checks=[]
        for row in commands:
            argv=row.get('argv',row.get('command',[]))
            if 'harness' in str(argv).lower():continue  # framework gates are unblinded separately
            name='check-'+str(len(checks)+1)
            log=row.get('log');path=scoped_log(root,Path(data['raw_capture']).parents[2],log)
            if path and path.is_file():compare.write(target/'logs'/(name+'.log'),redact.exported(neutral(path.read_text(encoding='utf-8'))))
            checks.append({'id':name,'argv':neutral(argv),'cwd':neutral(row.get('cwd')),'exit_code':exit_code(row),'log':('logs/'+name+'.log') if path and path.is_file() else None})
        compare.dump(target/'checks.json',checks)
        visual=root/'.tmp/evidence/visual'
        if visual.exists():
            for p in visual.glob('*.png'):compare.write(target/'visual'/p.name,p.read_bytes())
            compare.dump(target/'visual/visual.json',neutral(json.loads((visual/'visual.json').read_text(encoding='utf-8'))))
        changed=[name for name in data['after']['files'] if (root/name).is_file() and not name.startswith('tasks/')]
        for name in changed:
            path=root/name
            if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):raise ValueError('product source escapes trial')
            content=path.read_bytes()
            if compare.sha(content)!=data['after']['files'][name]:raise ValueError('archived product changed before blind preparation')
            compare.write(target/'source'/name,content)
        if data['case']=='C1' and not (directory/'reference').exists():shutil.copytree(root/'.tmp/comparison/reference',directory/'reference')
        if not (directory/'input.json').exists():compare.write(directory/'input.json',(root/'.tmp/comparison/input.json').read_bytes())
        if data['case']=='C2' and not (directory/'c2-barrier.test.mjs').exists():compare.write(directory/'c2-barrier.test.mjs',(root/'.tmp/comparison/c2-barrier.test.mjs').read_bytes())
    compare.dump(directory.parent/(directory.name+'-key.json'),key)
    return {'packet':str(directory),'aliases':list(key),'costs_in_packet':False}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--first',required=True);p.add_argument('--second',required=True);p.add_argument('--directory',required=True)
    a=p.parse_args();print(json.dumps(prepare(a.first,a.second,a.directory)))
