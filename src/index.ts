/**
 * dsh-sensenova-vision-aid — DeepSeek Harness 的 SenseNova 视觉辅助插件（host 侧）。
 *
 * 只做装配（可测试性）：
 * 1. 注册 3 个全局工具（describe_image / describe_images / chat，参数与 MCP 版
 *    逐字一致）；
 * 2. 声明设置命名空间（`settings.configure({ auto: false })`，0.1.7 组合层范式）；
 * 3. 挂两条只读诊断路由：GET /api/sensenova-vision-aid/status 与
 *    POST /api/sensenova-vision-aid/test（可选注入 connection，缺服务时不注册）。
 *
 * 关键设计决策（详见 docs/design.md）：
 * - **不调用** `ctx.llm.registerAdapter` / `registerConfigurableProviders` ——
 *   避免与 dsh-sensenova-freeapi 的 sensenova 路由 DUPLICATE_ADAPTER /
 *   DUPLICATE_DIRECTORY 冲突；子 agent 主路径依赖 freeapi 提供路由，未装时
 *   自动回落直连。
 * - 配置热更新：patch 变更 ⇒ app-boot 重组 ⇒ 本入口被重新 apply，`config` 始终
 *   是最新值；入口先 `plainConfig()` 解包 volatile 引用。
 * - 工具注册遵循 DSH 约定：`ctx.tools.register` 返回 disposer，由 cordis fiber
 *   卸载时自动回收（HMR 安全）。
 *
 * @module dsh-sensenova-vision-aid
 */

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-settings';
// 仅为拿到 `ctx.connection` 的类型声明。`import type {}` 会被完全擦除 ⇒ 运行时不引入
// 依赖（peerDependencies 里刻意没有它，避免在缺该包的 harness 上加载失败）。
import type {} from '@deepseek-ai/dsh-client-connection';
import { plainConfig, resolveAdapterOptions, type ResolvedVisionAidOptions, type VisionAidConfig } from './config.ts';
import { STATUS_ROUTE, TEST_ROUTE, handleStatusHttp, handleTestHttp } from './status-api.ts';
import { chatTool, describeImageTool, describeImagesTool } from './tools.ts';

export const name = 'vision-sensenova';
/** 硬依赖仅 tools；其余（credentials/llm/subagents/attachments/connection）走可选注入。 */
export const inject = ['tools'];

export { Config, plainConfig, resolveAdapterOptions, type VisionAidConfig, type ResolvedVisionAidOptions } from './config.ts';
export { STATUS_ROUTE, TEST_ROUTE } from './status-api.ts';

export function apply(ctx: Context, config: VisionAidConfig): void {
  // 🔴 2026-09-24：`.volatile()` 让配置字段在运行期变成 `{get}` 引用，必须先解包。
  // 为什么可以只在 apply 入口解包一次：0.1.7 配置生效机制是「patch 变更 ⇒ app-boot
  // 重组 ⇒ 本入口被重新 apply」，每次 apply 拿到的都是当时最新的值。
  const resolvedConfig = plainConfig(config);
  let lastRaw: VisionAidConfig | undefined;
  let lastGood: ResolvedVisionAidOptions | undefined;

  const options = (): ResolvedVisionAidOptions => {
    const raw = resolvedConfig;
    if (raw === lastRaw && lastGood !== undefined) return lastGood;
    const next = resolveAdapterOptions(raw);
    lastRaw = raw;
    lastGood = next;
    return next;
  };
  options();

  // 1) 注册 3 个全局工具（本插件唯一硬依赖）。
  ctx.tools.register(describeImageTool({ ctx, options }));
  ctx.tools.register(describeImagesTool({ ctx, options }));
  ctx.tools.register(chatTool({ ctx, options }));

  // 2) 设置命名空间声明（0.1.7 范式：组合层声明 + configure({auto:false})）。
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber));
  });

  // 3) 只读诊断路由（可选注入 connection：非 web profile 可能没有 ⇒ 缺服务时
  //    只是不注册这条路由，插件本身照常加载）。
  ctx.inject(['connection'], (connectionCtx) => {
    connectionCtx.effect(
      () => {
        // ⚠️ `ConnectionFetchRoute.requestBody` 只接受 'buffered' | 'streaming'
        //（client/connection rpc.ts），JSON body 由 handler 内自行 `request.json()`。
        const disposeStatus = connectionCtx.connection.fetch.register({
          path: STATUS_ROUTE,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: (request: Request) => handleStatusHttp(ctx, options, request),
        });
        const disposeTest = connectionCtx.connection.fetch.register({
          path: TEST_ROUTE,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: (request: Request) => handleTestHttp(ctx, options, request),
        });
        return () => {
          void disposeStatus();
          void disposeTest();
        };
      },
      `vision-sensenova: diagnostic routes ${STATUS_ROUTE} / ${TEST_ROUTE}`,
    );
  });
}
