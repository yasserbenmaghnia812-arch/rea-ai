import hmac
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

SKILLS_ROOT = Path(os.getenv("REPLICA_SKILLS_ROOT", "/opt/replica-skill"))
WORKSPACE_ROOT = Path(os.getenv("WORKSPACE_ROOT", "/tmp/replica-workspace")).resolve()
WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)

UTILITIES = {
    "imgdiff": "replica-diff/imgdiff.py",
    "parity": "replica-diff/parity.py",
    "reviews": "replica-entrepreneur/reviews.py",
    "contrast": "replica-design/contrast.py",
    "sweep": "replica-brand/sweep.py",
    "listing": "replica-launch/listing.py",
}

mcp = FastMCP(
    "Replica MCP Server",
    stateless_http=True,
    streamable_http_path="/mcp",
    transport_security=TransportSecuritySettings(
        allowed_hosts=["replica-mcp-server-dfj0.onrender.com", "replica-mcp-server-dfj0.onrender.com:*"],
        allowed_origins=[],
    ),
)


def safe_path(relative_path: str) -> Path:
    candidate = (WORKSPACE_ROOT / relative_path).resolve()
    if candidate != WORKSPACE_ROOT and WORKSPACE_ROOT not in candidate.parents:
        raise ValueError("Path escapes the workspace.")
    return candidate


def skill_dirs() -> list[Path]:
    return sorted(p for p in SKILLS_ROOT.glob("replica-*") if p.is_dir() and (p / "SKILL.md").is_file())


def runtime_status() -> dict[str, Any]:
    skills = skill_dirs()
    missing = [name for name, rel in UTILITIES.items() if not (SKILLS_ROOT / rel).is_file()]
    return {
        "service": "replica-mcp",
        "transport": "streamable-http",
        "skills_root_exists": SKILLS_ROOT.is_dir(),
        "skills_count": len(skills),
        "utilities_available": len(UTILITIES) - len(missing),
        "missing_utilities": missing,
        "bearer_auth_configured": bool(os.getenv("MCP_BEARER_TOKEN")),
        "workspace_writable": os.access(WORKSPACE_ROOT, os.W_OK),
    }


@mcp.tool()
def replica_server_info() -> dict[str, Any]:
    """Return server version, enabled transports, skill count, utility status, and workspace status."""
    return {"name": "Replica MCP Server", "version": "1.1.0", **runtime_status(),
            "tools": ["replica_server_info", "replica_list_skills", "replica_get_skill",
                      "replica_list_utilities", "workspace_list", "workspace_read",
                      "workspace_write", "workspace_mkdir", "workspace_stat",
                      "workspace_run", "replica_run_utility"]}


@mcp.tool()
def replica_list_skills() -> list[dict[str, str]]:
    """List all installed Replica skills and their short descriptions."""
    result = []
    for folder in skill_dirs():
        content = (folder / "SKILL.md").read_text(encoding="utf-8")
        description = next((line.split(":", 1)[1].strip().strip(">").strip()
                            for line in content.splitlines()
                            if line.lower().startswith("description:")), "")
        result.append({"name": folder.name, "description": description or folder.name})
    return result


@mcp.tool()
def replica_get_skill(skill_name: str) -> str:
    """Load the full instructions for one installed Replica skill."""
    if not re.fullmatch(r"replica-[a-z-]+", skill_name):
        raise ValueError("Invalid skill name.")
    skill_file = SKILLS_ROOT / skill_name / "SKILL.md"
    if not skill_file.is_file():
        raise ValueError(f"Skill not found: {skill_name}")
    return skill_file.read_text(encoding="utf-8")


@mcp.tool()
def replica_list_utilities() -> list[dict[str, str]]:
    """List bundled Replica validation utilities and whether each script is installed."""
    return [{"name": name, "path": rel, "available": (SKILLS_ROOT / rel).is_file()}
            for name, rel in UTILITIES.items()]


@mcp.tool()
def workspace_list(path: str = ".", max_entries: int = 200) -> list[dict[str, Any]]:
    """List files and directories in the isolated project workspace."""
    target = safe_path(path)
    if not target.exists() or not target.is_dir():
        raise ValueError("Directory does not exist.")
    rows = []
    for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))[:max(1, min(max_entries, 500))]:
        rows.append({"name": item.name, "path": str(item.relative_to(WORKSPACE_ROOT)),
                     "type": "directory" if item.is_dir() else "file",
                     "size": item.stat().st_size if item.is_file() else None})
    return rows


