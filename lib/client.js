window.__ModuleLoader__.load({
	id: "dsh-sensenova-vision-aid",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/settings.ts
		/**
		* SenseNova 视觉辅助设置页的领域层（无 JSX）：把 `vision-sensenova` 设置命名空间
		* 与 credentials 域桥接到页面状态。宿主是唯一事实来源，保存即热生效。
		*
		* 与 dsh-sensenova-freeapi 的 SenseNovaSettingsController 同构，但只保留本插件
		* 所需的最小面：reuseFreeapiCredentials、keyRef、apiBase、modelChain、imageMode、
		* API key 一律经 credentials 域写入（credential-ref），页面不回显明文。
		*/
		/** 设置命名空间（与 host 侧 ConfigSchema 的命名空间一致）。 */
		const VISION_NS = "vision-sensenova";
		/** 插件条目 id（cordis.patch.yml 的 insert id，与 freeapi 的 llm-sensenova 区分）。 */
		const VISION_ROUTE = "vision-sensenova";
		const VISION_DISPLAY_NAME = "SenseNova 视觉辅助";
		/** 默认凭据引用（与 freeapi 共用同一把 key 的共享槽位）。 */
		const DEFAULT_KEY_REF = "SENSENOVA_API_KEY";
		/** 默认 apiBase 与默认模型链（与 host 侧默认值一致）。 */
		const DEFAULT_API_BASE = "https://token.sensenova.cn/v1";
		const DEFAULT_MODEL_CHAIN = "sensenova-6.8-flash-lite,deepseek-flash,kimi-k3";
		/** 默认直连单模型超时（毫秒）。 */
		const DEFAULT_TIMEOUT_MS = 18e4;
		/** 与宿主 credentials 的 canonical credential-ref 规则一致（POSIX shell 标识符）。 */
		const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
		function canonicalCredentialRef(value) {
			if (typeof value !== "string") return void 0;
			const trimmed = value.trim();
			return trimmed !== "" && CREDENTIAL_REF_PATTERN.test(trimmed) ? trimmed : void 0;
		}
		/** 从 section 值中读取凭据引用；未配置时回退默认，非法值则视为无凭据。 */
		function credentialRefOf(keyRef) {
			if (keyRef === void 0) return DEFAULT_KEY_REF;
			return canonicalCredentialRef(keyRef);
		}
		/** 从 section 值中读取 apiBase（空则回退默认）。 */
		function apiBaseOf(apiBase) {
			return typeof apiBase === "string" && apiBase.length > 0 ? apiBase : DEFAULT_API_BASE;
		}
		/** 从 section 值中读取模型链（非法回退默认）。 */
		function modelChainOf(modelChain) {
			return typeof modelChain === "string" && modelChain.trim() !== "" ? modelChain : DEFAULT_MODEL_CHAIN;
		}
		/** 把并发上限输入归一化为正整数（非法/无法解析回退默认 180000）。 */
		function normalizeTimeoutMs(value) {
			if (typeof value === "number" && Number.isFinite(value) && value >= 1e3) return Math.round(value);
			if (typeof value === "string") {
				const parsed = Number.parseInt(value.trim(), 10);
				if (Number.isFinite(parsed) && parsed >= 1e3) return parsed;
			}
			return DEFAULT_TIMEOUT_MS;
		}
		/** 把布尔存储值归一化（未配置时回退缺省）。 */
		function normalizeBool(value, fallback) {
			return typeof value === "boolean" ? value : fallback;
		}
		/** 凭据引用下拉选项（SENSENOVA_API_KEY、SENSENOVA_API_KEY_2.._10）。 */
		function keyRefOptions() {
			const options = [DEFAULT_KEY_REF];
			for (let n = 2; n <= 10; n += 1) options.push(`${DEFAULT_KEY_REF}_${n}`);
			return options;
		}
		const IDLE_TEST_STATE = { status: "idle" };
		const IDLE_DIAGNOSTICS_STATE = { status: "idle" };
		/**
		* 归一化宿主状态路由返回的 JSON（**绝不抛**）：字段缺失/类型不符一律取兜底值，
		* 保证面板在旧 host / 数据不完整时只显示「信息不全」而不是崩掉。
		*/
		function normalizeDiagnosticsState(raw) {
			if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { status: "error" };
			const source = raw;
			const rawRefs = Array.isArray(source.refs) ? source.refs : [];
			const refs = [];
			for (const item of rawRefs) {
				if (typeof item !== "object" || item === null) continue;
				const row = item;
				if (typeof row.name !== "string" || row.name === "") continue;
				refs.push({
					name: row.name,
					configured: row.configured === true
				});
			}
			return {
				status: "ready",
				snapshot: {
					serviceAvailable: source.serviceAvailable === true,
					refs,
					modelChain: typeof source.modelChain === "string" ? source.modelChain : "",
					apiBase: typeof source.apiBase === "string" ? source.apiBase : "",
					imageMode: typeof source.imageMode === "string" ? source.imageMode : ""
				}
			};
		}
		/** 创建一个小型可观察快照 store（参考实现的 createSnapshotStore 精简版）。 */
		function createSnapshotStore(initial) {
			let snapshot = initial;
			const listeners = /* @__PURE__ */ new Set();
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
					for (const listener of [...listeners]) try {
						listener();
					} catch (error) {
						console.error("[dsh-sensenova-vision-aid] snapshot subscriber failed:", error);
					}
				}
			};
		}
		/**
		* 「测试连接」与「诊断」走 HTTP 路由而不是 settings 通道：诊断数据不是配置——
		* 塞进 settings 会污染 `settings.yaml`，且每次刷新都产生 revision 变化。
		* ⚠️ 与 host 侧 `status-api.ts` 的 STATUS_ROUTE / TEST_ROUTE **必须同值** ——
		* client bundle 无法 import host 模块，改动时两边一起改。
		*/
		const STATUS_ROUTE = "/api/sensenova-vision-aid/status";
		/** 测试连接走 host 侧 chat 工具（直连路径，不派生子 agent）。 */
		const TEST_ROUTE = "/api/sensenova-vision-aid/test";
		const TEST_PROMPT = "Reply with exactly: pong";
		var VisionAidSettingsController = class {
			scope;
			credentials;
			stagedReuse;
			stagedKeyRef;
			keyDraft = "";
			clearStaged = false;
			keyWritePending = false;
			keyWriteResult = "idle";
			stagedApiBase;
			stagedModelChain;
			stagedImageMode;
			stagedTimeoutMs;
			credentialStates = /* @__PURE__ */ new Map();
			diagnostics = { ...IDLE_DIAGNOSTICS_STATE };
			test = { ...IDLE_TEST_STATE };
			saving = false;
			failed = false;
			savedCount = 0;
			listeners = /* @__PURE__ */ new Set();
			disposers = [];
			disposed = false;
			constructor(scope, credentials) {
				this.scope = scope;
				this.credentials = credentials;
				this.disposers.push(scope.subscribe(() => {
					this.publish();
					this.describeIfRefsChanged();
				}));
				this.describeAll();
			}
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				for (const dispose of this.disposers) dispose();
				this.disposers.length = 0;
				this.listeners.clear();
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			/** 当前凭据引用：优先 staged 草稿，其次 section 值，最后回退默认。 */
			credentialRef() {
				return credentialRefOf(this.stagedKeyRef ?? this.sectionValue("keyRef"));
			}
			/** 当前 section 值（快照未就绪时 undefined）。 */
			sectionValue(field) {
				return this.scope.getSnapshot().value?.[field];
			}
			/** 页面状态面。 */
			state() {
				const snapshot = this.scope.getSnapshot();
				const ref = this.credentialRef();
				const refView = ref === void 0 ? void 0 : this.credentialStates.get(ref);
				const reuse = normalizeBool(this.sectionValue("reuseFreeapiCredentials"), true);
				const keyRef = credentialRefOf(this.sectionValue("keyRef")) ?? "";
				const apiBase = apiBaseOf(this.sectionValue("apiBase"));
				const modelChain = modelChainOf(this.sectionValue("modelChain"));
				const imageMode = this.sectionValue("imageMode") === "image_base64" ? "image_base64" : "image_url";
				const timeoutMs = normalizeTimeoutMs(this.sectionValue("timeoutMs"));
				const dirty = this.stagedReuse !== void 0 || this.stagedKeyRef !== void 0 || this.keyDraft !== "" || this.clearStaged || this.stagedApiBase !== void 0 || this.stagedModelChain !== void 0 || this.stagedImageMode !== void 0 || this.stagedTimeoutMs !== void 0;
				return {
					available: snapshot.status === "ready",
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
					savedCount: this.savedCount
				};
			}
			edit(field, text) {
				if (field === "reuseFreeapiCredentials") this.stagedReuse = text === "true";
				else if (field === "keyRef") this.stagedKeyRef = text;
				else if (field === "apiBase") this.stagedApiBase = text;
				else if (field === "modelChain") this.stagedModelChain = text;
				else if (field === "imageMode") this.stagedImageMode = text === "image_base64" ? "image_base64" : "image_url";
				else if (field === "timeoutMs") this.stagedTimeoutMs = text;
				this.failed = false;
				this.publish();
			}
			/** 复用开关（布尔专用编辑入口）。 */
			setReuseFreeapi(on) {
				this.stagedReuse = on;
				this.failed = false;
				this.publish();
			}
			editKeyDraft(text) {
				this.keyDraft = text;
				this.clearStaged = false;
				this.keyWriteResult = "idle";
				this.failed = false;
				this.publish();
			}
			toggleClearStaged() {
				this.clearStaged = !this.clearStaged;
				if (this.clearStaged) this.keyDraft = "";
				this.keyWriteResult = "idle";
				this.failed = false;
				this.publish();
			}
			/** 丢弃所有 staged 编辑。 */
			discard() {
				this.stagedReuse = void 0;
				this.stagedKeyRef = void 0;
				this.keyDraft = "";
				this.clearStaged = false;
				this.stagedApiBase = void 0;
				this.stagedModelChain = void 0;
				this.stagedImageMode = void 0;
				this.stagedTimeoutMs = void 0;
				this.failed = false;
				this.keyWriteResult = "idle";
				this.publish();
			}
			/** 凭据域状态重读（外部写入 key 后刷新已配置/可写徽标）。 */
			async refreshCredentials() {
				await this.describeAll();
			}
			/** 拉取 host 状态路由（只读诊断）。**不自动调用**：打开设置页不产生额外 I/O。 */
			async refreshDiagnostics() {
				if (this.diagnostics.status === "loading") return;
				this.diagnostics = {
					...this.diagnostics,
					status: "loading"
				};
				this.publish();
				try {
					const response = await fetch(STATUS_ROUTE, { credentials: "same-origin" });
					if (!response.ok) throw new Error(`vision-sensenova: status HTTP ${response.status}`);
					this.diagnostics = normalizeDiagnosticsState(await response.json());
				} catch {
					this.diagnostics = { status: "error" };
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
			async testConnection() {
				if (this.test.status === "loading") return;
				this.test = { status: "loading" };
				this.publish();
				try {
					const response = await fetch(TEST_ROUTE, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ prompt: TEST_PROMPT }),
						credentials: "same-origin"
					});
					if (response.ok) {
						const payload = await response.json();
						if (payload.ok === true) {
							const model = typeof payload.model === "string" && payload.model !== "" ? payload.model : void 0;
							this.test = model === void 0 ? { status: "ok" } : {
								status: "ok",
								model
							};
						} else {
							const reason = typeof payload.error === "string" ? payload.error : `test route HTTP ${response.status}`;
							throw new Error(reason);
						}
						this.publish();
						return;
					}
					if (response.status !== 404) throw new Error(`test route HTTP ${response.status}`);
					const statusResponse = await fetch(STATUS_ROUTE, { credentials: "same-origin" });
					if (!statusResponse.ok) throw new Error(`status HTTP ${statusResponse.status}`);
					const normalized = normalizeDiagnosticsState(await statusResponse.json());
					if (normalized.status !== "ready" || normalized.snapshot === void 0) throw new Error("status route unavailable");
					const snapshot = normalized.snapshot;
					const ref = this.credentialRef() ?? "";
					const refState = snapshot.refs.find((row) => row.name === ref);
					if (!snapshot.serviceAvailable) throw new Error(`service unavailable (status ${snapshot.serviceAvailable})`);
					if (refState === void 0 || !refState.configured) throw new Error(`credential ref ${ref} is not configured`);
					const firstModel = snapshot.modelChain.split(",")[0]?.trim() ?? "";
					this.test = firstModel === "" ? { status: "ok" } : {
						status: "ok",
						model: firstModel
					};
				} catch (error) {
					const reason = error instanceof Error ? error.message : String(error);
					this.test = {
						status: "error",
						reason
					};
				}
				this.publish();
			}
			/** 当前页面涉及的 credential-ref 集合键。 */
			currentRefsKey() {
				const ref = this.credentialRef();
				if (ref === void 0) return "";
				return ref;
			}
			describeIfRefsChanged() {
				if (this.currentRefsKey() === "") return;
				this.describeAll();
			}
			/** 查询本页涉及的凭据引用的配置状态。 */
			async describeAll() {
				const ref = this.credentialRef();
				if (ref === void 0) return;
				let response;
				try {
					response = await this.credentials.describe([ref]);
				} catch {
					return;
				}
				if (!response.ok) return;
				const view = response.value?.[ref];
				const next = {
					configured: view?.configured ?? false,
					writable: view?.writable ?? true
				};
				const prev = this.credentialStates.get(ref);
				if (prev === void 0 || prev.configured !== next.configured || prev.writable !== next.writable) {
					this.credentialStates.set(ref, next);
					this.publish();
				}
			}
			/** 写入某个凭据引用，然后重读配置状态。 */
			async writeKeyTo(ref, value) {
				const canonicalRef = canonicalCredentialRef(ref);
				if (canonicalRef === void 0) return false;
				try {
					if (!(await this.credentials.set(canonicalRef, value)).ok) return false;
				} catch {
					return false;
				}
				await this.describeAll();
				return this.credentialStates.get(canonicalRef)?.configured ?? false;
			}
			async unsetKey(ref) {
				const canonicalRef = canonicalCredentialRef(ref);
				if (canonicalRef === void 0) return false;
				try {
					if (!(await this.credentials.unset(canonicalRef)).ok) return false;
				} catch {
					return false;
				}
				await this.describeAll();
				return this.credentialStates.get(canonicalRef)?.configured !== true;
			}
			/** 保存所有 staged 编辑。 */
			async save() {
				if (this.saving) return;
				if (!this.state().dirty) return;
				this.saving = true;
				this.failed = false;
				this.publish();
				let landed = true;
				let keyWriteResult = "idle";
				try {
					const ref = this.credentialRef();
					if (this.clearStaged) {
						if (ref === void 0 || !await this.unsetKey(ref)) {
							landed = false;
							keyWriteResult = "failed";
						} else keyWriteResult = "saved";
					} else if (this.keyDraft.trim() !== "") {
						if (ref === void 0 || !await this.writeKeyTo(ref, this.keyDraft.trim())) {
							landed = false;
							keyWriteResult = "failed";
						} else keyWriteResult = "saved";
					}
					if (this.stagedReuse !== void 0) await this.scope.set("reuseFreeapiCredentials", this.stagedReuse);
					if (this.stagedKeyRef !== void 0) {
						const canonicalRef = canonicalCredentialRef(this.stagedKeyRef);
						if (this.stagedKeyRef.trim() === "") await this.scope.unset("keyRef");
						else if (canonicalRef === void 0) landed = false;
						else await this.scope.set("keyRef", canonicalRef);
					}
					if (this.stagedApiBase !== void 0) {
						const value = this.stagedApiBase.trim();
						if (value === "") await this.scope.unset("apiBase");
						else await this.scope.set("apiBase", value);
					}
					if (this.stagedModelChain !== void 0) {
						const value = this.stagedModelChain.trim();
						if (value === "") await this.scope.unset("modelChain");
						else await this.scope.set("modelChain", value);
					}
					if (this.stagedImageMode !== void 0) await this.scope.set("imageMode", this.stagedImageMode);
					if (this.stagedTimeoutMs !== void 0) await this.scope.set("timeoutMs", normalizeTimeoutMs(this.stagedTimeoutMs));
				} catch {
					landed = false;
				}
				this.saving = false;
				this.failed = !landed;
				this.keyWriteResult = landed ? keyWriteResult : "failed";
				if (landed) {
					this.savedCount += 1;
					this.discard();
				}
				this.publish();
			}
			publish() {
				if (this.disposed) return;
				for (const listener of [...this.listeners]) try {
					listener();
				} catch (error) {
					console.error("[dsh-sensenova-vision-aid] state subscriber failed:", error);
				}
			}
		};
		//#endregion
		//#region src/client/section.tsx
		/**
		* SenseNova 视觉辅助设置页 React 组件（settings.section slot 内容）。
		* 所有文案经 `t`（settings.vision-sensenova 命名空间）读取，不硬编码。
		*/
		const { useEffect, useRef } = react;
		function useSavedFlash(savedCount) {
			const [visible, setVisible] = (0, react.useState)(false);
			const previousCount = useRef(savedCount);
			useEffect(() => {
				if (savedCount === previousCount.current) return;
				previousCount.current = savedCount;
				setVisible(true);
				const timer = setTimeout(() => setVisible(false), 2500);
				return () => clearTimeout(timer);
			}, [savedCount]);
			return visible;
		}
		/** 凭据状态徽标：已配置 / 未配置。 */
		function StatusBadge({ configured, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: configured ? "sn-badge" : "sn-badgeMuted",
				children: configured ? t("apiKeySet") : t("apiKeyUnset")
			});
		}
		/** 分组标题：引导后续卡片的分区归属。 */
		function SectionHeading(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
				className: "sn-groupTitle",
				children: props.text
			});
		}
		/** 开关行（label + checkbox 并排）。 */
		function ToggleField(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sn-field",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: "sn-fieldHead",
					htmlFor: props.id,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "sn-label",
						children: props.t(props.labelKey)
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						className: "sn-toggle",
						type: "checkbox",
						checked: props.checked,
						disabled: props.disabled,
						onChange: (event) => props.onChange(event.target.checked)
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "sn-hint",
					children: props.t(props.hintKey)
				})]
			});
		}
		/** 凭据区（分组 2）：复用开关 + ref 选择 + 关闭复用时的密钥输入框。 */
		function CredentialsCard(props) {
			const { t, state } = props;
			const [visible, setVisible] = (0, react.useState)(false);
			const reuseOn = state.reuseFreeapiCredentialsDraft;
			const keyWriteResult = state.keyWriteResult;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sn-card",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleField, {
						t,
						id: "sn-vision-reuse",
						labelKey: "reuseFreeapi",
						hintKey: reuseOn ? "reuseFreeapiHint" : "reuseFreeapiOffHint",
						checked: reuseOn,
						disabled: props.disabled,
						onChange: props.setReuseFreeapi
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sn-field",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "sn-fieldHead",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: "sn-label",
									htmlFor: "sn-vision-keyref",
									children: t("keyRef")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "sn-badges",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusBadge, {
										configured: state.keyRefConfigured,
										t
									})
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "sn-activeAccountSelect",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									id: "sn-vision-keyref",
									className: "sn-input",
									value: state.keyRefDraft,
									disabled: props.disabled,
									onChange: (event) => props.edit("keyRef", event.target.value),
									children: keyRefOptions().map((ref) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: ref,
										children: ref
									}, ref))
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "sn-selectChevron",
									"aria-hidden": "true"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "sn-hint",
								children: reuseOn ? t("keyRefHint") : t("keyRefOptionsHint")
							})
						]
					}),
					!reuseOn ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sn-field",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "sn-fieldHead",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: "sn-label",
									htmlFor: "sn-vision-key",
									children: t("apiKey")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "sn-badges",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "sn-reset",
										disabled: props.disabled,
										onClick: () => setVisible((v) => !v),
										children: visible ? t("hide") : t("show")
									}), state.keyRefConfigured ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "sn-reset",
										disabled: props.disabled,
										onClick: props.toggleClearStaged,
										children: t("clearKey")
									}) : null]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								id: "sn-vision-key",
								className: "sn-input",
								type: visible ? "text" : "password",
								autoComplete: "off",
								spellCheck: false,
								value: state.keyDraft,
								disabled: props.disabled,
								onChange: (event) => props.editKeyDraft(event.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "sn-hint",
								children: state.clearStaged ? t("keyClearStaged") : t("apiKeyHint")
							}),
							keyWriteResult === "saved" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "sn-saved",
								role: "status",
								children: t("keySaved")
							}) : keyWriteResult === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "sn-failed",
								role: "status",
								children: t("saveFailed")
							}) : null
						]
					}) : null
				]
			});
		}
		/** 连接与兜底区（分组 3，高级折叠卡）：apiBase / modelChain / imageMode / timeoutMs。 */
		function ConnectionAdvancedCard(props) {
			const { t, state } = props;
			const [expanded, setExpanded] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sn-card sn-advanced",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "sn-advancedHeader",
					"aria-expanded": expanded,
					"aria-controls": "sn-vision-advanced",
					onClick: () => setExpanded((value) => !value),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "sn-label",
						children: t("advancedSettings")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "sn-advancedMeta",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `sn-advancedChevron${expanded ? " sn-advancedChevronExpanded" : ""}`,
							"aria-hidden": "true"
						})
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					id: "sn-vision-advanced",
					className: "sn-advancedBody",
					hidden: !expanded,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "sn-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: "sn-label",
									htmlFor: "sn-vision-api-base",
									children: t("apiBase")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "sn-vision-api-base",
									className: "sn-input",
									type: "text",
									value: state.apiBaseDraft,
									disabled: props.disabled,
									spellCheck: false,
									onChange: (event) => props.edit("apiBase", event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "sn-hint",
									children: t("apiBaseHint")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "sn-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: "sn-label",
									htmlFor: "sn-vision-model-chain",
									children: t("modelChain")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "sn-vision-model-chain",
									className: "sn-input",
									type: "text",
									value: state.modelChainDraft,
									disabled: props.disabled,
									spellCheck: false,
									onChange: (event) => props.edit("modelChain", event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "sn-hint",
									children: t("modelChainHint")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "sn-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: "sn-label",
									htmlFor: "sn-vision-image-mode",
									children: t("imageMode")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "sn-activeAccountSelect",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										id: "sn-vision-image-mode",
										className: "sn-input",
										value: state.imageModeDraft,
										disabled: props.disabled,
										onChange: (event) => props.edit("imageMode", event.target.value),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "image_url",
											children: t("imageModeImageUrl")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "image_base64",
											children: t("imageModeImageBase64")
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "sn-selectChevron",
										"aria-hidden": "true"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "sn-hint",
									children: t("imageModeHint")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "sn-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: "sn-label",
									htmlFor: "sn-vision-timeout",
									children: t("timeoutMs")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "sn-vision-timeout",
									className: "sn-input",
									type: "number",
									min: 1e3,
									step: 1e3,
									value: state.timeoutMsDraft,
									disabled: props.disabled,
									spellCheck: false,
									onChange: (event) => props.edit("timeoutMs", event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "sn-hint",
									children: t("timeoutMsHint")
								})
							]
						})
					]
				})]
			});
		}
		/** 测试连接区块（只读运行数据，不参与保存）。 */
		function TestConnectionPanel(props) {
			const test = props.state;
			const busy = test.status === "loading";
			let body;
			if (test.status === "idle") body = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "sn-hint",
				children: props.t("testConnectionIdle")
			});
			else if (test.status === "ok") body = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "sn-saved",
				role: "status",
				children: [props.t("testConnectionOk"), test.model !== void 0 ? ` — ${props.t("testConnectionOkHint", { model: test.model })}` : ""]
			});
			else if (test.status === "error") body = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "sn-failed",
				role: "status",
				children: [props.t("testConnectionFail"), test.reason !== void 0 ? ` — ${props.t("testConnectionFailHint", { reason: test.reason })}` : ""]
			});
			else body = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "sn-hint",
				children: props.t("testConnectionRunning")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sn-card",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sn-fieldHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "sn-label",
							children: props.t("testConnection")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "sn-linkButton",
							disabled: busy,
							onClick: () => props.onTest(),
							children: busy ? props.t("testConnectionRunning") : props.t("testConnection")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sn-hint",
						children: props.t("testConnectionHint")
					}),
					body
				]
			});
		}
		/** 诊断区块（只读，host 状态路由）。 */
		function DiagnosticsPanel(props) {
			const diag = props.state;
			const busy = diag.status === "loading";
			const snapshot = diag.snapshot;
			let body;
			if (diag.status === "idle") body = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "sn-hint",
				children: props.t("diagnosticsIntro")
			});
			else if (diag.status === "error" || snapshot === void 0) body = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "sn-hint sn-diagnosticsWarn",
				children: props.t("diagnosticsUnavailable")
			});
			else body = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sn-diagnosticsBody",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sn-diagnosticsTags",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: snapshot.serviceAvailable ? props.t("diagServiceAvailable") : props.t("diagServiceUnavailable") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								props.t("diagApiBase"),
								": ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "sn-mono",
									children: snapshot.apiBase
								})
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								props.t("diagImageMode"),
								": ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "sn-mono",
									children: snapshot.imageMode
								})
							] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sn-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "sn-labelSmall",
							children: props.t("diagRefs")
						}), snapshot.refs.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "sn-diagnosticsTags",
							children: snapshot.refs.map((ref) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "sn-mono",
									children: ref.name
								}),
								" ",
								ref.configured ? props.t("diagRefConfigured") : props.t("diagRefMissing")
							] }, ref.name))
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "sn-hint",
							children: "—"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sn-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "sn-labelSmall",
							children: props.t("diagModelChain")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "sn-hint sn-mono",
							children: snapshot.modelChain
						})]
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sn-card sn-diagnostics",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sn-fieldHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "sn-label",
							children: props.t("groupDiagnostics")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "sn-linkButton",
							disabled: busy,
							onClick: () => props.onRefresh(),
							children: busy ? props.t("diagnosticsLoading") : props.t("diagnosticsRefresh")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sn-hint",
						children: props.t("diagnosticsIntro")
					}),
					body
				]
			});
		}
		function VisionAidSection(props) {
			const { t } = props;
			const state = props.useVisionAidSettings((s) => s);
			const disabled = !state.writable;
			const savedVisible = useSavedFlash(state.savedCount);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "sn-section",
				"aria-label": t("title"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: "sn-title",
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sn-intro",
						children: t("intro")
					}),
					!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sn-readOnly",
						role: "status",
						children: t("readOnly")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionHeading, { text: t("routeLabel") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "sn-card sn-cardCompact",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "sn-field",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "sn-fieldHead",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "sn-label",
									children: t("routeLabel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "sn-badges",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "sn-badge",
										children: state.route
									})
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "sn-hint",
								children: state.displayName
							})]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionHeading, { text: t("groupCredentials") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CredentialsCard, {
						t,
						state,
						disabled,
						edit: props.edit,
						setReuseFreeapi: props.setReuseFreeapi,
						editKeyDraft: props.editKeyDraft,
						toggleClearStaged: props.toggleClearStaged
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionHeading, { text: t("groupConnection") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConnectionAdvancedCard, {
						t,
						state,
						disabled,
						edit: props.edit
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionHeading, { text: t("testConnection") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TestConnectionPanel, {
						t,
						state: state.test,
						onTest: props.testConnection
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionHeading, { text: t("groupDiagnostics") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiagnosticsPanel, {
						t,
						state: state.diagnostics,
						onRefresh: props.refreshDiagnostics
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sn-footer",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "sn-footerStatus",
							children: state.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "sn-failed",
								role: "status",
								children: t("saveFailed")
							}) : savedVisible && !state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "sn-saved",
								role: "status",
								children: t("saved")
							}) : state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "sn-unsaved",
								children: t("unsaved")
							}) : null
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "sn-footerActions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "sn-btnGhost",
								disabled: !state.dirty || state.saving,
								onClick: props.discard,
								children: t("reset")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "sn-btnPrimary",
								disabled: !state.dirty || state.saving,
								onClick: props.save,
								children: state.saving ? t("saving") : t("save")
							})]
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/card.tsx
		function VisionAidProviderCard(props) {
			const { t } = props;
			const state = props.useVisionAidSettings !== void 0 ? props.useVisionAidSettings((snapshot) => snapshot) : void 0;
			const configured = state !== void 0 && state.available ? state.keyRefConfigured : props.keyConfigured ?? false;
			const active = props.provider?.active ?? false;
			const showBody = state !== void 0 && state.available;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sn-providerCard",
				"data-sn-vision-card": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "sn-field",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sn-fieldHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "sn-label",
							children: t("cardTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "sn-badges",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: configured ? "sn-badge" : "sn-badgeMuted",
								children: configured ? t("apiKeySet") : t("apiKeyUnset")
							}), active ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "sn-badge",
								children: t("cardRouteActive")
							}) : null]
						})]
					}), !showBody ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sn-hint",
						children: state === void 0 ? t("cardRegistrationHint") : t("cardLoadingHint")
					}) : configured ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sn-hint",
						children: t("cardConfiguredHint", { ref: state.keyRef })
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sn-hint",
						children: t("cardUnconfiguredHint")
					})]
				}), showBody ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: "sn-hint",
					children: [
						state.reuseFreeapiCredentials ? t("cardReuseOn") : t("cardReuseOff"),
						" · ",
						t("cardModel"),
						": ",
						state.modelChain
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* SenseNova 视觉辅助（vision-aid）设置页与 Models 页卡片的文案（zh/en 双语）。
		* 注册命名空间：`settings.vision-sensenova`（与 settings.section / provider-card 的
		* locale 选项一致，参考 dsh-sensenova-freeapi 的 `settings.sensenova`）。
		*
		* 文案纪律（dsh harness `Client UI copy is locale-owned`）：所有产品可见文案
		* 一律经 `t`（本命名空间）读取，组件内不硬编码任何面向用户的字符串。
		*/
		const zh = {
			nav: "SenseNova 视觉辅助",
			title: "SenseNova 视觉辅助",
			intro: "配置图片识别的视觉模型与凭据。开启「复用 freeapi 凭据」后与 dsh-sensenova-freeapi 共用同一把 API 密钥，无需配置第二把 key；密钥只写入本机凭据服务、不回显。",
			routeLabel: "插件路由",
			displayName: "SenseNova 视觉辅助（dsh-sensenova-vision-aid）",
			groupCredentials: "凭据与复用",
			reuseFreeapi: "复用 dsh-sensenova-freeapi 凭据",
			reuseFreeapiHint: "开启后，API 密钥经 credential-ref 解析，与 freeapi 插件共用同一把 key（读取 ~/.dsh/.credentials.yaml 的 refs: 或环境变量），免配第二把。",
			reuseFreeapiOffHint: "关闭后显示密钥输入框，保存时写入本机凭据服务（credential-ref），host 按同一 ref 解析。",
			keyRef: "凭据引用名（credential-ref）",
			keyRefHint: "默认 SENSENOVA_API_KEY；免费额度池可切换 SENSENOVA_API_KEY_2 … SENSENOVA_API_KEY_10。",
			keyRefOptionsHint: "下拉为常用 ref；关闭复用时可直接输入自定义 ref（如 VISION_SENSENOVA_API_KEY）。",
			apiKey: "API 密钥",
			apiKeyHint: "在 SenseNova 控制台创建。留空保存不会覆盖已存储的密钥。",
			apiKeySet: "已配置",
			apiKeyUnset: "未配置",
			clearKey: "清除已存密钥",
			show: "显示",
			hide: "隐藏",
			keySaved: "密钥已写入凭据服务 ✓",
			keyClearStaged: "已勾选清除，保存后生效",
			groupConnection: "连接与兜底",
			apiBase: "API 地址",
			apiBaseHint: "默认 https://token.sensenova.cn/v1，一般无需修改。",
			modelChain: "模型链（逗号分隔）",
			modelChainHint: "直连兜底路径的故障转移链，按顺序尝试、首个成功即返回。默认 sensenova-6.8-flash-lite,deepseek-flash,kimi-k3。",
			imageMode: "图片传输模式",
			imageModeImageUrl: "image_url（推荐）",
			imageModeImageBase64: "image_base64（遗留）",
			imageModeHint: "默认 image_url：本地文件内联为 data: URL；kimi-k3 只吃 base64。",
			timeoutMs: "单模型尝试超时（毫秒）",
			timeoutMsHint: "直连路径每个模型的请求超时上限，默认 180000。",
			groupDiagnostics: "诊断（只读）",
			diagnosticsIntro: "数据来自 host 状态路由 GET /api/sensenova-vision-aid/status，只读、不影响运行。",
			diagnosticsRefresh: "刷新",
			diagnosticsLoading: "加载中…",
			diagnosticsUnavailable: "诊断暂不可用（host 未提供该接口，或本次取数失败）。",
			diagServiceAvailable: "服务可用",
			diagServiceUnavailable: "服务不可用",
			diagRefs: "凭据 refs",
			diagRefConfigured: "已配置",
			diagRefMissing: "缺失",
			diagModelChain: "模型链",
			diagApiBase: "API 地址",
			diagImageMode: "图片模式",
			testConnection: "测试连接",
			testConnectionRunning: "测试中…",
			testConnectionOk: "连接正常 ✓",
			testConnectionOkHint: "测试成功（直连 chat 路径，模型 {model}）。",
			testConnectionFail: "连接失败",
			testConnectionFailHint: "原因：{reason}",
			testConnectionIdle: "点「测试连接」用 chat 工具验证 key/端点连通性。",
			testConnectionHint: "调用 host 的 chat 工具（直连路径），验证密钥与端点。",
			readOnly: "当前配置为只读。",
			reset: "重置",
			save: "保存",
			saving: "保存中…",
			saved: "已保存 ✓",
			saveFailed: "保存失败，请重试。",
			unsaved: "未保存",
			advancedSettings: "高级设置",
			cardTitle: "SenseNova 视觉辅助",
			cardRouteActive: "已启用",
			cardLoadingHint: "正在读取 SenseNova 视觉辅助配置…",
			cardRegistrationHint: "此卡片随 dsh-sensenova-vision-aid 插件注册。",
			cardConfiguredHint: "凭据已就绪（{ref}）。如需更换密钥或修改模型链，请前往「设置 → SenseNova 视觉辅助」。",
			cardUnconfiguredHint: "尚未配置 API 密钥，请前往「设置 → SenseNova 视觉辅助」完成配置。",
			cardReuseOn: "复用 freeapi 凭据",
			cardReuseOff: "独立凭据",
			cardModel: "模型链"
		};
		const en = {
			nav: "SenseNova Vision Aid",
			title: "SenseNova Vision Aid",
			intro: "Configure the vision models and credentials used for image recognition. With “Reuse freeapi credentials” enabled this plugin shares the same API key as dsh-sensenova-freeapi, so no second key is needed; keys are written only to the local credential service and never echoed.",
			routeLabel: "Plugin route",
			displayName: "SenseNova Vision Aid (dsh-sensenova-vision-aid)",
			groupCredentials: "Credentials & reuse",
			reuseFreeapi: "Reuse dsh-sensenova-freeapi credentials",
			reuseFreeapiHint: "When enabled, the API key is resolved through a credential-ref shared with the freeapi plugin (reads the refs: block of ~/.dsh/.credentials.yaml or the environment), so no second key is needed.",
			reuseFreeapiOffHint: "When disabled, a key input is shown; saving writes to the local credential service (credential-ref) and the host resolves the same ref.",
			keyRef: "Credential ref name",
			keyRefHint: "Defaults to SENSENOVA_API_KEY; the free tier pool can switch to SENSENOVA_API_KEY_2 … SENSENOVA_API_KEY_10.",
			keyRefOptionsHint: "The dropdown lists common refs; with reuse off you can type a custom ref (e.g. VISION_SENSENOVA_API_KEY).",
			apiKey: "API key",
			apiKeyHint: "Create one in the SenseNova console. Saving with this field blank keeps the stored key.",
			apiKeySet: "Configured",
			apiKeyUnset: "Not configured",
			clearKey: "Clear stored key",
			show: "Show",
			hide: "Hide",
			keySaved: "Key written to the credential service ✓",
			keyClearStaged: "Clear staged — applies on save",
			groupConnection: "Connection & fallback",
			apiBase: "API base URL",
			apiBaseHint: "Defaults to https://token.sensenova.cn/v1; usually leave as-is.",
			modelChain: "Model chain (comma-separated)",
			modelChainHint: "Failover chain for the direct fallback path, tried in order until one succeeds. Defaults to sensenova-6.8-flash-lite,deepseek-flash,kimi-k3.",
			imageMode: "Image transfer mode",
			imageModeImageUrl: "image_url (recommended)",
			imageModeImageBase64: "image_base64 (legacy)",
			imageModeHint: "Defaults to image_url: local files are inlined as data: URLs; kimi-k3 only accepts base64.",
			timeoutMs: "Per-model attempt timeout (ms)",
			timeoutMsHint: "Request timeout per model on the direct path; defaults to 180000.",
			groupDiagnostics: "Diagnostics (read-only)",
			diagnosticsIntro: "Data comes from the host status route GET /api/sensenova-vision-aid/status; read-only, does not affect runtime.",
			diagnosticsRefresh: "Refresh",
			diagnosticsLoading: "Loading…",
			diagnosticsUnavailable: "Diagnostics unavailable right now (host did not provide the route, or the request failed).",
			diagServiceAvailable: "Service available",
			diagServiceUnavailable: "Service unavailable",
			diagRefs: "Credential refs",
			diagRefConfigured: "Configured",
			diagRefMissing: "Missing",
			diagModelChain: "Model chain",
			diagApiBase: "API base",
			diagImageMode: "Image mode",
			testConnection: "Test connection",
			testConnectionRunning: "Testing…",
			testConnectionOk: "Connection OK ✓",
			testConnectionOkHint: "Test succeeded (direct chat path, model {model}).",
			testConnectionFail: "Connection failed",
			testConnectionFailHint: "Reason: {reason}",
			testConnectionIdle: "Press “Test connection” to verify key/endpoint connectivity through the chat tool.",
			testConnectionHint: "Calls the host chat tool (direct path, no subagent) to verify the key and endpoint.",
			readOnly: "Settings are read-only.",
			reset: "Reset",
			save: "Save",
			saving: "Saving…",
			saved: "Saved ✓",
			saveFailed: "Save failed, please retry.",
			unsaved: "Unsaved",
			advancedSettings: "Advanced settings",
			cardTitle: "SenseNova Vision Aid",
			cardRouteActive: "Active",
			cardLoadingHint: "Loading the SenseNova Vision Aid configuration…",
			cardRegistrationHint: "This card is contributed by the dsh-sensenova-vision-aid plugin.",
			cardConfiguredHint: "Credentials ready ({ref}). To replace the key or change the model chain, open “Settings → SenseNova Vision Aid”.",
			cardUnconfiguredHint: "No API key configured yet; open “Settings → SenseNova Vision Aid” to finish setup.",
			cardReuseOn: "Reuse freeapi credentials",
			cardReuseOff: "Standalone credentials",
			cardModel: "Model chain"
		};
		//#endregion
		//#region src/client/index.ts
		/**
		* SenseNova 视觉辅助客户端插件入口（browser half）。
		*
		* 只做配置面板所必需的事：
		*   1. 注册 `settings.vision-sensenova` 文案命名空间（zh/en）；
		*   2. 桥接凭据面：优先宿主 `remote.credentials`，旧版退化为
		*      `connection.api.credentials`（与 dsh-sensenova-freeapi 同构）；
		*   3. 用 `configForms.get('vision-sensenova')` 生成设置域，
		*      交给 VisionAidSettingsController（领域层，无 JSX）；
		*   4. 注入 `settings.section`（设置页）与 `settings.models.provider-card`
		*      （Models 页卡片）两个槽。
		*
		* API key 一律经凭据域写入（credential-ref），页面不回显明文；host 是唯一事实
		* 来源，保存后立即热生效。
		*/
		/** 把旧版 ApiProxy 凭据面适配为 CredentialsFace。 */
		function adaptLegacyCredentials(legacy) {
			if (legacy === void 0) return void 0;
			return {
				describe: async (refs) => {
					const response = await legacy.describe({ refs });
					if (!response.result.ok) return { ok: false };
					const value = response.result.value?.credentials;
					return value === void 0 ? { ok: true } : {
						ok: true,
						value
					};
				},
				set: async (ref, value) => {
					const response = await legacy.set({
						ref,
						value
					});
					return response.result.ok ? { ok: true } : {
						ok: false,
						error: response.result.error
					};
				},
				unset: async (ref) => {
					const response = await legacy.unset({ ref });
					return response.result.ok ? { ok: true } : {
						ok: false,
						error: response.result.error
					};
				}
			};
		}
		function injectPageCss() {
			if (typeof document === "undefined") return;
			if (document.getElementById("dsh-sensenova-vision-aid-css")) return;
			const tag = document.createElement("style");
			tag.id = "dsh-sensenova-vision-aid-css";
			tag.textContent = [
				".sn-section{display:flex;flex-direction:column;gap:14px}",
				".sn-title{font-size:16px;font-weight:600;margin:0;color:var(--dsw-alias-label-primary,#222)}",
				".sn-intro,.sn-hint{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8a8a);margin:2px 0 0;line-height:1.5}",
				".sn-readOnly,.sn-failed{font-size:12px;color:var(--dsw-alias-label-error,#d9534f);margin:0}",
				".sn-saved{font-size:12px;color:var(--dsw-alias-label-success,#2e8b57);margin:0}",
				".sn-unsaved{font-size:12px;color:var(--dsw-alias-label-warning,#b58900);margin:0}",
				".sn-groupTitle{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#8a8a8a);margin:10px 0 -4px;padding:0 2px}",
				".sn-groupTitle:first-of-type{margin-top:2px}",
				".sn-card{display:flex;flex-direction:column;gap:12px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));border-radius:10px;padding:14px;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.04))}",
				".sn-cardCompact{padding:10px 14px}",
				".sn-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
				".sn-fieldHead{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}",
				".sn-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,#222);min-width:0}",
				".sn-labelSmall{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,#5c5c5c)}",
				".sn-badges{display:inline-flex;gap:6px;align-items:center;flex:0 0 auto;min-width:0;white-space:nowrap}",
				".sn-badge,.sn-badgeMuted,.sn-badgeActive{font-size:11px;padding:1px 8px;border-radius:999px;white-space:nowrap;line-height:17px}",
				".sn-badge{background:var(--dsw-alias-bg-module-platform,rgba(127,127,127,.16));color:var(--dsw-alias-label-secondary,#5c5c5c);font-weight:500}",
				".sn-badgeMuted{background:transparent;color:var(--dsw-alias-label-tertiary,#8a8a8a)}",
				".sn-badgeActive{background:var(--dsw-alias-button-primary-fill,#0f1115);color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:500}",
				".sn-input{box-sizing:border-box;width:100%;font-size:13px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:6px;background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,#222);min-width:0}",
				".sn-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:1px}",
				"select.sn-input{appearance:none;cursor:pointer;padding-right:30px}",
				".sn-activeAccountSelect{position:relative;flex:1 1 auto;min-width:0}",
				".sn-activeAccountSelect>.sn-input{width:100%}",
				".sn-selectChevron{position:absolute;right:8px;top:50%;width:14px;height:14px;transform:translateY(-50%);background-color:var(--dsw-alias-label-tertiary,#888f98);pointer-events:none;-webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 14 14%27 fill=%27none%27%3E%3Cpath d=%27M3 5.5 7 9l4-3.5%27 stroke=%27white%27 stroke-width=%271.5%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E\") center / 14px 14px no-repeat;mask:url(\"data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 14 14%27 fill=%27none%27%3E%3Cpath d=%27M3 5.5 7 9l4-3.5%27 stroke=%27white%27 stroke-width=%271.5%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E\") center / 14px 14px no-repeat}",
				".sn-models{display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));border-radius:8px;padding:10px;background:var(--dsw-alias-bg-layer-1,transparent);min-width:0}",
				".sn-toggle{width:16px;height:16px;margin:0;flex:0 0 auto;accent-color:var(--dsw-alias-brand-primary,#3b82f6);cursor:pointer}",
				".sn-toggle:disabled{opacity:.5;cursor:not-allowed}",
				".sn-providerCard{display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));border-radius:10px;padding:12px;background:var(--dsw-alias-bg-layer-1,transparent);min-width:0}",
				".sn-footer{display:flex;flex-direction:column;align-items:stretch;gap:8px;margin-top:2px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22))}",
				".sn-footerStatus{display:flex;flex-direction:column;gap:2px;min-height:16px}",
				".sn-footerActions{display:flex;align-items:center;justify-content:flex-end;gap:8px}",
				".sn-advanced{gap:0;padding:0;overflow:hidden}",
				".sn-advancedHeader{display:flex;align-items:center;width:100%;gap:8px;padding:12px 14px;border:0;background:transparent;color:var(--dsw-alias-label-primary,#222);font:inherit;text-align:left;cursor:pointer}",
				".sn-advancedHeader:hover{background:var(--dsw-alias-bg-layer-3,rgba(127,127,127,.08))}",
				".sn-advancedHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:-2px}",
				".sn-advancedMeta{display:inline-flex;align-items:center;gap:8px;margin-left:auto;white-space:nowrap}",
				".sn-advancedChevron{width:7px;height:7px;border-right:1.5px solid var(--dsw-alias-label-tertiary,#888f98);border-bottom:1.5px solid var(--dsw-alias-label-tertiary,#888f98);transform:rotate(45deg);transition:transform .15s ease}",
				".sn-advancedChevronExpanded{transform:rotate(225deg)}",
				".sn-advancedBody{display:flex;flex-direction:column;gap:10px;padding:0 14px 14px;border-top:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));min-width:0}",
				".sn-advancedBody[hidden]{display:none}",
				".sn-linkButton{font-size:12px;color:var(--dsw-alias-brand-primary,#3b82f6);background:none;border:none;padding:2px 4px;cursor:pointer;border-radius:4px;font-family:inherit}",
				".sn-linkButton:disabled{color:var(--dsw-alias-label-tertiary,#8a8a8a);cursor:default}",
				".sn-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}",
				".sn-truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
				".sn-btnPrimary{font-size:13px;line-height:1.4;padding:6px 14px;border-radius:6px;border:1px solid transparent;background:var(--dsw-alias-button-primary-fill,#3b82f6);color:var(--dsw-alias-label-primary-foreground,#fff);cursor:pointer}",
				".sn-btnPrimary:hover:not(:disabled){filter:brightness(.94)}",
				".sn-btnPrimary:disabled{opacity:.5;cursor:not-allowed}",
				".sn-btnGhost{font-size:13px;line-height:1.4;padding:6px 12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.4));background:transparent;color:var(--dsw-alias-label-secondary,#5c5c5c);cursor:pointer}",
				".sn-btnGhost:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary,#3b82f6);color:var(--dsw-alias-brand-primary,#3b82f6)}",
				".sn-btnGhost:disabled{opacity:.5;cursor:not-allowed}",
				".sn-reset{font-size:12px;line-height:1.4;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#8a8a8a);cursor:pointer;white-space:nowrap}",
				".sn-reset:hover:not(:disabled){color:var(--dsw-alias-brand-primary,#3b82f6)}",
				".sn-reset:disabled{opacity:.5;cursor:not-allowed}",
				".sn-diagnosticsBody{display:flex;flex-direction:column;gap:10px;min-width:0}",
				".sn-diagnosticsTags{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8a8a)}",
				".sn-diagnosticsWarn{color:var(--dsw-alias-label-warning,#b58900)}"
			].join("\n");
			document.head.appendChild(tag);
		}
		/** 在给定的 ctx 上挂载两个槽，共享同一个设置控制器与快照 store。 */
		function applyClientSurfaces(ctx, credentials) {
			const controller = new VisionAidSettingsController(ctx.configForms.get(VISION_NS), credentials);
			ctx.effect(() => () => controller.dispose(), "dsh-sensenova-vision-aid: settings controller");
			const store = createSnapshotStore(controller.state());
			controller.subscribe(() => store.set(controller.state()));
			ctx.effect(() => ctx.remote.$on("credentials/reference-updated", () => {
				controller.refreshCredentials();
			}), "dsh-sensenova-vision-aid: credential invalidations");
			const injected = () => ({
				hooks: { visionAidSettings: store },
				edit: (field, text) => controller.edit(field, text),
				save: () => void controller.save(),
				discard: () => controller.discard(),
				setReuseFreeapi: (on) => controller.setReuseFreeapi(on),
				editKeyDraft: (text) => controller.editKeyDraft(text),
				toggleClearStaged: () => controller.toggleClearStaged(),
				refreshDiagnostics: () => void controller.refreshDiagnostics(),
				testConnection: () => void controller.testConnection()
			});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "vision-sensenova",
				order: 14,
				label: () => ctx.locale.bind("settings.vision-sensenova")("nav"),
				locale: "settings.vision-sensenova",
				inject: injected
			}, VisionAidSection));
			ctx.slots.inject("settings.models.provider-card", () => ctx.slots.register({
				name: "settings.models.provider-card",
				key: "vision-sensenova",
				locale: "settings.vision-sensenova",
				inject: () => ({
					hooks: { visionAidSettings: store },
					edit: (field, text) => controller.edit(field, text),
					save: () => void controller.save()
				})
			}, VisionAidProviderCard));
		}
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"configForms"
		];
		function apply(ctx) {
			injectPageCss();
			ctx.effect(() => ctx.locale.register("settings.vision-sensenova", {
				zh,
				en
			}), "dsh-sensenova-vision-aid: page copy");
			const legacy = adaptLegacyCredentials(ctx.connection?.api?.credentials);
			if (legacy !== void 0) {
				applyClientSurfaces(ctx, legacy);
				return;
			}
			ctx.inject(["remote.credentials"], (remoteCtx) => {
				applyClientSurfaces(remoteCtx, remoteCtx.remote.credentials);
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map