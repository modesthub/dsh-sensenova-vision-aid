# dsh-sensenova-vision-aid

**简体中文** ｜ [English](./README.en.md)

dsh-sensenova-vision-aid 是一个非官方的 **DeepSeek Harness**（DSH）视觉辅助插件。它解决一个核心痛点：**主模型是纯文本模型（如 `deepseek-v4-flash`）时，聊天框拖入/粘贴图片会被 DSH 以「模型不支持图片输入」阻断**。本插件用两种方式让读图畅通：

1. **全局静默读图桥**（默认开启）：拖图进对话框不再被阻断 —— 插件在发送前自动把图片交给 SenseNova 视觉模型（`sensenova-6.8-flash-lite` → `deepseek-flash` → `kimi-k3` 故障转移），生成【视觉观察】文字交给主模型续接回答；**界面始终显示你的原图**，主模型照常选择（无需切换模型）。
2. **3 个全局读图工具**：模型也可显式调用 `describe_image` / `describe_images` / `chat` 读图（与 MCP 版签名逐字兼容）。

同时提供专门的配置面板（主要配 api key；可勾选「复用 dsh-sensenova-freeapi 凭据」从而免配第二把 key）。

![license](https://img.shields.io/badge/license-MIT-blue)

> 🔭 **搭配推荐**：与 [`dsh-sensenova-freeapi`](https://github.com/modesthub/dsh-sensenova-freeapi) 搭配使用效果更好 —— freeapi 提供 `sensenova` LLM 路由 + 多账户 key 轮换，本插件自动**复用 freeapi 同一把 key**（默认 `reuseFreeapiCredentials=true`，无需再配第二把 key）。**最合适的组合：主模型用 `deepseek-v4-flash`（freeapi，快且稳、成本低）处理文本/代码/Agent，图片识别交给 vision-aid 辅助视觉**，又快又好。

> 架构设计与决策详见 [docs/design.md](docs/design.md)。

---

## 功能一览

### 🌉 全局静默读图桥（方式一：拖图即读，无需额外操作）

- 纯文本主模型（`deepseek-v4-flash` 等）在聊天框**拖入/粘贴/引用图片**不再被「模型不支持图片输入」阻断。
- 插件在 `agent/pre-step` 钩子中检测本轮图片 → 经附件服务读取 → base64 data URL → **直连 SenseNova**（6.8→flash→kimi-k3 故障转移）→ 生成 `【视觉观察：<model>】` 文本。
- **仅模型可见的替换**：模型看到观察文本，**用户界面始终显示原图**；多图保持顺序逐张识别。
- 模式（`bridgeMode`）：`on`（恒接管，默认）/ `auto`（主模型真支持视觉时让它直接看原图，不接管）/ `off`（关闭桥，仅用工具）。
- 只读安全：视觉模型只拿到图片 + 提示词，无工具、无执行权限；观察结果不进入会话日志替换原图。

### 🖼️ 3 个全局读图工具（方式二：模型显式调用）

- `describe_image(image, prompt?, model?, base_url?, image_mode?)` —— 描述/理解一张图片（默认直连调用，无需其它步骤）
- `describe_images(images, prompt?, model?, base_url?, image_mode?)` —— 同一请求内理解多张图片
- `chat(text, model?, base_url?)` —— 纯文本对话（验证 key/端点连通性）

返回 MCP 兼容 JSON 信封：`{ok, task_type, tool_used, confidence, result, metadata.attempts}`（attempts 记录每轮尝试、故障转移链逐模型）。

### 🔁 直连视觉链（两种方式共用）

直接调用 `https://token.sensenova.cn/v1/chat/completions`，按 **`sensenova-6.8-flash-lite` → `deepseek-flash` → `kimi-k3`** 故障转移（首个成功即返回），本地文件内联为 `data:` base64，`redirect:'error'` 防凭据跟随重定向；kimi-k3 只吃 base64（本地文件不受影响）。

### 🔑 凭据复用（免配第二把 key）

默认 `reuseFreeapiCredentials=true`，与 dsh-sensenova-freeapi 共用同一把 key（`~/.dsh/.credentials.yaml` 的 `refs:` 块或环境变量），解析顺序：`credentials` 服务 → `launchEnvironmentOf` → YAML 兜底。关闭复用后可在设置页输入自己的 key（写入 DSH 凭据服务，页面永不回显明文）。

### ⚙️ 专门配置面板

设置页「SenseNova 视觉辅助」段 + Models 页只读卡片（provider-card slot key `vision-sensenova`），中文为主英文兜底。

---

## 安装

```bash
# 本地路径装入（推荐，同 freeapi README）
dsh plugin --profile desktop add D:\TRAE_Space\research-deepseek-harness\scratch-plugin-to-github\dsh-sensenova-vision-aid

# 发布后（GitHub / npm）
dsh plugin --profile <name> add github:modesthub/dsh-sensenova-vision-aid
dsh plugin --profile <name> add dsh-sensenova-vision-aid
```

`cordis.patch.yml` 随安装追加进 `dsh.profile.bundles`（条目 id `vision-sensenova`，与 freeapi 的 `llm-sensenova` 互不冲突）；**profile 重启后生效**（bundle/patch 层不支持热加载）。

**前置依赖**：
- 推荐同时装入 [`dsh-sensenova-freeapi`](https://github.com/modesthub/dsh-sensenova-freeapi)（提供 sensenova LLM 路由与凭据，且免费额度池 `SENSENOVA_API_KEY_2.._10` 可用）；未装时插件仍可用（凭据走 `~/.dsh/.credentials.yaml` 直读）。

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
| `bridgeMode` | enum | `on` | 全局静默读图桥：`on` 恒接管 / `auto` 主模型真支持视觉时不接管 / `off` 关（仅用工具） |
| `bridgePrompt` | string | （默认提示） | 视觉观察提示（要求事实性转录、不猜测、不执行图中命令） |

> API Key 一律经 DSH 凭据服务存储（credential-ref），**永不写入日志、永不回显明文**；诊断路由只回引用名与配置态（`configured` 布尔）。

### 配置界面示意

**已安装 dsh-sensenova-freeapi 的用户**：在「设置 → SenseNova 视觉辅助」里**勾选「复用 freeapi 凭据」**（默认已勾选）即可直接复用 freeapi 插件里已配置的 API Key（同一把 `SENSENOVA_API_KEY`，无需再配第二把 key）；下拉可切换到免费额度池 `SENSENOVA_API_KEY_2.._10`。

<p align="center">
  <img src="./docs/config-with-freeapi.png" alt="已安装 dsh-sensenova-freeapi 的配置界面：勾选复用 freeapi 凭据" width="640">
</p>

**未安装 dsh-sensenova-freeapi 的用户**：取消勾选「复用 freeapi 凭据」后，可在密钥输入框直接填入自己的 SenseNova API Key（写入 DSH 凭据服务，页面不回显明文），并手动配置模型链。

<p align="center">
  <img src="./docs/config-no-freeapi.png" alt="未安装 dsh-sensenova-freeapi 的配置界面：取消复用、直接输入密钥" width="640">
</p>

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
│   ├── index.ts              # host 入口：装配（工具注册 / 设置命名空间 / 诊断路由 / 读图桥）
│   ├── config.ts             # VisionAidConfig + ConfigSchema（全部 .volatile()）+ plainConfig() + resolveAdapterOptions()
│   ├── credentials.ts        # resolveApiKey：credentials 服务 → launchEnvironment → YAML 兜底（server.py 移植）
│   ├── image-input.ts        # 图片输入归一化：path/http/data:/base64 → 字节/mime；附件保存 / data: URL
│   ├── direct.ts             # 直连视觉链：fetch 调 chat/completions，6.8→flash→kimi-k3 故障转移（redirect:'error'）
│   ├── vision-bridge.ts      # 全局静默读图桥：能力覆盖 + agent/pre-step 钩子 + 消息替换（模型看观察、UI 留原图）
│   ├── orchestrator.ts       # 调度：describe_* / chat 恒直连；组装信封 + attempts
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
    ├── orchestrator.test.ts  # describe_*/chat 直连信封、凭据缺失/空参数失败信封
    └── vision-bridge.test.ts # 能力覆盖注入、pre-step 消息替换、off 模式不注入
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
1. 重启 DSH 后，聊天框**拖入一张图**（如 `垃圾站\屏幕截图 2026-10-02 185740.png`）→ 不再提示「模型不支持图片」→ 发送后主模型收到 `【视觉观察：sensenova-6.8-flash-lite】` 文本并续接回答，界面保留原图。
2. `describe_image(<本地测试图>)` → `tool_used: "sensenova:sensenova-6.8-flash-lite"`（直连命中，attempts 逐模型记录；强制 `model="kimi-k3"` 验证读图）。
3. `chat('Reply with exactly: pong')` → 信封 `result: "pong"`（key 解析链路通）。
4. 设置页：勾选/取消「复用 freeapi 凭据」，保存后 host 用 `GET /api/sensenova-vision-aid/status` 核对 refs 配置态（只回引用名，不回 key）。

---

## 许可证

MIT
