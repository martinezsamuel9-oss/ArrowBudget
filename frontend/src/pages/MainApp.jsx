import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  Home, Folder, FileText, Package, HardHat, Wrench, Users, BarChart2,
  BookOpen, CreditCard, Search, Bell, Settings, LogOut, Plus, Upload,
  ArrowRight, Star, Sparkles, Clock, DollarSign, Activity, TrendingUp,
  MapPin, Building2, ArrowUpRight, Layers, Grid, List, Filter,
  MoreHorizontal, ChevronRight, X, Check, Briefcase, Calendar,
  FileSpreadsheet, Copy, Edit2, Trash2, Download, ChevronDown, Crown, Coins, RefreshCw, AlertTriangle,
} from 'lucide-react'
import {
  round2, fmt, money, moneyK, makeMoneyFmt, uid, normalize,
  findInsumo, conceptoCost, calcFicha, calcItem, calcKPIs,
  findOrCreateInsumo, findPathById, CATEGORIAS, EMPTY_CATALOGOS,
} from '../lib/calc'
import {
  exportPDFCatalogo, exportPDFPresupuesto, exportPDFFicha, exportPDFGeneral, exportPDFRangoFichas,
  exportPDFResumenEjecutivo, exportPDFPortafolio,
  exportExcelPresupuesto, exportExcelCatalogo, exportExcelFicha, exportExcelGeneral,
  exportExcelRangoFichas, exportExcelPortafolio,
  exportPlantilla, exportPlantillaFicha, importExcelPresupuesto, importExcelCatalogo, importExcelFichas,
} from '../lib/export'

