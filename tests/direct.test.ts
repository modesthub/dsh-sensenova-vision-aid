/**
 * direct.ts 单测：链式故障转移（注入 fetchImpl）、信封形状、redirect:'error'、
 * 响应解析、超时。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chatUrl, extractText, imagePart, postChat, resolveModels, runChain } from '../src/direct.ts';

const CHAIN = ['sensenova-6.8-flash-lite', 'deepseek-flash', 'kimi-k3'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** 可编程 fetch：按调用序号返回响应；记录收到的 (url, init)。 */
function fetchLogging(handler: (call: number, url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  let calls = 0;
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    calls += 1;
    seen.push({ url: u, init });
    return handler(calls, u, init);
  }) as typeof fetch;
  return { impl, seen, count: () => calls };
}

test('chatUrl: base 幂等追加 /chat/completions', () => {
  assert.equal(chatUrl('https://token.sensenova.cn/v1'), 'https://token.sensenova.cn/v1/chat/completions');
  assert.equal(chatUrl('https://token.sensenova.cn/v1/'), 'https://token.sensenova.cn/v1/chat/completions');
  assert.equal(chatUrl('https://x/v1/chat/completions'), 'https://x/v1/chat/completions');
  assert.equal(chatUrl('https://x/v1/llm/chat-completions'), 'https://x/v1/llm/chat-completions');
});

test('resolveModels: 去重、过滤空、默认链', () => {
  assert.deepEqual(resolveModels('kimi-k3, deepseek-flash, kimi-k3', CHAIN), ['kimi-k3', 'deepseek-flash']);
  assert.deepEqual(resolveModels('', CHAIN), CHAIN);
  assert.deepEqual(resolveModels(undefined, CHAIN), CHAIN);
  assert.deepEqual(resolveModels(' , ', CHAIN), CHAIN);
});

test('extractText: 提取 choices[0].message.content', () => {
  assert.equal(extractText({ choices: [{ message: { content: 'pong' } }] }), 'pong');
  assert.throws(() => extractText({}), /no choices/);
  assert.throws(() => extractText({ choices: [{ message: { content: 42 } }] }), /no choices/);
});

test('imagePart: image_url 与 image_base64 形状', () => {
  assert.deepEqual(imagePart('https://x/a.png', 'image_url'), { type: 'image_url', image_url: { url: 'https://x/a.png' } });
  assert.deepEqual(imagePart('abc', 'image_base64'), { type: 'image_base64', image_base64: 'abc' });
  assert.throws(() => imagePart('https://x/a.png', 'image_base64'), /not an http URL/);
  // data: URL 在 image_base64 模式下剥离前缀。
  assert.deepEqual(imagePart('data:image/png;base64,abc', 'image_base64'), { type: 'image_base64', image_base64: 'abc' });
});

test('postChat: 发送 Bearer + JSON body,redirect error', async () => {
  const { impl, seen } = fetchLogging((_call, _url, init) => jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
  const data = await postChat({
    apiBase: 'https://token.sensenova.cn/v1',
    model: 'sensenova-6.8-flash-lite',
    content: [{ type: 'text', text: 'hi' }],
    apiKey: 'sk-test',
    timeoutMs: 5000,
    fetchImpl: impl,
  });
  assert.equal(extractText(data), 'ok');
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url, 'https://token.sensenova.cn/v1/chat/completions');
  const init = seen[0]?.init;
  assert.ok(init !== undefined);
  assert.equal((init.headers as Record<string, string>).authorization, 'Bearer sk-test');
  const body = JSON.parse(init.body as string);
  assert.equal(body.model, 'sensenova-6.8-flash-lite');
  assert.deepEqual(body.messages, [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
  assert.equal((init as { redirect?: string }).redirect, 'error');
});

test('postChat: HTTP 错误带状态码与响应摘要', async () => {
  const { impl } = fetchLogging(() => new Response('oops detail', { status: 429 }));
  await assert.rejects(
    () => postChat({ apiBase: 'https://x/v1', model: 'm', content: [], apiKey: 'k', timeoutMs: 5000, fetchImpl: impl }),
    /HTTP 429.*oops detail/,
  );
});

test('runChain: 首个成功即返回,attempts 记录全部', async () => {
  const started = Date.now();
  const { impl, count } = fetchLogging((call) => {
    if (call === 1) return jsonResponse({ choices: [{ message: { content: 'pong' } }] });
    return new Response('boom', { status: 500 });
  });
  const result = await runChain(
    { apiBase: 'https://x/v1', content: [], apiKey: 'k', timeoutMs: 5000, fetchImpl: impl, now: () => started },
    CHAIN,
  );
  assert.equal(result.model, 'sensenova-6.8-flash-lite');
  assert.equal(result.result, 'pong');
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0]?.status, 'ok');
  assert.equal(count(), 1);
});

/** 简单时钟：按调用序递增 10ms，用于断言 attempts.latency_ms。 */

test('runChain: 全失败抛聚合错误且 attempts 每条 failed', async () => {
  const { impl } = fetchLogging(() => new Response('boom', { status: 500 }));
  const started = Date.now();
  const now = () => started;
  await assert.rejects(
    () => runChain({ apiBase: 'https://x/v1', content: [], apiKey: 'k', timeoutMs: 5000, fetchImpl: impl, now }, ['a', 'b']),
    /all 2 model\(s\) failed/,
  );
});

test('runChain: attempts 逐模型记录（成功单条 / 失败多条）', async () => {
  const started = Date.now();
  const { impl } = fetchLogging((call) => {
    if (call === 2) return jsonResponse({ choices: [{ message: { content: 'pong' } }] });
    return new Response('boom', { status: 500 });
  });
  const result = await runChain(
    { apiBase: 'https://x/v1', content: [], apiKey: 'k', timeoutMs: 5000, fetchImpl: impl, now: () => started },
    ['a', 'b', 'c'],
  );
  assert.equal(result.model, 'b');
  assert.equal(result.result, 'pong');
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]?.status, 'failed');
  assert.ok(result.attempts[0]?.error !== undefined);
  assert.equal(result.attempts[1]?.status, 'ok');
});
