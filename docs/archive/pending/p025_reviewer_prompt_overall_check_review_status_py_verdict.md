# p025 reviewer prompt 模板要求 `overall:` 但 check_review_status.py 认 `verdict:`（2026-08-02）

- 来源：t187 收尾自查（task-run Step 7）
- 内容：`task-run` skill 的 review 指示与 reviewer 习惯写「overall: PASS/FAIL」，但 `scripts/check_review_status.py:29` 的 `VERDICT_RE = ^verdict: (PASS|FAIL)$` 只认 `verdict:`。reviewer 若只写 `overall:` → check 返回 `overall=INCOMPLETE`，需手工在 review 报告补 `verdict:` 行。t187 Round 1/2 即踩此坑（手工补正）。两处应统一：要么脚本兼容 `overall:`，要么 skill prompt 模板与 reviewer 指示统一要求 `verdict:`。
- 处理：手动统一为 `verdict:`（2026-08-04）——review prompt 模板（code/test/general/share）末行已统一要求 `verdict: PASS` / `verdict: FAIL`，`check_review_status.py:29` 认 `^verdict:\s*(PASS|FAIL)\s*$`，`tests/repo_template/test_check_review_status.py` 锁定严格行匹配；脚本保持不兼容 `overall:`，reviewer 只写 `overall:` 仍会 INCOMPLETE 属预期。归档 t187 review_general.md 残留 `overall:` 为历史产物，不再回改。
