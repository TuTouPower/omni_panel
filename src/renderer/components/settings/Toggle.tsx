export function Toggle({
    on,
    onClick,
    disabled,
}: {
    on: boolean;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
}) {
    return (
        <button
            className="sw"
            data-on={on ? "1" : "0"}
            disabled={disabled}
            onClick={disabled ? undefined : onClick}
            type="button"
        >
            <i />
        </button>
    );
}
