/**
 * SenseNova 视觉辅助设置页的领域层（无 JSX）：把 `vision-sensenova` 设置命名空间
 * 与 credentials 域桥接到页面状态。宿主是唯一事实来源，保存即热生效。
 *
 * 与 dsh-sensenova-freeapi 的 SenseNovaSettingsController 同构，但只保留本插件
 * 所需的最小面：reuseFreeapiCredentials、keyRef、apiBase、modelChain、imageMode、
 * API key 一律经 credentials 域写入（credential-ref），页面不回显明文。
 */

/** 设置命名空间（与 host 侧 ConfigSchema 的命名空间一致）。 */
export const VISION_NS = 'vision-sensenova';
/** 插件条目 id（cordis.patch.yml 的 insert id，与 freeapi 的 llm-sensenova 区分）。 */
export const VISION_ROUTE = 'vision-sensenova';
export const VISION_DISPLAY_NAME = 'SenseNova 视觉辅助';

/** 默认凭据引用（与 freeapi 共用同一把 key 的共享槽位）。 */
export const DEFAULT_KEY_REF = 'SENSENOVA_API_KEY';
/** 默认 apiBase 与默认模型链（与 host 侧默认值一致）。 */
export const DEFAULT_API_BASE = 'https://token.sensenova.cn/v1';
export const DEFAULT_MODEL_CHAIN = 'sensenova-6.8-flash-lite,deepseek-flash,kimi-k3';
/** 默认直连单模型超时（毫秒）。 */
export const DEFAULT_TIMEOUT_MS = 180_000;
/** 子 agent 固定视觉模型 = 链首。 */
/** 子 agent provider 默认值。 */

/** 「复用 freeapi 凭据」的缺省值（开 = 免配第二把 key）。 */
export const DEFAULT_REUSE_FREEAPI = true;
/** 识别走子 agent 路径的缺省值。 */
/** 续接会话变体（预留）的缺省值。 */

/** 免费额度池可用的 ref 后缀（SENSENOVA_API_KEY_2 .. _10）。 */
export const KEY_REF_POOL_MAX = 10;

/** 与宿主 credentials 的 canonical credential-ref 规则一致（POSIX shell 标识符）。 */
const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function canonicalCredentialRef(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' && CREDENTIAL_REF_PATTERN.test(trimmed) ? trimmed : undefined;
}

/** 从 section 值中读取凭据引用；未配置时回退默认，非法值则视为无凭据。 */
function credentialRefOf(keyRef: unknown): string | undefined {
  if (keyRef === undefined) return DEFAULT_KEY_REF;
  return canonicalCredentialRef(keyRef);
}

/** 从 section 值中读取 apiBase（空则回退默认）。 */
function apiBaseOf(apiBase: unknown): string {
  return typeof apiBase === 'string' && apiBase.length > 0 ? apiBase : DEFAULT_API_BASE;
}

/** 从 section 值中读取模型链（非法回退默认）。 */
function modelChainOf(modelChain: unknown): string {
  return typeof modelChain === 'string' && modelChain.trim() !== '' ? modelChain : DEFAULT_MODEL_CHAIN;
}

/** 把并发上限输入归一化为正整数（非法/无法解析回退默认 180000）。 */
function normalizeTimeoutMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1_000) return Math.round(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 1_000) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

/** 把布尔存储值归一化（未配置时回退缺省）。 */
function normalizeBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** 凭据引用下拉选项（SENSENOVA_API_KEY、SENSENOVA_API_KEY_2.._10）。 */
export function keyRefOptions(): string[] {
  const options = [DEFAULT_KEY_REF];
  for (let n = 2; n <= KEY_REF_POOL_MAX; n += 1) options.push(`${DEFAULT_KEY_REF}_${n}`);
  return options;
}

/** credentials 域提供的面（对齐参考实现的 remote.credentials）。 */
export interface CredentialView {
  configured: boolean;
  writable: boolean;
}

export interface CredentialsDescribeResult {
  ok: boolean;
  value?: Record<string, CredentialView>;
}

