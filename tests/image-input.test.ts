/**
 * image-input 归一化单测：路径 / http / data: / 裸 base64、MIME 表与魔数猜测。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guessMimeFromDataUrl, normalizeImageInput, toDataUrl, admitImage } from '../src/image-input.ts';

/** 1x1 透明 PNG 的 base64。 */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('guessMimeFromDataUrl: 前缀声明优先', () => {
  assert.equal(guessMimeFromDataUrl(`data:image/jpeg;base64,${PNG_B64}`), 'image/jpeg');
  assert.equal(guessMimeFromDataUrl(`data:image/webp;base64,${PNG_B64}`), 'image/webp');
  assert.equal(guessMimeFromDataUrl(`data:image/gif;base64,${PNG_B64}`), 'image/gif');
  // 声明保留原样（直连路径可用）；附件服务会在 admit 时按白名单过滤。
  assert.equal(guessMimeFromDataUrl(`data:image/svg+xml;base64,${PNG_B64}`), 'image/svg+xml');
  // 非 image/ 前缀回落 image/png。
  assert.equal(guessMimeFromDataUrl(`data:text/plain;base64,${PNG_B64}`), 'image/png');
});

test('guessMimeFromDataUrl: 无前缀时按魔数猜测', () => {
  assert.equal(guessMimeFromDataUrl(`data:;base64,${PNG_B64}`), 'image/png');
  assert.equal(guessMimeFromDataUrl(`data:;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64')}`), 'image/jpeg');
});

test('normalizeImageInput: 本地路径（含 MIME 表）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vision-img-'));
  try {
    const file = join(dir, 'photo.PNG');
    const bytes = Buffer.from(PNG_B64, 'base64');
    await writeFile(file, bytes);
    const image = await normalizeImageInput(file);
    assert.equal(image.mime, 'image/png');
    assert.equal(image.source, 'path');
    assert.equal(image.name, 'photo.PNG');
    assert.deepEqual([...image.bytes], [...bytes]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('normalizeImageInput: 缺失文件抛错', async () => {
  await assert.rejects(() => normalizeImageInput(join(tmpdir(), 'no-such-file.png')), /image file not found/);
});

test('normalizeImageInput: http URL 不取回字节', async () => {
  const image = await normalizeImageInput('https://example.com/a.png');
  assert.equal(image.source, 'http');
  assert.equal(image.bytes.length, 0);
});

test('normalizeImageInput: data: URL 解码', async () => {
  const image = await normalizeImageInput(`data:image/png;base64,${PNG_B64}`);
  assert.equal(image.source, 'data');
  assert.equal(image.mime, 'image/png');
  assert.equal(Buffer.from(image.bytes).toString('base64'), PNG_B64);
});

test('normalizeImageInput: 裸 base64 按魔数猜测', async () => {
  const image = await normalizeImageInput(PNG_B64);
  assert.equal(image.source, 'base64');
  assert.equal(image.mime, 'image/png');
});

test('toDataUrl: 内联 base64（http 源直传原 URL）', async () => {
  const image = await normalizeImageInput(`data:image/png;base64,${PNG_B64}`);
  assert.equal(toDataUrl(image, `data:image/png;base64,${PNG_B64}`), `data:image/png;base64,${PNG_B64}`);
  const http = await normalizeImageInput('https://example.com/a.png');
  assert.equal(toDataUrl(http, 'https://example.com/a.png'), 'https://example.com/a.png');
});

test('admitImage: 附件服务保存成功', async () => {
  const image = await normalizeImageInput(`data:image/png;base64,${PNG_B64}`);
  let saved: unknown;
  const attachments = {
    async saveImage(input: { data: Uint8Array; mediaType: string }) {
      saved = input;
      return { attachmentId: 'id-1', mediaType: input.mediaType, bytes: input.data.byteLength, width: 1, height: 1 };
    },
  };
  const ref = await admitImage(attachments as never, image);
  assert.ok(ref !== undefined);
  assert.equal((saved as { mediaType: string }).mediaType, 'image/png');
});

test('admitImage: 无附件服务 / http 源返回 undefined', async () => {
  const image = await normalizeImageInput(`data:image/png;base64,${PNG_B64}`);
  assert.equal(await admitImage(undefined, image), undefined);
  const http = await normalizeImageInput('https://example.com/a.png');
  assert.equal(await admitImage({ saveImage: async () => ({}) } as never, http), undefined);
});
