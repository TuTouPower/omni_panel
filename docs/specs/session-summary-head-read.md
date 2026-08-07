# 会话摘要限量头部读取

## 背景

会话面板/会话库首屏摘要链路「轻量」实为整文件读：`extract_*_first_user` 第一行就 `readFileSync` 读整个文件再只解析前部。claude 单会话文件可达数十 MB，首屏 50 会话各读一遍全文件，WSL UNC 放大延迟。改为限量头部读取。

## 范围

- 各来源（claude_code / grok / kimi_code）的「首条用户消息」摘要提取改为限量头部读取：单文件读取字节数有明确上限（64KB），与文件总大小解耦。
- 头部窗口内未找到用户消息时回退为空摘要，不抛错、不阻塞其他会话摘要。
- opencode 为 DB 读取，不受影响。

## 非范围

- 不改变摘要的展示位置、样式与刷新时机。
- 不改变单会话消息列表的加载方式（整量提取 + 分页维持现状）。
- 不动会话文件定位逻辑（另一 task t254 处理）。

## 验收标准

- [x] AC1：各来源会话的摘要（首条用户消息）显示内容与现状一致。
- [x] AC2：生成单个会话摘要时读取的字节数不超过明确上限，与文件总大小解耦。
- [x] AC3：头部窗口内找不到用户消息的文件按定义行为处理（回退或空摘要），不抛错、不阻塞其他会话摘要。
- [x] AC4：现有测试与 e2e 全部通过，无回归。

## 实现要点

- `src/main/core/session-history/head-read.ts`：`read_head` 限量读前 64KB（`SUMMARY_HEAD_BYTES`），单次 readSync READ_CAP（64KB+4KB）；StringDecoder 丢弃多字节截断残缺尾字节防 U+FFFD；窗口末行补全到下一个换行（防残缺 JSON 行漏首条 user）。
- 三个文件 extractor（claude/grok/kimi）的 first_user 用 `read_head` 替代整文件 `readFileSync`；行解析逻辑与 `max_lines` 签名保持。
- 固有边界（接受取舍）：单条 JSONL 行超过 READ_CAP 无法完整读入，该会话摘要回退为空。真实首条 user 行远小于此（spike s020 采样 100% 在 64KB 内）。
- 头部窗口取 64KB：spike s020 对本机真实 claude 会话采样（win 2000 文件，首条 user 在 64KB 内 100%）。

## 测试覆盖

- `tests/unit/main/core/session-history/head-read.test.ts`：AC1 顶部 user 返回文本、AC2 大文件 readSync 字节 ≤READ_CAP 且未整文件读（readFileSync spy）、AC3 窗口内无 user 空串、user 窗口外裁剪、跨窗口行补全、多字节边界无 U+FFFD、损坏行、缺失文件、grok/kimi 复用。
- `tests/unit/main/core/session-history/claude-code-extractor.test.ts` 等既有 extractor 测试回归未动。
- `pnpm test` 全量 + `pnpm test:e2e:electron` + `pnpm test:packaged`。
