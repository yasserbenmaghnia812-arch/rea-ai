# REA AI Studio

A new, independent workspace for an AI-assisted reverse-engineering and rebuild studio. Existing repositories are not modified.

## Project principles
- Keep the upstream REA project intact and track it as an upstream dependency.
- Provide a polished Arabic-first RTL interface.
- Keep provider API keys on the server; never commit secrets.
- Process large files in resumable chunks rather than relying on a single request body.
- Treat analysis, generated files, and rebuilds as separate repeatable jobs.

## Upstream REA
Source: https://github.com/morluto/rea  
License: MIT (see upstream repository for the complete license and notices).

The upstream source is tracked separately under `vendor/rea` as a Git submodule. After cloning this repository, run:

```bash
git submodule update --init --recursive
```

## Development
Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

## Current status
This commit establishes the application shell and product architecture. REA runtime execution, provider adapters, resumable upload storage, and artifact export are staged for implementation and validation. Do not treat the interface shell as a completed reverse-engineering engine.

## Security
Do not expose provider keys in client-side code or commit them to Git. Configure provider credentials as server environment variables when the API service is added.
