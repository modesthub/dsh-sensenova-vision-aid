import z from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
//#region src/config.d.ts
/** 插件配置（schemastery schema 的输出形状，所有字段均可选）。 */
interface VisionAidConfig {
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
/**
 * 对外导出的配置 schema。
 *
 * ⚠️ 类型断言是刻意的：`.volatile()` 把字段类型包成 `Volatile<T>`，下游读取处
 * 必须先用 `plainConfig()` 解包（与 freeapi 同一范式）。
 */
export declare const Config: z<VisionAidConfig>;
/**
 * 把带 volatile 引用的配置解包成普通值（与 `.volatile()` 配套，缺了它整个插件
 * 会读到引用对象）。
 */
export declare function plainConfig(config: VisionAidConfig): VisionAidConfig;
/** 解析后的运行态事实（每次工具调用经 `resolveAdapterOptions` 取得最新值）。 */
interface ResolvedVisionAidOptions {
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
/**
 * 从原始 config 到解析后运行事实的唯一显式步骤（freeapi 同款约定：程序化构造可能
 * 绕过 Schemastery 归一化，因此每个默认值在此重新判定）。
 */
export declare function resolveAdapterOptions(config: VisionAidConfig): ResolvedVisionAidOptions;
//#endregion
//#region src/status-api.d.ts
/** client 侧 settings.ts 的 STATUS_ROUTE / TEST_ROUTE **必须同值**。 */
export declare const STATUS_ROUTE = "/api/sensenova-vision-aid/status";
export declare const TEST_ROUTE = "/api/sensenova-vision-aid/test";
//#endregion
//#region src/index.d.ts
export declare const name = "vision-sensenova";
/** 硬依赖仅 tools；其余（credentials/llm/subagents/attachments/connection）走可选注入。 */
export declare const inject: string[];
export declare function apply(ctx: Context, config: VisionAidConfig): void;
//#endregion
export type { ResolvedVisionAidOptions, VisionAidConfig };
//# sourceMappingURL=index.d.ts.map