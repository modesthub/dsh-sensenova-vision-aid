/**
 * bridge 视觉链的真实 API 集成验证（可选：无 key 时自跳过）。
 * 用测试图模拟"拖入的图片附件"，经 base64 data URL → runChain 真实调用
 * SenseNova，验证 bridge 路径下的视觉识别可用。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runChain, imagePart } from '../src/direct.ts';
import { readCredentialRefYaml } from '../src/credentials.ts';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';

const TEST_IMAGE = 'D:/TRAE_Space/research-deepseek-harness/垃圾站/屏幕截图 2026-10-02 185740.png';

test('bridge vision chain: 真实 SenseNova 识别（无凭据时跳过）', { timeout: 120_000 }, async () => {
  const credentialsPath = `${resolveDshHome()}/.credentials.yaml`;
  const key = await readCredentialRefYaml(credentialsPath, 'SENSENOVA_API_KEY_8');
  if (key === undefined) {
    console.log('skip: no SENSENOVA_API_KEY_8 in credentials.yaml');
    return;
  }
  if (!existsSync(TEST_IMAGE)) {
    console.log('skip: test image not found');
    return;
  }
  const bytes = readFileSync(TEST_IMAGE);
  const b64 = Buffer.from(bytes).toString('base64');
  const content = [
    imagePart(`data:image/png;base64,${b64}`, 'image_url'),
    { type: 'text', text: '请分析这张图片，帮助另一个无法直接看图的模型回答用户。如果是界面截图，请准确转录关键文字。' },
  ];
  const chain = await runChain(
    { apiBase: 'https://token.sensenova.cn/v1', content, apiKey: key, timeoutMs: 60_000 },
    ['sensenova-6.8-flash-lite', 'deepseek-flash', 'kimi-k3'],
  );
  assert.equal(chain.attempts.some(a => a.status === 'ok'), true);
  assert.ok(chain.result.trim().length > 0);
  console.log(`bridge chain -> model=${chain.model} attempts=${JSON.stringify(chain.attempts.map(a => `${a.model}:${a.status}`))}`);
  console.log(`observation: ${chain.result.slice(0, 100)}`);
});
