/* settings-data.js — datasets for the standalone OmniUsage settings panel.
   Two account scenarios (normal user / CPA user) plus the CPA Manager
   data-source detail. Keys are masked; no token numbers in these lists. */

/* vendor display meta (marks live in icons.jsx VENDOR_ICONS) */
const SV_META = {
  claude:      { name: 'Claude' },
  codex:       { name: 'Codex' },
  gemini:      { name: 'Gemini' },
  kimi:        { name: 'Kimi' },
  antigravity: { name: 'Antigravity' },
  deepseek:    { name: 'DeepSeek' },
  tavily:      { name: 'Tavily' },
  brave:       { name: 'Brave Search' },
  mimo:        { name: 'MiMo' },
  glm:         { name: 'GLM' },
  minimax:     { name: 'MiniMax' },
};

/* ---- how each vendor authenticates ----
   apikey  → 粘贴 API 密钥（DeepSeek、GLM、Gemini、Tavily、MiniMax …）
   session → 网页登录（electron webview）或粘贴 Cookie（MiMo、Kimi …）
   local   → 扫描本地 CLI 授权文件（Claude Code、Codex CLI、Antigravity …） */
const VENDOR_AUTH = {
  deepseek:    'apikey',
  glm:         'apikey',
  gemini:      'apikey',
  tavily:      'apikey',
  brave:       'apikey',
  minimax:     'apikey',
  mimo:        'session',
  kimi:        'session',
  claude:      'local',
  codex:       'local',
  antigravity: 'local',
};

/* meta for the apikey form — placeholder + key prefix + docs hint */
const AUTH_APIKEY_META = {
  deepseek: { prefix: 'sk-',        endpoint: 'https://api.deepseek.com', docs: 'platform.deepseek.com → API Keys' },
  glm:      { prefix: '',           endpoint: 'https://open.bigmodel.cn', docs: 'bigmodel.cn → 接口密钥' },
  gemini:   { prefix: 'AIza',       endpoint: 'https://generativelanguage.googleapis.com', docs: 'aistudio.google.com → API Keys' },
  tavily:   { prefix: 'tvly-',      endpoint: 'https://api.tavily.com', docs: 'app.tavily.com → API Keys' },
  brave:    { prefix: 'BSA',        endpoint: 'https://api.search.brave.com/res/v1', docs: 'brave.com/search/api → Subscriptions' },
  minimax:  { prefix: '',           endpoint: 'https://api.minimaxi.com', docs: 'minimaxi.com → 账户管理 → 接口密钥' },
};

/* meta for the session vendors — login host + cookie field names */
const AUTH_SESSION_META = {
  mimo: { host: 'xiaomi.com', loginUrl: 'https://account.xiaomi.com/login', cookieKeys: ['serviceToken', 'cUserId'] },
  kimi: { host: 'kimi.com',   loginUrl: 'https://www.kimi.com/login',       cookieKeys: ['access_token', 'refresh_token'] },
};

/* mock result of scanning the local filesystem for CLI auth files.
   Each vendor exposes the well-known path it scans + what was found. */
const AUTH_LOCAL_SCAN = {
  claude: {
    paths: ['~/.claude/.credentials.json', '~/.config/claude/auth.json'],
    found: [
      { id: 'cl-a', path: '~/.claude/.credentials.json', account: 'name@personal.com', type: 'OAuth · Pro', expires: '23 天后过期', fresh: true },
      { id: 'cl-b', path: '~/.config/claude/auth.json',   account: 'team@acme.io',       type: 'OAuth · Max',  expires: '已过期 · 需重新登录', fresh: false },
    ],
  },
  codex: {
    paths: ['~/.codex/auth.json'],
    found: [
      { id: 'cx-a', path: '~/.codex/auth.json', account: 'name@personal.com', type: 'ChatGPT · Plus', expires: '9 天后过期', fresh: true },
    ],
  },
  antigravity: {
    paths: ['~/.antigravity/session.json'],
    found: [
      { id: 'ag-a', path: '~/.antigravity/session.json', account: 'name@personal.com', type: 'OAuth', expires: '30 天后过期', fresh: true },
    ],
  },
};

