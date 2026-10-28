import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import validate


class FreshnessTests(unittest.TestCase):
    def test_source_changed_during_checks_stays_blocked(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(validate.harness, 'hashes', side_effect=[{'code': 'old'}, {'code': 'new'}]), patch.object(validate.safety, 'run_check', side_effect=lambda key: {'check': key, 'status': 'COMPLETE', 'exit_code': 0}):
            receipt = validate.run(tmp)
            self.assertEqual(receipt['status'], 'BLOCKED')
            self.assertFalse(receipt['source_unchanged'])
            self.assertEqual(receipt['source_hashes'], {'code': 'old'})

    def test_failure_is_preserved_and_receipts_are_append_only(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(validate.harness, 'hashes', return_value={'code': 'same'}), patch.object(validate.safety, 'run_check', side_effect=lambda key: {'check': key, 'status': 'BLOCKED' if key == 'design' else 'COMPLETE', 'exit_code': 1 if key == 'design' else 0}):
            receipt = validate.run(tmp)
            self.assertEqual(receipt['status'], 'BLOCKED')
            self.assertEqual(json.loads((Path(tmp) / 'design.json').read_text())['exit_code'], 1)
            with self.assertRaises(FileExistsError): validate.run(tmp)


if __name__ == '__main__': unittest.main()