// ============ SUPABASE MAPPING ============
const relTime = ts => {
  if (!ts) return ''
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (m < 1)   return 'ahora'
  if (m < 60)  return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24)  return `hace ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)   return `hace ${d} día${d > 1 ? 's' : ''}`
  const w = Math.floor(d / 7)
  return `hace ${w} semana${w > 1 ? 's' : ''}`
}
const DEFAULT_INDIRECTOS = [
  { descripcion: 'Gerente de Proyecto',         unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Residente de Obra',           unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Ingeniero Jr',                unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Arquitecto I',                unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Arquitecto II',               unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Especialista en Costos',      unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Maestro de Obra',             unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Bodeguero',                   unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Alquiler de casas / oficina', unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Fianza de calidad',           unidad: 'global', cantidad: 1, costoBase: 0 },
  { descripcion: 'Fianza de anticipo',          unidad: 'global', cantidad: 1, costoBase: 0 },
  { descripcion: 'Buena ejecución de obra',     unidad: 'global', cantidad: 1, costoBase: 0 },
  { descripcion: 'Alimentación',                unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Combustible',                 unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Viajes de gerencia',          unidad: 'viaje',  cantidad: 1, costoBase: 0 },
  { descripcion: 'Seguros de obra',             unidad: 'global', cantidad: 1, costoBase: 0 },
  { descripcion: 'Comunicaciones / Internet',   unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Papelería y útiles',          unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Vigilancia / Guardianía',     unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Instalación provisional',     unidad: 'global', cantidad: 1, costoBase: 0 },
  { descripcion: 'Transporte de personal',      unidad: 'mes',    cantidad: 1, costoBase: 0 },
  { descripcion: 'Equipos de cómputo y TI',     unidad: 'global', cantidad: 1, costoBase: 0 },
].map(x => ({ ...x, id: uid() }))

const DB2UI = { borrador:'Borrador', activo:'Activo', en_revision:'En revisión', enviado:'En revisión', aprobado:'Aprobado', rechazado:'Rechazado', en_ejecucion:'En ejecución' }
const UI2DB = { 'Borrador':'borrador', 'Activo':'activo', 'En revisión':'en_revision', 'Aprobado':'aprobado', 'Rechazado':'rechazado', 'En ejecución':'en_ejecucion' }

const mapDb = row => ({
  id:            row.id,
  cotizante:     row.cotizante     || '',
  cliente:       row.cliente       || '',
  ofertante:     row.ofertante     || '',
  realizadoPor:  row.realizado_por || '',
  lugar:         row.lugar         || '',
  nombreProyecto:row.nombre_proyecto || 'Sin nombre',
  fecha:         row.fecha         || new Date().toISOString().slice(0,10),
  revision:      row.revision      || 1,
  moneda:        row.moneda        || 'USD',
  tipo:          row.tipo          || 'Residencial',
  estado:        DB2UI[row.estado] || 'Borrador',
  ultimaEdicion: relTime(row.updated_at),
  pctIndirectos: row.pct_indirectos  != null ? +row.pct_indirectos  : 10,
  pctImprevistos:row.pct_imprevistos != null ? +row.pct_imprevistos : 1,
  pctUtilidad:   row.pct_utilidad    != null ? +row.pct_utilidad    : 8,
  pctImpuesto:   row.pct_impuesto    != null ? +row.pct_impuesto    : 15,
  logoOfertante: row.logo_ofertante || null,
  logoCliente:   row.logo_cliente   || null,
  versiones:     row.versiones_json || [],
  catalogos:     (() => { const c = row.catalogos_json || {}; return { materiales: c.materiales||[], manoObra: c.manoObra||[], herramientaEquipo: c.herramientaEquipo||[], subcontratos: c.subcontratos||[] } })(),
  apuHeaderBg:     (row.catalogos_json?._apu?.headerBg)       || '#0f1115',
  apuHeaderText:   (row.catalogos_json?._apu?.headerText)     || '#f59e0b',
  m2Construccion:  +(row.m2_construccion ?? row.catalogos_json?._m2c ?? row.catalogos_json?._params?.m2Construccion ?? 0),
  m2Estructura:    +(row.m2_estructura   ?? row.catalogos_json?._m2e ?? row.catalogos_json?._params?.m2Estructura   ?? 0),
  indirectos:      (row.catalogos_json?._indirectos) || DEFAULT_INDIRECTOS.map(x => ({ ...x, id: uid() })),
  items:         row.items_json     || [],
})

const toDb = b => ({
  cotizante:        b.cotizante,
  cliente:          b.cliente,
  ofertante:        b.ofertante,
  realizado_por:    b.realizadoPor,
  lugar:            b.lugar,
  nombre_proyecto:  b.nombreProyecto,
  fecha:            b.fecha,
  revision:         b.revision,
  moneda:           b.moneda,
  tipo:             b.tipo,
  estado:           UI2DB[b.estado] || 'borrador',
  pct_indirectos:   b.pctIndirectos,
  pct_imprevistos:  b.pctImprevistos,
  pct_utilidad:     b.pctUtilidad,
  pct_impuesto:     b.pctImpuesto,
  logo_ofertante:   b.logoOfertante,
  logo_cliente:     b.logoCliente,
  versiones_json:   b.versiones,
  m2_construccion:  b.m2Construccion ?? 0,
  m2_estructura:    b.m2Estructura   ?? 0,
  catalogos_json:   { ...b.catalogos, _apu: { headerBg: b.apuHeaderBg||'#0f1115', headerText: b.apuHeaderText||'#f59e0b' }, _indirectos: b.indirectos||[], _m2c: b.m2Construccion ?? 0, _m2e: b.m2Estructura ?? 0 },
  items_json:       b.items,
  updated_at:       new Date().toISOString(),
})

// ============ HOOKS ============
function useClickOutside(ref, cb) {
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) cb() }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [cb])
}

// ============ HELPERS ============
function formatMoney(amount, currency = 'USD') {
  const sym = currency === 'HNL' ? 'L' : '$'
  return sym + ' ' + (amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StatusBadge({ status }) {
  const map = {
    'Activo':      { cls: 'success', dot: 'var(--c-success)' },
    'En revisión': { cls: 'warn',    dot: 'var(--c-warn)' },
    'Borrador':    { cls: '',        dot: 'var(--c-text-3)' },
    'Aprobado':    { cls: 'primary', dot: 'var(--c-primary)' },
    'Rechazado':   { cls: 'danger',  dot: 'var(--c-danger)' },
    'En ejecución':{ cls: '',        dot: '#7c3aed' },
  }
  const s = map[status] || { cls: '', dot: 'var(--c-text-3)' }
  return (
    <span className={`badge ${s.cls}`}>
      <span className="pip" style={{ background: s.dot }}></span>
      {status || 'Borrador'}
    </span>
  )
}

// ============ SIDEBAR ============
function Sidebar({ page, setPage, projectActivo, setTabProject, tabProject, user, onLogout, projectsCount, onSettings }) {
  const mainNav = [
    { id: 'inicio',    label: 'Inicio',    Icon: Home },
    { id: 'proyectos', label: 'Proyectos', Icon: Folder },
  ]
  const projectNav = [
    { id: 'presupuesto',    label: 'Presupuesto',         Icon: FileText },
    { id: 'cat-mat',        label: 'Materiales',           Icon: Package },
    { id: 'cat-mo',         label: 'Mano de Obra',         Icon: HardHat },
    { id: 'cat-he',         label: 'Herramientas/Equipo',  Icon: Wrench },
    { id: 'cat-sub',        label: 'Subcontratos',         Icon: Users },
    { id: 'indirectos',     label: 'Indirectos',           Icon: TrendingUp },
  ]
  const toolNav = [
    { id: 'reportes',   label: 'Reportes',             Icon: BarChart2 },
    { id: 'plantillas', label: 'Biblioteca',           Icon: BookOpen },
    { id: 'planes',     label: 'Planes y Facturación', Icon: CreditCard },
  ]

  const isProjectTab = id => page === 'proyecto' && tabProject === id
  const initials = (user?.name || 'U').slice(0, 2).toUpperCase()

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="side-brand">
        <img src="/favicon.png" alt="Arrow Budget" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain', flexShrink: 0 }} />
        <div className="side-brand-text">
          <div className="side-brand-title">ARROW BUDGET</div>
          <div className="side-brand-sub">Presupuestos de Obra</div>
        </div>
      </div>

      {/* Trabajo */}
      <div className="side-section">
        <div className="side-section-label">Trabajo</div>
        <nav className="side-nav">
          {mainNav.map(({ id, label, Icon, badge }) => (
            <button
              key={id}
              className={`side-nav-item ${page === id ? 'active' : ''}`}
              onClick={() => setPage(id)}
            >
              <Icon size={16} className="ico" />
              <span>{label}</span>
              {badge !== undefined && <span className="badge">{badge}</span>}
            </button>
          ))}
        </nav>
      </div>

      {/* Proyecto activo */}
      {projectActivo && (
        <div className="side-section">
          <div className="side-section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Folder size={11} /> Proyecto Activo
          </div>
          <div style={{ padding: '4px 12px 8px', fontSize: 12, color: '#fff', fontWeight: 600, lineHeight: 1.35 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={projectActivo.nombreProyecto}>
              {projectActivo.nombreProyecto}
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-side-text-2)', fontWeight: 500, marginTop: 2 }}>
              Rev {projectActivo.revision} · {projectActivo.moneda}
            </div>
          </div>
          <nav className="side-nav">
            {projectNav.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`side-nav-item ${isProjectTab(id) ? 'active' : ''}`}
                onClick={() => { setPage('proyecto'); setTabProject(id) }}
              >
                <Icon size={15} className="ico" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      <div className="side-spacer"></div>

      {/* Herramientas */}
      <div className="side-section">
        <div className="side-section-label">Herramientas</div>
        <nav className="side-nav">
          {toolNav.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`side-nav-item ${page === id ? 'active' : ''}`}
              onClick={() => setPage(id)}
            >
              <Icon size={15} className="ico" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* User foot */}
      <div className="side-foot">
        <div className="side-user" onClick={onSettings}>
          <div className="avatar">{initials}</div>
          <div className="side-user-info">
            <div className="side-user-name">{user?.name || 'Usuario'}</div>
            <div className="side-user-email">{user?.empresa || ''}</div>
          </div>
          <Settings size={14} style={{ color: 'var(--c-side-text-2)', flexShrink: 0 }} />
        </div>
      </div>
    </aside>
  )
}

// ============ TOPBAR ============
function Topbar({ crumbs, search, setSearch, onHome, searchResults, onResultPick, saving, onLogout, onUserSettings, notifCount, notifs, showNotifs, setShowNotifs }) {
  return (
    <div className="topbar">
      {/* Breadcrumbs */}
      <div className="crumbs">
        <button className="icon-btn" onClick={onHome} title="Inicio">
          <Home size={16} />
        </button>
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            <ChevronRight size={13} className="crumb-sep" />
            <span className={`crumb ${i === crumbs.length - 1 ? 'cur' : ''}`}>{c}</span>
          </Fragment>
        ))}
      </div>

      {/* Search */}
      <div className="topbar-search">
        <Search size={14} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar proyectos, actividades, materiales…"
        />
        <kbd>⌘K</kbd>
        {searchResults && (searchResults.proys.length + searchResults.acts.length + searchResults.insumos.length) > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 30, maxHeight: 360, overflowY: 'auto' }}>
            {searchResults.proys.length > 0 && <>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-text-3)', padding: '8px 12px 4px', borderBottom: '1px solid var(--c-line-2)' }}>Proyectos</div>
              {searchResults.proys.slice(0, 5).map(p => (
                <button key={p.id} onClick={() => onResultPick('proy', p)} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', display: 'block', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--c-line-2)', fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{p.nombreProyecto}</div>
                  <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{p.cliente}</div>
                </button>
              ))}
            </>}
            {searchResults.acts.length > 0 && <>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-text-3)', padding: '8px 12px 4px', borderBottom: '1px solid var(--c-line-2)' }}>Actividades</div>
              {searchResults.acts.slice(0, 5).map(a => (
                <button key={a.id} onClick={() => onResultPick('act', a)} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--c-line-2)', fontSize: 13 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--c-bg)', padding: '1px 6px', borderRadius: 4, color: 'var(--c-text-3)' }}>{a.id}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.descripcion}</span>
                </button>
              ))}
            </>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="topbar-actions">
        {saving && (
          <span className="save-state">
            <span className="pulse"></span>
            Guardando…
          </span>
        )}
        {/* Bell con badge y dropdown */}
        <div style={{ position: 'relative' }}>
          <button className="icon-btn" title="Notificaciones" onClick={() => setShowNotifs(v => !v)} style={{ position: 'relative' }}>
            <Bell size={16} />
            {notifCount > 0 && (
              <span style={{ position: 'absolute', top: 1, right: 1, background: 'var(--c-danger)', color: '#fff', fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
                {notifCount > 99 ? '99+' : notifCount}
              </span>
            )}
          </button>
          {showNotifs && <NotificationsDropdown notifs={notifs} onClose={() => setShowNotifs(false)} />}
        </div>
        {/* Gear → siempre abre configuración de cuenta */}
        <button className="icon-btn" title="Configuración de cuenta" onClick={onUserSettings}>
          <Settings size={16} />
        </button>
        <div style={{ width: 1, height: 22, background: 'var(--c-line)', margin: '0 4px' }}></div>
        <button className="icon-btn" title="Cerrar sesión" onClick={onLogout}>
          <LogOut size={16} />
        </button>
      </div>
    </div>
  )
}

// ============ MODAL / DRAWER ============
function Drawer({ open, onClose, title, subtitle, children, footer, width = 480 }) {
  if (!open) return null
  return (
    <Fragment>
      <div className="scrim" onClick={onClose}></div>
      <div className="drawer" style={{ width }}>
        <div className="drawer-head">
          <div>
            <div className="drawer-title">{title}</div>
            {subtitle && <div className="drawer-sub">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </Fragment>
  )
}

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null
  return (
    <Fragment>
      <div className="scrim" onClick={onClose}></div>
      <div className="modal">
        <div className="drawer-head">
          <div className="drawer-title">{title}</div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </Fragment>
  )
}

// ============ ESTADO MENU ============
function EstadoMenu({ budget, setBudget }) {
  const estados = [
    { v: 'Borrador',    cls: '',        dot: 'var(--c-text-3)' },
    { v: 'Activo',      cls: 'success', dot: 'var(--c-success)' },
    { v: 'En revisión', cls: 'warn',    dot: 'var(--c-warn)' },
    { v: 'Aprobado',    cls: 'primary', dot: 'var(--c-primary)' },
    { v: 'Rechazado',   cls: 'danger',  dot: 'var(--c-danger)' },
    { v: 'En ejecución',cls: '',        dot: '#7c3aed' },
  ]
  return (
    <Dropdown align="left" minWidth={180} trigger={
      <button className="btn sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <StatusBadge status={budget.estado} />
        <ChevronDown size={12} />
      </button>
    }>
      <div style={{ padding: '6px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-text-3)', padding: '4px 12px 8px' }}>Cambiar estado</div>
        {estados.map(e => (
          <button key={e.v} onClick={() => setBudget({ ...budget, estado: e.v })}
            style={{ width: '100%', textAlign: 'left', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.dot, flexShrink: 0 }}></span>
            {e.v}
            {e.v === budget.estado && <Check size={13} style={{ marginLeft: 'auto', color: 'var(--c-success)' }} />}
          </button>
        ))}
      </div>
    </Dropdown>
  )
}

// ============ DESCARGAS MENU ============
function DescargasMenu({ budget, params, onRangoFichas, empresa = {} }) {
  const Row = ({ label, desc, pdf, excel }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--c-line-2)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--c-text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={e => { e.stopPropagation(); try { pdf() } catch(err) { alert('Error PDF: ' + err.message) } }}
          className="btn xs" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
          <FileText size={11} /> PDF
        </button>
        <button onClick={e => { e.stopPropagation(); try { excel() } catch(err) { alert('Error Excel: ' + err.message) } }}
          className="btn xs" style={{ background: 'var(--c-success)', borderColor: 'var(--c-success)', color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
          <FileSpreadsheet size={11} /> Excel
        </button>
      </div>
    </div>
  )
  return (
    <Dropdown align="right" minWidth={300} trigger={
      <button className="btn brand" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Download size={14} /> Descargas <ChevronDown size={12} />
      </button>
    }>
      <div style={{ padding: '8px 14px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-text-3)', background: 'var(--c-bg-2)', borderBottom: '1px solid var(--c-line)' }}>Presupuesto</div>
      <Row label="Presupuesto completo" desc="Tabla con todos los capítulos" pdf={() => exportPDFPresupuesto(budget, params)} excel={() => exportExcelPresupuesto(budget, params)} />
      <div style={{ padding: '8px 14px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-text-3)', background: 'var(--c-bg-2)', borderBottom: '1px solid var(--c-line)', borderTop: '1px solid var(--c-line)' }}>Fichas de costo</div>
      <Row label="Rango de fichas" desc="Seleccionar varias actividades" pdf={onRangoFichas} excel={onRangoFichas} />
      <div style={{ padding: '8px 14px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-text-3)', background: 'var(--c-bg-2)', borderBottom: '1px solid var(--c-line)', borderTop: '1px solid var(--c-line)' }}>General</div>
      <Row label="Reporte general" desc="Presupuesto + todas las fichas" pdf={() => exportPDFGeneral(budget, params, empresa)} excel={() => exportExcelGeneral(budget, params)} />
    </Dropdown>
  )
}

// ============ RANGO FICHAS DIALOG ============
function RangoFichasDialog({ open, onClose, budget, params, empresa = {} }) {
  const [sel, setSel] = useState(() => new Set())
  const acts = useMemo(() => {
    const r = []; const walk = its => its.forEach(it => { if (it.tipo === 'actividad') r.push(it); else if (it.children) walk(it.children) }); walk(budget.items); return r
  }, [budget.items])
  if (!open) return null
  const toggle = id => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n) }
  return (
    <Modal open={open} onClose={onClose} title={`Seleccionar fichas (${sel.size}/${acts.length})`}
      footer={<>
        <button onClick={onClose} className="btn ghost">Cancelar</button>
        <button onClick={async () => { await exportExcelRangoFichas(budget, params, [...sel]); onClose() }} disabled={!sel.size} className="btn" style={{ opacity: sel.size ? 1 : 0.4, background: 'var(--c-success)', borderColor: 'var(--c-success)', color: '#fff' }}>
          <FileSpreadsheet size={13} /> Excel ({sel.size})
        </button>
        <button onClick={() => { exportPDFRangoFichas(budget, params, [...sel], empresa); onClose() }} disabled={!sel.size} className="btn" style={{ opacity: sel.size ? 1 : 0.4, background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff' }}>
          <FileText size={13} /> PDF ({sel.size})
        </button>
      </>}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setSel(new Set(acts.map(a => a.id)))} className="btn sm">Todas</button>
        <button onClick={() => setSel(new Set())} className="btn sm ghost">Limpiar</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
        {acts.map(a => (
          <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: sel.has(a.id) ? 'var(--c-accent-soft)' : 'var(--c-bg-2)', borderRadius: 'var(--r-md)', cursor: 'pointer', border: '1px solid var(--c-line)' }}>
            <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} style={{ accentColor: 'var(--c-accent)', width: 15, height: 15 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-3)', width: 60 }}>{a.id}</span>
            <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.descripcion}</span>
            <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{a.unidad} · {fmt(a.cantidad)}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}

// ============ GUARDAR VERSION ============
function GuardarVersionDialog({ open, onClose, budget, setBudget }) {
  const [n, setN] = useState('')
  const [notas, setNotas] = useState('')
  useEffect(() => { if (open) { setN(`Rev ${(budget.revision || 1) + 1}`); setNotas('') } }, [open])
  if (!open) return null
  const guardar = () => {
    const v = { id: uid(), nombre: n, notas, fecha: new Date().toISOString(), revision: (budget.revision || 1) + 1 }
    setBudget({ ...budget, revision: v.revision, versiones: [...(budget.versiones || []), v], ultimaEdicion: 'ahora' })
    onClose(); alert(`Versión "${n}" guardada como Rev ${v.revision}.`)
  }
  return (
    <Modal open={open} onClose={onClose} title="Guardar versión"
      footer={<>
        <button onClick={onClose} className="btn ghost">Cancelar</button>
        <button onClick={guardar} disabled={!n.trim()} className="btn brand" style={{ opacity: n.trim() ? 1 : 0.4 }}>
          <Check size={13} /> Guardar
        </button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label className="field-label">Nombre *</label>
          <input className="input" value={n} onChange={e => setN(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Notas (opcional)</label>
          <textarea className="input textarea" value={notas} onChange={e => setNotas(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
        </div>
        {(budget.versiones || []).length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-text-3)', marginBottom: 6 }}>Historial</div>
            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--c-line)', borderRadius: 'var(--r-md)' }}>
              {[...(budget.versiones || [])].reverse().map(v => (
                <div key={v.id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--c-line-2)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{v.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{new Date(v.fecha).toLocaleString()}</div>
                  </div>
                  <span className="badge">Rev {v.revision}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ============ CONFIG PROYECTO MODAL ============
// Definido fuera del modal para evitar re-mount en cada keystroke
function ConfigField({ label, k, type = 'text', form, setForm }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <input
        type={type}
        className="input"
        value={form[k] || ''}
        onChange={e => setForm(prev => ({ ...prev, [k]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
      />
    </div>
  )
}

function ConfigProyectoModal({ open, onClose, budget, setBudget }) {
  const [form, setForm] = useState(budget)
  useEffect(() => { if (open) setForm(budget) }, [open])
  if (!open) return null
  const handleLogo = (e, k) => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setForm({ ...form, [k]: ev.target.result }); r.readAsDataURL(f) }
  return (
    <Drawer open={open} onClose={onClose} title="Configuración del Proyecto" subtitle="Datos que aparecerán en la cotización" width={560}
      footer={<>
        <button onClick={onClose} className="btn ghost">Cancelar</button>
        <button onClick={() => { setBudget(form); onClose() }} className="btn primary"><Check size={13} /> Guardar</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>Datos generales</div>
          <div className="grid-2">
            <ConfigField label="Nombre del proyecto" k="nombreProyecto" form={form} setForm={setForm} />
            <ConfigField label="Tipo" k="tipo" form={form} setForm={setForm} />
            <ConfigField label="Realizado por" k="realizadoPor" form={form} setForm={setForm} />
            <ConfigField label="Fecha" k="fecha" type="date" form={form} setForm={setForm} />
          </div>
        </div>
        <div className="divider"></div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>Partes involucradas</div>
          <div className="grid-2">
            <ConfigField label="Elaboró" k="cotizante" form={form} setForm={setForm} />
            <ConfigField label="Revisó / Aprobó" k="ofertante" form={form} setForm={setForm} />
            <ConfigField label="Cliente" k="cliente" form={form} setForm={setForm} />
            <ConfigField label="Ubicación" k="lugar" form={form} setForm={setForm} />
          </div>
        </div>
        <div className="divider"></div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>Económico</div>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">Moneda</label>
              <select className="input" value={form.moneda || 'USD'} onChange={e => setForm(prev => ({ ...prev, moneda: e.target.value }))}>
                <option value="USD">USD — Dólar estadounidense</option>
                <option value="HNL">HNL — Lempira hondureño</option>
                <option value="GTQ">GTQ — Quetzal guatemalteco</option>
                <option value="NIO">NIO — Córdoba nicaragüense</option>
                <option value="CRC">CRC — Colón costarricense</option>
                <option value="MXN">MXN — Peso mexicano</option>
                <option value="EUR">EUR — Euro</option>
              </select>
            </div>
            <ConfigField label="Revisión" k="revision" type="number" form={form} setForm={setForm} />
          </div>
        </div>
        <div className="divider"></div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>Parámetros globales</div>
          <div className="grid-2">
            {/* Indirectos con sufijo % y badge AUTO */}
            <div className="field">
              <label className="field-label" style={{ display:'flex', alignItems:'center', gap:6 }}>
                Indirectos (%)
                {(form.indirectos||[]).some(r => (+r.costoBase||0) > 0) && (
                  <span style={{ background:'var(--c-accent)', color:'#000', fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:4 }}>AUTO</span>
                )}
              </label>
              <div style={{ display:'flex', alignItems:'center', gap:0 }}>
                <input className="input" type="number" step="any"
                  value={form.pctIndirectos ?? 0}
                  onFocus={e => e.target.select()}
                  onChange={e => setForm(prev => ({ ...prev, pctIndirectos: parseFloat(e.target.value)||0 }))}
                  style={{ borderRadius:'var(--r-md) 0 0 var(--r-md)', borderRight:'none' }} />
                <span style={{ padding:'0 10px', height:36, display:'flex', alignItems:'center', background:'var(--c-bg)', border:'1px solid var(--c-line)', borderRadius:'0 var(--r-md) var(--r-md) 0', fontSize:12, color:'var(--c-text-2)', fontWeight:600 }}>%</span>
              </div>
            </div>
            {/* Imprevistos */}
            <div className="field">
              <label className="field-label">Imprevistos (%)</label>
              <div style={{ display:'flex', alignItems:'center', gap:0 }}>
                <input className="input" type="number" step="any" value={form.pctImprevistos ?? 0} onFocus={e => e.target.select()} onChange={e => setForm(prev => ({ ...prev, pctImprevistos: parseFloat(e.target.value)||0 }))} style={{ borderRadius:'var(--r-md) 0 0 var(--r-md)', borderRight:'none' }} />
                <span style={{ padding:'0 10px', height:36, display:'flex', alignItems:'center', background:'var(--c-bg)', border:'1px solid var(--c-line)', borderRadius:'0 var(--r-md) var(--r-md) 0', fontSize:12, color:'var(--c-text-2)', fontWeight:600 }}>%</span>
              </div>
            </div>
            {/* Utilidad */}
            <div className="field">
              <label className="field-label">Utilidad (%)</label>
              <div style={{ display:'flex', alignItems:'center', gap:0 }}>
                <input className="input" type="number" step="any" value={form.pctUtilidad ?? 0} onFocus={e => e.target.select()} onChange={e => setForm(prev => ({ ...prev, pctUtilidad: parseFloat(e.target.value)||0 }))} style={{ borderRadius:'var(--r-md) 0 0 var(--r-md)', borderRight:'none' }} />
                <span style={{ padding:'0 10px', height:36, display:'flex', alignItems:'center', background:'var(--c-bg)', border:'1px solid var(--c-line)', borderRadius:'0 var(--r-md) var(--r-md) 0', fontSize:12, color:'var(--c-text-2)', fontWeight:600 }}>%</span>
              </div>
            </div>
            {/* Impuesto */}
            <div className="field">
              <label className="field-label">Impuesto (%)</label>
              <div style={{ display:'flex', alignItems:'center', gap:0 }}>
                <input className="input" type="number" step="any" value={form.pctImpuesto ?? 0} onFocus={e => e.target.select()} onChange={e => setForm(prev => ({ ...prev, pctImpuesto: parseFloat(e.target.value)||0 }))} style={{ borderRadius:'var(--r-md) 0 0 var(--r-md)', borderRight:'none' }} />
                <span style={{ padding:'0 10px', height:36, display:'flex', alignItems:'center', background:'var(--c-bg)', border:'1px solid var(--c-line)', borderRadius:'0 var(--r-md) var(--r-md) 0', fontSize:12, color:'var(--c-text-2)', fontWeight:600 }}>%</span>
              </div>
            </div>
          </div>
          <div style={{ height: 12 }} />
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-text-2)', marginBottom: 10 }}>Áreas del proyecto</div>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">Construcción</label>
              <div style={{ display:'flex', alignItems:'center', gap:0 }}>
                <input className="input" type="number" min="0" step="0.01" value={form.m2Construccion ?? 0} onFocus={e => e.target.select()} onChange={e => setForm(prev => ({ ...prev, m2Construccion: parseFloat(e.target.value)||0 }))} style={{ borderRadius:'var(--r-md) 0 0 var(--r-md)', borderRight:'none' }} />
                <span style={{ padding:'0 10px', height:36, display:'flex', alignItems:'center', background:'var(--c-bg)', border:'1px solid var(--c-line)', borderRadius:'0 var(--r-md) var(--r-md) 0', fontSize:12, color:'var(--c-text-2)', fontWeight:600, whiteSpace:'nowrap' }}>m²</span>
              </div>
            </div>
            <div className="field">
              <label className="field-label">Estructura</label>
              <div style={{ display:'flex', alignItems:'center', gap:0 }}>
                <input className="input" type="number" min="0" step="0.01" value={form.m2Estructura ?? 0} onFocus={e => e.target.select()} onChange={e => setForm(prev => ({ ...prev, m2Estructura: parseFloat(e.target.value)||0 }))} style={{ borderRadius:'var(--r-md) 0 0 var(--r-md)', borderRight:'none' }} />
                <span style={{ padding:'0 10px', height:36, display:'flex', alignItems:'center', background:'var(--c-bg)', border:'1px solid var(--c-line)', borderRadius:'0 var(--r-md) var(--r-md) 0', fontSize:12, color:'var(--c-text-2)', fontWeight:600, whiteSpace:'nowrap' }}>m²</span>
              </div>
            </div>
          </div>
        </div>
        <div className="divider"></div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>Encabezado del PDF (Fichas APU)</div>
          <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginBottom: 12 }}>Personaliza el color de fondo y del texto del header en los PDF exportados.</div>

          {/* Preview en vivo */}
          <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 14, border: '1px solid var(--c-line)' }}>
            <div style={{ background: form.apuHeaderBg || '#0f1115', padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ color: form.apuHeaderText || '#f59e0b', fontWeight: 800, fontSize: 14, letterSpacing: '0.04em' }}>FICHA DE COSTO UNITARIO</div>
              <div style={{ color: form.apuHeaderText || '#f59e0b', fontWeight: 700, fontSize: 12, marginTop: 4, opacity: 0.85 }}>{(form.nombreProyecto || 'NOMBRE DEL PROYECTO').toUpperCase()}</div>
            </div>
            <div style={{ background: 'var(--c-bg-2)', padding: '6px 16px', fontSize: 11, color: 'var(--c-text-3)', textAlign: 'center' }}>Vista previa del encabezado</div>
          </div>

          {/* Paletas predefinidas */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 8 }}>Paletas rápidas</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'Oscuro',      bg: '#0f1115', text: '#f59e0b' },
                { label: 'Marino',      bg: '#1e3a5f', text: '#f59e0b' },
                { label: 'Pizarra',     bg: '#1e293b', text: '#e2e8f0' },
                { label: 'Verde',       bg: '#064e3b', text: '#6ee7b7' },
                { label: 'Vino',        bg: '#4c0519', text: '#fda4af' },
                { label: 'Corporativo', bg: '#1d4ed8', text: '#ffffff' },
                { label: 'Gris',        bg: '#374151', text: '#f9fafb' },
                { label: 'Blanco',      bg: '#ffffff', text: '#1e293b' },
              ].map(p => (
                <button key={p.label} onClick={() => setForm(prev => ({ ...prev, apuHeaderBg: p.bg, apuHeaderText: p.text }))}
                  title={p.label}
                  style={{ width: 32, height: 32, borderRadius: 6, background: p.bg, border: `2px solid ${(form.apuHeaderBg === p.bg) ? p.text : 'transparent'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.text, display: 'block' }} />
                </button>
              ))}
            </div>
          </div>

          {/* Controles manuales */}
          <div className="grid-2">
            {[['apuHeaderBg', 'Color de fondo', '#0f1115'], ['apuHeaderText', 'Color de texto / acento', '#f59e0b']].map(([k, lbl, def]) => (
              <div key={k} className="field">
                <label className="field-label">{lbl}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="color" value={form[k] || def} onChange={e => setForm(prev => ({ ...prev, [k]: e.target.value }))}
                    style={{ width: 42, height: 32, border: '1px solid var(--c-line)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                  <input className="input" value={form[k] || def} onChange={e => setForm(prev => ({ ...prev, [k]: e.target.value }))}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} maxLength={7} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="divider"></div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>Logos</div>
          <div className="grid-2">
            {[['logoOfertante', 'Logo Empresa (APU)'], ['logoCliente', 'Logo Cliente']].map(([k, lbl]) => (
              <div key={k} className="field">
                <label className="field-label">{lbl}</label>
                <div style={{ border: '2px dashed var(--c-line)', borderRadius: 'var(--r-md)', padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                  {form[k] ? <img src={form[k]} alt={lbl} style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 6 }} /> : <div style={{ width: 64, height: 64, background: 'var(--c-bg)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-4)', fontSize: 11 }}>Sin logo</div>}
                  <div style={{ flex: 1 }}>
                    <input type="file" accept="image/*" onChange={e => handleLogo(e, k)} style={{ fontSize: 11 }} />
                    {form[k] && <button onClick={() => setForm({ ...form, [k]: null })} className="btn xs danger" style={{ marginTop: 6 }}>Quitar</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  )
}

// ============ USER SETTINGS MODAL ============
function UserSettingsModal({ open, onClose, profile, user, onSaved }) {
  const [tab, setTab]       = useState('perfil')
  const [nombre, setNombre] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [pwd, setPwd]       = useState('')
  const [pwd2, setPwd2]     = useState('')
  const [msg, setMsg]       = useState(null)   // { ok, txt }
  const [busy, setBusy]     = useState(false)

  useEffect(() => {
    if (open) {
      setNombre(profile?.nombre || profile?.full_name || '')
      setEmpresa(profile?.empresa || profile?.company_name || '')
      setMsg(null); setPwd(''); setPwd2('')
    }
  }, [open])

  const TABS = [
    { id: 'perfil',    label: 'Perfil' },
    { id: 'seguridad', label: 'Contraseña' },
    { id: 'plan',      label: 'Plan' },
  ]

  const PLANES = [
    { id: 'estimador',    nombre: 'Estimador',       m: 29,  y: 290,  color: '#6366f1', features: ['Presupuesto APU completo', 'Exportación PDF y Excel', 'Fichas de costo ilimitadas', 'Catálogos de insumos'] },
    { id: 'planificador', nombre: 'Planificador',     m: 59,  y: 590,  color: '#f59e0b', pop: true, features: ['Todo lo de Estimador', 'Cronograma (Gantt)', 'Flujo de caja', 'Análisis de recursos'] },
    { id: 'director',     nombre: 'Director de Obra', m: 99,  y: 990,  color: '#10b981', features: ['Todo lo de Planificador', 'Órdenes de cambio', 'Planillas a contratistas', 'Control de gastos y KPIs'] },
  ]

  const savePerfil = async () => {
    if (!nombre.trim()) return setMsg({ ok: false, txt: 'El nombre es requerido' })
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('profiles').update({ nombre: nombre.trim(), empresa: empresa.trim() }).eq('id', user.id)
    setBusy(false)
    if (error) setMsg({ ok: false, txt: error.message })
    else { setMsg({ ok: true, txt: 'Perfil actualizado correctamente' }); onSaved({ nombre: nombre.trim(), empresa: empresa.trim() }) }
  }

  const savePwd = async () => {
    if (pwd.length < 6) return setMsg({ ok: false, txt: 'Mínimo 6 caracteres' })
    if (pwd !== pwd2)   return setMsg({ ok: false, txt: 'Las contraseñas no coinciden' })
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pwd })
    setBusy(false)
    if (error) setMsg({ ok: false, txt: error.message })
    else { setMsg({ ok: true, txt: 'Contraseña actualizada' }); setPwd(''); setPwd2('') }
  }

  const inputStyle = { borderRadius: 'var(--r-md)', width: '100%' }

  if (!open) return null
  return (
    <Drawer open={open} onClose={onClose} title="Configuración de cuenta" subtitle={user?.email} width={500}
      footer={
        tab === 'perfil'    ? <><button onClick={onClose} className="btn ghost">Cancelar</button><button onClick={savePerfil} className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></> :
        tab === 'seguridad' ? <><button onClick={onClose} className="btn ghost">Cancelar</button><button onClick={savePwd} className="btn primary" disabled={busy}>{busy ? 'Actualizando…' : 'Cambiar contraseña'}</button></> :
        <button onClick={onClose} className="btn ghost">Cerrar</button>
      }>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--c-line)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setMsg(null) }}
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? 'var(--c-primary)' : 'var(--c-text-2)', background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid var(--c-primary)' : '2px solid transparent', cursor: 'pointer', marginBottom: -1, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Mensaje feedback */}
      {msg && (
        <div style={{ padding: '9px 14px', borderRadius: 'var(--r-md)', marginBottom: 18, fontSize: 13, background: msg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)', color: msg.ok ? '#10b981' : 'var(--c-danger)', border: `1px solid ${msg.ok ? '#10b981' : 'var(--c-danger)'}` }}>
          {msg.txt}
        </div>
      )}

      {/* ── Perfil ── */}
      {tab === 'perfil' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="field">
            <label className="field-label">Nombre completo</label>
            <input className="input" style={inputStyle} value={nombre} placeholder="Ej. Juan Pérez" onChange={e => setNombre(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Empresa / Organización</label>
            <input className="input" style={inputStyle} value={empresa} placeholder="Ej. Constructora XYZ" onChange={e => setEmpresa(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Correo electrónico</label>
            <input className="input" style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }} value={user?.email || ''} disabled />
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 4 }}>El correo no se puede cambiar desde aquí.</div>
          </div>
        </div>
      )}

      {/* ── Contraseña ── */}
      {tab === 'seguridad' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="field">
            <label className="field-label">Nueva contraseña</label>
            <input className="input" style={inputStyle} type="password" value={pwd} placeholder="Mínimo 6 caracteres" onChange={e => setPwd(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Confirmar contraseña</label>
            <input className="input" style={inputStyle} type="password" value={pwd2} placeholder="Repite la nueva contraseña" onChange={e => setPwd2(e.target.value)} />
          </div>
        </div>
      )}

      {/* ── Plan ── */}
      {tab === 'plan' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--c-text-2)', marginBottom: 4 }}>Selecciona el plan que mejor se adapte a tus necesidades.</div>
          {PLANES.map(p => (
            <div key={p.id} style={{ border: `1.5px solid ${p.pop ? p.color : 'var(--c-line)'}`, borderRadius: 'var(--r-lg)', padding: '16px 18px', position: 'relative', background: p.pop ? `${p.color}12` : 'var(--c-bg)' }}>
              {p.pop && <span style={{ position: 'absolute', top: -10, right: 14, background: p.color, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>MÁS POPULAR</span>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-ink)' }}>{p.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 2 }}>desde <b style={{ color: 'var(--c-ink)' }}>${p.m}/mes</b> · ${p.y}/año</div>
                </div>
                <button className="btn sm" style={{ background: p.color, borderColor: p.color, color: '#fff', flexShrink: 0 }}>Seleccionar</button>
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: 'var(--c-text-2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {p.features.map(f => <li key={f}>{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  )
}

// ============ NOTIFICATIONS DROPDOWN ============
function NotificationsDropdown({ notifs, onClose }) {
  const ref = useRef(null)
  useClickOutside(ref, onClose)
  const grupos = [
    { tipo: 'error-calculo',       label: 'Errores de cálculo',   color: 'var(--c-danger)' },
    { tipo: 'actividad-sin-costo', label: 'Actividades sin costo', color: 'var(--c-warn)' },
    { tipo: 'insumo-sin-precio',   label: 'Insumos sin precio',    color: 'var(--c-warn)' },
  ]
  return (
    <div ref={ref} style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 50, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--c-ink)' }}>Notificaciones</span>
        {notifs.length > 0 && <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{notifs.length} alerta{notifs.length !== 1 ? 's' : ''}</span>}
      </div>
      {notifs.length === 0 ? (
        <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
          Sin alertas pendientes
        </div>
      ) : (
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {grupos.map(g => {
            const items = notifs.filter(n => n.tipo === g.tipo)
            if (!items.length) return null
            return (
              <div key={g.tipo}>
                <div style={{ padding: '7px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: g.color || 'var(--c-text-3)', background: 'var(--c-bg)', borderBottom: '1px solid var(--c-line-2)' }}>
                  ⚠ {g.label} ({items.length})
                </div>
                {items.slice(0, 6).map(n => (
                  <div key={n.id} style={{ padding: '9px 16px', borderBottom: '1px solid var(--c-line-2)' }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.msg}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{n.sub}</div>
                  </div>
                ))}
                {items.length > 6 && (
                  <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--c-text-3)', background: 'var(--c-bg)' }}>+{items.length - 6} más en esta categoría</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============ INSUMO SELECT ============
// Dropdown con position:fixed para escapar de cualquier overflow:hidden padre
function InsumoSelect({ catalogos, categoria, value, onChange, onCreateNew }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 320 })
  const triggerRef = useRef(null)
  const dropRef = useRef(null)

  // Calcula posición del trigger al abrir
  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      const dropH = 320 // altura aprox del dropdown
      const spaceBelow = window.innerHeight - r.bottom
      const top = spaceBelow < dropH && r.top > dropH
        ? r.top - dropH - 4   // abre hacia arriba si no hay espacio abajo
        : r.bottom + 4
      setPos({ top, left: r.left, width: Math.max(r.width, 320) })
    }
    setOpen(o => !o)
  }

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return
    const handler = e => {
      if (triggerRef.current?.contains(e.target)) return
      if (dropRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const sel = (catalogos[categoria] || []).find(i => i.id === value)
  const qn = normalize(q)
  const list = (catalogos[categoria] || []).filter(i => !qn || normalize(i.descripcion).includes(qn) || normalize(i.codigo).includes(qn))
  const exact = (catalogos[categoria] || []).find(i => normalize(i.codigo) === qn)

  return (
    <div ref={triggerRef} style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={handleOpen}
        style={{ width: '100%', textAlign: 'left', padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
        {sel
          ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sel.descripcion}</span>
          : <span style={{ color: 'var(--c-text-4)', fontStyle: 'italic', fontSize: 12 }}>— seleccionar —</span>}
      </button>

      {open && (
        <div
          ref={dropRef}
          style={{
            position: 'fixed',
            zIndex: 9999,
            top: pos.top,
            left: pos.left,
            width: pos.width,
            background: 'var(--c-surface)',
            border: '1px solid var(--c-line)',
            borderRadius: 'var(--r-lg)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
            overflow: 'hidden',
          }}>
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && exact) { onChange(exact.id); setOpen(false); setQ('') } if (e.key === 'Escape') setOpen(false) }}
            placeholder="Buscar por descripción o código…"
            className="input"
            style={{ border: 0, borderBottom: '1px solid var(--c-line)', borderRadius: 0 }}
          />
          {exact && (
            <div style={{ padding: '6px 12px', background: 'var(--c-accent-soft)', color: '#B45309', fontSize: 12, borderBottom: '1px solid var(--c-line)' }}>
              ↵ Asignar código <strong>{exact.codigo}</strong>
            </div>
          )}
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {!list.length && <div style={{ padding: 12, fontSize: 12, color: 'var(--c-text-3)' }}>Sin coincidencias.</div>}
            {list.map(i => (
              <div
                key={i.id}
                onClick={() => { onChange(i.id); setOpen(false); setQ('') }}
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--c-line-2)', fontSize: 13 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {i.codigo && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--c-bg)', color: 'var(--c-text-3)', padding: '1px 5px', borderRadius: 3 }}>{i.codigo}</span>}
                  <span style={{ fontWeight: 500 }}>{i.descripcion}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{i.unidad} · {money(i.costoBase)}</div>
              </div>
            ))}
          </div>
          {q.trim() && !exact && (
            <button
              onClick={() => { onCreateNew(q.trim()); setOpen(false); setQ('') }}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--c-success-soft)', color: 'var(--c-success)', border: 'none', borderTop: '1px solid var(--c-line)', cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left' }}>
              + Crear "{q.trim()}" en catálogo
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ============ FICHA SECTION ============
function FichaSection({ title, k, total, ficha, catalogos, onAdd, onDel, onUpd, onCreateIns, moTotal = 0 }) {
  return (
    <div style={{ marginBottom: 16, border: '1px solid var(--c-line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
      <div style={{ background: 'var(--c-ink)', color: '#fff', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
        <button onClick={() => onAdd(k)} className="btn xs" style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'transparent', color: '#fff' }}>+ Agregar</button>
      </div>
      <table className="bt" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ width: 80 }}>#</th>
            <th>Insumo</th>
            <th style={{ width: 70 }}>Unidad</th>
            <th className="num" style={{ width: 80 }}>Rend.</th>
            <th className="num" style={{ width: 70 }}>Desp.%</th>
            <th className="num" style={{ width: 100 }}>Costo Base</th>
            <th className="num" style={{ width: 100 }}>Subtotal</th>
            <th style={{ width: 28 }}></th>
          </tr>
        </thead>
        <tbody>
          {(ficha[k] || []).map((c, i) => {
            const ins = findInsumo(catalogos, k, c.insumoId)
            const isMoBased = k === 'herramientaEquipo' && normalize(ins?.descripcion) === 'herramienta menor'
            const effectiveBase = isMoBased ? moTotal : (ins?.costoBase || 0)
            return (
              <tr key={c.id} className="activity">
                <td className="id" style={{ fontSize: 11, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)' }}>{ins?.codigo || (i + 1)}</td>
                <td style={{ padding: 0 }}>
                  <InsumoSelect catalogos={catalogos} categoria={k} value={c.insumoId} onChange={v => onUpd(k, i, 'insumoId', v)} onCreateNew={d => onCreateIns(k, i, d)} />
                </td>
                <td className="num" style={{ color: 'var(--c-text-2)', fontSize: 12 }}>{ins ? ins.unidad : '—'}</td>
                <td className="num"><input type="number" step="any" className="cell-input num" value={c.rendimiento} onFocus={e => e.target.select()} onChange={e => onUpd(k, i, 'rendimiento', parseFloat(e.target.value) || 0)} /></td>
                <td className="num"><input type="number" step="any" className="cell-input num" value={c.desperdicio} onFocus={e => e.target.select()} onChange={e => onUpd(k, i, 'desperdicio', parseFloat(e.target.value) || 0)} /></td>
                <td className="num" style={{ color: isMoBased ? 'var(--c-accent)' : 'var(--c-text-2)' }} title={isMoBased ? 'Calculado sobre el total MO' : undefined}>
                  {ins ? money(effectiveBase) : '—'}
                  {isMoBased && <span style={{ fontSize: 9, marginLeft: 3, color: 'var(--c-accent)' }}>MO</span>}
                </td>
                <td className="num" style={{ fontWeight: 600 }}>{money(conceptoCost(c, catalogos, k, { moTotal }))}</td>
                <td style={{ textAlign: 'center' }}><button onClick={() => onDel(k, i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-danger)', fontSize: 16, lineHeight: 1 }}>×</button></td>
              </tr>
            )
          })}
          <tr className="subtotal">
            <td colSpan={6} style={{ textAlign: 'right', fontStyle: 'italic', fontSize: 12, color: 'var(--c-text-2)', padding: '6px 14px' }}>SUBTOTAL {title}</td>
            <td className="num" style={{ fontWeight: 700, color: 'var(--c-ink)' }}>{money(total)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ============ FICHA COSTO MODAL ============
function FichaCostoModal({ open, onClose, actividad, budget, catalogos, params, onUpdate, onUpdateCatalogos, empresa = {} }) {
  if (!open || !actividad) return null
  const money = makeMoneyFmt(budget?.moneda)
  const f = actividad.ficha || { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] }
  const calc = calcFicha(f, catalogos, params)
  const upd = (k, i, fld, v) => { const nf = { ...f, [k]: [...f[k]] }; nf[k][i] = { ...nf[k][i], [fld]: v }; onUpdate({ ...actividad, ficha: nf }) }
  const add = k => onUpdate({ ...actividad, ficha: { ...f, [k]: [...(f[k] || []), { id: uid(), insumoId: null, rendimiento: 1, desperdicio: 0 }] } })
  const del = (k, i) => onUpdate({ ...actividad, ficha: { ...f, [k]: f[k].filter((_, ix) => ix !== i) } })
  const createIns = (k, i, desc) => { const r = findOrCreateInsumo(catalogos, k, desc); if (!r) return; onUpdateCatalogos(r.catalogos); upd(k, i, 'insumoId', r.insumo.id) }
  return (
    <Fragment>
      <div className="scrim" onClick={onClose}></div>
      <div style={{ position: 'fixed', top: '3%', left: '50%', transform: 'translateX(-50%)', width: 'min(90vw, 900px)', maxHeight: '94vh', background: 'var(--c-surface)', borderRadius: 16, boxShadow: 'var(--shadow-xl)', zIndex: 51, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, var(--c-ink-2), var(--c-ink))', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-accent)', fontWeight: 700, marginBottom: 4 }}>Ficha de Costo Unitario</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{actividad.id} — {actividad.descripcion}</div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ color: '#fff', background: 'rgba(255,255,255,0.1)' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '12px 20px', background: 'var(--c-accent-soft)', borderBottom: '1px solid var(--c-line)' }}>
          {[['Actividad', actividad.id], ['Cantidad', `${fmt(actividad.cantidad)} ${actividad.unidad}`], ['Unidad', actividad.unidad], ['Fecha', new Date().toLocaleDateString()]].map(([lbl, val]) => (
            <div key={lbl}>
              <div style={{ fontSize: 10, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{lbl}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {CATEGORIAS.map(cat => (
            <FichaSection key={cat.key} title={cat.label.toUpperCase()} k={cat.key}
              total={cat.key === 'materiales' ? calc.totMat : cat.key === 'manoObra' ? calc.totMo : cat.key === 'herramientaEquipo' ? calc.totHe : calc.totSub}
              ficha={f} catalogos={catalogos} onAdd={add} onDel={del} onUpd={upd} onCreateIns={createIns}
              moTotal={calc.totMo} />
          ))}
          <div style={{ marginTop: 24, border: '1px solid var(--c-line)', borderRadius: 'var(--r-lg)', overflow: 'hidden', maxWidth: 340, marginLeft: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 12px', background: 'var(--c-bg-2)', borderBottom: '1px solid var(--c-line)', color: 'var(--c-text)' }}>Resumen</div>
            {[
              { lbl: 'Materiales',           val: calc.totMat,       bold: false, divider: false },
              { lbl: 'Mano de Obra',         val: calc.totMo,        bold: false, divider: false },
              { lbl: 'Herramientas y Equipo',val: calc.totHe,        bold: false, divider: false },
              { lbl: 'Subcontratos',         val: calc.totSub,       bold: false, divider: true  },
              { lbl: 'COSTO DIRECTO',        val: calc.costoDirecto, bold: true,  divider: true  },
              { lbl: `Indirectos (${params.pctIndirectos}%)`,  val: calc.indirectos,  bold: false, divider: false },
              { lbl: `Imprevistos (${params.pctImprevistos}%)`,val: calc.imprevistos, bold: false, divider: false },
              { lbl: `Utilidad (${params.pctUtilidad}%)`,      val: calc.utilidad,    bold: false, divider: false },
              { lbl: `Impuesto (${params.pctImpuesto}%)`,      val: calc.impuesto,    bold: false, divider: false },
            ].map(({ lbl, val, bold, divider }) => (
              <div key={lbl} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 12px',
                borderBottom: divider ? '1px solid var(--c-line)' : '1px solid var(--c-line-2)',
                background: bold ? 'var(--c-bg)' : 'transparent',
              }}>
                <span style={{ fontSize: 13, fontWeight: bold ? 700 : 400, color: bold ? 'var(--c-text)' : 'var(--c-text-2)' }}>{lbl}</span>
                <span style={{ fontSize: 13, fontWeight: bold ? 700 : 400, fontFamily: 'var(--font-mono)', color: 'var(--c-text)' }}>{money(val)}</span>
              </div>
            ))}
            <div style={{ background: 'var(--c-ink)', color: '#fff', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Precio Unitario Total</span>
              <span style={{ fontWeight: 700, fontSize: 20, color: 'var(--c-accent)', fontFamily: 'var(--font-mono)' }}>{money(calc.precioUnitario)}</span>
            </div>
          </div>
        </div>
        <div style={{ background: 'var(--c-bg-2)', borderTop: '1px solid var(--c-line)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => budget && exportPDFFicha(budget, actividad, params, empresa)} className="btn" style={{ background: 'var(--c-danger)', borderColor: 'var(--c-danger)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={13} /> PDF</button>
            <button onClick={() => budget && exportExcelFicha(budget, actividad, params)} className="btn" style={{ background: 'var(--c-success)', borderColor: 'var(--c-success)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}><FileSpreadsheet size={13} /> Excel</button>
          </div>
          <button onClick={onClose} className="btn primary">Cerrar</button>
        </div>
      </div>
    </Fragment>
  )
}

// ============ INDIRECTOS VIEW ============
function IndirectosView({ budget, setBudget }) {
  const money = makeMoneyFmt(budget.moneda)
  const lista = budget.indirectos || []

  const costoDirecto = round2(budget.items.reduce((s, it) => s + calcItem(it, budget.catalogos, { pctIndirectos: 0, pctImprevistos: 0, pctUtilidad: 0, pctImpuesto: 0 }).subtotal, 0))

  const setLista = rows => {
    const tot = round2(rows.reduce((s, r) => s + round2((+r.cantidad||0) * (+r.costoBase||0)), 0))
    const pct = (tot > 0 && costoDirecto > 0) ? round2((tot / costoDirecto) * 100) : budget.pctIndirectos
    setBudget({ ...budget, indirectos: rows, pctIndirectos: pct })
  }

  const total = round2(lista.reduce((s, r) => s + round2((+r.cantidad||0) * (+r.costoBase||0)), 0))
  const pctCalculado = costoDirecto > 0 ? round2((total / costoDirecto) * 100) : null

  const addRow = () => setLista([...lista, { id: uid(), descripcion: '', unidad: 'mes', cantidad: 1, costoBase: 0 }])

  const del = id => setLista(lista.filter(r => r.id !== id))

  const upd = (id, k, v) => setLista(lista.map(r => r.id === id ? { ...r, [k]: v } : r))

  const restore = () => {
    if (!confirm('¿Restaurar la lista base? Se perderán los cambios actuales.')) return
    setLista(DEFAULT_INDIRECTOS.map(x => ({ ...x, id: uid() })))
  }

  const cellStyle = { padding: '6px 10px', borderBottom: '1px solid var(--c-line-2)', fontSize: 13 }
  const inputStyle = { background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: 13, color: 'var(--c-text)', fontFamily: 'inherit' }
  const numStyle   = { ...inputStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>Costos Indirectos</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 2 }}>{lista.length} conceptos</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn sm ghost" onClick={restore} title="Restaurar lista base" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Restaurar
          </button>
          <button className="btn sm primary" onClick={addRow} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={13} /> Agregar
          </button>
        </div>
      </div>

      {/* KPIs vinculados */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        <div style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-line)', borderRadius: 'var(--r-lg)', padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Costo Directo</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--c-text)' }}>{money(costoDirecto)}</div>
          <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>Del presupuesto activo</div>
        </div>
        <div style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-line)', borderRadius: 'var(--r-lg)', padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total Indirectos</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--c-text)' }}>{money(total)}</div>
          <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>Suma de conceptos activos</div>
        </div>
        <div style={{ background: pctCalculado !== null ? 'var(--c-accent-soft)' : 'var(--c-bg-2)', border: `1px solid ${pctCalculado !== null ? 'var(--c-accent)' : 'var(--c-line)'}`, borderRadius: 'var(--r-lg)', padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            % Indirectos
            {pctCalculado !== null && costoDirecto > 0 && (
              <span style={{ background: 'var(--c-accent)', color: '#000', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase' }}>auto</span>
            )}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: pctCalculado !== null ? 'var(--c-accent)' : 'var(--c-text)' }}>
            {pctCalculado !== null ? `${pctCalculado}%` : `${budget.pctIndirectos}%`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>
            {pctCalculado !== null && costoDirecto > 0 ? 'Vinculado a Parámetros globales' : 'Sin costo directo calculado'}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ border: '1px solid var(--c-line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--c-bg-2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-text-2)' }}>
              <th style={{ ...cellStyle, width: 36, textAlign: 'center' }}>#</th>
              <th style={{ ...cellStyle, textAlign: 'left' }}>Descripción</th>
              <th style={{ ...cellStyle, width: 90, textAlign: 'center' }}>Unidad</th>
              <th style={{ ...cellStyle, width: 80, textAlign: 'right' }}>Cantidad</th>
              <th style={{ ...cellStyle, width: 120, textAlign: 'right' }}>Costo Unitario</th>
              <th style={{ ...cellStyle, width: 120, textAlign: 'right' }}>Subtotal</th>
              <th style={{ ...cellStyle, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r, i) => {
              const sub = round2((+r.cantidad||0) * (+r.costoBase||0))
              return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-2)' }}>
                  <td style={{ ...cellStyle, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 11 }}>{i + 1}</td>
                  <td style={cellStyle}>
                    <input style={inputStyle} value={r.descripcion} onChange={e => upd(r.id, 'descripcion', e.target.value)} placeholder="Descripción…" />
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    <input style={{ ...inputStyle, textAlign: 'center' }} value={r.unidad} onChange={e => upd(r.id, 'unidad', e.target.value)} placeholder="mes" />
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    <input style={numStyle} type="number" min="0" value={r.cantidad} onFocus={e => e.target.select()} onChange={e => upd(r.id, 'cantidad', +e.target.value)} />
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    <input style={numStyle} type="number" min="0" step="0.01" value={r.costoBase} onFocus={e => e.target.select()} onChange={e => upd(r.id, 'costoBase', +e.target.value)} />
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', color: sub > 0 ? 'var(--c-text)' : 'var(--c-text-4)' }}>
                    {money(sub)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    <button onClick={() => del(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-danger)', padding: 2, lineHeight: 1 }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {lista.length === 0 && (
              <tr><td colSpan={7} style={{ ...cellStyle, textAlign: 'center', color: 'var(--c-text-3)', padding: '24px', fontStyle: 'italic' }}>
                Sin conceptos. Agrega uno o restaura la lista base.
              </td></tr>
            )}
          </tbody>
          {lista.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--c-ink)', color: '#fff' }}>
                <td colSpan={5} style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: 'none' }}>
                  Total Indirectos
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--c-accent)', borderBottom: 'none' }}>
                  {money(total)}
                </td>
                <td style={{ ...cellStyle, borderBottom: 'none' }}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ============ INICIO PAGE ============
function InicioPage({ proyectos, openProject, addProject, setPage, userName }) {
  const h = new Date().getHours()
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
  const firstName = (userName || 'Usuario').split(' ')[0]

  const totalCartera   = proyectos.reduce((s, p) => s + calcKPIs(p).total, 0)
  const activos        = proyectos.filter(p => p.estado === 'Activo').length
  const enRevision     = proyectos.filter(p => p.estado === 'En revisión').length
  const aprobados      = proyectos.filter(p => p.estado === 'Aprobado').length
  const tasaAprobacion = proyectos.length > 0 ? Math.round((aprobados / proyectos.length) * 100) : 0

  const getProgress = p => {
    let filled = 0, total = 0
    const walk = its => its.forEach(it => {
      if (it.tipo === 'actividad') { total++; const f = it.ficha || {}; if ((f.materiales||[]).length + (f.manoObra||[]).length + (f.herramientaEquipo||[]).length + (f.subcontratos||[]).length > 0) filled++ }
      else if (it.children) walk(it.children)
    })
    walk(p.items || [])
    return total > 0 ? Math.round(filled / total * 100) : 0
  }

  const COVERS = ['linear-gradient(135deg,#0A1428,#14213D)','linear-gradient(135deg,#1D4ED8,#2563EB)','linear-gradient(135deg,#059669,#10B981)','linear-gradient(135deg,#7C3AED,#8B5CF6)','linear-gradient(135deg,#DC2626,#EF4444)','linear-gradient(135deg,#D97706,#F59E0B)']
  const getCover = i => COVERS[i % COVERS.length]
  const recent    = proyectos.slice(0, 5)
  const favorites = [...proyectos].sort((a, b) => calcKPIs(b).total - calcKPIs(a).total).slice(0, 3)

  return (
    <div className="page-body" style={{ paddingTop: 28 }}>
      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', fontWeight: 500, marginBottom: 4 }}>{saludo},</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>{userName} 👋</h1>
          <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginTop: 6 }}>
            Tienes <b style={{ color: 'var(--c-ink)' }}>{activos} proyecto{activos !== 1 ? 's' : ''} activo{activos !== 1 ? 's' : ''}</b>
            {enRevision > 0 && <> y <b style={{ color: 'var(--c-warn)' }}>{enRevision} en revisión</b></>}.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn" onClick={() => setPage('plantillas')}><Upload size={14} /> Importar</button>
          <button className="btn brand" onClick={addProject}><Plus size={14} strokeWidth={2.5} /> Nuevo Proyecto</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        <div className="kpi highlight">
          <div className="kpi-label"><DollarSign size={12} className="ico" /> Valor Total Cartera</div>
          <div className="kpi-val">{moneyK(totalCartera)}</div>
          <div className="kpi-foot">Suma de {proyectos.length} proyecto{proyectos.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Activity size={12} className="ico" /> Proyectos Activos</div>
          <div className="kpi-val">{activos}</div>
          <div className="kpi-foot">{enRevision} en revisión</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Clock size={12} className="ico" /> En Revisión</div>
          <div className="kpi-val">{enRevision}</div>
          <div className="kpi-foot">Pendientes de aprobación</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><TrendingUp size={12} className="ico" /> Tasa de Aprobación</div>
          <div className="kpi-val">{tasaAprobacion}%</div>
          <div className="kpi-foot">{aprobados} aprobado{aprobados !== 1 ? 's' : ''} de {proyectos.length}</div>
        </div>
      </div>

      {/* Main 2-col */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Continuar trabajando */}
        <div>
          <div className="sec-head">
            <div>
              <div className="sec-title"><Clock size={16} /> Continuar trabajando</div>
              <div className="sec-sub">Proyectos abiertos recientemente</div>
            </div>
            <button className="btn ghost sm" onClick={() => setPage('proyectos')}>Ver todos <ArrowRight size={12} /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recent.length === 0 ? (
              <div className="card" style={{ padding: 32, textAlign: 'center', borderStyle: 'dashed' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 4 }}>No hay proyectos aún</div>
                <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginBottom: 16 }}>Crea tu primer presupuesto de obra</div>
                <button className="btn brand" onClick={addProject}><Plus size={13} /> Crear proyecto</button>
              </div>
            ) : recent.map((p, idx) => {
              const k = calcKPIs(p)
              const pct = getProgress(p)
              return (
                <div key={p.id} className="card" style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'center', cursor: 'pointer' }} onClick={() => openProject(p)}>
                  <div style={{ width: 52, height: 52, borderRadius: 10, background: getCover(idx), flexShrink: 0, display: 'grid', placeItems: 'center' }}>
                    <Building2 size={22} strokeWidth={1.5} style={{ color: 'rgba(255,255,255,0.9)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <StatusBadge status={p.estado} />
                      <span className="badge">Rev {p.revision}</span>
                      <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>· {p.ultimaEdicion}</span>
                    </div>
                    <div style={{ fontWeight: 600, color: 'var(--c-ink)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombreProyecto}</div>
                    <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 2, display: 'flex', gap: 12 }}>
                      <span>{p.cliente || 'Sin cliente'}</span>
                      {p.lugar && <><span>·</span><span><MapPin size={11} style={{ verticalAlign: '-2px' }} /> {p.lugar}</span></>}
                    </div>
                    {k.nActividades > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="proj-progress" style={{ flex: 1, margin: 0 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--c-accent)', borderRadius: 999 }}></div>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-2)', width: 32, textAlign: 'right' }}>{pct}%</span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="proj-amount-label">Total</div>
                    <div className="proj-amount">{money(k.total)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className="sec-head">
              <div>
                <div className="sec-title"><Star size={16} /> Favoritos</div>
                <div className="sec-sub">Proyectos más grandes</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {favorites.length === 0 ? (
                <div className="card" style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--c-text-3)', borderStyle: 'dashed' }}>Sin proyectos aún</div>
              ) : favorites.map((p, idx) => {
                const k = calcKPIs(p)
                return (
                  <div key={p.id} className="card" style={{ padding: 12, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }} onClick={() => openProject(p)}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: getCover(idx), flexShrink: 0 }}></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--c-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombreProyecto}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text-3)' }}>{money(k.total)}</div>
                    </div>
                    <ArrowUpRight size={14} style={{ color: 'var(--c-text-3)' }} />
                  </div>
                )
              })}
            </div>
          </div>
          <div>
            <div className="sec-head">
              <div className="sec-title"><Sparkles size={16} /> Acciones rápidas</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Nuevo Proyecto',  Icon: Plus,       color: '#2563EB', onClick: addProject },
                { label: 'Importar Excel',  Icon: Upload,     color: '#10B981', onClick: () => setPage('plantillas') },
                { label: 'Ver Proyectos',   Icon: Folder,     color: '#7C3AED', onClick: () => setPage('proyectos') },
                { label: 'Planes',          Icon: CreditCard, color: '#D97706', onClick: () => setPage('planes') },
              ].map(({ label, Icon, color, onClick }) => (
                <button key={label} onClick={onClick} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: color + '18', color, display: 'grid', placeItems: 'center' }}><Icon size={16} /></div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-ink)', lineHeight: 1.3 }}>{label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ PROYECTOS PAGE ============
function ProyectosPage({ proyectos, openProject, addProject, deleteProject }) {
  const [q, setQ] = useState('')
  const [f, setF] = useState('Todos')
  const [layout, setLayout] = useState('grid')
  const filters = ['Todos', 'Activo', 'En revisión', 'Borrador', 'Aprobado']
  const list = proyectos.filter(p => (f === 'Todos' || p.estado === f) && (!q || normalize(p.nombreProyecto).includes(normalize(q)) || normalize(p.cliente).includes(normalize(q))))
  const totalCartera = proyectos.reduce((s, p) => s + calcKPIs(p).total, 0)
  const COVERS = ['linear-gradient(135deg,#0A1428,#14213D)','linear-gradient(135deg,#1D4ED8,#2563EB)','linear-gradient(135deg,#059669,#10B981)','linear-gradient(135deg,#7C3AED,#8B5CF6)','linear-gradient(135deg,#DC2626,#EF4444)','linear-gradient(135deg,#D97706,#F59E0B)']
  const getCover = i => COVERS[i % COVERS.length]

  return (
    <Fragment>
      <div className="page-head">
        <div className="page-head-title">
          <h1>Proyectos <span className="badge" style={{ fontSize: 12, padding: '3px 9px' }}>{proyectos.length}</span></h1>
          <div className="page-head-meta">
            <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}>Cartera total: <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-ink)' }}>{money(totalCartera)}</b></span>
          </div>
        </div>
        <div className="page-head-actions">
          <button className="btn brand" onClick={addProject}><Plus size={14} strokeWidth={2.5} /> Nuevo Proyecto</button>
        </div>
      </div>
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--c-line)', background: 'var(--c-surface)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="topbar-search" style={{ width: 300 }}>
          <Search size={14} />
          <input placeholder="Buscar por nombre o cliente…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="seg">
          {filters.map(fil => <button key={fil} className={f === fil ? 'on' : ''} onClick={() => setF(fil)}>{fil}</button>)}
        </div>
        <div style={{ flex: 1 }}></div>
        <div className="seg">
          <button className={layout === 'grid' ? 'on' : ''} onClick={() => setLayout('grid')}><Grid size={13} /></button>
          <button className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')}><List size={13} /></button>
        </div>
      </div>
      <div className="page-body" style={{ paddingTop: 18 }}>
        {layout === 'grid' ? (
          <div className="proj-grid">
            {list.map((p, idx) => {
              const k = calcKPIs(p)
              return (
                <div key={p.id} className="proj-card" style={{ position: 'relative' }} onClick={() => openProject(p)}>
                  <button onClick={e => { e.stopPropagation(); deleteProject(p.id, p.nombreProyecto) }}
                    style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--c-danger)', opacity: 0, transition: 'opacity 120ms' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    title="Eliminar proyecto">
                    <Trash2 size={13} />
                  </button>
                  <div className="proj-thumb" style={{ background: getCover(idx) }}>
                    <span className="badge dark proj-thumb-tag">{p.tipo}</span>
                  </div>
                  <div className="proj-body">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <StatusBadge status={p.estado} />
                      <span className="badge">Rev {p.revision}</span>
                      <span style={{ fontSize: 11, color: 'var(--c-text-3)', marginLeft: 'auto' }}>{p.ultimaEdicion}</span>
                    </div>
                    <div className="proj-name">{p.nombreProyecto}</div>
                    <div className="proj-client">{p.cliente || '—'}</div>
                    <div className="proj-meta">
                      <span className="proj-meta-item"><MapPin size={12} /> {p.lugar || '—'}</span>
                      <span className="proj-meta-item"><Layers size={12} /> {k.nCapitulos} cap.</span>
                    </div>
                    <div className="proj-progress"><div style={{ width: '60%' }}></div></div>
                  </div>
                  <div className="proj-foot">
                    <div>
                      <div className="proj-amount-label">Total Estimado</div>
                      <div className="proj-amount">{money(k.total)}</div>
                    </div>
                    <ArrowUpRight size={16} style={{ color: 'var(--c-text-3)' }} />
                  </div>
                </div>
              )
            })}
            <button className="proj-card" onClick={addProject} style={{ background: 'var(--c-bg-2)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', minHeight: 260, color: 'var(--c-text-3)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Plus size={28} strokeWidth={1.5} />
              <div style={{ fontSize: 14, fontWeight: 500 }}>Crear nuevo proyecto</div>
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="bt">
              <thead><tr><th>Proyecto</th><th>Cliente</th><th>Ubicación</th><th>Estado</th><th className="num">Total</th><th>Actualizado</th><th></th></tr></thead>
              <tbody>
                {list.map(p => {
                  const k = calcKPIs(p)
                  return (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openProject(p)}>
                      <td><div style={{ fontWeight: 600, color: 'var(--c-ink)' }}>{p.nombreProyecto}</div><div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>Rev {p.revision} · {p.tipo}</div></td>
                      <td>{p.cliente || '—'}</td><td>{p.lugar || '—'}</td>
                      <td><StatusBadge status={p.estado} /></td>
                      <td className="num" style={{ fontWeight: 600 }}>{money(k.total)}</td>
                      <td style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{p.ultimaEdicion}</td>
                      <td className="actions"><button className="btn ghost icon sm" onClick={e => { e.stopPropagation(); deleteProject(p.id, p.nombreProyecto) }}><Trash2 size={13} style={{ color: 'var(--c-danger)' }} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!list.length && <div className="empty">Sin proyectos que coincidan</div>}
          </div>
        )}
      </div>
    </Fragment>
  )
}

// ============ DROPDOWN ============
function Dropdown({ trigger, children, align = 'right', minWidth = 220 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false))
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={() => setOpen(o => !o)}>{trigger}</div>
      {open && (
        <div style={{
          position: 'absolute', zIndex: 40, marginTop: 4,
          [align === 'right' ? 'right' : 'left']: 0,
          minWidth,
          background: 'var(--c-surface)',
          border: '1px solid var(--c-line)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ============ SYNC HELPER ============
// Recorre el árbol de items y retorna un mapa { descripcion → ficha }
// con la PRIMERA ficha no-vacía encontrada por nombre (orden top-down)
function buildFichaMap(items) {
  const map = {}
  const hasContent = f => !!(f?.materiales?.length || f?.manoObra?.length || f?.herramientaEquipo?.length || f?.subcontratos?.length)
  const walk = arr => arr.forEach(it => {
    if (it.tipo === 'actividad') {
      const d = it.descripcion?.trim()
      if (d && !map[d] && hasContent(it.ficha)) map[d] = it.ficha
    }
    if (it.children?.length) walk(it.children)
  })
  walk(items)
  return map
}

// Aplica el mapa de fichas a TODAS las actividades con ese nombre (sobreescribe)
function applyFichaMap(items, map) {
  const its = JSON.parse(JSON.stringify(items))
  const apply = arr => arr.forEach(it => {
    if (it.tipo === 'actividad') {
      const d = it.descripcion?.trim()
      if (d && map[d]) it.ficha = JSON.parse(JSON.stringify(map[d]))
    }
    if (it.children?.length) apply(it.children)
  })
  apply(its)
  return its
}

// Punto de entrada para el botón Sincronizar
function syncFichasByName(items) {
  const map = buildFichaMap(items)
  if (!Object.keys(map).length) return items
  return applyFichaMap(items, map)
}

// ============ PRESUPUESTO TABLE ============
function PresupuestoTableComp({ budget, setBudget, onOpenFicha, params }) {
  const money = makeMoneyFmt(budget.moneda)
  const upd = (path, fld, v) => {
    const its = JSON.parse(JSON.stringify(budget.items))
    let cur = its; for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]].children
    cur[path[path.length - 1]][fld] = v
    if (fld === 'descripcion') {
      // Al renombrar: si ya existe otra actividad con ese nombre y tiene ficha, adoptarla
      const newDesc = v?.trim()
      const pathKey = path.join('-')
      const hasContent = f => !!(f?.materiales?.length || f?.manoObra?.length || f?.herramientaEquipo?.length || f?.subcontratos?.length)
      let masterFicha = null
      const findMaster = (arr, pPath) => {
        arr.forEach((it, idx) => {
          if (masterFicha) return
          const curKey = [...pPath, idx].join('-')
          if (it.tipo === 'actividad' && curKey !== pathKey && it.descripcion?.trim() === newDesc && hasContent(it.ficha))
            masterFicha = it.ficha
          if (it.children?.length) findMaster(it.children, [...pPath, idx])
        })
      }
      findMaster(its, [])
      if (masterFicha) cur[path[path.length - 1]].ficha = JSON.parse(JSON.stringify(masterFicha))
    }
    setBudget({ ...budget, items: its })
  }
  const renumber = (items, parentId = '') => {
    items.forEach((item, idx) => {
      const pos = idx + 1
      if (!parentId) {
        item.id = String(pos)
      } else if (item.tipo === 'actividad') {
        item.id = `${parentId}.${String(pos).padStart(2, '0')}`
      } else {
        item.id = `${parentId}.${pos}`
      }
      if (item.children?.length) renumber(item.children, item.id)
    })
  }
  const add = (path, tipo) => {
    const its = JSON.parse(JSON.stringify(budget.items))
    if (!path.length) { its.push({ id: String(its.length + 1), tipo: 'capitulo', descripcion: 'Nuevo Capítulo', children: [] }); renumber(its); setBudget({ ...budget, items: its }); return }
    let cur = its; for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]].children
    const par = cur[path[path.length - 1]]; const ci = (par.children || []).length + 1
    const nid = tipo === 'actividad' ? par.id + '.' + String(ci).padStart(2, '0') : par.id + '.' + ci
    const ni = tipo === 'actividad'
      ? { id: nid, tipo: 'actividad', descripcion: 'Nueva actividad', unidad: 'und', cantidad: 1, ficha: { materiales: [], manoObra: [], herramientaEquipo: [], subcontratos: [] } }
      : { id: nid, tipo: 'subcapitulo', descripcion: 'Nuevo Sub-capítulo', children: [] }
    par.children = [...(par.children || []), ni]; renumber(its); setBudget({ ...budget, items: its })
  }
  const del = path => {
    if (!confirm('¿Eliminar este elemento?')) return
    const its = JSON.parse(JSON.stringify(budget.items))
    if (path.length === 1) its.splice(path[0], 1)
    else { let cur = its; for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]].children; cur.splice(path[path.length - 1], 1) }
    renumber(its)
    setBudget({ ...budget, items: its })
  }

  const rows = []
  const render = (its, path = [], d = 0) => {
    its.forEach((it, idx) => {
      const cp = [...path, idx]; const c = calcItem(it, budget.catalogos, params); const ind = d * 20
      if (it.tipo === 'capitulo') {
        rows.push(<tr key={it.id} className="chapter">
          <td className="id">{it.id}</td>
          <td className="desc" colSpan={4} style={{ paddingLeft: 14 + ind }}>
            <input value={it.descripcion} onChange={e => upd(cp, 'descripcion', e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', fontWeight: 700, color: 'var(--c-ink)', fontSize: 14, width: '100%' }} />
          </td>
          <td className="num" style={{ fontWeight: 700 }}>{money(c.subtotal)}</td>
          <td className="actions"><div className="row-actions">
            <button className="btn xs" onClick={() => add(cp, 'subcapitulo')}>+Sub</button>
            <button className="btn xs" onClick={() => add(cp, 'actividad')}>+Act</button>
            <button className="btn xs danger icon" onClick={() => del(cp)}><Trash2 size={11} /></button>
          </div></td>
        </tr>)
        if (it.children?.length) render(it.children, cp, d + 1)
        rows.push(<tr key={it.id + '-tot'} className="subtotal">
          <td></td><td colSpan={4} style={{ paddingLeft: 14 + ind }}>SUBTOTAL Cap. {it.id}</td>
          <td className="num">{money(c.subtotal)}</td><td></td>
        </tr>)
      } else if (it.tipo === 'subcapitulo') {
        rows.push(<tr key={it.id} className="subchapter">
          <td className="id">{it.id}</td>
          <td className="desc" colSpan={4} style={{ paddingLeft: 14 + ind }}>
            <input value={it.descripcion} onChange={e => upd(cp, 'descripcion', e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', fontWeight: 600, width: '100%' }} />
          </td>
          <td className="num" style={{ fontWeight: 600 }}>{money(c.subtotal)}</td>
          <td className="actions"><div className="row-actions">
            <button className="btn xs" onClick={() => add(cp, 'actividad')}>+Act</button>
            <button className="btn xs danger icon" onClick={() => del(cp)}><Trash2 size={11} /></button>
          </div></td>
        </tr>)
        if (it.children?.length) render(it.children, cp, d + 1)
      } else {
        rows.push(<tr key={it.id} className="activity">
          <td className="id">{it.id}</td>
          <td className="desc" style={{ paddingLeft: 14 + ind }}>
            <input value={it.descripcion} onChange={e => upd(cp, 'descripcion', e.target.value)} className="cell-input" style={{ width: '100%' }} />
          </td>
          <td><span className="unit-chip">{it.unidad}</span></td>
          <td className="num"><input type="number" step="any" value={it.cantidad} onChange={e => upd(cp, 'cantidad', parseFloat(e.target.value) || 0)} className="cell-input num" /></td>
          <td className="num" style={{ cursor: 'pointer' }} onDoubleClick={() => onOpenFicha(cp)} title="Doble clic para abrir ficha">
            <span style={{ fontWeight: 600 }}>{money(c.precioUnitario)}</span>
            <span style={{ marginLeft: 4, color: 'var(--c-accent)', fontSize: 10 }}>✦</span>
          </td>
          <td className="num" style={{ fontWeight: 600 }}>{money(c.subtotal)}</td>
          <td className="actions"><div className="row-actions">
            <button className="btn xs ghost icon" onClick={() => onOpenFicha(cp)}><Edit2 size={11} /></button>
            <button className="btn xs danger icon" onClick={() => del(cp)}><Trash2 size={11} /></button>
          </div></td>
        </tr>)
      }
    })
  }
  render(budget.items, [], 0)
  const total = round2(budget.items.reduce((s, it) => s + calcItem(it, budget.catalogos, params).subtotal, 0))

  return (
    <Fragment>
      <div style={{ overflowX: 'auto' }}>
        <table className="bt" style={{ minWidth: 860 }}>
          <thead><tr>
            <th style={{ width: 80 }}>ID</th><th>Descripción</th>
            <th style={{ width: 80 }}>Unidad</th><th className="num" style={{ width: 100 }}>Cantidad</th>
            <th className="num" style={{ width: 130 }}>P. Unitario</th><th className="num" style={{ width: 140 }}>Subtotal</th>
            <th style={{ width: 120 }}></th>
          </tr></thead>
          <tbody>{rows}</tbody>
          <tfoot><tr>
            <td className="lbl" colSpan={5}>Total General</td>
            <td className="num total-cell">{money(total)}</td>
            <td></td>
          </tr></tfoot>
        </table>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--c-line)', background: 'var(--c-bg-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn sm" onClick={() => add([], 'capitulo')}><Plus size={13} strokeWidth={2.5} /> Agregar Capítulo</button>
        <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>✦ Doble clic en P. UNITARIO para abrir ficha</span>
      </div>
    </Fragment>
  )
}

// ============ PARAMS GLOBALES ============
function ParametrosGlobales({ budget, setBudget }) {
  const [d, setD] = useState({ pctIndirectos: budget.pctIndirectos, pctImprevistos: budget.pctImprevistos, pctUtilidad: budget.pctUtilidad, pctImpuesto: budget.pctImpuesto })
  useEffect(() => { setD({ pctIndirectos: budget.pctIndirectos, pctImprevistos: budget.pctImprevistos, pctUtilidad: budget.pctUtilidad, pctImpuesto: budget.pctImpuesto }) }, [budget.id])
  const dirty = d.pctIndirectos !== budget.pctIndirectos || d.pctImprevistos !== budget.pctImprevistos || d.pctUtilidad !== budget.pctUtilidad || d.pctImpuesto !== budget.pctImpuesto
  return (
    <div className="params" style={dirty ? { borderColor: 'var(--c-accent)', background: 'var(--c-accent-soft)' } : {}}>
      <span className="params-label">Parámetros globales</span>
      {[['Indirectos', 'pctIndirectos'], ['Imprevistos', 'pctImprevistos'], ['Utilidad', 'pctUtilidad'], ['Impuesto', 'pctImpuesto']].map(([lbl, k]) => (
        <div key={k} className="param-pill">
          <span className="param-pill-lbl">{lbl}</span>
          <input type="number" step="any" value={d[k]} onChange={e => setD({ ...d, [k]: parseFloat(e.target.value) || 0 })} />
          <span className="suf">%</span>
        </div>
      ))}
      <div style={{ flex: 1 }}></div>
      {dirty && <>
        <button className="btn sm ghost" onClick={() => setD({ pctIndirectos: budget.pctIndirectos, pctImprevistos: budget.pctImprevistos, pctUtilidad: budget.pctUtilidad, pctImpuesto: budget.pctImpuesto })}>Cancelar</button>
        <button className="btn sm brand" onClick={() => setBudget({ ...budget, ...d })}><Check size={12} /> Aplicar</button>
      </>}
    </div>
  )
}

// ============ CATALOGO VIEW ============
function CatalogoView({ budget, setBudget, categoria }) {
  const money = makeMoneyFmt(budget.moneda)
  const list = budget.catalogos[categoria.key] || []
  const [q, setQ] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ codigo: '', descripcion: '', unidad: 'und', costoBase: 0, proveedor: '', notas: '' })
  const [editId, setEditId] = useState(null)
  const filtered = list.filter(i => !q || normalize(i.descripcion).includes(normalize(q)) || normalize(i.codigo).includes(normalize(q)))
  const usagesOf = id => { let c = 0; const walk = its => { for (const it of its) { if (it.tipo === 'actividad') { for (const x of it.ficha[categoria.key] || []) if (x.insumoId === id) c++ } else if (it.children) walk(it.children) } }; walk(budget.items); return c }
  const cantTotalOf = id => { let t = 0; const walk = its => { for (const it of its) { if (it.tipo === 'actividad') { for (const x of it.ficha[categoria.key] || []) if (x.insumoId === id) t += (+it.cantidad || 0) * (+x.rendimiento || 0) } else if (it.children) walk(it.children) } }; walk(budget.items); return round2(t) }
  const submit = e => {
    e.preventDefault(); const desc = form.descripcion.trim(); if (!desc) return alert('Descripción obligatoria.')
    const n = normalize(desc); const dup = list.find(i => normalize(i.descripcion) === n && i.unidad === form.unidad && i.id !== editId)
    if (dup) return alert(`Ya existe: "${dup.descripcion}" (${dup.unidad}). Dos insumos pueden tener el mismo nombre si tienen diferente unidad.`)
    const nc = { ...budget.catalogos }
    if (editId) nc[categoria.key] = list.map(i => i.id === editId ? { ...i, ...form, descripcion: desc, costoBase: +form.costoBase || 0 } : i)
    else nc[categoria.key] = [...list, { id: uid(), ...form, descripcion: desc, costoBase: +form.costoBase || 0 }]
    setBudget({ ...budget, catalogos: nc }); setShowForm(false); setEditId(null); setForm({ codigo: '', descripcion: '', unidad: 'und', costoBase: 0, proveedor: '', notas: '' })
  }
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-header">
        <div className="card-title">{categoria.icon} Lista de {categoria.label}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="topbar-search" style={{ width: 200 }}>
            <Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" />
          </div>
          <button className="btn brand sm" onClick={() => { setShowForm(true); setEditId(null); setForm({ codigo: '', descripcion: '', unidad: 'und', costoBase: 0, proveedor: '', notas: '' }) }}>
            <Plus size={13} /> Nuevo
          </button>
        </div>
      </div>
      {showForm && (
        <form onSubmit={submit} style={{ background: 'var(--c-accent-soft)', borderBottom: '1px solid var(--c-line)', padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          <div className="field"><label className="field-label">Código</label><input className="input sm" value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label className="field-label">Descripción *</label><input required className="input sm" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} /></div>
          <div className="field"><label className="field-label">Unidad</label><input className="input sm" value={form.unidad} onChange={e => setForm({ ...form, unidad: e.target.value })} /></div>
          <div className="field"><label className="field-label">Precio Base</label><input type="number" step="any" className="input sm" style={{ textAlign: 'right' }} value={form.costoBase} onChange={e => setForm({ ...form, costoBase: e.target.value })} /></div>
          <div className="field"><label className="field-label">Proveedor</label><input className="input sm" value={form.proveedor} onChange={e => setForm({ ...form, proveedor: e.target.value })} /></div>
          <div style={{ gridColumn: 'span 6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn sm ghost" onClick={() => { setShowForm(false); setEditId(null) }}>Cancelar</button>
            <button type="submit" className="btn sm primary">{editId ? 'Actualizar' : 'Agregar'}</button>
          </div>
        </form>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="bt">
          <thead><tr>
            <th style={{ width: 90 }}>Código</th><th>Descripción</th>
            <th style={{ width: 80 }}>Unidad</th><th className="num" style={{ width: 110 }}>Precio Base</th>
            <th style={{ width: 120 }}>Proveedor</th><th className="num" style={{ width: 100 }}>Cant. Total</th><th style={{ width: 110 }}></th>
          </tr></thead>
          <tbody>
            {!filtered.length && <tr><td colSpan={7} className="empty">{!list.length ? `Sin ${categoria.label.toLowerCase()} aún.` : 'Sin coincidencias.'}</td></tr>}
            {filtered.map(i => {
              const u = usagesOf(i.id)
              const cantTotal = cantTotalOf(i.id)
              return (
                <tr key={i.id}>
                  <td className="id">{i.codigo}</td>
                  <td style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {(!i.costoBase || i.costoBase === 0) && <AlertTriangle size={13} style={{ color: 'var(--c-danger)', flexShrink: 0 }} title="Sin costo asignado" />}
                    {i.descripcion}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--c-text-2)' }}>{i.unidad}</td>
                  <td className="num" style={{ fontWeight: 600, color: (!i.costoBase || i.costoBase === 0) ? 'var(--c-danger)' : undefined }}>{money(i.costoBase)}</td>
                  <td style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{i.proveedor || '—'}</td>
                  <td className="num" title={u > 0 ? `Usado en ${u} ficha(s)` : undefined}>
                    {u > 0
                      ? <><span style={{ fontWeight: 600 }}>{fmt(cantTotal)}</span><span style={{ marginLeft: 4, color: 'var(--c-text-2)', fontWeight: 400 }}>{i.unidad}</span></>
                      : <span style={{ color: 'var(--c-text-3)' }}>—</span>
                    }
                  </td>
                  <td className="actions">
                    <button className="btn xs ghost" onClick={() => { setForm({ codigo: i.codigo || '', descripcion: i.descripcion, unidad: i.unidad, costoBase: i.costoBase, proveedor: i.proveedor || '', notas: i.notas || '' }); setEditId(i.id); setShowForm(true) }}>
                      <Edit2 size={11} /> Editar
                    </button>
                    <button className="btn xs danger icon" style={{ marginLeft: 4 }} onClick={() => { if (u > 0) return alert(`Usado en ${u} ficha(s). No se puede eliminar.`); if (!confirm(`¿Eliminar "${i.descripcion}"?`)) return; setBudget({ ...budget, catalogos: { ...budget.catalogos, [categoria.key]: list.filter(x => x.id !== i.id) } }) }}>
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============ PLANTILLAS PAGE ============
// ============ REPORTES PAGE ============
function ReportesPage({ proyectos, budget, params, userEmpresa }) {
  const [tab, setTab] = useState('proyecto')
  const currency = budget?.moneda || 'USD'

  // KPIs portafolio
  const total      = proyectos.length
  const activos    = proyectos.filter(p => p.estado === 'Activo').length
  const revision   = proyectos.filter(p => p.estado === 'En revisión').length
  const aprobados  = proyectos.filter(p => p.estado === 'Aprobado').length
  const cartera    = proyectos.reduce((s, p) => s + (p._total || 0), 0)

  const ReporteCard = ({ icon: Icon, title, desc, onPdf, onExcel, disabled }) => (
    <div className="card" style={{ opacity: disabled ? 0.5 : 1, display: 'flex', flexDirection: 'column' }}>
      <div className="card-pad" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--c-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={20} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c-text)', marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-3)', lineHeight: 1.5 }}>{desc}</div>
        </div>
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--c-line)', display: 'flex', gap: 8 }}>
        {onPdf   && <button className="btn sm primary" onClick={onPdf}   disabled={disabled}><Download size={13}/> PDF</button>}
        {onExcel && <button className="btn sm ghost"   onClick={onExcel} disabled={disabled}><FileSpreadsheet size={13}/> Excel</button>}
      </div>
    </div>
  )

  return (
    <Fragment>
      <div className="page-head">
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)' }}>Reportes</div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>Genera y descarga reportes de tus proyectos</div>
        </div>
      </div>

      <div className="tabs" style={{ borderBottom: '1px solid var(--c-line)', marginBottom: 0 }}>
        {[
          { k: 'proyecto',   label: 'Por Proyecto',  Icon: FileText },
          { k: 'portafolio', label: 'Portafolio',    Icon: BarChart2 },
        ].map(({ k, label, Icon }) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="page-body">

        {tab === 'proyecto' && (
          <div>
            {!budget && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--c-text-3)' }}>
                <FileText size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin proyecto activo</div>
                <div style={{ fontSize: 13 }}>Abre un proyecto desde la sección Proyectos para generar reportes individuales.</div>
              </div>
            )}
            {budget && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                    Proyecto activo: <span style={{ color: 'var(--c-accent)' }}>{budget.nombreProyecto}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                    <ReporteCard
                      icon={FileText}
                      title="Presupuesto General"
                      desc="Desglose completo por capítulos, subcapítulos y actividades con precios unitarios y subtotales."
                      onPdf={()   => exportPDFPresupuesto(budget, params)}
                      onExcel={() => exportExcelPresupuesto(budget, params)}
                    />
                    <ReporteCard
                      icon={Briefcase}
                      title="Resumen Ejecutivo"
                      desc="Portada profesional de una página con metadatos, logos y desglose financiero completo."
                      onPdf={() => exportPDFResumenEjecutivo(budget, params)}
                    />
                    <ReporteCard
                      icon={Layers}
                      title="Todos los APU / Fichas"
                      desc="Exporta la ficha de costo unitario de cada actividad del presupuesto."
                      onPdf={() => exportPDFGeneral(budget, params, { nombre: userEmpresa, logo: budget?.logoOfertante, headerBg: budget?.apuHeaderBg, headerText: budget?.apuHeaderText })}
                      onExcel={() => exportExcelGeneral(budget, params)}
                    />
                    <ReporteCard
                      icon={Package}
                      title="Catálogo de Materiales"
                      desc="Lista de materiales con código, unidad, cantidad total proyectada y costo."
                      onPdf={()   => exportPDFCatalogo(budget, 'materiales')}
                      onExcel={() => exportExcelCatalogo(budget, 'materiales')}
                      disabled={(budget.catalogos?.materiales || []).length === 0}
                    />
                    <ReporteCard
                      icon={HardHat}
                      title="Catálogo de Mano de Obra"
                      desc="Lista de operarios y cuadrillas con tarifa, cantidad total y costo proyectado."
                      onPdf={()   => exportPDFCatalogo(budget, 'manoObra')}
                      onExcel={() => exportExcelCatalogo(budget, 'manoObra')}
                      disabled={(budget.catalogos?.manoObra || []).length === 0}
                    />
                    <ReporteCard
                      icon={Wrench}
                      title="Catálogo de Herramientas/Equipo"
                      desc="Listado de herramienta menor, equipo y maquinaria con cantidad y costo total."
                      onPdf={()   => exportPDFCatalogo(budget, 'herramientaEquipo')}
                      onExcel={() => exportExcelCatalogo(budget, 'herramientaEquipo')}
                      disabled={(budget.catalogos?.herramientaEquipo || []).length === 0}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'portafolio' && (
          <div>
            {/* KPIs portafolio */}
            <div className="kpi-row" style={{ marginBottom: 20 }}>
              <div className="kpi highlight">
                <div className="kpi-label"><DollarSign size={12} className="ico" />Cartera Total</div>
                <div className="kpi-val">{currency === 'USD' ? '$' : 'L'} {cartera.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="kpi-foot"><span>Suma de {total} proyectos</span></div>
              </div>
              <div className="kpi">
                <div className="kpi-label"><Activity size={12} className="ico" />Activos</div>
                <div className="kpi-val">{activos}</div>
                <div className="kpi-foot"><span>en ejecución</span></div>
              </div>
              <div className="kpi">
                <div className="kpi-label"><Clock size={12} className="ico" />En Revisión</div>
                <div className="kpi-val">{revision}</div>
                <div className="kpi-foot"><span>pendientes aprobación</span></div>
              </div>
              <div className="kpi">
                <div className="kpi-label"><Check size={12} className="ico" />Aprobados</div>
                <div className="kpi-val">{aprobados}</div>
                <div className="kpi-foot"><span>de {total} totales</span></div>
              </div>
            </div>

            {/* Acciones portafolio */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button className="btn primary" onClick={() => exportPDFPortafolio(proyectos, userEmpresa)}>
                <Download size={14}/> Descargar Portafolio PDF
              </button>
              <button className="btn ghost" onClick={() => exportExcelPortafolio(proyectos, userEmpresa)}>
                <FileSpreadsheet size={14}/> Descargar Portafolio Excel
              </button>
            </div>

            {/* Tabla de proyectos */}
            <div className="card">
              <table className="bt">
                <thead>
                  <tr>
                    <th>Proyecto</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Rev.</th>
                    <th>Fecha</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {proyectos.map(p => (
                    <tr key={p.id} className="activity">
                      <td style={{ fontWeight: 600 }}>{p.nombreProyecto || '—'}</td>
                      <td style={{ color: 'var(--c-text-3)' }}>{p.cliente || '—'}</td>
                      <td><span className={`badge ${p.estado === 'Activo' ? 'success' : p.estado === 'En revisión' ? 'warn' : p.estado === 'Aprobado' ? 'primary' : ''}`}>{p.estado}</span></td>
                      <td style={{ textAlign: 'center' }}>Rev {p.revision || 1}</td>
                      <td style={{ color: 'var(--c-text-3)' }}>{p.fecha || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {(p.moneda === 'HNL' ? 'L' : '$')} {(p._total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>CARTERA TOTAL</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                      $ {cartera.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </Fragment>
  )
}

function PlantillasPage({ budget, setBudget }) {
  const fileRef = useRef(null)
  const tipos = [
    { k: 'presupuesto',       label: 'Presupuesto',          icon: '📄', desc: 'Estructura jerárquica: capítulos, subcapítulos y actividades con unidad y cantidad.' },
    { k: 'materiales',        label: 'Materiales',           icon: '🧱', desc: 'Catálogo de materiales con código, unidad y precio base.' },
    { k: 'manoObra',          label: 'Mano de Obra',         icon: '👷', desc: 'Catálogo de operarios y cuadrillas con tarifa por unidad.' },
    { k: 'herramientaEquipo', label: 'Herramientas/Equipo',  icon: '🔧', desc: 'Herramienta menor, equipo y maquinaria con costo por unidad.' },
    { k: 'subcontratos',      label: 'Subcontratos',         icon: '🏢', desc: 'Servicios contratados a terceros con precio global o por unidad.' },
  ]
  return (
    <Fragment>
      <div className="page-head">
        <div className="page-head-title">
          <h1><BookOpen size={22} /> Biblioteca de Plantillas</h1>
        </div>
      </div>
      <div className="page-body">
        <div className="proj-grid">
          {tipos.map(t => (
            <div key={t.k} className="card card-pad" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--c-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 12 }}>{t.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 13, color: 'var(--c-text-3)', flex: 1, marginBottom: 16 }}>{t.desc}</div>
              <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => exportPlantilla(t.k)}>
                <Download size={14} /> Descargar plantilla
              </button>
            </div>
          ))}

          {/* ── Tarjeta especial: Fichas APU ── */}
          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--c-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Fichas APU</div>
            <div style={{ fontSize: 13, color: 'var(--c-text-3)', flex: 1, marginBottom: 16 }}>
              Importa una o varias fichas de costo unitario (APU) al proyecto activo desde una hoja de cálculo.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => exportPlantillaFicha()}>
                <Download size={14} /> Descargar plantilla
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                onChange={async e => { const f = e.target.files?.[0]; if (f) { await importExcelFichas(f, budget, setBudget); e.target.value = '' } }} />
              <button className="btn ghost" style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { if (!budget) return alert('Abre un proyecto primero para importar fichas.'); fileRef.current?.click() }}
                title={budget ? `Importar al proyecto: ${budget.nombreProyecto}` : 'Sin proyecto activo'}>
                <Upload size={14} /> Importar fichas{budget ? ` → ${budget.nombreProyecto}` : ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  )
}

// ============ PLANES PAGE ============
function PlanesPage() {
  const [billing, setBilling] = useState('m')
  const planes = [
    { name: 'Básico',      m: 9.99,  y: 99,  features: ['5 proyectos', 'Fichas ilimitadas', 'Exportación PDF', 'Soporte email'] },
    { name: 'Profesional', m: 24.99, y: 249, pop: true, features: ['Proyectos ilimitados', 'PDF + Excel', 'Plantillas', 'Logo personalizado', 'Soporte prioritario'] },
    { name: 'Empresarial', m: 49.99, y: 499, features: ['Todo Profesional', 'Multi-usuario (5)', 'API', 'Onboarding', 'SLA 99.9%'] },
  ]
  return (
    <Fragment>
      <div className="page-head">
        <div className="page-head-title"><h1><Crown size={22} /> Planes y Facturación</h1></div>
        <div className="page-head-actions">
          <div className="seg">
            <button className={billing === 'm' ? 'on' : ''} onClick={() => setBilling('m')}>Mensual</button>
            <button className={billing === 'y' ? 'on' : ''} onClick={() => setBilling('y')}>Anual (-20%)</button>
          </div>
        </div>
      </div>
      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {planes.map(p => (
            <div key={p.name} className="card" style={{ border: p.pop ? '2px solid var(--c-accent)' : undefined }}>
              <div className="card-pad-lg">
                {p.pop && <div className="badge brand" style={{ marginBottom: 10 }}><Crown size={11} /> Más popular</div>}
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 700, marginBottom: 4 }}>
                  ${billing === 'm' ? p.m : p.y}<span style={{ fontSize: 13, color: 'var(--c-text-3)', fontWeight: 400 }}>/{billing === 'm' ? 'mes' : 'año'}</span>
                </div>
                <ul style={{ fontSize: 13, color: 'var(--c-text-2)', paddingLeft: 18, margin: '14px 0 18px', lineHeight: 1.8 }}>
                  {p.features.map(f => <li key={f}>{f}</li>)}
                </ul>
                <button className={`btn ${p.pop ? 'brand' : 'primary'}`} style={{ width: '100%', justifyContent: 'center' }}>Contratar</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Fragment>
  )
}

// ============ MAIN APP ============
export default function MainApp() {
  const { user, profile, signOut } = useAuth()
  const nav = useNavigate()
  const [proyectos, setProyectos] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [activeId, setActiveId] = useState(null)
  const [page, setPage] = useState('inicio')
  const [tabProject, setTabProject] = useState('presupuesto')
  const [fichaPath, setFichaPath] = useState(null)
  const [search, setSearch] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [showVersion, setShowVersion] = useState(false)
  const [showRango, setShowRango] = useState(false)
  const [showUserSettings, setShowUserSettings] = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)
  const [profileOverride, setProfileOverride] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)
  const importCtx = useRef(null)
  const savingRef = useRef(false)

  const effectiveProfile = profileOverride ? { ...profile, ...profileOverride } : profile
  const userName    = effectiveProfile?.nombre || effectiveProfile?.full_name || user?.user_metadata?.full_name || 'Usuario'
  const userEmpresa = effectiveProfile?.empresa || effectiveProfile?.company_name || ''

  // ── Notificaciones ──────────────────────────────────────────────────
  // Regla 1: insumo (no HM) con costoBase ≤ 0 asignado a una ficha
  // Regla 2: cualquier insumo con rendimiento ≤ 0 en una ficha → indicar en qué ficha
  // Regla 3: Herramienta Menor con rendimiento ≤ 0 → indicar en qué ficha
  // Regla 4: errores que afectan cálculos (insumo huérfano, actividad con ficha y cantidad=0)
  const notificaciones = useMemo(() => {
    const alerts = []
    const CATS = ['materiales','manoObra','herramientaEquipo','subcontratos']

    proyectos.forEach(p => {
      const alertedCostoBase = new Set() // evitar duplicar la misma alerta de costoBase por insumo

      const walk = items => {
        items.forEach(it => {
          if (it.tipo === 'actividad') {
            const f = it.ficha || {}
            const fichaVacia = !(f.materiales?.length || f.manoObra?.length || f.herramientaEquipo?.length || f.subcontratos?.length)

            // Actividad sin ficha ni precio manual pero con cantidad > 0
            if (fichaVacia && !it.precioManual && (+it.cantidad || 0) > 0) {
              alerts.push({ id: `act-${p.id}-${it.id}`, tipo: 'actividad-sin-costo', msg: it.descripcion || it.id, sub: p.nombreProyecto })
            }

            // Regla 4: actividad con ficha completa pero cantidad = 0 → subtotal siempre 0
            if (!fichaVacia && (+it.cantidad || 0) === 0) {
              alerts.push({ id: `qty0-${p.id}-${it.id}`, tipo: 'error-calculo', msg: `Cantidad = 0 con ficha completa: "${it.descripcion || it.id}"`, sub: p.nombreProyecto })
            }

            if (!fichaVacia) {
              CATS.forEach(cat => {
                ;(f[cat] || []).forEach((c, ci) => {
                  const ins = findInsumo(p.catalogos, cat, c.insumoId)
                  const isHM = cat === 'herramientaEquipo' && normalize(ins?.descripcion || '') === 'herramienta menor'

                  // Regla 4: insumo referenciado en ficha pero eliminado del catálogo
                  if (c.insumoId && !ins) {
                    alerts.push({ id: `orphan-${p.id}-${it.id}-${cat}-${ci}`, tipo: 'error-calculo', msg: `Insumo eliminado del catálogo en ficha: "${it.descripcion || it.id}"`, sub: p.nombreProyecto })
                    return
                  }

                  // Reglas 2 y 3: rendimiento ≤ 0 en ficha (aplica a todos incluido HM)
                  if ((+c.rendimiento || 0) <= 0) {
                    const label = isHM ? 'Herramienta Menor' : (ins?.descripcion || 'Insumo')
                    alerts.push({ id: `rend-${p.id}-${it.id}-${cat}-${ci}`, tipo: 'insumo-sin-precio', msg: `"${label}" con rendimiento = 0 en ficha: "${it.descripcion || it.id}"`, sub: p.nombreProyecto })
                  }

                  // Regla 1: costoBase ≤ 0, excluye Herramienta Menor (su precio es % de MO)
                  if (!isHM && ins && (+ins.costoBase || 0) <= 0 && !alertedCostoBase.has(ins.id)) {
                    alertedCostoBase.add(ins.id)
                    alerts.push({ id: `base-${p.id}-${ins.id}`, tipo: 'insumo-sin-precio', msg: `"${ins.descripcion}" sin precio en catálogo (ficha: "${it.descripcion || it.id}")`, sub: p.nombreProyecto })
                  }
                })
              })
            }
          } else if (it.children) walk(it.children)
        })
      }
      walk(p.items || [])
    })
    return alerts
  }, [proyectos])

  // Cargar presupuestos
  useEffect(() => {
    if (!user) return
    supabase.from('presupuestos').select('*').eq('user_id', user.id).order('updated_at', { ascending: false })
      .then(({ data }) => { setProyectos((data || []).map(mapDb)); setLoadingData(false) })
  }, [user])

  const budget    = useMemo(() => proyectos.find(p => p.id === activeId) || null, [proyectos, activeId])
  const setBudget = b => setProyectos(ps => ps.map(p => p.id === b.id ? b : p))

  // Sincronizar fichas de actividades con el mismo nombre al abrir un proyecto
  useEffect(() => {
    if (!activeId) return
    setProyectos(ps => ps.map(p => {
      if (p.id !== activeId) return p
      const synced = syncFichasByName(p.items)
      return synced !== p.items ? { ...p, items: synced } : p
    }))
  }, [activeId])

  // Auto-guardado con debounce
  useEffect(() => {
    if (!budget || loadingData) return
    const t = setTimeout(async () => {
      if (savingRef.current) return
      savingRef.current = true; setSaving(true)
      const { error } = await supabase.from('presupuestos').update(toDb(budget)).eq('id', budget.id)
      if (error) console.error('[auto-save] Error al guardar:', error.message, error)
      setSaving(false); savingRef.current = false
    }, 1400)
    return () => clearTimeout(t)
  }, [budget])

  const params = useMemo(() => budget
    ? { pctIndirectos: budget.pctIndirectos, pctImprevistos: budget.pctImprevistos, pctUtilidad: budget.pctUtilidad, pctImpuesto: budget.pctImpuesto }
    : { pctIndirectos: 10, pctImprevistos: 1, pctUtilidad: 8, pctImpuesto: 15 }
  , [budget])

  const fichaActividad = useMemo(() => {
    if (!fichaPath || !budget) return null
    let cur = budget.items, it = null
    for (let i = 0; i < fichaPath.length; i++) { it = cur[fichaPath[i]]; if (i < fichaPath.length - 1) cur = it.children }
    return it
  }, [fichaPath, budget])

  const updFicha = na => {
    if (!fichaPath) return
    const its = JSON.parse(JSON.stringify(budget.items))
    // Update the specific activity at fichaPath
    let cur = its
    for (let i = 0; i < fichaPath.length - 1; i++) cur = cur[fichaPath[i]].children
    cur[fichaPath[fichaPath.length - 1]] = na
    // Propagate ficha to all activities with exactly the same descripcion
    const desc = na.descripcion?.trim()
    if (desc) {
      const propagate = items => {
        items.forEach(it => {
          if (it.tipo === 'actividad' && it.descripcion?.trim() === desc) {
            it.ficha = JSON.parse(JSON.stringify(na.ficha))
          }
          if (it.children?.length) propagate(it.children)
        })
      }
      propagate(its)
    }
    setBudget({ ...budget, items: its })
  }

  const triggerImport = kind => { importCtx.current = kind; fileRef.current.click() }
  const handleImport = e => {
    const f = e.target.files?.[0]; if (!f || !budget) return
    const k = importCtx.current
    if (k === 'presupuesto') importExcelPresupuesto(f, budget, setBudget)
    else if (k?.startsWith('cat-')) importExcelCatalogo(f, budget, setBudget, k.slice(4))
    e.target.value = ''
  }

  const openProject = p => { setActiveId(p.id); setPage('proyecto'); setTabProject('presupuesto') }

  const deleteProject = async (id, nombre) => {
    if (!confirm(`¿Eliminar el proyecto "${nombre}"?\n\nEsta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('presupuestos').delete().eq('id', id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    setProyectos(ps => ps.filter(p => p.id !== id))
    if (activeId === id) { setActiveId(null); setPage('proyectos') }
  }

  const addProject = async () => {
    const { data } = await supabase.from('presupuestos').insert({
      user_id: user.id, nombre_proyecto: 'Nuevo Proyecto', cotizante: userEmpresa,
      cliente: '', lugar: '', pct_indirectos: 10, pct_imprevistos: 1, pct_utilidad: 8, pct_impuesto: 15,
      catalogos_json: { ...EMPTY_CATALOGOS }, items_json: [], estado: 'borrador',
    }).select().single()
    if (data) { const nb = mapDb(data); setProyectos(ps => [nb, ...ps]); setActiveId(nb.id); setPage('proyecto'); setTabProject('presupuesto') }
  }

  const searchResults = useMemo(() => {
    if (!search.trim() || search.length < 2) return null
    const q = normalize(search)
    const proys = proyectos.filter(p => normalize(p.nombreProyecto).includes(q) || normalize(p.cliente).includes(q))
    const acts = [], insumos = []
    if (budget) {
      const walk = its => its.forEach(it => { if (it.tipo === 'actividad' && (normalize(it.descripcion).includes(q) || it.id.includes(q))) acts.push(it); else if (it.children) walk(it.children) })
      walk(budget.items)
      CATEGORIAS.forEach(cat => (budget.catalogos[cat.key] || []).forEach(i => { if (normalize(i.descripcion).includes(q) || normalize(i.codigo).includes(q)) insumos.push({ ...i, catLabel: cat.label, catKey: cat.key }) }))
    }
    return { proys, acts, insumos }
  }, [search, proyectos, budget])

  const doLogout = () => { signOut(); nav('/login') }

  // KPI totals for budget view
  const budgetKPIs = useMemo(() => {
    if (!budget) return null
    const direct = budget.items.reduce((s, it) => s + calcItem(it, budget.catalogos, params).subtotal, 0)
    const indirectos  = direct * (params.pctIndirectos / 100)
    const imprevistos = (direct + indirectos) * (params.pctImprevistos / 100)
    const subtotal    = direct + indirectos + imprevistos
    const utilidad    = subtotal * (params.pctUtilidad / 100)
    const subtotalConU = subtotal + utilidad
    const impuesto    = subtotalConU * (params.pctImpuesto / 100)
    const total       = subtotalConU + impuesto
    return { direct, indirectos, imprevistos, utilidad, impuesto, total }
  }, [budget, params])

  // Formateador de moneda atado a la moneda del proyecto activo
  const moneyB = makeMoneyFmt(budget?.moneda)

  // ---- LOADING ----
  if (loadingData) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--c-side)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 44, height: 44, border: '3px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--c-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }}></div>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: '#fff' }}>ARROW BUDGET</div>
        <div style={{ fontSize: 12, color: 'var(--c-side-text-2)', marginTop: 6 }}>Cargando…</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )

  // Breadcrumbs
  let crumbs = []
  if (page === 'proyectos')             crumbs = ['Proyectos']
  else if (page === 'proyecto' && budget) crumbs = ['Proyectos', budget.nombreProyecto]
  else if (page === 'reportes')           crumbs = ['Reportes']
  else if (page === 'plantillas')        crumbs = ['Biblioteca']
  else if (page === 'planes')            crumbs = ['Planes']

  const tabToCat = { 'cat-mat': 'materiales', 'cat-mo': 'manoObra', 'cat-he': 'herramientaEquipo', 'cat-sub': 'subcontratos' }
  const tabsP = budget ? [
    { k: 'presupuesto', label: 'Presupuesto',         icon: <FileText size={14} />, badge: calcKPIs(budget).nActividades },
    { k: 'cat-mat',     label: 'Materiales',           icon: <Package size={14} />,     badge: (budget.catalogos.materiales || []).length },
    { k: 'cat-mo',      label: 'Mano de Obra',         icon: <HardHat size={14} />,     badge: (budget.catalogos.manoObra || []).length },
    { k: 'cat-he',      label: 'Herramientas/Equipo',  icon: <Wrench size={14} />,      badge: (budget.catalogos.herramientaEquipo || []).length },
    { k: 'cat-sub',     label: 'Subcontratos',         icon: <Users size={14} />,       badge: (budget.catalogos.subcontratos || []).length },
    { k: 'indirectos',  label: 'Indirectos',           icon: <TrendingUp size={14} />,  badge: (budget.indirectos || []).length },
  ] : []

  return (
    <div className="app">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .proj-card:hover button[title="Eliminar proyecto"]{opacity:1!important}`}</style>

      <Sidebar
        page={page} setPage={setPage}
        projectActivo={page === 'proyecto' ? budget : null}
        setTabProject={setTabProject} tabProject={tabProject}
        user={{ name: userName, empresa: userEmpresa }}
        onLogout={doLogout}
        onSettings={() => setShowUserSettings(true)}
        projectsCount={proyectos.length}
      />

      <div className="main">
        <Topbar
          crumbs={crumbs}
          search={search} setSearch={setSearch}
          onHome={() => setPage('inicio')}
          searchResults={searchResults}
          onResultPick={(kind, item) => {
            setSearch('')
            if (kind === 'proy') openProject(item)
            else if (kind === 'act') { const path = findPathById(budget.items, item.id); if (path) { setPage('proyecto'); setTabProject('presupuesto'); setFichaPath(path) } }
            else if (kind === 'ins') { setPage('proyecto'); const tab = Object.keys(tabToCat).find(k => tabToCat[k] === item.catKey); if (tab) setTabProject(tab) }
          }}
          saving={saving}
          onLogout={doLogout}
          onUserSettings={() => setShowUserSettings(true)}
          notifCount={notificaciones.length}
          notifs={notificaciones}
          showNotifs={showNotifs}
          setShowNotifs={setShowNotifs}
        />

        {/* ── PAGES ── */}
        {page === 'inicio'     && <InicioPage    proyectos={proyectos} openProject={openProject} addProject={addProject} setPage={setPage} userName={userName} />}
        {page === 'proyectos'  && <ProyectosPage proyectos={proyectos} openProject={openProject} addProject={addProject} deleteProject={deleteProject} />}
        {page === 'reportes'   && <ReportesPage  proyectos={proyectos} budget={budget} params={params} userEmpresa={userEmpresa} />}
        {page === 'plantillas' && <PlantillasPage budget={budget} setBudget={setBudget} />}
        {page === 'planes'     && <PlanesPage />}

        {/* ── PROYECTO VIEW ── */}
        {page === 'proyecto' && budget && (
          <Fragment>
            {/* Page header */}
            <div className="page-head">
              <div className="page-head-title">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--c-text-3)', fontWeight: 500 }}>
                  <span className="badge brand">{budget.tipo}</span>
                  <EstadoMenu budget={budget} setBudget={setBudget} />
                  <span className="badge">Rev {budget.revision}</span>
                  <span className="badge" style={{ fontFamily: 'var(--font-mono)' }}>{budget.moneda}</span>
                </div>
                <h1>
                  {budget.nombreProyecto}
                  <button className="icon-btn" style={{ width: 26, height: 26, marginLeft: 4 }} title="Configuración" onClick={() => setShowConfig(true)}><Edit2 size={13} /></button>
                </h1>
                <div className="page-head-meta">
                  {budget.fecha   && <span style={{ fontSize: 13, color: 'var(--c-text-2)', display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={13} />  {budget.fecha}</span>}
                  <span className="save-state">
                    {saving ? <><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--c-warn)', display: 'inline-block' }}></span> Guardando…</> : <><span className="pulse"></span> Guardado · {budget.ultimaEdicion}</>}
                  </span>
                </div>
              </div>
              <div className="page-head-actions">
                {tabProject === 'presupuesto' && (
                  <button className="btn sm" onClick={() => triggerImport('presupuesto')}><Upload size={13} /> Importar</button>
                )}
                {tabProject !== 'presupuesto' && tabToCat[tabProject] && (
                  <button className="btn sm" onClick={() => triggerImport('cat-' + tabToCat[tabProject])}><Upload size={13} /> Importar</button>
                )}
                <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleImport} />
                <button className="btn sm" onClick={() => setShowVersion(true)}>💾 Versión</button>
                {tabProject === 'presupuesto' && <DescargasMenu budget={budget} params={params} onRangoFichas={() => setShowRango(true)} empresa={{ nombre: userEmpresa, logo: budget.logoOfertante, headerBg: budget.apuHeaderBg, headerText: budget.apuHeaderText }} />}
                {tabProject !== 'presupuesto' && tabToCat[tabProject] && (
                  <button className="btn sm" style={{ background: 'var(--c-success)', borderColor: 'var(--c-success)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => exportExcelCatalogo(budget, tabToCat[tabProject])}>
                    <FileSpreadsheet size={13} /> Excel
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="tabs">
              {tabsP.map(t => (
                <button key={t.k} className={`tab ${tabProject === t.k ? 'active' : ''}`} onClick={() => setTabProject(t.k)}>
                  {t.icon} {t.label} <span className="count">{t.badge}</span>
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="page-body" style={{ minHeight: 0, ...(tabProject === 'presupuesto' ? { overflow: 'hidden', padding: 0 } : {}) }}>
              {tabProject === 'presupuesto' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                  {/* ── Fixed top: KPIs + Params + Toolbar ── */}
                  <div style={{ flexShrink: 0, padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* KPIs */}
                    {budgetKPIs && (
                      <div className="kpi-row">
                        <div className="kpi">
                          <div className="kpi-label"><HardHat size={12} className="ico" /> Costo Directo</div>
                          <div className="kpi-val">{moneyB(budgetKPIs.direct)}</div>
                          <div className="kpi-foot">Materiales + Mano de obra + Equipo</div>
                        </div>
                        <div className="kpi">
                          <div className="kpi-label"><Layers size={12} className="ico" /> Indirectos + Imprevistos</div>
                          <div className="kpi-val">{moneyB(budgetKPIs.indirectos + budgetKPIs.imprevistos)}</div>
                          <div className="kpi-foot">{params.pctIndirectos}% + {params.pctImprevistos}%</div>
                        </div>
                        <div className="kpi">
                          <div className="kpi-label"><TrendingUp size={12} className="ico" /> Utilidad</div>
                          <div className="kpi-val">{moneyB(budgetKPIs.utilidad)}</div>
                          <div className="kpi-foot">{params.pctUtilidad}% sobre subtotal</div>
                        </div>
                        <div className="kpi highlight">
                          <div className="kpi-label"><DollarSign size={12} className="ico" /> Total General</div>
                          <div className="kpi-val">{moneyB(budgetKPIs.total)}</div>
                          <div className="kpi-foot">Incluye impuesto {params.pctImpuesto}%</div>
                        </div>
                      </div>
                    )}
                    {/* Toolbar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="sec-title" style={{ flex: 1 }}>
                        <Layers size={15} /> Desglose por capítulos
                        <span className="badge" style={{ marginLeft: 8 }}>
                          {calcKPIs(budget).nCapitulos} cap. · {calcKPIs(budget).nActividades} act.
                        </span>
                      </div>
                      <button
                        className="btn sm ghost"
                        title="Propaga el precio de cada actividad a todas las que tienen el mismo nombre"
                        onClick={() => setBudget({ ...budget, items: syncFichasByName(budget.items) })}
                      >
                        <RefreshCw size={13} /> Sincronizar precios
                      </button>
                    </div>
                  </div>
                  {/* ── Scrollable table ── */}
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 24px 32px' }}>
                    <div className="card" style={{ padding: 0 }}>
                      <PresupuestoTableComp budget={budget} setBudget={setBudget} onOpenFicha={p => setFichaPath(p)} params={params} />
                    </div>
                  </div>
                </div>
              )}
              {tabProject === 'cat-mat'    && <CatalogoView budget={budget} setBudget={setBudget} categoria={CATEGORIAS[0]} />}
              {tabProject === 'cat-mo'     && <CatalogoView budget={budget} setBudget={setBudget} categoria={CATEGORIAS[1]} />}
              {tabProject === 'cat-he'     && <CatalogoView budget={budget} setBudget={setBudget} categoria={CATEGORIAS[2]} />}
              {tabProject === 'cat-sub'    && <CatalogoView budget={budget} setBudget={setBudget} categoria={CATEGORIAS[3]} />}
              {tabProject === 'indirectos' && <IndirectosView budget={budget} setBudget={setBudget} />}
            </div>
          </Fragment>
        )}
      </div>

      {/* ── MODALS ── */}
      <FichaCostoModal
        open={!!fichaPath} onClose={() => setFichaPath(null)}
        actividad={fichaActividad} budget={budget}
        catalogos={budget?.catalogos || EMPTY_CATALOGOS}
        params={params} onUpdate={updFicha}
        onUpdateCatalogos={nc => setBudget({ ...budget, catalogos: nc })}
        empresa={{ nombre: userEmpresa, logo: budget?.logoOfertante, headerBg: budget?.apuHeaderBg, headerText: budget?.apuHeaderText }}
      />
      {budget && <ConfigProyectoModal  open={showConfig}  onClose={() => setShowConfig(false)}  budget={budget} setBudget={setBudget} />}
      {budget && <GuardarVersionDialog open={showVersion} onClose={() => setShowVersion(false)} budget={budget} setBudget={setBudget} />}
      {budget && <RangoFichasDialog    open={showRango}   onClose={() => setShowRango(false)}   budget={budget} params={params} empresa={{ nombre: userEmpresa, logo: budget.logoOfertante, headerBg: budget.apuHeaderBg, headerText: budget.apuHeaderText }} />}
      <UserSettingsModal
        open={showUserSettings}
        onClose={() => setShowUserSettings(false)}
        profile={effectiveProfile}
        user={user}
        onSaved={({ nombre, empresa }) => setProfileOverride(p => ({ ...p, nombre, empresa }))}
      />
    </div>
  )
}
