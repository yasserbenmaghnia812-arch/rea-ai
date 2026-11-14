# Third-party notices

This repository combines original YASSER AI Studio code with separately licensed projects and model weights. Keep each upstream project's copyright and license notices when redistributing its code or assets.

| Component | Upstream | License / use |
|---|---|---|
| REA MCP tooling | https://github.com/morluto/rea | MIT; used by the REA integration |
| ECC skills and agent assets | https://github.com/affaan-m/ECC | MIT; used by the ECC MCP service |
| Replica skills | https://github.com/Jakeschincariol/replica-skill | MIT; used by the Replica MCP service |
| llama.cpp Android inference runtime | https://github.com/ggml-org/llama.cpp | MIT; checked out at a pinned revision during Android builds |
| Qwen2.5-0.5B-Instruct GGUF Q4_K_M model | https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF | The upstream Qwen2.5 model is licensed under Apache-2.0; the GGUF weights are downloaded separately by the user |

The root MIT license applies to original code in this repository. It does not replace or override upstream licenses for third-party code, skills, or model weights. The Qwen model is not bundled in the APK.
