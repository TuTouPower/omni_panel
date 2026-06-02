/* app.jsx — OmniUsage prototype root */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "#3d7afd",
  "demoState": "default"
}/*EDITMODE-END*/;

const DEMO_LABELS = [
  { value: 'default', label: '默认 · 数据正常' },
  { value: 'limit', label: '接近 / 达到限制' },
  { value: 'refreshing', label: '刷新中' },
  { value: 'error', label: '刷新失败 / 网络异常' },
  { value: 'auth', label: '凭证失效 / 未登录' },
  { value: 'empty', label: '无数据空状态' },
];

function limitTransform(items, i) {
  if (i === 0) return { ...items, h5: 88, week: 100 };
  if (i === 1) return { ...items, week: 92 };
  return items;
}

/* average of a vendor's accounts — shown as the multi-account 「平均」 row */
function vendorAvg(v) {
  const n = v.accounts.length;
  const avg = (k) => Math.round(v.accounts.reduce((s, a) => s + a[k], 0) / n);
  return { h5: avg('h5'), week: avg('week'), r5: v.accounts[0].r5, rw: v.accounts[0].rw };
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const demo = t.demoState;

  const [view, setView] = React.useState('monitor');     // monitor | settings
  const [tab, setTab] = React.useState('overview');       // overview | vendorId
  const [winOpen, setWinOpen] = React.useState(true);
  const [autostart, setAutostart] = React.useState(true);
  const [pauseRefresh, setPauseRefresh] = React.useState(false);

  const [refreshing, setRefreshing] = React.useState(() => new Set());
  const [overrides, setOverrides] = React.useState({});   // key -> "刚刚"
  const [footerUpdated, setFooterUpdated] = React.useState('2 分钟前');
  const [globalSpin, setGlobalSpin] = React.useState(false);

  /* card management state */
  const [collapsed, setCollapsed] = React.useState(() => new Set());  // card keys
  const [disabledSet, setDisabledSet] = React.useState(() => new Set());
  const [removed, setRemoved] = React.useState(() => new Set());
  const [menuKey, setMenuKey] = React.useState(null);
  const [order, setOrder] = React.useState({});           // scope -> [ids]
  const [tokCollapsed, setTokCollapsed] = React.useState(false);
  const [l2set, setL2set] = React.useState(() => new Set());   // overview: vendors with account detail open
  const [armed, setArmed] = React.useState(null);         // id armed for drag (current scope)
  const [dragId, setDragId] = React.useState(null);
  const [overId, setOverId] = React.useState(null);

  const toggleSet = (setter, key) => setter((prev) => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
  });

  /* theme + accent on root */
  const effTheme = t.theme === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : t.theme;
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', effTheme);
  }, [effTheme]);
  React.useEffect(() => {
    if (t.accent === '#3d7afd') document.documentElement.style.removeProperty('--blue');
    else document.documentElement.style.setProperty('--blue', t.accent);
  }, [t.accent]);

  /* refresh helpers */
  const refreshKeys = (keys, after) => {
    if (demo === 'refreshing') return;
    setRefreshing((prev) => { const n = new Set(prev); keys.forEach((k) => n.add(k)); return n; });
    setTimeout(() => {
      setRefreshing((prev) => { const n = new Set(prev); keys.forEach((k) => n.delete(k)); return n; });
      setOverrides((prev) => { const n = { ...prev }; keys.forEach((k) => n[k] = '刚刚'); return n; });
      after && after();
    }, 1100 + Math.random() * 500);
  };

  const currentVendor = tab === 'overview' ? null : VENDORS.find((v) => v.id === tab);

  /* ---- content-driven window height ----
     Mirrors the desktop mechanism: a ResizeObserver watches the body's
     real content box, we measure inside requestAnimationFrame, clamp to
     [MIN_H, 75% of the screen work-area] and lock the window to that exact
     height. Collapsing a card removes its DOM (see UsageCard) → the content
     box shrinks → observer fires → the window shrinks. Expanding reverses it. */
  const winRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const innerRef = React.useRef(null);
  const lastH = React.useRef(-1);
  const MIN_H = 160;

  React.useLayoutEffect(() => {
    const win = winRef.current;
    if (!win || !winOpen) return;

    // Settings is a stable two-column screen — give it a fixed comfortable height.
    if (view === 'settings') {
      lastH.current = -1;
      win.style.height = Math.min(704, Math.round(window.innerHeight * 0.86)) + 'px';
      return;
    }

    const scroll = scrollRef.current, inner = innerRef.current;
    if (!scroll || !inner) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const winTop = win.getBoundingClientRect().top;
      const chrome = scroll.getBoundingClientRect().top - winTop;   // titlebar + tabs + dividers + top border
      const content = scroll.scrollHeight;                           // body padding + cards/chart (gap, no margin-collapse)
      const maxH = Math.round(window.innerHeight * 0.75);            // 75% screen cap — never swallow the screen
      const target = Math.max(MIN_H, Math.min(Math.round(chrome + content + 1), maxH));
      if (Math.abs(target - lastH.current) < 1) return;              // 1px debounce, no time delay → instant feel
      lastH.current = target;
      win.style.height = target + 'px';
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    const ro = new ResizeObserver(schedule);
    ro.observe(inner);
    window.addEventListener('resize', schedule);
    schedule();
    return () => { ro.disconnect(); window.removeEventListener('resize', schedule); if (raf) cancelAnimationFrame(raf); };
  }, [view, winOpen, tab]);

  const visibleKeys = () => tab === 'overview'
    ? VENDORS.map((v) => 'v:' + v.id)
    : currentVendor.accounts.map((a) => 'a:' + currentVendor.id + ':' + a.key);

  const refreshAll = () => {
    setGlobalSpin(true);
    setTimeout(() => setGlobalSpin(false), 1200);
    setCollapsed(new Set());   // new operation → clear manual collapses so fresh results show (window re-expands)
    setTokCollapsed(false);
    refreshKeys(visibleKeys(), () => setFooterUpdated('刚刚'));
  };

  const getUpdated = (key, orig) => overrides[key] || orig;

  /* ---- card ordering + drag ---- */
  const scopeBaseIds = tab === 'overview'
    ? VENDORS.map((v) => v.id)
    : (currentVendor ? currentVendor.accounts.map((a) => a.key) : []);
  const orderedIds = (order[tab] || scopeBaseIds)
    .filter((id) => scopeBaseIds.includes(id) && !removed.has(tab + ':' + id));
  const missingIds = scopeBaseIds.filter((id) => !orderedIds.includes(id) && !removed.has(tab + ':' + id));
  const finalIds = orderedIds.concat(missingIds);

  const reorder = (from, to) => {
    if (from === to) return;
    setOrder((prev) => {
      const cur = (prev[tab] || scopeBaseIds).slice();
      const fi = cur.indexOf(from), ti = cur.indexOf(to);
      if (fi < 0 || ti < 0) return prev;
      cur.splice(fi, 1); cur.splice(ti, 0, from);
      return { ...prev, [tab]: cur };
    });
  };
  const dragProps = (id) => ({
    canDrag: armed === id,
    dragging: dragId === id,
    dragOver: overId === id && dragId !== id,
    onHandleDown: () => setArmed(id),
    onDragStart: () => setDragId(id),
    onDragEnter: () => { if (dragId && dragId !== id) { reorder(dragId, id); setOverId(id); } },
    onDragEnd: () => { setDragId(null); setArmed(null); setOverId(null); },
  });
  const cardActions = (cardKey, scopeId) => ({
    collapsed: collapsed.has(cardKey),
    onToggleCollapse: () => toggleSet(setCollapsed, cardKey),
    disabled: disabledSet.has(cardKey),
    onToggleDisable: () => toggleSet(setDisabledSet, cardKey),
    menuOpen: menuKey === cardKey,
    onToggleMenu: () => setMenuKey(menuKey === cardKey ? null : cardKey),
    onCloseMenu: () => setMenuKey(null),
    onEdit: () => {},
    onDelete: () => setRemoved((prev) => new Set(prev).add(tab + ':' + scopeId)),
  });

  /* status pill */
  const status = demo === 'error' ? { dot: 'red', label: '网络异常' }
    : demo === 'auth' ? { dot: 'amber', label: '凭证失效' }
    : demo === 'limit' ? { dot: 'amber', label: '接近限制' }
    : demo === 'empty' ? { dot: 'amber', label: '尚未配置' }
    : { dot: 'green', label: '数据正常' };

  /* ---- monitor body ---- */
  const renderCards = () => {
    if (demo === 'empty') {
      return (
        <div className="empty">
          <div className="empty-ic"><Icon name="inbox" size={30} strokeWidth={1.6} /></div>
          <div className="empty-title">还没有添加任何服务</div>
          <div className="empty-sub">添加你的第一个 AI 服务账号，即可在这里实时查看用量限制与 Token 趋势。</div>
          <button className="btn-primary" onClick={() => setView('settings')}>
            <Icon name="plus" size={15} color="#fff" />添加服务
          </button>
        </div>
      );
    }
    const items = [];
    if (demo === 'error') {
      items.push(<div className="net-banner" key="nb">
        <Icon name="cloud_off" size={18} /><span>网络连接异常，部分数据可能不是最新</span>
        <span className="nb-action" onClick={refreshAll}>重新连接</span>
      </div>);
    }

    if (tab === 'overview') {
      finalIds.forEach((id) => {
        const v = VENDORS.find((x) => x.id === id);
        if (!v) return;
        const i = VENDORS.indexOf(v);
        const key = 'v:' + v.id;
        if (disabledSet.has(key)) return;   // closed cards live only in settings
        const multi = v.accounts.length > 1;
        const base = multi ? vendorAvg(v) : v.accounts[0];
        const d = demo === 'limit' ? limitTransform(base, i) : base;
        items.push(<UsageCard key={key} vendorId={v.id} name={v.name}
          accounts={v.accounts}
          l2open={l2set.has(v.id)} onToggleL2={() => toggleSet(setL2set, v.id)}
          updated={getUpdated(key, v.updated)} h5={d.h5} week={d.week} r5={d.r5} rw={d.rw}
          state={demo === 'error' ? 'error' : demo === 'auth' ? 'auth' : 'normal'}
          refreshing={refreshing.has(key) || demo === 'refreshing'}
          limitMode={demo === 'limit'}
          onRefresh={() => refreshKeys([key])}
          {...dragProps(v.id)} {...cardActions(key, v.id)} />);
      });
    } else {
      finalIds.forEach((id) => {
        const a = currentVendor.accounts.find((x) => x.key === id);
        if (!a) return;
        const i = currentVendor.accounts.indexOf(a);
        const key = 'a:' + currentVendor.id + ':' + a.key;
        if (disabledSet.has(key) || disabledSet.has('v:' + currentVendor.id)) return;   // closed cards live only in settings
        const d = demo === 'limit' ? limitTransform(a, i) : a;
        items.push(<UsageCard key={key} name={a.name}
          updated={getUpdated(key, a.updated)} h5={d.h5} week={d.week} r5={a.r5} rw={a.rw}
          state={demo === 'error' ? 'error' : demo === 'auth' ? 'auth' : 'normal'}
          refreshing={refreshing.has(key) || demo === 'refreshing'}
          limitMode={demo === 'limit'}
          onRefresh={() => refreshKeys([key])}
          {...dragProps(a.key)} {...cardActions(key, a.key)} />);
      });
    }
    return items;
  };

  const chartData = tab === 'overview' ? CHART : vendorChart(tab);
  const totals = TOTALS[tab] || TOTALS.overview;
  const showChart = demo !== 'empty';

  /* tabs */
  const tabsRef = React.useRef(null);
  React.useEffect(() => {
    // keep active vendor tab in view when switching
    const el = tabsRef.current && tabsRef.current.querySelector('.tab.active');
    if (el && el.scrollIntoView) {
      const wrap = tabsRef.current;
      wrap.scrollLeft = Math.max(0, el.offsetLeft - 70);
    }
  }, [tab]);

  const openCtx = (e) => { e.preventDefault(); };

  return (
    <div className="desktop">
      {/* window */}
      {winOpen && (
          <div className="window" ref={winRef}>
            {view === 'settings' ? (
              <Settings onBack={() => setView('monitor')}
                theme={t.theme} onTheme={(v) => setTweak('theme', v)}
                accent={t.accent} onAccent={(v) => setTweak('accent', v)}
                autostart={autostart} onAutostart={setAutostart}
                pauseRefresh={pauseRefresh} onPauseRefresh={setPauseRefresh}
                disabledSet={disabledSet} onToggleDisabled={(key) => toggleSet(setDisabledSet, key)} />
            ) : (
              <>
                <div className="titlebar" onContextMenu={openCtx}>
                  <img className="app-logo" src="logo.png" alt="OmniUsage" width="30" height="30" />
                  <span className="app-title">OmniUsage</span>
                  <div className="tb-actions">
                    <button className={'icon-btn' + (globalSpin ? ' spinning' : '')} title="刷新全部" onClick={refreshAll}>
                      <Icon name="refresh" size={18} />
                    </button>
                    <button className="icon-btn" title="设置" onClick={() => setView('settings')}>
                      <Icon name="gear" size={18} />
                    </button>
                  </div>
                </div>

                <div className="tabs-wrap">
                  <button className={'tab pinned' + (tab === 'overview' ? ' active' : '')} onClick={() => setTab('overview')}>
                    <span className="tab-ic"><Icon name="grid_nav" size={22} color={tab === 'overview' ? 'var(--blue)' : 'var(--text-2)'} strokeWidth={1.8} /></span>
                    <span className="tab-lbl">总览</span>
                  </button>
                  <div className="tabs-pin-divider" />
                  <div className="tabs" ref={tabsRef}>
                    {VENDORS.map((v) => (
                      <Tab key={v.id} active={tab === v.id} onClick={() => setTab(v.id)}
                        vendorId={v.id} label={v.name} />
                    ))}
                  </div>
                  <div className="tabs-fade right" />
                </div>
                <div className="titlebar-divider" />

                <div className="scroll" ref={scrollRef}>
                  <div className="scroll-inner" ref={innerRef}>
                    {renderCards()}
                    {showChart && <TokenPanel chartData={chartData} totals={totals}
                      collapsed={tokCollapsed} onToggleCollapse={() => setTokCollapsed((v) => !v)}
                      onHandleDown={() => {}} />}
                  </div>
                </div>
              </>
            )}
          </div>
      )}

      {/* tray — its own independent window, shown alongside the main panel */}
      <TrayWindow
        onOpenPanel={() => { setWinOpen(true); setView('monitor'); }}
        onRefreshAll={() => { setWinOpen(true); refreshAll(); }}
        onSettings={() => { setWinOpen(true); setView('settings'); }}
        autostart={autostart} onAutostart={setAutostart}
        pauseRefresh={pauseRefresh} onPauseRefresh={setPauseRefresh}
        onQuit={() => setWinOpen(false)} />

      {/* quit placeholder */}
      {!winOpen && (
        <div className="quit-card">
          <img className="app-logo" src="logo.png" alt="" style={{ width: 52, height: 52, marginBottom: 4 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>OmniUsage 已退出</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>后台监控已停止</div>
          <button className="btn-primary" onClick={() => { setWinOpen(true); setView('monitor'); }}>
            <Icon name="open" size={15} color="#fff" />重新打开
          </button>
        </div>
      )}

      {/* tweaks */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="主题" />
        <TweakRadio label="配色" value={t.theme} options={[
          { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }, { value: 'system', label: '系统' }]}
          onChange={(v) => setTweak('theme', v)} />
        <TweakColor label="强调色" value={t.accent}
          options={['#3d7afd', '#6f5cf6', '#0ea5a3', '#f5772f', '#e23744']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="状态预览" />
        <TweakSelect label="演示状态" value={t.demoState} options={DEMO_LABELS}
          onChange={(v) => setTweak('demoState', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
