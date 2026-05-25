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

    const handleClick = useCallback(() => {
        setSpinning(true);
        void onClick().finally(() => {
            setSpinning(false);
        });
    }, [onClick]);

    return (
        <Button variant="ghost" size="icon" onClick={handleClick} aria-label="刷新" {...rest}>
            <RefreshCw className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
        </Button>
    );
}
