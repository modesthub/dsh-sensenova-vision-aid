/**
 * SenseNova 视觉辅助（vision-aid）设置页与 Models 页卡片的文案（zh/en 双语）。
 * 注册命名空间：`settings.vision-sensenova`（与 settings.section / provider-card 的
 * locale 选项一致，参考 dsh-sensenova-freeapi 的 `settings.sensenova`）。
 *
 * 文案纪律（dsh harness `Client UI copy is locale-owned`）：所有产品可见文案
 * 一律经 `t`（本命名空间）读取，组件内不硬编码任何面向用户的字符串。
 */

export const zh: Record<string, string> = {
  nav: 'SenseNova 视觉辅助',
  title: 'SenseNova 视觉辅助',
  intro:
    '配置图片识别的视觉模型与凭据。开启「复用 freeapi 凭据」后与 dsh-sensenova-freeapi 共用同一把 API 密钥，无需配置第二把 key；密钥只写入本机凭据服务、不回显。',
  routeLabel: '插件路由',
  displayName: 'SenseNova 视觉辅助（dsh-sensenova-vision-aid）',

  groupCredentials: '凭据与复用',
  reuseFreeapi: '复用 dsh-sensenova-freeapi 凭据',
  reuseFreeapiHint:
    '开启后，API 密钥经 credential-ref 解析，与 freeapi 插件共用同一把 key（读取 ~/.dsh/.credentials.yaml 的 refs: 或环境变量），免配第二把。',
  reuseFreeapiOffHint:
    '关闭后显示密钥输入框，保存时写入本机凭据服务（credential-ref），host 按同一 ref 解析。',
  keyRef: '凭据引用名（credential-ref）',
  keyRefHint:
    '默认 SENSENOVA_API_KEY；免费额度池可切换 SENSENOVA_API_KEY_2 … SENSENOVA_API_KEY_10。',
  keyRefOptionsHint: '下拉为常用 ref；关闭复用时可直接输入自定义 ref（如 VISION_SENSENOVA_API_KEY）。',
  apiKey: 'API 密钥',
  apiKeyHint: '在 SenseNova 控制台创建。留空保存不会覆盖已存储的密钥。',
  apiKeySet: '已配置',
  apiKeyUnset: '未配置',
  clearKey: '清除已存密钥',
  show: '显示',
  hide: '隐藏',
  keySaved: '密钥已写入凭据服务 ✓',
  keyClearStaged: '已勾选清除，保存后生效',

  groupConnection: '连接与兜底',
  apiBase: 'API 地址',
  apiBaseHint: '默认 https://token.sensenova.cn/v1，一般无需修改。',
  modelChain: '模型链（逗号分隔）',
  modelChainHint:
    '直连兜底路径的故障转移链，按顺序尝试、首个成功即返回。默认 sensenova-6.8-flash-lite,deepseek-flash,kimi-k3。',
  imageMode: '图片传输模式',
  imageModeImageUrl: 'image_url（推荐）',
  imageModeImageBase64: 'image_base64（遗留）',
  imageModeHint: '默认 image_url：本地文件内联为 data: URL；kimi-k3 只吃 base64。',
  timeoutMs: '单模型尝试超时（毫秒）',
  timeoutMsHint: '直连路径每个模型的请求超时上限，默认 180000。',

  groupDiagnostics: '诊断（只读）',
  diagnosticsIntro: '数据来自 host 状态路由 GET /api/sensenova-vision-aid/status，只读、不影响运行。',
  diagnosticsRefresh: '刷新',
  diagnosticsLoading: '加载中…',
  diagnosticsUnavailable: '诊断暂不可用（host 未提供该接口，或本次取数失败）。',
  diagServiceAvailable: '服务可用',
  diagServiceUnavailable: '服务不可用',
  diagRefs: '凭据 refs',
  diagRefConfigured: '已配置',
  diagRefMissing: '缺失',
  diagModelChain: '模型链',
  diagApiBase: 'API 地址',
  diagImageMode: '图片模式',

  testConnection: '测试连接',
  testConnectionRunning: '测试中…',
  testConnectionOk: '连接正常 ✓',
  testConnectionOkHint: '测试成功（直连 chat 路径，模型 {model}）。',
  testConnectionFail: '连接失败',
  testConnectionFailHint: '原因：{reason}',
  testConnectionIdle: '点「测试连接」用 chat 工具验证 key/端点连通性。',
  testConnectionHint: '调用 host 的 chat 工具（直连路径），验证密钥与端点。',

  readOnly: '当前配置为只读。',
  reset: '重置',
  save: '保存',
  saving: '保存中…',
  saved: '已保存 ✓',
  saveFailed: '保存失败，请重试。',
  unsaved: '未保存',
  advancedSettings: '高级设置',

  cardTitle: 'SenseNova 视觉辅助',
  cardRouteActive: '已启用',
  cardLoadingHint: '正在读取 SenseNova 视觉辅助配置…',
  cardRegistrationHint: '此卡片随 dsh-sensenova-vision-aid 插件注册。',
  cardConfiguredHint: '凭据已就绪（{ref}）。如需更换密钥或修改模型链，请前往「设置 → SenseNova 视觉辅助」。',
  cardUnconfiguredHint: '尚未配置 API 密钥，请前往「设置 → SenseNova 视觉辅助」完成配置。',
  cardReuseOn: '复用 freeapi 凭据',
  cardReuseOff: '独立凭据',
  cardModel: '模型链',
};

