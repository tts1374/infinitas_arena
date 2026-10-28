"""Output minimization BEFORE model-visible output or persistence.

No regex can recognize arbitrary secrets. Runtime stdout/stderr are discarded,
including successful output. Only typed fields from this module leave the gate.
This is a cooperative command boundary, not an OS reference monitor.
"""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
CHECKS = {
    'agents': ['npm', 'run', 'check:agents'],
    'design': ['npm', 'run', 'check:design-contracts'],
    'lint': ['npm', 'run', 'lint'],
    'types': ['npm', 'run', 'typecheck'],
    'client-build': ['npm', 'run', 'build:client'],
    'client-test': ['npm', '--workspace', '@infinitas/client', 'run', 'test'],
    'stats': ['npm', 'run', 'test:client-stats'],
    'worker-test': ['npm', 'run', 'test:worker'],
    'worker-bundle': ['npx', '--no-install', 'wrangler', 'deploy', '--dry-run'],
    'fixture-test': ['node', 'node_modules/tsx/dist/cli.mjs', '--test', 'tools/harness-v21/fixtures/restore.test.mjs', 'tools/harness-v21/fixtures/barrier.test.mjs'],
    'fixture-types': ['node', 'node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tools/harness-v21/fixtures/tsconfig.json'],
    'client-screen': ['node', '--import', 'tsx', 'tools/harness-v21/fixtures-client.mjs'],
    'v2-test': [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tools/harness-v2', '-p', 'test_*.py'],
    'comparison-test': [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tools/harness-comparison', '-p', 'test_*.py'],
    'v21-test': [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tools/harness-v21', '-p', 'test_*.py'],
}


def environment():
    # No Cloudflare token, debug settings, user-provided arbitrary secret env.
    keys = {'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
            'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)'}
    result = {k: v for k, v in os.environ.items() if k.upper() in keys}
    result.update(PYTHONUTF8='1', PYTHONIOENCODING='utf-8', WRANGLER_SEND_METRICS='false', CI='true')
    return result


def capture(argv, cwd, timeout=600):
    """Trusted internal argv only; never return input/exception/output strings."""
    start = time.monotonic()
    status, code, raw = 'BLOCKED', None, b''
    try:
        p = subprocess.run(argv, cwd=cwd, capture_output=True, timeout=timeout, env=environment())
        raw = p.stdout + p.stderr
        code = p.returncode
        status = 'COMPLETE' if code == 0 else 'BLOCKED'
    except subprocess.TimeoutExpired as exc:
        raw = (exc.stdout or b'') + (exc.stderr or b'')
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    return {'status': status, 'exit_code': code, 'output_bytes': len(raw),
            'output_sha256': hashlib.sha256(raw).hexdigest(),
            'test_count': next((int(m[1]) for m in [re.search(rb'(?m)^Ran (\d+) tests?\b', raw),
                                                       re.search(rb'(?m)^# tests (\d+)\r?$', raw)] if m), None),
            'wall_seconds': round(time.monotonic() - start, 3),
            'raw_retained': False}


def run_check(key, root=ROOT):
    if key not in CHECKS:
        return {'status': 'BLOCKED', 'reason': 'unknown-check'}
    if key == 'worker-bundle':
        # Wrangler persists debug output even when stdout is captured. Its
        # runtime discard sink has not passed the mandatory local-DO probe.
        return {'status': 'BLOCKED', 'check': key, 'exit_code': None, 'reason': 'runtime-output-sink-unproven'}
    argv = list(CHECKS[key])
    if os.name == 'nt' and argv[0] in {'npm', 'npx'}:
        argv[0] += '.cmd'
    cwd = Path(root) / 'apps/worker' if key == 'worker-bundle' else root
    return dict(capture(argv, cwd), check=key)


def audit_record(record):
    """Project typed gate results only; never forward child text or unknown keys."""
    status = record.get('status') if isinstance(record, dict) else None
    code = record.get('exit_code') if isinstance(record, dict) else None
    return {'status': status if status in {'COMPLETE', 'BLOCKED'} else 'BLOCKED',
            'exit_code': code if type(code) is int else None}


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in CHECKS:
        print(json.dumps({'status': 'BLOCKED', 'reason': 'unknown-check'}))
        return 2
    row = run_check(sys.argv[1])
    print(json.dumps(row))
    return 0 if row['status'] == 'COMPLETE' else 2


if __name__ == '__main__':
    sys.exit(main())
