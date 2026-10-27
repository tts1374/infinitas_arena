"""Issue 198: pinned, fresh Codex trials. No publishing or product integration.

Preparation is separate from execution. All evidence is append-only; missing
provider telemetry stays null. No credentials are read or copied by this tool.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tarfile
import threading
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
PRODUCT = '4b600d3445edc71d0599058809c9a89b04591760'
HARNESS = '59b0815dc95738c3e7a14d5505fb58d3df49c460'
RUNTIME = '648761b91359a54556c1fe1e655aaa5408cf5910a752861340b3eabb77157ef2'
SEED = 19820261026
MCP_DISABLED = 'mcp_servers={github={url="https://example.invalid/github",enabled=false},cloudflareObservability={url="https://example.invalid/cloudflare",enabled=false},node_repl={command="disabled",enabled=false},playwright={command="disabled",enabled=false}}'
FLOOR = [['npm', 'run', x] for x in ['lint', 'typecheck', 'test:client-stats', 'test:worker']]
CLIENT = [['npm', 'run', 'build:client'], ['npm', '--workspace', '@infinitas/client', 'run', 'test']]
WORKER = [['npm', 'run', 'check:design-contracts'], ['npx', '--no-install', 'wrangler', 'deploy', '--dry-run']]


def utc():
    return datetime.now(timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8', newline='\n') as out:
        json.dump(obj, out, ensure_ascii=False, indent=2)
        out.write('\n')


def write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as out:
        out.write(data.encode('utf-8') if isinstance(data, str) else data)


def git(root, *args):
    return subprocess.check_output(['git', '--no-optional-locks', '-C', str(root), *args], stderr=subprocess.PIPE)


def tool(source):
    sys.path.insert(0, str(Path(source) / 'tools/harness-v2'))
    import harness
    return harness


def pinned(source):
    source = Path(source).resolve()
    h = tool(source)
    if git(source, 'rev-parse', 'HEAD').decode().strip() != HARNESS or h.snapshot(source)['files']:
        raise ValueError('v2 source must be a clean checkout of the frozen full revision')
    if git(source, 'rev-parse', PRODUCT + '^{commit}').decode().strip() != PRODUCT:
        raise ValueError('product object mismatch')
    runtime = sha(b''.join(p.relative_to(h.HERE).as_posix().encode() + p.read_bytes()
                          for p in sorted((h.HERE / 'runtime').rglob('*')) if p.is_file()))
    if runtime != RUNTIME:
        raise ValueError('runtime byte hash mismatch; do not normalize frozen assets')
    return h


def checkpoint(root, message):
    git(root, 'add', '.')
    git(root, '-c', 'user.name=Comparison fixture', '-c', 'user.email=fixture@example.invalid',
        'commit', '--allow-empty', '-m', message)
    if git(root, 'status', '--porcelain').strip():
        raise ValueError('trial is not clean')
    return git(root, 'rev-parse', 'HEAD').decode().strip()


def legacy_export(source, dest):
    dest = Path(dest)
    if dest.exists():
        raise ValueError('never overwrite an existing trial')
    dest.mkdir(parents=True)
    raw = git(source, 'archive', '--format=tar', PRODUCT)
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for member in archive:
            target = dest / member.name
            if not target.resolve().is_relative_to(dest.resolve()):
                raise ValueError('escaping archive member')
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                write(target, archive.extractfile(member).read())
            else:
                raise ValueError('only regular product files allowed')
    subprocess.run(['git', 'init', '-b', 'codex/legacy-trial', str(dest)], check=True, capture_output=True)
    git(dest, 'config', 'core.autocrlf', 'false')
    checkpoint(dest, 'Exact legacy product and harness base')


def seed(root, case):
    if case == 'C1':
        rel = 'apps/client/src/components/SongSearchModalView.tsx'
        p = root / rel
        before = p.read_bytes()
        # The null branch is unique; numeric formatting is intentionally untouched.
        if before.count(b'"--:--"') != 1:
            raise ValueError('C1 null branch is no longer unique')
        p.write_bytes(before.replace(b'"--:--"', b'"00:00"', 1))
    elif case == 'C2':
        p = root / 'apps/worker/src/durable/lobby-directory-object.ts'
        before = p.read_text(encoding='utf-8')
        needle = 'Math.max(now, this.lastIssuedUpdatedAt + 1)'
        start = before.index('  } else if (isRecord(input)) {', before.index('function restoreLastIssuedUpdatedAt'))
        end = before.index('\n  }\n\n  for (const room', start)
        if before.count(needle) != 1:
            raise ValueError('C2 monotonic expression is no longer unique')
        after = before[:start] + before[end:]
        p.write_text(after.replace(needle, 'Math.max(now, this.lastIssuedUpdatedAt)', 1), encoding='utf-8', newline='\n')
    elif case == 'C3':
        if b'quick_chat_available' in git(root, 'grep', '-l', 'RoomStateSnapshot', '--', 'packages/shared/src'):
            raise ValueError('unexpected existing field')
        for p in (root / 'packages/shared/src').rglob('*.ts'):
            if 'quick_chat_available' in p.read_text(encoding='utf-8'):
                raise ValueError('C3 field already present')
    return git(root, 'diff', '--binary')


def product_hashes(root):
    # Active governance and the documented design-check adapter are lane differences.
    entries = {}
    for prefix in ['apps', 'packages', 'testdata', '.github']:
        for p in sorted((root / prefix).rglob('*')):
            if (p.is_file() and p.name not in ['AGENTS.md', 'AGENTS.override.md']
                    and not any(x in p.parts for x in ['node_modules', 'target', 'dist', '.wrangler'])):
                entries[p.relative_to(root).as_posix()] = sha(p.read_bytes())
    for rel in ['package.json', 'package-lock.json', 'tsconfig.json']:
        entries[rel] = sha((root / rel).read_bytes())
    return entries


def case_inputs(source):
    plan = (source / 'docs/harness-v2/comparison-plan.md').read_text(encoding='utf-8')
    result = {}
    scopes = {
        'C1': ['apps/client/src/components/SongSearchModalView.tsx', 'apps/client/src/features/room'],
        'C2': ['apps/worker/src/durable/lobby-directory-object.ts', 'apps/worker/src/routes/lobby.ts', 'apps/worker/src/durable', 'apps/worker/src/routes'],
        'C3': ['packages/shared/src', 'apps/worker/src/durable', 'apps/client/src', 'docs/design'],
    }
    for case in ['C1', 'C2', 'C3']:
        start = plan.index('## ' + case + ':')
        end = plan.index('\n## ', start + 4)
        section = plan[start:end]
        result[case] = {
            'case_id': case, 'specification': section,
            'scope_note': 'Only the exact component/producer/consumer and directly required tests described in specification; directory grants do not authorize unrelated changes.',
            'allowed_paths': scopes[case],
            'commands': FLOOR + (CLIENT if case != 'C2' else []) + (WORKER if case != 'C1' else []),
            'quality': [f'Q{i:02}' for i in (range(1, 17) if case == 'C3' else ([5, 6, 12, 13, 14, 15, 16] if case == 'C2' else [11, 12, 13, 14, 15, 16]))],
            'fixture': {
                'C1': {'seconds': [None, 0, 65], 'expected': ['--:--', '00:00', '01:05'], 'widths': [320, 1024], 'roles': ['host', 'non-host'], 'baseline_gap': 'Fixed baseline numbers render 0:00/1:05. Preserve actual reference; repaired runs must meet the pre-existing plan AC 00:00/01:05.'},
                'C2': {'clock': [1000, 1000, 2000], 'legacy_max': 2500, 'barrier_results': ['eligible=false', '404 ROOM_STATE_LOST'], 'reorder': True, 'fail_open': ['5xx', 'network'], 'persistence': ['legacy map', 'scalar', 'real local runtime restart'], 'growth': 'no per-room tombstones after delete/TTL'},
                'C3': {'values': ['missing', True, False, None, 'invalid', 0, 1], 'matrix': ['old-worker/new-client', 'new-worker/old-client', 'new/new/true', 'false fixture', 'legacy-save/new-reader', 'new-save/old-reader'], 'authority': ['spectator', 'join_code redaction', 'state rejection'], 'native_e2e': 'real watcher/parser->client->local Worker; direct WS is insufficient'},
            }[case],
        }
    return result


COMMON = '''あなたは新しい独立Codex比較executorです。root AGENTS.mdと.tmp/comparison/input.jsonを読み、そこに固定されたGoal/AC/禁止事項に従い、実装・検証・必要な独立監査まで行ってください。
独立したこのrepo内の合成変更だけを許可します。既存ハーネスの作業規則に従い、必要artifactはtasksまたは.tmpへ保存可能です。製品scopeは仕様記載の最小限。依存/lockfile/CI/製品規約/許可/比較条件は変更禁止。
commit/push/PR/merge/Issue write/deploy/release/cleanup、秘密の収集、他のrepo/runtime/processへの操作は禁止。wrangler deploy --dry-runのみ検証用bundleとして許可します。ローカルサーバは127.0.0.1の割当portで、自分が起動したprocessだけを使い停止してください。既存run-local-e2e.ps1は既存listener再利用と可視窓があるためそのまま起動禁止です。
実際に必要なSubagentは起動し、IDと担当を保存。C2/C3は実装非担当の契約/挙動レビュー必須。shared writerは明示一人、同scope writer競合なし。子のmodelはgpt-6.1-sol、effortはハーネスのrole既定を使用し記録。
共通検証コマンドはinput.json、追加testは標準membership/型面を確認し必要なものを明示実行。全試行のcommand/exit/logを.tmp/evidenceへ保存。browser helperは.tmp/comparison/browser_fixture.mjsで、node helper --root . --output .tmp/evidence/visual （--prepare-only は設置のみ）。基点referenceは.tmp/comparison/reference。未実施のnative/source/DO restartやbrowserをPASSにしないこと。
wall上限120分。完成時または環境/品質のblocking時には.tmp/evidence/executor.jsonへAC/Qごとのpass/fail/unprovenと証拠、独立review/finding disposition、実spawn、再試行、残リスクを保存し、日本語でCOMPLETE/BLOCKED/ESCALATIONを返す。実証不能のACはunprovenとし、完全合格を偽装しないでください。
'''


def run_command(argv, cwd, log, timeout=600):
    command = list(argv)
    if os.name == 'nt' and command[0] in ['npm', 'npx']:
        command[0] += '.cmd'
    tick, start = time.monotonic(), utc()
    try:
        p = subprocess.run(command, cwd=cwd, capture_output=True, timeout=timeout,
                           env={**os.environ, 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8', 'WRANGLER_SEND_METRICS': 'false'})
        code, data = p.returncode, p.stdout + p.stderr
    except subprocess.TimeoutExpired as e:
        code, data = 124, (e.stdout or b'') + (e.stderr or b'')
    write(log, data)
    return {'argv': argv, 'cwd': str(cwd), 'start': start, 'end': utc(), 'wall_seconds': time.monotonic()-tick, 'exit_code': code, 'log': str(log)}


def prepare(source, directory):
    source, directory = Path(source).resolve(), Path(directory).resolve()
    h = pinned(source)
    if directory.exists():
        raise ValueError('choose a new experiment directory, preserve prior evidence')
    directory.mkdir(parents=True)
    dump(directory / 'protected-before.json', protected(h))
    inputs = case_inputs(source)
    for key, value in inputs.items():
        dump(directory / 'inputs' / (key + '.json'), value)
    write(directory / 'inputs/prompt.txt', COMMON)
    write(directory / 'inputs/requirements.md', (source / 'docs/harness-v2/requirements.md').read_bytes())
    order = []
    rng = random.Random(SEED)
    for repeat in [1, 2, 3]:
        for case in inputs:
            lanes = ['legacy', 'v2']
            if rng.randrange(2):
                lanes.reverse()
            order += [{'case': case, 'lane': lane, 'repeat': repeat, 'run_id': f'{case}-{lane}-{repeat}'} for lane in lanes]
    dump(directory / 'schedule.json', {'seed': SEED, 'runs': order})
    # Stage 1 prepares both lanes, every case. Later repeats use fresh exports.
    prepared = []
    for row in order[:6]:
        prepared.append(prepare_trial(source, directory, row, h, inputs[row['case']]))
    manifest = {
        'revision': 'I198-conditions-1', 'frozen_at': utc(), 'product_base': PRODUCT,
        'harness_revision': HARNESS, 'runtime_sha256': RUNTIME, 'seed': SEED,
        'model': 'gpt-6.1-sol', 'parent_effort': 'high', 'service_tier': 'provider default; no fast/ultrafast override',
        'child_effort': {'legacy_implementer': 'medium', 'legacy_auditor': 'high', 'v2_parent_implementer': 'high', 'v2_reviewer': 'high'},
        'confound': 'Direct parent high vs legacy implementer medium is retained and must not be attributed solely to harness; adoption requires matched-responsibility follow-up if relevant.',
        'max_wall_seconds': 7200, 'max_environment_retries_per_case_lane': 1,
        'inputs': {str(p.relative_to(directory)): sha(p.read_bytes()) for p in sorted((directory/'inputs').rglob('*')) if p.is_file()},
        'prepared': prepared, 'measurement': {'usage': 'provider values only, parent JSONL and linked child trace if obtainable', 'missing': None, 'active_time': None, 'retries': 'append-only new attempt directory, never overwrite'},
        'probes': 'P1-P8 fixture and model sessions must be frozen before C1-C3 launch',
        'quality_gate': 'all AC/applicable Q/required validation/independent review; no unresolved Blocker/Must fix or authority/scope violation',
        'stage3_gate': 'stage2 intermediate saved and independently evaluated; no major quality or safety failure',
    }
    for case in inputs:
        pair = [x for x in prepared if x['case'] == case]
        if pair[0]['product_hashes'] != pair[1]['product_hashes'] or pair[0]['seed_sha256'] != pair[1]['seed_sha256']:
            raise ValueError('lane product or seed mismatch before execution')
    dump(directory / 'manifest.json', manifest)
    return manifest


def protected(h):
    paths = [Path('C:/work/infinitas_arena/infinitas_arena'),
             Path('C:/Users/tts13/.codex/worktrees/issue-188-design-plan/infinitas_arena'),
             Path('C:/Users/tts13/.codex/worktrees/issue-188-phase-c-host-led/infinitas_arena')]
    return {str(p): h.snapshot(p) for p in paths if p.exists()}


def prepare_trial(source, directory, row, h, data):
    root = directory / 'trials' / row['run_id']
    if row['lane'] == 'v2':
        h.install(source, root, PRODUCT, HARNESS)
    else:
        legacy_export(source, root)
    git(root, 'config', 'core.autocrlf', 'false')
    patch = seed(root, row['case'])
    write(directory / 'seeds' / (row['run_id'] + '.patch'), patch)
    head = checkpoint(root, 'Frozen comparison seed ' + row['case'])
    dump(root / '.tmp/comparison/input.json', data)
    write(root / '.tmp/comparison/input.md', data['specification'])
    write(root / '.tmp/comparison/requirements.md', (source / 'docs/harness-v2/requirements.md').read_bytes())
    for p in ROOT.joinpath('tools/harness-comparison').glob('*'):
        if p.name in ['browser_fixture.mjs', 'visual-fixture.tsx', 'visual-fixture.css']:
            write(root / '.tmp/comparison' / p.name, p.read_bytes())
    if row['lane'] == 'v2':
        g = h.read_json(source / 'tools/harness-v2/goal.example.json')
        g.update(request_id=row['run_id'], base_revision=head, objective=data['specification'],
                 acceptance=[{'id': row['case'] + '-AC', 'text': '全specification/fixture/validation条件を証明する（.tmp/comparison/input.json）'}],
                 allowed_paths=data['allowed_paths']+['tasks'], forbidden_paths=['.github', 'package-lock.json'],
                 artifact_paths=['tasks'], target=row['run_id'], semantics={'C1':['ui'], 'C2':['lobby','restore'], 'C3':['shared','storage','authority','ui']}[row['case']],
                 owners=[{'owner':'parent','paths':data['allowed_paths']+['tasks'],'status':'active'}],
                 grants=[{'operation':'edit','target':p,'source':'user','request_id':row['run_id'],'evidence':'authorized isolated comparison only'} for p in data['allowed_paths']+['tasks']],
                 references=[{'path':'.tmp/comparison/input.json','revision':'sha256:'+sha((root/'.tmp/comparison/input.json').read_bytes())}])
        dump(root/'.tmp/goal.json', g)
    dump(directory/'trial-records'/(row['run_id']+'.json'), {**row, 'root':str(root),'head':head,'input_sha256':sha((root/'.tmp/comparison/input.json').read_bytes()), 'seed_sha256':sha(patch)})
    return {**row, 'root':str(root), 'head':head, 'product_hashes':product_hashes(root), 'seed_sha256':sha(patch), 'input_sha256':sha((root/'.tmp/comparison/input.json').read_bytes())}


def launch(directory, run_id, attempt=0):
    directory = Path(directory).resolve()
    if (directory/'experiment-hold.json').exists():
        raise ValueError('experiment held after major findings; preserve this evidence and freeze symmetric new conditions before more model sessions')
    ready = json.loads((directory/'ready.json').read_text(encoding='utf-8'))
    manifest_path=directory/ready.get('manifest_file','manifest.json')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if ready.get('status') != 'READY' or ready.get('manifest_sha256') != sha(manifest_path.read_bytes()):
        raise ValueError('stage1 is not frozen/ready')
    import verify_frozen
    frozen_check=verify_frozen.check(directory,run_id)
    row = json.loads((directory/'trial-records'/(run_id+'.json')).read_text(encoding='utf-8'))
    root = Path(row['root'])
    if git(root, 'status', '--porcelain').strip() or git(root, 'rev-parse','HEAD').decode().strip()!=row['head']:
        raise ValueError('each run requires its own clean start')
    if attempt != 0:
        raise ValueError('retry requires a separately frozen fresh environment and case/lane retry ledger; this launcher never reuses a trial')
    out = directory/'runs'/f'{run_id}-attempt{attempt}'
    out.mkdir(parents=True, exist_ok=False)
    profile_name = 'i198-' + directory.name + '-' + run_id + '-' + str(attempt)
    profile_dir = Path(os.environ.get('CODEX_HOME',str(Path.home()/'.codex')))
    profile_path = profile_dir/(profile_name+'.config.toml')
    profile_data = ('[projects.'+json.dumps(str(root))+']\ntrust_level="trusted"\n').encode('utf-8')
    write(profile_path, profile_data)
    argv = ['codex','--no-daemon','-a','never','-p',profile_name,'exec','--json','-m','gpt-6.1-sol',
            '-c','model_reasoning_effort="high"','-c','windows.sandbox="elevated"',
            '-c','features.apps=false','-c','features.plugins=false',
            '-c',MCP_DISABLED,
            '-c','features.unbounded_connection_retries=false','-s',manifest.get('sandbox','workspace-write'),'-C',str(root),'-']
    if manifest.get('toolchain'):
        shell_env={'PATH':str(root/'.tmp/toolchain')+';'+os.environ.get('PATH',''),'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8','WRANGLER_SEND_METRICS':'false'}
        table='{'+','.join(k+'='+json.dumps(v) for k,v in shell_env.items())+'}'
        argv[argv.index('-C'):argv.index('-C')]=['-c','shell_environment_policy.set='+table]
    dump(out/'invocation.json', {'argv':argv,'profile_sha256':sha(profile_data),'input':row,'prompt_sha256':sha(row.get('prompt',COMMON).encode()),'manifest_sha256':sha(manifest_path.read_bytes()),'at':utc()})
    import profile_probe
    profile_probe.inspect(out/'invocation.json',out/'profile-readback.json')
    h = tool(ROOT)
    before = h.snapshot(root)
    dump(out/'before.json',before)
    dump(out/'input-check.json',frozen_check)
    start, tick = utc(), time.monotonic()
    timed_out = False
    try:
        p = subprocess.Popen(argv, cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             env={**os.environ,'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8','WRANGLER_SEND_METRICS':'false'})
        dump(out/'process.json', {'pid':p.pid,'argv':argv,'started_at':start,'root':str(root)})
        def drain(stream, target):
            with target.open('x', encoding='utf-8', newline='\n') as log:
                for line in iter(stream.readline,b''):
                    log.write(h.redact(line.decode('utf-8',errors='replace')).rstrip('\r\n')+'\n')
                    log.flush()
        threads = [threading.Thread(target=drain,args=(p.stdout,out/'events.jsonl')),threading.Thread(target=drain,args=(p.stderr,out/'stderr.log'))]
        for t in threads: t.start()
        p.stdin.write(row.get('prompt',COMMON).encode('utf-8')); p.stdin.close()
        try:
            code = p.wait(timeout=manifest['max_wall_seconds'])
        except subprocess.TimeoutExpired:
            timed_out=True
            # Only the still-running process created above and its own descendants.
            if p.poll() is None:
                subprocess.run(['taskkill','/PID',str(p.pid),'/T','/F'],capture_output=True,check=False)
            code=p.wait(timeout=30)
        for t in threads: t.join(timeout=30)
    finally:
        if profile_path.exists() and profile_path.read_bytes()==profile_data:
            profile_path.unlink()
    result = {'run_id':run_id,'attempt':attempt,'case_id':row.get('case'),'lane':row['lane'],
              'product_base':PRODUCT,'harness_commit':HARNESS if row['lane']=='v2' else PRODUCT,
              'input_hash':row['input_sha256'],'model':'gpt-6.1-sol','effort':'high','started_at':start,'ended_at':utc(),
              'wall_seconds':time.monotonic()-tick,'exit_code':code,'timeout':timed_out,'before':before,'after':h.snapshot(root),
              'all_agents_total_tokens':None,'active_seconds':None,'spawn_ids':None,
              'review':None,'verdict':'unproven; independent evaluation pending'}
    events = out/'events.jsonl'
    write(out/'final.patch',git(root,'diff','--binary',row['head']))
    # Persist the checkpoint before optional telemetry parsing can fail.
    dump(out/'checkpoint.json',result)
    import collect
    result['usage'] = collect.summary(events)['usage'] if events.exists() else None
    dump(out/'result.json', result)
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='action',required=True)
    p=sub.add_parser('prepare');p.add_argument('--source',required=True);p.add_argument('--directory',required=True)
    p=sub.add_parser('run');p.add_argument('--directory',required=True);p.add_argument('--run-id',required=True);p.add_argument('--attempt',type=int,default=0)
    p=sub.add_parser('deps');p.add_argument('--directory',required=True)
    a=parser.parse_args()
    if a.action=='prepare':
        result=prepare(a.source,a.directory)
        print(json.dumps({k:v for k,v in result.items() if k!='prepared'},ensure_ascii=True,indent=2))
    elif a.action=='run':
        print(json.dumps(launch(a.directory,a.run_id,a.attempt),ensure_ascii=True,indent=2))
    else:
        directory=Path(a.directory)
        records=list((directory/'trial-records').glob('*.json'))
        def install(path):
            row=json.loads(path.read_text(encoding='utf-8'))
            return run_command(['npm','ci','--no-audit','--no-fund'],row['root'],directory/'setup'/(row['run_id']+'-npm-ci.log'))
        with ThreadPoolExecutor(max_workers=2) as pool:
            rows=list(pool.map(install,records))
        dump(directory/'setup/dependencies.json',rows)
        print(json.dumps(rows,ensure_ascii=True,indent=2))


if __name__=='__main__':
    main()
