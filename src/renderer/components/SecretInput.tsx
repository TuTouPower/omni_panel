import { useState } from "react";
import { Icon } from "./Icon";

export interface SecretInputProps {
    id?: string | undefined;
    name: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string | undefined;
    required?: boolean | undefined;
    disabled?: boolean | undefined;
    className?: string | undefined;
    "aria-label"?: string | undefined;
}

export function SecretInput({
    id,
    name,
    value,
    onChange,
    placeholder,
    required,
    disabled,
    className,
    "aria-label": aria_label,
}: SecretInputProps) {
    const [show, set_show] = useState(false);

    return (
        <div className="ad-key">
            <input
                id={id}
                name={name}
                type={show ? "text" : "password"}
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                }}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                aria-label={aria_label}
                className={className ?? "ad-input mono"}
            />
            <button
                className="ad-eye"
                type="button"
                disabled={disabled}
                onClick={() => {
                    set_show((v) => !v);
                }}
                title={show ? "隐藏" : "显示"}
            >
                <Icon name={show ? "eye_off" : "eye"} size={16} />
            </button>
        </div>
    );
}
