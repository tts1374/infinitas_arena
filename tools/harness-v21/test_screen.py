import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import screen


class ScreeningGateTests(unittest.TestCase):
    def inputs(self):
        hashes = screen.harness.hashes()
        manifest = {'request': screen.REQUEST, 'cases': list(screen.CASES), 'max_sessions': 2,
                    'retries': 0, 'max_seconds': 1200, 'source_hashes': hashes}
        receipt = {'status': 'COMPLETE', 'source_hashes': hashes}
        audits = {'status': 'COMPLETE', 'source_hashes': hashes, 'coverage': ['contract', 'behavior'],
                  'reviewer_ids': ['reviewer-contract', 'reviewer-behavior']}
        return manifest, receipt, audits

    def test_once_only_even_different_output_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            inputs = self.inputs()
            screen.reserve('client', *inputs, ledger=tmp)
            with self.assertRaises(FileExistsError): screen.reserve('client', *inputs, ledger=tmp)

    def test_gate_failure_reserves_no_attempt(self):
        for field in ['stale', 'fail', 'review', 'limit', 'retry']:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                manifest, receipt, audits = self.inputs()
                if field == 'stale': receipt['source_hashes'] = {}
                if field == 'fail': receipt['status'] = 'BLOCKED'
                if field == 'review': audits['reviewer_ids'] = ['same', 'same']
                if field == 'limit': manifest['max_sessions'] = 18
                if field == 'retry': manifest['retries'] = 1
                with self.assertRaises(ValueError): screen.reserve('client', manifest, receipt, audits, ledger=tmp)
                self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_worker_requires_client_success_and_hold_stops_everything(self):
        with tempfile.TemporaryDirectory() as tmp:
            inputs = self.inputs()
            with self.assertRaises(ValueError): screen.reserve('worker', *inputs, ledger=tmp)
            screen.write_new(Path(tmp) / 'client-result.json', {'status': 'BLOCKED'})
            with self.assertRaises(ValueError): screen.reserve('worker', *inputs, ledger=tmp)
            screen.write_new(Path(tmp) / 'hold.json', {'status': 'BLOCKED'})
            with self.assertRaises(ValueError): screen.reserve('client', *inputs, ledger=tmp)

    def test_aggregate_does_not_export_text_errors_tools_or_child_output(self):
        secret = 'arbitrary synthetic secret'
        rows = [{'type': 'item.completed', 'item': {'type': 'command_execution', 'aggregated_output': secret}},
                {'type': 'error', 'message': secret}, {'type': 'child', 'output': secret},
                {'type': 'turn.completed', 'usage': {'input_tokens': 10, 'output_tokens': 2, 'secret': secret}}]
        metrics = {}; screen.drain(io.BytesIO(('\n'.join(json.dumps(r) for r in rows) + '\n').encode()), metrics)
        self.assertNotIn(secret, json.dumps(metrics))
        self.assertEqual(metrics['parent_usage'], {'input_tokens': 10, 'output_tokens': 2})
        self.assertTrue(metrics['terminal_complete'])

    def test_failed_mandatory_evidence_cannot_launch_even_with_forged_pass(self):
        with patch.object(screen.subprocess, 'Popen', side_effect=AssertionError('must not launch')):
            for case in screen.CASES:
                result = screen.launch('unused', case, 'forged-pass', 'forged-pass', 'forged-pass')
                self.assertEqual(result['status'], 'BLOCKED')
                self.assertFalse(result['model_started'])
                self.assertFalse(result['attempt_consumed'])


if __name__ == '__main__': unittest.main()
