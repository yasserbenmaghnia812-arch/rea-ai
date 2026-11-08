# Replica MCP Server

A portable MCP server exposing the skills from [Jakeschincariol/replica-skill](https://github.com/Jakeschincariol/replica-skill), plus scoped workspace tools.

## Compatibility

The server supports standard MCP **Streamable HTTP** for remote clients and **stdio** for local desktop clients. This supports clients that implement these MCP transports; it cannot make an app without MCP-client support compatible automatically.

| Client | Connection |
|---|---|
| Claude Desktop / Claude web custom connector | Remote Streamable HTTP |
| ChatGPT MCP connectors, where available | Remote Streamable HTTP; use the authentication method offered by that connector |
| Cursor, VS Code MCP extensions, Cline, Windsurf | Remote HTTP if supported by that version, otherwise local stdio |
| Other MCP clients | Streamable HTTP or stdio, depending on client support |
| Gemini mobile app | Not a native MCP client in every app/version; use an MCP-capable host or bridge |

## Endpoints

- `GET /health` — health check (no authentication).
- `/mcp` — MCP Streamable HTTP endpoint (Bearer token required).

## MCP tools

- `replica_list_skills`, `replica_get_skill`
- `workspace_list`, `workspace_read`, `workspace_write`, `workspace_mkdir`
- `workspace_run` — allowlisted, non-shell project commands, max 120 seconds.
- `replica_run_utility` — bundled image-diff, parity, review, contrast, brand-sweep, and store-listing utilities.

The connected AI client loads a skill's instructions, inspects the workspace, and uses workspace tools to carry out the workflow. The server does not embed an AI model or provide API keys.

## Remote deployment on Render

The root `render.yaml` defines a free Docker web service. Render generates `MCP_BEARER_TOKEN` during provisioning.

- Remote URL: `https://YOUR-SERVICE.onrender.com/mcp`
- HTTP header: `Authorization: Bearer YOUR_MCP_BEARER_TOKEN`

Copy the generated token from the Render service's Environment page. Never publish it in a repository or chat. Each client must support the transport and authentication configuration; some clients require OAuth and may not accept a static bearer header.

Free Render services spin down after inactivity and have ephemeral filesystems. The workspace is temporary and can be lost on restart/redeploy.

## Local stdio connection

For clients that launch MCP servers locally, install the requirements and clone the Replica skills repository. Configure the client to launch:

```json
{
  "mcpServers": {
    "replica": {
      "command": "python",
      "args": ["/absolute/path/to/replica-mcp/server.py"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "REPLICA_SKILLS_ROOT": "/absolute/path/to/replica-skill",
        "WORKSPACE_ROOT": "/absolute/path/to/replica-workspace"
      }
    }
  }
}
```

Install dependencies in that environment with `pip install -r requirements.txt`. Replace the example paths with real local paths. Stdio is intended for a locally launched process; do not expose it as a network service.

## Security boundary

The remote endpoint requires a bearer token. Workspace paths are constrained to the workspace root. Commands are passed as argument arrays without a shell and are limited to an allowlist. This is still an execution service: keep the token private and connect only trusted clients.