import { Icon } from "../../components/Icon";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";

interface NetBannerProps {
    is_live: boolean;
    onRefreshAll: () => void;
}

export function NetBanner(props: NetBannerProps) {
    const { is_live, onRefreshAll } = props;
    return (
        <Alert tone="warning" className="flex items-center gap-2">
            <Icon name="cloud_off" size={18} />
            <span>网络连接异常，部分数据可能不是最新</span>
            <Button
                variant="text"
                className="ml-auto p-0 font-normal text-[var(--color-on-surface)] underline hover:bg-transparent"
                onClick={is_live ? onRefreshAll : undefined}
            >
                重新连接
            </Button>
        </Alert>
    );
}
