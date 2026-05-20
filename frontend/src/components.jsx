// Shell components: Sidebar, Topbar, StatusBadge, Drawer, Modal, KPI
import React, { useState } from 'react'
import { I } from './icons'

export function Sidebar({ view, setView, project, onSettings, user, company }) {
  const items = [
    { id: 'home',     label: 'Inicio',              icon: 'Home' },
    { id: 'projects', label: 'Proyectos',            icon: 'Folder' },
    { id: 'budget',   label: 'Presupuesto',          icon: 'FileText', requires: 'project' },
    { id: 'materials',label: 'Materiales',           icon: 'Box' },
    { id: 'labor',    label: 'Mano de Obra',         icon: 'HardHat' },
    { id: 'equipment',label: 'Herramientas / Equipo',icon: 'Wrench' },
    { id: 'subcontracts',label:'Subcontratos',       icon: 'Users' },
  ]
  const utilities = [
    { id: 'reports',  label: 'Reportes',             icon: 'ChartBar' },
    { id: 'library',  label: 'Biblioteca',           icon: 'BookOpen' },
    { id: 'plans',    label: 'Planes y Facturación', icon: 'Crown' },
  ]

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email || 'U').slice(0, 2).toUpperCase()

  const displayName = user?.user_metadata?.full_name || user?.email || 'Usuario'
  const companyName = company?.company_name || 'Arrow Budget'

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <div className="side-brand-mark">
          <img src="/favicon.png" alt="Arrow Budget" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='grid' }} />
          <I.Construction size={18} stroke={2} style={{ display: 'none', color: '#14213D' }} />
        </div>
        <div className="side-brand-text">
          <div className="side-brand-title">ARROW BUDGET</div>
          <div className="side-brand-sub">Presupuestos de Obra</div>
        </div>
      </div>

      <div className="side-section">
        <div className="side-section-label">Trabajo</div>
        <nav className="side-nav">
          {items.slice(0, 2).map(item => (
            <button key={item.id}
              className={`side-nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => setView(item.id)}>
              {React.createElement(I[item.icon], { size: 16, className: 'ico' })}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {project && (
        <div className="side-section">
          <div className="side-section-label truncate" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <I.Folder size={11} /> Proyecto Activo
          </div>
          <div style={{ padding: '4px 12px 8px', fontSize: 12, color: '#fff', fontWeight: 600, lineHeight: 1.35 }}>
            <div className="truncate" title={project.name}>{project.name}</div>
            <div style={{ fontSize: 11, color: 'var(--c-side-text-2)', fontWeight: 500, marginTop: 2 }}>
              Rev {project.revision} · {project.currency}
            </div>
          </div>
          <nav className="side-nav">
            {items.slice(2).map(item => (
              <button key={item.id}
                className={`side-nav-item ${view === item.id ? 'active' : ''}`}
                onClick={() => setView(item.id)}>
                {React.createElement(I[item.icon], { size: 16, className: 'ico' })}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      <div className="side-spacer" />

      <div className="side-section">
        <div className="side-section-label">Herramientas</div>
        <nav className="side-nav">
          {utilities.map(item => (
            <button key={item.id}
              className={`side-nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => setView(item.id)}>
              {React.createElement(I[item.icon], { size: 16, className: 'ico' })}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="side-foot">
        <div className="side-user" onClick={onSettings}>
          <div className="avatar">{initials}</div>
          <div className="side-user-info">
            <div className="side-user-name">{displayName}</div>
            <div className="side-user-email">{companyName}</div>
          </div>
          <I.Settings size={15} style={{ color: 'var(--c-side-text-2)', flexShrink: 0 }} />
        </div>
      </div>
    </aside>
  )
}

export function Topbar({ crumbs = [], onSettings, actions, onHome, project, onSignOut }) {
  return (
    <div className="topbar">
      <div className="crumbs">
        <button className="icon-btn" onClick={onHome} title="Inicio">
          <I.Home size={16} />
        </button>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            <I.Chevron size={14} className="crumb-sep" />
            {c.onClick
              ? <button className="crumb crumb-btn" onClick={c.onClick}>{c.label}</button>
              : <span className={`crumb ${i === crumbs.length - 1 ? 'cur' : ''}`}>{c.label}</span>}
          </React.Fragment>
        ))}
      </div>

      <div className="topbar-search">
        <I.Search size={14} />
        <input placeholder="Buscar proyectos, actividades…" />
        <kbd>⌘K</kbd>
      </div>

      <div className="topbar-actions">
        {actions}
        <button className="icon-btn" title="Configuración" onClick={onSettings}>
          <I.Settings size={16} />
        </button>
        <div style={{ width: 1, height: 22, background: 'var(--c-line)', margin: '0 4px' }} />
        <button className="icon-btn" title="Cerrar sesión" onClick={onSignOut}>
          <I.LogOut size={16} />
        </button>
      </div>
    </div>
  )
}

export function StatusBadge({ status }) {
  const map = {
    active:   { label: 'Activo',      cls: 'success' },
    review:   { label: 'En Revisión', cls: 'warn' },
    draft:    { label: 'Borrador',    cls: '' },
    approved: { label: 'Aprobado',    cls: 'primary' },
  }
  const s = map[status] || map.draft
  return (
    <span className={`badge ${s.cls}`}>
      <span className="pip" />
      {s.label}
    </span>
  )
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width }) {
  if (!open) return null
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" style={width ? { width } : null}>
        <div className="drawer-head">
          <div>
            <div className="drawer-title">{title}</div>
            {subtitle && <div className="drawer-sub">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose}><I.X size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </>
  )
}

