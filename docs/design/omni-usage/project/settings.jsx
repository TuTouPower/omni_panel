/* settings.jsx — compact two-column settings (left categories, right content) */

function Toggle({ on, onClick, disabled }) {
  return (
    <button className="sw" data-on={on ? '1' : '0'} disabled={disabled}
      onClick={disabled ? undefined : onClick}><i /></button>
  );
}

function SetRow({ title, sub, children }) {
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

function Select({ value, onChange, options }) {
  return (
    <select className="set-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

const SET_NAV = [
  { id: 'general', label: '常规', icon: 'gear' },
  { id: 'accounts', label: '账号', icon: 'inbox' },
  { id: 'appearance', label: '外观', icon: 'palette' },
  { id: 'notify', label: '通知', icon: 'bell' },
  { id: 'data', label: '数据与隐私', icon: 'shield' },
  { id: 'about', label: '关于', icon: 'info' },
];

const ACCENTS = ['#3d7afd', '#6f5cf6', '#0ea5a3', '#f5772f', '#e23744'];

/* Add / edit account dialog — same form, two modes */
function AccountDialog({ mode, vendor, account, onClose }) {
  const isEdit = mode === 'edit';
  const [name, setName] = React.useState(isEdit ? account.name : '');
  const [key, setKey] = React.useState(isEdit ? account.key : '');
  const [endpoint, setEndpoint] = React.useState('');
  const [interval, setInterval] = React.useState(isEdit && account.interval ? account.interval : '跟随全局设置');
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const canSave = name.trim() && key.trim();

  return (
    <div className="acct-dialog-scrim" onMouseDown={onClose}>
      <div className="acct-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ad-head">
          <span className="ad-mark"><VendorMark id={vendor.id} size={24} /></span>
          <div className="ad-htext">
            <div className="ad-title">{isEdit ? '编辑账号' : '添加账号'}</div>
            <div className="ad-sub">{vendor.name}{isEdit ? ' · ' + account.name : ''}</div>
          </div>
          <button className="ad-close" onClick={onClose} title="关闭"><Icon name="close" size={17} strokeWidth={2} /></button>
        </div>

        <div className="ad-body">
          <div className="ad-field">
            <label className="ad-label">账号名称</label>
            <input className="ad-input" value={name} autoFocus
              onChange={(e) => setName(e.target.value)} placeholder="例如：工作账号" />
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
            <label className="ad-label">刷新频率</label>
            <select className="ad-select" value={interval} onChange={(e) => setInterval(e.target.value)}>
              {['跟随全局设置', '1 分钟', '5 分钟', '15 分钟', '30 分钟', '仅手动'].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <div className="ad-hint"><Icon name="clock" size={12} strokeWidth={1.8} />单独设置该账号的后台轮询间隔，覆盖全局设置</div>
          </div>

          <div className="ad-field">
            <label className="ad-label">接口地址<span className="ad-opt">可选</span></label>
            <input className="ad-input mono" value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)} placeholder="默认（官方接口）" />
          </div>
        </div>

        <div className="ad-foot">
          <button className="ad-test"><Icon name="refresh" size={14} strokeWidth={1.9} />测试连接</button>
          <div className="ad-foot-r">
            <button className="ad-btn ghost" onClick={onClose}>取消</button>
            <button className={'ad-btn primary' + (canSave ? '' : ' disabled')}
              onClick={canSave ? onClose : undefined}>{isEdit ? '保存' : '添加账号'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Settings({ onBack, theme, onTheme, accent, onAccent, autostart, onAutostart,
                    pauseRefresh, onPauseRefresh, disabledSet, onToggleDisabled }) {
  const [section, setSection] = React.useState('general');
  const [dialog, setDialog] = React.useState(null); // { mode:'add'|'edit', vendor, account }
  const [s, setS] = React.useState({
    lang: '简体中文', interval: '5 分钟', pin: false, trayClick: '打开主面板',
    cacheMax: '100 MB',
    notifyNear: true, notifyLimit: true, notifyFail: true, notifyWay: '系统通知',
  });
  const up = (k, v) => setS((p) => ({ ...p, [k]: v }));

  return (
    <div className="settings">
      <div className="settings-head">
        <button className="back-btn" onClick={onBack}><Icon name="back" size={20} /></button>
        <span className="sh-title">设置</span>
      </div>
      <div className="settings-body">
        <div className="set-nav">
          {SET_NAV.map((n) => (
            <button key={n.id} className={'set-nav-item' + (section === n.id ? ' on' : '')}
              onClick={() => setSection(n.id)}>
              <span className="sn-ic"><Icon name={n.icon} size={16} strokeWidth={1.7} /></span>
              {n.label}
            </button>
          ))}
        </div>

        <div className="set-content">
          {section === 'general' && (
            <>
              <div className="set-group-label">启动</div>
              <SetRow title="开机时自动启动" sub="登录系统后在后台运行并驻留托盘">
                <Toggle on={autostart} onClick={() => onAutostart(!autostart)} />
              </SetRow>
              <SetRow title="启动后最小化到托盘">
                <Toggle on={true} onClick={() => {}} />
              </SetRow>
              <div className="set-group-label">刷新</div>
              <SetRow title="自动刷新间隔" sub="后台轮询各服务用量的频率">
                <Select value={s.interval} onChange={(v) => up('interval', v)}
                  options={['1 分钟', '5 分钟', '15 分钟', '30 分钟', '仅手动']} />
              </SetRow>
              <SetRow title="暂停自动刷新" sub="临时停止后台轮询">
                <Toggle on={pauseRefresh} onClick={() => onPauseRefresh(!pauseRefresh)} />
              </SetRow>
              <div className="set-group-label">窗口</div>
              <SetRow title="窗口始终置顶">
                <Toggle on={s.pin} onClick={() => up('pin', !s.pin)} />
              </SetRow>
              <SetRow title="点击托盘图标">
                <Select value={s.trayClick} onChange={(v) => up('trayClick', v)}
                  options={['打开主面板', '打开菜单']} />
              </SetRow>
              <SetRow title="界面语言">
                <Select value={s.lang} onChange={(v) => up('lang', v)}
                  options={['简体中文', 'English', '跟随系统']} />
              </SetRow>
            </>
          )}

          {section === 'accounts' && (
            <>
              <div className="acct-intro">关闭后该卡片不再显示在主面板，也会停止刷新用量。可随时在此重新启用。</div>
              {VENDORS.map((v) => {
                const vKey = 'v:' + v.id;
                const vOff = disabledSet.has(vKey);
                return (
                <div className={'acct-group' + (vOff ? ' off' : '')} key={v.id}>
                  <div className="acct-group-head">
                    <VendorMark id={v.id} size={22} />
                    <span className="agh-name">{v.name}</span>
                    <button className="agh-add" title={'添加 ' + v.name + ' 账号'}
                      onClick={() => setDialog({ mode: 'add', vendor: v })}>
                      <Icon name="plus" size={16} strokeWidth={2.2} />
                    </button>
                    <Toggle on={!vOff} onClick={() => onToggleDisabled(vKey)} />
                  </div>
                  <div className="acct-rows">
                    {v.accounts.map((a) => {
                      const aKey = 'a:' + v.id + ':' + a.key;
                      const aOff = disabledSet.has(aKey);
                      const off = vOff || aOff;
                      return (
                      <div className={'acct-row' + (off ? ' off' : '')} key={a.key}>
                        <span className={'ar-dot' + (off ? ' off' : '')} />
                        <span className="ar-name">{a.name}</span>
                        {off && <span className="ar-off">已关闭</span>}
                        <div className="ar-actions">
                          <button className="icon-btn ar-ic" title="编辑"
                            onClick={() => setDialog({ mode: 'edit', vendor: v, account: a })}><Icon name="edit" size={15} /></button>
                          <button className="icon-btn ar-ic" title="删除"><Icon name="trash" size={15} /></button>
                          <Toggle on={!off} disabled={vOff} onClick={() => onToggleDisabled(aKey)} />
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </>
          )}

          {section === 'appearance' && (
            <>
              <div className="set-group-label">主题</div>
              <SetRow title="配色方案">
                <div className="set-seg">
                  {[['light', '浅色'], ['dark', '深色'], ['system', '跟随系统']].map(([k, lb]) => (
                    <button key={k} className={theme === k ? 'on' : ''} onClick={() => onTheme(k)}>{lb}</button>
                  ))}
                </div>
              </SetRow>
              <SetRow title="强调色" sub="用于选中状态、5 小时进度与主要操作">
                <div className="accent-row">
                  {ACCENTS.map((c) => (
                    <button key={c} className={'accent-sw' + (accent === c ? ' on' : '')}
                      style={{ background: c, color: c }} onClick={() => onAccent(c)} />
                  ))}
                </div>
              </SetRow>
            </>
          )}

          {section === 'notify' && (
            <>
              <div className="set-group-label">用量提醒</div>
              <SetRow title="接近限制时提醒" sub="任一周期用量达到 80% 时">
                <Toggle on={s.notifyNear} onClick={() => up('notifyNear', !s.notifyNear)} />
              </SetRow>
              <SetRow title="达到限制时提醒" sub="任一周期用量达到 100% 时">
                <Toggle on={s.notifyLimit} onClick={() => up('notifyLimit', !s.notifyLimit)} />
              </SetRow>
              <SetRow title="刷新失败时提醒" sub="连续刷新失败或凭证失效时">
                <Toggle on={s.notifyFail} onClick={() => up('notifyFail', !s.notifyFail)} />
              </SetRow>
              <div className="set-group-label">方式</div>
              <SetRow title="提醒方式">
                <Select value={s.notifyWay} onChange={(v) => up('notifyWay', v)}
                  options={['系统通知', '托盘图标角标', '仅应用内', '关闭']} />
              </SetRow>
            </>
          )}

          {section === 'data' && (
            <>
              <div className="set-group-label">存储</div>
              <SetRow title="本地缓存上限" sub="历史趋势数据占用的最大空间，超出后自动清理最旧记录">
                <Select value={s.cacheMax} onChange={(v) => up('cacheMax', v)}
                  options={['50 MB', '100 MB', '200 MB', '500 MB', '不限制']} />
              </SetRow>
              <SetRow title="本地用量缓存" sub="历史趋势数据 · 占用 4.2 MB">
                <button className="set-select" style={{ background: 'var(--field-bg)' }}>清除</button>
              </SetRow>
              <div className="set-group-label">数据</div>
              <SetRow title="导出用量数据" sub="导出为 CSV / JSON">
                <button className="set-select" style={{ background: 'var(--field-bg)' }}>导出</button>
              </SetRow>
              <SetRow title="匿名使用统计" sub="帮助改进 OmniUsage，不含任何用量内容">
                <Toggle on={false} onClick={() => {}} />
              </SetRow>
              <div className="set-group-label" style={{ color: 'var(--red)' }}>危险区域</div>
              <SetRow title="重置应用" sub="清除全部账号、设置与缓存">
                <button className="set-select" style={{ color: 'var(--red)', borderColor: 'color-mix(in srgb,var(--red) 35%,transparent)' }}>重置</button>
              </SetRow>
            </>
          )}

          {section === 'about' && (
            <>
              <div className="about-app">
                <img className="app-logo" src="logo.png" alt="" style={{ width: 56, height: 56, marginBottom: 12 }} />
                <div className="aa-name">OmniUsage</div>
                <div className="aa-ver">版本 1.4.2 · 已是最新版本</div>
                <button className="btn-primary" style={{ marginTop: 14 }}>
                  <Icon name="refresh" size={15} color="#fff" />检查更新
                </button>
              </div>
              <div className="about-links">
                <SetRow title="更新日志"><Icon name="chevron" size={16} color="var(--text-3)" /></SetRow>
                <SetRow title="开源许可"><Icon name="chevron" size={16} color="var(--text-3)" /></SetRow>
                <SetRow title="反馈问题"><Icon name="chevron" size={16} color="var(--text-3)" /></SetRow>
                <SetRow title="访问官网"><Icon name="open" size={15} color="var(--text-3)" /></SetRow>
              </div>
              <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', marginTop: 18 }}>
                © 2026 OmniUsage · 跨平台 AI 用量监控
              </div>
            </>
          )}
        </div>
      </div>
      {dialog && (
        <AccountDialog key={dialog.mode + ':' + dialog.vendor.id + ':' + (dialog.account ? dialog.account.key : '')}
          mode={dialog.mode} vendor={dialog.vendor} account={dialog.account}
          onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

Object.assign(window, { Settings });