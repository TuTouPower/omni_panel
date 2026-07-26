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
        <div className="about-wrap">
            <div className="about-hero">
                <div className="ah-logo-wrap">
                    <img className="ah-logo" src={logo} alt="OmniPanel" width="96" height="96" />
                </div>
                <div className="ah-name">OmniPanel</div>
                <div className="ah-ver">版本 {version}</div>
                <div className="ah-build">
                    {build_info
                        ? `${build_info.branch}@${build_info.commit} ${build_info.subject}`
                        : ""}
                </div>
                <div className="ah-meta">
                    {window.usageboard.platform === "darwin" ? "macOS" : "Windows"} · x64
                </div>
                <hr className="ah-rule" />
                <div className="ah-desc">
                    跨平台的 AI 服务用量监控工具，实时查看 Claude、Codex 等各服务的用量限制与 Token
                    趋势。
                </div>
                <div className="ah-copyright">© 2026 OmniPanel · 保留所有权利</div>
            </div>
            <div className="about-grid">
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
                    <button
                        key={c.id}
                        className={"ab-card" + (c.id === "update" ? " primary" : "")}
                        style={{ ["--tint" as string]: c.tint }}
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
                        <span className="ab-tile">
                            <Icon
                                name={c.icon}
                                size={23}
                                strokeWidth={1.7}
                                color={c.id === "update" ? "#fff" : c.tint}
                            />
                        </span>
                        <span className="ab-label">{c.label}</span>
                        <span className="ab-sub">{c.sub}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
