# dsh-sensenova-vision-aid

[简体中文](./README.md) ｜ **English**

dsh-sensenova-vision-aid is an unofficial **DeepSeek Harness** (DSH) vision-assist plugin. When the main model receives an image-recognition request, it **spawns a child agent and switches it to the SenseNova vision model** (mirroring the `@nanmicoder/dsh-agent-teams` child-agent mechanism), and ships a dedicated settings panel (mainly for the API key, with a "reuse dsh-sensenova-freeapi credentials" toggle so you don't need a second key). When freeapi is absent or the child-agent path is unavailable, it automatically falls back to a **direct fallback path**, so recognition always returns a result.

![license](https://img.shields.io/badge/license-MIT-blue)

> 🔭 **Pairing recommendation:** works best alongside [`dsh-sensenova-freeapi`](https://github.com/modesthub/dsh-sensenova-freeapi) — freeapi provides the `sensenova` LLM route (enabling the child-agent primary path) plus multi-account key rotation, and this plugin **reuses freeapi's key automatically** (default `reuseFreeapiCredentials=true`, no second key needed). **Best combination: run the main model on `deepseek-v4-flash` (via freeapi; fast, stable, low-cost) for text/code/agent work, and let vision-aid handle image recognition — fast and reliable.**

> Architecture and design decisions: [docs/design.md](docs/design.md) (Chinese).

---

## Features

### 🖼️ 3 global tools (verbatim-compatible with the MCP version)
- `describe_image(image, prompt?, model?, base_url?, image_mode?)` — describe / understand one image
- `describe_images(images, prompt?, model?, base_url?, image_mode?)` — understand multiple images in one request
- `chat(text, model?, base_url?)` — plain-text chat (validates key/endpoint connectivity; fallback when vision fails)

They return an MCP-compatible JSON envelope: `{ok, task_type, tool_used, confidence, result, metadata.attempts}` (attempts records every try).

### 👶 Child-agent recognition (primary path)
Recognition spawns a child agent (`spawn` provider) switched to the vision model (`agentOptions:{provider:'sensenova', model}`, isomorphic to agent-teams `spawnMember`); images are delivered as `ImageBlock` via the attachment service, so the plain-text main model never sees the pixels. Preflight failures (no subagents / no spawn provider / sensenova route not registered / child-agent failure) fall back to direct automatically.

### 🔁 Direct fallback path
When the child-agent path is unavailable, calls `https://token.sensenova.cn/v1/chat/completions` directly, failing over along **`sensenova-6.8-flash-lite` → `deepseek-flash` → `kimi-k3`** (first success wins); local files are inlined as `data:` base64, and `redirect:'error'` prevents credential-following redirects.

### 🔑 Credential reuse (no second key)
Default `reuseFreeapiCredentials=true` — shares the same key as dsh-sensenova-freeapi (from the `refs:` block of `~/.dsh/.credentials.yaml` or environment variables), resolved in order: `credentials` service → `launchEnvironmentOf` → YAML fallback. Turning reuse off lets you enter your own key on the settings page (written to the DSH credentials service; the page never echoes plaintext).

### ⚙️ Dedicated settings panel
Settings-page "SenseNova Vision Assist" section (order 14) + a read-only Models-page card (provider-card slot key `vision-sensenova`); Chinese-first with English fallback.

---

## Install

```bash
# Local path install (recommended, same as freeapi README)
dsh plugin --profile desktop add D:\TRAE_Space\research-deepseek-harness\scratch-plugin-to-github\dsh-sensenova-vision-aid

# After publishing (GitHub / npm)
dsh plugin --profile <name> add github:modesthub/dsh-sensenova-vision-aid
dsh plugin --profile <name> add dsh-sensenova-vision-aid
```

`cordis.patch.yml` is appended to `dsh.profile.bundles` on install (entry id `vision-sensenova`, which does not collide with freeapi's `llm-sensenova`); it takes effect after the profile restarts (or via live patchReload).

**Prerequisites**:
- Install [`dsh-sensenova-freeapi`](https://github.com/modesthub/dsh-sensenova-freeapi) too (provides the sensenova LLM route so the child-agent path works); without it the plugin still works via the direct fallback, and the panel shows a route-unavailable hint.
- The profile needs `subagent-spawn-in-process` (the `spawn` provider) and `dsh-session-persistence` (the one-shot child-agent backend, same requirement as tool-subagent).

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
| `keyRef` | credential-ref | `SENSENOVA_API_KEY` | Credential ref name (can switch to `_2.._10` free-tier pool) |
| `apiBase` | string | `https://token.sensenova.cn/v1` | chat-completions base URL |
| `modelChain` | string | `sensenova-6.8-flash-lite,deepseek-flash,kimi-k3` | Direct failover model chain (comma-separated) |
| `imageMode` | enum | `image_url` | Image transfer mode (`image_url` / legacy `image_base64`) |
| `timeoutMs` | int | `180000` | Per-model direct-call timeout |
| `useSubagent` | bool | `true` | Whether recognition uses the child-agent path |
| `subagentProvider` | string | `spawn` | Child-agent provider name |
| `subagentModel` | string | `sensenova-6.8-flash-lite` | Child-agent fixed vision model (= chain head) |
| `useContinuable` | bool | `false` | Continuable-session variant (reserved; off by default in v1) |

> API keys are always stored via the DSH credentials service (credential-ref), **never written to logs, never echoed as plaintext**; the diagnostic route returns only ref names and configuration state (a `configured` boolean).

---

## Directory layout

```
dsh-sensenova-vision-aid/
├── package.json              # dsh.bundle.patch / dsh.client.inject / dsh.client.platform / exports(./client)
├── tsconfig.json             # mirrors freeapi (strict, moduleResolution:bundler, jsx react-jsx, noEmit)
├── tsdown.config.ts          # dual config: lib(esm/node22/dts) + client(cjs/browser, ModuleLoader banner)
├── cordis.patch.yml          # service entry declaration (insert vision-sensenova)
├── README.md / README.en.md  # this documentation (bilingual)
├── LICENSE                   # MIT
├── docs/
│   └── design.md             # architecture design document
├── src/
│   ├── index.ts              # host entry: assembly (tool registration / settings namespace / diagnostic routes)
│   ├── config.ts             # VisionAidConfig + ConfigSchema (all .volatile()) + plainConfig() + resolveAdapterOptions()
│   ├── credentials.ts        # resolveApiKey: credentials service → launchEnvironment → YAML fallback (server.py port)
│   ├── image-input.ts        # image input normalization: path/http/data:/base64 → bytes/mime; attachment save / data: URL
│   ├── direct.ts             # direct fallback: fetch chat/completions, port of the server.py failover chain (redirect:'error')
│   ├── subagent-vision.ts    # child-agent primary path: spawn one-shot (agentOptions provider/model; continuable reserved)
│   ├── orchestrator.ts       # scheduling: describe_* tries child agent, falls back to direct; chat always direct; envelope + attempts
│   ├── tools.ts              # defineTool for the 3 tools (parameters verbatim-compatible with the MCP version)
│   ├── status-api.ts         # GET /api/sensenova-vision-aid/status and POST /api/sensenova-vision-aid/test
│   └── client/
│       ├── index.ts          # client entry: locale registration, credentials bridge, configForms.get, slots injection (two slots)
│       ├── section.tsx       # settings-page React component
│       ├── card.tsx          # Models-page read-only card
│       ├── settings.ts       # domain controller (no JSX): snapshot store / CredentialsFace / drafts & save / test connection
│       └── locales.ts        # zh/en copy (settings.vision-sensenova namespace)
└── tests/
    ├── credentials.test.ts   # resolveApiKey three-tier fallback, ref syntax filtering
    ├── image-input.test.ts   # path/http/data/base64 normalization, mime table
    ├── direct.test.ts        # chain failover (injected fetchImpl), envelope shape, redirect:'error'
    └── orchestrator.test.ts  # child agent available → child agent; unavailable/failed → direct
```

---

## Development

```bash
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsdown → lib/index.js + lib/index.d.ts + lib/client.js
pnpm test            # node --import tsx --test tests/**/*.test.ts (39 cases)
```

End-to-end verification steps (see [docs/design.md §7.3](docs/design.md)):
1. `chat('Reply with exactly: pong')` → envelope `result: "pong"` (direct path, key resolution chain works).
2. `describe_image(<local test image>)` → child-agent path succeeds, `tool_used: "sensenova:sensenova-6.8-flash-lite"`; `metadata.attempts` contains the child-agent entry.
3. Disable the freeapi plugin and repeat 2 → automatic direct fallback, attempts recorded per model (6.8 hits first; force `model="kimi-k3"` to verify image reading).
4. Settings page: toggle "reuse freeapi credentials", then check `GET /api/sensenova-vision-aid/status` for ref configuration state (ref names only, never keys).

---

## License

MIT
