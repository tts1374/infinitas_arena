"""Explicit CI-parity validation with output minimization and append-only receipts."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys

import harness
import safety


def run(destination):
    before = harness.hashes()
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    checks = ['agents', 'design', 'lint', 'types', 'stats', 'worker-test', 'client-build',
              'v2-test', 'comparison-test', 'v21-test', 'fixture-test', 'fixture-types']
    results = []
    # Independent checks; no mutation of tracked source, fixed commands only.
    with ThreadPoolExecutor(max_workers=2) as pool:
        for row in pool.map(safety.run_check, checks):
            with (destination / (row['check'] + '.json')).open('x', encoding='utf-8', newline='\n') as stream:
                json.dump(row, stream, indent=2); stream.write('\n')
            results.append(row)
    after = harness.hashes()
    receipt = {'status': 'COMPLETE' if before == after and all(r['status'] == 'COMPLETE' for r in results) else 'BLOCKED',
               'source_hashes': before, 'source_unchanged': before == after, 'results': results}
    with (destination / 'receipt.json').open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(receipt, stream, indent=2); stream.write('\n')
    return receipt


if __name__ == '__main__':
    try:
        result = run(sys.argv[1])
        print(json.dumps({'status': result['status'], 'checks': len(result['results'])}))
    except Exception:
        print(json.dumps({'status': 'BLOCKED', 'reason': 'validation-failed'}))
        sys.exit(2)
