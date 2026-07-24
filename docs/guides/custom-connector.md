# 自定义 Connector 指南

从「设置 → 账号 → 添加账号 → 打开脚本目录」可打开用户 connector 目录（`userData/connectors`）。在其中新建子目录，放入 `manifest.json` + `connector.ts` 即可让 OmniUsage 自动发现并采集自定义数据源。

## 目录结构

```
userData/connectors/
└── my_vendor/            # 子目录名随意，建议与 provider 同名
    ├── manifest.json     # 连接器清单（必填）
    └── connector.ts      # 采集脚本（必填，manifest.script 指向）
```

启动时 OmniUsage 扫描 `userData/connectors/*`，每个含合法 `manifest.json` 的子目录注册为一个 connector；添加账号弹窗会出现该 vendor。

## provider 命名

`provider` 为开放 `snake_case` 命名空间，匹配 `^[a-z][a-z0-9_]*$`：

- 合法：`my_vendor`、`acme_corp`、`deepseek`、`cpa`
- 非法：`MyVendor`（大写）、`acme-corp`（连字符）、`acme corp`（空格）

provider 同时是用量卡片分组键，建议与目录名一致。内置 provider（`deepseek`/`kimi`/...）名被占用且拥有内置 logo 与标签；自定义 provider 显示 provider 名作 fallback 标签，图标用默认 logo。

## manifest.json

```json
{
    "id": "my_vendor",
    "provider": "my_vendor",
    "capabilities": ["poll"],
    "parameters": [
        {
            "name": "API_KEY",
            "type": "secret",
            "required": true,
            "label": "API Key",
            "label@zh-Hans": "API 密钥",
            "exposeToScript": true
        },
        {
            "name": "LIMIT",
            "type": "number",
            "required": false,
            "default": "100",
            "label@zh-Hans": "金额上限",
            "exposeToScript": true
        }
    ],
    "endpoints": {
        "default": "https://api.example.com"
    },
    "poll": {
        "request": { "endpoint": "default", "path": "/v1/usage", "method": "GET" },
        "map": {}
    },
    "script": "connector.ts"
}
```

### 字段说明

| 字段           | 说明                                                                  |
| -------------- | --------------------------------------------------------------------- |
| `id`           | connector 标识，建议与目录/provider 同名                              |
| `provider`     | snake_case provider 名（见上）                                        |
| `capabilities` | 能力枚举：`poll` / `local` / `session` / `observe`，至少一个          |
| `parameters`   | 参数数组（见下）                                                      |
| `endpoints`    | 命名端点 URL 映射，`default` 为 HTTP 请求基准                         |
| `poll.request` | poll 能力的 HTTP 请求：`endpoint`（键）+ `path`+ `method`（GET/POST） |
| `poll.map`     | 数值配额字段的 JSON path 映射（值须以 `$` 开头）；无需可留空 `{}`     |
| `script`       | 采集脚本文件名（相对子目录）                                          |

### parameter 字段

| 字段                      | 说明                                     |
| ------------------------- | ---------------------------------------- |
| `name`                    | 参数键，脚本通过 `ctx.params[name]` 取值 |
| `type`                    | `secret` / `string` / `number`           |
| `required`                | 是否必填                                 |
| `default`                 | 默认值（字符串）                         |
| `label` / `label@zh-Hans` | UI 标签（英文 / 简中）                   |
| `exposeToScript`          | `true` 时参数值注入 `ctx.params`         |

`type: secret` 的参数走 vault 加密存储，UI 不回显明文。

## connector.ts（vm sandbox 脚本）

脚本在 vm sandbox 执行，**无 `import`/`export`，通过 `declare const ctx` 取上下文**，须 `async function main(): Promise<ScriptObservation[]>` 返回观测值。

```ts
declare const ctx: ConnectorContext;

interface UsageResponse {
    readonly used?: number;
    readonly limit?: number;
}

async function main() {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) return [];

    const resp = (await ctx.http.get_json("default", "/v1/usage", {
        headers: { Authorization: `Bearer ${api_key}` },
    })) as UsageResponse | null;

    const used = resp?.used ?? 0;
    const limit = resp?.limit ?? 0;

    return [
        {
            provider: "my_vendor",
            source_instance_id: ctx.sourceInstanceId,
            account_id: ctx.accountId ?? "default",
            account_label: ctx.accountLabel ?? "默认",
            metric_id: "my_vendor:usage",
            raw_label: "usage",
            normalized_label: "用量",
            used,
            limit: limit > 0 ? limit : null,
            display_style: "ratio",
            window: "month",
            reset_at: null,
            cycle_duration_ms: null,
            status: ctx.status.for_balance(used, limit ?? 0),
            observed_at: Date.now(),
            source: "poll",
        },
    ];
}
```

### ctx 能力

| 成员                                                                                 | 说明                                                       |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `ctx.params`                                                                         | manifest `exposeToScript` 参数键值（secret/string/number） |
| `ctx.http.get_json(endpoint, path, opts)`                                            | 发 JSON GET，返回解析后对象                                |
| `ctx.http.post_json(endpoint, path, body, opts)`                                     | JSON POST                                                  |
| `ctx.http.get_raw(...)`                                                              | 返回 `{ status, headers, body }` 原始响应                  |
| `ctx.files.read(path)` / `ctx.files.list(path)`                                      | 读账号本地文件（local 能力用）                             |
| `ctx.status.for_pct(pct)` / `for_ratio(used, limit)` / `for_balance(balance, limit)` | 阈值→状态（normal/warning/critical/unknown）助手           |
| `ctx.sourceInstanceId` / `ctx.accountId` / `ctx.accountLabel`                        | 当前账号上下文                                             |
| `ctx.report_failed_account(msg)`                                                     | 上报账号级错误                                             |
| `ctx.log.debug/info/warn/error`                                                      | 日志（脱敏）                                               |

### status 助手阈值

- `for_pct(pct)`：0–100 正向百分比，≥90 critical、≥75 warning
- `for_ratio(used, limit)`：正向比值，limit≤0 unknown、≥0.9 critical、≥0.75 warning
- `for_balance(balance, limit)`：余额反向，limit≤0 unknown、≤0.1 critical、≤0.2 warning（余额耗尽为 critical）

### ScriptObservation 关键字段

- `provider`：必须与 manifest.provider 一致
- `metric_id`：`provider:raw_label` 形式，跨刷新稳定
- `display_style`：`percent`（百分比）/ `ratio`（原始比值）
- `limit`：`null` 表示无上限（显示原始 used 值）

## 调试

1. 把脚本目录放好，重启或点「刷新全部」。
2. 「添加账号」选自定义 vendor，填参数保存。
3. 用量卡片显示则成功；失败看卡片错误信息与日志。
4. 改脚本后需刷新全部（脚本每次执行重新编译）。

manifest 非法（provider 不匹配 snake_case、必填缺失）时该 connector 被跳过，日志记 warn。
