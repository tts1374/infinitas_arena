import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import safety


class SecretTests(unittest.TestCase):
    def test_arbitrary_stdout_stderr_json_child_and_review_never_reflected(self):
        secret = 'arbitrary synthetic snowman \u2603 credential without recognizable prefix'
        forms = [secret, json.dumps({'MF-Proxy-Shared-Secret': secret}),
                 json.dumps({'child_tool_output': secret}), json.dumps({'review': {'evidence': secret}})]
        for value in forms:
            with self.subTest(form=forms.index(value)):
                p = subprocess.CompletedProcess([], 0, value.encode(), value.encode())
                with patch.object(safety.subprocess, 'run', return_value=p):
                    row = safety.capture(['trusted'], '.')
                self.assertNotIn(secret, json.dumps(row, ensure_ascii=False))
                self.assertEqual(row['status'], 'COMPLETE')
                self.assertFalse(row['raw_retained'])

    def test_exception_and_timeout_are_not_reflected(self):
        secret = 'synthetic-unknown-sensitive-value'
        for exc in [OSError(secret), subprocess.TimeoutExpired(secret, 1, output=secret.encode(), stderr=secret.encode())]:
            with patch.object(safety.subprocess, 'run', side_effect=exc):
                row = safety.capture(['trusted'], '.')
            self.assertEqual(row['status'], 'BLOCKED')
            self.assertNotIn(secret, json.dumps(row))

    def test_real_child_output_is_suppressed(self):
        row = safety.capture([sys.executable, '-c', "import sys;print('synthetic-hidden-stdout');sys.stderr.write('synthetic-hidden-stderr')"], '.')
        self.assertEqual(row['exit_code'], 0)
        self.assertNotIn('synthetic-hidden', json.dumps(row))

    def test_audit_projection_rejects_unknown_types_and_child_fields(self):
        row = safety.audit_record({'status': 'COMPLETE', 'exit_code': 'secret', 'child': {'secret': 'secret'}})
        self.assertEqual(row, {'status': 'COMPLETE', 'exit_code': None})
        self.assertEqual(safety.audit_record({'status': 'secret'})['status'], 'BLOCKED')

    def test_environment_and_unknown_command_are_not_reflected(self):
        with patch.dict(os.environ, {'CLOUDFLARE_API_TOKEN': 'synthetic-secret', 'DEBUG': 'synthetic-secret'}):
            env = safety.environment()
            self.assertNotIn('CLOUDFLARE_API_TOKEN', env)
            self.assertNotIn('DEBUG', env)
        self.assertEqual(safety.run_check('synthetic-secret')['reason'], 'unknown-check')
        p = subprocess.run([sys.executable, str(Path(safety.__file__)), 'synthetic-secret'], capture_output=True)
        self.assertNotIn(b'synthetic-secret', p.stdout + p.stderr)

    def test_identifiers_preserved_in_export_redactor(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('export_redactor', safety.ROOT / 'tools/harness-comparison/redact.py')
        redactor = importlib.util.module_from_spec(spec); spec.loader.exec_module(redactor)
        self.assertEqual(redactor.exported('P7-risk-identifier'), 'P7-risk-identifier')
        self.assertNotEqual(redactor.exported('sk-syntheticsecret'), 'sk-syntheticsecret')

    def test_uncertified_runtime_cannot_execute(self):
        with patch.object(safety.subprocess, 'run', side_effect=AssertionError('must not launch')):
            self.assertEqual(safety.run_check('worker-bundle')['status'], 'BLOCKED')

    def test_failed_local_probe_cli_remains_held(self):
        import importlib.util
        import contextlib
        import io
        spec = importlib.util.spec_from_file_location('held_local_probe', safety.ROOT / 'tools/harness-v21/fixtures/local_probe.py')
        probe = importlib.util.module_from_spec(spec); spec.loader.exec_module(probe)
        with patch.object(probe.subprocess, 'Popen', side_effect=AssertionError('must not launch')), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(probe.main(), 2)
        self.assertEqual(json.loads(output.getvalue())['starts'], 0)


if __name__ == '__main__':
    unittest.main()
