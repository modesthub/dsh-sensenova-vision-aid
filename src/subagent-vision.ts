/**
 * 子 agent 识别主路径：one-shot `spawn` 子 agent，固定 `sensenova` provider +
 * 视觉模型（agentOptions），首批 prompt 即识别任务（图片以 ImageBlock 投递）。
 *
 * 与 agent-teams `spawnMember` 同构（`ctx.subagents.start` + `agentOptions` 指定
 * provider/model）。preflight 失败（无 subagents 服务 / 无 spawn provider / 无 llm
 * 路由 / 图片无法 admit）或子 agent 失败（stopReason 非 completed）一律返回
 * undefined，由 orchestrator 回落直连 —— 保证「识别永远有结果」。
 *
 * 续接变体（startContinuable + installModelSelection）首版不实现（design §3.2.1，
 * useContinuable 默认 false）。
 *
 * @module dsh-sensenova-vision-aid/subagent-vision
 */

import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ContentBlock, ImageBlock } from '@deepseek-ai/dsh-llm';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { SubagentRun, SubagentResult } from '@deepseek-ai/dsh-subagent';
import type { AttachmentsLike, NormalizedImage } from './image-input.ts';

/** 识别人设：自包含 system prompt（shadow 部署 persona），要求输出纯文本结论。 */
export const VISION_RECOGNITION_PERSONA =
  'You are a vision recognition helper. Describe the provided image(s) accurately and completely. '
  + 'Answer only the user\'s question about the image content. If the user asked to extract text (OCR), '
  + 'transcribe it faithfully. Return your final answer as plain text — do not use tools, do not ask '
  + 'for clarification, do not wrap the answer in JSON.';

/** 子 agent 识别成功结果。 */
export interface SubagentVisionResult {
  text: string;
  model: string;
  latencyMs: number;
}

/** 子 agent 服务的最小结构面。 */
export interface SubagentsLike {
  getProvider(name: string): {
    capabilities?: { agentOptions?: boolean; persona?: boolean; toolFilter?: boolean; depthLimit?: boolean };
  } | undefined;
  start(name: string, request: SubagentStartRequestLike): Promise<SubagentRun>;
}

/** one-shot start 请求的最小结构面（避免引入完整类型依赖面）。 */
export interface SubagentStartRequestLike {
  label?: string;
  prompt: ContentBlock[];
  parent: Agent;
  signal: AbortSignal;
  agentOptions?: { provider?: string; model?: string };
  maxDepth?: number;
  toolFilter?: { allow?: string[]; deny?: string[] };
  persona?: string;
}

/** llm 服务的最小结构面。 */
export interface LlmLike {
  resolveCallConfig(config: { provider: string; model: string }, signal?: AbortSignal): Promise<unknown>;
}

export interface RunVisionSubagentOptions {
  provider: string;
  model: string;
  /** 识别任务提示（用户 prompt）。 */
  promptText: string;
  images: NormalizedImage[];
  parent: Agent;
  signal: AbortSignal;
  now?: () => number;
}

/**
 * 执行一次 one-shot 子 agent 识别。任何一步失败（preflight / start / result /
 * dispose）返回 undefined（交 orchestrator 回落直连）。图片经附件服务 admit 为
 * ImageBlock；admit 失败（无附件服务 / http 源 / 保存异常）同样回落。
 */
