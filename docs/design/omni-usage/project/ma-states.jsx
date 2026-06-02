/* ma-states.jsx — OmniUsage multi-account expand: 3 state diagrams on a canvas.
   Reuses Icon / VendorMark (icons.jsx), BarRow / TokenPanel / Tab (components.jsx),
   and CHART / TOTALS (data.js). New behaviour only: two-level expand. */

/* Local dataset — Claude trimmed to the 3 accounts the brief names
   (个人 / 工作 / 测试); other vendors mirror data.js. No token / price fields. */
const MA_VENDORS = [
  {
    id: 'claude', name: 'Claude', updated: '8 分钟前',
    accounts: [
      { name: '个人账号', key: 'sk-****a1b2', updated: '8 分钟前', h5: 22, week: 61, r5: '今天 13:10', rw: '5/18 21:00' },
      { name: '工作账号', key: 'sk-****f7g8', updated: '7 分钟前', h5: 18, week: 57, r5: '今天 13:12', rw: '5/18 21:00' },
      { name: '测试账号', key: 'sk-****l3m4', updated: '9 分钟前', h5: 12, week: 33, r5: '今天 13:13', rw: '5/18 21:00' },
    ],
  },
  {
    id: 'codex', name: 'Codex', updated: '6 分钟前',
    accounts: [
      { name: '主力账号', key: 'sk-****c0d3', updated: '6 分钟前', h5: 18, week: 93, r5: '今天 13:34', rw: '5/18 21:00' },
      { name: '团队账号', key: 'sk-****d5e6', updated: '8 分钟前', h5: 14, week: 71, r5: '今天 13:30', rw: '5/18 21:00' },
    ],
  },
  {
    id: 'glm', name: 'GLM', updated: '12 分钟前',
    accounts: [
      { name: '个人账号', key: 'sk-****g1l2', updated: '12 分钟前', h5: 34, week: 41, r5: '今天 13:14', rw: '5/17 10:00' },
      { name: '研究账号', key: 'sk-****q7r8', updated: '13 分钟前', h5: 21, week: 38, r5: '今天 13:11', rw: '5/17 10:00' },
    ],
  },
  { id: 'deepseek', name: 'DeepSeek', updated: '9 分钟前',
    accounts: [{ name: '个人账号', key: 'sk-****d9e8', updated: '9 分钟前', h5: 7, week: 22, r5: '今天 13:38', rw: '5/18 09:00' }] },
  { id: 'minimax', name: 'MiniMax', updated: '11 分钟前',
    accounts: [{ name: '个人账号', key: 'sk-****m1n2', updated: '11 分钟前', h5: 12, week: 31, r5: '今天 13:20', rw: '5/18 08:00' }] },
  { id: 'tavily', name: 'Tavily', updated: '6 分钟前',
    accounts: [{ name: '个人账号', key: 'tvly-****a1b2', updated: '6 分钟前', h5: 46, week: 67, r5: '今天 13:10', rw: '6/1 08:00' }] },
];

function vendorAvg(v) {
  const n = v.accounts.length;
  const avg = (k) => Math.round(v.accounts.reduce((s, a) => s + a[k], 0) / n);
  return { h5: avg('h5'), week: avg('week'), r5: v.accounts[0].r5, rw: v.accounts[0].rw };
}

