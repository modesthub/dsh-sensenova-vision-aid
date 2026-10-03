/**
 * 调度层：describe_* 与 chat 恒走直连（sensenova-6.8-flash-lite →
 * deepseek-flash → kimi-k3 故障转移，凭据与工具路径一致）。
 * 组装 MCP 兼容信封（`{ok, task_type, tool_used, confidence, result,
 * metadata.attempts}`）并返回 **JSON 字符串**（与 MCP 版一致，模型收到的是文本）。
 *
 * 信封字段逐字对齐 server.py：
 * - 成功：ok/task_type/tool_used/confidence/result/metadata{model,base_url,image_mode,total_ms,attempts}
 *   describe_images 加 `image_count`、task_type=image_reasoning_multi；chat 无 confidence。
 * - 失败：{ok:false, task_type, error}。
 *
 * attempts 语义：直连路径每个模型一次尝试（status ok|failed, error?, latency_ms）。
 *
 * @module dsh-sensenova-vision-aid/orchestrator
 */

import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { ResolvedVisionAidOptions } from './config.ts';
import { resolveApiKey } from './credentials.ts';
import { normalizeImageInput, toDataUrl, type NormalizedImage } from './image-input.ts';
import { envelopeFail, imagePart, runChain } from './direct.ts';
/** 一次 `describe_*` 的输入参数（与 MCP 工具签名一致）。 */
export interface DescribeArgs {
  image?: string;
  images?: string[];
  prompt?: string;
  model?: string;
  base_url?: string;
  image_mode?: string;
}

/** chat 工具的输入参数。 */
export interface ChatArgs {
  text: string;
  model?: string;
  base_url?: string;
}

/** 从工具参数提取并归一化图片数组（describe_image 单图包装为数组）。 */
export async function normalizeImagesOf(args: DescribeArgs): Promise<NormalizedImage[]> {
  const raws = args.images ?? (args.image !== undefined ? [args.image] : []);
  if (raws.length === 0) throw new Error('at least one image is required');
  const normalized: NormalizedImage[] = [];
  for (const raw of raws) {
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new Error(`each image must be a non-empty string, got ${JSON.stringify(raw)}`);
    }
    normalized.push(await normalizeImageInput(raw));
  }
  return normalized;
}

/** 解析用户覆盖：空串/未传用配置值。 */
function resolveOverrides(args: { model?: string; base_url?: string; image_mode?: string }, options: ResolvedVisionAidOptions): {
  modelChain: string[];
  apiBase: string;
  imageMode: 'image_url' | 'image_base64';
} {
  const requestedChain = (args.model !== undefined && args.model.trim() !== '')
    ? args.model.split(',').map(m => m.trim()).filter(m => m !== '')
    : [];
  return {
    modelChain: requestedChain.length > 0 ? requestedChain : options.modelChain,
    apiBase: args.base_url !== undefined && args.base_url.trim() !== ''
      ? args.base_url.trim().replace(/\/+$/, '')
      : options.apiBase,
    imageMode: args.image_mode === 'image_base64' ? 'image_base64' : options.imageMode,
  };
}

/**
 * describe_image / describe_images 共用实现。
 * @param taskType 信封的 task_type（单图 image_reasoning / 多图 image_reasoning_multi）。
 * @param images 已归一化图片。
 * @param raws 原始图片字符串（与 images 一一对应，直连路径 data: URL 用）。
 */