/* ---- 数据标签映射 ----
   what the vendor API actually returns (raw) vs. the default display label.
   Users may override the display label per-row. Drives the mapping editor. */
const VENDOR_RAW_LABELS = {
  deepseek: [
    { raw: 'balance_cny', def: '账户余额' },
  ],
  gemini: [
    { raw: 'gemini-2.5-pro',          def: 'gemini-2.5-pro' },
    { raw: 'gemini-2.5-flash',        def: 'gemini-2.5-flash' },
    { raw: 'gemini-2.5-flash-lite',   def: 'gemini-2.5-flash-lite' },
    { raw: 'gemini-3-pro-preview',    def: 'gemini-3-pro-preview' },
    { raw: 'gemini-3-flash-preview',  def: 'gemini-3-flash-preview' },
  ],
  minimax: [
    { raw: 'text_generation', def: '文本' },
    { raw: 'speech_t2a',      def: '语音' },
    { raw: 'image_gen',       def: '图像' },
    { raw: 'video_gen',       def: '视频' },
    { raw: 'web_search',      def: '搜索' },
    { raw: 'embeddings',      def: 'Embedding' },
  ],
  tavily: [
    { raw: 'total_credits', def: '总量' },
    { raw: 'search_calls',  def: '搜索' },
    { raw: 'extract_calls', def: '提取' },
  ],
  brave: [
    { raw: 'monthly_queries', def: '本月查询' },
    { raw: 'daily_queries',   def: '今日查询' },
  ],
  mimo: [
    { raw: 'window_5h',  def: '5 小时窗口' },
    { raw: 'window_7d',  def: '7 天窗口' },
  ],
  kimi: [
    { raw: 'rpm_quota',   def: '每分钟请求' },
    { raw: 'daily_quota', def: '每日额度' },
  ],
  claude: [
    { raw: 'five_hour_window', def: '5 小时窗口' },
    { raw: 'seven_day_window', def: '7 天窗口' },
  ],
  codex: [
    { raw: 'primary_5h',  def: '5 小时' },
    { raw: 'weekly_cap',  def: '每周' },
  ],
};

/* ---- 普通用户：账号页 ----
   single-account vendors render as ONE row; multi-account vendors group. */
const ACCT_NORMAL = [
  { id: 'claude', accounts: [
    { name: '个人账号', key: 'sk-ant-****1111', source: 'direct' },
  ] },
  { id: 'codex', accounts: [
    { name: '主力账号', key: 'sk-cdx-****1111', source: 'direct' },
    { name: '团队账号', key: 'sk-cdx-****2222', source: 'direct' },
  ] },
  { id: 'kimi', accounts: [
    { name: '个人账号', key: 'sk-kimi-****3333', source: 'direct' },
  ] },
  { id: 'mimo', accounts: [
    { name: '个人账号', key: 'mimo_session_****a1b2', source: 'direct' },
  ] },
];

/* ---- CPA 用户：账号页 ----
   accounts may originate from CPA Manager (source:'cpa' → 隐藏, no delete)
   or be added directly (source:'direct' → 删除). single-account vendors
   still render as ONE row. */
const ACCT_CPA = [
  { id: 'claude', accounts: [
    { name: '个人账号',     key: 'sk-ant-****1111',   source: 'cpa' },
    { name: '工作账号',     key: 'sk-ant-****2222',   source: 'cpa' },
    { name: 'Claude OAuth', key: 'claude_oauth_01',   source: 'direct' },
  ] },
  { id: 'codex', accounts: [
    { name: '主力账号', key: 'sk-cdx-****1111', source: 'cpa' },
    { name: '团队账号', key: 'sk-cdx-****2222', source: 'cpa' },
  ] },
  { id: 'gemini', accounts: [
    { name: '个人账号', key: 'sk-gem-****1111', source: 'cpa' },
  ] },
  { id: 'kimi', accounts: [
    { name: '个人账号', key: 'sk-kimi-****3333', source: 'cpa' },
  ] },
  { id: 'antigravity', accounts: [
    { name: '个人账号', key: 'sk-antg-****1111', source: 'cpa' },
    { name: '工作账号', key: 'sk-antg-****2222', source: 'cpa' },
  ] },
  { id: 'mimo', accounts: [
    { name: '个人账号', key: 'mimo_session_****a1b2', source: 'direct' },
  ] },
];

