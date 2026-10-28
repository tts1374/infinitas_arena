import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

// This branch intentionally has no project agent/skill definitions.
// Historical files outside discovery roots are evidence, not active configuration.
for (const directory of ['.codex/agents', '.codex/skills', '.agents/skills']) {
  assert.ok(!existsSync(directory) || readdirSync(directory).length === 0,
    `${directory}: Issue #205 prototype requires zero project definitions`);
}
const config = readFileSync('.codex/config.toml', 'utf8');
assert.match(config, /^model = "gpt-6\.1-sol"$/m);
assert.match(config, /^model_reasoning_effort = "high"$/m);
assert.ok(config.split(/\r?\n/).every(line => !line.trim() ||
  /^(model|model_reasoning_effort) = "[^"]+"$/.test(line)),
  'Keep prototype config limited to model/effort; do not register legacy roles or plugins');
console.log('Issue #205: Custom Agent 0 / project Skill 0 (repository scope).');
