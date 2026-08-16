import { Icon } from "../../components/Icon";
import { Button } from "../../components/ui/Button";
import { is_web } from "../../lib/is-web";

interface EmptyStateProps {
    is_live: boolean;
    onAddService: () => void;
}

export function EmptyState(props: EmptyStateProps) {
    const { is_live, onAddService } = props;
    return (
        <div className="flex flex-col items-center justify-center gap-1 px-8 py-18 text-center">
            <div className="mb-3.5 flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--color-surface-raised)] text-[var(--color-on-surface-muted)]">
                <Icon name="inbox" size={30} strokeWidth={1.6} />
            </div>
            <div className="text-[length:var(--text-title-sm)] font-semibold text-[var(--color-on-surface)]">
                还没有添加任何服务
            </div>
            <div className="max-w-[240px] text-[length:var(--text-body-md)] leading-relaxed text-[var(--color-on-surface-muted)]">
                添加你的第一个 AI 服务账号，即可在这里实时查看用量限制与 Token 趋势。
            </div>
            {is_web() ? (
                // t311：web 端「添加服务」为原生 `<a href="#setting">`（左键进设置，
                // 中键/Ctrl+Click 由浏览器新开标签页）；t420 走 Button as-link。
                <Button as="a" href="#setting" variant="primary">
                    <Icon name="plus" size={15} />
                    添加服务
                </Button>
            ) : (
                <Button variant="primary" onClick={is_live ? onAddService : undefined}>
                    <Icon name="plus" size={15} />
                    添加服务
                </Button>
            )}
        </div>
    );
}
