# Phase 3 设计规格: IPC 与 UI (Round 8-9)

## 决策摘要

| 维度     | 决策                                          |
| -------- | --------------------------------------------- |
| 架构     | 单 Renderer，路由区分视图                     |
| 框架     | React + Vite                                  |
| 组件库   | shadcn/ui + Tailwind CSS                      |
| 视觉风格 | 跟随系统主题（nativeTheme）                   |
| 布局     | 托盘弹出面板 + 独立窗口仪表板                 |
| 设置     | 独立设置窗口，左侧插件列表 + 右侧自动生成表单 |

---

## 1. 目录结构

```
src/
├── main/
│   ├── index.ts                      # Electron 主进程入口（重写）
│   ├── ipc/
│   │   ├── plugin-ipc.ts             # 插件相关 IPC handler
│   │   ├── config-ipc.ts             # 配置相关 IPC handler
│   │   └── event-ipc.ts              # 实时事件推送（main→renderer）
│   └── core/                         # Phase 2 已有，不动
├── preload/
│   ├── index.ts                      # contextBridge 注册
│   └── usageboard-api.ts             # window.usageboard 类型定义
├── renderer/
│   ├── index.html                    # HTML 入口
│   ├── index.tsx                     # React 入口，路由挂载
│   ├── App.tsx                       # 路由定义
│   ├── hooks/
│   │   ├── use-plugins.ts            # 插件列表 + 状态 hook
│   │   ├── use-config.ts             # 配置读写 hook
│   │   └── use-theme.ts              # 系统主题检测 hook
│   ├── views/
│   │   ├── PopupView.tsx             # 托盘弹出面板
│   │   ├── DashboardView.tsx         # 独立窗口仪表板
│   │   └── SettingsView.tsx          # 设置窗口
│   ├── components/
│   │   ├── PluginCard.tsx            # 插件用量卡片（弹出/仪表板共用）
│   │   ├── PluginCardSkeleton.tsx    # 加载骨架屏
│   │   ├── ErrorBanner.tsx           # 错误提示条
│   │   ├── EmptyState.tsx            # 空状态占位
│   │   ├── RefreshButton.tsx         # 刷新按钮
│   │   └── SettingsForm.tsx          # 由 PluginMetadata 自动生成的配置表单
│   ├── lib/
│   │   └── theme.ts                  # nativeTheme 检测 + CSS 变量切换
│   └── styles/
│       └── globals.css               # Tailwind 基础 + 自定义 CSS 变量
├── shared/
│   ├── types/
│   │   ├── ipc.ts                    # IPC 合约类型（重写）
│   │   ├── plugin.ts                 # 已有
│   │   └── config.ts                 # 已有
│   ├── schemas/                      # Phase 2 已有，不动
│   ├── errors/                       # Phase 2 已有，不动
│   └── constants.ts                  # 已有
├── preload.ts                        # 删除（迁移到 preload/index.ts）
├── renderer.ts                       # 删除（迁移到 renderer/index.tsx）
└── main.ts                           # 删除（迁移到 main/index.ts）
```

---

## 2. IPC 合约 (`src/shared/types/ipc.ts`)

### 2.1 通道定义

```typescript
export const IPC_CHANNELS = {
    // 插件
    PLUGIN_LIST: "plugin:list",
    PLUGIN_GET_STATE: "plugin:getState",
    PLUGIN_REFRESH: "plugin:refresh",
    PLUGIN_REFRESH_ALL: "plugin:refreshAll",

    // 配置
    CONFIG_GET: "config:get",
    CONFIG_SAVE: "config:save",
    CONFIG_SAVE_SECRETS: "config:saveSecrets",

    // 事件推送（main → renderer）
    EVENT_STATE_CHANGE: "event:stateChange",
    EVENT_THEME_CHANGE: "event:themeChange",
} as const;
```

### 2.2 DTO 类型

