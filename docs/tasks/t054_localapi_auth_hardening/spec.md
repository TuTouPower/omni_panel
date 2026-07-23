# Task spec

## 背景

review_20260723_opus C1（已主审验证）：`src/main/core/local-api/server.ts` 绑 `0.0.0.0`，且 `/v1/secrets` GET、`/v1/config` POST、`/v1/secrets` POST、`/v1/connectors/*/refresh` POST 全部落在 `check_auth`（`:255`）之前（路由顺序见 `:235-255`）。同局域网任意主机可读明文密钥、篡改配置、注入密钥、触发刷新。

该问题与 `docs/specs/web-panel.md` §2 既有决策「局域网使用，不考虑安全」冲突——该决策写于 web panel 上线时，但 review 指出当前暴露面（写端点 + 明文 secrets 读）已远超「只读 panel」初衷。需用户重新决策方向后再实现，不得擅自推翻既定决策。

## 范围

- 评估 + 方案对比（不直接改代码，先出方案交用户决策）：
    1. **绑定收紧**：默认 `127.0.0.1`，跨机访问改显式 opt-in（配置项）。
    2. **端点分级**：把 `handle_web_config`（含 secrets/config 读写）、`handle_web_connector`（refresh 写）移到 `check_auth` 之后；`/v1/secrets` GET 即便 auth 后也额外限制（loopback-only 或独立高权 token）。
    3. **token 分级**：拆「读 panel UI」与「读 secrets/写配置」两个 token 等级。
    4. **保持现状**：接受 LAN 开放（若用户确认家庭/办公 LAN 可信）。
- 出书面评估（影响面、各方案利弊、与 web-panel.md §2 的取舍），交用户选择。
- 按用户决策实现 + 测试。

## 非范围

- 不重写整个 local-api auth 体系（仅按决策做最小收紧）。
- 不擅自改 web-panel.md §2 决策（需用户显式同意）。
- 不在本 task 内顺带改 IPC route 分权（I14，另立）。

## 验收标准

- [ ] web-panel.md §2 补风险接受说明：明示 secrets/config 明文读写、refresh 免 auth、0.0.0.0 绑定的风险面（同 LAN 任意主机可读明文密钥/篡改配置/注入密钥/触发刷新），记录用户知情接受。
- [ ] web-panel.md §8 更新：记录 review_20260723_opus C1 评估结论（4 方案对比）与决策 A。
- [ ] 无代码改动（决策 A = 保持现状）。
- [ ] task.md 过程记录含 4 方案对比与用户决策。

## 依赖与约束

- **前置依赖用户决策**：保持 LAN 开放 vs 收紧（127.0.0.1 + opt-in）vs 端点分级 token。决策前不写实现代码。
- 若用户选择「保持现状」，本 task 收尾为「评估完成 + 决策记录」，并在 web-panel.md §2 补记风险接受说明。
- 与 I14（CONFIG_GET_SECRETS route 校验）联动，但分 task。
