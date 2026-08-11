# text-label-sm 无 --text-label-sm token，字号类不生效

- 来源：t302 实施遗留（2026-08-11）
- 内容：`src/renderer` 11 处用 `text-label-sm`（TokenStatsView、SessionTable、Segmented 等），但 globals.css @theme 未定义 `--text-label-sm`（字号 scale 只有 label-md 11.5 / label-caps 10.5），Tailwind 4 下该类不生成字号 CSS，视觉与无字号等价。属存量失效类，非 t302 引入。需定夺：补 `--text-label-sm` token（DESIGN.md 新增字号档）或改用现有字号类。
- 处理：t303