```typescript
import type { UsageItem, PluginChart } from "../schemas/plugin-output";
import type { PluginMetadata } from "../schemas/plugin-metadata";

// PluginSnapshotState 的 JSON 安全版本
export type PluginSnapshotDTO =
    | { status: "idle" }
    | { status: "loading" }
    | {
          status: "ready";
          items: readonly UsageItem[];
          updatedAt: string; // ISO 8601
          badge?: string;
          chart?: PluginChart;
      }
    | {
          status: "failed";
          error: string;
          updatedAt?: string; // lastSuccess.updatedAt，可能为空
          items?: readonly UsageItem[]; // lastSuccess.items
      };

export interface PluginInfo {
    stateId: string;
    name: string;
    enabled: boolean;
    metadata: PluginMetadata | null;
    snapshot: PluginSnapshotDTO;
}

export interface ConfigSaveSecretsPayload {
    stateId: string;
    secrets: Record<string, string>; // paramName → 明文值，仅 secret 类型参数
}

export interface IpcError {
    code: string;
    message: string;
}
```

### 2.3 暴露给 Renderer 的 API

```typescript
export interface UsageboardApi {
    plugin: {
        list(): Promise<PluginInfo[]>;
        getState(stateId: string): Promise<PluginSnapshotDTO>;
        refresh(stateId: string): Promise<void>;
        refreshAll(): Promise<void>;
    };
    config: {
        get(): Promise<AppConfiguration>;
        save(config: AppConfiguration): Promise<void>;
        saveSecrets(payload: ConfigSaveSecretsPayload): Promise<void>;
    };
    event: {
        onStateChange(callback: (stateId: string, state: PluginSnapshotDTO) => void): () => void;
        onThemeChange(callback: (isDark: boolean) => void): () => void;
    };
}
```

---

## 3. IPC Handler 层

### 3.1 `src/main/ipc/plugin-ipc.ts`

注册 `ipcMain.handle` handler，接收 Zod 校验后的参数，调用 Phase 2 的 core 层。

```
plugin:list    → 读取 configStore.load() 获取插件列表，
                  对每个插件读取 runtimeStore.getSnapshot()，
                  合并为 PluginInfo[]。secret 类型参数在 parameterValues 中替换为 "***"。

plugin:getState → stateId 校验（非空字符串 + 路径安全），
                  从 runtimeStore.getSnapshot() 转换为 PluginSnapshotDTO。
                  Date → ISO string。

plugin:refresh  → stateId 校验，调用 refreshService.refresh(stateId, { force: true })。

plugin:refreshAll → 调用 refreshService.refreshAll()。
```

### 3.2 `src/main/ipc/config-ipc.ts`

```
config:get        → configStore.load()，secret 字段替换为 "***"。

config:save       → Zod 校验完整 AppConfiguration，
                     configStore.save()。

config:saveSecrets → 接收 { stateId, secrets }，
                      遍历 secrets 调用 secretsStore.set()。
                      key 格式: `${stateId}:${paramName}`。
```

### 3.3 `src/main/ipc/event-ipc.ts`

主进程 → 渲染进程的实时推送。

```
event:stateChange  → runtimeStore.subscribe() 监听变化，
                     通过 webContents.send() 推送到所有打开的窗口。
                     PluginSnapshotState → PluginSnapshotDTO 转换。

event:themeChange  → nativeTheme.on('updated') 监听，
                     推送 nativeTheme.shouldUseDarkColors。
```

### 3.4 错误处理

所有 IPC handler 统一 try-catch。Electron 的 `ipcMain.handle` 会自动序列化 Error 对象的 message 属性，但不会序列化自定义属性。因此：

```typescript
// 自定义 IPC 错误，携带 code
class IpcError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
    }
}

// handler 中
try {
    // handler logic
} catch (error: unknown) {
    if (error instanceof IpcError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new IpcError("INTERNAL_ERROR", message);
}

// renderer 侧统一 catch
try {
    await window.usageboard.plugin.refresh(id);
} catch (error: unknown) {
    // error.message 包含 IPC 传回的错误信息
}
```

