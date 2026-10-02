/**
 * 直连兜底路径：用 `fetch` 调用 SenseNova 的 OpenAI 兼容 `chat/completions`，
 * 逐函数复刻 MCP server.py 的 `_chat_url` / `_image_ref` / `_post_chat` /
 * `_extract_text` / `_run_chain` / `_envelope`。
 *
 * 关键差异：`urllib` → `fetch`，且 `redirect: 'error'`（web/AGENTS.md：凭据请求
 * 拒重定向）；超时用 `AbortSignal.timeout(timeoutMs)`。模型链默认
 * sensenova-6.8-flash-lite → deepseek-flash → kimi-k3，首个成功即返回，每轮尝试
 * 记录进 `metadata.attempts`。kimi-k3 只吃 base64：http(s) URL 的 kimi-k3 尝试会
 * 失败并被如实记录（与 MCP 版行为一致）。
 *
 * 本模块为纯函数 + 注入 `fetchImpl` / `now`（可单测）。
 *
 * @module dsh-sensenova-vision-aid/direct
 */

/** 一次模型尝试的记录（MCP 兼容）。 */
export interface AttemptRecord {
  model: string;
  status: 'ok' | 'failed';
  latency_ms: number;
  error?: string;
}

/** 直连链的成功结果。 */
export interface DirectChainResult {
  result: string;
  model: string;
  attempts: AttemptRecord[];
}

/** chat-completions base URL 幂等追加（server.py `_chat_url`）。 */
export function chatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (base.endsWith('/chat/completions') || base.endsWith('/llm/chat-completions')) return base;
  return `${base}/chat/completions`;
}

/** 构造一个图片内容部件（server.py `_image_ref`）。 */
export function imagePart(imageRef: string, mode: 'image_url' | 'image_base64'): Record<string, unknown> {
  if (mode === 'image_base64') {
    let raw = imageRef;
    if (raw.startsWith('data:') && raw.includes(';base64,')) {
      raw = raw.slice(raw.indexOf(';base64,') + 8);
    }
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      throw new Error('image_base64 mode needs base64 bytes or a local file path, not an http URL');
    }
    return { type: 'image_base64', image_base64: raw };
  }
  return { type: 'image_url', image_url: { url: imageRef } };
}

/** 从响应 JSON 提取文本（server.py `_extract_text`）。 */
export function extractText(data: Record<string, unknown>): string {
  const choices = data['choices'];
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (typeof first === 'object' && first !== null) {
      const message = (first as Record<string, unknown>)['message'];
      if (typeof message === 'object' && message !== null) {
        const content = (message as Record<string, unknown>)['content'];
        if (typeof content === 'string') return content;
      }
    }
  }
  throw new Error(
    `SenseNova API response had no choices[0].message.content; raw response: ${JSON.stringify(data).slice(0, 800)}`,
  );
}

/** 解析逗号分隔模型链：trim、过滤空项、稳定去重；空结果回落默认链。 */
export function resolveModels(model: string | undefined, defaultChain: string[]): string[] {
  const chain = (model !== undefined && model.trim() !== '' ? model : '').split(',');
  const seen: string[] = [];
  for (const raw of chain) {
    const m = raw.trim();
    if (m !== '' && !seen.includes(m)) seen.push(m);
  }
  return seen.length > 0 ? seen : defaultChain;
}

export interface PostChatOptions {
  apiBase: string;
  model: string;
  content: Array<Record<string, unknown>>;
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * 一次 POST（server.py `_post_chat` 的 fetch 版）。HTTP 错误带状态码与响应体摘要；
 * 网络/超时错误带原因。**凭据请求拒重定向**（`redirect: 'error'`）。
 */
export async function postChat(options: PostChatOptions): Promise<Record<string, unknown>> {
  const url = chatUrl(options.apiBase);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`SenseNova request timed out after ${options.timeoutMs}ms`)), options.timeoutMs);
  try {
    const doFetch = options.fetchImpl ?? fetch;
    const response = await doFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: 'user', content: options.content }],
      }),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 800);
      throw new Error(`SenseNova API returned HTTP ${response.status} for ${url}: ${detail}`);
    }
    return (await response.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 逐模型尝试链（server.py `_run_chain`）：首个成功即返回，全部失败抛聚合错误。
 * attempts 按尝试顺序记录每轮 `{model, status, latency_ms, error?}`。
 */
export async function runChain(
  options: Omit<PostChatOptions, 'model'>,
  models: string[],
): Promise<DirectChainResult> {
  const now = options.now ?? Date.now;
  const attempts: AttemptRecord[] = [];
  let lastError = '';
  for (const model of models) {
    const started = now();
    try {
      const data = await postChat({ ...options, model });
      const result = extractText(data);
      attempts.push({ model, status: 'ok', latency_ms: Math.round(now() - started) });
      return { result, model, attempts };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({
        model,
        status: 'failed',
        latency_ms: Math.round(now() - started),
        error: message,
      });
      lastError = message;
    }
  }
  throw new Error(
    `all ${models.length} model(s) failed (${models.join(', ')}); last error: ${lastError}`,
  );
}

/** 成功信封（MCP 兼容）。 */
export function envelopeOk(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return payload;
}

/** 失败信封（MCP 兼容）。 */
export function envelopeFail(taskType: string, error: string): Record<string, unknown> {
  return { ok: false, task_type: taskType, error };
}
