import type { PluginParameterMetadata } from "../../shared/schemas/plugin-metadata";

interface SettingsFormProps {
    instanceId: string;
    name: string;
    parameters: PluginParameterMetadata[];
    values: Record<string, string>;
    onSave: (
        instanceId: string,
        nonSecrets: Record<string, string>,
        secrets: Record<string, string>,
    ) => Promise<void>;
    onDuplicate?: (instanceId: string) => void;
}

export function SettingsForm({
    instanceId,
    name,
    parameters,
    values,
    onSave,
    onDuplicate,
}: SettingsFormProps) {
    const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const nonSecrets: Record<string, string> = {};
        const secrets: Record<string, string> = {};

        for (const param of parameters) {
            const val = formData.get(param.name) as string | null;
            if (val === null) continue;
            if (param.type === "secret") {
                if (val !== "***" && val !== "") {
                    secrets[param.name] = val;
                }
            } else {
                nonSecrets[param.name] = val;
            }
        }

        void onSave(instanceId, nonSecrets, secrets);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="text-sm font-semibold">{name}</h3>
            {parameters.map((param) => (
                <label key={param.name} className="block space-y-1">
                    <span className="text-xs text-[var(--muted-foreground)]">{param.label}</span>
                    {param.type === "boolean" ? (
                        <input
                            type="checkbox"
                            name={param.name}
                            defaultChecked={values[param.name] === "true"}
                            className="h-4 w-4"
                        />
                    ) : (
                        <input
                            type={
                                param.type === "secret"
                                    ? "password"
                                    : param.type === "integer"
                                      ? "number"
                                      : "text"
                            }
                            name={param.name}
                            defaultValue={
                                param.type === "secret"
                                    ? "***"
                                    : (values[param.name] ?? param.defaultValue ?? "")
                            }
                            placeholder={param.placeholder}
                            required={param.required}
                            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                        />
                    )}
                </label>
            ))}
            <div className="flex gap-2">
                <button
                    type="submit"
                    className="rounded-[var(--radius)] bg-[var(--primary)] px-4 py-1.5 text-sm text-[var(--primary-foreground)]"
                >
                    保存
                </button>
                {onDuplicate && (
                    <button
                        type="button"
                        onClick={() => {
                            onDuplicate(instanceId);
                        }}
                        className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-1.5 text-sm"
                    >
                        复制
                    </button>
                )}
            </div>
        </form>
    );
}
