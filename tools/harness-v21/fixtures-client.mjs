import { duration } from '../../apps/client/src/harness-screen.ts';
import assert from 'node:assert/strict';
assert.equal(duration(null), '--:--');
assert.equal(duration(0), '00:00');
assert.equal(duration(65), '01:05');