export interface CredentialsFace {
  describe(refs: string[]): Promise<CredentialsDescribeResult>;
  set(ref: string, value: string): Promise<{ ok: boolean }>;
  unset(ref: string): Promise<{ ok: boolean }>;
}

/** 设置 scope 的最小面（对齐 SettingsScope<T>）。 */
export interface ScopeSnapshot<T> {
  status: 'loading' | 'ready' | 'unavailable';
  value: T | undefined;
  base: unknown;
  user: unknown;
  writable: boolean;
  mode: 'host' | 'memory';
}

/**
 * 设置域的最小结构面（本插件自建，不 import harness 类型以维持零运行时依赖）。
 *
 * ⚠️ 它描述的是上游 `@deepseek-ai/dsh-client-ui-settings` 的 `ConfigForm<T>`
 * （0.1.7 由 `SettingsScope<T>` 改名而来）。字段与上游逐项对齐：
 * `getSnapshot()` / `subscribe()` / `set(field, value): Promise<boolean>` /
 * `unset(field): Promise<boolean>`。
 */
export interface SettingsScope<T> {
  getSnapshot(): ScopeSnapshot<T>;
  subscribe(fn: () => void): () => void;
  set(field: string, value: unknown): Promise<boolean>;
  unset(field: string): Promise<boolean>;
}

/** 可编辑的设置字段。 */
export type FieldName =
  | 'reuseFreeapiCredentials'
  | 'keyRef'
  | 'apiBase'
  | 'modelChain'
  | 'imageMode'
  | 'timeoutMs';

/** 设置命名空间中的用户配置形状（与 host 侧 VisionAidConfig 对齐）。 */
export interface VisionAidConfig {
  reuseFreeapiCredentials?: boolean;
  keyRef?: string;
  apiBase?: string;
  modelChain?: string;
  imageMode?: 'image_url' | 'image_base64';
  timeoutMs?: number;
}

/** 页面渲染用的设置快照（稳定引用，变更时整体替换）。 */
export interface SettingsState {
  available: boolean;
  writable: boolean;
  route: string;
  displayName: string;

  /** 复用 freeapi 凭据开关（实际生效值 + staged）。 */
  reuseFreeapiCredentials: boolean;
  reuseFreeapiCredentialsDraft: boolean;
  /** 凭据引用（实际生效值 + staged）。 */
  keyRef: string;
  keyRefDraft: string;
  /** 当前 ref 的配置态（credentials.describe 结果，不暴露值）。 */
  keyRefConfigured: boolean;
  keyRefWritable: boolean;
  /** 关闭复用时显示的密钥输入框草稿（保存时写 credentials 域）。 */
  keyDraft: string;
  clearStaged: boolean;
  keyWritePending: boolean;
  keyWriteResult: 'idle' | 'saved' | 'failed';

  apiBase: string;
  apiBaseDraft: string;
  modelChain: string;
  modelChainDraft: string;
  imageMode: 'image_url' | 'image_base64';
  imageModeDraft: 'image_url' | 'image_base64';
  timeoutMs: number;
  timeoutMsDraft: string;

  /** 只读诊断（host 状态路由，不参与 dirty/保存）。 */
  diagnostics: DiagnosticsState;

  /** 「测试连接」按钮状态（只读运行数据，不参与 dirty）。 */
  test: TestConnectionState;

  dirty: boolean;
  saving: boolean;
  failed: boolean;
  savedCount: number;
}

/** 测试连接的状态机（idle / loading / ok / error）。 */
export interface TestConnectionState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  model?: string;
  reason?: string;
}

export const IDLE_TEST_STATE: TestConnectionState = { status: 'idle' };

/** 诊断区块的状态机（与 freeapi 同款：idle / loading / ready / error）。 */
export interface DiagnosticsState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  snapshot?: DiagnosticsView;
}

export interface DiagnosticsView {
  serviceAvailable: boolean;
  refs: { name: string; configured: boolean }[];
  modelChain: string;
  apiBase: string;
  imageMode: string;
}

export const IDLE_DIAGNOSTICS_STATE: DiagnosticsState = { status: 'idle' };

