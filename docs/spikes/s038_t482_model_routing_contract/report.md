# Spike report

## 问题

验证 t482 的 New API 适配边界是否能在不读取真实 token、不访问真实服务的条件下固定：分页响应、只读渠道字段、写入 payload 以及带 `reasoning_content` 的自检回复名提取。

## 成功判据

- 受控本地 HTTP 服务能按 `p` 返回 `data.items` 分页并被完整读取。
- `status` / `group` 可作为读取字段，PUT payload 不携带只读 `status`。
- 普通 `model` 和嵌套 `reasoning_content.model` 均能解析出模型名。

## 尝试

- 运行 [`code/experiment.mjs`](code/experiment.mjs)，启动 Node `http` 本地服务，模拟两页渠道、空页终止和 PUT 写入。
- 使用不含凭证的 fixture 覆盖普通自检回复与 `reasoning_content` 嵌套回复。

## 证据

- 实验输出：`PASS: paginated data.items, status/group read fields, status-free PUT, and reasoning model extraction`。
- 运行命令：`node docs/spikes/s038_t482_model_routing_contract/code/experiment.mjs`。
- 该证据只固定本 task 采用的适配边界；没有读取真实 token，也没有请求真实 New API。

## 结论

采用以下实现边界：渠道列表按 `data.items` 读取并用 `p` 分页；`status` / `group` 仅作为读取字段；PUT 只发送可写字段；自检解析覆盖 `model` 与 `reasoning_content.model`。真实 New API 版本差异和真实模型回复仍属于部署环境人工复核项，不能由本地 mock 证明。

## 是否采纳

- 决定：是
- 理由：本地受控实验足以验证适配器的输入输出边界，且明确保留真实环境限制。
- 后续 task：t482
