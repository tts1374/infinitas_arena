import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

for (const directory of ['.codex/agents', '.codex/skills', '.agents/skills']) {
  assert.ok(!existsSync(directory) || readdirSync(directory).length === 0,
    directory + ': provisional lightweight flow requires zero project definitions');
}
const config = readFileSync('.codex/config.toml', 'utf8');
assert.doesNotMatch(config, /^\[agents(?:\.|\])/m, 'Do not register legacy roles');
// Existing MCP development tools remain available under the lightweight flow.
console.log('Custom Agent 0 / project Skill 0; existing development tools preserved.');
