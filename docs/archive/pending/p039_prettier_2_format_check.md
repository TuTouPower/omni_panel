# p039 prettier 基线漂移 2 文件致 format:check 挂（2026-08-04）

- 来源：t197 收尾自查（task-run Step 7）
- 内容：`docs/spikes/s010_popup_hide_resource/code/hide_show_spike.js` 与 `tests/e2e/fixtures/mock_server.mjs` 未过 prettier 格式，`pnpm check` 的 format:check 必挂。两者均非 t197 改动文件（`git diff 3b2804f6` 无此二文件），为既有漂移，影响后续每个 task 的 `{test_cmd}` 门禁。
- 处理：t199