Zod 校验失败 → `throw new IpcError("VALIDATION_ERROR", zodError.message)`.

---

## 4. Preload 层 (`src/preload/`)

### 4.1 `src/preload/usageboard-api.ts`

Global type augmentation，让 renderer 通过 `window.usageboard` 获得完整类型提示：

```typescript
import type { UsageboardApi } from "../shared/types/ipc";

declare global {
    interface Window {
        usageboard: UsageboardApi;
    }
}
```

### 4.2 `src/preload/index.ts`

```typescript
import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/types/ipc";

const api: UsageboardApi = {
    plugin: {
        list: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIST),
        getState: (stateId: string) => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_GET_STATE, stateId),
        refresh: (stateId: string) => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_REFRESH, stateId),
        refreshAll: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_REFRESH_ALL),
    },
    config: {
        get: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
        save: (config) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE, config),
        saveSecrets: (payload) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE_SECRETS, payload),
    },
    event: {
        onStateChange: (callback) => {
            const handler = (_e: unknown, stateId: string, state: PluginSnapshotDTO) =>
                callback(stateId, state);
            ipcRenderer.on(IPC_CHANNELS.EVENT_STATE_CHANGE, handler);
            return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_STATE_CHANGE, handler);
        },
        onThemeChange: (callback) => {
            const handler = (_e: unknown, isDark: boolean) => callback(isDark);
            ipcRenderer.on(IPC_CHANNELS.EVENT_THEME_CHANGE, handler);
            return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_THEME_CHANGE, handler);
        },
    },
};

contextBridge.exposeInMainWorld("usageboard", api);
```

安全约束：

- **不暴露 `ipcRenderer`** 本体，只暴露封装后的方法。
- 所有输入在 main 侧 Zod 校验，preload 只做透传。
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` 保持不变。

---

## 5. 主进程重写 (`src/main/index.ts`)

### 5.1 窗口管理

三个窗口，共享同一个 renderer bundle：

```typescript
const WINDOW_CONFIG = {
    popup: {
        width: 360,
        height: 480,
        resizable: false,
        frame: false, // 无边框弹出面板
        show: false, // 托盘触发时才显示
        route: "/popup",
    },
    dashboard: {
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 400,
        route: "/dashboard",
    },
    settings: {
        width: 720,
        height: 560,
        minWidth: 560,
        minHeight: 440,
        route: "/settings",
    },
};
```

每个 BrowserWindow 加载相同 URL，通过 hash 路由区分：
`mainWindow.loadURL(`file://${__dirname}/index.html#/${route}`)`.

### 5.2 系统托盘

```typescript
import { Tray, Menu, nativeImage } from "electron";

// 托盘图标
const tray = new Tray(nativeImage.createFromPath(iconPath));

// 左键点击 → 弹出面板（toggle show/hide）
tray.on("click", () => togglePopup());

// 右键菜单
const contextMenu = Menu.buildFromTemplate([
    { label: "打开仪表板", click: () => showDashboard() },
    { label: "设置", click: () => showSettings() },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
]);
tray.setContextMenu(contextMenu);
```

弹出面板定位：在托盘图标附近弹出（`tray.getBounds()` 计算位置）。

### 5.3 生命周期

```
app.whenReady() →
    1. 初始化 core 层（configStore, cacheStore, runtimeStore, refreshService）
    2. 注册 IPC handlers（plugin-ipc, config-ipc, event-ipc）
    3. 创建托盘
    4. 启动 plugin-scheduler（定时刷新）
    5. 首次 refreshAll()