/* ---- 数据源页：CPA Manager 一个数据源 ---- */
const DATA_SOURCES = [
  {
    id: 'cpa', name: 'CPA Manager', status: '正常',
    url: 'https://cpa.example.com',
    accountsFound: 12, vendorsCovered: 5,
    lastSync: '2 分钟前',
    covers: ['claude', 'codex', 'gemini', 'antigravity', 'kimi'],
  },
];

/* ---- CPA Manager 详情：已发现账号（按服务商分组，可折叠） ---- */
const CPA_DISCOVERED = [
  { id: 'claude', accounts: [
    { name: '个人账号',     key: 'sk-ant-****1111' },
    { name: '工作账号',     key: 'sk-ant-****2222' },
    { name: 'Claude OAuth', key: 'claude_oauth_01' },
  ] },
  { id: 'codex', accounts: [
    { name: '主力账号', key: 'sk-cdx-****1111' },
    { name: '团队账号', key: 'sk-cdx-****2222' },
  ] },
  { id: 'gemini', accounts: [
    { name: '个人账号', key: 'sk-gem-****1111' },
  ] },
  { id: 'kimi', accounts: [
    { name: '个人账号', key: 'sk-kimi-****3333' },
  ] },
  { id: 'antigravity', accounts: [
    { name: '个人账号', key: 'sk-antg-****1111' },
    { name: '工作账号', key: 'sk-antg-****2222' },
  ] },
];

/* 第二个 CPA Manager 的已发现账号（覆盖面更小） */
const CPA_DISCOVERED_2 = [
  { id: 'claude', accounts: [
    { name: '私人账号', key: 'sk-ant-****7777' },
  ] },
  { id: 'gemini', accounts: [
    { name: '个人账号', key: 'sk-gem-****7777' },
  ] },
  { id: 'deepseek', accounts: [
    { name: '个人账号', key: 'sk-ds-****7777' },
  ] },
];

/* CPA sync scope — vendor list shown as toggles on the detail / add pages */
const CPA_SCOPE = ['claude', 'codex', 'gemini', 'antigravity', 'kimi'];

/* ---- 每个厂商的刷新策略 ----
   manualDefault: 该服务默认仅手动刷新；note 解释原因，显示在添加/编辑弹窗。 */
const VENDOR_REFRESH = {
  brave: {
    manualDefault: true,
    note: '用量统计需向 Brave Search API 发送一次搜索请求才能获取，会占用配额，因此默认仅手动刷新。',
  },
};

/* add-account picker */
const ADD_COMMON = ['claude', 'codex', 'gemini', 'kimi', 'mimo', 'deepseek', 'tavily', 'brave'];

/* ============================================================
   UNIFIED CONNECTIONS  (架构 v2 §5.5.6 — 展示边界)
   设置页只有一个「已添加」列表，不分区。列表里每个条目 = 用户配置的
   一个连接(数据源)：
     · type:'direct'  N=1，绝大多数。普通一行，直接显示状态 + 用量。
                      行菜单含 刷新 / 改名 / 删除（破坏性操作在数据源层级）。
     · type:'cpa'     N>1。行首带展开箭头；不展开时与普通行无异。
                      主行菜单含 同步 / 连接设置 / 改名 / 移除数据源。
                      展开后的账号子行只有 隐藏 / 改名，无删除（§5.5.5）。
   三层 ID 解耦(provider / accountId / sourceInstanceId)只活在数据层，
   不投射成 UI 导航结构——99% 不用 CPA 的用户看到的就是自己的账号列表。

   字段：
     status  'ok' | 'error' | 'auth' | 'paused'
     usage   { pct, label }           百分比型（峰值）
             { used, limit, label }   分数型（余额 / 额度）
             null                     无可用数据
   ============================================================ */

/* ---- 账号列表：按数据源(厂商)组织 ----
   架构 v2 §5.5.6。单账号厂商 = 一行；多账号厂商（如 GLM 两个账号）= 分组；
   CPA = 一行可展开的一对多分组。不显示用量。
     status  'ok' | 'auth' | 'error'
     直连分组里每个账号自带 status；CPA 账号可带 hidden / removed 标记。 */
