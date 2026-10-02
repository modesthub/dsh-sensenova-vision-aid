/**
 * 图片输入归一化：本地路径 / http(s) URL / data: URL / 裸 base64 → 字节 + MIME；
 * 以及经附件服务保存为 `ImageAttachmentRef`（子 agent 路径的图片投递）。
 *
 * 与 MCP server.py 的 `_image_ref` 语义一致：`image_url` 模式本地文件内联为
 * `data:<mime>;base64,`（三个模型均支持）；http(s) 直传；`image_base64` 为遗留
 * 模式（token.sensenova.cn 实测 400，仅保留兼容）。
 *
 * @module dsh-sensenova-vision-aid/image-input
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';

/** 附件服务接受的媒体类型（attachment types.ts 的 ImageMediaType）。 */
const ATTACHMENT_MEDIA_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** 扩展名 → MIME（显式表，避免 Windows 注册表查不到返回 null；bmp 仅直连路径用）。 */
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

/** 一张归一化后的图片：字节 + MIME（直连路径 data: URL 用；bmp 为直连专用）。 */
export interface NormalizedImage {
  /** MIME 字符串；直连路径按原样内联，附件保存时按 ImageMediaType 校验。 */
  mime: string;
  bytes: Uint8Array;
  /** 是否来自本地文件（http(s) URL 无法内联字节给附件服务）。 */
  source: 'path' | 'http' | 'data' | 'base64';
  /** 本地文件名（无目录信息）或 undefined。 */
  name?: string;
}

/** 判断字符串是否为本地文件路径之外的直传形式。 */
function isUrlLike(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:');
}

/**
 * 解析裸 base64 的 MIME 前缀（`data:<mime>;base64,` 形式）；无前缀时按字节内容
 * 猜测：PNG/JPEG/GIF/WebP 魔数，无法识别回落 image/png（与 server.py `_mime_for`
 * 的宽容策略一致）。返回字符串（bmp 保留原值；附件保存时再收敛到 ImageMediaType）。
 */
export function guessMimeFromDataUrl(value: string): string {
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,/i.exec(value);
  if (match !== null && match[1] !== undefined) {
    const declared = match[1].toLowerCase();
    if (declared.startsWith('image/')) return declared;
    return 'image/png';
  }
  const body = value.indexOf(',') >= 0 ? value.slice(value.indexOf(',') + 1) : value;
  const sample = Buffer.from(body, 'base64').subarray(0, 12);
  if (sample.length >= 8
    && sample[0] === 0x89 && sample[1] === 0x50 && sample[2] === 0x4e && sample[3] === 0x47
    && sample[4] === 0x0d && sample[5] === 0x0a && sample[6] === 0x1a && sample[7] === 0x0a) {
    return 'image/png';
  }
  if (sample.length >= 3 && sample[0] === 0xff && sample[1] === 0xd8 && sample[2] === 0xff) {
    return 'image/jpeg';
  }
  if (sample.length >= 6 && sample[0] === 0x47 && sample[1] === 0x49 && sample[2] === 0x46
    && sample[3] === 0x38 && (sample[4] === 0x37 || sample[4] === 0x39) && sample[5] === 0x61) {
    return 'image/gif';
  }
  if (sample.length >= 12 && sample[0] === 0x52 && sample[1] === 0x49 && sample[2] === 0x46
    && sample[3] === 0x46 && sample[8] === 0x57 && sample[9] === 0x45 && sample[10] === 0x42
    && sample[11] === 0x50) {
    return 'image/webp';
  }
  return 'image/png';
}

/**
 * 归一化一个图片输入（本地路径 / http(s) URL / data: URL / 裸 base64）。
 * http(s) URL 不取回字节（直连路径按 URL 直传；附件服务不支持 URL 字节内联），
 * 因此 `source === 'http'` 时 `bytes` 为空、`mime` 为 image/png 占位。
 */
export async function normalizeImageInput(raw: string): Promise<NormalizedImage> {
  const value = raw.trim();
  if (value === '') throw new Error('image input must be a non-empty string');

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return { mime: 'image/png', bytes: new Uint8Array(0), source: 'http' };
  }
  if (value.startsWith('data:')) {
    const semicolon = value.indexOf(';base64,');
    const comma = value.indexOf(',');
    if (semicolon < 0 || comma < 0) throw new Error('invalid data: URL (missing ;base64,)');
    const body = value.slice(semicolon + 8);
    const mime = guessMimeFromDataUrl(value);
    const bytes = Buffer.from(body, 'base64');
    if (bytes.length === 0) throw new Error('empty image bytes in data: URL');
    return { mime, bytes: new Uint8Array(bytes), source: 'data' };
  }
  // 裸 base64（不含 data: 前缀）按字节猜测 MIME。
  if (!isUrlLike(value) && /^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 32) {
    try {
      const bytes = Buffer.from(value.replace(/\s+/g, ''), 'base64');
      if (bytes.length > 0) return { mime: guessMimeFromDataUrl(`data:;base64,${value}`), bytes: new Uint8Array(bytes), source: 'base64' };
    } catch {
      // 落到本地路径分支。
    }
  }
  // 本地路径。
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(value));
  } catch {
    throw new Error(`image file not found: ${value}`);
  }
  const ext = extname(value).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? 'image/png';
  const leaf = value.split(/[\\/]/).pop() ?? '';
  return {
    mime,
    bytes,
    source: 'path',
    ...leaf !== '' ? { name: leaf } : {},
  };
}

/** 直连路径用：把归一化图片内联为 `data:<mime>;base64,`（http 源直传原 URL）。 */
export function toDataUrl(input: NormalizedImage, raw: string): string {
  if (input.source === 'http') return raw.trim();
  return `data:${input.mime};base64,${Buffer.from(input.bytes).toString('base64')}`;
}

/** 附件服务的最小结构面（`ctx.get('attachments')`）。 */
export interface AttachmentsLike {
  saveImage(input: { data: Uint8Array; mediaType: string; name?: string }): Promise<ImageAttachmentRef>;
}

/**
 * 把一张归一化图片保存为宿主持久化 `ImageAttachmentRef`（子 agent 路径投递用）。
 * 附件服务缺失、媒体类型不在附件白名单（如 bmp）或保存失败返回 undefined
 * （⇒ 子 agent 路径不可用，交由调用方回落直连）。http(s) 源无法提供字节 ⇒ undefined。
 */
export async function admitImage(
  attachments: AttachmentsLike | undefined,
  input: NormalizedImage,
): Promise<ImageAttachmentRef | undefined> {
  if (attachments === undefined || input.source === 'http' || input.bytes.length === 0) return undefined;
  // 附件服务只接受 ImageMediaType（png/jpeg/webp/gif）；bmp 等直连专用类型跳过。
  if (!ATTACHMENT_MEDIA_TYPES.includes(input.mime)) return undefined;
  try {
    return await attachments.saveImage({
      data: input.bytes,
      mediaType: input.mime,
      ...input.name === undefined ? {} : { name: input.name },
    });
  } catch {
    return undefined;
  }
}