export const en: Record<string, string> = {
  nav: 'SenseNova Vision Aid',
  title: 'SenseNova Vision Aid',
  intro:
    'Configure the vision models and credentials used for image recognition. With “Reuse freeapi credentials” enabled this plugin shares the same API key as dsh-sensenova-freeapi, so no second key is needed; keys are written only to the local credential service and never echoed.',
  routeLabel: 'Plugin route',
  displayName: 'SenseNova Vision Aid (dsh-sensenova-vision-aid)',

  groupCredentials: 'Credentials & reuse',
  reuseFreeapi: 'Reuse dsh-sensenova-freeapi credentials',
  reuseFreeapiHint:
    'When enabled, the API key is resolved through a credential-ref shared with the freeapi plugin (reads the refs: block of ~/.dsh/.credentials.yaml or the environment), so no second key is needed.',
  reuseFreeapiOffHint:
    'When disabled, a key input is shown; saving writes to the local credential service (credential-ref) and the host resolves the same ref.',
  keyRef: 'Credential ref name',
  keyRefHint:
    'Defaults to SENSENOVA_API_KEY; the free tier pool can switch to SENSENOVA_API_KEY_2 … SENSENOVA_API_KEY_10.',
  keyRefOptionsHint: 'The dropdown lists common refs; with reuse off you can type a custom ref (e.g. VISION_SENSENOVA_API_KEY).',
  apiKey: 'API key',
  apiKeyHint: 'Create one in the SenseNova console. Saving with this field blank keeps the stored key.',
  apiKeySet: 'Configured',
  apiKeyUnset: 'Not configured',
  clearKey: 'Clear stored key',
  show: 'Show',
  hide: 'Hide',
  keySaved: 'Key written to the credential service ✓',
  keyClearStaged: 'Clear staged — applies on save',

  groupConnection: 'Connection & fallback',
  apiBase: 'API base URL',
  apiBaseHint: 'Defaults to https://token.sensenova.cn/v1; usually leave as-is.',
  modelChain: 'Model chain (comma-separated)',
  modelChainHint:
    'Failover chain for the direct fallback path, tried in order until one succeeds. Defaults to sensenova-6.8-flash-lite,deepseek-flash,kimi-k3.',
  imageMode: 'Image transfer mode',
  imageModeImageUrl: 'image_url (recommended)',
  imageModeImageBase64: 'image_base64 (legacy)',
  imageModeHint: 'Defaults to image_url: local files are inlined as data: URLs; kimi-k3 only accepts base64.',
  timeoutMs: 'Per-model attempt timeout (ms)',
  timeoutMsHint: 'Request timeout per model on the direct path; defaults to 180000.',

  groupDiagnostics: 'Diagnostics (read-only)',
  diagnosticsIntro: 'Data comes from the host status route GET /api/sensenova-vision-aid/status; read-only, does not affect runtime.',
  diagnosticsRefresh: 'Refresh',
  diagnosticsLoading: 'Loading…',
  diagnosticsUnavailable: 'Diagnostics unavailable right now (host did not provide the route, or the request failed).',
  diagServiceAvailable: 'Service available',
  diagServiceUnavailable: 'Service unavailable',
  diagRefs: 'Credential refs',
  diagRefConfigured: 'Configured',
  diagRefMissing: 'Missing',
  diagModelChain: 'Model chain',
  diagApiBase: 'API base',
  diagImageMode: 'Image mode',

  testConnection: 'Test connection',
  testConnectionRunning: 'Testing…',
  testConnectionOk: 'Connection OK ✓',
  testConnectionOkHint: 'Test succeeded (direct chat path, model {model}).',
  testConnectionFail: 'Connection failed',
  testConnectionFailHint: 'Reason: {reason}',
  testConnectionIdle: 'Press “Test connection” to verify key/endpoint connectivity through the chat tool.',
  testConnectionHint: 'Calls the host chat tool (direct path, no subagent) to verify the key and endpoint.',

  readOnly: 'Settings are read-only.',
  reset: 'Reset',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved ✓',
  saveFailed: 'Save failed, please retry.',
  unsaved: 'Unsaved',
  advancedSettings: 'Advanced settings',

  cardTitle: 'SenseNova Vision Aid',
  cardRouteActive: 'Active',
  cardLoadingHint: 'Loading the SenseNova Vision Aid configuration…',
  cardRegistrationHint: 'This card is contributed by the dsh-sensenova-vision-aid plugin.',
  cardConfiguredHint: 'Credentials ready ({ref}). To replace the key or change the model chain, open “Settings → SenseNova Vision Aid”.',
  cardUnconfiguredHint: 'No API key configured yet; open “Settings → SenseNova Vision Aid” to finish setup.',
  cardReuseOn: 'Reuse freeapi credentials',
  cardReuseOff: 'Standalone credentials',
  cardModel: 'Model chain',
};
