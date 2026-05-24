interface ErrorBannerProps {
    message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
    return (
        <div className="rounded-[var(--radius)] border border-[var(--destructive)] bg-[var(--destructive)]/10 px-4 py-2 text-sm text-[var(--destructive)]">
            {message}
        </div>
    );
}
