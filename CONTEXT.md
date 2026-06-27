# 领域词汇

## 数据源

数据的来源。一个数据源可以提供一个或多个厂商的数据。

示例：CPA 数据源可以提供 Codex、Claude、Gemini 等厂商的数据。DeepSeek 直连数据源只提供 DeepSeek 厂商的数据。

## 厂商

被统计用量和费用的 AI 服务品牌或产品归属。

示例：Claude、Codex、Gemini、MiMo、OpenCode、DeepSeek。

## 账号

某个厂商下的一条独立身份。同一厂商可以有多个账号。

示例：Codex 厂商下可以有 5 个账号。DeepSeek 直连时，数据源是 DeepSeek，厂商是 DeepSeek，账号就是用户添加的某个 DeepSeek 账号。

## 数据标签映射

厂商级的显示名称规则。同一厂商下的所有账号共享同一套数据标签映射。

示例：OpenCode 的任一账号把 `rolling` 映射为“5 小时”后，OpenCode 厂商下所有账号都使用 `rolling → 5 小时`。
