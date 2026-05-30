// UsageBoard provider data — usage rows, token grids, chart series.
// Numbers mirror the reference screenshots.

const DOT = {
  blue: "var(--d-blue)",
  green: "var(--d-green)",
  orange: "var(--d-orange)",
  purple: "var(--d-purple)",
  red: "var(--d-red)",
};

// bar row kinds:
//   pct   → {value:0-100}  shows "NN%"
//   ratio → {used, total}  shows "used / total" (fill = used/total)
const UB_PROVIDERS = {
  claude: {
    key: "claude",
    name: "Claude",
    plan: "PRO",
    countdown: "02:06",
    rows: [
      { label: "5 小时用量", kind: "pct", value: 28, time: "今天 13:10" },
      { label: "周用量", kind: "pct", value: 29, time: "5/18 21:00" },
      { label: "Design 周用量", kind: "pct", value: 100, tone: "danger", time: "5/18 21:00" },
    ],
    tokens: [
      { name: "Token 总量", val: "141.66", unit: "M", dot: DOT.blue },
      { name: "claude-opus-4-7", val: "102.98", unit: "M", dot: DOT.green },
      { name: "claude-sonnet-4-6", val: "23.39", unit: "M", dot: DOT.orange },
      { name: "claude-haiku-4-5-202…", val: "15.29", unit: "M", dot: DOT.purple },
    ],
    chart: {
      yMax: 49,
      yTicks: [49, 33, 16, 0],
      xLabels: ["04-28", "05-02", "05-06", "05-10", "05-12"],
      series: [
        { color: "var(--d-blue)", data: [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 1, 2, 49, 31, 46, 6] },
        { color: "var(--d-green)", data: [0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.6, 1.5, 33, 24, 37, 5] },
        { color: "var(--d-orange)", data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.6, 16, 5, 6, 1] },
        { color: "var(--d-purple)", data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 5, 2, 7, 1] },
      ],
    },
  },

  codex: {
    key: "codex",
    name: "Codex",
    plan: "PLUS",
    countdown: "00:36",
    rows: [
      { label: "5 小时用量", kind: "pct", value: 1, time: "今天 13:34" },
      { label: "周用量", kind: "pct", value: 100, tone: "danger", time: "明天 2:18" },
    ],
    tokens: [
      { name: "Token 总量", val: "562.85", unit: "M", dot: DOT.blue },
      { name: "gpt-5.5", val: "488.13", unit: "M", dot: DOT.green },
      { name: "codex-auto-review", val: "74.72", unit: "M", dot: DOT.orange },
    ],
    chart: {
      yMax: 303,
      yTicks: [303, 202, 101, 0],
      xLabels: ["05-06", "05-08", "05-10", "05-12"],
      series: [
        { color: "var(--d-blue)", data: [101, 36, 30, 32, 18, 70, 303, 5] },
        { color: "var(--d-green)", data: [101, 30, 26, 28, 15, 60, 222, 4] },
        { color: "var(--d-orange)", data: [2, 2, 2, 3, 3, 6, 75, 3] },
      ],
    },
  },

  glm: {
    key: "glm",
    name: "GLM",
    plan: "PRO",
    countdown: "03:56",
    rows: [
      { label: "5 小时用量", kind: "pct", value: 33, time: "今天 13:14" },
      { label: "周用量", kind: "pct", value: 15, time: "5/17 10:00" },
      { label: "MCP 月用量", kind: "ratio", used: 95, total: 1000, time: "5/19 10:00" },
    ],
    tokens: [
      { name: "Token 总量", val: "419.17", unit: "M", dot: DOT.blue },
      { name: "GLM-5.1", val: "408.28", unit: "M", dot: DOT.green },
      { name: "GLM-4.7", val: "9.75", unit: "M", dot: DOT.orange },
      { name: "GLM-5-Turbo", val: "1.08", unit: "M", dot: DOT.purple },
      { name: "GLM-4.6V", val: "68.65", unit: "K", dot: DOT.red },
    ],
    chart: {
      yMax: 106,
      yTicks: [106, 70, 35, 0],
      xLabels: ["04-28", "05-02", "05-06", "05-10", "05-12"],
      series: [
        { color: "var(--d-green)", data: [12, 22, 14, 31, 19, 28, 106, 8, 30, 6, 7, 11, 24] },
        { color: "var(--d-blue)", data: [13, 23, 15, 32, 20, 29, 104, 9, 31, 7, 8, 12, 25] },
        { color: "var(--d-orange)", data: [1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2] },
        { color: "var(--d-red)", data: [0.5, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 1] },
      ],
    },
  },

  deepseek: {
    key: "deepseek",
    name: "DeepSeek",
    plan: null,
    countdown: "07:01",
    rows: [
      { label: "余额", kind: "ratio", used: 46.93, total: 50, tone: "warn", decimals: 2, time: "--" },
    ],
  },

  tavily: {
    key: "tavily",
    name: "Tavily",
    plan: null,
    countdown: "07:58",
    rows: [
      { label: "总用量", kind: "ratio", used: 58, total: 1000, time: "6/1 8:00" },
      { label: "搜索", kind: "ratio", used: 52, total: 58, time: "--" },
      { label: "提取", kind: "ratio", used: 6, total: 58, time: "--" },
    ],
  },

  minimax: {
    key: "minimax",
    name: "MiniMax",
    plan: "PLUS",
    countdown: "03:57",
    rows: [
      { label: "文本 (5小时)", kind: "ratio", used: 5, total: 1500, time: "今天 10:00" },
      { label: "视觉 (5小时)", kind: "ratio", used: 0, total: 150, time: "今天 9:59" },
      { label: "搜索 (5小时)", kind: "ratio", used: 0, total: 150, time: "今天 9:59" },
      { label: "图像 (天)", kind: "ratio", used: 0, total: 50, time: "今天 23:59" },
      { label: "语音 (天)", kind: "ratio", used: 0, total: 4000, time: "今天 23:59" },
      { label: "音乐 (天)", kind: "ratio", used: 0, total: 100, time: "今天 23:59" },
      { label: "翻唱 (天)", kind: "ratio", used: 0, total: 100, time: "今天 23:59" },
      { label: "歌词 (天)", kind: "ratio", used: 0, total: 100, time: "今天 23:59" },
    ],
  },
};

const UB_TAB_ORDER = ["claude", "codex", "glm", "deepseek", "tavily", "minimax"];

window.UB_PROVIDERS = UB_PROVIDERS;
window.UB_TAB_ORDER = UB_TAB_ORDER;
