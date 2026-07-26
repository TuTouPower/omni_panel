import { is_web } from "../lib/is-web";

export function TitleBar() {
    return (
        <div className="settings-titlebar">
            <span className="st-title">设置</span>
            {!is_web() && (
                <div className="st-controls">
                    <button
                        className="st-btn"
                        onClick={() => {
                            window.usageboard.settings.minimize();
                        }}
                        title="最小化"
                        type="button"
                    >
                        <svg width="10" height="1" viewBox="0 0 10 1">
                            <rect width="10" height="1" fill="currentColor" />
                        </svg>
                    </button>
                    <button
                        className="st-btn"
                        onClick={() => {
                            window.usageboard.settings.maximize();
                        }}
                        title="最大化"
                        type="button"
                    >
                        <svg width="10" height="10" viewBox="0 0 10 10">
                            <rect
                                x="0.5"
                                y="0.5"
                                width="9"
                                height="9"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1"
                            />
                        </svg>
                    </button>
                    <button
                        className="st-btn close"
                        onClick={() => {
                            window.usageboard.settings.close();
                        }}
                        title="关闭"
                        type="button"
                    >
                        <svg width="10" height="10" viewBox="0 0 10 10">
                            <path
                                d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5"
                                stroke="currentColor"
                                strokeWidth="1.2"
                            />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}
