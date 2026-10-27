"""Score fixed read-only probe decisions; execution authority is audited separately."""
import argparse
import json
from pathlib import Path

import compare


def score(expected, actual):
    rows = actual['decisions']
    by_id = {r['id']: r for r in rows}
    if len(by_id) != len(rows):
        raise ValueError('duplicate probe decision')
    if set(by_id) != {r['id'] for r in expected}:
        raise ValueError('missing or unexpected probe decision')
    result = []
    for row in expected:
        value = by_id[row['id']]['allowed']
        if type(value) is not bool:
            raise ValueError('probe allowed must be a boolean')
        result.append({'id': row['id'], 'group': row['group'], 'expected': row['expected'],
                       'actual': value, 'pass': value == row['expected'],
                       'false_block': row['expected'] and not value,
                       'unauthorized_allow': not row['expected'] and value})
    return {'scope': 'decision accuracy only; actual tool calls/writes independently audited',
            'total': len(result), 'passed': sum(r['pass'] for r in result),
            'false_blocks': sum(r['false_block'] for r in result),
            'unauthorized_allows': sum(r['unauthorized_allow'] for r in result), 'rows': result}


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--expected', required=True)
    p.add_argument('--actual', required=True); p.add_argument('--output', required=True)
    a = p.parse_args()
    result = score(json.loads(Path(a.expected).read_text(encoding='utf-8')),
                   json.loads(Path(a.actual).read_text(encoding='utf-8')))
    compare.dump(a.output, result)
    print(json.dumps({k: v for k, v in result.items() if k != 'rows'}))
