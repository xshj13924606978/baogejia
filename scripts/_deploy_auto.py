#!/usr/bin/env python3
"""Auto SSH deploy script using pty for password-based auth."""
import pty
import os
import sys
import time
import select

HOST = "xs-bj.com"
USER = "root"
PASSWORD = "YOUR_USER_PASSWORD"

# Deployment commands to run on the server
COMMANDS = [
    "cd /opt/quote-system",
    "echo '=== Step 1: Pull latest main ==='",
    "git fetch origin main",
    "git checkout -f main",
    "git reset --hard origin/main",
    "git log --oneline -1",
    "echo '=== Step 2: Docker rebuild ==='",
    "docker compose build --no-cache app",
    "docker compose up -d --no-deps app",
    "docker compose restart nginx",
    "echo '=== Step 3: Verify ==='",
    "sleep 5",
    "docker compose ps",
    "curl -so /dev/null -w 'HTTP %{http_code}' http://localhost:5000",
    "echo ''",
    "echo '=== DEPLOY COMPLETE ==='",
]


def main():
    pid, fd = pty.fork()
    if pid == 0:
        # Child: execute ssh
        env = os.environ.copy()
        env["TERM"] = "dumb"
        os.execvpe("ssh", [
            "ssh",
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "PreferredAuthentications=password",
            f"{USER}@{HOST}"
        ], env)
        sys.exit(1)

    # Parent: control the pty
    time.sleep(1)
    
    # Read initial output
    output = b""
    
    # First expect: password prompt
    deadline = time.time() + 30
    while time.time() < deadline:
        if select.select([fd], [], [], 0.5)[0]:
            try:
                chunk = os.read(fd, 4096)
                if not chunk:
                    break
                output += chunk
                print(chunk.decode("utf-8", errors="replace"), end="", flush=True)
                
                if b"assword:" in output or b"Password:" in output:
                    os.write(fd, (PASSWORD + "\n").encode())
                    time.sleep(2)
                    break
                if b"Permission denied" in output:
                    print("\n[AUTH FAILED] Permission denied")
                    os.close(fd)
                    sys.exit(1)
            except OSError:
                break
    else:
        print("\n[TIMEOUT] No password prompt received")
        os.close(fd)
        sys.exit(1)

    # Wait a moment for login to complete
    time.sleep(2)

    # Send all commands joined by && for reliability
    big_cmd = " && ".join(COMMANDS) + " && exit\n"
    
    # Read any pending login output first
    while True:
        if select.select([fd], [], [], 0.3)[0]:
            try:
                chunk = os.read(fd, 4096)
                if not chunk:
                    break
                print(chunk.decode("utf-8", errors="replace"), end="", flush=True)
            except OSError:
                break
        else:
            break
    
    # Send the deployment command
    print(f"\n[SENDING] Starting deployment...\n", flush=True)
    os.write(fd, big_cmd.encode())
    
    # Read all output until session closes
    total_output = b""
    deadline = time.time() + 600  # 10 minute timeout for docker build
    while time.time() < deadline:
        if select.select([fd], [], [], 1.0)[0]:
            try:
                chunk = os.read(fd, 4096)
                if not chunk:
                    break
                total_output += chunk
                print(chunk.decode("utf-8", errors="replace"), end="", flush=True)
            except OSError:
                break
    else:
        print("\n[TIMEOUT] Deployment took too long (>10 min)")

    os.close(fd)
    print("\n[DONE] Deployment finished!")


if __name__ == "__main__":
    main()