export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal">
        <div className="drawer-head">
          <div className="drawer-title">{title}</div>
          <button className="icon-btn" onClick={onClose}><I.X size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </>
  )
}

export function KPI({ label, value, icon, foot, delta, highlight, currency = 'USD' }) {
  const Icon = icon ? I[icon] : null
  return (
    <div className={`kpi ${highlight ? 'highlight' : ''}`}>
      <div className="kpi-label">
        {Icon && <Icon size={12} className="ico" />}
        {label}
      </div>
      <div className="kpi-val">
        {typeof value === 'number' ? formatMoney(value, currency) : value}
      </div>
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
  )
}

export function formatMoney(amount, currency = 'USD') {
  const sym = currency === 'HNL' ? 'L' : '$'
  return sym + ' ' + Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

export function formatShort(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k'
  return Number(n || 0).toFixed(0)
}

export function formatTimeAgo(isoString) {
  if (!isoString) return 'Sin fecha'
  const diff = Date.now() - new Date(isoString).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  const weeks = Math.floor(diff / 604800000)
  if (mins  < 1)  return 'hace un momento'
  if (hours < 1)  return `hace ${mins} min`
  if (days  < 1)  return `hace ${hours}h`
  if (weeks < 1)  return `hace ${days} día${days > 1 ? 's' : ''}`
  return `hace ${weeks} semana${weeks > 1 ? 's' : ''}`
}

// Palette of gradients for project covers (deterministic by index)
export const COVER_PALETTE = [
  'linear-gradient(135deg, #14213D 0%, #2C3852 50%, #F59E0B 100%)',
  'linear-gradient(135deg, #1E3A8A 0%, #2563EB 60%, #60A5FA 100%)',
  'linear-gradient(135deg, #064E3B 0%, #059669 50%, #34D399 100%)',
  'linear-gradient(135deg, #7C2D12 0%, #C2410C 60%, #FB923C 100%)',
  'linear-gradient(135deg, #312E81 0%, #4F46E5 50%, #818CF8 100%)',
  'linear-gradient(135deg, #831843 0%, #BE185D 50%, #F472B6 100%)',
  'linear-gradient(135deg, #134E4A 0%, #0D9488 50%, #5EEAD4 100%)',
  'linear-gradient(135deg, #1E1B4B 0%, #7C3AED 50%, #C4B5FD 100%)',
]

// Convert old hierarchical format (tipo/descripcion/children) → flat format (kind/desc/parent)
export function normalizeItems(items) {
  if (!items || items.length === 0) return []
  // Already in flat format?
  if (items[0] && items[0].kind) return items
  // Convert from hierarchical (old PresupuestoTable format)
  const flat = []
  ;(items || []).forEach((cap, ci) => {
    const capId = cap.id || String(ci + 1)
    const capCode = String(ci + 1)
    flat.push({ id: capId, kind: 'chapter', code: capCode, desc: cap.descripcion || cap.desc || 'Capítulo' })
    ;(cap.children || []).forEach((sub, si) => {
      const subId = sub.id || `${capCode}.${si + 1}`
      const subCode = `${capCode}.${si + 1}`
      flat.push({ id: subId, kind: 'subchapter', code: subCode, desc: sub.descripcion || sub.desc || 'Sub-capítulo', parent: capId })
      ;(sub.children || []).forEach((act, ai) => {
        const actCode = `${subCode}.${String(ai + 1).padStart(2, '0')}`
        flat.push({
          id: act.id || actCode,
          kind: 'activity',
          code: actCode,
          desc: act.descripcion || act.desc || 'Actividad',
          unit: act.unidad || act.unit || 'und',
          qty:  act.cantidad || act.qty || 1,
          price: act.precioUnitario || act.costoUnitario || act.price || 0,
          parent: subId,
        })
      })
    })
  })
  return flat
}

// Map a Supabase presupuesto row → project object used by the UI
export function mapDBToProject(p, index = 0) {
  const flatItems = normalizeItems(p.items_json || [])
  const activities = flatItems.filter(i => i.kind === 'activity')

  const pctI  = p.pct_indirectos  ?? 10
  const pctIm = p.pct_imprevistos ?? 1
  const pctU  = p.pct_utilidad    ?? 8
  const pctTax = p.pct_impuesto   ?? 15

  const direct  = activities.reduce((s, a) => s + (a.qty || 0) * (a.price || 0), 0)
  const indir   = direct * (pctI / 100)
  const imprev  = (direct + indir) * (pctIm / 100)
  const subtotal = direct + indir + imprev
  const util    = subtotal * (pctU / 100)
  const withU   = subtotal + util
  const tax     = withU * (pctTax / 100)
  const total   = withU + tax

  return {
    id:       p.id,
    name:     p.nombre_proyecto || 'Sin nombre',
    client:   p.cliente   || '',
    location: p.lugar     || '',
    currency: p.moneda    || 'USD',
    revision: p.revision  || 1,
    date:     p.fecha     || '',
    status:   p.estado    || 'draft',
    progress: 0,
    total,
    chapters:   flatItems.filter(i => i.kind === 'chapter').length,
    activities: activities.length,
    updated:  formatTimeAgo(p.updated_at),
    favorite: false,
    tag:      p.tag || 'General',
    cover:    COVER_PALETTE[index % COVER_PALETTE.length],
    cotizante: p.cotizante || '',
    // Raw params (used by BudgetView)
    pct_indirectos:  pctI,
    pct_imprevistos: pctIm,
    pct_utilidad:    pctU,
    pct_impuesto:    pctTax,
    // Budget items
    items: flatItems,
  }
}
