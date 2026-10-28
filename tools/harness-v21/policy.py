"""v2.1 selection; frozen v2 authority/completion gates are reused unchanged."""
import importlib.util
from pathlib import Path
import re

_spec = importlib.util.spec_from_file_location('frozen_v2_policy', Path(__file__).resolve().parents[1] / 'harness-v2/policy.py')
legacy = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(legacy)
validate_goal = legacy.validate_goal
operation = legacy.operation
completion = legacy.completion
stub = legacy.stub
clean_path = legacy.clean_path
under = legacy.under
COMMANDS = legacy.COMMANDS


def route(goal, paths):
    """Paths provide a conservative floor; semantic declarations can only add.

    Generic Worker paths require an explicit meaning assessment. Sensitive paths
    cannot be made low risk with an innocuous tag. Unknown is fail-closed.
    """
    validate_goal(goal)
    paths = [clean_path(p) for p in paths]
    tags = set(goal['semantics'])
    if 'authority' in tags:
        tags.update(('fsm', 'ws'))
    for p in paths:
        lower = p.lower()
        if under(p, 'apps/worker'):
            inferred = set()
            if re.search(r'(source|watcher|parser|submission)', lower):
                inferred.add('source')
            if re.search(r'(security|auth|credential|permission)', lower):
                inferred.update(('authority', 'fsm', 'ws'))
            if re.search(r'(room|\bws\b|websocket|protocol|message|authority|acceptance)', lower):
                inferred.update(('fsm', 'ws', 'reconnect', 'idempotency'))
            if re.search(r'(lobby|directory)', lower):
                inferred.update(('lobby', 'restore', 'storage'))
            if re.search(r'(storage|persist|snapshot|restore)', lower):
                inferred.update(('restore', 'storage'))
            if re.search(r'(timer|alarm|deadline)', lower):
                inferred.add('timer')
            if not inferred and (not tags or not goal.get('meaning_review', {}).get(p)):
                tags.add('unknown')
            tags.update(inferred)
        elif under(p, 'apps/client'):
            for pattern, extra in [
                (r'(settings|storage|snapshot|persist)', {'storage', 'restore'}),
                (r'(archive|history|stats)', {'history', 'storage'}),
                (r'(source|watcher|parser|submission|settings)', {'source'}),
                (r'(bridge|native|src-tauri)', {'native', 'source', 'storage'}),
                (r'(room-store|websocket|protocol|reconnect)', {'ws', 'reconnect'}),
            ]:
                if re.search(pattern, lower): tags.update(extra)
        elif under(p, 'tools/harness-v21'):
            tags.add('governance')
    layers = {p.split('/')[1] for p in paths if p.startswith(('apps/', 'packages/'))}
    if len(layers) > 1:
        tags.add('shared')
    # Avoid frozen route's broad Worker inference, preserving all other floors.
    translated = [('docs/worker-classification.md' if under(p, 'apps/worker')
                   else 'docs/v21-governance.md' if under(p, 'tools/harness-v21') else p) for p in paths]
    derived = dict(goal, semantics=sorted(tags))
    plan = legacy.route(derived, translated)
    # Scope/ownership must be checked against actual paths, not translated ones.
    original = legacy.route(goal, paths)
    plan['paths'] = sorted(paths)
    plan['blockers'] = original['blockers']
    plan['mode'] = 'harness-v21-prototype'
    if any(under(p, 'apps/worker') for p in paths):
        plan['commands'] = sorted(set(plan['commands']) | {'lint', 'types', 'stats', 'worker-test', 'worker-bundle'})
    if tags & {'restore', 'storage', 'history'}:
        plan['manual'] = sorted(set(plan['manual']) | {'old-new-writer-reader-corrupt-future-matrix', 'reject-with-storage-unchanged'})
    return plan
