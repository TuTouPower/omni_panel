# p261 用量面板顶部刷新按钮初始带焦点蓝框

- 现象：用量面板弹出打开后，在用户未点击且未进行键盘导航时，右上角「刷新全部」按钮周围常驻亮蓝色焦点环（ring-2 蓝色边框）。
- 影响：用量面板视觉干扰严重，按钮被误识别为正激活/选中态；按回车或空格可能误触发刷新。Agent/Dev/Settings 面板的标题栏首个按钮同样存在潜在初始获焦风险。
- 根因：
    1. 窗口激活机制：主进程托盘唤起面板时调用 `target.focus()`（p258 引入失 key 自动收起），由于焦点转移源自系统级原生事件而非 WebContents 内指针点击，Chromium 将当前输入形态判定为非指针（程序化/系统激活），自动将初始焦点移到 DOM 树首个 tabbable 元素。
    2. DOM 顺序：Usage 面板中 `PanelTitleBar` 的「刷新全部」按钮（`title="刷新全部"`）为整页首个交互按钮，首当其冲被聚焦并激活 `:focus-visible`。
    3. 样式定义：`Button.tsx` 的基类定义为 `focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]`，使用了不透明实心亮蓝高亮环。
        已确认同类位点：
    - `PanelTitleBar.tsx` 中的导航按钮及刷新按钮（五面板共用）。
    - `Button.tsx` 基类 `:focus-visible` 样式缺少对容器初始获焦的隔离或兜底。
- 测试缺口：
    1. 现有 E2E（`tests/e2e/web/popup_view.spec.ts`）仅验证可见性与点击，未断言初始加载时 `matches(':focus-visible')` 与 `boxShadow` 状态。
    2. 单元测试在 jsdom 运行，jsdom 不支持 `:focus-visible` 启发式及窗口原生激活机制，存在假绿盲区。
        应在 E2E 层（`tests/e2e/web/popup_view.spec.ts`）补测：面板挂载/初始激活后，顶部操作按钮不得匹配 `:focus-visible`。
- 线索：`.scratch/repro_bug.mjs`，模拟 initial focus 与 Tab navigation 下 `box-shadow` 的出现。
- 处理：main