/* ---- one vendor card with two-level expand ---- */
function MultiCard({ v, collapsed, onToggleCollapse, l2open, onToggleL2 }) {
  const multi = v.accounts.length > 1;
  const n = v.accounts.length;
  const m = multi ? vendorAvg(v) : v.accounts[0];

  return (
    <div className={'card' + (collapsed ? ' collapsed' : '')}>
      <div className="card-head">
        <button className="icon-btn card-grip" title="拖动以调整顺序">
          <Icon name="grip" size={18} strokeWidth={2} />
        </button>
        <VendorMark id={v.id} size={26} />
        <span className="card-name">{v.name}</span>
        {multi && <span className="count-badge">{n}</span>}
        {multi && !l2open && <span className="avg-badge">平均</span>}
        <span className="rel-time">{v.updated}</span>
        <div className="card-tools">
          {/* level-2 toggle — multi-account only, lives in the head row but stays
             a weak text button so it never reads as the level-1 chevron */}
          {multi && (
            <button className={'acct-toggle' + (l2open ? ' open' : '')} onClick={onToggleL2}
              title={l2open ? '收起账号' : '查看账号'}>
              <span>{l2open ? '收起' : '账号'}</span>
              <Icon name="chev_down" size={14} />
            </button>
          )}
          <button className="icon-btn card-refresh" title="刷新"><Icon name="refresh" size={17} /></button>
          <div className="card-menu-wrap">
            <button className="icon-btn" title="更多"><Icon name="more" size={18} /></button>
          </div>
          {/* level-1 expand button — controls the whole vendor card */}
          <button className={'icon-btn card-collapse' + (collapsed ? ' is-collapsed' : '')}
            onClick={onToggleCollapse} title={collapsed ? '展开' : '折叠'}>
            <Icon name="chev_down" size={18} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <React.Fragment>
          {/* average (multi, collapsed L2) OR the single account's real usage —
             identical styling. Hidden once account detail is open: then only
             the per-account usage is shown. */}
          {!(multi && l2open) && (
            <div className="bars">
              <BarRow label="5小时" value={m.h5} kind="blue" reset={m.r5} />
              <BarRow label="一周"  value={m.week} kind="purple" reset={m.rw} />
            </div>
          )}

          {multi && l2open && (
            <div className="acct-detail">
              {v.accounts.map((a) => (
                <div className="acct-item" key={a.key}>
                  <div className="ai-head">
                    <span className="ai-dot" />
                    <span className="ai-name">{a.name}</span>
                    <span className="ai-key">{a.key}</span>
                    <span className="ai-time">{a.updated}</span>
                  </div>
                  <div className="ai-bars">
                    <BarRow label="5小时" value={a.h5} kind="blue" reset={a.r5} />
                    <BarRow label="一周"  value={a.week} kind="purple" reset={a.rw} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </React.Fragment>
      )}
    </div>
  );
}

/* ---- the overview window, pre-set to a state but still interactive ---- */
function OmniWindow({ expanded = null, openL2 = null }) {
  const [collapsed, setCollapsed] = React.useState(() => {
    const s = new Set(MA_VENDORS.map((v) => v.id));
    if (expanded) s.delete(expanded);
    return s;
  });
  const [l2set, setL2set] = React.useState(() => new Set(openL2 ? [openL2] : []));
  const toggle = (setter, id) => setter((prev) => {
    const nx = new Set(prev); nx.has(id) ? nx.delete(id) : nx.add(id); return nx;
  });

  return (
    <div className="window ma-window">
      <div className="titlebar">
        <img className="app-logo" src="logo.png" alt="OmniUsage" width="30" height="30" />
        <span className="app-title">OmniUsage</span>
        <div className="tb-actions">
          <button className="icon-btn" title="刷新全部"><Icon name="refresh" size={18} /></button>
          <button className="icon-btn" title="设置"><Icon name="gear" size={18} /></button>
        </div>
      </div>

      <div className="tabs-wrap">
        <button className="tab pinned active">
          <span className="tab-ic"><Icon name="grid_nav" size={22} color="var(--blue)" strokeWidth={1.8} /></span>
          <span className="tab-lbl">总览</span>
        </button>
        <div className="tabs-pin-divider" />
        <div className="tabs">
          {MA_VENDORS.map((v) => <Tab key={v.id} vendorId={v.id} label={v.name} active={false} onClick={() => {}} />)}
        </div>
        <div className="tabs-fade right" />
      </div>
      <div className="titlebar-divider" />

      <div className="scroll ma-scroll">
        {MA_VENDORS.map((v) => (
          <MultiCard key={v.id} v={v}
            collapsed={collapsed.has(v.id)} onToggleCollapse={() => toggle(setCollapsed, v.id)}
            l2open={l2set.has(v.id)} onToggleL2={() => toggle(setL2set, v.id)} />
        ))}
        <TokenPanel chartData={CHART} totals={TOTALS.overview}
          collapsed={false} onToggleCollapse={() => {}} onHandleDown={() => {}} />
      </div>
    </div>
  );
}

const MA_ARTBOARD = { background: 'transparent', boxShadow: 'none', overflow: 'visible', borderRadius: 18 };

function App() {
  return (
    <DesignCanvas>
      <DCSection id="states" title="多账号展开" subtitle="折叠 → 展开平均用量 → 展开账号明细（点击卡片右上角与「查看账号」可实际操作）">
        <DCArtboard id="s1" label="状态 1 · 全部折叠" width={460} height={850} style={MA_ARTBOARD}>
          <OmniWindow />
        </DCArtboard>
        <DCArtboard id="s2" label="状态 2 · 展开多账号厂商（平均用量）" width={460} height={903} style={MA_ARTBOARD}>
          <OmniWindow expanded="claude" />
        </DCArtboard>
        <DCArtboard id="s3" label="状态 3 · 展开账号明细" width={460} height={1111} style={MA_ARTBOARD}>
          <OmniWindow expanded="claude" openL2="claude" />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
