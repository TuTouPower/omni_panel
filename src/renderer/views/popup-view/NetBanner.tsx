import { Icon } from "../../components/Icon";

interface NetBannerProps {
    is_live: boolean;
    onRefreshAll: () => void;
}

export function NetBanner(props: NetBannerProps) {
    const { is_live, onRefreshAll } = props;
    return (
        <div className="flex items-center gap-2 rounded-md bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] px-3 py-2 text-body-sm text-[var(--color-warning)]">
            <Icon name="cloud_off" size={18} />
            <span>网络连接异常，部分数据可能不是最新</span>
            <span
                className="ml-auto cursor-pointer text-[var(--color-on-surface)] underline"
                onClick={is_live ? onRefreshAll : undefined}
            >
                重新连接
            </span>
        </div>
    );
}
