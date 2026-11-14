# REA Console — Native Android

A native Kotlin + Jetpack Compose Android application. This is not a WebView wrapper.

## Build

The GitHub Actions workflow `.github/workflows/android-apk.yml` builds a debug APK. Run it from Actions or push a change under `android-app/`.

Local build requirements: JDK 17 and Gradle 8.13.

## Current implementation

- Native Compose interface with Arabic RTL layout.
- REA, Replica, and ECC server slots.
- MCP HTTP initialization and tool discovery.
- Explicit confirmation dialog before each tool call.
- Server tokens are kept in process memory only; they are not persisted by this initial build.

## Not implemented yet

- On-device local language model runtime and model download/management.
- Persistent encrypted credential storage.
- Tool-specific argument editor and structured result rendering.
- End-to-end verification against the deployed MCP servers.

Do not treat the current UI as proof that the remote services are connected. Configure each server's MCP endpoint and test it from the app.
