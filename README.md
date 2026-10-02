# dsh-sensenova-vision-aid

**简体中文** ｜ [English](./README.en.md)

dsh-sensenova-vision-aid 是一个非官方的 **DeepSeek Harness**（DSH）视觉辅助插件。主模型收到图片识别请求时，**自动派生子 agent 并切换到 SenseNova 视觉模型**（参考 `@nanmicoder/dsh-agent-teams` 子 agent 机制），提供专门的配置面板（主要配 api key；可勾选「复用 dsh-sensenova-freeapi 凭据」从而免配第二把 key）。未装 freeapi 或子 agent 不可用时自动回落**直连兜底路径**，识别永远有结果。

![license](https://img.shields.io/badge/license-MIT-blue)

> 架构设计与决策详见 [docs/design.md](docs/design.md)。

---

## 功能一览

### 🖼️ 3 个全局工具（与 MCP 版逐字兼容）
- `describe_image(image, prompt?, model?, base_url?, image_mode?)` —— 描述/理解一张图片
- `describe_images(images, prompt?, model?, base_url?, image_mode?)` —— 同一请求内理解多张图片
- `chat(text, model?, base_url?)` —— 纯文本对话（验证 key/端点连通性，视觉失败时的兜底）

返回 MCP 兼容 JSON 信封：`{ok, task_type, tool_used, confidence, result, metadata.attempts}`（attempts 记录每轮尝试）。

### 👶 子 agent 识别主路径
识别时派生子 agent（`spawn` provider）并切换到视觉模型（`agentOptions:{provider:'sensenova', model}`，与 agent-teams `spawnMember` 同构）；图片经附件服务投递为 `ImageBlock`，纯文本主模型全程看不到像素。预检失败（无 subagents / 无 spawn provider / sensenova 路由未注册 / 子 agent 失败）自动回落直连。

### 🔁 直连兜底路径
子 agent 不可用时直接调用 `https://token.sensenova.cn/v1/chat/completions`，按 **`sensenova-6.8-flash-lite` → `deepseek-flash` → `kimi-k3`** 故障转移（首个成功即返回），本地文件内联为 `data:` base64，`redirect:'error'` 防凭据跟随重定向。

### 🔑 凭据复用（免配第二把 key）
默认 `reuseFreeapiCredentials=true`，与 dsh-sensenova-freeapi 共用同一把 key（`~/.dsh/.credentials.yaml` 的 `refs:` 块或环境变量），解析顺序：`credentials` 服务 → `launchEnvironmentOf` → YAML 兜底。关闭复用后可在设置页输入自己的 key（写入 DSH 凭据服务，页面永不回显明文）。

### ⚙️ 专门配置面板
设置页「SenseNova 视觉辅助」段（order 14）+ Models 页只读卡片（provider-card slot key `vision-sensenova`），中文为主英文兜底。

---

## 安装

```bash
# 本地路径装入（推荐，同 freeapi README）
dsh plugin --profile desktop add D:\TRAE_Space\research-deepseek-harness\scratch-plugin-to-github\dsh-sensenova-vision-aid

# 发布后（GitHub / npm）
dsh plugin --profile <name> add github:<你的用户名>/dsh-sensenova-vision-aid
dsh plugin --profile <name> add dsh-sensenova-vision-aid
```

`cordis.patch.yml` 随安装追加进 `dsh.profile.bundles`（条目 id `vision-sensenova`，与 freeapi 的 `llm-sensenova` 互不冲突）；profile 重启（或 patchReload live）后生效。

**前置依赖**：
- 推荐同时装入 [`dsh-sensenova-freeapi`](https://github.com/modesthub/dsh-sensenova-freeapi)（提供 sensenova LLM 路由，子 agent 主路径启用）；未装时插件仍可用（直连兜底），面板显示路由不可用提示。
- 需要 profile 已挂 `subagent-spawn-in-process`（`spawn` provider）与 `dsh-session-persistence`（one-shot 子 agent 后端，同 tool-subagent 的要求）。

**凭据准备**（任一即可）：
- `~/.dsh/.credentials.yaml` 的 `refs:` 块：`SENSENOVA_API_KEY: sk-xxx`（与 freeapi 相同）
- 环境变量 `SENSENOVA_API_KEY`
- 关闭「复用 freeapi 凭据」后在设置页直接输入（写凭据服务）

---

## 配置

设置命名空间 `vision-sensenova`（全部 `.volatile()`）：

| 字段 | 类型 | 默认 | 含义 |
| --- | --- | --- | --- |
| `reuseFreeapiCredentials` | bool | `true` | 复用 dsh-sensenova-freeapi 凭据（credential-ref 共享槽位，免配第二把 key） |
| `keyRef` | credential-ref | `SENSENOVA_API_KEY` | 凭据引用名（可切换 `_2.._10` 免费额度池） |
| `apiBase` | string | `https://token.sensenova.cn/v1` | chat-completions base URL |
| `modelChain` | string | `sensenova-6.8-flash-lite,deepseek-flash,kimi-k3` | 直连故障转移模型链（逗号分隔） |
| `imageMode` | enum | `image_url` | 图片传输模式（`image_url` / 遗留 `image_base64`） |
| `timeoutMs` | int | `180000` | 直连单模型尝试超时 |
| `useSubagent` | bool | `true` | 识别走子 agent 路径开关 |
| `subagentProvider` | string | `spawn` | 子 agent provider 名 |
| `subagentModel` | string | `sensenova-6.8-flash-lite` | 子 agent 固定视觉模型（= 链首） |
| `useContinuable` | bool | `false` | 续接会话变体（预留，首版默认关） |

> API Key 一律经 DSH 凭据服务存储（credential-ref），**永不写入日志、永不回显明文**；诊断路由只回引用名与配置态（`configured` 布尔）。

---

## 目录结构

```
dsh-sensenova-vision-aid/
├── package.json              # dsh.bundle.patch / dsh.client.inject / dsh.client.platform / exports(./client)
├── tsconfig.json             # 照抄 freeapi（strict, moduleResolution:bundler, jsx react-jsx, noEmit）
├── tsdown.config.ts          # 双 config：lib(esm/node22/dts) + client(cjs/browser, ModuleLoader banner)
├── cordis.patch.yml          # 服务行声明（insert vision-sensenova 条目）
├── README.md / README.en.md  # 本文档（中英双语）
├── LICENSE                   # MIT
├── docs/
│   └── design.md             # 架构设计文档
├── src/
│   ├── index.ts              # host 入口：装配（工具注册 / 设置命名空间 / 诊断路由）
│   ├── config.ts             # VisionAidConfig + ConfigSchema（全部 .volatile()）+ plainConfig() + resolveAdapterOptions()
│   ├── credentials.ts        # resolveApiKey：credentials 服务 → launchEnvironment → YAML 兜底（server.py 移植）
│   ├── image-input.ts        # 图片输入归一化：path/http/data:/base64 → 字节/mime；附件保存 / data: URL
│   ├── direct.ts             # 直连兜底：fetch 调 chat/completions，复刻 server.py 故障转移链（redirect:'error'）
│   ├── subagent-vision.ts    # 子 agent 主路径：spawn one-shot（agentOptions 指定 provider/model；续接变体预留）
│   ├── orchestrator.ts       # 调度：describe_* 先试子 agent，失败回落直连；chat 恒直连；组装信封 + attempts
│   ├── tools.ts              # defineTool 定义 3 个工具（参数与 MCP 版逐字一致）
│   ├── status-api.ts         # GET /api/sensenova-vision-aid/status 与 POST /api/sensenova-vision-aid/test
│   └── client/
│       ├── index.ts          # client 入口：locale 注册、credentials 桥、configForms.get、slots 注入（双槽）
│       ├── section.tsx       # 设置页 React 组件
│       ├── card.tsx          # Models 页只读卡片
│       ├── settings.ts       # 领域控制器（无 JSX）：快照 store / CredentialsFace / 草稿保存 / 测试连接
│       └── locales.ts        # zh/en 文案（settings.vision-sensenova 命名空间）
└── tests/
    ├── credentials.test.ts   # resolveApiKey 三态回退、ref 语法过滤
    ├── image-input.test.ts   # path/http/data/base64 归一化、mime 表
    ├── direct.test.ts        # 链式故障转移（注入 fetchImpl）、信封形状、redirect:'error'
    └── orchestrator.test.ts  # 子 agent 可用→走子 agent；不可用/失败→直连
```

---

## 开发

```bash
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsdown → lib/index.js + lib/index.d.ts + lib/client.js
pnpm test            # node --import tsx --test tests/**/*.test.ts（39 用例）
```

端到端验证步骤（详见 [docs/design.md §7.3](docs/design.md)）：
1. `chat('Reply with exactly: pong')` → 信封 `result: "pong"`（直连路径、key 解析链路通）。
2. `describe_image(<本地测试图>)` → 子 agent 路径成功，`tool_used: "sensenova:sensenova-6.8-flash-lite"`；`metadata.attempts` 含子 agent 单条。
3. 停用 freeapi 插件后重复 2 → 自动回落直连，attempts 逐模型记录（6.8 优先命中；强制 `model="kimi-k3"` 验证读图）。
4. 设置页：勾选/取消「复用 freeapi 凭据」，保存后 host 用 `GET /api/sensenova-vision-aid/status` 核对 refs 配置态（只回引用名，不回 key）。

---

## 许可证

MIT
