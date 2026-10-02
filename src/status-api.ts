/**
 * 只读诊断路由（GET /api/sensenova-vision-aid/status）与「测试连接」路由
 * （POST /api/sensenova-vision-aid/test）。
 *
 * status：`{ serviceAvailable, refs:[{name, configured}], modelChain, apiBase,
 * imageMode, subagent:{ serviceAvailable, spawnProvider, llmRouteResolvable,
 * defaultModel } }`。**绝不抛**：缺失即降级（与 freeapi error-log 路由同款约定）；
 * 只回引用名与配置态，绝不含密钥值。
 *
 * test：POST body `{"prompt":"Reply with exactly: pong"}`，host 侧跑 chat 工具
 * （直连路径，不派生子 agent），返回 `{"ok":true,"model":"<使用的模型>"}` 或
 * `{"ok":false,"error":"<原因>"}`。
 *
 * @module dsh-sensenova-vision-aid/status-api
 */

import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedVisionAidOptions } from './config.ts';
import { describeApiKey } from './credentials.ts';
import { chat as runChat } from './orchestrator.ts';

/** client 侧 settings.ts 的 STATUS_ROUTE / TEST_ROUTE **必须同值**。 */
export const STATUS_ROUTE = '/api/sensenova-vision-aid/status';
export const TEST_ROUTE = '/api/sensenova-vision-aid/test';

/** 子 agent 路径可用性的运行时探测（只读诊断）。 */
export interface SubagentAvailability {
  serviceAvailable: boolean;
  spawnProvider: boolean;
  llmRouteResolvable: boolean;
  defaultModel: string;
}

/** status 路由的响应。 */
export interface StatusSnapshot {
  serviceAvailable: boolean;
  refs: Array<{ name: string; configured: boolean }>;
  modelChain: string;
  apiBase: string;
  imageMode: string;
  subagent: SubagentAvailability;
}

/** 探测 sensenova 路由是否可解析（freeapi 未装 / 路由缺失 ⇒ false，绝不抛）。 */
async function probeLlmRoute(
  ctx: Context,
  model: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const llm = ctx.get('llm') as
    | { resolveCallConfig?: (config: { provider: string; model: string }, signal?: AbortSignal) => Promise<unknown> }
    | undefined;
  if (llm?.resolveCallConfig === undefined) return false;
  try {
    await llm.resolveCallConfig({ provider: 'sensenova', model }, signal);
    return true;
  } catch {
    return false;
  }
}

/** 组装 status 快照（绝不抛；缺失服务即降级）。 */
export async function buildStatusSnapshot(
  ctx: Context,
  options: () => ResolvedVisionAidOptions,
): Promise<StatusSnapshot> {
  const resolved = options();
  const subagents = ctx.get('subagents') as
    | { getProvider?: (name: string) => unknown }
    | undefined;
  const spawnProvider = subagents?.getProvider?.(resolved.subagentProvider) !== undefined;
  const llmRouteResolvable = await probeLlmRoute(ctx, resolved.subagentModel);

  const refs: Array<{ name: string; configured: boolean }> = [];
  try {
    const configured = await describeApiKey(ctx, resolved.keyRef);
    refs.push({ name: resolved.keyRef, configured });
  } catch {
    refs.push({ name: resolved.keyRef, configured: false });
  }

  return {
    serviceAvailable: refs.some(ref => ref.configured),
    refs,
    modelChain: resolved.modelChain.join(','),
    apiBase: resolved.apiBase,
    imageMode: resolved.imageMode,
    subagent: {
      serviceAvailable: spawnProvider && llmRouteResolvable,
      spawnProvider,
      llmRouteResolvable,
      defaultModel: resolved.subagentModel,
    },
  };
}

/** GET status 处理函数。 */
export async function handleStatusHttp(
  ctx: Context,
  options: () => ResolvedVisionAidOptions,
  request: Request,
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { allow: 'GET' } });
  }
  const snapshot = await buildStatusSnapshot(ctx, options);
  return new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** POST test 处理函数：跑 chat 工具（直连路径），返回 ok/model 或 ok/error。 */
export async function handleTestHttp(
  ctx: Context,
  options: () => ResolvedVisionAidOptions,
  request: Request,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { allow: 'POST' } });
  }
  let prompt = 'Reply with exactly: pong';
  try {
    const body = (await request.json()) as { prompt?: unknown };
    if (typeof body?.prompt === 'string' && body.prompt.trim() !== '') {
      prompt = body.prompt;
    }
  } catch {
    // body 解析失败：用默认 prompt。
  }
  try {
    const envelope = await runChat(ctx, { text: prompt }, options());
    const parsed = JSON.parse(envelope) as { ok?: unknown; model?: unknown; error?: unknown };
    if (parsed.ok === true) {
      return new Response(JSON.stringify({
        ok: true,
        ...typeof parsed.model === 'string' && parsed.model !== '' ? { model: parsed.model } : {},
      }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    return new Response(JSON.stringify({
      ok: false,
      error: typeof parsed.error === 'string' ? parsed.error : 'chat tool failed',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
}
