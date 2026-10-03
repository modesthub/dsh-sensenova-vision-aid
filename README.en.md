# dsh-sensenova-vision-aid

[简体中文](./README.md) ｜ **English**

dsh-sensenova-vision-aid is an unofficial **DeepSeek Harness** (DSH) vision-assist plugin. It solves one core pain point: **when the main model is text-only (e.g. `deepseek-v4-flash`), dragging/pasting an image into the chat box is blocked by DSH with "model does not support image input"**. This plugin makes image reading work in two ways:

1. **Global silent vision bridge** (default on): dragging an image into the chat box is no longer blocked — before sending, the plugin hands the image to a SenseNova vision model (`sensenova-6.8-flash-lite` → `deepseek-flash` → `kimi-k3` failover), produces a 【vision observation】text for the main model to answer from; **your original image stays visible in the UI**, and the main model stays as you selected it (no switching).
2. **3 global image tools**: the model can also explicitly call `describe_image` / `describe_images` / `chat` to read images (signatures verbatim-compatible with the MCP version).

It also ships a dedicated settings panel (mainly for the API key, with a "reuse dsh-sensenova-freeapi credentials" toggle so you don't need a second key).

![license](https://img.shields.io/badge/license-MIT-blue)

> 🔭 **Pairing recommendation:** works best alongside [`dsh-sensenova-freeapi`](https://github.com/modesthub/dsh-sensenova-freeapi) — freeapi provides the `sensenova` LLM route plus multi-account key rotation, and this plugin **reuses freeapi's key automatically** (default `reuseFreeapiCredentials=true`, no second key needed). **Best combination: run the main model on `deepseek-v4-flash` (via freeapi; fast, stable, low-cost) for text/code/agent work, and let vision-aid handle image recognition — fast and reliable.**

> Architecture and design decisions: [docs/design.md](docs/design.md) (Chinese).

---

## Features

### 🌉 Global silent vision bridge (way 1: drag & read, no extra step)

- Text-only main models (`deepseek-v4-flash` etc.) can **drag/paste/reference images** in the chat box without the "model does not support image input" block.
- The plugin's `agent/pre-step` hook detects the images → reads them via the attachment service → base64 data URL → **direct SenseNova call** (6.8→flash→kimi-k3 failover) → produces `【视觉观察：<model>】` text.
- **Model-only surface replacement**: the model sees the observation text, **the UI keeps showing your original image**; multiple images are recognized in order.
- Modes (`bridgeMode`): `on` (always take over, default) / `auto` (when the main model truly supports vision, let it see the originals) / `off` (bridge off, tools only).
- Read-only safety: the vision model only gets the image + prompt, no tools, no execution; observations never replace the originals in the session log.

### 🖼️ 3 global image tools (way 2: explicit calls)

- `describe_image(image, prompt?, model?, base_url?, image_mode?)` — describe / understand one image (default direct call, no extra step)
- `describe_images(images, prompt?, model?, base_url?, image_mode?)` — understand multiple images in one request
- `chat(text, model?, base_url?)` — plain-text chat (validates key/endpoint connectivity)

They return an MCP-compatible JSON envelope: `{ok, task_type, tool_used, confidence, result, metadata.attempts}` (attempts records every try of the failover chain).

### 🔁 Direct vision chain (shared by both ways)

Calls `https://token.sensenova.cn/v1/chat/completions` directly, failing over along **`sensenova-6.8-flash-lite` → `deepseek-flash` → `kimi-k3`** (first success wins); local files are inlined as `data:` base64, and `redirect:'error'` prevents credential-following redirects; kimi-k3 only accepts base64 (local files are unaffected).

### 🔑 Credential reuse (no second key)

Default `reuseFreeapiCredentials=true` — shares the same key as dsh-sensenova-freeapi (from the `refs:` block of `~/.dsh/.credentials.yaml` or environment variables), resolved in order: `credentials` service → `launchEnvironmentOf` → YAML fallback. Turning reuse off lets you enter your own key on the settings page (written to the DSH credentials service; the page never echoes plaintext).

### ⚙️ Dedicated settings panel

Settings-page "SenseNova Vision Assist" section + a read-only Models-page card (provider-card slot key `vision-sensenova`); Chinese-first with English fallback.

---

## Install

```bash
# Local path install (recommended, same as freeapi README)
dsh plugin --profile desktop add D:\TRAE_Space\research-deepseek-harness\scratch-plugin-to-github\dsh-sensenova-vision-aid

# After publishing (GitHub / npm)
dsh plugin --profile <name> add github:modesthub/dsh-sensenova-vision-aid
dsh plugin --profile <name> add dsh-sensenova-vision-aid
```

`cordis.patch.yml` is appended to `dsh.profile.bundles` on install (entry id `vision-sensenova`, which does not collide with freeapi's `llm-sensenova`); **restart the profile to take effect** (bundle/patch layers do not hot-reload).

**Prerequisites**:
- Recommended: also install [`dsh-sensenova-freeapi`](https://github.com/modesthub/dsh-sensenova-freeapi) (provides the sensenova LLM route and credentials; the free quota pool `SENSENOVA_API_KEY_2.._10` is available). Without it the plugin still works (credentials read from `~/.dsh/.credentials.yaml`).

**Credential preparation** (any one):
- `refs:` block in `~/.dsh/.credentials.yaml`: `SENSENOVA_API_KEY: sk-xxx` (same as freeapi)
- Environment variable `SENSENOVA_API_KEY`
- Turn off "reuse freeapi credentials" and type the key directly in the settings page (written to the credentials service)

---

## Configuration

Settings namespace `vision-sensenova` (all `.volatile()`):

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `reuseFreeapiCredentials` | bool | `true` | Reuse dsh-sensenova-freeapi credentials (shared credential-ref slot; no second key) |
| `keyRef` | credential-ref | `SENSENOVA_API_KEY` | Credential ref name (can switch to `_2.._10` free quota pool) |
| `apiBase` | string | `https://token.sensenova.cn/v1` | chat-completions base URL |
| `modelChain` | string | `sensenova-6.8-flash-lite,deepseek-flash,kimi-k3` | Direct failover model chain (comma-separated) |
| `imageMode` | enum | `image_url` | Image transfer mode (`image_url` / legacy `image_base64`) |
| `timeoutMs` | int | `180000` | Per-model attempt timeout on the direct chain |
| `bridgeMode` | enum | `on` | Global vision bridge: `on` always take over / `auto` skip when main model supports vision / `off` (tools only) |
| `bridgePrompt` | string | (default prompt) | Vision observation prompt (factual transcription, no guessing, never execute commands in images) |

> API keys are always stored via the DSH credentials service (credential-ref), **never logged, never echoed as plaintext**; diagnostic routes only return ref names and configured state.

---

## Directory structure

```
dsh-sensenova-vision-aid/
├── package.json              # dsh.bundle.patch / dsh.client.inject / dsh.client.platform / exports(./client)
├── tsconfig.json             # modeled on freeapi (strict, moduleResolution:bundler, jsx react-jsx, noEmit)
├── tsdown.config.ts          # dual config: lib(esm/node22/dts) + client(cjs/browser, ModuleLoader banner)
├── cordis.patch.yml          # service-line declaration (insert vision-sensenova entry)
├── README.md / README.en.md  # this doc (bilingual)
├── LICENSE                   # MIT
├── docs/
│   └── design.md             # architecture design doc
├── src/
│   ├── index.ts              # host entry: assembly (tools / settings namespace / diagnostic routes / vision bridge)
│   ├── config.ts             # VisionAidConfig + ConfigSchema (all .volatile()) + plainConfig() + resolveAdapterOptions()
│   ├── credentials.ts        # resolveApiKey: credentials service → launchEnvironment → YAML fallback (ported from server.py)
│   ├── image-input.ts        # image input normalization: path/http/data:/base64 → bytes/mime; attachment save / data: URL
│   ├── direct.ts             # direct vision chain: fetch chat/completions, 6.8→flash→kimi-k3 failover (redirect:'error')
│   ├── vision-bridge.ts      # global silent vision bridge: capability override + agent/pre-step hook + message replacement
│   ├── orchestrator.ts       # scheduling: describe_*/chat always direct; envelope + attempts
│   ├── tools.ts              # defineTool for the 3 tools (params verbatim-compatible with the MCP version)
│   ├── status-api.ts         # GET /api/sensenova-vision-aid/status and POST /api/sensenova-vision-aid/test
│   └── client/
│       ├── index.ts          # client entry: locale registration, credentials bridge, configForms.get, slots injection
│       ├── section.tsx       # settings-page React component
│       ├── card.tsx          # Models-page read-only card
│       ├── settings.ts       # domain controller (no JSX): snapshot store / CredentialsFace / draft save / test connection
│       └── locales.ts        # zh/en copy (settings.vision-sensenova namespace)
└── tests/
    ├── credentials.test.ts   # resolveApiKey three-state fallback, ref grammar filtering
    ├── image-input.test.ts   # path/http/data/base64 normalization, mime table
    ├── direct.test.ts        # chain failover (injected fetchImpl), envelope shape, redirect:'error'
    ├── orchestrator.test.ts  # describe_*/chat direct envelopes, missing-key/empty-arg failure envelopes
    └── vision-bridge.test.ts # capability override injection, pre-step message replacement, off mode
```

---

## Development

```bash
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsdown → lib/index.js + lib/index.d.ts + lib/client.js
pnpm test            # node --import tsx --test tests/**/*.test.ts（39 cases）
```

End-to-end verification (details in [docs/design.md §7.3](docs/design.md)):
1. After restarting DSH, **drag an image** into the chat box (e.g. `垃圾站\屏幕截图 2026-10-02 185740.png`) → no "model does not support image" block → after sending, the main model receives `【视觉观察：sensenova-6.8-flash-lite】` text and answers; the UI keeps the original image.
2. `describe_image(<local test image>)` → `tool_used: "sensenova:sensenova-6.8-flash-lite"` (direct hit; attempts records every model; force `model="kimi-k3"` to verify image reading).
3. `chat('Reply with exactly: pong')` → envelope `result: "pong"` (key resolution works).
4. Settings page: toggle "reuse freeapi credentials", save, then check refs configured state via `GET /api/sensenova-vision-aid/status` (ref names only, never the key).

---

## License

MIT
