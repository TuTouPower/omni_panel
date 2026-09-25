# Task review t517（reviewer_focus: 测试）

- task：`t517_local_api_web_panel_hardening`
- spec：`docs/tasks/t517_local_api_web_panel_hardening/spec.md`
- diff_anchor：`02cdb642c5c5814a3a21593617ffc67573d8d952`
- target：`git -C '/Users/karson/kar/code/omni_panel_t517' diff 02cdb642c5c5814a3a21593617ffc67573d8d952`
- round：1
- reviewed_at：2026-09-25 18:25 UTC+8

reviewed_scope: b1659898056b569a

## Findings

Round 1 零 finding。

## 审计与总结

- 测试设计审查：
  - `tests/unit/main/effective_proxy.test.ts`：新增 AC-001 用例，覆盖非法协议（`ftp:`, `ws:`, `javascript:`）与畸变 URL 的拒绝逻辑；
  - `tests/unit/network/proxy-pool.test.ts`：新增 AC-003 用例，针对含不同形式账号密码的代理 URL 验证遮罩为 `***` 且明文凭据绝不泄露；
  - `tests/unit/local-api/server.test.ts`：新增 AC-002 用例，针对包含 `__proto__`、`constructor`、`prototype` 等攻击载荷的 JSON 字符串验证解析后不污染 `Object.prototype`；
  - `tests/integration/local-api/server.test.ts`：新增 AC-006 用例验证 `/v1/trend/bulk` 聚合多个 query 响应结果及格式校验，新增用例验证 Web 静态 HTML 响应头返回收紧的 `connect-src 'self'` CSP；
  - `tests/unit/web/usageboard-web.test.ts`：新增 AC-004、AC-005、AC-006 及 A64、A97 用例，覆盖 15s 网络超时触发、后台标签页暂停轮询与前台恢复、批量趋势端点请求、真实注销接口调用以及查询参数转换。
- 测试真实性核查：
  - 测试直接触达生产逻辑，无 mock 替代核心生产链路；
  - 未就地修改旧测试语义（旧有 70+ 个 Web 测试均在保持原生断言语义前提下稳定通过）。
- 测试运行结果：全套测试 331 files passed（4059 passed, 8 skipped），0 failures。

### AC 复验方式

- AC-001：`verified`，查证 `tests/unit/main/effective_proxy.test.ts:36-47`，执行 vitest 通过。
- AC-002：`verified`，查证 `tests/unit/local-api/server.test.ts:9-29`，执行 vitest 通过。
- AC-003：`verified`，查证 `tests/unit/network/proxy-pool.test.ts:34-43`，执行 vitest 通过。
- AC-004：`verified`，查证 `tests/unit/web/usageboard-web.test.ts:825-842`，执行 vitest 通过。
- AC-005：`verified`，查证 `tests/unit/web/usageboard-web.test.ts:844-874`，执行 vitest 通过。
- AC-006：`verified`，查证 `tests/integration/local-api/server.test.ts:2092-2144` 与 `tests/unit/web/usageboard-web.test.ts:807-823`，执行 vitest 通过。

coverage = 6 / 6 (100%)

verdict: PASS
