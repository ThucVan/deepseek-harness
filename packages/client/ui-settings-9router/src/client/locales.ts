/** English strings are the key-set source of truth. */
export const en = {
  nav: '9router', title: '9router workspace',
  intro: 'Import accounts, configure routing, and manage the Work orchestration brain.',
  openRouter: '9router dashboard', openImporter: 'Codex importer', openMitm: 'Antigravity MITM', showHere: 'Show importer here', hideHere: 'Hide',
  frameTitle: 'Local Codex account importer',
  localNotice: 'Router: 127.0.0.1:20128 · Importer: 127.0.0.1:20129. Local same-machine access only.',
  unavailable: 'If the importer frame is blocked or unavailable, use Codex importer.',
  brainTitle: 'Work brain model',
  brainHelp: 'Scan every active provider, exclude DeepSeek routes, then set the strongest eligible route as the default brain for new sessions.',
  brainRefresh: 'Refresh brain model', brainRefreshing: 'Refreshing…',
  brainSelected: 'Brain updated to {model}. Start a new conversation to use it.',
  brainFailed: 'Could not refresh the brain: {message}',
} as const

/** Translation key owned by the 9router Settings namespace. */
export type NineRouterKey = keyof typeof en

/** Chinese strings share the exact English key set. */
export const zh: { [Key in NineRouterKey]: string } = {
  nav: '9router', title: '9router 工作区',
  intro: '导入账户、配置路由并管理 Work 编排大脑。',
  openRouter: '9router 控制台', openImporter: 'Codex 导入器', openMitm: 'Antigravity MITM', showHere: '在此显示导入器', hideHere: '隐藏',
  frameTitle: '本地 Codex 账户导入器',
  localNotice: '路由器：127.0.0.1:20128 · 导入器：127.0.0.1:20129。仅支持同机本地访问。',
  unavailable: '若导入器嵌入视图被阻止或无法访问，请使用“Codex 导入器”。',
  brainTitle: 'Work 大脑模型',
  brainHelp: '扫描所有活跃 provider，排除 DeepSeek 路由，并将最强的合格路由设为新会话的默认大脑。',
  brainRefresh: '刷新大脑模型', brainRefreshing: '正在刷新…',
  brainSelected: '大脑已更新为 {model}。请新建会话以使用。',
  brainFailed: '无法刷新大脑：{message}',
}
