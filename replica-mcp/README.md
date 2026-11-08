# Replica MCP Server

A Streamable HTTP MCP server exposing the 11 skills from [Jakeschincariol/replica-skill](https://github.com/Jakeschincariol/replica-skill), plus scoped workspace tools.

## Endpoints

- `GET /health` — health check (no authentication).
- `/mcp` — MCP Streamable HTTP endpoint (Bearer token required).

## MCP tools

- `replica_list_skills`, `replica_get_skill`
- `workspace_list`, `workspace_read`, `workspace_write`, `workspace_mkdir`
- `workspace_run` — allowlisted, non-shell project commands, max 120 seconds.
- `replica_run_utility` — bundled Replica image-diff, parity, review, contrast, brand-sweep, and store-listing utilities.

The Claude agent loads a skill's instructions, inspects the workspace, and uses the workspace tools to carry out the workflow. The server does not embed an AI model or provide API keys.

## Deploy on Render

The root `render.yaml` defines a free Docker web service in Frankfurt. Render generates `MCP_BEARER_TOKEN` during provisioning.

Free Render services spin down after inactivity and have ephemeral filesystems. The workspace is therefore temporary and can be lost on restart/redeploy. Use external persistent storage before relying on this for long-running projects or important source files.

## Claude connection

After deployment, add the server as a custom MCP connector using:

- URL: `https://YOUR-SERVICE.onrender.com/mcp`
- Authorization: `Bearer YOUR_MCP_BEARER_TOKEN`

Copy the generated token from the Render service's Environment page. Never publish it in a repository or chat.

## Security boundary

The server requires a bearer token for MCP requests. Workspace paths are constrained to the workspace root. Commands are passed as argument arrays without a shell and are limited to an allowlist. This is still an execution service: use a private token and do not expose it to untrusted users.
