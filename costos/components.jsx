/* Shell components — Sidebar, Topbar, KPIs, Drawer */
const { useState, useEffect, useRef } = React;

function Sidebar({ view, setView, project, onSettings }) {
  const items = [
    { id: 'home', label: 'Inicio', icon: 'Home' },
    { id: 'projects', label: 'Proyectos', icon: 'Folder', badge: 6 },
    { id: 'budget', label: 'Presupuesto', icon: 'FileText', requires: 'project' },
    { id: 'materials', label: 'Materiales', icon: 'Box' },
    { id: 'labor', label: 'Mano de Obra', icon: 'HardHat' },
    { id: 'equipment', label: 'Herramientas / Equipo', icon: 'Wrench' },
    { id: 'subcontracts', label: 'Subcontratos', icon: 'Users' },
  ];
  const utilities = [
    { id: 'reports', label: 'Reportes', icon: 'ChartBar' },
    { id: 'library', label: 'Biblioteca', icon: 'BookOpen' },
    { id: 'plans', label: 'Planes y Facturación', icon: 'Crown' },
  ];
  return (
    <aside className="sidebar">
      <div className="side-brand">
        <div className="side-brand-mark"><window.I.Construction size={18} stroke={2} /></div>
        <div className="side-brand-text">
          <div className="side-brand-title">COTIZANTE</div>
          <div className="side-brand-sub">Presupuestos de Obra</div>
        </div>
      </div>

      <div className="side-section">
        <div className="side-section-label">Trabajo</div>
        <nav className="side-nav">
          {items.slice(0, 2).map(item => (
            <button key={item.id} className={`side-nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}>
              {React.createElement(window.I[item.icon], { size: 16, className: 'ico' })}
              <span>{item.label}</span>
              {item.badge && <span className="badge">{item.badge}</span>}
            </button>
          ))}
        </nav>
      </div>

      {project && (
        <div className="side-section">
          <div className="side-section-label truncate" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <window.I.Folder size={11} /> Proyecto Activo
          </div>
          <div style={{ padding: '4px 12px 8px', fontSize: 12, color: '#fff', fontWeight: 600, lineHeight: 1.35 }}>
            <div className="truncate" title={project.name}>{project.name}</div>
            <div style={{ fontSize: 11, color: 'var(--c-side-text-2)', fontWeight: 500, marginTop: 2 }}>Rev {project.revision} · {project.currency}</div>
          </div>
          <nav className="side-nav">
            {items.slice(2).map(item => (
              <button key={item.id} className={`side-nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}>
                {React.createElement(window.I[item.icon], { size: 16, className: 'ico' })}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      <div className="side-spacer"></div>

      <div className="side-section">
        <div className="side-section-label">Herramientas</div>
        <nav className="side-nav">
          {utilities.map(item => (
            <button key={item.id} className={`side-nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}>
              {React.createElement(window.I[item.icon], { size: 16, className: 'ico' })}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="side-foot">
        <div className="side-user" onClick={onSettings}>
          <div className="avatar">{window.MOCK.USER.initials}</div>
          <div className="side-user-info">
            <div className="side-user-name">{window.MOCK.USER.name}</div>
            <div className="side-user-email">{window.MOCK.COMPANY.name}</div>
          </div>
          <window.I.Settings size={15} style={{ color: 'var(--c-side-text-2)', flexShrink: 0 }} />
        </div>
      </div>
    </aside>
  );
}

function Topbar({ crumbs = [], onSettings, onNotifications, actions, onHome, project }) {
  return (
    <div className="topbar">
      <div className="crumbs">
        <button className="icon-btn" onClick={onHome} title="Inicio">
          <window.I.Home size={16} />
        </button>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            <window.I.Chevron size={14} className="crumb-sep" />
            {c.onClick
              ? <button className="crumb crumb-btn" onClick={c.onClick}>{c.label}</button>
              : <span className={`crumb ${i === crumbs.length - 1 ? 'cur' : ''}`}>{c.label}</span>}
          </React.Fragment>
        ))}
      </div>

      <div className="topbar-search">
        <window.I.Search size={14} />
        <input placeholder="Buscar proyectos, actividades, materiales…" />
        <kbd>⌘K</kbd>
      </div>

      <div className="topbar-actions">
        {actions}
        <button className="icon-btn" title="Notificaciones" onClick={onNotifications}>
          <window.I.Bell size={16} />
          <span className="dot"></span>
        </button>
        <button className="icon-btn" title="Configuración" onClick={onSettings}>
          <window.I.Settings size={16} />
        </button>
        <div style={{ width: 1, height: 22, background: 'var(--c-line)', margin: '0 4px' }}></div>
        <button className="icon-btn" title="Cerrar sesión">
          <window.I.LogOut size={16} />
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    active:   { label: 'Activo',     cls: 'success', dot: 'var(--c-success)' },
    review:   { label: 'En Revisión',cls: 'warn',    dot: 'var(--c-warn)' },
    draft:    { label: 'Borrador',   cls: '',        dot: 'var(--c-text-3)' },
    approved: { label: 'Aprobado',   cls: 'primary', dot: 'var(--c-primary)' },
  };
  const s = map[status] || map.draft;
  return (
    <span className={`badge ${s.cls}`}>
      <span className="pip" style={{ background: s.dot }}></span>
      {s.label}
    </span>
  );
}

function formatMoney(amount, currency = 'USD') {
  const sym = currency === 'USD' ? '$' : 'L';
  return sym + ' ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatShort(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toFixed(0);
}

/* ============ Drawer ============ */
function Drawer({ open, onClose, title, subtitle, children, footer, width }) {
  if (!open) return null;
  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose}></div>
      <div className="drawer" style={width ? { width } : null}>
        <div className="drawer-head">
          <div>
            <div className="drawer-title">{title}</div>
            {subtitle && <div className="drawer-sub">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose}><window.I.X size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </React.Fragment>
  );
}

/* ============ Modal ============ */
function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose}></div>
      <div className="modal">
        <div className="drawer-head">
          <div className="drawer-title">{title}</div>
          <button className="icon-btn" onClick={onClose}><window.I.X size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </React.Fragment>
  );
}

/* ============ KPI ============ */
function KPI({ label, value, icon, foot, delta, highlight, currency = 'USD' }) {
  const Icon = icon ? window.I[icon] : null;
  return (
    <div className={`kpi ${highlight ? 'highlight' : ''}`}>
      <div className="kpi-label">
        {Icon && <Icon size={12} className="ico" />}
        {label}
      </div>
      <div className="kpi-val">{typeof value === 'number' ? formatMoney(value, currency) : value}</div>
      {foot && (
        <div className="kpi-foot">
          {delta != null && (
            <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}%
            </span>
          )}
          <span>{foot}</span>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, StatusBadge, Drawer, Modal, KPI, formatMoney, formatShort });
