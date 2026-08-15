# Task review t390（reviewer_focus: 代码）

- task：`t390_config_double_fail_rollback`
- spec：`docs/tasks/t390_config_double_fail_rollback/spec.md`
- diff_anchor：`77ad6a5e74b390e9dda94689f09730e08284e90f`
- target：`git diff 77ad6a5e74b390e9dda94689f09730e08284e90f`
- round：1
- reviewed_at：2026-08-15 08:35 UTC+8

## 审查依据

- 实测：`vitest run tests/unit/renderer/hooks/use_config.test.ts` 9 用例全绿（含 t356 AC-002 单失败两条、t390 AC-001/AC-003 双失败两条）；`tsc --noEmit` exit 0。
- 手工推演：串行 `save_queue_ref` 下 A/B 双失败、A 败 B 成、A 成 B 败、reload/duplicate/广播后失败四类时序。

## Findings

### t390_code_f001 - confirmed_ref 未随外部刷新路径同步，回滚目标可能为过期值（reintroduce 漂移）

- 严重度：important
- 锚点：spec「范围」定义的确认值 =「最近一次已成功写入的值」；外部广播 / reload / duplicate 到达的 config 都是已成功写入磁盘的确认值，却未写入 confirmed_ref，违反该定义。
- 位置：`src/renderer/hooks/use-config.ts:69-82`（onConfigChange 广播）、`:173-180`（reload）、`:158-171`（duplicate）
- 问题：新增的 `confirmed_ref` 只在加载成功（:45）、save 成功（:92）、update_config 成功（:122）三点更新。三条「从权威源刷新 config_ref」的路径——外部窗口广播（onConfigChange）、手动重拉（reload）、duplicate 后重读——只更新 `config_ref`/`setConfig`，不更新 `confirmed_ref`。可复现时序（跨窗口场景，popup 切换 provider 即真实用例，见 `theme.ts:101` 等多窗口订阅）：

  1. 本窗口 W 加载 base，confirmed_ref=base。
  2. popup 窗口成功写盘 external，广播到 W：config_ref=external、setConfig(external)，confirmed_ref 仍为 base。
  3. W 内用户修改后 save(newX) 写盘失败。
  4. catch 回滚：`config_ref.current = confirmed_ref.current` → 回滚到 base，setConfig(base)。

  终态：W 内存=base，磁盘=external——正是 t390 要消除的「内存与磁盘漂移」，经广播路径重新引入；且用户若随后再保存成功，会把过期值写回磁盘，覆盖 external 变更。**对比修复前**：旧实现回滚目标是 `previous = 本次 save 调用时 config_ref.current`（已含广播值 external），该路径回滚是正确的；t390 改动在此路径上是回归。reload/duplicate 同为「读磁盘最新态」路径，同一缺陷：reload 后失败回滚到 pre-reload 确认值。
- 建议：在这三条路径同步 `confirmed_ref.current`：广播 handler 在 `config_ref.current = incoming` 后追加 `confirmed_ref.current = incoming`（广播即磁盘已写入的确认态，echo 已由引用/深比较去重，不会误更新）；reload 与 duplicate 在 `config_ref.current = result.config` 后同样追加 `confirmed_ref.current = result.config`。新增用例：外部广播后 save 失败，断言终态==外部广播值（而非 base）。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：1 条（t390_code_f001，important）。
- 未进表的提示：
  - 文件过大：use-config.ts 195 行、use_config.test.ts 275 行，均远低于阈值。
  - 复杂度：save/update_config/onConfigChange 各函数分支简单，无 ≥10。
  - 范围观察：加载失败路径下 confirmed_ref 与 config_ref 同为 null，save 失败回滚 null 与修复前（previous 亦为 null）行为等价，非本 task 回归，不单独出 finding。
  - 范围外：diff 仅触及 use-config.ts 与其测试、task.md，无无关文件改动；未实现 spec 非范围内的 config-debounce（t391）。
- 总体判断：AC-001/002/003 与 spec 契约区对齐，串行队列双失败语义正确，既有 t356 单失败用例保持绿，测试可判别回归；但 confirmed_ref 生命周期未闭合在外部刷新路径（广播/reload/duplicate），回滚机制可在真实跨窗口时序下回滚到过期值并 reintroduce 内存/磁盘漂移（且为 t390 引入的回归），故判定 FAIL。
- 系统性 follow-up：建议标题「confirmed_ref 随 config_ref 外部刷新路径（onConfigChange/reload/duplicate）同步」，slug `config_confirmed_ref_sync`；亦可并入 t390 修复轮。

## Round 2 复核（2026-08-15 08:40 UTC+8）

- diff：相对原 anchor `77ad6a5e74b390e9dda94689f09730e08284e90f` 复核最新工作区；`use-config.ts` +52/-，测试 +96。
- 实测：`vitest run tests/unit/renderer/hooks/use_config.test.ts` 11 用例全绿（Round 1 9 条 + f001/f002 2 条新增）。

### 前轮 finding 复核

- **t390_code_f001（important）已消除**：
  - 修复落地三处 confirmed_ref 同步：onConfigChange 广播 `src/renderer/hooks/use-config.ts:80-81`（`confirmed_ref.current = incoming`）、reload `:181`、duplicate `:171`。
  - 新增测试 `use_config.test.ts` "t390 f001: 外部广播后 save 失败回滚到广播值（非过期 base）"：广播 external_config → save(attempted) 失败 → 断言终态==external_config。与原 finding 复现时序逐行一致。
  - 额外补充 "t390 f002: 成功 save 后失败回滚到最近成功值（confirmed 推进）"：save A 成功（confirmed_ref=A）→ save B 失败 → 断言终态==A 而非 base。覆盖 AC-001「最近确认值」在非 base 时的推进语义，补强保障。
- **修复过程引入的新问题扫描**：
  - 广播 handler 更新 confirmed_ref 与 echo 去重（引用/深值比较）互不冲突：echo 因相等提前 return，不会误写 confirmed_ref；仅外部真实变更才同步。✓
  - 广播到达后，队列中 pending 乐观值 X 失败：回滚守卫 `config_ref.current === X` 为 false（config_ref 已被广播覆盖为 incoming），跳过回滚，不破坏广播值。✓
  - 广播后本地 save 成功：then 链 `confirmed_ref = newConfig` 覆盖 incoming，写盘成功后磁盘即 newConfig，语义正确。✓
  - reload/duplicate 均从磁盘权威源读取后同步，无待写 pending 覆盖问题（二者本就整体替换 config_ref）。✓
  - 原 AC-001/002/003 双失败/单失败用例保持绿，串行队列语义未变。✓

### Round 2 结论

- 前轮 finding 复核：t390_code_f001 已消除（三处同步 + 专项测试，与原复现时序一致）。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：f001 修复完整、测试可判别回归、无新引入问题，AC-001/002/003 与 spec 契约区一致。

verdict: PASS

reviewed_scope: 0d2fcbeac3df2bfa
