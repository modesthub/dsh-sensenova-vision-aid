import z from "@deepseek-ai/schemastery";
import { credentialRef, isCredentialRefName } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/config.ts
/**
* dsh-sensenova-vision-aid 的配置 schema 与归一化（host 侧）。
*
* 🔴 2026-09-24 freeapi 血泪教训：**每个叶子字段必须 `.volatile()`** —— 否则设置页
* 读不到真实配置（`settings.describe()` 的 `volatileForm()` 找不到任何 volatile 字段
* 会跳过整个 namespace，前端 ConfigForms.get(ns) 显示默认值）。嵌套对象整体
* `.volatile()`。`apply()` 入口必须先 `plainConfig()` 解包（见本文件底部）。
*
* @module dsh-sensenova-vision-aid/config
*/
/** 默认 apiBase（与 MCP server.py 的 DEFAULT_BASE_URL 一致）。 */
const DEFAULT_API_BASE = "https://token.sensenova.cn/v1";
/** 默认模型链：6.8 最先（读图最稳/最快），随后 deepseek-flash、kimi-k3。 */
const DEFAULT_MODEL_CHAIN = "sensenova-6.8-flash-lite,deepseek-flash,kimi-k3";
/** 默认凭据引用（与 dsh-sensenova-freeapi 共用同一把 key）。 */
const DEFAULT_KEY_REF = "SENSENOVA_API_KEY";
/** 默认直连单模型尝试超时（毫秒）。 */
const DEFAULT_TIMEOUT_MS = 18e4;
/** 默认子 agent provider。 */
const DEFAULT_SUBAGENT_PROVIDER = "spawn";
/** 子 agent 固定视觉模型 = 链首。 */
const DEFAULT_SUBAGENT_MODEL = "sensenova-6.8-flash-lite";
/**
* 对外导出的配置 schema。
*
* ⚠️ 类型断言是刻意的：`.volatile()` 把字段类型包成 `Volatile<T>`，下游读取处
* 必须先用 `plainConfig()` 解包（与 freeapi 同一范式）。
*/
const Config = z.object({
	reuseFreeapiCredentials: z.boolean().default(true).volatile(),
	keyRef: z.string().role("credential-ref").default(DEFAULT_KEY_REF).volatile(),
	apiBase: z.string().default(DEFAULT_API_BASE).volatile(),
	modelChain: z.string().default(DEFAULT_MODEL_CHAIN).volatile(),
	imageMode: z.union(["image_url", "image_base64"]).default("image_url").volatile(),
	timeoutMs: z.natural().min(1e3).default(DEFAULT_TIMEOUT_MS).volatile(),
	useSubagent: z.boolean().default(false).volatile(),
	subagentProvider: z.string().default(DEFAULT_SUBAGENT_PROVIDER).volatile(),
	subagentModel: z.string().default(DEFAULT_SUBAGENT_MODEL).volatile(),
	useContinuable: z.boolean().default(false).volatile()
});
/**
* cordis 的 `Volatile<T>` 在运行期是一个**只带 `get()` 的对象**。用结构化判定
* 而不是 `isVolatile()`：本插件的 tsdown `external` 白名单里没有 cosmokit。
*/
function isVolatileRef(value) {
	return typeof value === "object" && value !== null && typeof value.get === "function";
}
/**
* 把带 volatile 引用的配置解包成普通值（与 `.volatile()` 配套，缺了它整个插件
* 会读到引用对象）。
*/
function plainConfig(config) {
	const out = {};
	for (const [key, value] of Object.entries(config)) out[key] = isVolatileRef(value) ? value.get() : value;
	return out;
}
/** 归一化正整数毫秒；非法值回退 DEFAULT_TIMEOUT_MS（绝不抛）。 */
function normalizeTimeoutMs(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 1e3 ? Math.round(value) : DEFAULT_TIMEOUT_MS;
}
/** 解析逗号分隔模型链：trim、过滤空项、稳定去重。空结果回落默认链。 */
function resolveModelChain(value) {
	const raw = typeof value === "string" ? value : "";
	const seen = [];
	for (const item of raw.split(",")) {
		const id = item.trim();
		if (id !== "" && !seen.includes(id)) seen.push(id);
	}
	return seen.length > 0 ? seen : DEFAULT_MODEL_CHAIN.split(",");
}
/** 归一化 imageMode：仅接受 image_base64，其余回落 image_url。 */
function normalizeImageMode(value) {
	return value === "image_base64" ? "image_base64" : "image_url";
}
/** 归一化布尔；非布尔回落缺省。 */
function normalizeBool(value, fallback) {
	return typeof value === "boolean" ? value : fallback;
}
/**
* 从原始 config 到解析后运行事实的唯一显式步骤（freeapi 同款约定：程序化构造可能
* 绕过 Schemastery 归一化，因此每个默认值在此重新判定）。
*/
function resolveAdapterOptions(config) {
	const keyRefRaw = typeof config.keyRef === "string" ? config.keyRef.trim() : "";
	return {
		apiBase: typeof config.apiBase === "string" && config.apiBase.trim() !== "" ? config.apiBase.trim().replace(/\/+$/, "") : DEFAULT_API_BASE,
		keyRef: keyRefRaw !== "" ? keyRefRaw : DEFAULT_KEY_REF,
		modelChain: resolveModelChain(config.modelChain),
		imageMode: normalizeImageMode(config.imageMode),
		timeoutMs: normalizeTimeoutMs(config.timeoutMs),
		useSubagent: normalizeBool(config.useSubagent, false),
		subagentProvider: typeof config.subagentProvider === "string" && config.subagentProvider.trim() !== "" ? config.subagentProvider.trim() : DEFAULT_SUBAGENT_PROVIDER,
		subagentModel: typeof config.subagentModel === "string" && config.subagentModel.trim() !== "" ? config.subagentModel.trim() : DEFAULT_SUBAGENT_MODEL,
		useContinuable: normalizeBool(config.useContinuable, false)
	};
}
//#endregion
//#region src/credentials.ts
/**
* 无 yaml 依赖地读取 DSH 凭据文件（`~/.dsh/.credentials.yaml`）的 `refs:` 块中的
* 一个引用值（server.py `_read_credential_ref` 的 TS 移植）。只解析 `refs:` 块内的
* 缩进 `key: value` 行、跳过注释，离开缩进块即停。文件缺失/引用缺失返回 undefined
* （与 server.py 抛错不同：这是凭据服务的最后兜底，缺失即视为「未配置」）。
*/
async function readCredentialRefYaml(path, ref) {
	let text;
	try {
		text = await readFile(path, "utf8");
	} catch {
		return;
	}
	let inRefs = false;
	for (const raw of text.split(/\r?\n/)) {
		const stripped = raw.trim();
		if (stripped === "" || stripped.startsWith("#")) continue;
		if (stripped === "refs:") {
			inRefs = true;
			continue;
		}
		if (!inRefs) continue;
		if (raw.startsWith(" ") && stripped.includes(":")) {
			const [key, ...rest] = stripped.split(":");
			if (key === void 0) continue;
			const value = rest.join(":").trim().replace(/^["']|["']$/g, "");
			if (key.trim() === ref && value !== "") return value;
		} else break;
	}
}
/** 解析一个引用名：先校验语法，再按三层顺序解析。返回 undefined 表示未配置。 */
async function resolveApiKey(ctx, refName) {
	const trimmed = refName.trim();
	if (!isCredentialRefName(trimmed)) return void 0;
	const credentials = ctx.get("credentials");
	if (credentials !== void 0) try {
		const resolved = await credentials.resolve(credentialRef(trimmed));
		if (resolved !== void 0 && typeof resolved.value === "string" && resolved.value !== "") return resolved.value;
	} catch {}
	const ambient = launchEnvironmentOf(ctx).get(trimmed);
	if (ambient !== void 0 && ambient.value.length > 0) return ambient.value;
	return readCredentialRefYaml(join(resolveDshHome(), ".credentials.yaml"), trimmed);
}
/** 描述一个引用名的配置态（只回 configured 布尔，绝不含值）。 */
async function describeApiKey(ctx, refName) {
	return await resolveApiKey(ctx, refName) !== void 0;
}
//#endregion
//#region src/image-input.ts
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
/** 扩展名 → MIME（显式表，避免 Windows 注册表查不到返回 null；bmp 仅直连路径用）。 */
const MIME_BY_EXT = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".bmp": "image/bmp"
};
/** 判断字符串是否为本地文件路径之外的直传形式。 */
function isUrlLike(value) {
	return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:");
}
/**
* 解析裸 base64 的 MIME 前缀（`data:<mime>;base64,` 形式）；无前缀时按字节内容
* 猜测：PNG/JPEG/GIF/WebP 魔数，无法识别回落 image/png（与 server.py `_mime_for`
* 的宽容策略一致）。返回字符串（bmp 保留原值；附件保存时再收敛到 ImageMediaType）。
*/
function guessMimeFromDataUrl(value) {
	const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,/i.exec(value);
	if (match !== null && match[1] !== void 0) {
		const declared = match[1].toLowerCase();
		if (declared.startsWith("image/")) return declared;
		return "image/png";
	}
	const body = value.indexOf(",") >= 0 ? value.slice(value.indexOf(",") + 1) : value;
	const sample = Buffer.from(body, "base64").subarray(0, 12);
	if (sample.length >= 8 && sample[0] === 137 && sample[1] === 80 && sample[2] === 78 && sample[3] === 71 && sample[4] === 13 && sample[5] === 10 && sample[6] === 26 && sample[7] === 10) return "image/png";
	if (sample.length >= 3 && sample[0] === 255 && sample[1] === 216 && sample[2] === 255) return "image/jpeg";
	if (sample.length >= 6 && sample[0] === 71 && sample[1] === 73 && sample[2] === 70 && sample[3] === 56 && (sample[4] === 55 || sample[4] === 57) && sample[5] === 97) return "image/gif";
	if (sample.length >= 12 && sample[0] === 82 && sample[1] === 73 && sample[2] === 70 && sample[3] === 70 && sample[8] === 87 && sample[9] === 69 && sample[10] === 66 && sample[11] === 80) return "image/webp";
	return "image/png";
}
/**
* 归一化一个图片输入（本地路径 / http(s) URL / data: URL / 裸 base64）。
* http(s) URL 不取回字节（直连路径按 URL 直传；附件服务不支持 URL 字节内联），
* 因此 `source === 'http'` 时 `bytes` 为空、`mime` 为 image/png 占位。
*/
async function normalizeImageInput(raw) {
	const value = raw.trim();
	if (value === "") throw new Error("image input must be a non-empty string");
	if (value.startsWith("http://") || value.startsWith("https://")) return {
		mime: "image/png",
		bytes: /* @__PURE__ */ new Uint8Array(0),
		source: "http"
	};
	if (value.startsWith("data:")) {
		const semicolon = value.indexOf(";base64,");
		const comma = value.indexOf(",");
		if (semicolon < 0 || comma < 0) throw new Error("invalid data: URL (missing ;base64,)");
		const body = value.slice(semicolon + 8);
		const mime = guessMimeFromDataUrl(value);
		const bytes = Buffer.from(body, "base64");
		if (bytes.length === 0) throw new Error("empty image bytes in data: URL");
		return {
			mime,
			bytes: new Uint8Array(bytes),
			source: "data"
		};
	}
	if (!isUrlLike(value) && /^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 32) try {
		const bytes = Buffer.from(value.replace(/\s+/g, ""), "base64");
		if (bytes.length > 0) return {
			mime: guessMimeFromDataUrl(`data:;base64,${value}`),
			bytes: new Uint8Array(bytes),
			source: "base64"
		};
	} catch {}
	let bytes;
	try {
		bytes = new Uint8Array(await readFile(value));
	} catch {
		throw new Error(`image file not found: ${value}`);
	}
	const ext = extname(value).toLowerCase();
	const mime = MIME_BY_EXT[ext] ?? "image/png";
	const leaf = value.split(/[\\/]/).pop() ?? "";
	return {
		mime,
		bytes,
		source: "path",
		...leaf !== "" ? { name: leaf } : {}
	};
}
/** 直连路径用：把归一化图片内联为 `data:<mime>;base64,`（http 源直传原 URL）。 */
function toDataUrl(input, raw) {
	if (input.source === "http") return raw.trim();
	return `data:${input.mime};base64,${Buffer.from(input.bytes).toString("base64")}`;
}
//#endregion
//#region src/direct.ts
/** chat-completions base URL 幂等追加（server.py `_chat_url`）。 */
function chatUrl(baseUrl) {
	const base = baseUrl.replace(/\/+$/, "");
	if (base.endsWith("/chat/completions") || base.endsWith("/llm/chat-completions")) return base;
	return `${base}/chat/completions`;
}
/** 构造一个图片内容部件（server.py `_image_ref`）。 */
function imagePart(imageRef, mode) {
	if (mode === "image_base64") {
		let raw = imageRef;
		if (raw.startsWith("data:") && raw.includes(";base64,")) raw = raw.slice(raw.indexOf(";base64,") + 8);
		if (raw.startsWith("http://") || raw.startsWith("https://")) throw new Error("image_base64 mode needs base64 bytes or a local file path, not an http URL");
		return {
			type: "image_base64",
			image_base64: raw
		};
	}
	return {
		type: "image_url",
		image_url: { url: imageRef }
	};
}
/** 从响应 JSON 提取文本（server.py `_extract_text`）。 */
function extractText(data) {
	const choices = data["choices"];
	if (Array.isArray(choices) && choices.length > 0) {
		const first = choices[0];
		if (typeof first === "object" && first !== null) {
			const message = first["message"];
			if (typeof message === "object" && message !== null) {
				const content = message["content"];
				if (typeof content === "string") return content;
			}
		}
	}
	throw new Error(`SenseNova API response had no choices[0].message.content; raw response: ${JSON.stringify(data).slice(0, 800)}`);
}
/**
* 一次 POST（server.py `_post_chat` 的 fetch 版）。HTTP 错误带状态码与响应体摘要；
* 网络/超时错误带原因。**凭据请求拒重定向**（`redirect: 'error'`）。
*/
async function postChat(options) {
	const url = chatUrl(options.apiBase);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(/* @__PURE__ */ new Error(`SenseNova request timed out after ${options.timeoutMs}ms`)), options.timeoutMs);
	try {
		const response = await (options.fetchImpl ?? fetch)(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${options.apiKey}`
			},
			body: JSON.stringify({
				model: options.model,
				messages: [{
					role: "user",
					content: options.content
				}]
			}),
			redirect: "error",
			signal: controller.signal
		});
		if (!response.ok) {
			const detail = (await response.text()).slice(0, 800);
			throw new Error(`SenseNova API returned HTTP ${response.status} for ${url}: ${detail}`);
		}
		return await response.json();
	} finally {
		clearTimeout(timer);
	}
}
/**
* 逐模型尝试链（server.py `_run_chain`）：首个成功即返回，全部失败抛聚合错误。
* attempts 按尝试顺序记录每轮 `{model, status, latency_ms, error?}`。
*/
async function runChain(options, models) {
	const now = options.now ?? Date.now;
	const attempts = [];
	let lastError = "";
	for (const model of models) {
		const started = now();
		try {
			const result = extractText(await postChat({
				...options,
				model
			}));
			attempts.push({
				model,
				status: "ok",
				latency_ms: Math.round(now() - started)
			});
			return {
				result,
				model,
				attempts
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			attempts.push({
				model,
				status: "failed",
				latency_ms: Math.round(now() - started),
				error: message
			});
			lastError = message;
		}
	}
	throw new Error(`all ${models.length} model(s) failed (${models.join(", ")}); last error: ${lastError}`);
}
/** 失败信封（MCP 兼容）。 */
function envelopeFail(taskType, error) {
	return {
		ok: false,
		task_type: taskType,
		error
	};
}
//#endregion
//#region src/subagent-vision.ts
/** 识别人设：自包含 system prompt（shadow 部署 persona），要求输出纯文本结论。 */
const VISION_RECOGNITION_PERSONA = "You are a vision recognition helper. Describe the provided image(s) accurately and completely. Answer only the user's question about the image content. If the user asked to extract text (OCR), transcribe it faithfully. Return your final answer as plain text — do not use tools, do not ask for clarification, do not wrap the answer in JSON.";
/**
* 执行一次 one-shot 子 agent 识别。任何一步失败返回 SubagentVisionFailure（含具体
* 原因，orchestrator 透传到 attempts 便于诊断）；成功返回 SubagentVisionResult。
* 图片经附件服务 admit 为 ImageBlock；admit 失败（无附件服务 / http 源 / 保存异常）
* 同样以失败原因返回。
*/
async function runVisionSubagent(ctx, options) {
	const now = options.now ?? Date.now;
	const started = now();
	let run;
	try {
		const subagents = ctx.get("subagents");
		if (subagents === void 0) return { reason: "subagents service unavailable" };
		const spawnProvider = subagents.getProvider(options.provider);
		if (spawnProvider === void 0) return { reason: `subagent provider '${options.provider}' not found` };
		const capabilities = spawnProvider.capabilities ?? {};
		if (!capabilities.agentOptions || !capabilities.persona || !capabilities.toolFilter || !capabilities.depthLimit) return { reason: `spawn provider lacks capabilities: ${JSON.stringify(capabilities)}` };
		const llm = ctx.get("llm");
		if (llm === void 0) return { reason: "llm service unavailable" };
		try {
			await llm.resolveCallConfig({
				provider: "sensenova",
				model: options.model
			}, options.signal);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { reason: `llm.resolveCallConfig rejected sensenova/${options.model}: ${message}` };
		}
		const attachments = ctx.get("attachments");
		if (attachments === void 0) return { reason: "attachments service unavailable" };
		const blocks = [];
		for (const image of options.images) {
			const ref = await admitImageRef(attachments, image);
			if (ref === void 0) return { reason: `image admit failed for source '${image.source}' (http sources cannot be admitted)` };
			blocks.push({
				type: "image",
				attachment: ref
			});
		}
		blocks.push({
			type: "text",
			text: options.promptText
		});
		const denyNames = [
			"subagent",
			"send_message",
			"subagent_fork"
		].filter((name) => isToolRegistered(ctx, name));
		const toolFilter = denyNames.length > 0 ? { deny: denyNames } : void 0;
		run = await subagents.start(options.provider, {
			label: "sensenova-vision-aid:recognize",
			prompt: blocks,
			parent: options.parent,
			signal: options.signal,
			agentOptions: {
				provider: "sensenova",
				model: options.model
			},
			persona: VISION_RECOGNITION_PERSONA,
			...toolFilter === void 0 ? {} : { toolFilter }
		});
		const result = await run.result;
		if (result.stopReason !== "completed") return { reason: `subagent stopped with '${result.stopReason}' (expected 'completed')` };
		const text = result.output.filter((block) => block.type === "text").map((block) => block.text).join("");
		if (text.trim() === "") return { reason: "subagent returned empty text output" };
		return {
			text,
			model: options.model,
			latencyMs: Math.round(now() - started)
		};
	} catch (error) {
		return { reason: `subagent path threw: ${error instanceof Error ? error.message : String(error)}` };
	} finally {
		if (run !== void 0) try {
			await run.dispose();
		} catch {}
	}
}
/** 单图 admit（本地文件/裸 base64/data: 才有字节；http 源无法提供 ⇒ undefined）。 */
async function admitImageRef(attachments, image) {
	if (attachments === void 0 || image.source === "http" || image.bytes.length === 0) return void 0;
	try {
		return await attachments.saveImage({
			data: image.bytes,
			mediaType: image.mime,
			...image.name === void 0 ? {} : { name: image.name }
		});
	} catch {
		return;
	}
}
/** 该工具名是否已在全局注册（filter deny 名单用；注册表缺失时视为未注册）。 */
function isToolRegistered(ctx, name) {
	return ctx.get("tools")?.get(name) !== void 0;
}
//#endregion
//#region src/orchestrator.ts
/** 从工具参数提取并归一化图片数组（describe_image 单图包装为数组）。 */
async function normalizeImagesOf(args) {
	const raws = args.images ?? (args.image !== void 0 ? [args.image] : []);
	if (raws.length === 0) throw new Error("at least one image is required");
	const normalized = [];
	for (const raw of raws) {
		if (typeof raw !== "string" || raw.trim() === "") throw new Error(`each image must be a non-empty string, got ${JSON.stringify(raw)}`);
		normalized.push(await normalizeImageInput(raw));
	}
	return normalized;
}
/** 解析用户覆盖：空串/未传用配置值。 */
function resolveOverrides(args, options) {
	const requestedChain = args.model !== void 0 && args.model.trim() !== "" ? args.model.split(",").map((m) => m.trim()).filter((m) => m !== "") : [];
	return {
		modelChain: requestedChain.length > 0 ? requestedChain : options.modelChain,
		apiBase: args.base_url !== void 0 && args.base_url.trim() !== "" ? args.base_url.trim().replace(/\/+$/, "") : options.apiBase,
		imageMode: args.image_mode === "image_base64" ? "image_base64" : options.imageMode
	};
}
/**
* describe_image / describe_images 共用实现。
* @param taskType 信封的 task_type（单图 image_reasoning / 多图 image_reasoning_multi）。
* @param images 已归一化图片。
* @param raws 原始图片字符串（与 images 一一对应，直连路径 data: URL 用）。
*/
async function describe(ctx, exec, args, options, taskType) {
	const started = Date.now();
	const prompt = args.prompt ?? (taskType === "image_reasoning_multi" ? "Describe these images in detail." : "Describe this image in detail.");
	const overrides = resolveOverrides(args, options);
	const attempts = [];
	let images;
	let raws;
	try {
		images = await normalizeImagesOf(args);
		raws = args.images ?? (args.image !== void 0 ? [args.image] : []);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return JSON.stringify(envelopeFail(taskType, message));
	}
	if (options.useSubagent && images.length > 0) {
		const subagentStarted = Date.now();
		const viaSubagent = await trySubagentPath(ctx, exec, options, images, prompt, taskType);
		if (viaSubagent !== void 0 && "result" in viaSubagent) return JSON.stringify(viaSubagent);
		const failure = viaSubagent !== void 0 && "reason" in viaSubagent ? viaSubagent.reason : "no parent agent for subagent spawn";
		attempts.push({
			model: options.subagentModel,
			status: "failed",
			latency_ms: Date.now() - subagentStarted,
			error: failure
		});
	}
	try {
		const apiKey = await resolveApiKey(ctx, options.keyRef);
		if (apiKey === void 0) throw new Error(`no SenseNova API key for credential ref "${options.keyRef}"; configure it in the settings page, through the credentials service, or in ~/.dsh/.credentials.yaml (as dsh-sensenova-freeapi does)`);
		const content = [];
		for (let index = 0; index < images.length; index += 1) {
			const image = images[index];
			const raw = raws[index];
			if (image === void 0 || raw === void 0) continue;
			content.push(imagePart(toDataUrl(image, raw), overrides.imageMode));
		}
		if (prompt !== "") content.push({
			type: "text",
			text: prompt
		});
		const fetchImpl = fetchImplOf(ctx);
		const chain = await runChain({
			apiBase: overrides.apiBase,
			content,
			apiKey,
			timeoutMs: options.timeoutMs,
			...fetchImpl === void 0 ? {} : { fetchImpl }
		}, overrides.modelChain);
		attempts.push(...chain.attempts.map((attempt) => ({ ...attempt })));
		return JSON.stringify({
			ok: true,
			task_type: taskType,
			tool_used: `sensenova:${chain.model}`,
			confidence: "high",
			...taskType === "image_reasoning_multi" ? { image_count: images.length } : {},
			result: chain.result,
			metadata: {
				model: chain.model,
				base_url: overrides.apiBase,
				image_mode: overrides.imageMode,
				total_ms: Date.now() - started,
				attempts
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return JSON.stringify(envelopeFail(taskType, message));
	}
}
/**
* chat：恒走直连（快、省子 agent；同时作为 key/端点连通性验证）。
* 模型链按工具入参或配置；成功信封无 confidence（与 MCP 版一致）。
* 不需要 exec（不派生子 agent）——测试路由直接调用。
*/
async function chat(ctx, args, options) {
	const started = Date.now();
	const text = typeof args.text === "string" ? args.text : "";
	if (text.trim() === "") return JSON.stringify(envelopeFail("chat", "text must be a non-empty string"));
	const overrides = resolveOverrides(args, options);
	try {
		const apiKey = await resolveApiKey(ctx, options.keyRef);
		if (apiKey === void 0) throw new Error(`no SenseNova API key for credential ref "${options.keyRef}"; configure it in the settings page, through the credentials service, or in ~/.dsh/.credentials.yaml (as dsh-sensenova-freeapi does)`);
		const fetchImpl = fetchImplOf(ctx);
		const chain = await runChain({
			apiBase: overrides.apiBase,
			content: [{
				type: "text",
				text
			}],
			apiKey,
			timeoutMs: options.timeoutMs,
			...fetchImpl === void 0 ? {} : { fetchImpl }
		}, overrides.modelChain);
		return JSON.stringify({
			ok: true,
			task_type: "chat",
			tool_used: `sensenova:${chain.model}`,
			result: chain.result,
			metadata: {
				model: chain.model,
				base_url: overrides.apiBase,
				total_ms: Date.now() - started,
				attempts: chain.attempts.map((attempt) => ({ ...attempt }))
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return JSON.stringify(envelopeFail("chat", message));
	}
}
/** 子 agent 主路径尝试：成功返回成功信封对象，失败返回失败原因对象，无父 agent 返回 undefined。 */
async function trySubagentPath(ctx, exec, options, images, prompt, taskType) {
	if (exec.agent === void 0) return void 0;
	const started = Date.now();
	const result = await runVisionSubagent(ctx, {
		provider: options.subagentProvider,
		model: options.subagentModel,
		promptText: prompt,
		images,
		parent: exec.agent,
		signal: exec.signal
	});
	if (result === void 0) return void 0;
	if ("reason" in result) return result;
	return {
		ok: true,
		task_type: taskType,
		tool_used: `sensenova:${result.model}`,
		confidence: "high",
		...taskType === "image_reasoning_multi" ? { image_count: images.length } : {},
		result: result.text,
		metadata: {
			model: result.model,
			base_url: options.apiBase,
			image_mode: options.imageMode,
			total_ms: Date.now() - started,
			attempts: [{
				model: result.model,
				status: "ok",
				latency_ms: result.latencyMs
			}]
		}
	};
}
/** 可选注入的 fetch（测试用）：ctx 无 'fetch' 服务时回落全局 fetch。 */
function fetchImplOf(ctx) {
	const candidate = ctx.get("fetch");
	return typeof candidate === "function" ? candidate : void 0;
}
//#endregion
//#region src/status-api.ts
/** client 侧 settings.ts 的 STATUS_ROUTE / TEST_ROUTE **必须同值**。 */
const STATUS_ROUTE = "/api/sensenova-vision-aid/status";
const TEST_ROUTE = "/api/sensenova-vision-aid/test";
/** 探测 sensenova 路由是否可解析（freeapi 未装 / 路由缺失 ⇒ false，绝不抛）。 */
async function probeLlmRoute(ctx, model, signal) {
	const llm = ctx.get("llm");
	if (llm?.resolveCallConfig === void 0) return false;
	try {
		await llm.resolveCallConfig({
			provider: "sensenova",
			model
		}, signal);
		return true;
	} catch {
		return false;
	}
}
/** 组装 status 快照（绝不抛；缺失服务即降级）。 */
async function buildStatusSnapshot(ctx, options) {
	const resolved = options();
	const spawnProvider = ctx.get("subagents")?.getProvider?.(resolved.subagentProvider) !== void 0;
	const llmRouteResolvable = await probeLlmRoute(ctx, resolved.subagentModel);
	const refs = [];
	try {
		const configured = await describeApiKey(ctx, resolved.keyRef);
		refs.push({
			name: resolved.keyRef,
			configured
		});
	} catch {
		refs.push({
			name: resolved.keyRef,
			configured: false
		});
	}
	return {
		serviceAvailable: refs.some((ref) => ref.configured),
		refs,
		modelChain: resolved.modelChain.join(","),
		apiBase: resolved.apiBase,
		imageMode: resolved.imageMode,
		subagent: {
			serviceAvailable: spawnProvider && llmRouteResolvable,
			spawnProvider,
			llmRouteResolvable,
			defaultModel: resolved.subagentModel
		}
	};
}
/** GET status 处理函数。 */
async function handleStatusHttp(ctx, options, request) {
	if (request.method !== "GET") return new Response(null, {
		status: 405,
		headers: { allow: "GET" }
	});
	const snapshot = await buildStatusSnapshot(ctx, options);
	return new Response(JSON.stringify(snapshot), {
		status: 200,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		}
	});
}
/** POST test 处理函数：跑 chat 工具（直连路径），返回 ok/model 或 ok/error。 */
async function handleTestHttp(ctx, options, request) {
	if (request.method !== "POST") return new Response(null, {
		status: 405,
		headers: { allow: "POST" }
	});
	let prompt = "Reply with exactly: pong";
	try {
		const body = await request.json();
		if (typeof body?.prompt === "string" && body.prompt.trim() !== "") prompt = body.prompt;
	} catch {}
	try {
		const envelope = await chat(ctx, { text: prompt }, options());
		const parsed = JSON.parse(envelope);
		if (parsed.ok === true) return new Response(JSON.stringify({
			ok: true,
			...typeof parsed.model === "string" && parsed.model !== "" ? { model: parsed.model } : {}
		}), {
			status: 200,
			headers: {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store"
			}
		});
		return new Response(JSON.stringify({
			ok: false,
			error: typeof parsed.error === "string" ? parsed.error : "chat tool failed"
		}), {
			status: 200,
			headers: {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store"
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return new Response(JSON.stringify({
			ok: false,
			error: message
		}), {
			status: 200,
			headers: {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store"
			}
		});
	}
}
//#endregion
//#region src/tools.ts
/** 信封对象 schema（成功/失败共用一个宽松对象根）。 */
const envelopeSchema = {
	type: "object",
	additionalProperties: true,
	properties: {
		ok: { type: "boolean" },
		task_type: { type: "string" },
		tool_used: { type: "string" },
		confidence: { type: "string" },
		result: { type: "string" },
		error: { type: "string" },
		image_count: { type: "integer" },
		metadata: {
			type: "object",
			additionalProperties: true
		}
	}
};
/** render：把信封对象序列化为文本块（与 MCP 版返回的 JSON 文本一致）。 */
function renderEnvelope(_args, value) {
	return [{
		type: "text",
		text: JSON.stringify(value)
	}];
}
/** describe_image 工具定义（与 MCP 版参数/默认值逐字一致）。 */
function describeImageTool(deps) {
	return defineTool({
		name: "describe_image",
		description: "描述/理解一张图片(调用商汤 SenseNova 视觉模型,优先派生子 agent 切换到视觉模型,失败自动回落直连并按 sensenova-6.8-flash-lite → deepseek-flash → kimi-k3 故障转移)。image 为本地图片绝对路径、http(s) URL 或 base64;返回 JSON 文本(ok/task_type/tool_used/confidence/result/metadata.attempts 记录每轮尝试);多图用 describe_images。api key 优先取 credential-ref(默认 SENSENOVA_API_KEY),与 dsh-sensenova-freeapi 共用同一把 key。",
		parameters: {
			image: {
				type: "string",
				required: true,
				description: "本地图片绝对路径 / http(s) URL / data: URL / 裸 base64 字符串。"
			},
			prompt: {
				type: "string",
				description: "识别提示,默认 \"Describe this image in detail.\"。"
			},
			model: {
				type: "string",
				description: "模型链(逗号分隔),默认用配置;可传 \"kimi-k3\" 强制单模型。"
			},
			base_url: {
				type: "string",
				description: "chat-completions base URL,默认用配置(https://token.sensenova.cn/v1)。"
			},
			image_mode: {
				type: "string",
				description: "图片传输模式,image_url(默认)或 image_base64(遗留)。"
			}
		},
		output: {
			schema: envelopeSchema,
			render: renderEnvelope
		},
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			const envelope = await describe(deps.ctx, exec, args, deps.options(), "image_reasoning");
			return JSON.parse(envelope);
		}
	});
}
/** describe_images 工具定义（与 MCP 版参数/默认值逐字一致）。 */
function describeImagesTool(deps) {
	return defineTool({
		name: "describe_images",
		description: "同一请求内理解多张图片(调用商汤 SenseNova 视觉模型,优先派生子 agent 切换到视觉模型,失败自动回落直连并按 sensenova-6.8-flash-lite → deepseek-flash → kimi-k3 故障转移)。images 为图片列表,每项可为本地图片绝对路径、http(s) URL 或 base64;返回 JSON 文本(ok/task_type/tool_used/confidence/result/metadata.attempts 记录每轮尝试)。api key 优先取 credential-ref(默认 SENSENOVA_API_KEY),与 dsh-sensenova-freeapi 共用同一把 key。",
		parameters: {
			images: {
				type: "array",
				required: true,
				items: { type: "string" },
				description: "图片列表,每项为本地图片绝对路径 / http(s) URL / data: URL / 裸 base64。"
			},
			prompt: {
				type: "string",
				description: "识别提示,默认 \"Describe these images in detail.\"。"
			},
			model: {
				type: "string",
				description: "模型链(逗号分隔),默认用配置;可传 \"kimi-k3\" 强制单模型。"
			},
			base_url: {
				type: "string",
				description: "chat-completions base URL,默认用配置(https://token.sensenova.cn/v1)。"
			},
			image_mode: {
				type: "string",
				description: "图片传输模式,image_url(默认)或 image_base64(遗留)。"
			}
		},
		output: {
			schema: envelopeSchema,
			render: renderEnvelope
		},
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			const envelope = await describe(deps.ctx, exec, args, deps.options(), "image_reasoning_multi");
			return JSON.parse(envelope);
		}
	});
}
/** chat 工具定义（恒走直连；验证 key/端点连通性）。 */
function chatTool(deps) {
	return defineTool({
		name: "chat",
		description: "纯文本对话(调用商汤 SenseNova 视觉模型;验证 key/端点连通性,以及视觉失败时的兜底;恒走直连路径,默认使用模型链首模型 sensenova-6.8-flash-lite)。返回 JSON 文本。",
		parameters: {
			text: {
				type: "string",
				required: true,
				description: "要发送给模型的纯文本。"
			},
			model: {
				type: "string",
				description: "模型链(逗号分隔),默认用配置。"
			},
			base_url: {
				type: "string",
				description: "chat-completions base URL,默认用配置。"
			}
		},
		output: {
			schema: envelopeSchema,
			render: renderEnvelope
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const envelope = await chat(deps.ctx, args, deps.options());
			return JSON.parse(envelope);
		}
	});
}
//#endregion
//#region src/index.ts
const name = "vision-sensenova";
/** 硬依赖仅 tools；其余（credentials/llm/subagents/attachments/connection）走可选注入。 */
const inject = ["tools"];
function apply(ctx, config) {
	const resolvedConfig = plainConfig(config);
	let lastRaw;
	let lastGood;
	const options = () => {
		const raw = resolvedConfig;
		if (raw === lastRaw && lastGood !== void 0) return lastGood;
		const next = resolveAdapterOptions(raw);
		lastRaw = raw;
		lastGood = next;
		return next;
	};
	options();
	ctx.tools.register(describeImageTool({
		ctx,
		options
	}));
	ctx.tools.register(describeImagesTool({
		ctx,
		options
	}));
	ctx.tools.register(chatTool({
		ctx,
		options
	}));
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber));
	});
	ctx.inject(["connection"], (connectionCtx) => {
		connectionCtx.effect(() => {
			const disposeStatus = connectionCtx.connection.fetch.register({
				path: STATUS_ROUTE,
				methods: ["GET"],
				requestBody: "buffered",
				fetch: (request) => handleStatusHttp(ctx, options, request)
			});
			const disposeTest = connectionCtx.connection.fetch.register({
				path: TEST_ROUTE,
				methods: ["POST"],
				requestBody: "buffered",
				fetch: (request) => handleTestHttp(ctx, options, request)
			});
			return () => {
				disposeStatus();
				disposeTest();
			};
		}, `vision-sensenova: diagnostic routes ${STATUS_ROUTE} / ${TEST_ROUTE}`);
	});
}
//#endregion
export { Config, STATUS_ROUTE, TEST_ROUTE, apply, inject, name, plainConfig, resolveAdapterOptions };

//# sourceMappingURL=index.js.map