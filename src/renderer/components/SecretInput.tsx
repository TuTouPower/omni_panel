import { SecretInput as UiSecretInput } from "./ui/SecretInput";

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
    return (
        <UiSecretInput
            id={id}
            name={name}
            value={value}
            onChange={(e) => {
                onChange(e.target.value);
            }}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            className={className}
            aria-label={aria_label}
        />
    );
}
