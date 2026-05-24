# Round 5: Plugin Runner 实现

> 日期：2026-05-24
> 依赖：Round 4（parser + schemas）
> 产出：command-builder + runner + 6 个 fake plugins + 集成测试通过

---

## 目标

实现 Python 子进程执行层。能构建正确的命令行参数，能 spawn 子进程，能捕获 stdout/stderr，能处理 timeout 和错误退出。不涉及配置读写、缓存、调度、UI。

---

## 交付物

### 1. plugin/command-builder.ts

```typescript
export interface PluginCommand {
  command: string;
  args: string[];
}

export function buildPluginCommand(
  executablePath: string,
  parameterValues: Record<string, string>,
  language: AppLanguage,
): PluginCommand;
```

实现逻辑：
1. 构建参数数组：`["--usageboard-param", "KEY=value"]` 格式
2. 仅传递 `parameterValues` 中值非空的条目
3. 追加 `--usageboard-param USAGEBOARD_LANGUAGE=zh-Hans`（或 `en`）
4. 判断文件扩展名：
   - `.py` → `{ command: "python3", args: [executablePath, ...paramArgs] }`
   - 非 `.py` → `{ command: executablePath, args: [...paramArgs] }`

跨平台 Python 查找（Windows）：
- `.py` 文件优先 `python3`，fallback `python`，再 fallback `py`
- 用 `child_process.spawn` 测试命令是否存在，或用 `which` / `where`
- 此逻辑可放入独立函数 `resolvePythonCommand(): string`

### 2. plugin/runner.ts

```typescript
export interface PluginExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface PluginRunnerOptions {
  timeoutMs?: number; // 默认 15000
}

export async function executePlugin(
  command: PluginCommand,
  options?: PluginRunnerOptions,
): Promise<PluginExecutionResult>;
```

实现逻辑：
1. `child_process.spawn(command.command, command.args, { shell: isWindows })`
   - Windows 需要 `shell: true` 才能找到 python/py
   - macOS/Linux 不需要
2. 用 `Buffer` 收集 stdout 和 stderr
3. 监听 `close` 事件获取 exitCode
4. 记录 `durationMs`（`Date.now()` 差值）
5. timeout 处理：
   - `setTimeout` 后调用 `child.kill("SIGTERM")`
   - 等待 2s 后如果还没退出，`kill("SIGKILL")`
   - 抛出 `PluginTimeoutError`
6. 正常退出后返回 `{ stdout, stderr, exitCode, durationMs }`

安全约束：
- `command` 和 `args` 来自 `buildPluginCommand`，不直接接受用户输入
- secret 参数不进入日志/错误消息
- 不使用 `exec`（shell 注入风险），只用 `spawn`

### 3. fixtures/fake-plugins/

6 个 Python 脚本，用于集成测试：

#### prints-valid-json.py

```python
import json
print(json.dumps({
    "schemaVersion": 1,
    "updatedAt": "2026-05-24T12:00:00Z",
    "items": [
        {"id": "test", "name": "Test", "used": 50, "limit": 100,
         "displayStyle": "percent", "status": "normal"}
    ]
}))
```

#### prints-invalid-json.py

```python
print("this is not json")
```

#### exits-nonzero.py

```python
import sys
print("error occurred", file=sys.stderr)
sys.exit(1)
```

#### sleeps-timeout.py

```python
import time
time.sleep(30)
```

#### prints-to-stderr.py

```python
import json, sys
print("debug info", file=sys.stderr)
print(json.dumps({
    "schemaVersion": 1,
    "updatedAt": "2026-05-24T12:00:00Z",
    "items": []
}))
```

#### echoes-params.py

```python
import json, sys
params = {}
for arg in sys.argv[1:]:
    if arg.startswith("--usageboard-param="):
        k, v = arg.split("=", 1)
        params[k.replace("--usageboard-param-", "")] = v
print(json.dumps({"echoed": params}))
```

---

## 测试计划

### tests/integration/plugin/runner.test.ts

| 测试用例 | fake plugin | 预期 |
|---------|------------|------|
| 正常执行并解析 JSON | prints-valid-json.py | exitCode=0, stdout 可 parse |
| 无效 JSON 输出 | prints-invalid-json.py | exitCode=0, parsePluginOutput 抛异常 |
| 非零退出码 | exits-nonzero.py | exitCode=1, stderr 有内容 |
| 超时 | sleeps-timeout.py | 抛 PluginTimeoutError, 进程被 kill |
| stderr 输出但成功 | prints-to-stderr.py | exitCode=0, stderr 有内容, stdout 可 parse |
| 参数传递 | echoes-params.py | stdout 中 echo 的参数与输入一致 |

### tests/unit/plugin/command-builder.test.ts

| 测试用例 | 预期 |
|---------|------|
| .py 文件用 python3 执行 | command="python3" |
| 非 .py 文件直接执行 | command=executablePath |
| 参数格式正确 | args 包含 `--usageboard-param KEY=value` |
| 空参数不传递 | parameterValues 为空时无 --usageboard-param |
| USAGEBOARD_LANGUAGE 始终传递 | args 末尾包含 language 参数 |
| secret 参数值正确传递 | 值不变，但不出现在日志 |

---

## 精确行为约束

| 场景 | 行为 |
|------|------|
| exit code 0 + JSON | 正常返回 PluginExecutionResult |
| exit code 0 + 非 JSON | 返回结果（parsePluginOutput 由调用方处理） |
| exit code != 0 | 返回结果（exitCode != 0），调用方决定是否转为错误 |
| timeout | 抛 PluginTimeoutError，进程被 kill |
| stderr 有内容 | 正常返回，stderr 作为字符串附带（不等于失败） |
| 进程被 signal 终止 | exitCode 为 null 时用 -1 代替 |

---

## 不实现

- 配置读写 / 缓存 / 调度
- UI / IPC
- 插件发现（discovery）
- 插件实例管理

---

## 验收标准

- [ ] `pnpm test` 全部通过（12 个测试）
- [ ] `pnpm check` 全绿
- [ ] 使用 `spawn` 不使用 `exec`
- [ ] timeout 后进程被 kill
- [ ] secret 参数不出现在日志/错误消息
- [ ] Windows 兼容：`shell: true` on win32
- [ ] 所有 fake plugins 可被 Python 执行
- [ ] 参数格式 `--usageboard-param KEY=value` 正确传递

## 文件清单

### 新增文件

```
fixtures/fake-plugins/prints-valid-json.py
fixtures/fake-plugins/prints-invalid-json.py
fixtures/fake-plugins/exits-nonzero.py
fixtures/fake-plugins/sleeps-timeout.py
fixtures/fake-plugins/prints-to-stderr.py
fixtures/fake-plugins/echoes-params.py
tests/unit/plugin/command-builder.test.ts
tests/integration/plugin/runner.test.ts
```

### 修改文件

```
src/main/core/plugin/command-builder.ts（实现）
src/main/core/plugin/runner.ts（实现）
```

### 不允许修改

```
src/shared/schemas/*（Round 4 已冻结）
src/main/core/config/*（Round 6）
src/main/core/cache/*（Round 6）
src/main/core/scheduler/*（Round 7）
src/main/core/paths.ts（Round 6）
fixtures/plugin-output/*
fixtures/plugin-metadata/*
docs/*
```

---

## 下一轮建议

Round 6：实现 config / cache / path / secret（本地状态层）
