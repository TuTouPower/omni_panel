/**
 * t311_code_f003: web 端面板互跳/外链按钮共用的 icon 链接样式类
 * （原生 <a href>，中键/Ctrl+Click 由浏览器新开标签页）。
 * 与 ui/Button icon 变体视觉对齐；改动 Button 基类时同步本常量。
 */
export const ICON_LINK_CLS =
    "inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent " +
    "text-[var(--color-on-surface-variant)] no-underline transition-feedback " +
    "hover:bg-[var(--color-surface-raised)] focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-0";
