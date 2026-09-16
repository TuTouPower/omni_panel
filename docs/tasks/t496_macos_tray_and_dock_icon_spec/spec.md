# Task spec

## 背景

用户反馈两处图标问题，实测定位到根因（2026-09-17，`pngjs` 量非透明包围盒）：

|资源|现状|实测|问题|
|---|---|---|---|
|`assets/tray-icon.png`|32×32 彩色 PNG，`nativeImage.createFromPath` 后**未** `setTemplateImage`|非透明包围盒 28×29|Electron 按 1x 读取 → 32pt 画在 22pt 高的菜单栏里，**偏大**且非整数缩放模糊；彩色图标不随菜单栏明暗自动适配|
|`assets/tray-icon-test.png`|64×64（`TEST_INSTANCE=1` 用）|包围盒 50×50|同上，更严重|
|`assets/icon.png`（Dock）|1024×1024，`electron-builder mac.icon` 直用|**主体包围盒 780×780 = 76.2%**|Apple macOS 图标模板要求 1024 画布内图标主体 **824×824（≈80.5%）**；主体偏小 → Dock 里**显得比原生应用小**|

macOS 最佳实践：菜单栏图标用**模板图**（纯黑 + alpha，系统按外观渲成白/黑），尺寸 **16×16 pt**（@1x 16px + @2x 32px，文件名以 `Template` 结尾或调用 `setTemplateImage(true)`）；Dock 图标按 Apple 图标网格（1024 画布 + 824 主体 + 圆角方形轮廓）给尺寸。

代码证据：`src/main/index.ts:1194-1198`（tray 创建）、`src/main/core/paths.ts:76-82`（tray 路径）；`electron-builder.yml:56`（`mac.icon: assets/icon.png`）。

## 契约区

### 范围

- 菜单栏图标改为模板图：纯黑 + alpha，1x=16px / 2x=32px（或 `nativeImage` 双表示），运行期设置模板语义；测试实例图标同步（`TEST_INSTANCE=1`）。
- Dock/应用图标按 Apple 模板重做：1024×1024 画布，主体 824×824 居中（≈80.5%），轮廓与圆角符合 macOS 应用图标观感；`electron-builder` 生成的 `.icns` 尺寸齐全（16/32/64/128/256/512/1024）。
- Windows/Linux 的图标沿用现有 `icon.png`/`.ico` 产物，不因本次改动回归。

### 非范围

- 应用内 UI 使用的 logo（`src/renderer/assets/logo.svg`，标题栏/关于页）——标题栏的 logo 已由 t493 移除，关于页保持不变。
- macOS 26 新图标格式（`.icon` / Icon Composer）迁移。
- 托盘菜单交互与弹窗行为（见 t497）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：菜单栏图标为模板图（无彩色像素；`isTemplateImage()` 为真），在浅色与深色菜单栏下均由系统渲染为对应前景色。
- [ ] AC-002：菜单栏图标逻辑尺寸为 16pt（1x 16px、2x 32px 两个表示），在 22pt 菜单栏内不再显得偏大、无模糊。
- [ ] AC-003：测试实例（`TEST_INSTANCE=1`）的菜单栏图标同样满足 AC-001/AC-002。
- [ ] AC-004：应用图标主体在 1024 画布内占 824×824（±2px），Dock 中与原生应用观感一致（不偏小）。
- [ ] AC-005：打包产物的 `.icns` 含 16/32/64/128/256/512/1024 全部尺寸。
- [ ] AC-006：[deploy] macOS 打包版肉眼确认：菜单栏图标大小/颜色正常，Dock 图标与其它应用并列时大小协调。
- [ ] AC-007：Windows/Linux 构建使用的图标资源仍可正常生成（`icon.ico`/`icon.png` 存在且未被破坏）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001 / AC-002：单测（tray 图标加载后断言 `isTemplateImage()`；PNG 尺寸断言 16/32；用 `pngjs` 断言无彩色像素——RGB 与 alpha 关系满足模板图要求）。
- AC-003：同 AC-001/002，输入为 `-test` 资源。
- AC-004：资源校验单测（解码 1024 PNG，断言非透明包围盒 = 824×824±2 且居中）。
- AC-005：打包后断言（脚本从 `.app` 内 `.icns` 用 `iconutil -c iconset` 展开，检查尺寸齐全）——归打包验证步骤。
- AC-006：deploy 人工肉眼（打包版截图）。
- AC-007：构建/打包流程回归（现有 mac 打包链）。

## 上下文区

- 来源：用户反馈（2026-09-17）；实测数据见背景表格（`pngjs` 包围盒测量，命令保留在实施笔记）。

### 有意不测

- 菜单栏图标在“菜单栏自动隐藏/降低透明度”等系统偏好下的细微渲染差异：系统行为，非本产品可控。

### 测试策略

- 单测：新增图标资源校验（尺寸、模板图属性、包围盒占比），复用 `pngjs`（已在依赖树中）。
- 构建验证：打包后展开 `.icns` 检查尺寸集合。
- 黑盒：打包版肉眼（需用户许可）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 当前 macOS 版本（26.5）Dock 图标网格是否仍为 824/1024：UNVERIFIED-SPIKE，实施时以实机 Dock 对比确认（拿系统应用的 `AppIcon.icns` 展开量取主体占比作为对照）。
- `nativeImage` 在 macOS 上对“文件名含 Template 后缀”的自动模板化行为与显式 `setTemplateImage(true)` 的差异：UNVERIFIED-SPIKE，实测取其一。

### 风险与回退

- 风险：模板图过细在小尺寸下发虚；Dock 图标改轮廓后与品牌辨识度冲突。
- 回退：图标资源与 tray 加载代码独立，可单独 revert；旧 `tray-icon.png` 保留在 git 历史可随时取回。

### 依赖与约束

- 无前置依赖；与 t493/t494/t495 文件不重叠（仅可能与 t493 同时涉及 `index.ts` 的 tray 段落，需注意合并顺序）。

### Finalization 时更新的 blueprint

- `DESIGN.md`：品牌资源章节——菜单栏模板图规范（16pt、纯黑+alpha）与 Dock 图标画布规范（1024 画布/824 主体）。
