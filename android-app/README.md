# REA Console — Native Android

A native Kotlin + Jetpack Compose Android application. This is not a WebView wrapper.

## Build

The GitHub Actions workflow `.github/workflows/android-apk.yml` builds a debug APK. It checks out a pinned `ggml-org/llama.cpp` revision into `../llama.cpp`, installs Android NDK 29.0.13113456 and CMake 3.31.6, then builds the app.

Local build requirements: JDK 17, Android SDK 36, NDK 29.0.13113456, CMake 3.31.6, and Gradle 8.13. Also clone `ggml-org/llama.cpp` at commit `32bdc3a89e6528d3e419024c833c5dabf32c7541` into a sibling directory named `llama.cpp` next to `android-app`.

## Implemented

- Native Compose interface with Arabic RTL layout.
- REA, Replica, and ECC server slots.
- MCP HTTP initialization and tool discovery.
- Explicit confirmation dialog and editable JSON arguments before every MCP tool call.
- Optional on-device inference through the Android binding in llama.cpp.
- Qwen2.5-0.5B-Instruct GGUF Q4_K_M model download on demand (approximately 491 MB); the model is not bundled in the APK.
- Local model file stored in app-private storage; no model download starts until the user taps the download control.
- Local chat generation with a short output limit for low-memory devices.

## Device and storage notes

The native llama.cpp Android binding currently requires Android API 33 or newer. The app therefore uses `minSdk = 33`; Android 15 devices are supported. The model requires roughly half a gigabyte of download/storage space, plus additional RAM while generating. Close other heavy apps if the device runs out of memory.

## Not verified yet

- Successful CI build of the newly added native runtime.
- Runtime inference on a physical Galaxy A06.
- End-to-end connectivity against the deployed REA, Replica, and ECC MCP servers.
- Persistent encrypted credential storage.

Do not treat the presence of server slots as proof that remote services are connected. Configure each MCP endpoint and test it from the app.
