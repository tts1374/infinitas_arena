"""Additive v2.1 entrypoint. Frozen v2 files remain unchanged."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys

import policy

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def frozen():
    spec = importlib.util.spec_from_file_location('frozen_v2_harness', ROOT / 'tools/harness-v2/harness.py')
    module = importlib.util.module_from_spec(spec)
    previous = sys.modules.get('policy')
    sys.modules['policy'] = policy.legacy
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules['policy'] = previous
    return module


def hashes(directory=HERE):
    return {p.relative_to(directory).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(Path(directory).rglob('*')) if p.is_file()
            and not any(part in {'__pycache__', 'node_modules'} for part in p.parts) and p.suffix != '.pyc'}


def install(destination, revision):
    old = frozen()
    old.install(ROOT, destination, policy.legacy.PRODUCT_BASE, revision)
    destination = Path(destination)
    # The active marker and rules identify exactly one lane. Frozen source is
    # inactive reference material, not a second active instruction set.
    (destination / '.harness-v2.json').unlink()
    for prefix in ['tools/harness-v21', 'docs/harness-v21']:
        source = ROOT / prefix
        if source.exists():
            shutil.copytree(source, destination / prefix, ignore=shutil.ignore_patterns('__pycache__'), dirs_exist_ok=True)
    for p in (HERE / 'runtime').rglob('*'):
        if p.is_file():
            target = destination / p.relative_to(HERE / 'runtime')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(p.read_bytes())
    marker = {'mode': 'harness-v21-prototype', 'harness_revision': revision,
              'frozen_v2': '59b0815dc95738c3e7a14d5505fb58d3df49c460',
              'source_hashes': hashes(), 'product_base': policy.legacy.PRODUCT_BASE}
    (destination / '.harness-v21.json').write_bytes(old.json_bytes(marker))
    old.git(destination, 'add', '.')
    old.git(destination, '-c', 'user.name=Harness fixture', '-c', 'user.email=fixture@example.invalid',
            'commit', '-m', 'Activate isolated Harness v2.1')
    return marker


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='action', required=True)
    p = sub.add_parser('select'); p.add_argument('--goal', required=True)
    p = sub.add_parser('install'); p.add_argument('--destination', required=True); p.add_argument('--revision', required=True)
    a = parser.parse_args()
    if a.action == 'install':
        install(a.destination, a.revision)
        return {'status': 'COMPLETE'}
    marker = ROOT / '.harness-v21.json'
    if not marker.exists() or (ROOT / '.harness-v2.json').exists() or (ROOT / '.codex/skills').exists():
        return {'status': 'BLOCKED', 'reason': 'mixed-or-unmarked-runtime'}
    goal = json.loads(Path(a.goal).read_text(encoding='utf-8'))
    old = frozen()
    paths = old.changed_paths(ROOT, goal['base_revision'])
    plan = policy.route(goal, paths)
    plan['fingerprint'] = old.fingerprint(ROOT, goal)
    plan['test_membership'] = old.membership(ROOT, paths)
    return plan


if __name__ == '__main__':
    try:
        result = main()
    except Exception:
        result = {'status': 'BLOCKED', 'reason': 'entrypoint-failed'}
    print(json.dumps(result, ensure_ascii=True))
    sys.exit(2 if result.get('status') == 'BLOCKED' or result.get('blockers') else 0)
