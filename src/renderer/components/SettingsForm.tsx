import type { PluginParameterMetadata } from "../../shared/schemas/plugin-metadata";

interface SettingsFormProps {
    stateId: string;
    name: string;
    parameters: PluginParameterMetadata[];
    values: Record<string, string>;
    onSave: (
        stateId: string,
        nonSecrets: Record<string, string>,
        secrets: Record<string, string>,
    ) => Promise<void>;
}

export function SettingsForm({ stateId, name, parameters, values, onSave }: SettingsFormProps) {
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

        void onSave(stateId, nonSecrets, secrets);
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
            <button
                type="submit"
                className="rounded-[var(--radius)] bg-[var(--primary)] px-4 py-1.5 text-sm text-[var(--primary-foreground)]"
            >
                保存
            </button>
        </form>
    );
}
