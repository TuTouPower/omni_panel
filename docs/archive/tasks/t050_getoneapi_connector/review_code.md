# Task review t050（reviewer_focus: 代码）

- task：`t050_getoneapi_connector`
- spec：`docs\tasks\t050_getoneapi_connector\spec.md`
- diff_anchor：`0b59436dff65242ad6d4772960e38c8470e4c24f`
- target：`git diff 0b59436dff65242ad6d4772960e38c8470e4c24f`（工作区 vs anchor，含 untracked）
- round：1
- reviewed_at：2026-07-23 16:04 UTC+8

## 改动盘点

- `connectors/getoneapi/manifest.json`（新建）：provider `getoneapi`，POST `/back/user/balance`，参数 `API_KEY`(secret) + `LIMIT`(number, required=false)。
- `connectors/getoneapi/connector.ts`（新建）：`data.balance -> used`、`LIMIT -> limit`，余额反向 status（`<=0.1 critical / <=0.2 warning`），LIMIT 缺失/≤0 → null+unknown。
- `src/shared/schemas/plugin-output.ts:14`：`usageProviderSchema` 新增 `"getoneapi"`。
- `src/renderer/lib/provider-usage.ts:66,83`：`PROVIDER_ORDER`/`PROVIDER_LABELS` 新增 getoneapi。
- `src/renderer/lib/common-services.ts:10`：`ADD_COMMON_SERVICES` 新增 getoneapi。
- `tests/unit/renderer/common_services.test.ts:13`：provider 顺序断言同步更新。
- `docs/tasks_index.json`：`scripts/task.py start t050` 重写格式（4 空格 → 2 空格），是脚本副作用而非 implementer 手改，不在本 task 范围内判定。

实测响应：`{"code":200,"message":"success","data":{"balance":1.88}}`，与 spec 第 32 行「实测确认字段」要求一致，`data.balance` 字段已落实。

## 范围内评审

### AC 覆盖

| AC                                                        | 实现位置                                                | 结论                                                       |
| --------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| manifest 注册，参数标签齐全                               | `manifest.json:1-35`                                    | 满足（含中英 label）                                       |
| API_KEY 返回余额 observation（used=balance, limit=LIMIT） | `connector.ts:33-92`                                    | 满足                                                       |
| status 余额反向（0.01 critical / 充足 normal）            | `connector.ts:26-31,85`                                 | 满足                                                       |
| `code != 200` throw；`data 缺关键字段` throw              | `connector.ts:57-67`                                    | code 路径满足；**data 缺 balance 字段未 throw**（见 f001） |
| 契约测试覆盖正常 / 错误码                                 | tests/integration/connector/getoneapi_connector.test.ts | 测试轴，不评                                               |

### 不变量 / 技术决策

- `display_style="ratio"`、`window="total"`、`cycleDurationMs=null`、`reset_at=null`：与 spec 第 12 行一致。
- `status_for_balance` 阈值与 deepseek 同语义（spec 第 13 行）：`connector.ts:26-31` 与 deepseek `connector.ts:29-35` 阈值口径一致。getoneapi 版本去掉了 deepseek 的 `if (limit <= 0) return "normal"` 哨兵，但调用点 `connector.ts:85` 已用 `limit_num > 0` 短路保护，函数内不会除零，行为等价。
- LIMIT 缺失/≤0 → null+unknown：`connector.ts:37-38,85`，与 spec 第 12 行一致（与 spec 第 10 行「默认 100」矛盾，见 f002）。

### 代码质量

- **DRY**：`is_record / to_number / round2 / parse_limit` 与 exa/claude/cpa 等 connector 内 verbatim 重复。runtime.ts:36-38 在编译期把 `import type` 与 `declare const` strip 后单文件执行，**跨 connector 共享 helper 需改 runtime 架构**，属不可拆硬约束（见「文件过大标准」排除条款），不出 finding。
- **错误处理**：`main` 内 throw 由 runtime 捕获并经 `result.error` 透传（见集成测试 `connector.ts:130-154` 的 4 个错误用例）。无 swallowed error / 空 catch。
- **边界**：`parse_limit` 对 `""`/`undefined`/负数/NaN 都归 0；`to_number` 对 NaN 归 0；`round2` 不会对有限数产出 NaN。OK。
- **控制流**：`main()` 分支约 6（api_key 空 / http 调用 / is_record(response) / code!=200 / is_record(data) / status 三元 + 返回），CC 远 < 10，无需拆。
- **文件膨胀**：`connector.ts` 95 行、`manifest.json` 35 行，均未达阈。
- **死代码**：无。

### 实现正确性

- `status_for_balance(balance, limit_num)` 仅在 `limit_num > 0` 分支调用，不会除零。
- 负余额：`to_number(-5)=-5` → `round2(-5)=-5` → ratio `<0` → `critical`，语义合理。
- 非数字 code 的错误消息降级（见 f003）。

## Findings

### t050_code_f001 - data 缺 balance 字段未 throw，违反 AC

