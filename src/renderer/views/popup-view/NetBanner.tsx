import { Icon } from "../../components/Icon";

interface NetBannerProps {
    is_live: boolean;
    onRefreshAll: () => void;
}

export function NetBanner(props: NetBannerProps) {
    const { is_live, onRefreshAll } = props;
    return (
        <div className="net-banner">
            <Icon name="cloud_off" size={18} />
            <span>网络连接异常，部分数据可能不是最新</span>
            <span className="nb-action" onClick={is_live ? onRefreshAll : undefined}>
                重新连接
            </span>
        </div>
    );
}
