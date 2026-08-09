import { Switch } from "../ui/Switch";

export function Toggle({
    on,
    onClick,
    disabled,
}: {
    on: boolean;
    onClick?: () => void;
    disabled?: boolean;
}) {
    return (
        <Switch
            checked={on}
            disabled={disabled}
            data-on={on ? "1" : "0"}
            onChange={() => {
                onClick?.();
            }}
        />
    );
}
