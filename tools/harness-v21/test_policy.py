import copy
import importlib.util
import json
from pathlib import Path
import unittest

import policy

ROOT = Path(__file__).resolve().parents[2]


def goal(paths, tags=None):
    g = json.loads((ROOT / 'tools/harness-v2/goal.example.json').read_text(encoding='utf-8'))
    g.update(allowed_paths=['apps', 'packages', 'docs', 'tools'], forbidden_paths=[],
             owners=[{'owner': 'parent', 'status': 'active', 'paths': ['apps', 'packages', 'docs', 'tools']}],
             semantics=tags or [], meaning_review={p: 'local change; no contract effects' for p in paths})
    return g


class SelectorTests(unittest.TestCase):
    def test_local_worker_requires_floor_without_source_e2e(self):
        paths = ['apps/worker/src/utils/display.ts']
        p = policy.route(goal(paths, ['ui']), paths)
        self.assertNotIn('real-client-worker-source-e2e', p['manual'])
        self.assertEqual(p['delegation'], 'on-demand-only')
        self.assertTrue({'lint', 'types', 'stats', 'worker-test', 'worker-bundle'} <= set(p['commands']))

    def test_local_client_keeps_floor_without_e2e(self):
        paths = ['apps/client/src/components/Display.tsx']
        p = policy.route(goal(paths, ['ui']), paths)
        self.assertEqual(p['delegation'], 'on-demand-only')
        self.assertNotIn('real-client-worker-source-e2e', p['manual'])
        self.assertIn('client-build', p['commands'])

    def test_lobby_storage_is_not_source(self):
        paths = ['apps/worker/src/durable/lobby-directory-object.ts']
        p = policy.route(goal(paths, ['ui']), paths)
        self.assertEqual(p['delegation'], 'independent-review-required')
        self.assertIn('reject-with-storage-unchanged', p['manual'])
        self.assertIn('clock-barrier-restore-replay-growth-and-runtime', p['manual'])
        self.assertNotIn('real-client-worker-source-e2e', p['manual'])

    def test_dangerous_path_cannot_be_downgraded_by_ui_tag(self):
        for path in ['apps/worker/src/durable/room-object.ts', 'packages/shared/src/ws.ts',
                     'apps/client/src/source/submission.ts', 'apps/client/src-tauri/src/watcher.rs']:
            with self.subTest(path=path):
                p = policy.route(goal([path], ['ui']), [path])
                self.assertEqual(p['delegation'], 'independent-review-required')
                self.assertIn('real-client-worker-source-e2e', p['manual'])

    def test_high_risk_semantics_under_innocent_paths(self):
        paths = ['docs/note.md']
        for tag in policy.legacy.CONTRACTS:
            with self.subTest(tag=tag):
                p = policy.route(goal(paths, [tag]), paths)
                self.assertEqual(p['delegation'], 'independent-review-required')
                self.assertIn('Q14', p['quality'])

    def test_unknown_worker_and_cross_layer_fail_closed(self):
        paths = ['apps/worker/src/utils/display.ts']
        g = goal(paths, ['ui']); g.pop('meaning_review')
        self.assertIn('unknown-impact-classification', policy.route(g, paths)['manual'])
        paths += ['apps/client/src/components/Display.tsx']
        self.assertIn('real-client-worker-source-e2e', policy.route(goal(paths, ['ui']), paths)['manual'])

    def test_actual_scope_owners_not_translated_paths(self):
        paths = ['apps/worker/src/utils/display.ts']
        g = goal(paths, ['ui']); g['allowed_paths'] = ['docs']
        self.assertTrue(policy.route(g, paths)['blockers'])

    def test_combined_and_client_persistence_paths_accumulate_floors(self):
        for path, expected in [
            ('apps/worker/src/utils/source-storage.ts', {'source', 'storage', 'restore'}),
            ('apps/worker/src/utils/timer-storage.ts', {'timer', 'storage', 'restore'}),
            ('apps/client/src/stores/settings-store.ts', {'source', 'storage', 'restore'}),
            ('apps/client/src/services/local-storage.ts', {'storage', 'restore'}),
            ('apps/client/src/services/native-bridge.ts', {'source', 'native', 'storage'}),
        ]:
            with self.subTest(path=path):
                plan = policy.route(goal([path], ['ui']), [path])
                self.assertTrue(expected <= set(plan['semantics']))
                self.assertEqual(plan['delegation'], 'independent-review-required')
                self.assertIn('old-new-writer-reader-corrupt-future-matrix', plan['manual'])

    def test_frozen_authority_gate_identity(self):
        self.assertIs(policy.operation, policy.legacy.operation)
        self.assertIs(policy.completion, policy.legacy.completion)
        for op in ['merge', 'deploy', 'release', 'cleanup', 'self-approve']:
            self.assertTrue(policy.operation(goal([], []), op, 'not-granted'))


if __name__ == '__main__':
    unittest.main()
