# Task review t117（reviewer_focus: 测试）

- task：`t117_split_collector_serde`
- spec：`docs\tasks\t117_split_collector_serde\spec.md`
- diff_anchor：`be9dbb3447dd211b95969533da1b0c645721c9e4`
- target：`git diff be9dbb3447dd211b95969533da1b0c645721c9e4`
- round：1
- reviewed_at：2026-07-26 00:35 UTC+8

## Findings

无。

## 证据与扫描记录

### 测试改动范围

`git diff be9dbb3447dd211b95969533da1b0c645721c9e4 -- tests/` 为空。本 task 未改任何测试代码，属纯重构 task，spec 第 17 行明确「不改测试断言」。

### 回归网验证

- `tests/unit/main/core/token-stats/collector-state.test.ts`（7 用例，t114 既有）通过 collector 公开导出 `serialize_state` / `save_state` / `load_state`（`collector.ts:102`/`111`/`121`）间接覆盖 scan-state.ts 全部行为。
- collector wrapper 仅做参数打包与 `forward_log` 回调注入，无逻辑分叉、无参数变换、无防御性 copy，传参顺序与 scan-state.ts `ScanStateMaps` 字段一致（`scan-state.ts:18-23`）。
- 既有 7 用例覆盖 AC4 全部分项：
    - round-trip（`collector-state.test.ts:143` 「save then load round-trips full scan state」）
    - 损坏文件回退清空（`:185`）
    - 缺失文件静默回退（`:197`）
    - 空 path no-op（`:206`）
    - records 删除 / daily Map 还原（`:114`/`:143`）
    - float mtime 严格相等（`:132`）
    - 增量恢复传给 reader（`:213`）

### 危险模式扫描（逐条）

| 模式                                         | 命中 | 说明                                                                                                             |
| -------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| 恒真断言                                     | 否   | —                                                                                                                |
| 删除/反转 expect                             | 否   | —                                                                                                                |
| 注释掉断言                                   | 否   | —                                                                                                                |
| 弱化断言                                     | 否   | 既有 `toBe` / `toEqual` / `instanceof` 全保留                                                                    |
| 删测试                                       | 否   | —                                                                                                                |
| `.skip` / `.only`                            | 否   | —                                                                                                                |
| 静默错误（eslint-disable / @ts-ignore 新增） | 否   | 测试文件顶部 eslint-disable 为 t114 既有，非本 task 引入                                                         |
| mock 误用                                    | 否   | mock 仅作用于 reader 系统边界（claude-reader/opencode-reader/kimi-reader），未 mock collector 或 scan-state 自身 |
| 阈值掩盖                                     | 否   | —                                                                                                                |
| 条件跳过断言                                 | 否   | —                                                                                                                |
| 程序赋值替代交互                             | 否   | 非交互型测试                                                                                                     |
| 存在即通过                                   | 否   | —                                                                                                                |

### AC 覆盖

- AC1（行数 < 400）：实现轴，非本 reviewer 职责。
- AC2（pnpm test 全绿，7 用例不回归）：本 task 未改测试；wrapper 透传，既有 7 用例等价覆盖。
- AC3（typecheck）：实现轴。
- AC4（serde 行为不变）：7 用例覆盖 round-trip / 损坏 / 缺失 / 空 path / records+daily / float mtime / 增量恢复，全部 AC 子项有测试。

### 测试可信

- 测的是 AC 不是 mock：用例通过 collector 公开导出 + 真实文件系统（`fs.writeFileSync` / `fs.existsSync` / tmp 文件）验证 serde 行为，不 mock 被测逻辑。
- 断言用户可观察：round-trip 用例断言 `jsonl_states.get(...)` 重组后内容；损坏用例断言所有 map `.size === 0`；增量恢复用例断言 reader 收到恢复的 mtime —— 均为存储效果级观察点。
- 异步时序：`save_state` / `load_state` 均 `await`，无漏 await；无 timeout 掩盖。
- mock 边界：仅在 reader 系统边界 mock，合规。

## 范围外建议（不进 finding 表）

`scan-state.ts` 现作为独立公开模块导出 `serialize_state` / `save_state` / `load_state` / `deserialize_bucket` 及 3 个类型，目前无直接单测，全部覆盖经 collector wrapper 间接达成。当前 wrapper 透传无分叉，间接覆盖等价；若后续 wrapper 引入参数变换、或 scan-state.ts 脱离 collector 被其他调用方直接使用，建议补 `tests/unit/main/core/token-stats/scan-state.test.ts` 直接单测。属未来工作，非本 task 范围。

## 结论

- 本轮新发现：0 条
- 总体判断：纯文件抽取重构，测试代码零改动；既有 7 用例通过 collector 公开 wrapper 透明且等价地覆盖 scan-state.ts 全部 serde 行为，无危险模式命中，AC4 行为不变性验证充分。

verdict: PASS