app.on('window-all-closed') → 不退出（托盘保持运行）
tray contextMenu "退出" → app.quit()
```

---

## 6. Renderer 层

### 6.1 技术选型

| 依赖                     | 版本   | 用途                |
| ------------------------ | ------ | ------------------- |
| react                    | ^19    | UI 框架             |
| react-dom                | ^19    | DOM 渲染            |
| tailwindcss              | ^4     | 样式                |
| @tailwindcss/vite        | ^4     | Vite 插件           |
| class-variance-authority | latest | shadcn/ui 依赖      |
| clsx                     | latest | className 合并      |
| tailwind-merge           | latest | Tailwind class 合并 |
| lucide-react             | latest | 图标                |

shadcn/ui 组件按需添加（Button, Card, Input, Label, Select, Switch, Skeleton, Tabs, Tooltip），不安装完整包。

### 6.2 路由

使用 hash 路由（Electron file:// 协议不兼容 browser history）。路由逻辑简单，不引入 react-router，手写路由 hook：

```typescript
// renderer/hooks/use-route.ts
export function useRoute(): string {
    const [route, setRoute] = useState(window.location.hash.slice(2) || "popup");
    useEffect(() => {
        const handler = () => setRoute(window.location.hash.slice(2) || "popup");
        window.addEventListener("hashchange", handler);
        return () => window.removeEventListener("hashchange", handler);
    }, []);
    return route;
}
```

```typescript
// renderer/App.tsx
function App() {
    const route = useRoute();
    switch (route) {
        case "popup": return <PopupView />;
        case "dashboard": return <DashboardView />;
        case "settings": return <SettingsView />;
        default: return <PopupView />;
    }
}
```

### 6.3 主题系统

`renderer/lib/theme.ts`:

```typescript
// 监听系统主题变化，设置 <html class="dark"> 或移除
export function useTheme() {
    useEffect(() => {
        const unsubscribe = window.usageboard.event.onThemeChange((isDark) => {
            document.documentElement.classList.toggle("dark", isDark);
        });
        // 初始化
        document.documentElement.classList.toggle(
            "dark",
            window.matchMedia("(prefers-color-scheme: dark)").matches,
        );
        return unsubscribe;
    }, []);
}
```

Tailwind `darkMode: "class"` 配置。shadcn/ui CSS 变量按 shadcn 标准的 light/dark 双色板。

### 6.4 PopupView（托盘弹出面板）

```
┌──────────────────────────┐
│ OmniUsage    14:32  🔄 ⚙ │  ← 标题栏：名称 + 更新时间 + 刷新 + 设置按钮
├──────────────────────────┤
│ ┌──────────┐ ┌──────────┐│
│ │  Claude  │ │  OpenAI  ││  ← 2列网格 PluginCard
│ │  $12.50  │ │   $8.20  ││
│ │ ▓▓▓░░░░  │ │ ▓▓▓▓▓░░ ││     进度条 + usage 文字
│ └──────────┘ └──────────┘│
│ ┌──────────┐ ┌──────────┐│
│ │ DeepSeek │ │  智谱GLM ││
│ │   $3.10  │ │  ⚠ 错误  ││
│ │ ▓▓░░░░░  │ │          ││
│ └──────────┘ └──────────┘│
├──────────────────────────┤
│    点击展开完整仪表板 →    │  ← 展开按钮 → 打开 dashboard 窗口
└──────────────────────────┘
```

尺寸固定 360x480，不可调整。无边框，点击外部区域自动隐藏（`blur` 事件）。

### 6.5 DashboardView（独立窗口仪表板）

列表式布局，每行一个插件：

```
┌─────────────────────────────────────────────┐
│ OmniUsage                     🔄 刷新全部 ⚙  │
│ 最后更新: 14:32 · 自动刷新 5min              │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ 🟣 Claude              $12.50    ▶ 详情  │ │
│ │ 2,340 / 10,000 tokens  Pro Plan         │ │
│ │ ▓▓▓░░░░░░░░░░░░░░░░ 23%                │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ 🟢 OpenAI                $8.20   ▶ 详情  │ │
│ │ 512 / 1,000 requests                     │ │
│ │ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░ 51%                │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ 🔴 智谱 GLM             ⚠ 运行失败       │ │
│ │ Error: API key 无效                      │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

