/**
 * orchestrator 单测：子 agent 可用→走子 agent；不可用→直连；子 agent 失败→直连；
 * chat 恒走直连；失败信封形状。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Context } from '@deepseek-ai/cordis';
import { describe, chat } from '../src/orchestrator.ts';
import type { ResolvedVisionAidOptions } from '../src/config.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function options(overrides: Partial<ResolvedVisionAidOptions> = {}): ResolvedVisionAidOptions {
  return {
    apiBase: 'https://token.sensenova.cn/v1',
    keyRef: 'SENSENOVA_API_KEY',
    modelChain: ['sensenova-6.8-flash-lite', 'deepseek-flash', 'kimi-k3'],
    imageMode: 'image_url',
    timeoutMs: 5000,
    useSubagent: true,
    subagentProvider: 'spawn',
    subagentModel: 'sensenova-6.8-flash-lite',
    useContinuable: false,
    ...overrides,
  };
}

/** 最小 exec 桩：agent 存在（子 agent 路径需要 parent）。 */
function execStub() {
  return {
    agent: { id: 'parent-1' },
    signal: new AbortController().signal,
  } as never;
}

/** 构造带可注入服务的 ctx（get() 返回服务；缺失 undefined）。 */
function makeCtx(services: Record<string, unknown>): Context {
  return {
    get(name: string): unknown {
      return services[name];
    },
    logger: { warn: () => undefined, info: () => undefined, error: () => undefined },
  } as unknown as Context;
}

/** 捕获 subagents.start 的请求（断言 toolFilter 按注册表过滤）。 */
function capturingSubagents(services: Record<string, unknown>) {
  const requests: Array<{ label?: string; toolFilter?: unknown; agentOptions?: unknown }> = [];
  services['subagents'] = {
    getProvider: () => ({ capabilities: { agentOptions: true, persona: true, toolFilter: true, depthLimit: true } }),
    // 签名：start(name, request)；只捕获第二个参数（request）。
    start: async (_name: string, request: { label?: string; toolFilter?: unknown; agentOptions?: unknown }) => {
      requests.push({ label: request.label, toolFilter: request.toolFilter, agentOptions: request.agentOptions });
      return {
        result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'ok' }] }),
        dispose: async () => undefined,
      };
    },
  };
  services['llm'] = { resolveCallConfig: async () => ({ provider: 'sensenova', model: 'm' }) };
  services['attachments'] = {
    saveImage: async (input: { data: Uint8Array; mediaType: string }) => ({
      attachmentId: 'id-1', mediaType: input.mediaType, bytes: input.data.byteLength, width: 1, height: 1,
    }),
  };
  return requests;
}

test('describe_image: toolFilter deny 名单按注册表过滤（未注册名不列出）', async () => {
  const file = await makeLocalPng();
  try {
    const services: Record<string, unknown> = {};
    const requests = capturingSubagents(services);
    // 注册表里只有 send_message 被注册（subagent/subagent_fork 缺失）。
    services['tools'] = { get: (name: string) => (name === 'send_message' ? {} : undefined) };
    const ctx = makeCtx(services);
    const envelope = JSON.parse(await describe(ctx, execStub(), { image: file }, options(), 'image_reasoning'));
    assert.equal(envelope.ok, true);
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0]?.toolFilter, { deny: ['send_message'] });
    assert.deepEqual(requests[0]?.agentOptions, { provider: 'sensenova', model: 'sensenova-6.8-flash-lite' });
  } finally {
    await rm(join(file, '..'), { recursive: true, force: true });
  }
});

test('describe_image: 注册表缺失时省略 toolFilter（不阻塞 spawn）', async () => {
  const file = await makeLocalPng();
  try {
    const services: Record<string, unknown> = {};
    const requests = capturingSubagents(services);
    const ctx = makeCtx(services); // 无 tools 服务
    const envelope = JSON.parse(await describe(ctx, execStub(), { image: file }, options(), 'image_reasoning'));
    assert.equal(envelope.ok, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.toolFilter, undefined);
  } finally {
    await rm(join(file, '..'), { recursive: true, force: true });
  }
});

/** 一次成功的子 agent 运行（stopReason completed）。 */
function subagentOk(services: Record<string, unknown>, text = 'recognized text') {
  services['subagents'] = {
    getProvider: () => ({ capabilities: { agentOptions: true, persona: true, toolFilter: true, depthLimit: true } }),
    start: async () => ({
      result: Promise.resolve({
        stopReason: 'completed',
        output: [{ type: 'text', text }],
      }),
      dispose: async () => undefined,
    }),
  };
  services['llm'] = { resolveCallConfig: async () => ({ provider: 'sensenova', model: 'm' }) };
  services['attachments'] = {
    saveImage: async (input: { data: Uint8Array; mediaType: string }) => ({
      attachmentId: 'id-1',
      mediaType: input.mediaType,
      bytes: input.data.byteLength,
      width: 1,
      height: 1,
    }),
  };
}

async function makeLocalPng(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vision-orch-'));
  const file = join(dir, 'a.png');
  await writeFile(file, Buffer.from(PNG_B64, 'base64'));
  return file;
}

test('describe_image: 子 agent 路径成功（信封含 attempts 单条）', async () => {
  const file = await makeLocalPng();
  try {
    const services: Record<string, unknown> = {};
    subagentOk(services);
    const ctx = makeCtx(services);
    const envelope = JSON.parse(await describe(ctx, execStub(), { image: file }, options(), 'image_reasoning'));
    assert.equal(envelope.ok, true);
    assert.equal(envelope.task_type, 'image_reasoning');
    assert.equal(envelope.tool_used, 'sensenova:sensenova-6.8-flash-lite');
    assert.equal(envelope.confidence, 'high');
    assert.equal(envelope.result, 'recognized text');
    assert.equal(envelope.metadata.attempts.length, 1);
    assert.equal(envelope.metadata.attempts[0].status, 'ok');
  } finally {
    await rm(join(file, '..'), { recursive: true, force: true });
  }
});

