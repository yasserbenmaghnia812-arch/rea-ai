import json
import os
import re
import shlex
import subprocess
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

SKILLS_ROOT = Path(os.getenv("REPLICA_SKILLS_ROOT", "/opt/replica-skill"))
WORKSPACE_ROOT = Path(os.getenv("WORKSPACE_ROOT", "/tmp/replica-workspace")).resolve()
WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)

mcp = FastMCP("Replica MCP Server", stateless_http=True)


def safe_path(relative_path: str) -> Path:
    candidate = (WORKSPACE_ROOT / relative_path).resolve()
    if candidate != WORKSPACE_ROOT and WORKSPACE_ROOT not in candidate.parents:
        raise ValueError("Path escapes the workspace.")
    return candidate


def skill_dirs() -> list[Path]:
    return sorted(p for p in SKILLS_ROOT.glob("replica-*") if p.is_dir() and (p / "SKILL.md").is_file())


@mcp.tool()
def replica_list_skills() -> list[dict[str, str]]:
    """List the 11 installed Replica skills and their short descriptions."""
    result = []
    for folder in skill_dirs():
        text = (folder / "SKILL.md").read_text(encoding="utf-8")
        description = ""
        for line in text.splitlines():
            if line.lower().startswith("description:"):
                description = line.split(":", 1)[1].strip().strip(">").strip()
                break
        result.append({"name": folder.name, "description": description or folder.name})
    return result


@mcp.tool()
def replica_get_skill(skill_name: str) -> str:
    """Load the full instructions for one Replica skill. Use before performing that workflow."""
    if not re.fullmatch(r"replica-[a-z-]+", skill_name):
        raise ValueError("Invalid skill name.")
    skill_file = SKILLS_ROOT / skill_name / "SKILL.md"
    if not skill_file.is_file():
        raise ValueError(f"Skill not found: {skill_name}")
    return skill_file.read_text(encoding="utf-8")


@mcp.tool()
def workspace_list(path: str = ".", max_entries: int = 200) -> list[dict[str, Any]]:
    """List files and directories in the isolated project workspace."""
    target = safe_path(path)
    if not target.exists() or not target.is_dir():
        raise ValueError("Directory does not exist.")
    rows = []
    for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))[:max(1, min(max_entries, 500))]:
        rows.append({"name": item.name, "path": str(item.relative_to(WORKSPACE_ROOT)), "type": "directory" if item.is_dir() else "file", "size": item.stat().st_size if item.is_file() else None})
    return rows


@mcp.tool()
def workspace_read(path: str, max_chars: int = 50000) -> str:
    """Read a UTF-8 text file from the project workspace."""
    target = safe_path(path)
    if not target.is_file():
        raise ValueError("File does not exist.")
    data = target.read_text(encoding="utf-8")
    limit = max(1, min(max_chars, 200000))
    return data[:limit] + ("\n[TRUNCATED]" if len(data) > limit else "")


@mcp.tool()
def workspace_write(path: str, content: str) -> dict[str, Any]:
    """Create or replace a UTF-8 text file in the project workspace."""
    if len(content) > 1_000_000:
        raise ValueError("Content exceeds the 1 MB limit.")
    target = safe_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"written": str(target.relative_to(WORKSPACE_ROOT)), "bytes": target.stat().st_size}


@mcp.tool()
def workspace_mkdir(path: str) -> dict[str, str]:
    """Create a directory inside the project workspace."""
    target = safe_path(path)
    target.mkdir(parents=True, exist_ok=True)
    return {"created": str(target.relative_to(WORKSPACE_ROOT))}


@mcp.tool()
def workspace_run(command: list[str], cwd: str = ".", timeout_seconds: int = 60) -> dict[str, Any]:
    """Run a non-interactive project command without a shell, inside the isolated workspace."""
    if not command or len(command) > 40:
        raise ValueError("Provide a command array with 1 to 40 items.")
    allowed = {"python", "python3", "pytest", "npm", "npx", "node", "git", "ruff", "tsc", "vite", "next", "uv", "pip"}
    if Path(command[0]).name not in allowed:
        raise ValueError(f"Command is not allowed: {command[0]}")
    directory = safe_path(cwd)
    if not directory.is_dir():
        raise ValueError("Working directory does not exist.")
    timeout = max(1, min(int(timeout_seconds), 120))
    completed = subprocess.run(
        command,
        cwd=directory,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        env={**os.environ, "CI": "1", "NO_COLOR": "1"},
    )
    return {
        "exit_code": completed.returncode,
        "stdout": completed.stdout[-30000:],
        "stderr": completed.stderr[-30000:],
        "cwd": str(directory.relative_to(WORKSPACE_ROOT)),
    }


@mcp.tool()
def replica_run_utility(utility: str, arguments: list[str], cwd: str = ".") -> dict[str, Any]:
    """Run one of Replica's bundled validation utilities against workspace files."""
    utilities = {
        "imgdiff": "replica-diff/imgdiff.py",
        "parity": "replica-diff/parity.py",
        "reviews": "replica-entrepreneur/reviews.py",
        "contrast": "replica-design/contrast.py",
        "sweep": "replica-brand/sweep.py",
        "listing": "replica-launch/listing.py",
    }
    if utility not in utilities:
        raise ValueError("Unknown Replica utility.")
    directory = safe_path(cwd)
    script = SKILLS_ROOT / utilities[utility]
    if not script.is_file():
        raise ValueError("Bundled utility is missing.")
    completed = subprocess.run(
        ["python3", str(script), *arguments],
        cwd=directory,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
    )
    return {"exit_code": completed.returncode, "stdout": completed.stdout[-20000:], "stderr": completed.stderr[-20000:]}


class AuthAndHealth:
    def __init__(self, app):
        self.app = app
        self.token = os.getenv("MCP_BEARER_TOKEN", "")

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path == "/health":
                body = json.dumps({"ok": True, "service": "replica-mcp", "transport": "streamable-http"}).encode()
                await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
                await send({"type": "http.response.body", "body": body})
                return
            if path != "/mcp":
                body = b'{"error":"Not found"}'
                await send({"type": "http.response.start", "status": 404, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
                await send({"type": "http.response.body", "body": body})
                return
            headers = {k.lower(): v.decode() for k, v in scope.get("headers", [])}
            expected = f"Bearer {self.token}" if self.token else ""
            if not self.token or headers.get("authorization") != expected:
                body = b'{"error":"Unauthorized"}'
                await send({"type": "http.response.start", "status": 401, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()), (b"www-authenticate", b"Bearer")]})
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)


if __name__ == "__main__":
    import uvicorn

    os.environ.setdefault("MCP_BEARER_TOKEN", "")
    asgi_app = AuthAndHealth(mcp.streamable_http_app())
    uvicorn.run(asgi_app, host="0.0.0.0", port=int(os.getenv("PORT", "10000")), log_level="info")
