# Task review t166（reviewer_focus: 测试）

- task：`t166_collector_records_incremental`
- spec：`docs\tasks\t166_collector_records_incremental/spec.md`
- diff_anchor：`d1ef4847473baf4c3019812281c69f639fbba4ab`
- target：`git diff d1ef4847473baf4c3019812281c69f639fbba4ab`
- round：1
- reviewed_at：2026-07-30 00:15 UTC+8

## Findings

无 finding。

## 审查明细

### 测试可信

- **测试1**（`update_config skips postMessage when config is unchanged (D debounce)`，manager.test.ts:203-215）：
    - 用 `calls_before = last_child!.postMessage.mock.calls.length` 固定基线，再断言 `toBe(calls_before)`。调用数对比，非仅"最后一次"断言。能捕获 update_config 错误触发 postMessage 的 bug。
    - 基线用变量而非硬编码 1，不依赖 start 内部调用次数，稳健。
- **测试2**（`update_config posts when only a nested tokenStats field changes`，manager.test.ts:217-229）：
    - 改 `wsl_distro` 单字段，断言 `toHaveBeenLastCalledWith` 精确匹配新 config 对象。若 update_config 错误跳过（bug），postMessage 无调用，断言失败。能捕获"错误去抖"。
- mock 边界：仅 mock electron `utilityProcess`（系统边界）与 `TokenStatsStore`（依赖注入），未 mock 被测的 `create_token_stats_manager` 自身。合法。
- 异步时序：无 race；postMessage 为同步 mock，无漏 await。

### 覆盖

- **AC 覆盖**：
    - `config 保存（tokenStats 未变）不触发 collector collect()` — 测试1 验证 postMessage 不发送。postMessage 是触发 collector `configure()->collect()` 的唯一通道，等效验证。
    - `单测覆盖 config 去抖` — 测试1（相同跳过）+ 测试2（变化触发）双向覆盖。
- **范围收缩**：放大器 C（records 增量）遗留，task.md 过程记录与收尾报告均已说明理由（t162/t163/t164/t165 已解决查询/渲染端内存问题，C 属写入端优化，协议变更风险高于剩余收益）。spec 对应 AC 未勾选合理，非测试缺失。
- **边界**：
    - 首次 update（无前值）：正常使用中 `start()` 总先调用并设置 `current_config`，`update_config` 不会在 `current_config` 为 null 时被调用。现有 `start forks the collector and posts config` 测试覆盖首次 postMessage。非 t166 D 去抖范围。
    - stop 后 update：`stop()` kill child，`update_config` 的 `if (child)` 守卫使 postMessage 不执行。非 AC 要求，次要场景，不构成 finding。

### 危险模式扫描

逐条扫描，均未命中：

- 恒真断言：无。`toBe(calls_before)` 与 `toHaveBeenLastCalledWith` 均精确断言。
- 删除/反转 expect：无。
- 注释掉断言：无。
- 弱化断言：无。`toBe` / `toHaveBeenLastCalledWith` 为最严格断言。
- 删测试：无。仅新增。
- `.skip` / `.only`：无。
- 静默错误：文件顶部 `eslint-disable @typescript-eslint/no-non-null-assertion` 为预先存在（非本次 diff 新增），且非用于掩盖测试错误。
- mock 误用：无（见上"测试可信"）。
- 阈值掩盖：无 timeout/重试/容差增大。
- 条件跳过弱化断言：无。
- 程序赋值替代真实交互：不适用（非 UI 测试）。
- 存在即通过：无。

### 红灯归因

本次为新增测试（TDD 绿），无改测试场景，不适用。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：测试1 用调用数对比正确验证去抖（非仅断言最后一次），测试2 用精确对象匹配验证单字段变化触发 postMessage，双向覆盖 D 去抖 AC；无危险模式，断言精确无恒真；范围收缩（C 遗留）记录完整。

verdict: PASS
