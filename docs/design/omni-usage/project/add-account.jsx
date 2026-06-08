/* add-account.jsx — auth-method-aware「添加账号」dialogs.
   One <AddAccountDialog> routes by VENDOR_AUTH[vendorId]:
     apikey  → API-key form            (DeepSeek, GLM, Gemini, Tavily, MiniMax)
     session → webview login / cookie  (MiMo, Kimi)
     local   → scan local auth files   (Claude, Codex, Antigravity)
   Every method shares the「数据标签映射」editor so users can rename the raw
   labels the vendor API returns. Self-contained Dialog shell (own scrim). */

/* ---------- shared shell ---------- */
function AADialog({ onClose, wide, children }) {
  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="acct-dialog-scrim" onMouseDown={onClose}>
      <div className={'acct-dialog aa' + (wide ? ' wide' : '')} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function AAHead({ vendorId, title, sub, onClose }) {
  return (
    <div className="ad-head">
      <span className="ad-mark"><VendorMark id={vendorId} size={24} /></span>
      <div className="ad-htext">
        <div className="ad-title">{title}</div>
        <div className="ad-sub">{sub}</div>
      </div>
      <button className="ad-close" onClick={onClose} title="关闭"><Icon name="close" size={17} strokeWidth={2} /></button>
    </div>
  );
}

function NameField({ value, onChange, placeholder, autoFocus }) {
  return (
    <div className="ad-field">
      <label className="ad-label">账号名称<span className="ad-opt">显示用</span></label>
      <input className="ad-input" value={value} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder || '例如：工作账号'} />
    </div>
  );
}

/* =================================================================
   METHOD 1 — API KEY  (DeepSeek …)
   ================================================================= */
function ApiKeyBody({ vendorId, name, setName }) {
  const meta = AUTH_APIKEY_META[vendorId] || {};
  const [key, setKey] = React.useState('');
  const [endpoint, setEndpoint] = React.useState('');
  const [show, setShow] = React.useState(false);
  return (
    <>
      <NameField value={name} onChange={setName} autoFocus />
      <div className="ad-field">
        <label className="ad-label">API 密钥</label>
        <div className="ad-key">
          <input className="ad-input mono" type={show ? 'text' : 'password'} value={key}
            onChange={(e) => setKey(e.target.value)} placeholder={(meta.prefix || 'sk-') + '…'} />
          <button className="ad-eye" onClick={() => setShow((v) => !v)} title={show ? '隐藏' : '显示'}>
            <Icon name={show ? 'eye_off' : 'eye'} size={16} />
          </button>
        </div>
        <div className="ad-hint"><Icon name="lock" size={12} strokeWidth={1.8} />密钥仅加密保存在本地{meta.docs ? `，在 ${meta.docs} 获取` : ''}</div>
      </div>
      <div className="ad-field">
        <label className="ad-label">接口地址<span className="ad-opt">可选</span></label>
        <input className="ad-input mono" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}
          placeholder={meta.endpoint || '默认（官方接口）'} />
      </div>
    </>
  );
}

/* =================================================================
   METHOD 2 — SESSION (webview login / paste cookie)  (MiMo …)
   ================================================================= */
function WebviewLogin({ meta, captured, onCapture }) {
  const [stage, setStage] = React.useState('idle');   // idle | open | done
  React.useEffect(() => { if (captured) setStage('done'); }, []);
  if (stage === 'done' || captured) {
    return (
      <div className="aa-captured">
        <span className="cap-dot"><Icon name="check" size={14} color="#fff" strokeWidth={2.4} /></span>
        <div className="cap-text">
          <div className="cap-title">已捕获登录会话</div>
          <div className="cap-sub">来自 {meta.host} · {meta.cookieKeys.join('、')}</div>
        </div>
        <button className="cap-redo" onClick={() => { onCapture(false); setStage('idle'); }}>重新登录</button>
      </div>
    );
  }
  if (stage === 'idle') {
    return (
      <button className="aa-loginbtn" onClick={() => setStage('open')}>
        <span className="lb-ic"><Icon name="globe" size={17} /></span>
        <span className="lb-text">打开登录窗口</span>
        <span className="lb-host">{meta.host}</span>
      </button>
    );
  }
  /* open — mock electron webview */
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
          <button className="wv-go" onClick={() => { onCapture(true); setStage('done'); }}>登录</button>
        </div>
      </div>
      <div className="wv-foot"><Icon name="info" size={12} />登录成功后将自动捕获会话 Cookie 并关闭窗口</div>
    </div>
  );
}

