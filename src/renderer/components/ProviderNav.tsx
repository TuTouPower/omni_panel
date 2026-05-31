import type { UsageProvider } from "../../shared/schemas/plugin-output";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import { VendorMark } from "./Icon";

interface ProviderNavProps {
    activeTab: UsageProvider | "overview";
    visibleProviders: UsageProvider[];
    onChange: (tab: UsageProvider | "overview") => void;
}

export function ProviderNav({ activeTab, visibleProviders, onChange }: ProviderNavProps) {
    return (
        <>
            <button
                className={"tab" + (activeTab === "overview" ? " active" : "")}
                data-tab="overview"
                onClick={() => {
                    onChange("overview");
                }}
            >
                <span className="tab-ic">
                    <VendorMark id="overview" size={22} />
                </span>
                <span className="tab-lbl">总览</span>
            </button>
            {visibleProviders.map((provider) => (
                <button
                    key={provider}
                    className={"tab" + (activeTab === provider ? " active" : "")}
                    data-tab={provider}
                    onClick={() => {
                        onChange(provider);
                    }}
                >
                    <span className="tab-ic">
                        <VendorMark id={provider} size={22} />
                    </span>
                    <span className="tab-lbl">{PROVIDER_LABELS[provider]}</span>
                </button>
            ))}
        </>
    );
}
