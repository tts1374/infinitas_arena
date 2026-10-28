// Wrangler 4.76 appends debug records even with WRANGLER_LOG=none. Redirect
// only this probe's exact private log target into a discard sink before import.
const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(process.env.WRANGLER_LOG_PATH);
const matches = value => typeof value === 'string' && path.resolve(value) === target;
const promises = require('node:fs/promises');
for (const key of ['appendFile', 'writeFile']) {
  const original = promises[key];
  promises[key] = async function (file, ...args) {
    if (matches(file)) return;
    return original.call(this, file, ...args);
  };
  const sync = fs[key + 'Sync'];
  fs[key + 'Sync'] = function (file, ...args) {
    if (matches(file)) return;
    return sync.call(this, file, ...args);
  };
  const callback = fs[key];
  fs[key] = function (file, ...args) {
    if (matches(file)) {
      const done = args.at(-1);
      if (typeof done === 'function') queueMicrotask(() => done(null));
      return;
    }
    return callback.call(this, file, ...args);
  };
}