@mcp.tool()
def workspace_read(path: str, max_chars: int = 50000) -> str:
    """Read a UTF-8 text file from the project workspace."""
    target = safe_path(path)
    if not target.is_file():
        raise ValueError("File does not exist.")
    data = target.read_text(encoding="utf-8")
    limit = max(1, min(max_chars, 200000))
    return data[:limit] + ("\\n[TRUNCATED]" if len(data) > limit else "")


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
def workspace_stat(path: str = ".") -> dict[str, Any]:
    """Return file or directory metadata without reading file contents."""
    target = safe_path(path)
    if not target.exists():
        raise ValueError("Path does not exist.")
    stat = target.stat()
    return {"path": str(target.relative_to(WORKSPACE_ROOT)), "type": "directory" if target.is_dir() else "file",
            "size": stat.st_size, "modified_at": stat.st_mtime}


@mcp.tool()
def workspace_run(command: list[str], cwd: str = ".", timeout_seconds: int = 60) -> dict[str, Any]:
    """Run an allowlisted non-interactive project command without a shell, inside the workspace."""
    if not command or len(command) > 40:
        raise ValueError("Provide a command array with 1 to 40 items.")
    allowed = {"python", "python3", "pytest", "npm", "npx", "node", "git", "ruff", "tsc", "vite", "next", "uv", "pip"}
    if Path(command[0]).name not in allowed:
        raise ValueError(f"Command is not allowed: {command[0]}")
    directory = safe_path(cwd)
    if not directory.is_dir():
        raise ValueError("Working directory does not exist.")
    timeout = max(1, min(int(timeout_seconds), 120))
    try:
        completed = subprocess.run(command, cwd=directory, capture_output=True, text=True,
                                   timeout=timeout, check=False,
                                   env={**os.environ, "CI": "1", "NO_COLOR": "1"})
        return {"exit_code": completed.returncode, "stdout": completed.stdout[-30000:],
                "stderr": completed.stderr[-30000:], "cwd": str(directory.relative_to(WORKSPACE_ROOT))}
    except subprocess.TimeoutExpired as exc:
        return {"exit_code": 124, "stdout": (exc.stdout or "")[-30000:],
                "stderr": ((exc.stderr or "") + "\\nCommand timed out.")[-30000:],
                "cwd": str(directory.relative_to(WORKSPACE_ROOT))}


@mcp.tool()
def replica_run_utility(utility: str, arguments: list[str], cwd: str = ".") -> dict[str, Any]:
    """Run one bundled Replica utility against files in the workspace."""
    if utility not in UTILITIES:
        raise ValueError("Unknown Replica utility. Use replica_list_utilities.")
    directory = safe_path(cwd)
    script = SKILLS_ROOT / UTILITIES[utility]
    if not script.is_file():
        raise ValueError(f"Bundled utility is missing: {utility}")
    completed = subprocess.run(["python3", str(script), *arguments], cwd=directory,
                               capture_output=True, text=True, timeout=60, check=False,
                               env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
    return {"exit_code": completed.returncode, "stdout": completed.stdout[-20000:],
            "stderr": completed.stderr[-20000:]}


class AuthAndHealth:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path in {"/", "/health"}:
                status = runtime_status()
                ok = status["skills_root_exists"] and status["skills_count"] > 0 and status["bearer_auth_configured"]
                payload = {"ok": ok, **status}
                body = json.dumps(payload).encode()
                code = 200 if (path == "/" or ok) else 503
                await send({"type": "http.response.start", "status": code,
                            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
                await send({"type": "http.response.body", "body": body})
                return
            if path != "/mcp":
                body = b'{"error":"Not found","endpoints":["/health","/mcp"]}'
                await send({"type": "http.response.start", "status": 404,
                            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
                await send({"type": "http.response.body", "body": body})
                return
            headers = {k.lower(): v.decode() for k, v in scope.get("headers", [])}
            token = os.getenv("MCP_BEARER_TOKEN", "")
            supplied = headers.get("authorization", "")
            expected = f"Bearer {token}" if token else ""
            if not token or not hmac.compare_digest(supplied, expected):
                body = b'{"error":"Unauthorized"}'
                await send({"type": "http.response.start", "status": 401,
                            "headers": [(b"content-type", b"application/json"),
                                        (b"content-length", str(len(body)).encode()),
                                        (b"www-authenticate", b"Bearer")]})
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "streamable-http").lower()
    if transport == "stdio":
        mcp.run(transport="stdio")
    elif transport in {"streamable-http", "http"}:
        import uvicorn
        port = int(os.getenv("PORT", "10000"))
        app = AuthAndHealth(mcp.streamable_http_app())
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
    else:
        raise SystemExit("MCP_TRANSPORT must be stdio or streamable-http.")
