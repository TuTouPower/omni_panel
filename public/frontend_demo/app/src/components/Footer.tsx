import { Link } from 'react-router';

/** Footer — 落地页简单页脚 */
export default function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-panel">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="SessionGrid" className="h-5 w-5" />
          <span className="font-display font-bold text-[14px]">SessionGrid</span>
          <span className="font-mono text-[11px] text-text-muted">// 6 panes · 1 screen</span>
        </div>
        <p className="text-[12px] text-text-muted">纯前端演示 · 本地解析 · 无数据上传</p>
        <Link to="/workspace" className="text-[13px] font-medium text-lime hover:opacity-80">
          进入工作台 →
        </Link>
      </div>
    </footer>
  );
}
