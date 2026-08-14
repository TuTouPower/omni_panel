# Task review t367（reviewer_focus: 通用）

- task：`t367_session_history_main_robustness`
- spec：`docs/tasks/t367_session_history_main_robustness/spec.md`
- diff_anchor：`4005790f647142a63b814dde2c1c597865b25615`
- target：`git diff 4005790f647142a63b814dde2c1c597865b25615`
- round：1
- reviewed_at：2026-08-14 13:15 UTC+8

## Findings

零 finding。逐 AC 核对与验证证据见「结论」。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：N/A
- 本轮新发现：0 条
- 未进表的提示：
  - AC-002 覆盖边界：`handle_change` 仅对 `cursor.offset > st.size`（size 严格回退）重置 cursor。文件被截断到 0 再重写、且重写后 size 大于旧 offset（或等长原位重写）时，poll 合并窗口内最终 size 可能 ≥ offset，增量仍从旧 offset 续读，存在错位风险。此为 spec 范围「size 回退（重写）时」所限定启发式的固有边界（size 无法区分「追加」与「等长/更大重写」），实现与 spec/brief 定义一致，不判 finding；如需更稳可后续引入内容签名或换行偏移标记。
  - AC-001 单测未直接断言降级 poll 的 mtime 定时器后续能投递变化（仅断言 error 后 close + 即时 on_change + stop 不抛）；该投递路径与 `create_watcher` poll 分支同构，已由 subscription-service 真实轮询用例覆盖，属可再加 case 而非缺口。
- 总体判断：三条 AC 全部实现且与 spec 契约、review 重点背景逐一吻合，无偏航；实现正确性（error 降级 close+fallback+stop 双向清理、size 回退重置判定、cookie 错误包装落外层 catch reject）、测试可信（三条 AC 测试均真区分：AC-002 用例旧 offset 75 > 新 size 41 触发重置，无重置时增量自 offset 75 读空串故必失败；AC-001 无降级则 error 不再触发 on_change/close；AC-003 无包装则 reject 消息为裸 vault 错误而非「登录成功但保存失败」）均已核实。tsc / eslint（--max-warnings=0）/ vitest 全量 3109 passed | 9 skipped 通过。唯一 minor 级观察为 spec 启发式固有边界，不阻断。verdict PASS。
- 系统性 follow-up：无

verdict: PASS
