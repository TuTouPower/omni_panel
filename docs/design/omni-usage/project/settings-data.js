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
const ADD_COMMON = ['claude', 'codex', 'gemini', 'kimi', 'deepseek', 'tavily'];

Object.assign(window, {
  SV_META, ACCT_NORMAL, ACCT_CPA, DATA_SOURCES, CPA_DISCOVERED, CPA_SCOPE, ADD_COMMON,
});