function SessionBody({ vendorId, name, setName }) {
  const meta = AUTH_SESSION_META[vendorId] || { host: '', loginUrl: '', cookieKeys: [] };
  const [method, setMethod] = React.useState('web');   // web | cookie
  const [captured, setCaptured] = React.useState(false);
  const [cookie, setCookie] = React.useState('');
  return (
    <>
      <NameField value={name} onChange={setName} />
      <div className="ad-field">
        <label className="ad-label">登录方式</label>
        <div className="aa-tabs">
          <button className={'aa-tab' + (method === 'web' ? ' on' : '')} onClick={() => setMethod('web')}>
            <Icon name="globe" size={14} />网页登录
          </button>
          <button className={'aa-tab' + (method === 'cookie' ? ' on' : '')} onClick={() => setMethod('cookie')}>
            <Icon name="clipboard" size={14} />粘贴 Cookie
          </button>
        </div>
      </div>
      {method === 'web' ? (
        <div className="ad-field">
          <WebviewLogin meta={meta} captured={captured} onCapture={setCaptured} />
          <div className="ad-hint"><Icon name="shield" size={12} strokeWidth={1.8} />会话仅保存在本地，用于读取用量；不会上传</div>
        </div>
      ) : (
        <div className="ad-field">
          <label className="ad-label">Cookie 字符串</label>
          <textarea className="aa-textarea mono" value={cookie} onChange={(e) => setCookie(e.target.value)}
            placeholder={'在浏览器登录 ' + meta.host + ' 后，从开发者工具复制完整 Cookie…'} />
          <div className="cookie-keys">
            <span className="ck-label">需包含</span>
            {meta.cookieKeys.map((k) => <code key={k} className="ck-chip">{k}</code>)}
          </div>
        </div>
      )}
    </>
  );
}

/* =================================================================
   METHOD 3 — LOCAL AUTH FILE SCAN  (Claude, Codex …)
   ================================================================= */
function LocalBody({ vendorId, onPick }) {
  const scan = AUTH_LOCAL_SCAN[vendorId] || { paths: [], found: [] };
  const [phase, setPhase] = React.useState('scanning');   // scanning | done
  const [picked, setPicked] = React.useState(() => new Set());

  const runScan = React.useCallback(() => {
    setPhase('scanning'); setPicked(new Set());
    const t = setTimeout(() => {
      setPhase('done');
      setPicked(new Set(scan.found.filter((f) => f.fresh).map((f) => f.id)));   // pre-select valid ones
    }, 1100);
    return () => clearTimeout(t);
  }, [vendorId]);
  React.useEffect(runScan, [vendorId]);
  React.useEffect(() => { onPick(picked.size); }, [picked]);

  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <div className="scan-paths">
        <span className="sp-h"><Icon name="search" size={13} strokeWidth={1.8} />扫描位置</span>
        {scan.paths.map((p) => <code key={p} className="sp-path">{p}</code>)}
      </div>

      {phase === 'scanning' ? (
        <div className="scan-busy">
          <span className="sb-spin"><Icon name="refresh" size={16} /></span>正在扫描本地授权文件…
        </div>
      ) : (
        <div className="scan-found">
          <div className="sf-head">
            <span className="sf-title">发现 {scan.found.length} 个凭证</span>
            <button className="sf-rescan" onClick={runScan}><Icon name="reset" size={13} strokeWidth={1.8} />重新扫描</button>
          </div>
          {scan.found.map((f) => {
            const on = picked.has(f.id);
            return (
              <button key={f.id} className={'found-row' + (on ? ' on' : '') + (f.fresh ? '' : ' stale')}
                onClick={() => f.fresh && toggle(f.id)} disabled={!f.fresh}>
                <span className={'fr-check' + (on ? ' on' : '')}>
                  {on && <Icon name="check" size={12} color="#fff" strokeWidth={2.6} />}
                </span>
                <span className="fr-body">
                  <span className="fr-acct">{f.account}</span>
                  <span className="fr-path"><Icon name="file" size={11} strokeWidth={1.7} />{f.path}</span>
                </span>
                <span className="fr-meta">
                  <span className="fr-type">{f.type}</span>
                  <span className={'fr-exp' + (f.fresh ? '' : ' bad')}>{f.expires}</span>
                </span>
              </button>
            );
          })}
          <button className="scan-manual"><Icon name="folder" size={14} />手动选择文件…</button>
        </div>
      )}
    </>
  );
}

/* =================================================================
   ROOT — routes by auth method
   ================================================================= */