/**
 * 归一化宿主状态路由返回的 JSON（**绝不抛**）：字段缺失/类型不符一律取兜底值，
 * 保证面板在旧 host / 数据不完整时只显示「信息不全」而不是崩掉。
 */
export function normalizeDiagnosticsState(raw: unknown): DiagnosticsState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { status: 'error' };
  }
  const source = raw as Record<string, unknown>;
  const rawRefs = Array.isArray(source.refs) ? source.refs : [];
  const refs: DiagnosticsView['refs'] = [];
  for (const item of rawRefs) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.name !== 'string' || row.name === '') continue;
    refs.push({ name: row.name, configured: row.configured === true });
  }
  return {
    status: 'ready',
    snapshot: {
      serviceAvailable: source.serviceAvailable === true,
      refs,
      modelChain: typeof source.modelChain === 'string' ? source.modelChain : '',
      apiBase: typeof source.apiBase === 'string' ? source.apiBase : '',
      imageMode: typeof source.imageMode === 'string' ? source.imageMode : '',
    },
  };
}

/** 稳定的外部状态订阅源（uSES 兼容，供 slots 的 hooks 注入）。 */
export interface SnapshotStore<T> {
  getSnapshot(): T;
  subscribe(fn: () => void): () => void;
  set(value: T): void;
}

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/** 创建一个小型可观察快照 store（参考实现的 createSnapshotStore 精简版）。 */
export function createSnapshotStore<T>(initial: T): SnapshotStore<T> {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(value) {
      if (Object.is(value, snapshot)) return;
      snapshot = value;
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (error) {
          console.error('[dsh-sensenova-vision-aid] snapshot subscriber failed:', error);
        }
      }
    },
  };
}

/**
 * 「测试连接」与「诊断」走 HTTP 路由而不是 settings 通道：诊断数据不是配置——
 * 塞进 settings 会污染 `settings.yaml`，且每次刷新都产生 revision 变化。
 * ⚠️ 与 host 侧 `status-api.ts` 的 STATUS_ROUTE / TEST_ROUTE **必须同值** ——
 * client bundle 无法 import host 模块，改动时两边一起改。
 */
export const STATUS_ROUTE = '/api/sensenova-vision-aid/status';
/** 测试连接走 host 侧 chat 工具（直连路径，不派生子 agent）。 */
export const TEST_ROUTE = '/api/sensenova-vision-aid/test';
export const TEST_PROMPT = 'Reply with exactly: pong';

export class VisionAidSettingsController {
  private readonly scope: SettingsScope<VisionAidConfig>;
  private readonly credentials: CredentialsFace;

  private stagedReuse: boolean | undefined;
  private stagedKeyRef: string | undefined;
  private keyDraft = '';
  private clearStaged = false;
  private keyWritePending = false;
  private keyWriteResult: 'idle' | 'saved' | 'failed' = 'idle';

  private stagedApiBase: string | undefined;
  private stagedModelChain: string | undefined;
  private stagedImageMode: 'image_url' | 'image_base64' | undefined;
  private stagedTimeoutMs: string | undefined;

  private credentialStates = new Map<string, CredentialView>();
  private diagnostics: DiagnosticsState = { ...IDLE_DIAGNOSTICS_STATE };
  private test: TestConnectionState = { ...IDLE_TEST_STATE };

  private saving = false;
  private failed = false;
  private savedCount = 0;

  private readonly listeners = new Set<() => void>();
  private readonly disposers: Array<() => void> = [];
  private disposed = false;

