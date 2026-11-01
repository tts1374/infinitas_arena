"""Read effective Codex config/skills over the installed app-server protocol.

No model call and no global config/trust writes. Only this script's own child
process is terminated. Raw config (which can contain credentials) is never saved.
Methods/fields were checked against `codex app-server generate-json-schema` on
0.164.0-alpha.11.1; incompatible runtimes fail instead of fabricating a PASS.
"""
import argparse
import json
import os
from pathlib import Path
import queue
import subprocess
import threading
import tempfile

from harness import digest, now, read_json, redact, write_new


def inspect(root, binary="codex"):
    root = Path(root).resolve()
    # Invocation-local trust for this explicitly selected trial. No trust_file write.
    # Desktop's user config can contain desktop-only fields rejected by CLI
    # --strict-config. Probe project assets with an empty invocation-local home;
    # never copy auth/config or alter the user's actual CODEX_HOME.
    probe_home = Path(tempfile.mkdtemp(prefix="harness-v2-load-"))
    (probe_home / "config.toml").write_text("[projects." + json.dumps(str(root)) + ']\ntrust_level="trusted"\n', encoding="utf-8", newline="\n")
    child_env = {**os.environ, "CODEX_HOME": str(probe_home)}
    p = subprocess.Popen([binary, "app-server", "--strict-config"],
                         cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, encoding="utf-8", env=child_env)
    messages = queue.Queue()
    errors = []

    def reader():
        for line in p.stdout:
            try:
                messages.put(json.loads(line))
            except json.JSONDecodeError:
                messages.put({"error": "invalid app-server JSON"})
        messages.put({"error": "app-server closed stdout"})

    def drain():
        for line in p.stderr:
            # Keep only a digest of stderr, never credential-bearing raw config.
            errors.append(digest(line.encode()))

    threading.Thread(target=reader, daemon=True).start()
    threading.Thread(target=drain, daemon=True).start()

    def call(number, method, params):
        p.stdin.write(json.dumps({"id": number, "method": method, "params": params}) + "\n")
        p.stdin.flush()
        while True:
            row = messages.get(timeout=45)
            if row.get("id") == number:
                if "error" in row:
                    raise ValueError(redact(str(row["error"])))
                return row["result"]
            if "error" in row:
                raise ValueError(row["error"])

    try:
        initialized = call(1, "initialize", {"clientInfo": {"name": "harness-v2-readonly-probe", "version": "1"}, "capabilities": {"experimentalApi": True}})
        p.stdin.write('{"method":"initialized","params":{}}\n')
        p.stdin.flush()
        config = call(2, "config/read", {"cwd": str(root), "includeLayers": True})
        skills = call(3, "skills/list", {"cwds": [str(root)], "forceReload": True})
        c = config["config"]
        project_skills = []
        skill_errors = []
        for item in skills.get("data", []):
            for s in item.get("skills", []):
                # Only report this repository's entries, not user/plugin catalog.
                path = Path(s["path"])
                if path.is_relative_to(root):
                    project_skills.append({"name": s["name"], "path": path.relative_to(root).as_posix(), "enabled": s.get("enabled")})
            skill_errors.extend({"path": e.get("path"), "message": redact(e.get("message", ""))} for e in item.get("errors", []) if str(root) in e.get("path", ""))
        layers = []
        for layer in config.get("layers") or []:
            # Only path/source/disabled reason, no actual config values.
            source = layer.get("name", {})
            if root.name in json.dumps(source):
                layers.append({"name": source, "disabledReason": layer.get("disabledReason")})
        result = {"at": now(), "cwd": str(root), "client": initialized.get("userAgent"),
                  "strict_config": True, "model": c.get("model"),
                  "user_config": "isolated empty probe home; no credentials copied", "probe_home": str(probe_home),
                  "effort": c.get("model_reasoning_effort"), "agents": c.get("agents"),
                  "project_skills": project_skills, "skill_errors": skill_errors,
                  "project_layers": layers, "stderr_line_hashes": errors,
                  "marker": read_json(root / ".harness-v2.json") if (root / ".harness-v2.json").exists() else None}
        if result["marker"]:
            if c.get("model") != "gpt-6.1-sol" or c.get("agents", {}).get("default_subagent_model") != "gpt-6.1-sol":
                raise ValueError("effective model differs from v2")
            if {s["name"] for s in project_skills} != {"verify-change", "submit-work"} or not all(s["enabled"] is True for s in project_skills) or skill_errors:
                raise ValueError("v2 project skill resolution failed")
            if list((root / ".codex/skills").glob("*/SKILL.md")) or not (root / ".codex/agents/independent-reviewer.toml").exists():
                raise ValueError("legacy/v2 project assets mixed")
        return result
    finally:
        p.terminate()
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait(timeout=5)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = inspect(args.root)
    write_new(args.output, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))