export async function describe(
  ctx: Context,
  _exec: ToolRunContext,
  args: DescribeArgs,
  options: ResolvedVisionAidOptions,
  taskType: 'image_reasoning' | 'image_reasoning_multi',
): Promise<string> {
  const started = Date.now();
  const prompt = args.prompt ?? (taskType === 'image_reasoning_multi'
    ? 'Describe these images in detail.'
    : 'Describe this image in detail.');
  const overrides = resolveOverrides(args, options);
  const attempts: Array<Record<string, unknown>> = [];

  let images: NormalizedImage[];
  let raws: string[];
  try {
    images = await normalizeImagesOf(args);
    raws = args.images ?? (args.image !== undefined ? [args.image] : []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify(envelopeFail(taskType, message));
  }

  // 直连路径（唯一路径：sensenova-6.8-flash-lite → deepseek-flash → kimi-k3）。
  try {
    const apiKey = await resolveApiKey(ctx, options.keyRef);
    if (apiKey === undefined) {
      throw new Error(
        `no SenseNova API key for credential ref "${options.keyRef}"; configure it in the settings page, `
        + `through the credentials service, or in ~/.dsh/.credentials.yaml (as dsh-sensenova-freeapi does)`,
      );
    }
    const content: Array<Record<string, unknown>> = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const raw = raws[index];
      if (image === undefined || raw === undefined) continue;
      content.push(imagePart(toDataUrl(image, raw), overrides.imageMode));
    }
    if (prompt !== '') content.push({ type: 'text', text: prompt });

    const fetchImpl = fetchImplOf(ctx);
    const chain = await runChain(
      {
        apiBase: overrides.apiBase,
        content,
        apiKey,
        timeoutMs: options.timeoutMs,
        ...fetchImpl === undefined ? {} : { fetchImpl },
      },
      overrides.modelChain,
    );
    attempts.push(...chain.attempts.map(attempt => ({ ...attempt })));
    return JSON.stringify({
      ok: true,
      task_type: taskType,
      tool_used: `sensenova:${chain.model}`,
      confidence: 'high',
      ...taskType === 'image_reasoning_multi' ? { image_count: images.length } : {},
      result: chain.result,
      metadata: {
        model: chain.model,
        base_url: overrides.apiBase,
        image_mode: overrides.imageMode,
        total_ms: Date.now() - started,
        attempts,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify(envelopeFail(taskType, message));
  }
}

/**
 * chat：恒走直连（快、省子 agent；同时作为 key/端点连通性验证）。
 * 模型链按工具入参或配置；成功信封无 confidence（与 MCP 版一致）。
 * 不需要 exec（不派生子 agent）——测试路由直接调用。
 */
export async function chat(
  ctx: Context,
  args: ChatArgs,
  options: ResolvedVisionAidOptions,
): Promise<string> {
  const started = Date.now();
  const text = typeof args.text === 'string' ? args.text : '';
  if (text.trim() === '') return JSON.stringify(envelopeFail('chat', 'text must be a non-empty string'));
  const overrides = resolveOverrides(args, options);
  try {
    const apiKey = await resolveApiKey(ctx, options.keyRef);
    if (apiKey === undefined) {
      throw new Error(
        `no SenseNova API key for credential ref "${options.keyRef}"; configure it in the settings page, `
        + `through the credentials service, or in ~/.dsh/.credentials.yaml (as dsh-sensenova-freeapi does)`,
      );
    }
    const fetchImpl = fetchImplOf(ctx);
    const chain = await runChain(
      {
        apiBase: overrides.apiBase,
        content: [{ type: 'text', text }],
        apiKey,
        timeoutMs: options.timeoutMs,
        ...fetchImpl === undefined ? {} : { fetchImpl },
      },
      overrides.modelChain,
    );
    return JSON.stringify({
      ok: true,
      task_type: 'chat',
      tool_used: `sensenova:${chain.model}`,
      result: chain.result,
      metadata: {
        model: chain.model,
        base_url: overrides.apiBase,
        total_ms: Date.now() - started,
        attempts: chain.attempts.map(attempt => ({ ...attempt })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify(envelopeFail('chat', message));
  }
}

/** 可选注入的 fetch（测试用）：ctx 无 'fetch' 服务时回落全局 fetch。 */
function fetchImplOf(ctx: Context): typeof fetch | undefined {
  const candidate = ctx.get('fetch') as typeof fetch | undefined;
  return typeof candidate === 'function' ? candidate : undefined;
}
