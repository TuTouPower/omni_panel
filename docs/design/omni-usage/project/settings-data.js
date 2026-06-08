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

/* CPA sync scope — vendor list shown as toggles on the detail / add pages */
const CPA_SCOPE = ['claude', 'codex', 'gemini', 'antigravity', 'kimi'];

/* add-account picker */
const ADD_COMMON = ['claude', 'codex', 'gemini', 'kimi', 'mimo', 'deepseek', 'tavily'];

Object.assign(window, {
  SV_META, ACCT_NORMAL, ACCT_CPA, DATA_SOURCES, CPA_DISCOVERED, CPA_SCOPE, ADD_COMMON,
  VENDOR_AUTH, AUTH_APIKEY_META, AUTH_SESSION_META, AUTH_LOCAL_SCAN, VENDOR_RAW_LABELS,
});
