/* settings-panel.jsx — standalone OmniUsage settings window.
   Implements 账号 (single-row vs grouped), 数据源, CPA Manager 详情,
   and the add-account / add-CPA dialogs. Two modes: normal / cpa. */

/* ---------- small shared controls ---------- */
function SPToggle({ on, onClick, disabled }) {
  return (
    <button className="sw" data-on={on ? '1' : '0'} disabled={disabled}
      onClick={disabled ? undefined : onClick}><i /></button>
  );
}
function SPSelect({ value, onChange, options }) {
  return (
    <select className="set-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function SPRow({ title, sub, children }) {
  return (
    <div className="set-row">
      <div className="sr-text">
        <div className="sr-title">{title}</div>
        {sub && <div className="sr-sub">{sub}</div>}
      </div>
      <div className="sr-ctrl">{children}</div>
    </div>
  );
}
function SrcTag({ source }) {
  if (!source) return null;
  return <span className="src-tag">{source === 'cpa' ? '来自 CPA Manager' : '直接添加'}</span>;
}

/* ---------- nav ---------- */
const SP_NAV_BASE = [
  { id: 'general', label: '常规', icon: 'gear' },
  { id: 'accounts', label: '账号', icon: 'inbox' },
  { id: 'datasource', label: '数据源', icon: 'globe', cpaOnly: true },
  { id: 'appearance', label: '外观', icon: 'palette' },
  { id: 'notify', label: '通知', icon: 'bell' },
  { id: 'data', label: '数据与隐私', icon: 'shield' },
  { id: 'about', label: '关于', icon: 'info' },
];
const ACCENTS = ['#3d7afd', '#6f5cf6', '#0ea5a3', '#f5772f', '#e23744'];

/* =================================================================
   ACCOUNT ROWS
   ================================================================= */
function AccountActions({ source, on, onToggle, mode }) {
  // cpa account → hide (no delete); direct account → delete
  const isCpa = mode === 'cpa' && source === 'cpa';
  return (
    <div className="ao-actions" onClick={(e) => e.stopPropagation()}>
      {mode === 'cpa' && <SrcTag source={source} />}
      <SPToggle on={on} onClick={onToggle} />
      <button className="sp-ic" title="编辑备注名"><Icon name="edit" size={15} /></button>
      {isCpa
        ? <button className="sp-ic" title="隐藏账号"><Icon name="eye_off" size={15} /></button>
        : <button className="sp-ic danger" title="删除账号"><Icon name="trash" size={15} /></button>}
    </div>
  );
}

function OneRowAccount({ vendor, account, on, onToggle, mode }) {
  return (
    <div className={'ao-item' + (on ? '' : ' off')}>
      <div className="ao-vendor">
        <VendorMark id={vendor.id} size={24} />
        <span className="ao-name">{vendor.name}</span>
      </div>
      <div className="ao-acct">
        <span className={'ao-dot' + (on ? '' : ' off')} />
        <span className="ao-note">{account.name}</span>
      </div>
      <span className="ao-key">{account.key}</span>
      <AccountActions source={account.source} on={on} onToggle={onToggle} mode={mode} />
    </div>
  );
}

function MultiGroup({ vendor, accounts, isOn, onToggle, mode }) {
  return (
    <div className="grp">
      <div className="grp-head">
        <VendorMark id={vendor.id} size={22} />
        <span className="grp-name">{vendor.name}</span>
        <span className="grp-count">{accounts.length} 个账号</span>
      </div>
      <div className="grp-rows">
        {accounts.map((a) => {
          const on = isOn(a.key);
          return (
            <div className={'gr-row' + (on ? '' : ' off')} key={a.key}>
              <span className="gr-handle" title="拖动排序"><Icon name="grip" size={16} strokeWidth={2} /></span>
              <span className={'gr-dot' + (on ? '' : ' off')} />
              <span className="gr-note">{a.name}</span>
              <span className="gr-key">{a.key}</span>
              <AccountActions source={a.source} on={on} onToggle={() => onToggle(a.key)} mode={mode} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccountsPage({ mode }) {
  const dataset = mode === 'cpa' ? ACCT_CPA : ACCT_NORMAL;
  const [off, setOff] = React.useState(() => new Set());
  const toggle = (k) => setOff((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="acct-list">
      {dataset.map((v) => {
        const vendor = { id: v.id, name: SV_META[v.id].name };
        if (v.accounts.length === 1) {
          const a = v.accounts[0];
          const key = v.id + ':' + a.key;
          return (
            <OneRowAccount key={v.id} vendor={vendor} account={a}
              on={!off.has(key)} onToggle={() => toggle(key)} mode={mode} />
          );
        }
        return (
          <MultiGroup key={v.id} vendor={vendor} accounts={v.accounts} mode={mode}
            isOn={(k) => !off.has(v.id + ':' + k)}
            onToggle={(k) => toggle(v.id + ':' + k)} />
        );
      })}
    </div>
  );
}

/* =================================================================
   DATA SOURCE PAGE
   ================================================================= */
function DataSourcePage({ onOpen }) {
  return (
    <div className="ds-list">
      {DATA_SOURCES.map((d) => (
        <div className="ds-card" key={d.id} onClick={() => onOpen(d.id)}>
          <div className="ds-top">
            <span className="ds-icon"><VendorMark id="cpa" size={26} /></span>
            <div className="ds-head-text">
              <div className="ds-title">{d.name}</div>
              <div className="ds-status"><span className="dsd" />状态：{d.status}</div>
            </div>
            <div className="ds-actions">
              <button className="ds-btn" onClick={(e) => e.stopPropagation()}><Icon name="refresh" size={14} />同步</button>
              <button className="ds-btn" onClick={(e) => { e.stopPropagation(); onOpen(d.id); }}><Icon name="edit" size={14} />编辑</button>
              <button className="ds-btn icon" title="更多" onClick={(e) => e.stopPropagation()}><Icon name="more" size={16} /></button>
            </div>
          </div>
          <div className="ds-meta">
            <div className="dm-line mono">{d.url}</div>
            <div className="dm-line">发现 <b>{d.accountsFound}</b> 个账号，覆盖 <b>{d.vendorsCovered}</b> 个服务商</div>
            <div className="dm-line dm-faint">上次同步：{d.lastSync}</div>
          </div>
          <div className="ds-covers">
            <span className="dc-label">覆盖服务商</span>
            <span className="dc-icons">
              {d.covers.map((id) => <VendorMark key={id} id={id} size={16} />)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* =================================================================
   CPA MANAGER DETAIL
   ================================================================= */
function DiscoveredGroup({ vendor, accounts, open, onToggle }) {
  return (
    <div className="disc-grp">
      <button className="disc-head" data-open={open ? 'true' : 'false'} onClick={onToggle}>
        <VendorMark id={vendor.id} size={20} />
        <span className="dh-name">{vendor.name}</span>
        <span className="dh-count">{accounts.length} 个</span>
        <span className="dh-chev"><Icon name="chev_down" size={16} /></span>
      </button>
      {open && (
        <div className="disc-rows">
          {accounts.map((a) => (
            <div className="disc-row" key={a.key}>
              <span className="drd" />
              <span className="dr-note">{a.name}</span>
              <span className="dr-key">{a.key}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CpaDetailPage() {
  const [url, setUrl] = React.useState('https://cpa.example.com');
  const [key, setKey] = React.useState('cpa_sk_9f3a2b7c1d8e');
  const [showKey, setShowKey] = React.useState(false);
  const [interval, setInterval] = React.useState('5 分钟');
  const [autoSync, setAutoSync] = React.useState(true);
  const [failNotify, setFailNotify] = React.useState(true);
  const [scope, setScope] = React.useState(() => new Set(CPA_SCOPE));
  const [openGrps, setOpenGrps] = React.useState(() => new Set(CPA_DISCOVERED.map((g) => g.id)));

  const toggleScope = (id) => setScope((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGrp = (id) => setOpenGrps((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="cpa-detail">
      {/* ---- config ---- */}
      <div className="cpa-cfg">
        <div className="cfg-sec">连接配置</div>
        <div className="cfg-field">
          <label className="cfg-label">CPA-Manager URL</label>
          <input className="ad-input mono" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="cfg-field">
          <label className="cfg-label">API 密钥</label>
          <div className="ad-key">
            <input className="ad-input mono" type={showKey ? 'text' : 'password'} value={key}
              onChange={(e) => setKey(e.target.value)} />
            <button className="ad-eye" onClick={() => setShowKey((v) => !v)} title={showKey ? '隐藏' : '显示'}>
              <Icon name={showKey ? 'eye_off' : 'eye'} size={16} />
            </button>
          </div>
        </div>

        <div className="cfg-sec">连接状态</div>
        <div className="cfg-status">
          <span className="csd" /><span className="cs-ok">正常</span>
          <span className="cs-sync">上次同步：2 分钟前</span>
        </div>

        <div className="cfg-sec">同步设置</div>
        <div className="cfg-row">
          <div className="cr-text"><div className="cr-title">同步间隔</div></div>
          <div className="cr-ctrl"><SPSelect value={interval} onChange={setInterval}
            options={['1 分钟', '5 分钟', '15 分钟', '30 分钟', '仅手动']} /></div>
        </div>
        <div className="cfg-row">
          <div className="cr-text"><div className="cr-title">自动同步</div></div>
          <div className="cr-ctrl"><SPToggle on={autoSync} onClick={() => setAutoSync((v) => !v)} /></div>
        </div>
        <div className="cfg-row">
          <div className="cr-text"><div className="cr-title">同步失败通知</div></div>
          <div className="cr-ctrl"><SPToggle on={failNotify} onClick={() => setFailNotify((v) => !v)} /></div>
        </div>

        <div className="cfg-sec">同步范围</div>
        {CPA_SCOPE.map((id) => (
          <div className="cfg-row cfg-scope-row" key={id}>
            <span className="cr-vendor"><VendorMark id={id} size={20} />{SV_META[id].name}</span>
            <div className="cr-ctrl"><SPToggle on={scope.has(id)} onClick={() => toggleScope(id)} /></div>
          </div>
        ))}

        <div className="cpa-foot">
          <button className="cf-save"><Icon name="check" size={15} color="#fff" />保存</button>
          <button className="cf-remove"><Icon name="trash" size={14} />移除数据源</button>
        </div>
      </div>

      {/* ---- discovered ---- */}
      <div className="cpa-disc">
        <div className="cfg-sec" style={{ marginTop: 0 }}>已发现账号</div>
        <div className="disc-desc">由 CPA Manager 发现的账号，将显示在主面板中。</div>
        {CPA_DISCOVERED.map((g) => (
          <DiscoveredGroup key={g.id} vendor={{ id: g.id, name: SV_META[g.id].name }}
            accounts={g.accounts} open={openGrps.has(g.id)} onToggle={() => toggleGrp(g.id)} />
        ))}
      </div>
    </div>
  );
}

/* =================================================================
   DIALOGS
   ================================================================= */
function Dialog({ onClose, children, wide }) {
  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="acct-dialog-scrim" onMouseDown={onClose}>
      <div className={'acct-dialog' + (wide ? ' wide' : '')} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function PickerDialog({ onPickVendor, onPickCpa, onClose }) {
  return (
    <Dialog onClose={onClose}>
      <div className="ad-head">
        <div className="ad-htext">
          <div className="ad-title">添加账号</div>
          <div className="ad-sub">选择一个服务，或通过高级方式批量接入</div>
        </div>
        <button className="ad-close" onClick={onClose} title="关闭"><Icon name="close" size={17} strokeWidth={2} /></button>
      </div>
      <div className="ad-body">
        <div className="sp-grouplabel" style={{ marginTop: 0 }}>常用服务</div>
        <div className="pick-grid">
          {ADD_COMMON.map((id) => (
            <button className="pick-card" key={id} onClick={() => onPickVendor(id)}>
              <span className="pc-mark"><VendorMark id={id} size={30} /></span>
              <span className="pc-name">{SV_META[id].name}</span>
            </button>
          ))}
        </div>
        <div className="sp-grouplabel">高级方式</div>
        <button className="pick-adv" onClick={onPickCpa}>
          <span className="pa-icon"><VendorMark id="cpa" size={24} /></span>
          <span className="pa-text">
            <span className="pa-title-row">
              <span className="pa-title">CPA Manager</span>
              <span className="pa-badge">多服务商</span>
            </span>
            <span className="pa-desc">通过 CPA 批量获取多个 AI 服务商账号</span>
          </span>
          <span className="pa-chev"><Icon name="chevron" size={18} /></span>
        </button>
      </div>
    </Dialog>
  );
}

function VendorFormDialog({ vendorId, onClose }) {
  const meta = SV_META[vendorId];
  const [name, setName] = React.useState('');
  const [key, setKey] = React.useState('');
  const [endpoint, setEndpoint] = React.useState('');
  const [show, setShow] = React.useState(false);
  const canSave = name.trim() && key.trim();
  return (
    <Dialog onClose={onClose}>
      <div className="ad-head">
        <span className="ad-mark"><VendorMark id={vendorId} size={24} /></span>
        <div className="ad-htext">
          <div className="ad-title">添加 {meta.name} 账号</div>
          <div className="ad-sub">{meta.name}</div>
        </div>
        <button className="ad-close" onClick={onClose} title="关闭"><Icon name="close" size={17} strokeWidth={2} /></button>
      </div>
      <div className="ad-body">
        <div className="ad-field">
          <label className="ad-label">账号名称</label>
          <input className="ad-input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="例如：工作账号" />
        </div>
        <div className="ad-field">
          <label className="ad-label">API 密钥</label>
          <div className="ad-key">
            <input className="ad-input mono" type={show ? 'text' : 'password'} value={key}
              onChange={(e) => setKey(e.target.value)} placeholder="sk-..." />
            <button className="ad-eye" onClick={() => setShow((v) => !v)} title={show ? '隐藏' : '显示'}>
              <Icon name={show ? 'eye_off' : 'eye'} size={16} />
            </button>
          </div>
          <div className="ad-hint"><Icon name="lock" size={12} strokeWidth={1.8} />密钥仅加密保存在本地，用于读取用量数据</div>
        </div>
        <div className="ad-field">
          <label className="ad-label">接口地址<span className="ad-opt">可选</span></label>
          <input className="ad-input mono" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="默认（官方接口）" />
        </div>
      </div>
      <div className="ad-foot">
        <button className="ad-test"><Icon name="refresh" size={14} strokeWidth={1.9} />测试连接</button>
        <div className="ad-foot-r">
          <button className="ad-btn ghost" onClick={onClose}>取消</button>
          <button className={'ad-btn primary' + (canSave ? '' : ' disabled')} onClick={canSave ? onClose : undefined}>添加账号</button>
        </div>
      </div>
    </Dialog>
  );
}

function CpaAddDialog({ onClose }) {
  const [url, setUrl] = React.useState('');
  const [key, setKey] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [scope, setScope] = React.useState(() => new Set(CPA_SCOPE));
  const toggleScope = (id) => setScope((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const canSave = url.trim() && key.trim();
  return (
    <Dialog onClose={onClose} wide>
      <div className="ad-head">
        <span className="ad-mark"><VendorMark id="cpa" size={24} /></span>
        <div className="ad-htext">
          <div className="ad-title">添加 CPA Manager</div>
          <div className="ad-sub">批量接入多个服务商账号</div>
        </div>
        <button className="ad-close" onClick={onClose} title="关闭"><Icon name="close" size={17} strokeWidth={2} /></button>
      </div>
      <div className="ad-body">
        <div className="ad-field">
          <label className="ad-label">CPA-Manager URL</label>
          <input className="ad-input mono" value={url} autoFocus onChange={(e) => setUrl(e.target.value)} placeholder="https://cpa.example.com" />
        </div>
        <div className="ad-field">
          <label className="ad-label">管理密钥</label>
          <div className="ad-key">
            <input className="ad-input mono" type={show ? 'text' : 'password'} value={key}
              onChange={(e) => setKey(e.target.value)} placeholder="cpa_sk_..." />
            <button className="ad-eye" onClick={() => setShow((v) => !v)} title={show ? '隐藏' : '显示'}>
              <Icon name={show ? 'eye_off' : 'eye'} size={16} />
            </button>
          </div>
        </div>
        <div className="ad-field">
          <label className="ad-label">同步范围</label>
          <div className="scope-list">
            {CPA_SCOPE.map((id) => (
              <div className="scope-item" key={id}>
                <VendorMark id={id} size={20} />
                <span className="si-name">{SV_META[id].name}</span>
                <SPToggle on={scope.has(id)} onClick={() => toggleScope(id)} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ad-foot">
        <button className="ad-test"><Icon name="refresh" size={14} strokeWidth={1.9} />测试连接</button>
        <div className="ad-foot-r">
          <button className="ad-btn ghost" onClick={onClose}>取消</button>
          <button className={'ad-btn primary' + (canSave ? '' : ' disabled')} onClick={canSave ? onClose : undefined}>保存并同步</button>
        </div>
      </div>
    </Dialog>
  );
}

/* =================================================================
   ROOT PANEL
   ================================================================= */
/* usage-bar color scheme — ordered list, default 风险色：仅当前用量.
   Order is fixed: current-only first, projected second, nine-cycle last. */
const BAR_SCHEMES = [
  { value: 'risk-current', title: '风险色：仅当前用量', badge: '默认',
    sub: '只看当前用量比例判断颜色，逻辑简单、不依赖重置时间，适合大多数数据。',
    swatch: ['var(--risk-green)', 'var(--risk-yellow)', 'var(--risk-orange)', 'var(--risk-red)'] },
  { value: 'risk-projected', title: '风险色：带投影预测',
    sub: '在当前用量基础上，按当前速度预测窗口结束时的用量；无法预测时回退到「仅当前用量」。',
    swatch: ['var(--risk-green)', 'var(--risk-yellow)', 'var(--risk-orange)', 'var(--risk-red)'] },
  { value: 'nine-cycle', title: '彩色区分：九色循环',
    sub: '仅用于区分不同用量条，按顺序循环取色，不表达安全或风险。',
    swatch: ['#5B8CFF', '#8B72F8', '#46C7C7', '#7EA2FF', '#A18CFF'] },
];

function BarSchemeField({ value, onChange }) {
  return (
    <div className="bsf-list">
      {BAR_SCHEMES.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} className={'bsf-opt' + (on ? ' on' : '')}
            onClick={() => onChange(o.value)}>
            <span className={'bsf-radio' + (on ? ' on' : '')}><i /></span>
            <span className="bsf-text">
              <span className="bsf-title-row">
                <span className="bsf-title">{o.title}</span>
                {o.badge && <span className="bsf-badge">{o.badge}</span>}
              </span>
              <span className="bsf-sub">{o.sub}</span>
            </span>
            <span className="bsf-swatch">
              {o.swatch.map((c, i) => <span key={i} className="bsf-dot" style={{ background: c }} />)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SettingsPanel({ mode, theme, onTheme, accent, onAccent, barScheme, onBarScheme, onBack }) {
  const [section, setSection] = React.useState('accounts');
  const [dsView, setDsView] = React.useState('list');   // list | cpa
  const [dialog, setDialog] = React.useState(null);      // {type:'picker'|'vendor'|'cpa', vendorId?}
  const [s, setS] = React.useState({
    interval: '5 分钟', lang: '简体中文', trayClick: '打开主面板', pin: false,
    notifyNear: true, notifyLimit: true, notifyFail: true, notifyWay: '系统通知', cacheMax: '100 MB',
  });
  const up = (k, v) => setS((p) => ({ ...p, [k]: v }));

  const nav = SP_NAV_BASE.filter((n) => !n.cpaOnly || mode === 'cpa');
  // when leaving cpa mode while on datasource, fall back to accounts
  React.useEffect(() => {
    if (mode !== 'cpa' && section === 'datasource') setSection('accounts');
  }, [mode]);
  React.useEffect(() => { setDsView('list'); }, [section]);

  const inDetail = section === 'datasource' && dsView === 'cpa';

  /* header */
  const headers = {
    general: '常规', accounts: '账号', appearance: '外观',
    notify: '通知', data: '数据与隐私', about: '关于',
  };

  return (
    <div className="sp-window">
      <div className="sp-nav">
        <div className={'sp-nav-back' + (onBack ? ' clickable' : '')}
          onClick={onBack} role={onBack ? 'button' : undefined} title={onBack ? '返回主面板' : undefined}>
          <span className="npc"><Icon name="back" size={18} /></span>设置
        </div>
        <div className="sp-nav-items">
          {nav.map((n) => (
            <button key={n.id} className={'sp-nav-item' + (section === n.id ? ' on' : '')}
              onClick={() => setSection(n.id)}>
              <span className="sni"><Icon name={n.icon} size={16} strokeWidth={1.7} /></span>{n.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sp-main">
        {/* ---- header ---- */}
        {inDetail ? (
          <div className="sp-head">
            <div className="sp-crumb">
              <span style={{ cursor: 'pointer' }} onClick={() => setDsView('list')}>数据源</span>
              <span className="cc-sep"><Icon name="chevron" size={15} /></span>
              <span className="cc-cur">CPA Manager</span>
            </div>
          </div>
        ) : (
          <div className="sp-head">
            {section === 'datasource'
              ? <span className="sp-title">数据源</span>
              : <span className="sp-title">{headers[section]}</span>}
            {section === 'accounts' && (
              <button className="sp-action" onClick={() => setDialog({ type: 'picker' })}>
                <Icon name="plus" size={15} color="#fff" strokeWidth={2.1} />添加账号
              </button>
            )}
            {section === 'datasource' && (
              <button className="sp-action" onClick={() => setDialog({ type: 'cpa' })}>
                <Icon name="plus" size={15} color="#fff" strokeWidth={2.1} />添加数据源
              </button>
            )}
          </div>
        )}

        {/* ---- body ---- */}
        {inDetail ? (
          <div className="sp-content" style={{ display: 'flex', paddingRight: 0 }}>
            <CpaDetailPage />
          </div>
        ) : (
          <div className="sp-content">
            {section === 'accounts' && <AccountsPage mode={mode} />}
            {section === 'datasource' && <DataSourcePage onOpen={() => setDsView('cpa')} />}

            {section === 'general' && (
              <>
                <div className="set-group-label" style={{ marginTop: 0 }}>启动</div>
                <SPRow title="开机时自动启动" sub="登录系统后在后台运行并驻留托盘"><SPToggle on={true} onClick={() => {}} /></SPRow>
                <SPRow title="启动后最小化到托盘"><SPToggle on={true} onClick={() => {}} /></SPRow>
                <div className="set-group-label">刷新</div>
                <SPRow title="自动刷新间隔" sub="后台轮询各服务用量的频率">
                  <SPSelect value={s.interval} onChange={(v) => up('interval', v)} options={['1 分钟', '5 分钟', '15 分钟', '30 分钟', '仅手动']} />
                </SPRow>
                <SPRow title="点击托盘图标">
                  <SPSelect value={s.trayClick} onChange={(v) => up('trayClick', v)} options={['打开主面板', '打开菜单']} />
                </SPRow>
                <SPRow title="界面语言">
                  <SPSelect value={s.lang} onChange={(v) => up('lang', v)} options={['简体中文', 'English', '跟随系统']} />
                </SPRow>
              </>
            )}

            {section === 'appearance' && (
              <>
                <div className="set-group-label" style={{ marginTop: 0 }}>主题</div>
                <SPRow title="配色方案">
                  <div className="set-seg">
                    {[['light', '浅色'], ['dark', '深色'], ['system', '跟随系统']].map(([k, lb]) => (
                      <button key={k} className={theme === k ? 'on' : ''} onClick={() => onTheme(k)}>{lb}</button>
                    ))}
                  </div>
                </SPRow>
                <SPRow title="强调色" sub="用于选中状态、进度与主要操作">
                  <div className="accent-row">
                    {ACCENTS.map((c) => (
                      <button key={c} className={'accent-sw' + (accent === c ? ' on' : '')}
                        style={{ background: c, color: c }} onClick={() => onAccent(c)} />
                    ))}
                  </div>
                </SPRow>
                <div className="set-group-label">用量条</div>
                <div className="set-row set-row-stack">
                  <div className="sr-text">
                    <div className="sr-title">用量条颜色方案</div>
                    <div className="sr-sub">控制所有用量条的取色方式。默认按当前用量显示风险色。</div>
                  </div>
                  <BarSchemeField value={barScheme} onChange={onBarScheme} />
                </div>
              </>
            )}

            {section === 'notify' && (
              <>
                <div className="set-group-label" style={{ marginTop: 0 }}>用量提醒</div>
                <SPRow title="接近限制时提醒" sub="任一周期用量达到 80% 时"><SPToggle on={s.notifyNear} onClick={() => up('notifyNear', !s.notifyNear)} /></SPRow>
                <SPRow title="达到限制时提醒" sub="任一周期用量达到 100% 时"><SPToggle on={s.notifyLimit} onClick={() => up('notifyLimit', !s.notifyLimit)} /></SPRow>
                <SPRow title="刷新失败时提醒" sub="连续刷新失败或凭证失效时"><SPToggle on={s.notifyFail} onClick={() => up('notifyFail', !s.notifyFail)} /></SPRow>
                <div className="set-group-label">方式</div>
                <SPRow title="提醒方式">
                  <SPSelect value={s.notifyWay} onChange={(v) => up('notifyWay', v)} options={['系统通知', '托盘图标角标', '仅应用内', '关闭']} />
                </SPRow>
              </>
            )}

            {section === 'data' && (
              <>
                <div className="set-group-label" style={{ marginTop: 0 }}>存储</div>
                <SPRow title="本地缓存上限" sub="历史趋势数据占用的最大空间，超出后自动清理最旧记录">
                  <SPSelect value={s.cacheMax} onChange={(v) => up('cacheMax', v)} options={['50 MB', '100 MB', '200 MB', '500 MB', '不限制']} />
                </SPRow>
                <SPRow title="本地用量缓存" sub="历史趋势数据 · 占用 4.2 MB">
                  <button className="set-select" style={{ background: 'var(--field-bg)' }}>清除</button>
                </SPRow>
                <div className="set-group-label">数据</div>
                <SPRow title="导出用量数据" sub="导出为 CSV / JSON">
                  <button className="set-select" style={{ background: 'var(--field-bg)' }}>导出</button>
                </SPRow>
                <div className="set-group-label" style={{ color: 'var(--red)' }}>危险区域</div>
                <SPRow title="重置应用" sub="清除全部账号、设置与缓存">
                  <button className="set-select" style={{ color: 'var(--red)', borderColor: 'color-mix(in srgb,var(--red) 35%,transparent)' }}>重置</button>
                </SPRow>
              </>
            )}

            {section === 'about' && (
              <>
                <div className="about-app">
                  <img className="app-logo" src="logo.png" alt="" style={{ width: 56, height: 56, marginBottom: 12 }} />
                  <div className="aa-name">OmniUsage</div>
                  <div className="aa-ver">版本 1.4.2 · 已是最新版本</div>
                  <button className="btn-primary" style={{ marginTop: 14 }}><Icon name="refresh" size={15} color="#fff" />检查更新</button>
                </div>
                <div className="about-links">
                  <SPRow title="更新日志"><Icon name="chevron" size={16} color="var(--text-3)" /></SPRow>
                  <SPRow title="开源许可"><Icon name="chevron" size={16} color="var(--text-3)" /></SPRow>
                  <SPRow title="反馈问题"><Icon name="chevron" size={16} color="var(--text-3)" /></SPRow>
                </div>
                <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', marginTop: 18 }}>© 2026 OmniUsage · 跨平台 AI 用量监控</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---- dialogs ---- */}
      {dialog && dialog.type === 'picker' && (
        <PickerDialog
          onPickVendor={(id) => setDialog({ type: 'vendor', vendorId: id })}
          onPickCpa={() => setDialog({ type: 'cpa' })}
          onClose={() => setDialog(null)} />
      )}
      {dialog && dialog.type === 'vendor' && (
        <VendorFormDialog vendorId={dialog.vendorId} onClose={() => setDialog(null)} />
      )}
      {dialog && dialog.type === 'cpa' && (
        <CpaAddDialog onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

Object.assign(window, { SettingsPanel });