  constructor(scope: SettingsScope<VisionAidConfig>, credentials: CredentialsFace) {
    this.scope = scope;
    this.credentials = credentials;
    this.disposers.push(
      scope.subscribe(() => {
        this.publish();
        this.describeIfRefsChanged();
      }),
    );
    void this.describeAll();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
    this.listeners.clear();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 当前凭据引用：优先 staged 草稿，其次 section 值，最后回退默认。 */
  credentialRef(): string | undefined {
    return credentialRefOf(this.stagedKeyRef ?? this.sectionValue('keyRef'));
  }

  /** 当前 section 值（快照未就绪时 undefined）。 */
  private sectionValue(field: keyof VisionAidConfig): unknown {
    return this.scope.getSnapshot().value?.[field];
  }

  /** 页面状态面。 */
  state(): SettingsState {
    const snapshot = this.scope.getSnapshot();
    const ref = this.credentialRef();
    const refView = ref === undefined ? undefined : this.credentialStates.get(ref);
    const reuse = normalizeBool(this.sectionValue('reuseFreeapiCredentials'), DEFAULT_REUSE_FREEAPI);
    const keyRef = credentialRefOf(this.sectionValue('keyRef')) ?? '';
    const apiBase = apiBaseOf(this.sectionValue('apiBase'));
    const modelChain = modelChainOf(this.sectionValue('modelChain'));
    const imageMode = this.sectionValue('imageMode') === 'image_base64' ? 'image_base64' : 'image_url';
    const timeoutMs = normalizeTimeoutMs(this.sectionValue('timeoutMs'));

    const dirty =
      this.stagedReuse !== undefined ||
      this.stagedKeyRef !== undefined ||
      this.keyDraft !== '' ||
      this.clearStaged ||
      this.stagedApiBase !== undefined ||
      this.stagedModelChain !== undefined ||
      this.stagedImageMode !== undefined ||
      this.stagedTimeoutMs !== undefined;

    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      route: VISION_ROUTE,
      displayName: VISION_DISPLAY_NAME,
      reuseFreeapiCredentials: reuse,
      reuseFreeapiCredentialsDraft: this.stagedReuse ?? reuse,
      keyRef,
      keyRefDraft: this.stagedKeyRef ?? keyRef,
      keyRefConfigured: refView?.configured ?? false,
      keyRefWritable: refView?.writable ?? true,
      keyDraft: this.keyDraft,
      clearStaged: this.clearStaged,
      keyWritePending: this.keyWritePending,
      keyWriteResult: this.keyWriteResult,
      apiBase,
      apiBaseDraft: this.stagedApiBase ?? apiBase,
      modelChain,
      modelChainDraft: this.stagedModelChain ?? modelChain,
      imageMode,
      imageModeDraft: this.stagedImageMode ?? imageMode,
      timeoutMs,
      timeoutMsDraft: this.stagedTimeoutMs ?? String(timeoutMs),
      diagnostics: this.diagnostics,
      test: this.test,
      dirty,
      saving: this.saving,
      failed: this.failed,
      savedCount: this.savedCount,
    };
  }

  // ---- 编辑动作 ----

  edit(field: FieldName, text: string): void {
    if (field === 'reuseFreeapiCredentials') this.stagedReuse = text === 'true';
    else if (field === 'keyRef') this.stagedKeyRef = text;
    else if (field === 'apiBase') this.stagedApiBase = text;
    else if (field === 'modelChain') this.stagedModelChain = text;
    else if (field === 'imageMode') this.stagedImageMode = text === 'image_base64' ? 'image_base64' : 'image_url';
    else if (field === 'timeoutMs') this.stagedTimeoutMs = text;
    this.failed = false;
    this.publish();
  }

  /** 复用开关（布尔专用编辑入口）。 */
  setReuseFreeapi(on: boolean): void {
    this.stagedReuse = on;
    this.failed = false;
    this.publish();
  }

  editKeyDraft(text: string): void {
    this.keyDraft = text;
    this.clearStaged = false;
    this.keyWriteResult = 'idle';
    this.failed = false;
    this.publish();
  }

  toggleClearStaged(): void {
    this.clearStaged = !this.clearStaged;
    if (this.clearStaged) this.keyDraft = '';
    this.keyWriteResult = 'idle';
    this.failed = false;
    this.publish();
  }

  /** 丢弃所有 staged 编辑。 */
  discard(): void {
    this.stagedReuse = undefined;
    this.stagedKeyRef = undefined;
    this.keyDraft = '';
    this.clearStaged = false;
    this.stagedApiBase = undefined;
    this.stagedModelChain = undefined;
    this.stagedImageMode = undefined;
    this.stagedTimeoutMs = undefined;
    this.failed = false;
    this.keyWriteResult = 'idle';
    this.publish();
  }

