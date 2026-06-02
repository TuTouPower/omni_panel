/* panel-app.jsx — root for the standalone settings window */

const PANEL_DEFAULTS = /*EDITMODE-BEGIN*/{
  "mode": "normal",
  "theme": "light",
  "accent": "#3d7afd"
}/*EDITMODE-END*/;

function PanelApp() {
  const [t, setTweak] = useTweaks(PANEL_DEFAULTS);

  const effTheme = t.theme === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : t.theme;
  React.useEffect(() => { document.documentElement.setAttribute('data-theme', effTheme); }, [effTheme]);
  React.useEffect(() => {
    if (t.accent === '#3d7afd') document.documentElement.style.removeProperty('--blue');
    else document.documentElement.style.setProperty('--blue', t.accent);
  }, [t.accent]);

  return (
    <div className="sp-stage">
      <SettingsPanel
        mode={t.mode}
        theme={t.theme} onTheme={(v) => setTweak('theme', v)}
        accent={t.accent} onAccent={(v) => setTweak('accent', v)}
        onBack={window.opener ? () => window.close() : undefined} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="用户类型" />
        <TweakRadio label="账号来源" value={t.mode} options={[
          { value: 'normal', label: '普通用户' }, { value: 'cpa', label: 'CPA 用户' }]}
          onChange={(v) => setTweak('mode', v)} />
        <TweakSection label="主题" />
        <TweakRadio label="配色" value={t.theme} options={[
          { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }, { value: 'system', label: '系统' }]}
          onChange={(v) => setTweak('theme', v)} />
        <TweakColor label="强调色" value={t.accent}
          options={['#3d7afd', '#6f5cf6', '#0ea5a3', '#f5772f', '#e23744']}
          onChange={(v) => setTweak('accent', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PanelApp />);
