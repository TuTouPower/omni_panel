/* tray.jsx — standalone system-tray window (its own panel, separate from the main window) */

function CtxItem({ icon, label, meta, checked, danger, onClick }) {
  return (
    <div className={'ctx-item' + (danger ? ' danger' : '')} onClick={onClick}>
      <span className="ci-ic"><Icon name={icon} size={16} strokeWidth={1.7} /></span>
      <span>{label}</span>
      {checked && <span className="ci-check"><Icon name="check" size={15} strokeWidth={2.2} /></span>}
      {meta && !checked && <span className="ci-meta">{meta}</span>}
    </div>
  );
}

function TrayWindow({ onOpenPanel, onRefreshAll, onSettings,
                      autostart, onAutostart, pauseRefresh, onPauseRefresh, onQuit }) {
  return (
    <div className="tray-window">
      <div className="tray-win-head">
        <img className="app-logo sm" src="logo.png" alt="" width="24" height="24" />
        <span>OmniUsage</span>
      </div>
      <div className="tray-menu-body">
        <CtxItem icon="open" label="打开主面板" onClick={onOpenPanel} />
        <CtxItem icon="refresh" label="立即刷新全部" onClick={onRefreshAll} />
        <div className="ctx-sep" />

        <CtxItem icon="pause" label="暂停自动刷新" checked={pauseRefresh}
          onClick={() => onPauseRefresh(!pauseRefresh)} />
        <CtxItem icon="power" label="开机自启" checked={autostart}
          onClick={() => onAutostart(!autostart)} />
        <div className="ctx-sep" />

        <CtxItem icon="gear" label="设置…" onClick={onSettings} />
        <CtxItem icon="download" label="检查更新" meta="v1.4.2" onClick={() => {}} />
        <div className="ctx-sep" />

        <CtxItem icon="exit" label="退出 OmniUsage" danger onClick={onQuit} />
      </div>
    </div>
  );
}

Object.assign(window, { TrayWindow });