test('describe_image: 子 agent 不可用（无 subagents 服务）回落直连', async () => {
  const file = await makeLocalPng();
  try {
    const services: Record<string, unknown> = {
      credentials: { resolve: async () => ({ value: 'sk-test', source: 'file' }) },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        assert.ok(init !== undefined);
        const body = JSON.parse(init.body as string);
        assert.equal(body.model, 'sensenova-6.8-flash-lite');
        return new Response(JSON.stringify({ choices: [{ message: { content: 'direct result' } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch,
    };
    const ctx = makeCtx(services);
    const envelope = JSON.parse(await describe(ctx, execStub(), { image: file }, options(), 'image_reasoning'));
    assert.equal(envelope.ok, true);
    assert.equal(envelope.tool_used, 'sensenova:sensenova-6.8-flash-lite');
    assert.equal(envelope.result, 'direct result');
    // 子 agent 失败单条 + 直连成功单条。
    assert.equal(envelope.metadata.attempts.length, 2);
    assert.equal(envelope.metadata.attempts[0].status, 'failed');
    assert.equal(envelope.metadata.attempts[1].status, 'ok');
  } finally {
    await rm(join(file, '..'), { recursive: true, force: true });
  }
});

test('describe_image: 子 agent 失败（stopReason error）回落直连', async () => {
  const file = await makeLocalPng();
  try {
    const services: Record<string, unknown> = {
      credentials: { resolve: async () => ({ value: 'sk-test', source: 'file' }) },
      subagents: {
        getProvider: () => ({ capabilities: { agentOptions: true, persona: true, toolFilter: true, depthLimit: true } }),
        start: async () => ({
          result: Promise.resolve({ stopReason: 'error', output: [], diagnostic: 'boom' }),
          dispose: async () => undefined,
        }),
      },
      llm: { resolveCallConfig: async () => ({ provider: 'sensenova', model: 'm' }) },
      attachments: {
        saveImage: async (input: { data: Uint8Array; mediaType: string }) => ({
          attachmentId: 'id-1', mediaType: input.mediaType, bytes: input.data.byteLength, width: 1, height: 1,
        }),
      },
      fetch: (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'direct result' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch,
    };
    const ctx = makeCtx(services);
    const envelope = JSON.parse(await describe(ctx, execStub(), { image: file }, options(), 'image_reasoning'));
    assert.equal(envelope.ok, true);
    assert.equal(envelope.result, 'direct result');
    assert.equal(envelope.metadata.attempts[0].status, 'failed');
    assert.ok(String(envelope.metadata.attempts[0].error).includes('fell back'));
  } finally {
    await rm(join(file, '..'), { recursive: true, force: true });
  }
});

test('describe_image: 凭据缺失返回失败信封', async () => {
  const file = await makeLocalPng();
  const dir = await mkdtemp(join(tmpdir(), 'vision-empty-home-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = dir;
  try {
    // 无凭据服务、无启动环境、空 DSH_HOME ⇒ 解析链全空 ⇒ 清晰报错。
    const ctx = makeCtx({});
    const envelope = JSON.parse(await describe(ctx, execStub(), { image: file }, options(), 'image_reasoning'));
    assert.equal(envelope.ok, false);
    assert.equal(envelope.task_type, 'image_reasoning');
    assert.ok(String(envelope.error).includes('SENSENOVA_API_KEY'));
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(dir, { recursive: true, force: true });
    await rm(join(file, '..'), { recursive: true, force: true });
  }
});

test('describe_images: 多图信封含 image_count', async () => {
  const file = await makeLocalPng();
  try {
    const services: Record<string, unknown> = {
      credentials: { resolve: async () => ({ value: 'sk-test', source: 'file' }) },
      fetch: (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'multi result' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch,
    };
    const ctx = makeCtx(services);
    const envelope = JSON.parse(await describe(ctx, execStub(), { images: [file, file] }, options(), 'image_reasoning_multi'));
    assert.equal(envelope.ok, true);
    assert.equal(envelope.task_type, 'image_reasoning_multi');
    assert.equal(envelope.image_count, 2);
  } finally {
    await rm(join(file, '..'), { recursive: true, force: true });
  }
});

test('describe_image: 空图片参数返回失败信封', async () => {
  const ctx = makeCtx({});
  const envelope = JSON.parse(await describe(ctx, execStub(), {}, options(), 'image_reasoning'));
  assert.equal(envelope.ok, false);
  assert.ok(String(envelope.error).includes('at least one image'));
});

test('chat: 恒走直连并返回 pong', async () => {
  const services: Record<string, unknown> = {
    credentials: { resolve: async () => ({ value: 'sk-test', source: 'file' }) },
    fetch: (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch,
  };
  const ctx = makeCtx(services);
  const envelope = JSON.parse(await chat(ctx, { text: 'Reply with exactly: pong' }, options()));
  assert.equal(envelope.ok, true);
  assert.equal(envelope.task_type, 'chat');
  assert.equal(envelope.result, 'pong');
  assert.equal(envelope.confidence, undefined);
});

test('chat: 空文本返回失败信封', async () => {
  const ctx = makeCtx({});
  const envelope = JSON.parse(await chat(ctx, { text: '  ' }, options()));
  assert.equal(envelope.ok, false);
  assert.equal(envelope.task_type, 'chat');
});
