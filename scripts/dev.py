"""
Universal Webhook Adapter — Unified Development Server
======================================================
Run both the FastAPI backend and Vite frontend with one command:

    python scripts/dev.py

Features:
  - Checks .env exists, creates from .env.example if missing
  - Validates required ports (8000, 5173) are free
  - Starts uvicorn + vite in parallel
  - Merges colour-coded logs in a single terminal
  - Gracefully shuts down both on Ctrl+C
"""

import os
import shutil
import socket
import subprocess
import sys
import threading
import time

# ── Colour helpers ────────────────────────────────────────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
CYAN   = "\033[36m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
RED    = "\033[31m"
GRAY   = "\033[90m"
BLUE   = "\033[34m"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _banner():
    print(f"""
{BOLD}{CYAN}╔══════════════════════════════════════════════╗
║   ⚡ Universal Webhook Adapter — Dev Server  ║
╚══════════════════════════════════════════════╝{RESET}
""")


def _check_env():
    env_path     = os.path.join(ROOT, ".env")
    example_path = os.path.join(ROOT, ".env.example")
    if not os.path.exists(env_path):
        if os.path.exists(example_path):
            shutil.copy(example_path, env_path)
            print(f"{YELLOW}[dev] .env not found — created from .env.example.{RESET}")
            print(f"{YELLOW}[dev] ⚠  Set your GROQ_API_KEY in .env before continuing.{RESET}\n")
        else:
            print(f"{RED}[dev] Neither .env nor .env.example found. Please create .env manually.{RESET}")
            sys.exit(1)
    else:
        print(f"{GREEN}[dev] ✓ .env found{RESET}")


def _port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def _check_ports():
    for port, name in [(8000, "FastAPI"), (5173, "Vite")]:
        if not _port_free(port):
            print(f"{RED}[dev] Port {port} is already in use ({name}). "
                  f"Stop the conflicting process and retry.{RESET}")
            sys.exit(1)
    print(f"{GREEN}[dev] ✓ Ports 8000 and 5173 are free{RESET}")


def _stream(proc, prefix: str, colour: str):
    """Stream stdout + stderr from a subprocess with a coloured prefix."""
    for line in iter(proc.stdout.readline, b""):
        text = line.decode("utf-8", errors="replace").rstrip()
        if text:
            print(f"{colour}{BOLD}[{prefix}]{RESET} {text}")
    for line in iter(proc.stderr.readline, b""):
        text = line.decode("utf-8", errors="replace").rstrip()
        if text:
            print(f"{colour}{BOLD}[{prefix}]{RESET} {GRAY}{text}{RESET}")


def _run():
    _banner()
    _check_env()
    _check_ports()

    print(f"\n{BOLD}Starting servers…{RESET}\n")

    # ── FastAPI ───────────────────────────────────────────────────────────────
    backend_cmd = [
        sys.executable, "-m", "uvicorn",
        "app.main:app",
        "--reload",
        "--host", "127.0.0.1",
        "--port", "8000",
    ]
    backend = subprocess.Popen(
        backend_cmd,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # ── Vite ──────────────────────────────────────────────────────────────────
    frontend_dir = os.path.join(ROOT, "frontend")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    frontend = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=frontend_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # ── Log threads ───────────────────────────────────────────────────────────
    threads = [
        threading.Thread(target=_stream, args=(backend,  "backend",  BLUE),  daemon=True),
        threading.Thread(target=_stream, args=(frontend, "frontend", GREEN), daemon=True),
    ]
    for t in threads:
        t.start()

    time.sleep(1)
    print(f"""
{BOLD}─────────────────────────────────────────────{RESET}
  {GREEN}✓ Backend{RESET}   →  {CYAN}http://localhost:8000{RESET}
  {GREEN}✓ Frontend{RESET}  →  {CYAN}http://localhost:5173{RESET}
{BOLD}─────────────────────────────────────────────{RESET}
  Press {BOLD}Ctrl+C{RESET} to stop both servers.
""")

    try:
        backend.wait()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}[dev] Shutting down…{RESET}")
    finally:
        for proc in (backend, frontend):
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
        print(f"{GREEN}[dev] ✓ All servers stopped.{RESET}")


if __name__ == "__main__":
    _run()