function AddAccountDialog({ vendorId, onClose }) {
  const meta = SV_META[vendorId] || { name: vendorId };
  const auth = VENDOR_AUTH[vendorId] || 'apikey';
  const [name, setName] = React.useState('');
  const [pickedCount, setPickedCount] = React.useState(0);

  const subByAuth = {
    apikey:  '粘贴 API 密钥即可接入',
    session: '网页登录或粘贴 Cookie',
    local:   '扫描本地 CLI 授权文件',
  };
  const footByAuth = {
    apikey:  { test: '测试连接', primary: '添加账号' },
    session: { test: '测试连接', primary: '添加账号' },
    local:   { test: null,       primary: pickedCount > 1 ? `导入 ${pickedCount} 个账号` : '导入账号' },
  };
  const foot = footByAuth[auth];
  const canSave = auth === 'local' ? pickedCount > 0 : true;
  const wide = auth === 'local';

  return (
    <AADialog onClose={onClose} wide={wide}>
      <AAHead vendorId={vendorId} title={`添加 ${meta.name} 账号`} sub={subByAuth[auth]} onClose={onClose} />
      <div className="ad-body">
        {auth === 'apikey' && <ApiKeyBody vendorId={vendorId} name={name} setName={setName} />}
        {auth === 'session' && <SessionBody vendorId={vendorId} name={name} setName={setName} />}
        {auth === 'local' && <LocalBody vendorId={vendorId} onPick={setPickedCount} />}
      </div>
      <div className="ad-foot">
        {foot.test && <button className="ad-test"><Icon name="refresh" size={14} strokeWidth={1.9} />{foot.test}</button>}
        <div className="ad-foot-r">
          <button className="ad-btn ghost" onClick={onClose}>取消</button>
          <button className={'ad-btn primary' + (canSave ? '' : ' disabled')} onClick={canSave ? onClose : undefined}>{foot.primary}</button>
        </div>
      </div>
    </AADialog>
  );
}

Object.assign(window, { AddAccountDialog });

/* =================================================================
   数据标签映射 — per-account editor (opened from the accounts list).
   The account already exists, so the raw labels its API returns are
   known; here the user renames each for display in the main panel.
   ================================================================= */
function LabelMapDialog({ vendorId, accountName, synced, onClose }) {
  const meta = SV_META[vendorId] || { name: vendorId };
  const rows = VENDOR_RAW_LABELS[vendorId] || [];
  const [map, setMap] = React.useState({});
  const changedCount = rows.filter((r) => (map[r.raw] ?? r.def) !== r.def).length;
  const set = (raw, v) => setMap((m) => ({ ...m, [raw]: v }));
  const reset = (raw) => setMap((m) => { const n = { ...m }; delete n[raw]; return n; });
  const resetAll = () => setMap({});

  return (
    <AADialog onClose={onClose}>
      <div className="ad-head">
        <span className="ad-mark"><Icon name="tag" size={20} strokeWidth={1.7} /></span>
        <div className="ad-htext">
          <div className="ad-title">数据标签映射</div>
          <div className="ad-sub">{meta.name} · {accountName}</div>
        </div>
        <button className="ad-close" onClick={onClose} title="关闭"><Icon name="close" size={17} strokeWidth={2} /></button>
      </div>
      <div className="ad-body">
        {rows.length === 0 ? (
          <div className="lm-empty">
            <span className="lme-ic"><Icon name="tag" size={20} /></span>
            <div className="lme-title">该服务暂无可映射的数据标签</div>
            <div className="lme-sub">完成一次成功同步后，接口返回的标签会显示在这里。</div>
          </div>
        ) : (
          <>
            <div className="lm-meta">
              <Icon name="info" size={13} />以下标签来自接口最近一次返回{synced ? ` · ${synced}` : ''}
            </div>
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
                      <input className="lm-input" value={v} placeholder={r.def}
                        onChange={(e) => set(r.raw, e.target.value)} />
                      {changed && (
                        <button className="lm-reset" title="恢复默认" onClick={() => reset(r.raw)}>
                          <Icon name="reset" size={13} strokeWidth={1.8} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <div className="ad-foot">
        {rows.length > 0 && (
          <button className="ad-test" onClick={resetAll} disabled={!changedCount}
            style={changedCount ? undefined : { opacity: .45, cursor: 'default' }}>
            <Icon name="reset" size={14} strokeWidth={1.9} />全部恢复默认
          </button>
        )}
        <div className="ad-foot-r">
          <button className="ad-btn ghost" onClick={onClose}>取消</button>
          <button className="ad-btn primary" onClick={onClose}>保存映射</button>
        </div>
      </div>
    </AADialog>
  );
}

Object.assign(window, { AddAccountDialog, LabelMapDialog });
