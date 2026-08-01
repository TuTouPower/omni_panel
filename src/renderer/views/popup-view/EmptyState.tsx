import { Icon } from "../../components/Icon";

interface EmptyStateProps {
    is_live: boolean;
    onAddService: () => void;
}

export function EmptyState(props: EmptyStateProps) {
    const { is_live, onAddService } = props;
    return (
        <div className="empty">
            <div className="empty-ic">
                <Icon name="inbox" size={30} strokeWidth={1.6} />
            </div>
            <div className="empty-title">还没有添加任何服务</div>
            <div className="empty-sub">
                添加你的第一个 AI 服务账号，即可在这里实时查看用量限制与 Token 趋势。
            </div>
            <button className="btn-primary" onClick={is_live ? onAddService : undefined}>
                <Icon name="plus" size={15} color="#fff" />
                添加服务
            </button>
        </div>
    );
}
