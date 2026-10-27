"""Redact local runtime authentication from exported evidence, never raw sources.

Export redaction does not cure or reclassify an earlier model-visible disclosure.
The frozen harness runtime is intentionally unchanged.
"""
import re


HEADERS = {'mf-proxy-shared-secret', 'authorization', 'token', 'password', 'secret', 'api_key'}
PROXY = re.compile(r'(MF-Proxy-Shared-Secret[\\"\s]*[:=][\\"\s]*)([A-Za-z0-9+/_=-]{16,})', re.I)
AUTH = re.compile(r'(Authorization[\\"\s]*[:=][\\"\s]*)((?:(?:Bearer|Basic)\s+)?[A-Za-z0-9+/_=.\-]{8,})', re.I)
KEY = re.compile(r'(?i)(?<![A-Za-z0-9_-])(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{8,})')
ASSIGNMENT = re.compile(r'(?i)(?<![A-Za-z0-9_-])(?:token|password|secret|api_key)\s*[=:]\s*[^\s,;]+')
JSON_SECRET = re.compile(r'''(?is)(["'](?:token|password|secret|api_key)["']\s*:\s*)(["'])(?:\\.|(?!\2).)*?\2''')


def exported(value):
    if isinstance(value, dict):
        return {k: '[REDACTED]' if k.lower() in HEADERS else exported(v)
                for k, v in value.items()}
    if isinstance(value, list):
        return [exported(v) for v in value]
    if isinstance(value, str):
        value = PROXY.sub(lambda m: m[1] + '[REDACTED]', value)
        value = AUTH.sub(lambda m: m[1] + '[REDACTED]', value)
        value = JSON_SECRET.sub(lambda m: m[1] + '"[REDACTED]"', value)
        return ASSIGNMENT.sub('[REDACTED]', KEY.sub('[REDACTED]', value))
    return value