"详情" 按钮点击展开该插件的 chart 数据（如果 chart 存在）。

### 6.6 SettingsView（设置窗口）

```
┌───────────────────────────────────────┐
│ 设置                                  │
├──────────┬────────────────────────────┤
│ 一般     │ 语言: [中文简体 ▾]          │
│ Claude   │ 显示模式: [分组 ▾]          │
│ OpenAI   │ 开机启动: [开关]            │
│ DeepSeek │                            │
│ 智谱GLM  │                            │
│ MiniMax  │                            │
│ Tavily   │                            │
├──────────┴────────────────────────────┤
│ (选中插件时显示右侧表单)              │
│                                       │
│ 左侧选中 "Claude" → 右侧:            │
│ ┌───────────────────────────────────┐ │
│ │ Claude 配置                       │ │
│ │                                   │ │
│ │ 启用: [开关]                      │ │
│ │ 执行路径: [/path/to/plugin.py ▾]  │ │
│ │ 刷新间隔: [300] 秒                │ │
│ │                                   │ │
│ │ API Key: [••••••••]  (secret)     │ │
│ │ 模型: [gpt-4 ▾]     (choice)      │ │
│ │ 调试模式: [开关]     (boolean)    │ │
│ │                                   │ │
│ │              [保存]               │ │
│ └───────────────────────────────────┘ │
└───────────────────────────────────────┘
```

### 6.7 SettingsForm 自动生成

`renderer/components/SettingsForm.tsx` 根据 `PluginMetadata.parameters` 动态渲染表单：

| parameter type | 渲染为                               |
| -------------- | ------------------------------------ |
| `secret`       | `<Input type="password" />`          |
| `string`       | `<Input type="text" />`              |
| `integer`      | `<Input type="number" />`            |
| `boolean`      | `<Switch />`                         |
| `choice`       | `<Select>` with `options`            |
| `directory`    | 暂渲染为 `<Input>`，后续加文件选择器 |
| `file`         | 暂渲染为 `<Input>`，后续加文件选择器 |

表单提交时：

1. 收集所有非 secret 参数 → 写入 `config.save()` 的 `parameterValues`
2. 收集所有 secret 参数 → 单独调用 `config.saveSecrets()`
3. 已有 secret 值（返回 `"***"`）且用户未修改 → 不发送

### 6.8 数据 Hook

`renderer/hooks/use-plugins.ts`:

```typescript
export function usePlugins() {
    const [plugins, setPlugins] = useState<PluginInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 初始加载
        window.usageboard.plugin.list().then((list) => {
            setPlugins(list);
            setLoading(false);
        });

        // 实时更新
        const unsubscribe = window.usageboard.event.onStateChange((stateId, state) => {
            setPlugins((prev) =>
                prev.map((p) => (p.stateId === stateId ? { ...p, snapshot: state } : p)),
            );
        });

        return unsubscribe;
    }, []);

    return { plugins, loading };
}
```

---

## 7. Secret 脱敏规则

main 进程在返回数据给 renderer 之前，对 secret 类型参数做脱敏：

1. `plugin:list` — 每个 `PluginInfo` 的 `parameterValues` 中，匹配 metadata.parameters type=secret 的字段值替换为 `"***"`
2. `config:get` — 同上规则
3. `config:saveSecrets` — 只接收用户实际修改的 secret（非 `"***"` 值），通过 secretsStore.set() 存储
4. renderer 端 **永远无法读取** secret 明文，只能写入

---

## 8. 构建配置变更

### 8.1 新增依赖

