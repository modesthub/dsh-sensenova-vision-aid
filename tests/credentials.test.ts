/**
 * credentials / config 归一化的单测：三层回退、ref 语法过滤、模型链解析。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { plainConfig, resolveAdapterOptions, resolveModelChain, normalizeTimeoutMs } from '../src/config.ts';
import { readCredentialRefYaml, resolveApiKey } from '../src/credentials.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 最小 ctx 桩：get() 按名字返回已注入服务。 */
function ctxWith(services: Record<string, unknown>): never {
  const ctx = {
    get(name: string): unknown {
      return services[name];
    },
  };
  return ctx as never;
}

test('readCredentialRefYaml: 解析 refs: 块、跳过注释、离开块即停', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vision-creds-'));
  try {
    const file = join(dir, '.credentials.yaml');
    await writeFile(file, [
      'version: 1',
      'refs:',
      '  SENSENOVA_API_KEY: "sk-abc"',
      '  # comment',
      "  SENSENOVA_API_KEY_2: 'sk-2'",
      'records:',
      '  something: 1',
      'refs:',
      '  LATE_KEY: sk-late',
    ].join('\n'), 'utf8');
    assert.equal(await readCredentialRefYaml(file, 'SENSENOVA_API_KEY'), 'sk-abc');
    assert.equal(await readCredentialRefYaml(file, 'SENSENOVA_API_KEY_2'), 'sk-2');
    // 离开第一个 refs: 块后不再读取第二个块（与 server.py 行为一致）。
    assert.equal(await readCredentialRefYaml(file, 'LATE_KEY'), undefined);
    assert.equal(await readCredentialRefYaml(file, 'MISSING'), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readCredentialRefYaml: 文件缺失返回 undefined（不抛）', async () => {
  assert.equal(await readCredentialRefYaml(join(tmpdir(), 'no-such-dir', '.credentials.yaml'), 'X'), undefined);
});

test('resolveApiKey: credentials 服务优先', async () => {
  let calls = 0;
  const ctx = ctxWith({
    credentials: {
      async resolve() {
        calls += 1;
        return { value: 'from-service', source: 'file' };
      },
    },
    launchEnvironment: { get: () => undefined },
  });
  assert.equal(await resolveApiKey(ctx, 'SENSENOVA_API_KEY'), 'from-service');
  assert.equal(calls, 1);
});

test('resolveApiKey: 服务缺失时回落启动环境', async () => {
  const ctx = ctxWith({
    launchEnvironment: { get: (name: string) => (name === 'SENSENOVA_API_KEY' ? { value: 'from-env', source: 'process' } : undefined) },
  });
  assert.equal(await resolveApiKey(ctx, 'SENSENOVA_API_KEY'), 'from-env');
});

test('resolveApiKey: 非法 ref 名直接返回 undefined', async () => {
  const ctx = ctxWith({});
  assert.equal(await resolveApiKey(ctx, 'not a ref!'), undefined);
  assert.equal(await resolveApiKey(ctx, ''), undefined);
});

test('plainConfig: 解包 volatile 引用', () => {
  const volatile = (v: unknown) => ({ get: () => v });
  const out = plainConfig({
    reuseFreeapiCredentials: volatile(true),
    keyRef: volatile('SENSENOVA_API_KEY'),
    modelChain: volatile('a,b,c'),
  } as never);
  assert.deepEqual(out, { reuseFreeapiCredentials: true, keyRef: 'SENSENOVA_API_KEY', modelChain: 'a,b,c' });
});

test('resolveAdapterOptions: 默认值齐全', () => {
  const options = resolveAdapterOptions({});
  assert.equal(options.keyRef, 'SENSENOVA_API_KEY');
  assert.equal(options.apiBase, 'https://token.sensenova.cn/v1');
  assert.deepEqual(options.modelChain, ['sensenova-6.8-flash-lite', 'deepseek-flash', 'kimi-k3']);
  assert.equal(options.imageMode, 'image_url');
  assert.equal(options.timeoutMs, 180_000);
  assert.equal(options.useSubagent, false);
  assert.equal(options.subagentProvider, 'spawn');
  assert.equal(options.subagentModel, 'sensenova-6.8-flash-lite');
  assert.equal(options.useContinuable, false);
});

test('resolveAdapterOptions: 用户覆盖与非法值归一化', () => {
  const options = resolveAdapterOptions({
    keyRef: ' SENSENOVA_API_KEY_2 ',
    apiBase: 'https://x.example/v1/',
    modelChain: 'kimi-k3, deepseek-flash, kimi-k3',
    imageMode: 'image_base64',
    timeoutMs: 500,
    useSubagent: false,
    subagentModel: 'deepseek-flash',
  });
  assert.equal(options.keyRef, 'SENSENOVA_API_KEY_2');
  assert.equal(options.apiBase, 'https://x.example/v1');
  assert.deepEqual(options.modelChain, ['kimi-k3', 'deepseek-flash']);
  assert.equal(options.imageMode, 'image_base64');
  assert.equal(options.timeoutMs, 180_000); // 低于 1000 回退默认
  assert.equal(options.useSubagent, false);
  assert.equal(options.subagentModel, 'deepseek-flash');
});

test('resolveModelChain: 空输入回落默认链', () => {
  assert.deepEqual(resolveModelChain(''), ['sensenova-6.8-flash-lite', 'deepseek-flash', 'kimi-k3']);
  assert.deepEqual(resolveModelChain('  , , '), ['sensenova-6.8-flash-lite', 'deepseek-flash', 'kimi-k3']);
});

test('normalizeTimeoutMs: 非法值回退默认', () => {
  assert.equal(normalizeTimeoutMs(1234), 1234);
  assert.equal(normalizeTimeoutMs(0), 180_000);
  assert.equal(normalizeTimeoutMs(NaN), 180_000);
});
