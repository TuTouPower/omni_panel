import { Icon } from "../../components/Icon";
import { Button } from "../../components/ui/Button";

interface EmptyStateProps {
    is_live: boolean;
    onAddService: () => void;
}

export function EmptyState(props: EmptyStateProps) {
    const { is_live, onAddService } = props;
    return (
        <div className="flex flex-col items-center justify-center gap-[5px] px-8 py-[70px] text-center">
            <div className="mb-3.5 flex h-16 w-16 items-center justify-center rounded-[18px] bg-[var(--color-surface-raised)] text-[var(--color-on-surface-muted)]">
                <Icon name="inbox" size={30} strokeWidth={1.6} />
            </div>
            <div className="text-[15px] font-semibold text-[var(--color-on-surface)]">
                还没有添加任何服务
            </div>
            <div className="max-w-[240px] text-[13px] leading-relaxed text-[var(--color-on-surface-muted)]">
                添加你的第一个 AI 服务账号，即可在这里实时查看用量限制与 Token 趋势。
            </div>
            <Button variant="primary" onClick={is_live ? onAddService : undefined}>
                <Icon name="plus" size={15} />
                添加服务
            </Button>
        </div>
    );
}
