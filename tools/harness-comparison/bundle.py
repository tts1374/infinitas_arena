"""Append an explicitly scoped, redacted publication bundle; never copy raw sessions."""
import argparse
import json
from pathlib import Path

import compare
import redact


EXPERIMENTS = ['issue198-20261026-a', 'issue198-20261026-b', 'issue198-20261026-c',
               'issue198-20261027-resume1', 'issue198-20261027-resume2']


def bundle(base, output):
    base = Path(base).resolve(); output = Path(output).resolve()
    if output.exists():
        raise ValueError('preserve prior publication bundle')
    output.mkdir(parents=True)
    inventory = []

    def copy(source, target):
        if source.is_symlink() or not source.resolve().is_relative_to(base):
            raise ValueError('publication source escapes owned experiment')
        data = source.read_bytes(); published = data
        if source.suffix == '.json':
            value = json.loads(data.decode('utf-8'))
            masked = redact.exported(value)
            if masked != value:
                published = (json.dumps(masked, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
        elif source.suffix != '.png':
            text = data.decode('utf-8')
            published = redact.exported(text).encode('utf-8')
        compare.write(output/target, published)
        inventory.append({'source': str(source), 'path': str(target).replace('\\', '/'),
                          'source_sha256': compare.sha(data), 'published_sha256': compare.sha(published),
                          'redacted': published != data})

    for name in EXPERIMENTS:
        experiment = base/name
        for pattern in ['*.json', 'inputs/*', 'trial-records/*.json', 'seeds/*',
                        'setup/readback-final/*.json', 'setup/exact-profile*.json',
                        'environment-retry-ledger/*.json', 'archives/*/*.json', 'archives/*/*.patch',
                        'runs/*/profile-readback.json', 'runs/*/input-check.json',
                        'runs/*/interruption.json', 'runs/*/recovered-evidence.json',
                        'runs/*/recovered-final.patch', 'runs/*/terminal-timing.json']:
            for source in sorted(experiment.glob(pattern)):
                target = Path(name)/source.relative_to(experiment)
                if not source.is_file() or (output/target).exists():
                    continue
                copy(source, target)
        for packet_name in ['blind-c1', 'blind-c2']:
            for source in sorted((experiment/packet_name).rglob('*')):
                if source.is_file():
                    copy(source, Path(name)/source.relative_to(experiment))
    compare.dump(output/'inventory.json', {'scope': 'Inputs, manifests, selected validation and independent audit packets. Raw CLI/session histories are deliberately not published.',
                                         'files': inventory})
    return {'output': str(output), 'files': len(inventory),
            'bytes': sum((output/r['path']).stat().st_size for r in inventory)}


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--base', required=True); p.add_argument('--output', required=True)
    a = p.parse_args(); print(json.dumps(bundle(a.base, a.output)))
