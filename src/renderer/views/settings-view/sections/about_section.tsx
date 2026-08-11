import { Button } from "../../../components/ui/Button";
import { Icon } from "../../../components/Icon";
import logo from "../../../assets/logo.svg";
import package_json from "../../../../../package.json";

type BuildInfo = {
    branch: string;
    commit: string;
    subject: string;
} | null;

export function AboutSection({ build_info }: { build_info: BuildInfo }) {
    const version = package_json.version;
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center text-center">
                <div className="relative mb-3 flex h-24 w-24 items-center justify-center rounded-2xl bg-[var(--color-primary-container)]">
                    <img src={logo} alt="OmniPanel" width="96" height="96" />
                </div>
                <div className="text-[length:var(--text-title-lg)] font-bold">OmniPanel</div>
                <div className="mt-1 text-[length:var(--text-body-md)] text-[var(--color-on-surface-variant)]">
                    版本 {version}
                </div>
                <div
                    data-testid="about-build"
                    className="mt-1 max-w-full truncate font-[var(--font-code-md)] text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]"
                >
                    {build_info
                        ? `${build_info.branch}@${build_info.commit} ${build_info.subject}`
                        : ""}
                </div>
                <div
                    data-testid="about-platform"
                    className="mt-1 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]"
                >
                    {window.usageboard.platform === "darwin" ? "macOS" : "Windows"} · x64
                </div>
                <hr className="my-4 w-full border-[var(--color-hairline)]" />
                <div className="max-w-[520px] text-[length:var(--text-body-md)] leading-relaxed text-[var(--color-on-surface-variant)]">
                    跨平台的 AI 服务用量监控工具，实时查看 Claude、Codex 等各服务的用量限制与 Token
                    趋势。
                </div>
                <div className="mt-3 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                    © 2026 OmniPanel · 保留所有权利
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                {(
                    [
                        {
                            id: "update",
                            icon: "refresh",
                            label: "检查更新",
                            sub: "当前已是最新",
                            tint: "#3d7afd",
                        },
                        {
                            id: "site",
                            icon: "globe",
                            label: "官网",
                            sub: "omnipanel.app",
                            tint: "#3d7afd",
                        },
                        {
                            id: "docs",
                            icon: "book",
                            label: "文档与帮助",
                            sub: "使用指南、常见问题",
                            tint: "#6f5cf6",
                        },
                        {
                            id: "contact",
                            icon: "feedback",
                            label: "反馈与联系",
                            sub: "提交建议、报告问题",
                            tint: "#0ea5a3",
                        },
                        {
                            id: "donate",
                            icon: "heart",
                            label: "支持作者",
                            sub: "请作者喝杯咖啡",
                            tint: "#e23744",
                        },
                        {
                            id: "privacy",
                            icon: "shield",
                            label: "隐私政策",
                            sub: "我们如何处理数据",
                            tint: "#6f5cf6",
                        },
                        {
                            id: "terms",
                            icon: "file",
                            label: "服务条款",
                            sub: "使用本软件的约定",
                            tint: "#3d7afd",
                        },
                        {
                            id: "oss",
                            icon: "code",
                            label: "开源许可",
                            sub: "第三方组件与协议",
                            tint: "#0ea5a3",
                        },
                    ] as const
                ).map((c) => (
                    <Button
                        key={c.id}
                        variant={c.id === "update" ? "primary" : "secondary"}
                        className="h-auto min-h-[108px] flex-col gap-2 rounded-xl p-4 text-center font-normal"
                        data-testid={`about-card-${c.id}`}
                        type="button"
                        onClick={() => {
                            const urls: Record<string, string> = {
                                site: "https://omnipanel.app",
                                docs: "https://omnipanel.app/docs",
                                contact: "https://omnipanel.app/feedback",
                                donate: "https://omnipanel.app/sponsor",
                                privacy: "https://omnipanel.app/privacy",
                                terms: "https://omnipanel.app/terms",
                                oss: "https://omnipanel.app/oss",
                            };
                            const url = urls[c.id];
                            if (url) {
                                const win = window.open(url, "_blank", "noopener,noreferrer");
                                if (!win) window.location.href = url;
                            }
                        }}
                    >
                        <span
                            className="flex h-11 w-11 items-center justify-center rounded-xl"
                            style={{
                                background:
                                    c.id === "update"
                                        ? "rgba(255,255,255,0.2)"
                                        : `color-mix(in srgb, ${c.tint} 12%, transparent)`,
                            }}
                        >
                            <Icon
                                name={c.icon}
                                size={23}
                                strokeWidth={1.7}
                                color={c.id === "update" ? "#fff" : c.tint}
                            />
                        </span>
                        <span className="text-[length:var(--text-title-sm)] font-semibold">
                            {c.label}
                        </span>
                        <span
                            className={
                                c.id === "update"
                                    ? "text-[length:var(--text-body-sm)] opacity-80"
                                    : "text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]"
                            }
                        >
                            {c.sub}
                        </span>
                    </Button>
                ))}
            </div>
        </div>
    );
}
