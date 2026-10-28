"""Two-case screening, not a restart of #198 or an adoption decision.

Attempts are consumed before launch and never refunded. No raw process output is
persisted or returned. Runtime tool-output prevention is in safety.py, not here.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time

import harness
import safety

REQUEST = 'issue203-v21-screening'
CASES = ('client', 'worker')
MAX_SECONDS = 1200
PROMPT = '''あなたはHarness v2.1を初めて読むfresh executorです。root AGENTS.mdと.tmp/goal.jsonを読み、この隔離repoの合成seedを修正してください。固定ACと品質条件を変更しないでください。
実行test/buildはpython -B tools/harness-v21/safety.py <固定ID>のみ。raw stdout/stderr、runtime log、環境dump、秘密設定を読み書き・表示しない。通常のsource readとscope内の編集は許可。失敗時raw取得せずBLOCKEDで停止。
外部操作・他repo・任意server起動・依存/lockfile/test/規約変更は禁止。必要な独立reviewはproject independent-reviewerを実際にspawnし、その子にも安全境界を継承。親は直接実装。子を理由なく増やさない。
終了時.tmp/result.jsonにstatus(COMPLETE/BLOCKED/ESCALATION)、ACごとのstatus/evidence、Qの検証、実spawn ID、手戻り、未実証、Requirement Status(○/部分的/×)、Ambiguities/Judgment Calls/Retriesを保存。最終文にCOMPLETEまたはBLOCKEDを明記。品質不成立はCOMPLETEにしない。
'''


def write_new(path, row):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(row, stream, ensure_ascii=False, indent=2); stream.write('\n')


def ledger_root():
    # Deliberately independent of output directory and caller-supplied manifest.
    return Path(os.environ.get('CODEX_HOME', str(Path.home() / '.codex'))) / 'harness-v21-ledgers' / REQUEST


def reserve(case, manifest, receipt, audits, ledger=None):
    if case not in CASES or manifest.get('request') != REQUEST or manifest.get('cases') != list(CASES):
        raise ValueError('invalid fixed case boundary')
    if manifest.get('max_sessions') != 2 or manifest.get('retries') != 0 or manifest.get('max_seconds') != MAX_SECONDS:
        raise ValueError('invalid fixed limit')
    if manifest.get('source_hashes') != harness.hashes() or receipt.get('source_hashes') != manifest['source_hashes']:
        raise ValueError('stale source or validation')
    if receipt.get('status') != 'COMPLETE' or audits.get('status') != 'COMPLETE' or audits.get('source_hashes') != manifest['source_hashes']:
        raise ValueError('quality precondition not met')
    if not {'contract', 'behavior'} <= set(audits.get('coverage', [])) or len(set(audits.get('reviewer_ids', []))) < 2:
        raise ValueError('independent reviews missing')
    ledger = Path(ledger or ledger_root()); ledger.mkdir(parents=True, exist_ok=True)
    if (ledger / 'hold.json').exists():
        raise ValueError('screening held')
    if case == 'worker':
        previous = ledger / 'client-result.json'
        if not previous.exists() or json.loads(previous.read_text(encoding='utf-8')).get('status') != 'COMPLETE':
            raise ValueError('client did not pass')
    write_new(ledger / (case + '-attempt.json'), {'case': case, 'consumed': True,
              'manifest_sha256': hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest(), 'started': time.time()})
    return ledger


def case_goal(root, case):
    old = harness.frozen()
    path = 'apps/client/src/harness-screen.ts' if case == 'client' else 'tools/harness-v21/fixtures/lobby-directory.ts'
    g = old.read_json(root / 'tools/harness-v2/goal.example.json')
    g.update(request_id=REQUEST + '-' + case, base_revision=old.git(root, 'rev-parse', 'HEAD').decode().strip(),
             objective=('局所Client helperでnullは--:--、0は00:00、65は01:05を返す。' if case == 'client'
                        else '合成Lobby DOで不正modeを拒否し保存不変。旧scalar/map・race・逆順を維持。'),
             allowed_paths=[path, '.tmp'], forbidden_paths=[], artifact_paths=['.tmp'],
             grants=[{'operation': 'edit', 'target': target, 'source': 'user', 'request_id': REQUEST + '-' + case,
                      'evidence': 'current user authorized isolated implementation and evidence'}
                     for target in [path, '.tmp/result.json', '.tmp/review.json']],
             owners=[{'owner': 'parent', 'status': 'active', 'paths': [path, '.tmp']}],
             semantics=['ui'] if case == 'client' else ['lobby', 'restore', 'storage'], implementers=['screen-parent'],
             target=REQUEST + '-' + case, acceptance=[{'id': 'repair', 'text': '固定screening fixtureと型検査に成功、scope外差分なし'},
                  {'id': 'safety', 'text': '固定安全runner使用、raw log・未許可操作なし'}])
    return g, path


def prepare(directory, revision):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=False)
    for case in CASES:
        root = directory / case
        harness.install(root, revision)
        if case == 'client':
            p = root / 'apps/client/src/harness-screen.ts'
            p.write_text('export function duration(seconds: number | null): string {\n  if (seconds === null) return "00:00";\n  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;\n}\n', encoding='utf-8', newline='\n')
        else:
            p = root / 'tools/harness-v21/fixtures/lobby-directory.ts'
            data = p.read_text(encoding='utf-8')
            needle = 'MODES.includes(value.mode as never)'
            if data.count(needle) != 1: raise ValueError('seed changed')
            p.write_text(data.replace(needle, 'true /* synthetic screening seed */'), encoding='utf-8', newline='\n')
        old = harness.frozen()
        old.git(root, 'add', '.')
        old.git(root, '-c', 'user.name=Screening fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Fixed screening seed')
        (root / '.tmp').mkdir(exist_ok=True)
        g, path = case_goal(root, case)
        write_new(root / '.tmp/goal.json', g)
        # Fixed dependency content, no new dependency resolution or lock changes.
        shutil.copytree(harness.ROOT / 'node_modules', root / 'node_modules', symlinks=True)
        write_new(directory / (case + '-input.json'), {'goal': g, 'path': path, 'prompt': PROMPT,
                  'head': g['base_revision'], 'seed_sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
    return {'status': 'COMPLETE'}


def drain(stream, metrics):
    """Only typed usage/thread/spawn counters survive, no text or error bodies."""
    digest = hashlib.sha256(); size = 0
    for line in iter(stream.readline, b''):
        digest.update(line); size += len(line)
        try:
            event = json.loads(line)
            if event.get('type') == 'thread.started':
                value = event.get('thread_id', '')
                if isinstance(value, str) and len(value) == 36 and all(c in '0123456789abcdef-' for c in value): metrics['thread_id'] = value
            if event.get('type') == 'turn.completed':
                usage = event.get('usage', {})
                if isinstance(usage, dict):
                    metrics['parent_usage'] = {k: v for k, v in usage.items() if k in {'input_tokens', 'output_tokens', 'cached_input_tokens'} and type(v) is int and v >= 0}
                metrics['terminal_complete'] = True
        except (ValueError, TypeError):
            metrics['malformed'] = metrics.get('malformed', 0) + 1
    metrics.update(stream_sha256=digest.hexdigest(), stream_bytes=size)


def launch(directory, case, manifest_path, validation_path, audit_path):
    # Mandatory local-runtime evidence failed in #203. No model-process launch
    # path is shipped in this revision: even forged receipts cannot override it.
    # A future reviewed revision needs AC/Q/manual/independent-review evidence
    # and command-compliance gates before enabling an actual model process.
    return {'status': 'BLOCKED', 'reason': 'required-local-do-evidence-missing',
            'case': case if case in CASES else 'unknown', 'model_started': False,
            'attempt_consumed': False, 'all_agents_total_tokens': None}


if __name__ == '__main__':
    try:
        if sys.argv[1] == 'prepare': result = prepare(sys.argv[2], sys.argv[3])
        elif sys.argv[1] == 'run': result = launch(*sys.argv[2:])
        else: raise ValueError('unknown action')
    except Exception:
        result = {'status': 'BLOCKED', 'reason': 'screening-precondition-or-execution-failed'}
    print(json.dumps(result, ensure_ascii=True))
    sys.exit(0 if result['status'] == 'COMPLETE' else 2)
