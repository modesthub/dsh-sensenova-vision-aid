/**
 * 3 个全局工具的定义（defineTool）。参数与默认值与 MCP 版 describe_image /
 * describe_images / chat 逐字一致；`output.schema` 为信封对象 schema，`render`
 * 返回 `JSON.stringify(envelope)` —— 模型收到的文本与 MCP 工具返回的 JSON 文本
 * 相同。
 *
 * @module dsh-sensenova-vision-aid/tools
 */

import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { ResolvedVisionAidOptions } from './config.ts';
import { chat as runChat, describe as runDescribe } from './orchestrator.ts';

/** 识别工具的依赖：每次执行时取最新配置与 ctx。 */
export interface ToolDeps {
  options: () => ResolvedVisionAidOptions;
  ctx: Context;
}

/** 信封对象 schema（成功/失败共用一个宽松对象根）。 */
const envelopeSchema = {
  type: 'object' as const,
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' as const },
    task_type: { type: 'string' as const },
    tool_used: { type: 'string' as const },
    confidence: { type: 'string' as const },
    result: { type: 'string' as const },
    error: { type: 'string' as const },
    image_count: { type: 'integer' as const },
    metadata: { type: 'object' as const, additionalProperties: true },
  },
};

/** render：把信封对象序列化为文本块（与 MCP 版返回的 JSON 文本一致）。 */
function renderEnvelope(_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: JSON.stringify(value) }];
}

/** describe_image 工具定义（与 MCP 版参数/默认值逐字一致）。 */
export function describeImageTool(deps: ToolDeps) {
  return defineTool({
    name: 'describe_image',
    description:
      '描述/理解一张图片(调用商汤 SenseNova 视觉模型,默认直连调用,无需其它步骤;按 sensenova-6.8-flash-lite → deepseek-flash → kimi-k3 故障转移,首个成功即返回)。'
      + 'image 为本地图片绝对路径、http(s) URL 或 base64;返回 JSON 文本(ok/task_type/tool_used/confidence/result/metadata.attempts 记录每轮尝试);多图用 describe_images。'
      + 'api key 优先取 credential-ref(默认 SENSENOVA_API_KEY),与 dsh-sensenova-freeapi 共用同一把 key。',
    parameters: {
      image: {
        type: 'string',
        required: true,
        description: '本地图片绝对路径 / http(s) URL / data: URL / 裸 base64 字符串。',
      },
      prompt: {
        type: 'string',
        description: '识别提示,默认 "Describe this image in detail."。',
      },
      model: {
        type: 'string',
        description: '模型链(逗号分隔),默认用配置;可传 "kimi-k3" 强制单模型。',
      },
      base_url: {
        type: 'string',
        description: 'chat-completions base URL,默认用配置(https://token.sensenova.cn/v1)。',
      },
      image_mode: {
        type: 'string',
        description: '图片传输模式,image_url(默认)或 image_base64(遗留)。',
      },
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const envelope = await runDescribe(deps.ctx, exec, args, deps.options(), 'image_reasoning');
      return JSON.parse(envelope) as Record<string, unknown>;
    },
  });
}

/** describe_images 工具定义（与 MCP 版参数/默认值逐字一致）。 */
export function describeImagesTool(deps: ToolDeps) {
  return defineTool({
    name: 'describe_images',
    description:
      '同一请求内理解多张图片(调用商汤 SenseNova 视觉模型,默认直连调用,无需其它步骤;按 sensenova-6.8-flash-lite → deepseek-flash → kimi-k3 故障转移,首个成功即返回)。'
      + 'images 为图片列表,每项可为本地图片绝对路径、http(s) URL 或 base64;返回 JSON 文本(ok/task_type/tool_used/confidence/result/metadata.attempts 记录每轮尝试)。'
      + 'api key 优先取 credential-ref(默认 SENSENOVA_API_KEY),与 dsh-sensenova-freeapi 共用同一把 key。',
    parameters: {
      images: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: '图片列表,每项为本地图片绝对路径 / http(s) URL / data: URL / 裸 base64。',
      },
      prompt: {
        type: 'string',
        description: '识别提示,默认 "Describe these images in detail."。',
      },
      model: {
        type: 'string',
        description: '模型链(逗号分隔),默认用配置;可传 "kimi-k3" 强制单模型。',
      },
      base_url: {
        type: 'string',
        description: 'chat-completions base URL,默认用配置(https://token.sensenova.cn/v1)。',
      },
      image_mode: {
        type: 'string',
        description: '图片传输模式,image_url(默认)或 image_base64(遗留)。',
      },
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const envelope = await runDescribe(deps.ctx, exec, args, deps.options(), 'image_reasoning_multi');
      return JSON.parse(envelope) as Record<string, unknown>;
    },
  });
}

/** chat 工具定义（恒走直连；验证 key/端点连通性）。 */
export function chatTool(deps: ToolDeps) {
  return defineTool({
    name: 'chat',
    description:
      '纯文本对话(调用商汤 SenseNova 视觉模型;验证 key/端点连通性,以及视觉失败时的兜底;恒走直连路径,默认使用模型链首模型 sensenova-6.8-flash-lite)。返回 JSON 文本。',
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: '要发送给模型的纯文本。',
      },
      model: {
        type: 'string',
        description: '模型链(逗号分隔),默认用配置。',
      },
      base_url: {
        type: 'string',
        description: 'chat-completions base URL,默认用配置。',
      },
    },
    output: { schema: envelopeSchema, render: renderEnvelope },
    isConcurrencySafe: () => true,
    async execute(args) {
      const envelope = await runChat(deps.ctx, args, deps.options());
      return JSON.parse(envelope) as Record<string, unknown>;
    },
  });
}
