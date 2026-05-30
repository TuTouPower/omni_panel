import { useState } from "react";
import { useConfig } from "../hooks/use-config";
import { usePlugins } from "../hooks/use-plugins";
import { useTheme } from "../lib/theme";
import { SettingsForm } from "../components/SettingsForm";
import { Icon } from "../components/Icon";
import logo from "../assets/logo.png";

const NAV_ITEMS = [
    { id: "general", label: "常规", icon: "gear" },
    { id: "accounts", label: "账号", icon: "inbox" },
    { id: "appearance", label: "外观", icon: "palette" },
    { id: "about", label: "关于", icon: "info" },
];

export function SettingsView() {
    useTheme();
    const { config, hasSecrets, loading, error, save, saveSecrets, duplicate } = useConfig();
    const { plugins } = usePlugins();
    const [section, setSection] = useState("general");

    const goBack = () => {
        window.location.hash = "#popup";
    };

    if (loading) {
        return <div className="p-6 text-[var(--text-3)]">加载中...</div>;
    }
    if (error) {
        return (
            <div className="p-6">
                <div className="net-banner">
                    <Icon name="cloud_off" size={18} />
                    <span>{error}</span>
                </div>
            </div>
        );
    }
    if (!config) return null;

    const metadataMap = new Map(plugins.map((p) => [p.instanceId, p.metadata]));

    const handleSave = async (
        instanceId: string,
        nonSecrets: Record<string, string>,
        secrets: Record<string, string>,
        refreshIntervalSeconds: number,
    ) => {
        const updated = {
            ...config,
            plugins: config.plugins.map((p) =>
                p.instanceId === instanceId
                    ? {
                          ...p,
                          refreshIntervalSeconds,
                          parameterValues: { ...p.parameterValues, ...nonSecrets },
                      }
                    : p,
            ),
        };
        await save(updated);
        if (Object.keys(secrets).length > 0) {
            await saveSecrets(instanceId, secrets);
        }
    };

    return (
        <div className="window">
            <div className="settings">
                {/* header */}
                <div className="settings-head">
                    <button className="back-btn" onClick={goBack}>
                        <Icon name="back" size={20} />
                    </button>
                    <span className="sh-title">设置</span>
                </div>

                <div className="settings-body">
                    {/* left nav */}
                    <div className="set-nav" data-testid="settings-sidebar">
                        {NAV_ITEMS.map((n) => (
                            <button
                                key={n.id}
                                className={"set-nav-item" + (section === n.id ? " on" : "")}
                                onClick={() => {
                                    setSection(n.id);
                                }}
                                data-testid={`settings-plugin-nav-${n.id}`}
                            >
                                <span className="sn-ic">
                                    <Icon name={n.icon} size={16} strokeWidth={1.7} />
                                </span>
                                {n.label}
                            </button>
                        ))}
                    </div>

                    {/* right content */}
                    <div className="set-content">
                        {section === "general" && (
                            <>
                                <div className="set-group-label">刷新</div>
                                {config.plugins.map((p) => {
                                    const params = metadataMap.get(p.instanceId)?.parameters;
                                    if (!params?.length) return null;
                                    return (
                                        <div key={p.instanceId} className="mb-4">
                                            <SettingsForm
                                                instanceId={p.instanceId}
                                                name={p.name}
                                                parameters={params}
                                                values={{ ...p.parameterValues }}
                                                hasSecrets={hasSecrets[p.instanceId] ?? {}}
                                                refreshIntervalSeconds={p.refreshIntervalSeconds}
                                                onSave={handleSave}
                                                onDuplicate={(id) => void duplicate(id)}
                                            />
                                        </div>
                                    );
                                })}
                                {config.plugins.every(
                                    (p) => !metadataMap.get(p.instanceId)?.parameters?.length,
                                ) && (
                                    <div className="text-sm text-[var(--text-3)]">无可配置参数</div>
                                )}
                            </>
                        )}

                        {section === "accounts" && (
                            <>
                                <div className="set-group-label">已配置的服务</div>
                                {config.plugins.length === 0 ? (
                                    <div className="text-sm text-[var(--text-3)]">
                                        暂无已配置的服务
                                    </div>
                                ) : (
                                    config.plugins.map((p) => {
                                        const plugin = plugins.find(
                                            (pl) => pl.instanceId === p.instanceId,
                                        );
                                        const isEnabled = plugin?.enabled ?? true;
                                        const statusDot =
                                            plugin?.snapshot.status === "failed"
                                                ? "off"
                                                : isEnabled
                                                  ? ""
                                                  : "off";
                                        return (
                                            <div className="acct-group" key={p.instanceId}>
                                                <div className="acct-group-head">
                                                    <span
                                                        className="ar-dot"
                                                        style={
                                                            !isEnabled
                                                                ? {
                                                                      background: "var(--text-3)",
                                                                      boxShadow: "none",
                                                                  }
                                                                : undefined
                                                        }
                                                    />
                                                    <span className="agh-name">{p.name}</span>
                                                </div>
                                                <div className="acct-rows">
                                                    <div
                                                        className={
                                                            "acct-row" + (!isEnabled ? " off" : "")
                                                        }
                                                    >
                                                        <span
                                                            className="ar-name"
                                                            style={{
                                                                fontSize: 12.5,
                                                                color: "var(--text-3)",
                                                            }}
                                                        >
                                                            {plugin?.snapshot.status === "failed"
                                                                ? "刷新失败"
                                                                : plugin?.snapshot.status ===
                                                                    "ready"
                                                                  ? "运行中"
                                                                  : "等待中"}
                                                        </span>
                                                        {statusDot === "off" && (
                                                            <span className="ar-off">已关闭</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </>
                        )}

                        {section === "appearance" && (
                            <>
                                <div className="set-group-label">主题</div>
                                <div className="set-row">
                                    <div>
                                        <div className="sr-title">配色方案</div>
                                        <div className="sr-sub">切换浅色或深色主题</div>
                                    </div>
                                    <div className="sr-ctrl">
                                        <div className="set-seg">
                                            {[
                                                ["light", "浅色"],
                                                ["dark", "深色"],
                                            ].map(([k, lb]) => (
                                                <button
                                                    key={k}
                                                    className={k === "light" ? "on" : ""}
                                                >
                                                    {lb}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {section === "about" && (
                            <>
                                <div className="about-app">
                                    <div className="aa-badge">
                                        <img src={logo} alt="" style={{ width: 40, height: 40 }} />
                                    </div>
                                    <div className="aa-name">OmniUsage</div>
                                    <div className="aa-ver">版本 1.0.0</div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
