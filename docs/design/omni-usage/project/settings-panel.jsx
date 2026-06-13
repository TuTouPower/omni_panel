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
/* §5.5.6 单一「已添加」列表 — 不再有独立的「数据源」导航区；
   CPA 数据源以可展开行的形式并入「账号」列表。 */
const SP_NAV_BASE = [
  { id: 'general', label: '常规', icon: 'gear' },
  { id: 'accounts', label: '账号', icon: 'inbox' },
  { id: 'appearance', label: '外观', icon: 'palette' },
  { id: 'notify', label: '通知', icon: 'bell' },
  { id: 'data', label: '数据与隐私', icon: 'shield' },
  { id: 'about', label: '关于', icon: 'info' },
];
const ACCENTS = ['#3d7afd', '#6f5cf6', '#0ea5a3', '#f5772f', '#e23744'];

/* =================================================================
   ACCOUNT ROWS
   ================================================================= */
function ConfirmDelete({ name, onCancel, onConfirm }) {
  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="acct-dialog-scrim" onMouseDown={onCancel}>
      <div className="acct-dialog confirm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ad-head">
          <span className="ad-mark danger"><Icon name="trash" size={18} /></span>
          <div className="ad-htext">
            <div className="ad-title">删除账号</div>
            <div className="ad-sub">此操作无法撤销</div>
          </div>
        </div>
        <div className="ad-body">
          <div className="confirm-msg">确定要删除账号 <b>{name}</b> 吗？删除后该账号的所有本地用量记录将一并移除。</div>
        </div>
        <div className="ad-foot">
          <div className="ad-foot-r">
            <button className="ad-btn ghost" onClick={onCancel}>取消</button>
            <button className="ad-btn danger" onClick={onConfirm}>删除账号</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- status dot + optional problem text (no usage shown here) ---- */
const ST_META = {
  ok:    { dot: 'var(--green)' },
  error: { dot: 'var(--risk-red)',    text: '采集失败' },
  auth:  { dot: 'var(--risk-orange)', text: '凭证失效' },
};
function dotOf(status, on) { return on ? ((ST_META[status] || ST_META.ok).dot) : 'var(--text-3)'; }
function textOf(status, on, vendorId) {
  if (!on) return null;
  const m = ST_META[status];
  if (!m) return null;
  if (status === 'auth') {
    // 网页登录类服务（MiMo / Kimi …）说「登录失效」，密钥/本地类说「凭证失效」
    const auth = (window.VENDOR_AUTH && window.VENDOR_AUTH[vendorId]) || 'apikey';
    return auth === 'session' ? '登录失效' : '凭证失效';
  }
  return m.text || null;
}

/* ---- one account row — identical layout for single-account vendors,
        multi-account vendors (GLM…), and CPA-discovered accounts.
        logo + 厂商 + 指示灯 + 备注 + actions; rows stack inside one card.
   mode 'direct' → 开关/刷新/编辑/删除 ; mode 'cpa' → 改名/隐藏 (§5.5.6). ---- */
function AccountRow({ mode, vendorId, account, on, onToggle, onEdit, hidden, onHide }) {
  const [confirm, setConfirm] = React.useState(false);
  const isCpa = mode === 'cpa';
  const removed = account.removed;
  const effOn = isCpa ? !hidden && !removed : on;
  const stext = removed ? '来源已移除' : (isCpa && hidden) ? '已隐藏' : textOf(account.status, isCpa ? true : on, vendorId);
  const sevCls = removed ? '' : account.status === 'error' ? ' err' : account.status === 'auth' ? ' warn' : '';
  const dot = removed ? 'var(--risk-orange)' : (isCpa && hidden) ? 'var(--text-3)' : dotOf(account.status, isCpa ? true : on);
  return (
    <div className={'acc-row' + (effOn ? '' : ' off') + (isCpa && hidden ? ' hidden' : '') + (removed ? ' removed' : '')}>
      <span className="ar-vendor-col">
        <VendorMark id={vendorId} size={24} />
        <span className="ar-vendor">{SV_META[vendorId].name}</span>
      </span>
      <div className="ar-acct-col">
        <span className="ar-dot" style={{ background: dot }} />
        <span className="ar-note">{account.name}</span>
        {stext && <span className={'ar-stat' + sevCls}>{stext}</span>}
      </div>
      <div className="ar-actions">
        {isCpa ? (
          removed ? (
            <button className="sub-clear" title="清除该来源已移除的账号">清除</button>
          ) : (
            <>
              <button className="sp-ic" title="改名" onClick={onEdit}><Icon name="edit" size={15} /></button>
              <button className={'sp-ic' + (hidden ? ' on' : '')} title={hidden ? '取消隐藏' : '隐藏账号'} onClick={onHide}>
                <Icon name={hidden ? 'eye' : 'eye_off'} size={15} />
              </button>
            </>
          )
        ) : (
          <>
            <SPToggle on={on} onClick={onToggle} />
            <button className="sp-ic" title="刷新"><Icon name="refresh" size={15} /></button>
            <button className="sp-ic" title="编辑" onClick={onEdit}><Icon name="edit" size={15} /></button>
            <button className="sp-ic danger" title="删除账号" onClick={() => setConfirm(true)}><Icon name="trash" size={15} /></button>
          </>
        )}
      </div>
      {confirm && <ConfirmDelete name={account.name} onCancel={() => setConfirm(false)} onConfirm={() => setConfirm(false)} />}
    </div>
  );
}

/* ---- direct vendor card: 1+ account rows in one card, no header / no handle.
        single-account vendor = a card with one row; GLM (N accounts) = a card
        with N identical rows. ---- */
function VendorCard({ vendor, accounts, isOn, onToggle, onEditAcct }) {
  return (
    <div className="acc-card">
      {accounts.map((a) => (
        <AccountRow key={a.id} mode="direct" vendorId={vendor.id} account={a}
          on={isOn(a.id)} onToggle={() => onToggle(a.id)} onEdit={() => onEditAcct(vendor.id, a.name)} />
      ))}
    </div>
  );
}

/* ---- CPA card: a data-source row (开关/刷新/编辑/删除, no collapse) followed
        by its discovered account rows, always visible (§5.5.6). ---- */
function CpaCard({ conn, on, onToggle, onOpenDetail, hiddenSet, onHide, onEditAcct }) {
  const [confirm, setConfirm] = React.useState(false);
  const live = conn.accounts.filter((a) => !a.removed);
  const providers = new Set(live.map((a) => a.vendor));
  const failing = conn.accounts.filter((a) => a.status === 'error' && !a.removed).length;
  return (
    <div className={'acc-card' + (on ? '' : ' off')}>
      <div className="acc-row ds-row">
        <span className="ar-vendor-col ds-vendor">
          <VendorMark id="cpa" size={24} />
          <span className="ar-vendor">CPA Manager</span>
          <span className="cr-srctag">数据源</span>
        </span>
        <div className="ar-acct-col">
          <span className="ar-dot" style={{ background: dotOf(conn.status, on) }} />
          <span className="ar-note">{live.length} 账号 · {providers.size} 服务商</span>
          {failing > 0 && <span className="cpa-fail"><Icon name="cloud_off" size={12} strokeWidth={1.9} />{failing} 个采集失败</span>}
        </div>
        <div className="ar-actions">
          <SPToggle on={on} onClick={onToggle} />
          <button className="sp-ic" title="刷新"><Icon name="refresh" size={15} /></button>
          <button className="sp-ic" title="编辑（连接设置）" onClick={onOpenDetail}><Icon name="edit" size={15} /></button>
          <button className="sp-ic danger" title="移除数据源" onClick={() => setConfirm(true)}><Icon name="trash" size={15} /></button>
        </div>
      </div>
      {conn.accounts.map((a) => (
        <AccountRow key={a.id} mode="cpa" vendorId={a.vendor} account={a}
          hidden={hiddenSet.has(a.id)} onHide={() => onHide(a.id)} onEdit={() => onEditAcct(a.vendor, a.name)} />
      ))}
      {confirm && <ConfirmDelete name={conn.name + ' 数据源'} onCancel={() => setConfirm(false)} onConfirm={() => setConfirm(false)} />}
    </div>
  );
}

/* ---- web-login session block (编辑态：已登录，可重新登录) ---- */
function SessionEdit({ meta }) {
  const [stage, setStage] = React.useState('done');   // done | open
  if (stage === 'open') {
    return (
      <div className="aa-webview">
        <div className="wv-bar">
          <span className="wv-dots"><i /><i /><i /></span>
          <span className="wv-addr"><Icon name="lock" size={11} strokeWidth={1.8} />{meta.loginUrl}</span>
        </div>
        <div className="wv-body">
          <div className="wv-card">
            <div className="wv-logo"><Icon name="user" size={22} color="var(--text-3)" /></div>
            <div className="wv-h">登录 {meta.host}</div>
            <div className="wv-inp" />
            <div className="wv-inp" />
            <button className="wv-go" onClick={() => setStage('done')}>登录</button>
          </div>
        </div>
        <div className="wv-foot"><Icon name="info" size={12} />登录成功后将自动捕获会话 Cookie 并关闭窗口</div>
      </div>
    );
  }
  return (
    <div className="aa-captured">
      <span className="cap-dot"><Icon name="check" size={14} color="#fff" strokeWidth={2.4} /></span>
      <div className="cap-text">
        <div className="cap-title">已通过网页登录</div>
        <div className="cap-sub">来自 {meta.host} · {meta.cookieKeys.join('、')}</div>
      </div>
      <button className="cap-redo" onClick={() => setStage('open')}>重新登录</button>
    </div>
  );
}

/* ---- 编辑账号 dialog — auth-aware: apikey 厂商显示密钥 (GLM / DeepSeek …)，
        session 厂商显示网页登录 (MiMo …)，local 厂商显示本地凭证；
        所有厂商共用「数据标签映射」(同源同步开关开启时该数据源共用)。 ---- */
function EditAccountDialog({ vendorId, accountName, onClose }) {
  const meta = SV_META[vendorId] || { name: vendorId };
  const auth = (window.VENDOR_AUTH && window.VENDOR_AUTH[vendorId]) || 'apikey';
  const akMeta = (window.AUTH_APIKEY_META && window.AUTH_APIKEY_META[vendorId]) || {};
  const seMeta = (window.AUTH_SESSION_META && window.AUTH_SESSION_META[vendorId]) || { host: '', loginUrl: '', cookieKeys: [] };
  const lcScan = (window.AUTH_LOCAL_SCAN && window.AUTH_LOCAL_SCAN[vendorId]) || { paths: [] };
  const rows = (window.VENDOR_RAW_LABELS && window.VENDOR_RAW_LABELS[vendorId]) || [];
  const refreshMeta = (window.VENDOR_REFRESH && window.VENDOR_REFRESH[vendorId]) || null;
  const globalInterval = window.__omniRefreshInterval || '5 分钟';
  const syncOn = window.__omniLabelSync !== false;   // 同源数据标签映射同步（默认开启）
  const [name, setName] = React.useState(accountName);
  const [key, setKey] = React.useState(auth === 'apikey' ? (akMeta.prefix || 'sk-') + '••••••••••••' : '');
  const [showKey, setShowKey] = React.useState(false);
  const [endpoint, setEndpoint] = React.useState('');
  const [useGlobalRefresh, setUseGlobalRefresh] = React.useState(!(refreshMeta && refreshMeta.manualDefault));
  const [acctInterval, setAcctInterval] = React.useState(refreshMeta && refreshMeta.manualDefault ? '仅手动' : '5 分钟');
  const [map, setMap] = React.useState({});
  const setLbl = (raw, v) => setMap((m) => ({ ...m, [raw]: v }));
  const resetLbl = (raw) => setMap((m) => { const n = { ...m }; delete n[raw]; return n; });
  return (
    <Dialog onClose={onClose}>
      <div className="ad-head">
        <span className="ad-mark"><VendorMark id={vendorId} size={24} /></span>
        <div className="ad-htext">
          <div className="ad-title">编辑账号</div>
          <div className="ad-sub">{meta.name}</div>
        </div>
        <button className="ad-close" onClick={onClose} title="关闭"><Icon name="close" size={17} strokeWidth={2} /></button>
      </div>
      <div className="ad-body">
        <div className="ad-field">
          <label className="ad-label">备注名</label>
          <input className="ad-input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="例如：工作账号" />
        </div>

        {auth === 'apikey' && (
          <>
            <div className="ad-field">
              <label className="ad-label">API 密钥</label>
              <div className="ad-key">
                <input className="ad-input mono" type={showKey ? 'text' : 'password'} value={key}
                  onChange={(e) => setKey(e.target.value)} placeholder={(akMeta.prefix || 'sk-') + '…'} />
                <button className="ad-eye" onClick={() => setShowKey((v) => !v)} title={showKey ? '隐藏' : '显示'}>
                  <Icon name={showKey ? 'eye_off' : 'eye'} size={16} />
                </button>
              </div>
              <div className="ad-hint"><Icon name="lock" size={12} strokeWidth={1.8} />密钥仅加密保存在本地，用于读取用量数据{akMeta.docs ? ` · ${akMeta.docs}` : ''}</div>
            </div>
            <div className="ad-field">
              <label className="ad-label">接口地址<span className="ad-opt">可选</span></label>
              <input className="ad-input mono" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={akMeta.endpoint || '默认（官方接口）'} />
            </div>
          </>
        )}

        {auth === 'session' && (
          <div className="ad-field">
            <label className="ad-label">登录会话</label>
            <SessionEdit meta={seMeta} />
            <div className="ad-hint"><Icon name="shield" size={12} strokeWidth={1.8} />该服务通过网页登录获取用量，无需 API 密钥</div>
          </div>
        )}

        {auth === 'local' && (
          <div className="ad-field">
            <label className="ad-label">凭证来源</label>
            <div className="aa-captured">
              <span className="cap-dot"><Icon name="check" size={14} color="#fff" strokeWidth={2.4} /></span>
              <div className="cap-text">
                <div className="cap-title">来自本地 CLI 授权文件</div>
                <div className="cap-sub">{lcScan.paths[0] || '~/.config'}</div>
              </div>
              <button className="cap-redo">重新扫描</button>
            </div>
            <div className="ad-hint"><Icon name="shield" size={12} strokeWidth={1.8} />该服务读取本地登录文件获取用量，无需 API 密钥</div>
          </div>
        )}

        {/* 账号级刷新间隔：跟随全局 / 独立设置（所有账号编辑均含） */}
        <div className="ad-field ad-refresh">
          <div className="ad-toggle-row">
            <div className="atr-text">
              <div className="atr-title">跟随全局自动刷新间隔</div>
              <div className="atr-sub">{useGlobalRefresh ? `当前全局为「${globalInterval}」自动刷新` : '已为该账号单独设置刷新频率'}</div>
            </div>
            <SPToggle on={useGlobalRefresh} onClick={() => setUseGlobalRefresh((v) => !v)} />
          </div>
          {!useGlobalRefresh && (
            <div className="ad-subfield">
              <span className="ad-sublabel">该账号刷新频率</span>
              <SPSelect value={acctInterval} onChange={setAcctInterval}
                options={['1 分钟', '5 分钟', '15 分钟', '30 分钟', '仅手动']} />
            </div>
          )}
          {refreshMeta && refreshMeta.note && (
            <div className="ad-hint"><Icon name="info" size={12} strokeWidth={1.8} />{refreshMeta.note}</div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="ad-field">
            <label className="ad-label">数据标签映射<span className="ad-opt">{syncOn ? '该数据源共用' : '仅此账号'}</span></label>
            <div className="lm-cols"><span>原始标签（来自接口）</span><span>显示名称</span></div>
            <div className="lm-list">
              {rows.map((r) => {
                const v = map[r.raw] ?? r.def;
                const changed = v !== r.def;
                return (
                  <div className="lm-row" key={r.raw}>
                    <code className="lm-raw" title={r.raw}>{r.raw}</code>
                    <span className="lm-arrow"><Icon name="chevron" size={14} /></span>
                    <div className="lm-inwrap">
                      <input className="lm-input" value={v} placeholder={r.def} onChange={(e) => setLbl(r.raw, e.target.value)} />
                      {changed && (
                        <button className="lm-reset" title="恢复默认" onClick={() => resetLbl(r.raw)}>
                          <Icon name="reset" size={13} strokeWidth={1.8} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="ad-foot">
        <div className="ad-foot-r">
          <button className="ad-btn ghost" onClick={onClose}>取消</button>
          <button className="ad-btn primary" onClick={onClose}>保存</button>
        </div>
      </div>
    </Dialog>
  );
}

/* ---- the single 「账号」 list (§5.5.6) — vendor cards + the CPA card ---- */
function AccountsPage({ onOpenDetail }) {
  const [off, setOff] = React.useState(() => new Set());
  const [hidden, setHidden] = React.useState(() => {
    const s = new Set();
    CONNECTIONS.forEach((c) => (c.accounts || []).forEach((a) => { if (a.hidden) s.add(a.id); }));
    return s;
  });
  const [edit, setEdit] = React.useState(null);   // { vendorId, name }

  const toggle = (id) => setOff((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleHide = (id) => setHidden((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const openEdit = (vendorId, name) => setEdit({ vendorId, name });

  return (
    <div className="acct-list">
      {CONNECTIONS.map((c) => {
        if (c.type === 'cpa') {
          return <CpaCard key={c.id} conn={c} on={!off.has(c.id)} onToggle={() => toggle(c.id)}
            onOpenDetail={() => onOpenDetail(c.id)} hiddenSet={hidden} onHide={toggleHide} onEditAcct={openEdit} />;
        }
        const vendor = { id: c.id, name: SV_META[c.id].name };
        return <VendorCard key={c.id} vendor={vendor} accounts={c.accounts}
          isOn={(id) => !off.has(id)} onToggle={toggle} onEditAcct={openEdit} />;
      })}
      {edit && <EditAccountDialog vendorId={edit.vendorId} accountName={edit.name} onClose={() => setEdit(null)} />}
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

function SettingsPanel({ theme, onTheme, accent, onAccent, barScheme, onBarScheme, barStyle, onBarStyle, onBack }) {
  const { AddAccountDialog } = window;   // routed add-account dialogs (add-account.jsx)
  const [section, setSection] = React.useState('accounts');
  const [detail, setDetail] = React.useState(null);      // connectionId of an open CPA 连接设置, or null
  const [dialog, setDialog] = React.useState(null);      // {type:'picker'|'vendor'|'cpa', vendorId?}
  const [s, setS] = React.useState({
    interval: '5 分钟', lang: '简体中文', panelMode: '浮动窗口', pin: true, floatHeight: '保持窗口大小',
    notifyNear: true, notifyLimit: true, notifyFail: true, notifyWay: '系统通知', cacheMax: '100 MB',
    labelMapSync: true,
  });
  const up = (k, v) => setS((p) => ({ ...p, [k]: v }));
  // expose 同源数据标签映射同步 so the 编辑账号 dialog reflects the current setting
  React.useEffect(() => { window.__omniLabelSync = s.labelMapSync; }, [s.labelMapSync]);
  // expose 全局自动刷新间隔 so the 编辑账号 dialog can show the current value
  React.useEffect(() => { window.__omniRefreshInterval = s.interval; }, [s.interval]);

  const nav = SP_NAV_BASE;
  // leave any open CPA detail when switching sections
  React.useEffect(() => { setDetail(null); }, [section]);

  const inDetail = section === 'accounts' && detail != null;

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
              <span style={{ cursor: 'pointer' }} onClick={() => setDetail(null)}>账号</span>
              <span className="cc-sep"><Icon name="chevron" size={15} /></span>
              <span className="cc-cur">CPA Manager</span>
            </div>
          </div>
        ) : (
          <div className="sp-head">
            <span className="sp-title">{headers[section]}</span>
            {section === 'accounts' && (
              <button className="sp-action" onClick={() => setDialog({ type: 'picker' })}>
                <Icon name="plus" size={15} color="#fff" strokeWidth={2.1} />添加
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
            {section === 'accounts' && <AccountsPage onOpenDetail={(id) => setDetail(id)} />}

            {section === 'general' && (
              <>
                <div className="set-group-label" style={{ marginTop: 0 }}>启动</div>
                <SPRow title="开机时自动启动" sub="登录系统后在后台运行并驻留托盘"><SPToggle on={true} onClick={() => {}} /></SPRow>
                <SPRow title="启动后最小化到托盘"><SPToggle on={true} onClick={() => {}} /></SPRow>
                <div className="set-group-label">刷新</div>
                <SPRow title="自动刷新间隔" sub="后台轮询各服务用量的频率">
                  <SPSelect value={s.interval} onChange={(v) => up('interval', v)} options={['1 分钟', '5 分钟', '15 分钟', '30 分钟', '仅手动']} />
                </SPRow>
                <div className="set-group-label">窗口</div>
                <SPRow title="主面板打开方式" sub="左键托盘图标永远打开主面板，外壳由这里决定">
                  <SPSelect value={s.panelMode} onChange={(v) => up('panelMode', v)} options={['跟随系统推荐', '弹出面板', '浮动窗口']} />
                </SPRow>
                <SPRow title="窗口始终置顶">
                  <SPToggle on={s.pin} onClick={() => up('pin', !s.pin)} />
                </SPRow>
                <SPRow title="浮动窗口高度" sub="保持窗口大小时内容在窗口内滚动；跟随内容变化时只能调整宽度">
                  <SPSelect value={s.floatHeight} onChange={(v) => up('floatHeight', v)} options={['保持窗口大小', '跟随内容变化']} />
                </SPRow>
                <div className="set-group-label">其他</div>
                <SPRow title="界面语言">
                  <SPSelect value={s.lang} onChange={(v) => up('lang', v)} options={['简体中文', 'English', '跟随系统']} />
                </SPRow>
                <SPRow title="同一数据源的数据标签映射同步" sub="同一数据源下的多个账号共用一套数据标签映射，编辑任一账号即同步到全部">
                  <SPToggle on={s.labelMapSync} onClick={() => up('labelMapSync', !s.labelMapSync)} />
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
                <SPRow title="用量条样式" sub="细线型信息密度高；粗胶囊型把数值放进条内，更醒目。">
                  <div className="set-seg">
                    {[['thin', '细线型'], ['capsule', '粗胶囊型']].map(([k, lb]) => (
                      <button key={k} className={barStyle === k ? 'on' : ''} onClick={() => onBarStyle(k)}>{lb}</button>
                    ))}
                  </div>
                </SPRow>
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
                  <img className="app-logo" src="logo.png" alt="" style={{ width: 60, height: 60, marginBottom: 14 }} />
                  <div className="aa-name">OmniUsage</div>
                  <div className="aa-ver">version 1.4.2 · win32-x64</div>
                  <div className="about-desc">一个跨平台的 AI 服务用量监控工具，实时查看 Claude、Codex、Gemini 等各服务的用量限制与 Token 趋势。</div>
                  <div className="about-actions">
                    <button className="ab-btn"><Icon name="globe" size={15} strokeWidth={1.7} />官网</button>
                    <button className="ab-btn"><Icon name="file" size={15} strokeWidth={1.7} />文档</button>
                    <button className="ab-btn"><Icon name="feedback" size={15} strokeWidth={1.7} />问卷反馈</button>
                    <button className="ab-btn primary"><Icon name="cloud" size={16} strokeWidth={1.7} color="#fff" />检查更新</button>
                    <button className="ab-btn heart"><Icon name="heart" size={15} strokeWidth={1.7} />支持作者</button>
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', marginTop: 26 }}>© 2026 OmniUsage · 跨平台 AI 用量监控</div>
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
        <AddAccountDialog vendorId={dialog.vendorId} onClose={() => setDialog(null)} />
      )}
      {dialog && dialog.type === 'cpa' && (
        <CpaAddDialog onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

Object.assign(window, { SettingsPanel });
