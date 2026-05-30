// Account-aware provider views.
//   PopupTab  — TAB MODE: pick a provider tab, swipe through its accounts
//               one at a time (pager). Usage bars only, no token stats.
//   PopupList — LIST MODE: each provider shows its FIRST account; expand to
//               reveal all of its accounts.
//   TrayMenu  — right-click system-tray context menu.
// Reuses UsageRow / UsageWindow / PopHeader / TabBar / PIcon / UBIcon.

// ---------- account header (inside a tab pane) ----------
function AcctHeader({ provider, acct }) {
  const Mark = PIcon[provider.key];
  const c = PROVIDER_TINT[provider.key] || "#6b7280";
  return (
    <div className="ub-ahead">
      <span className="ub-picon" style={{ background: `color-mix(in srgb, ${c} 13%, #fff)` }}>
        {Mark && <Mark />}
      </span>
      <span className="ub-aid">
        <span className="ub-aid-top">
          <span className="ub-pname">{acct.label}</span>
          {acct.plan && <span className="ub-badge" data-plan={acct.plan}>{acct.plan}</span>}
        </span>
        {acct.email && <span className="ub-amail">{acct.email}</span>}
      </span>
      <span className="ub-phead-r">
        <span className="ub-countdown">{acct.countdown}</span>
        <span className="ub-mini-refresh"><UBIcon.Refresh w={14} /></span>
      </span>
    </div>
  );
}

// ---------- pager (account 1 / N) ----------
function Pager({ idx, total, onSet }) {
  return (
    <div className="ub-pager">
      <button className="ub-pg-arrow" disabled={idx === 0} onClick={() => onSet(idx - 1)}>
        <UBIcon.ChevronLeft w={18} />
      </button>
      <span className="ub-dots">
        {Array.from({ length: total }).map((_, i) => (
          <i key={i} data-on={i === idx || undefined} onClick={() => onSet(i)} />
        ))}
      </span>
      <button className="ub-pg-arrow" disabled={idx === total - 1} onClick={() => onSet(idx + 1)}>
        <UBIcon.ChevronRight w={18} />
      </button>
      <span className="ub-pg-count">{idx + 1} / {total}</span>
    </div>
  );
}

