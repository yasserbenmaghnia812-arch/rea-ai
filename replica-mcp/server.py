import hmac
import base64
import hashlib
import secrets
import time
from urllib.parse import parse_qs, parse_qsl, urlencode, urlsplit, urlunsplit
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


# OAuth 2.1 authorization server (single-instance, in-memory grants/clients).
OAUTH_CLIENTS: dict[str, dict[str, Any]] = {}
OAUTH_LOGIN_TX: dict[str, dict[str, Any]] = {}
OAUTH_CODES: dict[str, dict[str, Any]] = {}
OAUTH_ACCESS: dict[str, float] = {}
OAUTH_REFRESH: dict[str, dict[str, Any]] = {}
OAUTH_ISSUER = os.getenv("PUBLIC_BASE_URL", "https://replica-mcp-server-dfj0.onrender.com").rstrip("/")
OAUTH_RESOURCE = OAUTH_ISSUER + "/mcp"


def _json_response(payload: dict[str, Any], status: int = 200) -> tuple[int, bytes, list[tuple[bytes, bytes]]]:
    body = json.dumps(payload, separators=(",", ":")).encode()
    return status, body, [(b"content-type", b"application/json; charset=utf-8"),
                          (b"content-length", str(len(body)).encode()),
                          (b"cache-control", b"no-store")]


def _valid_redirect(uri: str) -> bool:
    try:
        p = urlsplit(uri)
        return (p.scheme == "https" and bool(p.netloc) and not p.fragment) or (
            p.scheme == "http" and p.hostname in {"localhost", "127.0.0.1", "::1"} and not p.fragment
        )
    except Exception:
        return False


async def _read_request_body(receive, limit: int = 65536) -> bytes:
    chunks = bytearray()
    while True:
        message = await receive()
        if message["type"] != "http.request":
            continue
        chunks.extend(message.get("body", b""))
        if len(chunks) > limit:
            raise ValueError("Request body too large")
        if not message.get("more_body", False):
            return bytes(chunks)