```json
{
    "dependencies": {
        "react": "^19",
        "react-dom": "^19",
        "class-variance-authority": "latest",
        "clsx": "latest",
        "tailwind-merge": "latest",
        "lucide-react": "latest"
    },
    "devDependencies": {
        "@types/react": "^19",
        "@types/react-dom": "^19",
        "tailwindcss": "^4",
        "@tailwindcss/vite": "^4"
    }
}
```

### 8.2 Vite 配置

Electron Forge `@electron-forge/plugin-vite` 需要配置多入口：

```javascript
// forge.config.ts 中的 vite 配置
{
    renderer: {
        build: {
            rollupOptions: {
                input: {
                    index: path.join(__dirname, "src/renderer/index.html"),
                },
            },
        },
    },
}
```

### 8.3 Tailwind 配置

```css
/* src/renderer/styles/globals.css */
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

/* shadcn/ui CSS 变量 — light */
:root {
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --border: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);
    --destructive: oklch(0.577 0.245 27.325);
}

/* shadcn/ui CSS 变量 — dark */
.dark {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --primary: oklch(0.985 0 0);
    --primary-foreground: oklch(0.205 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --border: oklch(0.269 0 0);
    --ring: oklch(0.439 0 0);
    --destructive: oklch(0.577 0.245 27.325);
}
```

---

## 9. 实施顺序

| 步骤  | 内容                                                                  | 依赖                |
| ----- | --------------------------------------------------------------------- | ------------------- |
| R8.1  | `shared/types/ipc.ts` — IPC 合约类型 + 通道常量                       | Phase 2 types       |
| R8.2  | `preload/index.ts` + `preload/usageboard-api.ts` — contextBridge 注册 | R8.1                |
| R8.3  | `main/ipc/plugin-ipc.ts` — 插件 IPC handler                           | R8.1 + Phase 2 core |
| R8.4  | `main/ipc/config-ipc.ts` — 配置 IPC handler                           | R8.1 + Phase 2 core |
| R8.5  | `main/ipc/event-ipc.ts` — 实时事件推送                                | R8.1 + runtimeStore |
| R8.6  | `main/index.ts` 重写 — 托盘 + 窗口管理 + IPC 注册                     | R8.3-5              |
| R9.1  | 安装 React/Tailwind/shadcn 依赖 + Vite 配置                           | 无                  |
| R9.2  | `renderer/index.html` + `renderer/index.tsx` + `App.tsx` + 路由       | R9.1                |
| R9.3  | `renderer/lib/theme.ts` + `styles/globals.css` + Tailwind 配置        | R9.1                |
| R9.4  | `renderer/hooks/` — use-plugins, use-config, use-theme, use-route     | R9.2 + R8.2         |
| R9.5  | `renderer/components/` — PluginCard, ErrorBanner, EmptyState 等       | R9.4                |
| R9.6  | `renderer/views/PopupView.tsx`                                        | R9.5                |
| R9.7  | `renderer/views/DashboardView.tsx`                                    | R9.5                |
| R9.8  | `renderer/components/SettingsForm.tsx` — 自动生成表单                 | R9.4                |
| R9.9  | `renderer/views/SettingsView.tsx`                                     | R9.8                |
| R9.10 | 清理旧文件（main.ts, preload.ts, renderer.ts）                        | R9.6-9              |

---

## 10. 测试策略

| 层          | 测试方式                                                  |
| ----------- | --------------------------------------------------------- |
| IPC handler | vitest 单元测试，mock core 层依赖                         |
| Preload     | 类型检查（UsageboardApi 类型完整性）                      |
| React hooks | vitest + @testing-library/react-hooks                     |
| 组件        | vitest + @testing-library/react                           |
| E2E         | Playwright smoke test：启动应用 → 托盘点击 → 弹出面板可见 |

E2E smoke test 范围：

1. 应用启动后托盘图标存在
2. 点击托盘弹出面板窗口
3. 弹出面板内渲染插件卡片（可能为空状态）
4. 设置窗口可打开
