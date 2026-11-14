import hmac
import os
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

ECC_ROOT = Path(os.getenv("ECC_ROOT", "/opt/ecc")).resolve()
ASSET_ROOTS = {
    "skills": ECC_ROOT / "skills",
    "agents": ECC_ROOT / "agents",
    "rules": ECC_ROOT / "rules",
    "commands": ECC_ROOT / "commands",
    "contexts": ECC_ROOT / "contexts",
}
HOSTNAME = os.getenv("RENDER_EXTERNAL_HOSTNAME", "ecc-mcp-server.onrender.com")
mcp = FastMCP(
    "ECC Skills MCP",
    stateless_http=True,
    streamable_http_path="/mcp",
    transport_security=TransportSecuritySettings(
        allowed_hosts=[HOSTNAME, HOSTNAME + ":*"],
        allowed_origins=[],
    ),
)


def _safe_asset(kind: str, relative_path: str) -> Path:
    if kind not in ASSET_ROOTS:
        raise ValueError("Unknown ECC category. Use skills, agents, rules, commands, or contexts.")
    root = ASSET_ROOTS[kind].resolve()
    candidate = (root / relative_path).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError("Path escapes the ECC category.")
    if not candidate.is_file():
        raise ValueError("ECC file not found.")
    if candidate.suffix.lower() not in {".md", ".yaml", ".yml", ".json", ".txt"}:
        raise ValueError("Only documentation and configuration text files can be read.")
    return candidate


def _entries(kind: str) -> list[Path]:
    root = ASSET_ROOTS[kind]
    if not root.is_dir():
        return []
    return sorted(
        (p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in {".md", ".yaml", ".yml", ".json", ".txt"}),
        key=lambda p: str(p.relative_to(root)).lower(),
    )


def _description(path: Path) -> str:
    try:
        for line in path.read_text(encoding="utf-8").splitlines()[:35]:
            clean = line.strip().lstrip("#").strip()
            if clean and not clean.startswith("---") and len(clean) > 12:
                return clean[:220]
    except OSError:
        pass
    return path.stem


@mcp.tool()
def ecc_server_info() -> dict[str, Any]:
    """Report the installed ECC repository revision source and indexed content counts."""
    return {
        "server": "ECC Skills MCP",
        "source": "https://github.com/affaan-m/ECC",
        "repository_available": ECC_ROOT.is_dir(),
        "categories": {kind: len(_entries(kind)) for kind in ASSET_ROOTS},
        "license_file": (ECC_ROOT / "LICENSE").is_file(),
        "mode": "read-only skill and agent catalog",
    }


@mcp.tool()
def ecc_list_assets(kind: str = "skills", query: str = "", limit: int = 50) -> list[dict[str, str]]:
    """List ECC skills, agents, rules, commands, or contexts with an optional text filter."""
    if kind not in ASSET_ROOTS:
        raise ValueError("kind must be skills, agents, rules, commands, or contexts.")
    needle = query.strip().lower()
    results = []
    for path in _entries(kind):
        relative = str(path.relative_to(ASSET_ROOTS[kind]))
        name = path.stem if path.name not in {"SKILL.md", "README.md"} else str(path.parent.relative_to(ASSET_ROOTS[kind]))
        description = _description(path)
        if needle and needle not in (relative + " " + description).lower():
            continue
        results.append({"name": name, "path": relative, "description": description})
        if len(results) >= max(1, min(limit, 100)):
            break
    return results


@mcp.tool()
def ecc_read_asset(kind: str, relative_path: str, max_chars: int = 30000) -> str:
    """Read one ECC instruction or configuration document; this tool never executes it."""
    path = _safe_asset(kind, relative_path)
    limit = max(1, min(max_chars, 100000))
    content = path.read_text(encoding="utf-8")
    return content[:limit] + ("\n[TRUNCATED]" if len(content) > limit else "")


class AuthAndHealth:
    def __init__(self, app):
        self.app = app

    async def _json(self, send, status: int, payload: dict[str, Any]):
        import json
        body = json.dumps(payload, separators=(",", ":")).encode()
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json; charset=utf-8"),
                (b"content-length", str(len(body)).encode()),
                (b"cache-control", b"no-store"),
                (b"x-content-type-options", b"nosniff"),
                (b"referrer-policy", b"no-referrer"),
            ],
        })
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        method = scope.get("method", "GET").upper()
        headers = {k.lower(): v.decode("latin1") for k, v in scope.get("headers", [])}
        if path in {"/", "/health"} and method == "GET":
            counts = {kind: len(_entries(kind)) for kind in ASSET_ROOTS}
            ok = ECC_ROOT.is_dir() and sum(counts.values()) > 0
            await self._json(send, 200 if ok else 503, {
                "ok": ok, "service": "ecc-mcp", "transport": "streamable-http",
                "categories": counts, "bearer_auth_configured": bool(os.getenv("MCP_BEARER_TOKEN")),
            })
            return
        if path != "/mcp":
            await self._json(send, 404, {"error": "Not found"})
            return
        token = os.getenv("MCP_BEARER_TOKEN", "")
        supplied = headers.get("authorization", "")
        if not token:
            await self._json(send, 503, {"error": "MCP_BEARER_TOKEN is not configured."})
            return
        if not hmac.compare_digest(supplied, "Bearer " + token):
            await self._json(send, 401, {"error": "A valid Bearer token is required."})
            return
        await self.app(scope, receive, send)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "10000"))
    app = AuthAndHealth(mcp.streamable_http_app())
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
