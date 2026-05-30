// Unified account model. Every provider has an `accounts` array (most have
// one; Codex has 5, GLM has 2). Each account carries only its usage rows —
// NO token statistics, NO charts.

// row kinds:  pct → {value}   ratio → {used,total}
function _acct(id, label, email, plan, countdown, fiveH, fTime, weekly, wTime, extra) {
  const rows = [
    { label: "5 小时用量", kind: "pct", value: fiveH, time: fTime },
    { label: "周用量", kind: "pct", value: weekly, tone: weekly >= 100 ? "danger" : undefined, time: wTime },
  ];
  if (extra) rows.push(...extra);
  return { id, label, email, plan, countdown, rows };
}

const ACCT_PROVIDERS = {
  claude: {
    key: "claude", name: "Claude",
    accounts: [
      {
        id: "cl-1", label: "主账号", email: "me••••@example.com", plan: "PRO", countdown: "02:06",
        rows: [
          { label: "5 小时用量", kind: "pct", value: 28, time: "今天 13:10" },
          { label: "周用量", kind: "pct", value: 29, time: "5/18 21:00" },
          { label: "Design 周用量", kind: "pct", value: 100, tone: "danger", time: "5/18 21:00" },
        ],
      },
    ],
  },

  codex: {
    key: "codex", name: "Codex",
    accounts: [
      _acct("c-main", "主力号", "co••••@example.com", "PRO", "周三 02:18", 1, "今天 13:34", 100, "周三 02:18"),
      _acct("c-work", "Work", "te••••@corp.io", "PRO", "00:36", 60, "今天 13:50", 73, "周四 09:00"),
      _acct("c-alt1", "Alt-1", "al••••@example.com", "PLUS", "04:55", 0, "今天 18:00", 8, "周五 10:00"),
      _acct("c-alt2", "Alt-2", "k•••@example.com", "PLUS", "01:40", 12, "今天 14:10", 47, "周四 21:00"),
      _acct("c-alt3", "Alt-3", "ji••••@example.com", "PLUS", "03:10", 0, "今天 16:20", 22, "周五 08:00"),
    ],
  },

  glm: {
    key: "glm", name: "GLM",
    accounts: [
      _acct("g-self", "个人", "pe••••@example.com", "PRO", "03:56", 33, "今天 13:14", 15, "5/17 10:00",
        [{ label: "MCP 月用量", kind: "ratio", used: 95, total: 1000, time: "5/19 10:00" }]),
      _acct("g-team", "团队", "te••••@team.cn", "PRO", "02:30", 12, "今天 12:40", 62, "5/19 10:00"),
    ],
  },

  deepseek: {
    key: "deepseek", name: "DeepSeek",
    accounts: [
      {
        id: "ds-1", label: "默认", email: "ai••••@example.com", plan: null, countdown: "07:01",
        rows: [{ label: "余额", kind: "ratio", used: 46.93, total: 50, tone: "warn", decimals: 2, time: "--" }],
      },
    ],
  },

  tavily: {
    key: "tavily", name: "Tavily",
    accounts: [
      {
        id: "tv-1", label: "默认", email: "se••••@example.com", plan: null, countdown: "07:58",
        rows: [
          { label: "总用量", kind: "ratio", used: 58, total: 1000, time: "6/1 8:00" },
          { label: "搜索", kind: "ratio", used: 52, total: 58, time: "--" },
          { label: "提取", kind: "ratio", used: 6, total: 58, time: "--" },
        ],
      },
    ],
  },

  minimax: {
    key: "minimax", name: "MiniMax",
    accounts: [
      {
        id: "mm-1", label: "默认", email: "vo••••@example.com", plan: "PLUS", countdown: "03:57",
        rows: [
          { label: "文本 (5小时)", kind: "ratio", used: 5, total: 1500, time: "今天 10:00" },
          { label: "视觉 (5小时)", kind: "ratio", used: 0, total: 150, time: "今天 9:59" },
          { label: "搜索 (5小时)", kind: "ratio", used: 0, total: 150, time: "今天 9:59" },
          { label: "图像 (天)", kind: "ratio", used: 0, total: 50, time: "今天 23:59" },
          { label: "语音 (天)", kind: "ratio", used: 0, total: 4000, time: "今天 23:59" },
          { label: "音乐 (天)", kind: "ratio", used: 0, total: 100, time: "今天 23:59" },
        ],
      },
    ],
  },
};

const ACCT_TAB_ORDER = ["claude", "codex", "glm", "deepseek", "tavily", "minimax"];

window.ACCT_PROVIDERS = ACCT_PROVIDERS;
window.ACCT_TAB_ORDER = ACCT_TAB_ORDER;
