/**
 * dsh-sensenova-vision-aid 的配置 schema 与归一化（host 侧）。
 *
 * 🔴 2026-09-24 freeapi 血泪教训：**每个叶子字段必须 `.volatile()`** —— 否则设置页
 * 读不到真实配置（`settings.describe()` 的 `volatileForm()` 找不到任何 volatile 字段
 * 会跳过整个 namespace，前端 ConfigForms.get(ns) 显示默认值）。嵌套对象整体
 * `.volatile()`。`apply()` 入口必须先 `plainConfig()` 解包（见本文件底部）。
 *
 * @module dsh-sensenova-vision-aid/config
 */

import z from '@deepseek-ai/schemastery';

/** 默认 apiBase（与 MCP server.py 的 DEFAULT_BASE_URL 一致）。 */
export const DEFAULT_API_BASE = 'https://token.sensenova.cn/v1';
/** 默认模型链：6.8 最先（读图最稳/最快），随后 deepseek-flash、kimi-k3。 */
export const DEFAULT_MODEL_CHAIN = 'sensenova-6.8-flash-lite,deepseek-flash,kimi-k3';
/** 默认凭据引用（与 dsh-sensenova-freeapi 共用同一把 key）。 */
export const DEFAULT_KEY_REF = 'SENSENOVA_API_KEY';
/** 默认直连单模型尝试超时（毫秒）。 */
export const DEFAULT_TIMEOUT_MS = 180_000;
/** 默认子 agent provider。 */
export const DEFAULT_SUBAGENT_PROVIDER = 'spawn';
/** 子 agent 固定视觉模型 = 链首。 */
export const DEFAULT_SUBAGENT_MODEL = 'sensenova-6.8-flash-lite';
/** 默认复用 freeapi 凭据（开 = 免配第二把 key）。 */
export const DEFAULT_REUSE_FREEAPI = true;
/** 默认走子 agent 识别路径。 */
export const DEFAULT_USE_SUBAGENT = true;
/** 续接会话变体（预留，首版默认关）。 */
export const DEFAULT_USE_CONTINUABLE = false;

/** 插件配置（schemastery schema 的输出形状，所有字段均可选）。 */
export interface VisionAidConfig {
  /** 复用 dsh-sensenova-freeapi 凭据（credential-ref 共享槽位）。 */
  reuseFreeapiCredentials?: boolean;
  /** 凭据引用名（POSIX 标识符，如 SENSENOVA_API_KEY / _2.._10）。 */
  keyRef?: string;
  /** chat-completions base URL。 */
  apiBase?: string;
  /** 直连故障转移模型链（逗号分隔）。 */
  modelChain?: string;
  /** 图片传输模式。 */
  imageMode?: 'image_url' | 'image_base64';
  /** 直连单模型尝试超时（毫秒）。 */
  timeoutMs?: number;
  /** 识别走子 agent 路径开关。 */
  useSubagent?: boolean;
  /** 子 agent provider 名。 */
  subagentProvider?: string;
  /** 子 agent 固定视觉模型。 */
  subagentModel?: string;
  /** 续接会话变体（预留）。 */
  useContinuable?: boolean;
}

/** 配置 schema：叶子字段全部 `.default(...).volatile()`。 */
const ConfigSchema = z.object({
  reuseFreeapiCredentials: z.boolean().default(DEFAULT_REUSE_FREEAPI).volatile(),
  keyRef: z.string().role('credential-ref').default(DEFAULT_KEY_REF).volatile(),
  apiBase: z.string().default(DEFAULT_API_BASE).volatile(),
  modelChain: z.string().default(DEFAULT_MODEL_CHAIN).volatile(),
  imageMode: z.union(['image_url', 'image_base64'] as const).default('image_url').volatile(),
  timeoutMs: z.natural().min(1_000).default(DEFAULT_TIMEOUT_MS).volatile(),
  useSubagent: z.boolean().default(DEFAULT_USE_SUBAGENT).volatile(),
  subagentProvider: z.string().default(DEFAULT_SUBAGENT_PROVIDER).volatile(),
  subagentModel: z.string().default(DEFAULT_SUBAGENT_MODEL).volatile(),
  useContinuable: z.boolean().default(DEFAULT_USE_CONTINUABLE).volatile(),
});