// ===== TAB MODE =====
function PopupTab({ providerKey, initial = 0 }) {
  const p = ACCT_PROVIDERS[providerKey];
  const total = p.accounts.length;
  const [idx, setIdx] = React.useState(initial);
  const clamp = (i) => setIdx(Math.max(0, Math.min(total - 1, i)));

  return (
    <UsageWindow>
      <PopHeader />
      <TabBar active={providerKey} />
      <div className="ub-divider" />
      <div className="ub-body ub-tabbody">
        <div className="ub-pane-vp">
          <div className="ub-pane-track" style={{ transform: `translateX(-${idx * 100}%)` }}>
            {p.accounts.map((a) => (
              <div className="ub-pane" key={a.id}>
                <AcctHeader provider={p} acct={a} />
                <div className="ub-rows">
                  {a.rows.map((r, i) => <UsageRow key={i} row={r} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
        {total > 1 && <Pager idx={idx} total={total} onSet={clamp} />}
      </div>
    </UsageWindow>
  );
}

// ===== LIST MODE =====
function ListProvider({ provider, expanded, onToggle }) {
  const Mark = PIcon[provider.key];
  const c = PROVIDER_TINT[provider.key] || "#6b7280";
  const multi = provider.accounts.length > 1;
  const shown = expanded ? provider.accounts : provider.accounts.slice(0, 1);

  return (
    <div className="ub-pcard is-listcard ub-lcard">
      <div className="ub-lhead">
        <span className="ub-picon" style={{ background: `color-mix(in srgb, ${c} 13%, #fff)` }}>
          {Mark && <Mark />}
        </span>
        <span className="ub-pname">{provider.name}</span>
        {multi && <span className="ub-acct-count">{provider.accounts.length} 个账号</span>}
        <span className="ub-phead-r">
          <span className="ub-mini-refresh"><UBIcon.Refresh w={14} /></span>
        </span>
      </div>

      <div className="ub-laccts">
        {shown.map((acct) => (
          <div className="ub-lacct" key={acct.id}>
            <div className="ub-lacct-id">
              <span className="ub-aname">{acct.label}</span>
              {acct.plan && <span className="ub-badge" data-plan={acct.plan}>{acct.plan}</span>}
              {acct.email && <span className="ub-amail">{acct.email}</span>}
              <span className="ub-lacct-cd">{acct.countdown}</span>
            </div>
            <div className="ub-rows">
              {acct.rows.map((r, i) => <UsageRow key={i} row={r} />)}
            </div>
          </div>
        ))}
      </div>

      {multi && (
        <div className="ub-expand" onClick={onToggle}>
          {expanded ? (
            <React.Fragment><UBIcon.ChevronUp /><span className="ub-expand-tx">收起</span></React.Fragment>
          ) : (
            <React.Fragment><UBIcon.ChevronDown /><span className="ub-expand-tx">展开其余 {provider.accounts.length - 1} 个账号</span></React.Fragment>
          )}
        </div>
      )}
    </div>
  );
}

function PopupList({ order = ACCT_TAB_ORDER, initialExpanded = [] }) {
  const [exp, setExp] = React.useState(new Set(initialExpanded));
  const toggle = (k) =>
    setExp((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  return (
    <UsageWindow>
      <PopHeader />
      <div className="ub-divider" />
      <div className="ub-body" style={{ paddingTop: 14 }}>
        {order.map((k) => (
          <ListProvider key={k} provider={ACCT_PROVIDERS[k]} expanded={exp.has(k)} onToggle={() => toggle(k)} />
        ))}
      </div>
    </UsageWindow>
  );
}

// ===== SYSTEM-TRAY RIGHT-CLICK MENU =====
function TrayItem({ icon, label, hint, sub, active, danger, onClick }) {
  return (
    <div className={"tray-item" + (active ? " is-active" : "") + (danger ? " is-danger" : "")} onClick={onClick}>
      <span className="tray-ic">{icon}</span>
      <span className="tray-label">{label}</span>
      {hint && <span className="tray-hint">{hint}</span>}
      {sub && <span className="tray-caret"><UBIcon.ChevronRight w={16} /></span>}
    </div>
  );
}

function TrayMenu({ submenu = true }) {
  return (
    <div className="tray-scene">
      {/* faux system menu bar — UsageBoard icon was just right-clicked */}
      <div className="tray-bar">
        <span className="tray-sysdots"><i /><i /><i /></span>
        <span className="tray-bar-r">
          <span className="tray-sys-ic" />
          <span className="tray-sys-ic" />
          <span className="tray-trayicon" title="UsageBoard">
            <span className="ub-logo"><i /><i /><i /></span>
          </span>
        </span>
      </div>

      <div className="tray-menu">
        <TrayItem icon={<UBIcon.TabView w={16} />} label="用量标签" />
        <TrayItem icon={<UBIcon.ListView w={16} />} label="用量列表" />
        <div className="tray-sep" />
        <TrayItem icon={<UBIcon.Refresh w={16} />} label="全部刷新" hint="⌘R" />
        <TrayItem icon={<UBIcon.Refresh w={16} />} label="刷新指定服务" sub active={submenu} />
        <div className="tray-sep" />
        <TrayItem icon={<UBIcon.Restart w={16} />} label="重启" />
        <TrayItem icon={<UBIcon.Power w={16} />} label="退出 UsageBoard" hint="⌘Q" danger />
      </div>

      {submenu && (
        <div className="tray-submenu">
          {ACCT_TAB_ORDER.map((k) => {
            const p = ACCT_PROVIDERS[k];
            const Mark = PIcon[k];
            const c = PROVIDER_TINT[k] || "#6b7280";
            return (
              <div className="tray-item" key={k}>
                <span className="tray-ic tray-pic" style={{ background: `color-mix(in srgb, ${c} 14%, #fff)` }}>
                  {Mark && <Mark />}
                </span>
                <span className="tray-label">{p.name}</span>
                {p.accounts.length > 1 && <span className="tray-subcount">{p.accounts.length}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

window.PopupTab = PopupTab;
window.PopupList = PopupList;
window.TrayMenu = TrayMenu;
