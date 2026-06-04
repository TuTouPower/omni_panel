/* data.js — OmniUsage sample data (no token numbers in lists, per spec) */

const VENDORS = [
  {
    id: 'claude', name: 'Claude', updated: '8 分钟前',
    accounts: [
      { name: '个人账号', key: 'sk-****a1b2c3d4e5f6', updated: '8 分钟前',  h5: 22, week: 61, r5: '今天 13:10', rw: '5/18 21:00' },
      { name: '工作账号', key: 'sk-****f7g8h9i0j1k2', updated: '7 分钟前',  h5: 18, week: 57, r5: '今天 13:12', rw: '5/18 21:00' },
      { name: '测试账号', key: 'sk-****l3m4n5o6p7q8', updated: '9 分钟前',  h5: 12, week: 33, r5: '今天 13:13', rw: '5/18 21:00' },
      { name: '备用账号', key: 'sk-****r9s0t1u2v3w4', updated: '6 分钟前',  h5: 9,  week: 26, r5: '今天 13:09', rw: '5/18 21:00' },
      { name: '开发账号', key: 'sk-****x5y6z7a8b9c0', updated: '10 分钟前', h5: 15, week: 44, r5: '今天 13:08', rw: '5/18 21:00' },
    ],
    h5: 72, week: 58, r5: '今天 13:10', rw: '5/18 21:00',
  },
  {
    id: 'codex', name: 'Codex', updated: '10 分钟前',
    accounts: [
      { name: '主力账号', key: 'sk-****c0d3x1a2b3c4', updated: '10 分钟前', h5: 6, week: 93, r5: '今天 13:34', rw: '5/18 21:00' },
      { name: '团队账号', key: 'sk-****d5e6f7g8h9i0', updated: '11 分钟前', h5: 8, week: 71, r5: '今天 13:30', rw: '5/18 21:00' },
    ],
    h5: 6, week: 93, r5: '今天 13:34', rw: '5/18 21:00',
  },
  {
    id: 'glm', name: 'GLM', updated: '12 分钟前',
    accounts: [
      { name: '个人账号', key: 'sk-****g1l2m3n4o5p6', updated: '12 分钟前', h5: 34, week: 41, r5: '今天 13:14', rw: '5/17 10:00', mcp: { value: 58, max: 1000 } },
      { name: '研究账号', key: 'sk-****q7r8s9t0u1v2', updated: '13 分钟前', h5: 21, week: 38, r5: '今天 13:11', rw: '5/17 10:00', mcp: { value: 37, max: 1000 } },
    ],
    h5: 34, week: 41, r5: '今天 13:14', rw: '5/17 10:00',
    mcp: { value: 95, max: 1000 },
  },
  {
    id: 'deepseek', name: 'DeepSeek', updated: '9 分钟前',
    accounts: [
      { name: '个人账号', key: 'sk-****d9e8e7p6s5k4', updated: '9 分钟前', r5: '今天 13:38', rw: '5/18 09:00', balanceOnly: true, balance: { value: 52, max: 100 } },
    ],
    h5: 7, week: 22, r5: '今天 13:38', rw: '5/18 09:00',
    balanceOnly: true, balance: { value: 52, max: 100 },
  },
  {
    id: 'minimax', name: 'MiniMax', updated: '11 分钟前',
    accounts: [
      { name: '个人账号', key: 'sk-****m1n2m3a4x5b6', updated: '11 分钟前', h5: null, week: 31, r5: '', rw: '5/18 08:00' },
    ],
    h5: null, week: 31, r5: '', rw: '5/18 08:00',
  },
  {
    id: 'gemini', name: 'Gemini', updated: '5 分钟前',
    accounts: [
      { name: '个人账号', key: 'sk-gem-****1111', updated: '5 分钟前',
        metrics: [
          { label: 'Pro',   value: 41 },
          { label: 'Flash', value: 43 },
          { label: 'Lite',  value: 16 },
          { label: '图像',  value: 29 },
          { label: '嵌入',  value: 72 },
          { label: '缓存',  value: 34 },
          { label: '文件',  value: 18 },
          { label: '批量',  value: 8 },
        ],
      },
    ],
  },
  {
    id: 'tavily', name: 'Tavily', updated: '6 分钟前',
    accounts: [
      { name: '个人账号', key: 'tvly-****a1b2c3d4', updated: '6 分钟前', h5: 46, week: 67, r5: '今天 13:10', rw: '6/1 08:00' },
    ],
    h5: 46, week: 67, r5: '今天 13:10', rw: '6/1 08:00',
  },
];

/* chart datasets — values are relative (0..1 of 100M). No model breakdown. */
function bellCurve(n, peak, height, spread, jitter) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const g = Math.exp(-Math.pow(i - peak, 2) / (2 * spread * spread));
    const j = 1 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * jitter;
    out.push(Math.max(0.01, Math.min(1, g * height * j)));
  }
  return out;
}
const CHART = {
  today: {
    values: bellCurve(28, 15, 0.96, 5.2, 0.22),
    labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
  },
  week: {
    values: [0.42, 0.61, 0.55, 0.78, 0.7, 0.38, 0.3],
    labels: ['5/12', '5/13', '5/14', '5/15', '5/16', '5/17', '5/18'],
  },
  month: {
    values: bellCurve(30, 18, 0.9, 8, 0.3),
    labels: ['5/1', '5/6', '5/11', '5/16', '5/21', '5/26', '5/31'],
  },
};
/* Total Tokens per scope, in millions (M). Formatted to M / B at render. */
const TOTALS = {
  overview: { today: 418, week: 2640, month: 9820 },
  claude:   { today: 182, week: 1180, month: 4420 },
  codex:    { today: 64,  week: 392,  month: 1460 },
  glm:      { today: 96,  week: 540,  month: 2010 },
  deepseek: { today: 31,  week: 188,  month: 690 },
  minimax:  { today: 28,  week: 164,  month: 620 },
  gemini:   { today: 88,  week: 520,  month: 1980 },
  tavily:   { today: 17,  week: 96,   month: 358 },
};
function fmtTokens(m) {
  if (m >= 1000) {
    const b = m / 1000;
    return (b >= 10 ? b.toFixed(0) : b.toFixed(2)) + 'B';
  }
  return Math.round(m) + 'M';
}

/* per-vendor today curves (slightly different shapes) */
function vendorChart(id) {
  const seedPeak = { claude:14, codex:16, glm:13, deepseek:12, minimax:15, gemini:14, tavily:14 }[id] || 14;
  return {
    today: { values: bellCurve(28, seedPeak, 0.85, 4.6, 0.28), labels: CHART.today.labels },
    week:  { values: CHART.week.values.map(v => v*0.8), labels: CHART.week.labels },
    month: { values: bellCurve(30, 17, 0.78, 7.5, 0.32), labels: CHART.month.labels },
  };
}

Object.assign(window, { VENDORS, CHART, vendorChart, TOTALS, fmtTokens });