/**
 * 对外导出的配置 schema。
 *
 * ⚠️ 类型断言是刻意的：`.volatile()` 把字段类型包成 `Volatile<T>`，下游读取处
 * 必须先用 `plainConfig()` 解包（与 freeapi 同一范式）。
 */
export const Config = ConfigSchema as unknown as z<VisionAidConfig>;

/**
 * cordis 的 `Volatile<T>` 在运行期是一个**只带 `get()` 的对象**。用结构化判定
 * 而不是 `isVolatile()`：本插件的 tsdown `external` 白名单里没有 cosmokit。
 */
function isVolatileRef(value: unknown): value is { get(): unknown } {
  return typeof value === 'object' && value !== null
    && typeof (value as { get?: unknown }).get === 'function';
}

/**
 * 把带 volatile 引用的配置解包成普通值（与 `.volatile()` 配套，缺了它整个插件
 * 会读到引用对象）。
 */
export function plainConfig(config: VisionAidConfig): VisionAidConfig {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config as unknown as Record<string, unknown>)) {
    out[key] = isVolatileRef(value) ? value.get() : value;
  }
  return out as VisionAidConfig;
}

/** 解析后的运行态事实（每次工具调用经 `resolveAdapterOptions` 取得最新值）。 */
export interface ResolvedVisionAidOptions {
  apiBase: string;
  /** 凭据引用名（已 trim、非空；非法 ref 在解析时被过滤）。 */
  keyRef: string;
  /** 模型链（去重、非空；空链回落默认）。 */
  modelChain: string[];
  imageMode: 'image_url' | 'image_base64';
  timeoutMs: number;
  useSubagent: boolean;
  subagentProvider: string;
  subagentModel: string;
  useContinuable: boolean;
}

/** 归一化正整数毫秒；非法值回退 DEFAULT_TIMEOUT_MS（绝不抛）。 */
export function normalizeTimeoutMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1_000
    ? Math.round(value)
    : DEFAULT_TIMEOUT_MS;
}

/** 解析逗号分隔模型链：trim、过滤空项、稳定去重。空结果回落默认链。 */
export function resolveModelChain(value: unknown): string[] {
  const raw = typeof value === 'string' ? value : '';
  const seen: string[] = [];
  for (const item of raw.split(',')) {
    const id = item.trim();
    if (id !== '' && !seen.includes(id)) seen.push(id);
  }
  return seen.length > 0 ? seen : DEFAULT_MODEL_CHAIN.split(',');
}

/** 归一化 imageMode：仅接受 image_base64，其余回落 image_url。 */
function normalizeImageMode(value: unknown): 'image_url' | 'image_base64' {
  return value === 'image_base64' ? 'image_base64' : 'image_url';
}

/** 归一化布尔；非布尔回落缺省。 */
function normalizeBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * 从原始 config 到解析后运行事实的唯一显式步骤（freeapi 同款约定：程序化构造可能
 * 绕过 Schemastery 归一化，因此每个默认值在此重新判定）。
 */
export function resolveAdapterOptions(config: VisionAidConfig): ResolvedVisionAidOptions {
  const keyRefRaw = typeof config.keyRef === 'string' ? config.keyRef.trim() : '';
  return {
    apiBase: typeof config.apiBase === 'string' && config.apiBase.trim() !== ''
      ? config.apiBase.trim().replace(/\/+$/, '')
      : DEFAULT_API_BASE,
    keyRef: keyRefRaw !== '' ? keyRefRaw : DEFAULT_KEY_REF,
    modelChain: resolveModelChain(config.modelChain),
    imageMode: normalizeImageMode(config.imageMode),
    timeoutMs: normalizeTimeoutMs(config.timeoutMs),
    useSubagent: normalizeBool(config.useSubagent, DEFAULT_USE_SUBAGENT),
    subagentProvider: typeof config.subagentProvider === 'string' && config.subagentProvider.trim() !== ''
      ? config.subagentProvider.trim()
      : DEFAULT_SUBAGENT_PROVIDER,
    subagentModel: typeof config.subagentModel === 'string' && config.subagentModel.trim() !== ''
      ? config.subagentModel.trim()
      : DEFAULT_SUBAGENT_MODEL,
    useContinuable: normalizeBool(config.useContinuable, DEFAULT_USE_CONTINUABLE),
  };
}