export async function runVisionSubagent(
  ctx: Context,
  options: RunVisionSubagentOptions,
): Promise<SubagentVisionResult | undefined> {
  const now = options.now ?? Date.now;
  const started = now();
  let run: SubagentRun | undefined;
  try {
    // ── preflight ────────────────────────────────────────────────────────────
    const subagents = ctx.get('subagents') as SubagentsLike | undefined;
    if (subagents === undefined) return undefined;
    const spawnProvider = subagents.getProvider(options.provider);
    if (spawnProvider === undefined) return undefined;
    const capabilities = spawnProvider.capabilities ?? {};
    if (!capabilities.agentOptions || !capabilities.persona || !capabilities.toolFilter
      || !capabilities.depthLimit) {
      return undefined;
    }
    const llm = ctx.get('llm') as LlmLike | undefined;
    if (llm === undefined) return undefined;
    // 路由预检：sensenova 适配器（freeapi）未注册时抛/拒 ⇒ 回落直连。
    await llm.resolveCallConfig({ provider: 'sensenova', model: options.model }, options.signal);

    // ── 图片 admit ──────────────────────────────────────────────────────────
    const attachments = ctx.get('attachments') as AttachmentsLike | undefined;
    const blocks: ContentBlock[] = [];
    for (const image of options.images) {
      const ref = await admitImageRef(attachments, image);
      if (ref === undefined) return undefined;
      blocks.push({ type: 'image', attachment: ref } satisfies ImageBlock);
    }
    blocks.push({ type: 'text', text: options.promptText });

    // ── spawn one-shot ───────────────────────────────────────────────────────
    // 工具面：只禁委派/通信类工具。deny 名按真实注册表过滤 —— 宿主缺某个工具时
    // 列出它会让 provider 的 toolFilter 校验失败（tools.restrict 未知名即拒），
    // 而子 agent 的职责只是读图识别，任何缺失名都无需保留（与 agent-teams 的
    // 宽松过滤器同思路：只在确实注册了的名字上做限制）。
    const denyNames = ['subagent', 'send_message', 'subagent_fork'].filter(name => isToolRegistered(ctx, name));
    const toolFilter = denyNames.length > 0 ? { deny: denyNames } : undefined;
    run = await subagents.start(options.provider, {
      label: 'sensenova-vision-aid:recognize',
      prompt: blocks,
      parent: options.parent,
      signal: options.signal,
      agentOptions: { provider: 'sensenova', model: options.model },
      persona: VISION_RECOGNITION_PERSONA,
      maxDepth: 0,
      ...toolFilter === undefined ? {} : { toolFilter },
    });

    // ── 回收结果 ────────────────────────────────────────────────────────────
    const result: SubagentResult = await run.result;
    if (result.stopReason !== 'completed') return undefined;
    const text = result.output
      .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
      .map(block => block.text)
      .join('');
    if (text.trim() === '') return undefined;
    return { text, model: options.model, latencyMs: Math.round(now() - started) };
  } catch {
    return undefined;
  } finally {
    // 🔴 铁律：one-shot run 必须 dispose（取消剩余工作并达静默）。dispose 失败
    // 不能把上面的成功结果变成失败（设计决策：识别结果优先，资源清理尽力而为）。
    if (run !== undefined) {
      try {
        await run.dispose();
      } catch {
        // dispose 失败静默：结果已回收，清理失败只影响资源释放。
      }
    }
  }
}

/** 单图 admit（本地文件/裸 base64/data: 才有字节；http 源无法提供 ⇒ undefined）。 */
async function admitImageRef(
  attachments: AttachmentsLike | undefined,
  image: NormalizedImage,
): Promise<ImageAttachmentRef | undefined> {
  if (attachments === undefined || image.source === 'http' || image.bytes.length === 0) return undefined;
  try {
    return await attachments.saveImage({
      data: image.bytes,
      mediaType: image.mime,
      ...image.name === undefined ? {} : { name: image.name },
    });
  } catch {
    return undefined;
  }
}

/** 工具注册表的最小结构面（`ctx.get('tools')`）。 */
interface ToolsLike {
  get(name: string): unknown;
}

/** 该工具名是否已在全局注册（filter deny 名单用；注册表缺失时视为未注册）。 */
function isToolRegistered(ctx: Context, name: string): boolean {
  const tools = ctx.get('tools') as ToolsLike | undefined;
  return tools?.get(name) !== undefined;
}

/** 装配子 agent 路径的尝试记录（orchestrator 用）。 */
export function subagentAttemptRecord(
  model: string,
  status: 'ok' | 'failed',
  latencyMs: number,
  error?: string,
): { model: string; status: 'ok' | 'failed'; latency_ms: number; error?: string } {
  return {
    model,
    status,
    latency_ms: latencyMs,
    ...error === undefined ? {} : { error },
  };
}
