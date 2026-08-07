# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p072（用户提出；登记原文「会话面板左上角不显示完整软件名」表述有误，2026-08-07 用户澄清：指会话**元信息**中的软件名，即 kimi code / claude code 这类 source 文字）。2026-08-07 核实现状：工作台会话面板头部元信息行（`SessionPane.tsx:122-126`）依次显示 source 文字、model、cwd 完整路径、轮次、tokens、`format_date(openedAt)`；标题字号大于元信息；软件 icon（VendorMark徽标）已存在于徽标位。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 会话面板（工作台 SessionPane）头部元信息不再显示完整软件名文字（source 字符串），软件识别由已有 icon 徽标承担。
- 元信息中的会话目录只显示最后一级目录名（如 `/home/testuser/testuser_ubuntu/example_media` 显示为 `example_media`）。
- 字号层级互换：会话标题改为小字号，元信息改为大字号。
- 元信息组成为：模型、目录、轮次、token、日期；其中日期显示**最后一条消息的精确时间**，包含年-月-日 时:分:秒。

### 非范围

- 不动左上角品牌区与右上角控制区。
- 不动侧边栏（SessionRail）行内展示与会话库（SessionLibrary）——其展示调整属另一 task。
- 不改变元信息的数据采集口径（轮次、token 含义不变）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：会话面板元信息行中不出现完整软件名文字（如 `claude_code` / `kimi_code` 字样），软件 icon 徽标保持显示。
- [ ] AC2：元信息中的目录只显示最后一级目录名，悬浮提示（title）保留完整路径。
- [ ] AC3：会话标题的字号小于元信息字号（层级与现状相反）。
- [ ] AC4：元信息依次呈现模型、目录、轮次、token、日期五项；日期为最后一条消息的精确时间，格式含日期与时分秒。
- [ ] AC5：现有测试与 e2e 全部通过，无回归。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试（组件测试断言元信息文案与格式；字号层级断言对应 CSS class；日期精度断言格式化输出）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 组件级：构造 SlotSession fixture，断言元信息不含 source 文字、目录取末级、日期格式精确到秒、五项齐全。
- 目录末级提取与日期格式化抽纯函数单测（含 Windows 反斜杠路径、尾随斜杠边界）。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 「最后一条消息的精确时间」的数据来源：`UNVERIFIED-SPIKE`，执行期 Step 1 核实现有 session meta（SlotSession / token-stats sessions 查询）是否携带最后活动时间戳；若无，需扩展后端查询字段（改动面随之扩大到 store/IPC，在实施笔记记录）。

### 风险与回退

- 风险：「最后一条消息时间」若现有数据链路没有，需穿透 store 层补字段，工作量扩大；目录末级显示在根目录/无目录会话下的兜底。
- 回退：单 commit revert。

### 依赖与约束

- 与 backlog task「会话侧边栏与会话库展示调整」同改会话工作区组件与样式，属 conflicts 关系，不得同批实施。
- 与 t253（标题栏品牌）无文件区域重叠：本 task 改 pane 头部元信息行，t253 改面板标题栏。

### Finalization 时更新的 blueprint

- 无