  /** 凭据域状态重读（外部写入 key 后刷新已配置/可写徽标）。 */
  async refreshCredentials(): Promise<void> {
    await this.describeAll();
  }

  /** 拉取 host 状态路由（只读诊断）。**不自动调用**：打开设置页不产生额外 I/O。 */
  async refreshDiagnostics(): Promise<void> {
    if (this.diagnostics.status === 'loading') return;
    this.diagnostics = { ...this.diagnostics, status: 'loading' };
    this.publish();
    try {
      const response = await fetch(STATUS_ROUTE, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`vision-sensenova: status HTTP ${response.status}`);
      this.diagnostics = normalizeDiagnosticsState(await response.json());
    } catch {
      this.diagnostics = { status: 'error' };
    }
    this.publish();
  }

  /**
   * 测试连接：调用 host 的 chat 工具（直连路径，不派生子 agent）。
   *
   * 主路径 POST /api/sensenova-vision-aid/test（host 侧跑 chat('Reply with
   * exactly: pong') 直连路径）；该路由在旧 host 上缺失时（404），降级为拉取
   * 状态路由作「连通性证据」：检查 serviceAvailable + 当前 keyRef configured，
   * 并取 modelChain 首模型展示。绝不抛：网络/路由异常一律转 error 态。
   */
  async testConnection(): Promise<void> {
    if (this.test.status === 'loading') return;
    this.test = { status: 'loading' };
    this.publish();
    try {
      // 主路径：host 测试路由（跑 chat 工具）。
      const response = await fetch(TEST_ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: TEST_PROMPT }),
        credentials: 'same-origin',
      });
      if (response.ok) {
        const payload = (await response.json()) as { ok?: unknown; model?: unknown; error?: unknown };
        if (payload.ok === true) {
          const model = typeof payload.model === 'string' && payload.model !== '' ? payload.model : undefined;
          this.test = model === undefined
            ? { status: 'ok' }
            : { status: 'ok', model };
        } else {
          const reason = typeof payload.error === 'string' ? payload.error : `test route HTTP ${response.status}`;
          throw new Error(reason);
        }
        this.publish();
        return;
      }
      if (response.status !== 404) {
        throw new Error(`test route HTTP ${response.status}`);
      }
      // 降级路径：旧 host 无测试路由，用状态路由做连通性证据。
      const statusResponse = await fetch(STATUS_ROUTE, { credentials: 'same-origin' });
      if (!statusResponse.ok) throw new Error(`status HTTP ${statusResponse.status}`);
      const normalized = normalizeDiagnosticsState(await statusResponse.json());
      if (normalized.status !== 'ready' || normalized.snapshot === undefined) {
        throw new Error('status route unavailable');
      }
      const snapshot = normalized.snapshot;
      const ref = this.credentialRef() ?? '';
      const refState = snapshot.refs.find((row) => row.name === ref);
      if (!snapshot.serviceAvailable) {
        throw new Error(`service unavailable (status ${snapshot.serviceAvailable})`);
      }
      if (refState === undefined || !refState.configured) {
        throw new Error(`credential ref ${ref} is not configured`);
      }
      const firstModel = snapshot.modelChain.split(',')[0]?.trim() ?? '';
      this.test = firstModel === ''
        ? { status: 'ok' }
        : { status: 'ok', model: firstModel };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.test = { status: 'error', reason };
    }
    this.publish();
  }

  /** 当前页面涉及的 credential-ref 集合键。 */
  private currentRefsKey(): string {
    const ref = this.credentialRef();
    if (ref === undefined) return '';
    return ref;
  }

  private describeIfRefsChanged(): void {
    if (this.currentRefsKey() === '') return;
    void this.describeAll();
  }

  /** 查询本页涉及的凭据引用的配置状态。 */
  private async describeAll(): Promise<void> {
    const ref = this.credentialRef();
    if (ref === undefined) return;
    let response: CredentialsDescribeResult;
    try {
      response = await this.credentials.describe([ref]);
    } catch {
      return;
    }
    if (!response.ok) return;
    const view = response.value?.[ref];
    const next: CredentialView = {
      configured: view?.configured ?? false,
      writable: view?.writable ?? true,
    };
    const prev = this.credentialStates.get(ref);
    if (prev === undefined || prev.configured !== next.configured || prev.writable !== next.writable) {
      this.credentialStates.set(ref, next);
      this.publish();
    }
  }

  /** 写入某个凭据引用，然后重读配置状态。 */
  private async writeKeyTo(ref: string, value: string): Promise<boolean> {
    const canonicalRef = canonicalCredentialRef(ref);
    if (canonicalRef === undefined) return false;
    try {
      const result = await this.credentials.set(canonicalRef, value);
      if (!result.ok) return false;
    } catch {
      return false;
    }
    await this.describeAll();
    return this.credentialStates.get(canonicalRef)?.configured ?? false;
  }

  private async unsetKey(ref: string): Promise<boolean> {
    const canonicalRef = canonicalCredentialRef(ref);
    if (canonicalRef === undefined) return false;
    try {
      const result = await this.credentials.unset(canonicalRef);
      if (!result.ok) return false;
    } catch {
      return false;
    }
    await this.describeAll();
    return this.credentialStates.get(canonicalRef)?.configured !== true;
  }

  /** 保存所有 staged 编辑。 */
  async save(): Promise<void> {
    if (this.saving) return;
    const state = this.state();
    if (!state.dirty) return;
    this.saving = true;
    this.failed = false;
    this.publish();

    let landed = true;
    let keyWriteResult: 'idle' | 'saved' | 'failed' = 'idle';
    try {
      // 1. 凭据域写入：关闭复用时用户输入的密钥 / 清除已存密钥。
      const ref = this.credentialRef();
      if (this.clearStaged) {
        if (ref === undefined || !(await this.unsetKey(ref))) {
          landed = false;
          keyWriteResult = 'failed';
        } else {
          keyWriteResult = 'saved';
        }
      } else if (this.keyDraft.trim() !== '') {
        if (ref === undefined || !(await this.writeKeyTo(ref, this.keyDraft.trim()))) {
          landed = false;
          keyWriteResult = 'failed';
        } else {
          keyWriteResult = 'saved';
        }
      }

      // 2. 设置字段写入。
      if (this.stagedReuse !== undefined) {
        await this.scope.set('reuseFreeapiCredentials', this.stagedReuse);
      }
      if (this.stagedKeyRef !== undefined) {
        const canonicalRef = canonicalCredentialRef(this.stagedKeyRef);
        if (this.stagedKeyRef.trim() === '') await this.scope.unset('keyRef');
        else if (canonicalRef === undefined) landed = false;
        else await this.scope.set('keyRef', canonicalRef);
      }
      if (this.stagedApiBase !== undefined) {
        const value = this.stagedApiBase.trim();
        if (value === '') await this.scope.unset('apiBase');
        else await this.scope.set('apiBase', value);
      }
      if (this.stagedModelChain !== undefined) {
        const value = this.stagedModelChain.trim();
        if (value === '') await this.scope.unset('modelChain');
        else await this.scope.set('modelChain', value);
      }
      if (this.stagedImageMode !== undefined) {
        await this.scope.set('imageMode', this.stagedImageMode);
      }
      if (this.stagedTimeoutMs !== undefined) {
        await this.scope.set('timeoutMs', normalizeTimeoutMs(this.stagedTimeoutMs));
      }
    } catch {
      landed = false;
    }

    this.saving = false;
    this.failed = !landed;
    this.keyWriteResult = landed ? keyWriteResult : 'failed';
    if (landed) {
      this.savedCount += 1;
      this.discard();
    }
    this.publish();
  }

  private publish(): void {
    if (this.disposed) return;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error('[dsh-sensenova-vision-aid] state subscriber failed:', error);
      }
    }
  }
}
