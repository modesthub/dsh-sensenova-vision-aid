/**
 * 唯一密钥解析入口：credential-ref → 进程/文件凭据 → YAML 兜底。
 *
 * 解析顺序（与 freeapi 的 `resolveRef` 一致，追加 server.py `_read_credential_ref`
 * 的 TS 移植作为最后兜底）：
 *
 * 1. `ctx.get('credentials')?.resolve(credentialRef(refName))` —— DSH 凭据服务
 *    （自身分层：进程环境 > $DSH_HOME/.credentials.yaml > .env）；
 * 2. `launchEnvironmentOf(ctx).get(refName)` —— 启动环境快照直读；
 * 3. `readCredentialRefYaml(join(resolveDshHome(), '.credentials.yaml'), refName)`
 *    —— 无 yaml 依赖地解析 `refs:` 块（MCP server.py 同款）。
 *
 * 密钥值**永不**写日志：只存在于内存中，由直连路径的 `Authorization` 头消费。
 *
 * @module dsh-sensenova-vision-aid/credentials
 */

import type { Context } from '@deepseek-ai/cordis';
import { credentialRef, isCredentialRefName } from '@deepseek-ai/dsh-credentials';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 无 yaml 依赖地读取 DSH 凭据文件（`~/.dsh/.credentials.yaml`）的 `refs:` 块中的
 * 一个引用值（server.py `_read_credential_ref` 的 TS 移植）。只解析 `refs:` 块内的
 * 缩进 `key: value` 行、跳过注释，离开缩进块即停。文件缺失/引用缺失返回 undefined
 * （与 server.py 抛错不同：这是凭据服务的最后兜底，缺失即视为「未配置」）。
 */
export async function readCredentialRefYaml(
  path: string,
  ref: string,
): Promise<string | undefined> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
  let inRefs = false;
  for (const raw of text.split(/\r?\n/)) {
    const stripped = raw.trim();
    if (stripped === '' || stripped.startsWith('#')) continue;
    if (stripped === 'refs:') {
      inRefs = true;
      continue;
    }
    if (!inRefs) continue;
    if (raw.startsWith(' ') && stripped.includes(':')) {
      const [key, ...rest] = stripped.split(':');
      if (key === undefined) continue;
      const value = rest.join(':').trim().replace(/^["']|["']$/g, '');
      if (key.trim() === ref && value !== '') return value;
    } else {
      // 离开 refs: 块（records:/version: 或任何别的顶层键）。
      break;
    }
  }
  return undefined;
}

/** 凭据服务的最小结构面（避免依赖完整类型而增加 dev 依赖面）。 */
export interface CredentialsLike {
  resolve(ref: unknown): Promise<{ value?: unknown; source?: string } | undefined>;
}

/** 解析一个引用名：先校验语法，再按三层顺序解析。返回 undefined 表示未配置。 */
export async function resolveApiKey(ctx: Context, refName: string): Promise<string | undefined> {
  const trimmed = refName.trim();
  // 防御性校验：即使配置被程序化构造污染，非合法 ref 名也不得进入请求。
  if (!isCredentialRefName(trimmed)) return undefined;

  const credentials = ctx.get('credentials') as CredentialsLike | undefined;
  if (credentials !== undefined) {
    try {
      const resolved = await credentials.resolve(credentialRef(trimmed));
      if (resolved !== undefined && typeof resolved.value === 'string' && resolved.value !== '') {
        return resolved.value;
      }
    } catch {
      // 凭据服务解析失败降级到环境直读（绝不因服务异常中断识别）。
    }
  }

  const ambient = launchEnvironmentOf(ctx).get(trimmed);
  if (ambient !== undefined && ambient.value.length > 0) return ambient.value;

  return readCredentialRefYaml(join(resolveDshHome(), '.credentials.yaml'), trimmed);
}

/** 描述一个引用名的配置态（只回 configured 布尔，绝不含值）。 */
export async function describeApiKey(ctx: Context, refName: string): Promise<boolean> {
  return (await resolveApiKey(ctx, refName)) !== undefined;
}