const CONNECTIONS = [
  { type: 'vendor', id: 'claude', accounts: [
    { id: 'cl-1', name: '个人账号', status: 'ok' },
  ] },
  { type: 'vendor', id: 'glm', accounts: [
    { id: 'glm-1', name: '个人账号', status: 'ok' },
    { id: 'glm-2', name: '研究账号', status: 'ok' },
  ] },
  { type: 'vendor', id: 'codex', accounts: [
    { id: 'cx-1', name: '主力账号', status: 'ok' },
    { id: 'cx-2', name: '团队账号', status: 'ok' },
  ] },
  { type: 'vendor', id: 'deepseek', accounts: [
    { id: 'ds-1', name: '个人账号', status: 'ok' },
  ] },
  { type: 'vendor', id: 'tavily', accounts: [
    { id: 'tv-1', name: '个人账号', status: 'ok' },
  ] },
  { type: 'vendor', id: 'brave', accounts: [
    { id: 'br-1', name: '个人账号', status: 'ok' },
  ] },
  { type: 'vendor', id: 'mimo', accounts: [
    { id: 'mm-1', name: '个人账号', status: 'auth' },
  ] },

  /* CPA Manager：一行可展开的一对多连接，始终就在这个列表里。
     可同时配置多个 CPA Manager —— 每个是独立的一行，带各自别名/URL/范围。 */
  { type: 'cpa', id: 'src-cpa', name: '公司 CPA', note: '公司', url: 'https://cpa.company.com',
    status: 'ok', synced: '2 分钟前',
    scope: ['claude', 'codex', 'gemini', 'antigravity', 'kimi'],
    discovered: CPA_DISCOVERED,
    accounts: [
      { id: 'cpa-cl-1', vendor: 'claude', name: '个人账号', status: 'ok' },
      { id: 'cpa-cl-2', vendor: 'claude', name: '工作账号', status: 'ok' },
      // 账号级失败（§5.5.3）：只这一行进 stale，同源其他账号照常刷新
      { id: 'cpa-cl-3', vendor: 'claude', name: '测试账号', status: 'error' },
      { id: 'cpa-cx-1', vendor: 'codex', name: '主力账号', status: 'ok' },
      // 本地隐藏（§5.5.5）：只写 accountOverrides.hidden，不调远端删除
      { id: 'cpa-cx-2', vendor: 'codex', name: '团队账号', status: 'ok', hidden: true },
      { id: 'cpa-gm-1', vendor: 'gemini', name: '个人账号', status: 'ok' },
      { id: 'cpa-ag-1', vendor: 'antigravity', name: '个人账号', status: 'ok' },
      // 来源已移除（§5.5.3）：用户在 CPA-Manager 那侧删了号，保留有限历史后清理
      { id: 'cpa-ag-2', vendor: 'antigravity', name: '工作账号', status: 'ok', removed: true },
      { id: 'cpa-km-1', vendor: 'kimi', name: '个人账号', status: 'ok' },
    ] },

  /* 第二个 CPA Manager：另一套别名 / URL / 范围，覆盖面更小 */
  { type: 'cpa', id: 'src-cpa-2', name: '个人 CPA', note: '个人', url: 'https://cpa.mystudio.io',
    status: 'ok', synced: '6 分钟前',
    scope: ['claude', 'gemini', 'deepseek'],
    discovered: CPA_DISCOVERED_2,
    accounts: [
      { id: 'cpa2-cl-1', vendor: 'claude', name: '私人账号', status: 'ok' },
      { id: 'cpa2-gm-1', vendor: 'gemini', name: '个人账号', status: 'ok' },
      { id: 'cpa2-ds-1', vendor: 'deepseek', name: '个人账号', status: 'ok' },
    ] },
];

Object.assign(window, {
  SV_META, ACCT_NORMAL, ACCT_CPA, DATA_SOURCES, CPA_DISCOVERED, CPA_SCOPE, ADD_COMMON,
  CONNECTIONS,
  VENDOR_AUTH, AUTH_APIKEY_META, AUTH_SESSION_META, AUTH_LOCAL_SCAN, VENDOR_RAW_LABELS, VENDOR_REFRESH,
});
