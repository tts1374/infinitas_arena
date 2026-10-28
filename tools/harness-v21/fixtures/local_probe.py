"""Owned loopback DO process-restart probe; raw runtime output is discarded.

Exactly three planned process starts, no retries. A failed start/probe stops all
remaining phases. Uses only synthetic presets, isolated profile and persistence.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def available_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def discard(pipe):
    try:
        while pipe.read(65536):
            pass
    finally:
        pipe.close()


def request(port, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request("http://127.0.0.1:" + str(port) + path, data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=3) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as exc:
        return exc.code, json.load(exc)


def stop(process, threads):
    if process.poll() is None:
        if os.name == "nt":
            # Only the identity returned by our still-running Popen and its tree.
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        else:
            import signal
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=20)
    for thread in threads:
        thread.join(timeout=10)
    return process.poll() is not None and not any(thread.is_alive() for thread in threads)


def main():
    # Initial runtime failed. Never create a new UUID to bypass that stop.
    # The preserved implementation below is reference for a separately reviewed
    # revision, not an executable retry path in this revision.
    print('{"check":"local-do-restart","status":"BLOCKED","reason":"PRIOR_RUNTIME_FAILURE_HOLD","starts":0,"processes_stopped":true}')
    return 2


def _held_reference():
    run_id = uuid.uuid4().hex
    owned = ROOT / ".tmp" / ("harness-v21-local-do-" + run_id)
    owned.mkdir(parents=True, exist_ok=False)
    profile = owned / "profile"
    profile.mkdir()
    (profile / "appdata").mkdir()
    (profile / "temp").mkdir()
    env = {key: os.environ[key] for key in ("PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT") if key in os.environ}
    env.update({"HOME": str(profile), "USERPROFILE": str(profile), "APPDATA": str(profile / "appdata"),
                "LOCALAPPDATA": str(profile / "appdata"), "TEMP": str(profile / "temp"), "TMP": str(profile / "temp"),
                "WRANGLER_SEND_METRICS": "false", "CI": "true", "BROWSER": "none", "WRANGLER_LOG": "none",
                "WRANGLER_LOG_PATH": str(owned / "discard.log"),
                "NODE_OPTIONS": '--require="' + (HERE / "discard-runtime-log.cjs").as_posix() + '"'})
    node = shutil.which("node")
    result = {"check": "local-do-restart", "status": "BLOCKED", "starts": 0, "checks": 0,
              "processes_stopped": True, "runtime_output": "discarded-before-model-and-recording",
              "hibernation": "unproven", "retry_count": 0, "reason": "PRECONDITION",
              "runtime_exit_codes": []}
    expected = {}
    tick = time.monotonic()
    try:
        if not node:
            raise ValueError()
        # Resolve a version-manager shim while its normal configuration is still
        # available, then run the real binary under our empty private profile.
        resolved = subprocess.run([node, "-p", "process.execPath"], capture_output=True, timeout=10)
        executable = Path(resolved.stdout.decode("utf-8").strip())
        if resolved.returncode != 0 or not executable.is_absolute() or not executable.is_file() or executable.name.lower() not in {"node", "node.exe"}:
            raise ValueError()
        node = str(executable)
        # Negative control for Wrangler's private debug-log sink, before any
        # runtime start. The synthetic value must never become a file or output.
        sink_check = """const fs=require('node:fs');const p=process.env.WRANGLER_LOG_PATH;
        (async()=>{await require('node:fs/promises').appendFile(p,'synthetic-private-value');
        fs.appendFileSync(p,'synthetic-private-value');
        await new Promise((ok,no)=>fs.appendFile(p,'synthetic-private-value',e=>e?no(e):ok()));
        process.exitCode=fs.existsSync(p)?2:0;})().catch(()=>{process.exitCode=2});"""
        preflight = subprocess.run([node, "-e", sink_check], env=env, cwd=owned,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        if preflight.returncode != 0 or (owned / "discard.log").exists():
            result["preflight_exit_code"] = preflight.returncode
            result["reason"] = "RUNTIME_LOG_SINK_FAILED"
            raise ValueError()
        for phase in range(3):
            port, inspector = available_port(), available_port()
            if port == inspector:
                raise ValueError()
            argv = [node, str(ROOT / "node_modules/wrangler/bin/wrangler.js"), "dev", "--local",
                    "--config", str(HERE / "wrangler.jsonc"), "--ip", "127.0.0.1", "--port", str(port),
                    "--inspector-port", str(inspector), "--persist-to", str(owned / "state"),
                    "--show-interactive-dev-session=false", "--var", "OWNER_NONCE:" + run_id]
            process = subprocess.Popen(argv, cwd=owned, env=env, stdin=subprocess.DEVNULL,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       start_new_session=os.name != "nt")
            result["starts"] += 1
            threads = [threading.Thread(target=discard, args=(pipe,), daemon=True) for pipe in (process.stdout, process.stderr)]
            for thread in threads:
                thread.start()
            try:
                ready = False
                deadline = time.monotonic() + 45
                while process.poll() is None and time.monotonic() < deadline:
                    try:
                        code, health = request(port, "/health")
                        ready = code == 200 and health == {"owner": run_id}
                        if ready:
                            break
                    except (OSError, ValueError):
                        pass
                    time.sleep(0.1)
                if not ready:
                    result["reason"] = "RUNTIME_START_FAILED"
                    raise ValueError()
                if phase == 0:
                    for kind in ("scalar", "map", "corrupt"):
                        code, body = request(port, "/" + kind + "/admin/seed/" + kind, {})
                        if code != 200 or body != {"seeded": True}:
                            raise ValueError()
                        code, inspection = request(port, "/" + kind + "/admin/inspect")
                        if code != 200:
                            raise ValueError()
                        expected[kind] = inspection
                        result["checks"] += 1
                else:
                    for kind in ("scalar", "map"):
                        code, listing = request(port, "/" + kind + "/internal/list")
                        if code != 200 or len(listing.get("rooms", [])) != 1:
                            raise ValueError()
                        if phase == 1:
                            room = listing["rooms"][0]
                            if request(port, "/" + kind + "/internal/upsert", room)[0] != 200:
                                raise ValueError()
                            _, updated = request(port, "/" + kind + "/admin/inspect")
                            high = expected[kind]["counter"]
                            if not isinstance(high, int):
                                high = max(high.values())
                            if not isinstance(updated["counter"], int) or updated["counter"] <= high:
                                raise ValueError()
                            expected[kind] = updated
                        else:
                            _, restored = request(port, "/" + kind + "/admin/inspect")
                            if restored["hash"] != expected[kind]["hash"]:
                                raise ValueError()
                        result["checks"] += 1
                    for path, body in (("list", None), ("upsert", {}), ("remove", {"roomId": "r"})):
                        code, value = request(port, "/corrupt/internal/" + path, body)
                        if code != 503 or value != {"error": "CORRUPT_STATE"}:
                            raise ValueError()
                        result["checks"] += 1
                    _, inspection = request(port, "/corrupt/admin/inspect")
                    if inspection["hash"] != expected["corrupt"]["hash"] or inspection["writes"] != 0:
                        raise ValueError()
                    result["checks"] += 1
            finally:
                result["processes_stopped"] = stop(process, threads) and result["processes_stopped"]
                result["runtime_exit_codes"].append(process.returncode)
            if not result["processes_stopped"]:
                result["reason"] = "PROCESS_CLEANUP_FAILED"
                raise ValueError()
        if (owned / "discard.log").exists():
            result["reason"] = "RUNTIME_LOG_SINK_FAILED"
            raise ValueError()
        result["status"], result["reason"] = "PASS", "NONE"
        result["corrupt_storage_sha256"] = expected["corrupt"]["hash"]
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        if result["reason"] == "PRECONDITION":
            result["reason"] = "PROBE_FAILED"
    result["elapsed_seconds"] = round(time.monotonic() - tick, 3)
    result["fixture_sha256"] = hashlib.sha256((HERE / "lobby-directory.ts").read_bytes()).hexdigest()
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "PASS" and result["processes_stopped"] else 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # Raw error detail may contain runtime text; never forward it.
        print('{"check":"local-do-restart","status":"BLOCKED","reason":"PROBE_INTERNAL_FAILURE"}')
        sys.exit(2)
