# 旧项目数据模型

> 来源：`Sources/UsageBoardCore/Models.swift`，字段级别。

## AppConfiguration

| 字段                | 类型                  | Required | Default   | JSON Key              | 说明                    |
| ------------------- | --------------------- | -------- | --------- | --------------------- | ----------------------- |
| schemaVersion       | Int                   | yes      | 1         | `schemaVersion`       | 配置 schema 版本        |
| language            | AppLanguage           | yes      | `.zhHans` | `language`            | `"zh-Hans"` 或 `"en"`   |
| overviewDisplayMode | DisplayMode           | yes      | `.tabs`   | `overviewDisplayMode` | `"grouped"` 或 `"tabs"` |
| plugins             | [PluginConfiguration] | yes      | `[]`      | `plugins`             | 插件配置列表            |
| launchAtLogin       | Bool                  | yes      | false     | `launchAtLogin`       | 开机启动                |

JSONCoding: encoder 输出 `prettyPrinted + sortedKeys`，date 用 `iso8601`。

## PluginConfiguration

| 字段                   | 类型             | Required          | Default             | JSON Key                 | 说明               |
| ---------------------- | ---------------- | ----------------- | ------------------- | ------------------------ | ------------------ |
| id                     | UUID             | decode 时自动生成 | `UUID()`            | 不序列化                 | 运行时唯一标识     |
| stateID                | String           | optional          | `UUID().uuidString` | `stateID`                | 缓存文件名，持久化 |
| name                   | String           | optional\*        | `""`                | `name`                   | 插件显示名         |
| enabled                | Bool             | optional          | true                | `enabled`                | 是否启用           |
| executablePath         | String           | optional\*        | `""`                | `executablePath`         | 脚本路径           |
| refreshIntervalSeconds | Int              | optional          | 300                 | `refreshIntervalSeconds` | 刷新间隔秒数       |
| metadata               | PluginMetadata?  | optional          | nil                 | `metadata`               | 解析后的元数据     |
| parameterValues        | [String: String] | optional          | `[:]`               | `parameterValues`        | 用户填写的参数     |

\*源码中 decode 用 `decodeIfPresent`，均为 optional。`id` 不参与序列化（无 CodingKey）。

## PluginMetadata

| 字段                    | 类型                      | Required | Default | JSON Key             | 说明              |
| ----------------------- | ------------------------- | -------- | ------- | -------------------- | ----------------- |
| name                    | String?                   | no       | nil     | `name`               | 插件名            |
| nameTranslations        | [String: String]          | no       | `[:]`   | `name@{lang}`        | 如 `name@zh-Hans` |
| description             | String?                   | no       | nil     | `description`        | 描述              |
| descriptionTranslations | [String: String]          | no       | `[:]`   | `description@{lang}` | 多语言描述        |
| icon                    | String?                   | no       | nil     | `icon`               | 图标 URL          |
| parameters              | [PluginParameterMetadata] | no       | `[]`    | `parameters`         | 参数定义          |

编码特殊：使用 `AnyCodingKey` 处理 `name@zh-Hans` 等动态 key。

## PluginParameterMetadata

| 字段                    | 类型                    | Required | Default | JSON Key             | 说明            |
| ----------------------- | ----------------------- | -------- | ------- | -------------------- | --------------- |
| name                    | String                  | yes      | -       | `name`               | 参数名          |
| label                   | String                  | yes      | -       | `label`              | 显示标签        |
| labelTranslations       | [String: String]        | no       | `[:]`   | `label@{lang}`       | 多语言标签      |
| type                    | PluginParameterType     | yes      | -       | `type`               | 参数类型        |
| required                | Bool                    | yes      | -       | `required`           | 是否必填        |
| placeholder             | String?                 | no       | nil     | `placeholder`        | 占位文本        |
| placeholderTranslations | [String: String]        | no       | `[:]`   | `placeholder@{lang}` | 多语言占位      |
| defaultValue            | String?                 | no       | nil     | `defaultValue`       | 默认值          |
| options                 | [PluginParameterOption] | no       | `[]`    | `options`            | choice 类型选项 |

## PluginParameterType 枚举

```
string | secret | integer | boolean | choice | directory | file
```

## PluginParameterOption