- 严重度：important
- 位置：`connectors/getoneapi/connector.ts:69`
- 问题：spec AC 第 27 行要求「`data` 缺关键字段 throw（不静默空数组）」。当前 `to_number(data["balance"])` 对 `undefined` 返回 `0`（helper `connector.ts:10-13`），`data:{}` / `data:{}` 无 `balance` 字段时不 throw，而是生成 `used:0` observation，status 落到 `critical`（limit>0 时）。这把协议异常伪装成「余额为 0」展示给用户，违反 spec AC。spec 第 32 行明确「文档示例 `data:{}` 空结构不可直接断言字段名」，已隐含 data 形态异常应当显式失败。
- 场景：API 返回 `{code:200, message:"ok", data:{}}`（文档示例形态）或 `{code:200, data:{other_field:1}}`（字段漂移）→ observation `used=0, status=critical`，用户看到「余额 0 元」虚假告警，真正错误被吞。
- 建议：在 `connector.ts:69` 前显式校验，如
    ```ts
    if (typeof data["balance"] !== "number" || !Number.isFinite(data["balance"])) {
        throw new Error("GetOneAPI 返回格式异常: 缺少 data.balance");
    }
    const balance = round2(data["balance"]);
    ```
    （spec AC 已要求 throw，集成测试也应补 `data:{}` 用例 —— 但后者属 test reviewer 范围。）

### t050_code_f002 - manifest LIMIT 缺 default 声明，与同族惯例及 spec 第 10 行不一致

- 严重度：minor
- 位置：`connectors/getoneapi/manifest.json:14-21`
- 问题：`deepseek/manifest.json:18` 和 `mimo/manifest.json:18` 的 `LIMIT` 参数都带 `"default": "100"`，getoneapi 没有。spec 第 10 行亦写「`LIMIT`（number，CNY 上限，默认 100）」。spec 第 12 行又写「LIMIT 缺失/≤0 → unknown+null」，两条自我矛盾；implementer 在 connector 层选了第 12 行，但 manifest 侧未补 default，UI 添加账号时无默认值提示。runtime 不把 `default` 自动注入 `ctx.params`（已查 `src/main/core/connector/`），故 connector 内的 null+unknown 路径仍可达，二者并不互斥。
- 建议：与 deepseek/mimo 对齐补 `"default": "100"`（仅 UI 提示用途）；或在 adoption 阶段订正 spec 第 10 行删去「默认 100」。

### t050_code_f003 - 非数字 code 时错误消息丢弃原始值

- 严重度：minor
- 位置：`connectors/getoneapi/connector.ts:60`
- 问题：`const code_str = typeof code === "number" ? String(code) : "unknown";` —— code 非数字（含字符串、对象、undefined）时 fallback 为 `"unknown"`，原始值未进入错误消息。实测协议 code 恒为数字，理论不会命中，但若上游网关回包异常（如字符串 `"401"`），排障信息被吞。
- 建议：`const code_str = code === undefined ? "unknown" : String(code);` 保留任意原始值。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：3 条（f001 important，f002/f003 minor）。
- 总体判断：核心数据流与 status 映射正确，spec 大部分 AC 满足；但 `data.balance` 缺失时静默 0 违反 spec AC 「data 缺关键字段 throw」，需在 important 级修复。另两条 minor 关乎 UI/排障体验，可在 adoption 阶段一并处置。

verdict: FAIL

## Round 2 (2026-07-23 16:35 UTC+8)

### 前轮 finding 复核

- **t050_code_f001（important）已修**：`connector.ts:68-70` 新增 `if (!("balance" in data")) throw new Error("GetOneAPI 返回格式异常: 缺少 data.balance")`。spec AC 第 27 行已同步补「data.balance 键缺失 throw」。集成测试 `getoneapi_connector.test.ts:142-146` 补 `data:{}` 用例。修复彻底。
- **t050_code_f002（minor）裁决撤回**：Round 1 建议 manifest 补 `"default": "100"`。implementer 与 adoption 判定不采纳 -- spec 第 10 行「默认 100」已被本轮 spec 修订删除，AC 第 26 行明确「LIMIT 缺失/≤0/非数 -> unknown+null（不设 default，同 exa t049）」。设 default 会破坏 unknown 逻辑链。撤回成立。
- **t050_code_f003（minor）已修**：`connector.ts:60` 改为 `typeof code === "number" ? String(code) : JSON.stringify(code)`，非数 code 保留原始值进入错误消息。修复彻底。

### 本轮新发现扫描

复核 `git diff 0b59436..工作区` 全量改动：

- `connector.ts`：新增的 `"balance" in data` 校验仅判键存在，未限制类型。若 `data.balance` 为字符串（如 `"1.88"`），`to_number` 会经 `Number("1.88")` 正常转换；若为 `null`/对象/数组，`to_number` fallback 0。但 spec 第 32 行「文档示例 `data:{}` 不可直接断言字段名」+ AC「data.balance 键缺失 throw」语义已覆盖「键缺失」而非「类型校验」，且实测响应 balance 恒为 number。此为可选加固，不构成 finding。
- spec 修订：AC 第 26-28 行补齐 LIMIT 异常、data.balance 缺失、契约测试覆盖等条款，与实现一致。
- task.md：`diff_anchor` / `branch` front matter 填实，实测记录已写。
- 其余文件（`plugin-output.ts` / `provider-usage.ts` / `common-services.ts` / 两个测试文件）：Round 1 已评，无回归。

本轮新发现：0 条。

### 结论

- 前轮 finding：f001 已修，f002 撤回，f003 已修。
- 本轮新发现：0 条。
- 总体判断：R1 三条 finding 处置完毕（2 修 1 撤回），修复过程未引入新问题。

verdict: PASS