class AuthAndHealth:
    def __init__(self, app):
        self.app = app

    async def _send(self, send, status: int, body: bytes, headers=None):
        hs = list(headers or [])
        hs.extend([(b"content-length", str(len(body)).encode()),
                   (b"x-content-type-options", b"nosniff"),
                   (b"referrer-policy", b"no-referrer")])
        await send({"type": "http.response.start", "status": status, "headers": hs})
        await send({"type": "http.response.body", "body": body})

    async def _json(self, send, payload, status=200):
        code, body, headers = _json_response(payload, status)
        await self._send(send, code, body, headers)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        method = scope.get("method", "GET").upper()
        headers = {k.lower(): v.decode("latin1") for k, v in scope.get("headers", [])}
        query = parse_qs(scope.get("query_string", b"").decode(), keep_blank_values=True)
        origin = OAUTH_ISSUER

        if path in {"/.well-known/oauth-authorization-server",
                    "/.well-known/openid-configuration"} and method == "GET":
            await self._json(send, {
                "issuer": origin,
                "authorization_endpoint": origin + "/authorize",
                "token_endpoint": origin + "/token",
                "registration_endpoint": origin + "/register",
                "response_types_supported": ["code"],
                "response_modes_supported": ["query"],
                "grant_types_supported": ["authorization_code", "refresh_token"],
                "code_challenge_methods_supported": ["S256"],
                "token_endpoint_auth_methods_supported": ["none"],
                "scopes_supported": ["mcp"],
                "client_id_metadata_document_supported": False,
            })
            return

        if path in {"/.well-known/oauth-protected-resource",
                    "/.well-known/oauth-protected-resource/mcp"} and method == "GET":
            await self._json(send, {
                "resource": OAUTH_RESOURCE,
                "authorization_servers": [origin],
                "bearer_methods_supported": ["header"],
                "scopes_supported": ["mcp"],
            })
            return

        if path == "/register" and method == "POST":
            try:
                data = json.loads(await _read_request_body(receive))
                redirects = data.get("redirect_uris")
                if not isinstance(redirects, list) or not redirects or not all(
                    isinstance(x, str) and _valid_redirect(x) for x in redirects
                ):
                    raise ValueError("redirect_uris must contain valid HTTPS or localhost callback URLs")
                if data.get("token_endpoint_auth_method", "none") != "none":
                    raise ValueError("Only public clients using token_endpoint_auth_method=none are supported")
                client_id = secrets.token_urlsafe(24)
                OAUTH_CLIENTS[client_id] = {
                    "client_id": client_id,
                    "client_name": str(data.get("client_name", "MCP client"))[:120],
                    "redirect_uris": redirects,
                    "created_at": time.time(),
                }
                await self._json(send, {
                    "client_id": client_id,
                    "client_id_issued_at": int(time.time()),
                    "token_endpoint_auth_method": "none",
                    "grant_types": ["authorization_code", "refresh_token"],
                    "response_types": ["code"],
                    "redirect_uris": redirects,
                    "scope": "mcp",
                }, 201)
            except Exception as exc:
                await self._json(send, {"error": "invalid_client_metadata", "error_description": str(exc)}, 400)
            return

        if path == "/authorize" and method == "GET":
            p = {k: (v[0] if v else "") for k, v in query.items()}
            client = OAUTH_CLIENTS.get(p.get("client_id", ""))
            if (not client or p.get("redirect_uri") not in client["redirect_uris"]
                    or p.get("response_type") != "code"
                    or p.get("code_challenge_method") != "S256"
                    or not p.get("code_challenge") or len(p["code_challenge"]) > 256):
                await self._json(send, {"error": "invalid_request"}, 400)
                return
            tx = secrets.token_urlsafe(32)
            OAUTH_LOGIN_TX[tx] = {"params": p, "created_at": time.time()}
            html = ("<!doctype html><html lang='en'><meta charset='utf-8'>"
                    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                    "<title>Replica MCP sign in</title>"
                    "<style>body{font:16px system-ui;background:#f4f5f7;display:grid;place-items:center;min-height:95vh}"
                    "main{background:white;padding:28px;border-radius:14px;width:min(90%,360px);box-shadow:0 8px 30px #0001}"
                    "input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:12px;border:1px solid #bbb;border-radius:8px}"
                    "button{background:#111;color:white;font-weight:600}</style><main>"
                    "<h2>Replica MCP</h2><p>Sign in to authorize this client.</p>"
                    "<form method='post' action='/authorize'>"
                    f"<input type='hidden' name='tx' value='{tx}'>"
                    "<label>Administrator password</label><input type='password' name='password' required autofocus>"
                    "<button type='submit'>Sign in and authorize</button></form></main></html>").encode()
            await self._send(send, 200, html, [
                (b"content-type", b"text/html; charset=utf-8"),
                (b"cache-control", b"no-store"),
            ])
            return

        if path == "/authorize" and method == "POST":
            try:
                form = dict(parse_qsl((await _read_request_body(receive)).decode(), keep_blank_values=True))
                tx_id = form.get("tx", "")
                tx = OAUTH_LOGIN_TX.get(tx_id)
                if not tx or time.time() - tx.get("created_at", 0) > 600:
                    OAUTH_LOGIN_TX.pop(tx_id, None)
                    raise ValueError("Login session expired; restart authorization")
                password = os.getenv("MCP_ADMIN_PASSWORD", "")
                if not password or not hmac.compare_digest(form.get("password", ""), password):
                    raise ValueError("Invalid administrator password")
                OAUTH_LOGIN_TX.pop(tx_id, None)
                p = tx["params"]
                code = secrets.token_urlsafe(32)
                OAUTH_CODES[code] = {
                    "client_id": p["client_id"],
                    "redirect_uri": p["redirect_uri"],
                    "challenge": p["code_challenge"],
                    "state": p.get("state", ""),
                    "expires_at": time.time() + 300,
                }
                redirect = p["redirect_uri"] + ("&" if "?" in p["redirect_uri"] else "?")
                redirect += urlencode({"code": code, **({"state": p["state"]} if p.get("state") else {})})
                await self._send(send, 302, b"", [
                    (b"location", redirect.encode()),
                    (b"cache-control", b"no-store"),
                ])
            except Exception as exc:
                body = ("<!doctype html><html><meta charset='utf-8'><h3>Sign-in failed</h3><p>"
                        + str(exc).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                        + "</p><p>Return to Claude and restart the connection.</p></html>").encode()
                await self._send(send, 400, body, [(b"content-type", b"text/html; charset=utf-8")])
            return

        if path == "/token" and method == "POST":
            try:
                form = dict(parse_qsl((await _read_request_body(receive)).decode(), keep_blank_values=True))
                grant = form.get("grant_type", "")
                if grant == "authorization_code":
                    code_data = OAUTH_CODES.pop(form.get("code", ""), None)
                    client_id = form.get("client_id", "")
                    if (not code_data or code_data["expires_at"] < time.time()
                            or code_data["client_id"] != client_id
                            or code_data["redirect_uri"] != form.get("redirect_uri")):
                        raise ValueError("Invalid or expired authorization code")
                    verifier = form.get("code_verifier", "")
                    if not (43 <= len(verifier) <= 128):
                        raise ValueError("Invalid PKCE verifier")
                    digest = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
                    if not hmac.compare_digest(digest, code_data["challenge"]):
                        raise ValueError("PKCE verification failed")
                elif grant == "refresh_token":
                    refresh = OAUTH_REFRESH.pop(form.get("refresh_token", ""), None)
                    client_id = form.get("client_id", "")
                    if not refresh or refresh["expires_at"] < time.time() or refresh["client_id"] != client_id:
                        raise ValueError("Invalid refresh token")
                else:
                    await self._json(send, {"error": "unsupported_grant_type"}, 400)
                    return
                access = secrets.token_urlsafe(40)
                refresh_token = secrets.token_urlsafe(40)
                OAUTH_ACCESS[access] = time.time() + 3600
                OAUTH_REFRESH[refresh_token] = {"client_id": client_id, "expires_at": time.time() + 30 * 86400}
                await self._json(send, {
                    "access_token": access,
                    "token_type": "Bearer",
                    "expires_in": 3600,
                    "refresh_token": refresh_token,
                    "scope": "mcp",
                })
            except Exception as exc:
                await self._json(send, {"error": "invalid_grant", "error_description": str(exc)}, 400)
            return

        if path in {"/", "/health"} and method == "GET":
            status = runtime_status()
            status.update({"ok": status["skills_root_exists"] and status["skills_count"] > 0
                           and True, "oauth": False})
            await self._json(send, status, 200 if status["ok"] else 503)
            return

        if path != "/mcp":
            await self._json(send, {"error": "Not found"}, 404)
            return

        # Require a server-side bearer token for every MCP request. OAuth access
        # tokens issued above are also accepted; the static token is for trusted
        # service-to-service clients such as the Yasser Security Lab API.
        bearer = headers.get("authorization", "")
        configured_token = os.getenv("MCP_BEARER_TOKEN", "")
        static_ok = bool(configured_token) and hmac.compare_digest(
            bearer, "Bearer " + configured_token
        )
        oauth_token = bearer[7:] if bearer.startswith("Bearer ") else ""
        oauth_ok = bool(oauth_token) and OAUTH_ACCESS.get(oauth_token, 0) > time.time()
        if not (static_ok or oauth_ok):
            status_code = 503 if not configured_token else 401
            message = "MCP_BEARER_TOKEN is not configured." if status_code == 503 else "A valid Bearer token is required."
            await self._json(send, {"error": message}, status_code)
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