| 字段              | 类型             | Required | Default | JSON Key       |
| ----------------- | ---------------- | -------- | ------- | -------------- |
| label             | String           | yes      | -       | `label`        |
| labelTranslations | [String: String] | no       | `[:]`   | `label@{lang}` |
| value             | String           | yes      | -       | `value`        |

## PluginOutput（Python stdout JSON）

| 字段          | 类型           | Required | Default  | JSON Key        | 说明                 |
| ------------- | -------------- | -------- | -------- | --------------- | -------------------- |
| schemaVersion | Int            | yes      | 1        | `schemaVersion` | 由 `_common.py` 输出 |
| updatedAt     | Date (ISO8601) | yes      | 当前 UTC | `updatedAt`     |                      |
| items         | [UsageItem]    | yes      | -        | `items`         |                      |
| badge         | String?        | no       | nil      | `badge`         |                      |
| chart         | PluginChart?   | no       | nil      | `chart`         |                      |

错误输出格式：`{"error": "message"}`

## UsageItem

| 字段         | 类型              | Required | Default    | JSON Key       |
| ------------ | ----------------- | -------- | ---------- | -------------- |
| id           | String            | yes      | -          | `id`           |
| name         | String            | yes      | -          | `name`         |
| used         | Double            | yes      | -          | `used`         |
| limit        | Double            | yes      | -          | `limit`        |
| displayStyle | UsageDisplayStyle | yes      | -          | `displayStyle` |
| resetAt      | Date?             | no       | nil        | `resetAt`      |
| status       | UsageStatus       | yes      | `.unknown` | `status`       |
| color        | String?           | no       | nil        | `color`        |

`UsageDisplayStyle`: `"percent"` | `"ratio"`
`UsageStatus`: `"normal"` | `"warning"` | `"critical"` | `"unknown"`

## PluginChart

| 字段       | 类型                | Required | Default | JSON Key     |
| ---------- | ------------------- | -------- | ------- | ------------ |
| kind       | String              | yes      | -       | `kind`       |
| period     | String              | yes      | -       | `period`     |
| bucketUnit | String              | yes      | -       | `bucketUnit` |
| buckets    | [PluginChartBucket] | yes      | -       | `buckets`    |
| message    | String?             | no       | nil     | `message`    |

`bucketUnit` 合法值：`"hour"` | `"day"`

## PluginChartBucket

| 字段     | 类型                 | Required | Default | JSON Key   |
| -------- | -------------------- | -------- | ------- | ---------- |
| label    | String               | yes      | -       | `label`    |
| segments | [PluginChartSegment] | yes      | -       | `segments` |

## PluginChartSegment

| 字段   | 类型   | Required | Default | JSON Key |
| ------ | ------ | -------- | ------- | -------- |
| model  | String | yes      | -       | `model`  |
| tokens | Double | yes      | -       | `tokens` |

## PluginSnapshot（运行时，不序列化）

| 字段        | 类型                | 说明                                            |
| ----------- | ------------------- | ----------------------------------------------- |
| id          | UUID                | 对应 PluginConfiguration.id                     |
| displayName | String              | 显示名                                          |
| state       | PluginSnapshotState | `idle` / `loading` / `ready` / `failed(String)` |
| items       | [UsageItem]         |                                                 |
| updatedAt   | Date?               |                                                 |
| badge       | String?             |                                                 |
| iconURL     | String?             |                                                 |
| chart       | PluginChart?        |                                                 |

## PluginCachedState（持久化缓存，写入 `states/{stateID}.json`）

| 字段      | 类型         | Required | JSON Key    |
| --------- | ------------ | -------- | ----------- |
| updatedAt | Date         | yes      | `updatedAt` |
| items     | [UsageItem]  | yes      | `items`     |
| badge     | String?      | no       | `badge`     |
| chart     | PluginChart? | no       | `chart`     |

## AppLanguage 枚举

```
zhHans = "zh-Hans"
en = "en"
```

## DisplayMode 枚举

```
grouped | tabs
```

## 辅助类型

### AnyCodingKey

用于 PluginMetadata 编解码，处理 `name@zh-Hans` 等动态 key。实现 `CodingKey`，`stringValue` 即 JSON key 名。

### PluginOutputError（内部）

```swift
private struct PluginOutputError: Decodable {
    var error: String
}
```

仅用于解析 `{"error": "..."}` 格式的插件错误输出。
