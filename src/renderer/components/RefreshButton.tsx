import { RefreshCw } from "lucide-react";
import { Button } from "./Button";
import { useState, useCallback } from "react";

export function RefreshButton({
    onClick,
    ...rest
}: {
    onClick: () => Promise<void>;
    "data-testid"?: string;
}) {
    const [spinning, setSpinning] = useState(false);
    const [failed, setFailed] = useState(false);

    const handleClick = useCallback(() => {
        if (spinning) return;
        setSpinning(true);
        setFailed(false);
        void onClick()
            .catch(() => {
                setFailed(true);
                setTimeout(() => {
                    setFailed(false);
                }, 3000);
            })
            .finally(() => {
                setSpinning(false);
            });
    }, [onClick, spinning]);

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleClick}
            aria-label="刷新"
            disabled={spinning}
            className={failed ? "text-[var(--destructive)]" : ""}
            {...rest}
        >
            <RefreshCw className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
        </Button>
    );
}
