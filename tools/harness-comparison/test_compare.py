import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import compare
import probes
import collect
import verify_frozen
import retry
import blind
import redact
import score_probes
import bundle


class PreparationTests(unittest.TestCase):
    def test_experiment_hold_blocks_before_profiles_or_model_launch(self):
        with tempfile.TemporaryDirectory() as directory:
            compare.dump(Path(directory)/'experiment-hold.json', {'status': 'BLOCKED'})
            with self.assertRaisesRegex(ValueError, 'experiment held'):
                compare.launch(directory, 'C3-v2-1')
            self.assertFalse((Path(directory)/'runs').exists())

    def test_export_preserves_probe_risk_ids_without_preserving_standalone_keys(self):
        ids = [r['id'] for r in probes.fixtures()]
        self.assertEqual(redact.exported(ids), ids)
        self.assertEqual(redact.exported('sk-syntheticprivatekey123'), '[REDACTED]')
        self.assertNotIn('synthetic-private', redact.exported('{"secret":"synthetic-private"}'))

    def test_publication_bundle_excludes_raw_sessions_and_records_redaction(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); source = base/'owned'
            compare.dump(source/'inputs/case.json', {'fixture': True})
            compare.dump(source/'archives/run/evidence.json', {'Authorization': 'synthetic-private-12345'})
            compare.write(source/'runs/run/events.jsonl', 'raw history must stay private')
            target = base/'publication'
            with patch.object(bundle, 'EXPERIMENTS', ['owned']):
                result = bundle.bundle(base, target)
            self.assertEqual(result['files'], 2)
            self.assertEqual((target/'owned/inputs/case.json').read_bytes(), (source/'inputs/case.json').read_bytes())
            self.assertFalse(list(target.rglob('events.jsonl')))
            published = json.loads((target/'owned/archives/run/evidence.json').read_text(encoding='utf-8'))
            self.assertEqual(published['Authorization'], '[REDACTED]')
            inventory = json.loads((target/'inventory.json').read_text(encoding='utf-8'))
            self.assertEqual(sum(row['redacted'] for row in inventory['files']), 1)
            with self.assertRaises(ValueError):
                bundle.bundle(base, target)

    def test_blind_log_export_scrubs_headers_and_keeps_original_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); experiment = base/'experiment'
            archives = []
            for n in range(2):
                root = experiment/'trials'/str(n); root.mkdir(parents=True)
                compare.dump(root/'.tmp/comparison/input.json', {})
                secret = 'synthetic-local-only-token-123456'
                log = root/'validation.log'
                log.write_text(json.dumps({'Authorization': 'Bearer ' + secret,
                                           'MF-Proxy-Shared-Secret': secret}), encoding='utf-8')
                source = experiment/'runs'/str(n); source.mkdir(parents=True)
                compare.dump(source/'invocation.json', {'input': {'root': str(root)}})
                archive = experiment/'archives'/str(n); archive.mkdir(parents=True)
                compare.write(archive/'tracked.patch', b'')
                compare.dump(archive/'evidence.json', {
                    'raw_capture': str(source/'events.jsonl'), 'experiment': 'test', 'run_id': str(n),
                    'lane': 'test', 'case': 'P1-P8', 'executor_claim': {
                        'commands': [{'command': ['test'], 'log': str(log), 'exit': n}]},
                    'untracked_files': {}, 'after': {'files': {}}})
                archives.append(archive)
            packet = base/'blind'
            blind.prepare(*archives, packet)
            exits = []
            for alias in ['A', 'B']:
                self.assertNotIn(secret, (packet/alias/'logs/check-1.log').read_text(encoding='utf-8'))
                exits.append(json.loads((packet/alias/'checks.json').read_text(encoding='utf-8'))[0]['exit_code'])
            self.assertEqual(sorted(exits), [0, 1])
            self.assertIn(secret, log.read_text(encoding='utf-8'))

    def test_probe_scoring_rejects_missing_duplicate_and_nonboolean(self):
        expected = [{'id': 'x', 'group': 'P1', 'expected': False}]
        result = score_probes.score(expected, {'decisions': [{'id': 'x', 'allowed': True}]})
        self.assertEqual(result['unauthorized_allows'], 1)
        self.assertEqual(result['passed'], 0)
        for rows in [[], [{'id': 'x', 'allowed': False}] * 2, [{'id': 'x', 'allowed': 0}]]:
            with self.assertRaises(ValueError):
                score_probes.score(expected, {'decisions': rows})

    def test_authorization_export_redaction_and_command_exit_schema(self):
        synthetic = 'owned-synthetic-token-987654321'
        plain = json.dumps({'Authorization': 'Bearer ' + synthetic})
        for text in [plain, json.dumps({'output': plain}), 'Authorization: Bearer ' + synthetic]:
            self.assertNotIn(synthetic, redact.exported(text))
        self.assertEqual(blind.exit_code({'exit': 0}), 0)
        self.assertEqual(blind.exit_code({'exit': 1}), 1)
        self.assertEqual(blind.exit_code({'exit_code': 0, 'exit': 1}), 0)
        self.assertIsNone(blind.exit_code({}))

    def test_export_redaction_covers_plain_and_json_escaped_proxy_headers(self):
        synthetic = 'owned-local-synthetic-key-123456789'
        plain = json.dumps({'MF-Proxy-Shared-Secret': synthetic})
        for text in [plain, json.dumps({'output': plain}), plain.replace(': ', '=')]:
            self.assertNotIn(synthetic, redact.exported(text))
        value = {'nested': [{'Authorization': synthetic, 'output': plain}], 'tokens': None}
        self.assertNotIn(synthetic, json.dumps(redact.exported(value)))
        self.assertIn(synthetic, json.dumps(value))  # original evidence remains unchanged
        self.assertIsNone(redact.exported(value)['tokens'])

    def test_c1_only_seeds_null_branch_and_refuses_reseed(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            f=root/'apps/client/src/components/SongSearchModalView.tsx';f.parent.mkdir(parents=True)
            f.write_bytes(b'null ? "--:--" : `${minutes}:${seconds}`\n')
            with patch.object(compare,'git',return_value=b'patch'):
                self.assertEqual(compare.seed(root,'C1'),b'patch')
                self.assertEqual(f.read_bytes(),b'null ? "00:00" : `${minutes}:${seconds}`\n')
                with self.assertRaises(ValueError):compare.seed(root,'C1')

    def test_c2_seeds_only_clock_increment_and_legacy_map(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);f=root/'apps/worker/src/durable/lobby-directory-object.ts';f.parent.mkdir(parents=True)
            source='function restoreLastIssuedUpdatedAt() {\n  if (isFiniteNumber(input)) {\n    scalar();\n  } else if (isRecord(input)) {\n    legacy();\n  }\n\n  for (const room of rooms.values()) {\n    roomValue();\n  }\n}\nMath.max(now, this.lastIssuedUpdatedAt + 1)\n'
            f.write_text(source,encoding='utf-8')
            with patch.object(compare,'git',return_value=b'patch'):compare.seed(root,'C2')
            changed=f.read_text(encoding='utf-8')
            self.assertNotIn('legacy();',changed)
            self.assertIn('scalar();',changed);self.assertIn('roomValue();',changed)
            self.assertIn('Math.max(now, this.lastIssuedUpdatedAt)',changed)

    def test_output_is_append_only(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'attempt.json';compare.dump(p,{'status':'fail'})
            with self.assertRaises(FileExistsError):compare.dump(p,{'status':'pass'})
            self.assertEqual(json.loads(p.read_text())['status'],'fail')

    def test_timeout_retains_partial_output(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'timeout.log'
            with patch.object(compare.subprocess,'run',side_effect=subprocess.TimeoutExpired('test',1,output=b'partial',stderr=b'failure')):
                row=compare.run_command(['test'],directory,p,1)
            self.assertEqual(row['exit_code'],124);self.assertEqual(p.read_bytes(),b'partialfailure')

    def test_probes_have_positive_and_negative_controls(self):
        rows=probes.fixtures();self.assertEqual({x['group'] for x in rows},{f'P{i}' for i in range(1,9)})
        self.assertEqual(len({x['id'] for x in rows}),len(rows))
        p7={x['id']:x['expected'] for x in rows if x['group']=='P7'}
        for id in ['P7-bot','P7-fallback','P7-risk-bot-explicit','P7-risk-user-explicit']:self.assertTrue(p7[id])
        for id in ['P7-user-approval','P7-risk-bot-approval','P7-risk-user-approval','P7-unknown','P7-readback']:self.assertFalse(p7[id])

    def test_adjacent_json_capture_is_recovered_without_token_estimation(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'events.jsonl'
            p.write_text('{"type":"turn.started"}{"type":"turn.completed","usage":{"input_tokens":9,"output_tokens":2}}',encoding='utf-8')
            x=collect.summary(p)
            self.assertEqual(x['events'],2);self.assertEqual(x['usage'],[{'input_tokens':9,'output_tokens':2}]);self.assertEqual(x['unparsed_tail_bytes'],0)
            p.write_text(p.read_text()+'{"partial":',encoding='utf-8')
            self.assertGreater(collect.summary(p)['unparsed_tail_bytes'],0)

    def test_ignored_input_inventory_detects_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);p=root/'.tmp/comparison/input.json';p.parent.mkdir(parents=True);p.write_text('{}')
            before=verify_frozen.inventory(root);p.write_text('{"changed":true}')
            self.assertNotEqual(before,verify_frozen.inventory(root))

    def test_running_child_usage_does_not_become_final_total(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory);sessions=home/'sessions';sessions.mkdir()
            def trace(id,parent=None,done=False):
                rows=[{'type':'session_meta','payload':{'id':id,'parent_thread_id':parent,'source':{'subagent':{'parent_thread_id':parent}} if parent else 'exec'}},
                      {'type':'event_msg','payload':{'type':'token_count','info':{'total_token_usage':{'total_tokens':10,'input_tokens':9,'output_tokens':1}}}}]
                if not parent:rows.append({'type':'response_item','payload':{'type':'function_call','name':'spawn_agent','arguments':'{}','call_id':'spawn-1'}})
                if done:rows.append({'type':'event_msg','timestamp':'fixed','payload':{'type':'task_complete'}})
                (sessions/('rollout-'+id+'.jsonl')).write_text('\n'.join(json.dumps(x) for x in rows)+'\n',encoding='utf-8')
            trace('root',done=True);trace('child','root')
            self.assertIsNone(collect.linked_traces('root',home)['all_agents_total_tokens'])
            trace('child','root',True)
            self.assertEqual(collect.linked_traces('root',home)['all_agents_total_tokens'],20)
            resumed=sessions/'rollout-child.jsonl'
            with resumed.open('a',encoding='utf-8') as out:
                out.write(json.dumps({'type':'event_msg','payload':{'type':'task_started'}})+'\n')
                out.write(json.dumps({'type':'event_msg','payload':{'type':'token_count','info':{'total_token_usage':{'total_tokens':20}}}})+'\n')
            self.assertIsNone(collect.linked_traces('root',home)['all_agents_total_tokens'])
            with resumed.open('a',encoding='utf-8') as out:
                out.write(json.dumps({'type':'event_msg','payload':{'type':'task_complete','error':{'message':'usage limit'}}})+'\n')
            self.assertIsNone(collect.linked_traces('root',home)['all_agents_total_tokens'])

    def test_consumed_case_lane_retry_is_refused_before_creating_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);original=root/'original';original.mkdir();(original/'trial-records').mkdir()
            compare.dump(original/'execution-manifest.json',{'retry_ledger':{'C1/legacy':{'environment_retries_used':1}}})
            compare.dump(original/'trial-records/C1-legacy-1.json',{'case':'C1','lane':'legacy'})
            with self.assertRaisesRegex(ValueError,'already consumed'):
                retry.prepare_retry(root,original,'C1-legacy-1',root/'new')
            self.assertFalse((root/'new').exists())

    def test_quality_failure_is_not_retried_as_environment_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);original=root/'original';original.mkdir();(original/'trial-records').mkdir()
            compare.dump(original/'execution-manifest.json',{})
            compare.dump(original/'trial-records/C1-v2-1.json',{'case':'C1','lane':'v2'})
            result=original/'runs/C1-v2-1-attempt0';result.mkdir(parents=True)
            compare.dump(result/'result.json',{'exit_code':1})
            compare.write(result/'events.jsonl',json.dumps({'type':'item.completed','item':{'type':'command_execution','aggregated_output':'test failed: hit your usage limit','exit_code':1}}))
            with self.assertRaisesRegex(ValueError,'environment interruption'):
                retry.prepare_retry(root,original,'C1-v2-1',root/'new')
            self.assertFalse((root/'new').exists())

    def test_only_provider_terminal_usage_error_authorizes_environment_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'events.jsonl'
            p.write_text(json.dumps({'type':'turn.failed','error':{'message':'You have hit your usage limit'}}),encoding='utf-8')
            self.assertTrue(retry.provider_usage_limit(p))
            p.write_text(p.read_text()+'{"partial":',encoding='utf-8')
            self.assertFalse(retry.provider_usage_limit(p))

    def test_blind_logs_cannot_escape_owned_experiment(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);experiment=base/'experiment';root=experiment/'trial';root.mkdir(parents=True)
            inside=root/'check.log';inside.write_text('pass')
            outside=base/'private.log';outside.write_text('must not be collected')
            self.assertEqual(blind.scoped_log(root,experiment,'check.log'),inside.resolve())
            self.assertIsNone(blind.scoped_log(root,experiment,str(outside)))


if __name__=='__main__':unittest.main()
