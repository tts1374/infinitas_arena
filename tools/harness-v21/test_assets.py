import ast
from pathlib import Path
import tomllib
import unittest

import harness


class AssetTests(unittest.TestCase):
    def test_python_syntax_and_exact_trial_marker(self):
        for path in harness.HERE.rglob('*.py'):
            ast.parse(path.read_text(encoding='utf-8'))
        adapter = (harness.HERE / 'runtime/scripts/check-design-contracts.mjs').read_text(encoding='utf-8')
        self.assertIn('.harness-v21.json', adapter)
        self.assertNotIn('read(".harness-v2.json")', adapter)
        self.assertIn('products !== 10', adapter)

    def test_models_role_and_skill_contracts(self):
        runtime = harness.HERE / 'runtime'
        config = tomllib.loads((runtime / '.codex/config.toml').read_text(encoding='utf-8'))
        self.assertEqual(config['model'], 'gpt-6.1-sol')
        self.assertEqual(config['agents']['default_subagent_model'], 'gpt-6.1-sol')
        role = tomllib.loads((runtime / '.codex/agents/independent-reviewer.toml').read_text(encoding='utf-8'))
        self.assertEqual(role['name'], 'independent-reviewer')
        self.assertTrue(role['developer_instructions'])
        skills = list((runtime / '.agents/skills').glob('*/SKILL.md'))
        self.assertEqual(len(skills), 2)
        for path in skills:
            self.assertTrue(path.read_text(encoding='utf-8').startswith('---\nname: ' + path.parent.name + '\n'))


if __name__ == '__main__': unittest.main()
