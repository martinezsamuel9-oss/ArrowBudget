// HomeView and ProjectsView — migrated from costos/views-home.jsx
import { useState, useMemo } from 'react'
import { I } from '../icons'
import { StatusBadge, formatMoney, formatShort } from '../components'

/* ============ Home Dashboard ============ */
export function HomeView({ projects, user, company, onOpenProject, onNew }) {
  const recent    = projects.slice(0, 3)
  const favorites = projects.filter(p => p.favorite)
  const totalValue  = projects.reduce((s, p) => s + (p.total || 0), 0)
  const activeCount = projects.filter(p => p.status === 'active').length
  const reviewCount = projects.filter(p => p.status === 'review').length

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 19) return 'Buenas tardes'
    return 'Buenas noches'
  })()

  const firstName = (user?.user_metadata?.full_name || user?.email || 'usuario').split(/[\s@]/)[0]

  return (
    <div className="page-body" style={{ paddingTop: 28 }}>
      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', fontWeight: 500, marginBottom: 4 }}>{greeting},</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            {firstName} 👋
          </h1>
          <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginTop: 6 }}>
            {projects.length === 0
              ? 'No tienes proyectos aún. ¡Crea el primero!'
              : <>Tienes <b style={{ color: 'var(--c-ink)' }}>{activeCount} proyecto{activeCount !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''}</b>{reviewCount > 0 && <> y <b style={{ color: 'var(--c-warn)' }}>{reviewCount} en revisión</b></>}.</>
            }
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn brand" onClick={onNew}>
            <I.Plus size={14} stroke={2.5} /> Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        <KPI
          label="Valor Total Cartera"
          value={'$ ' + formatShort(totalValue)}
          icon="DollarSign"
          foot={`${projects.length} proyecto${projects.length !== 1 ? 's' : ''}`}
          highlight
        />
        <KPI label="Proyectos Activos"  value={String(activeCount)} icon="Activity" foot="En progreso" />
        <KPI label="En Revisión"        value={String(reviewCount)} icon="Clock"    foot="Pendientes de aprobación" />
        <KPI label="Total Proyectos"    value={String(projects.length)} icon="Folder" foot="En tu cartera" />
      </div>

      {/* Recent + Favorites */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginTop: 4 }}>
        {/* Recent */}
        <div>
          <div className="sec-head">
            <div>
              <div className="sec-title"><I.Clock size={16} /> Continuar trabajando</div>
              <div className="sec-sub">Proyectos abiertos recientemente</div>
            </div>
            <button className="btn ghost sm" onClick={() => onNew(true)}>
              Ver todos <I.ArrowRight size={12} />
            </button>
          </div>
          {recent.length === 0
            ? (
              <div className="card empty">
                <I.Folder size={28} style={{ color: 'var(--c-text-4)', marginBottom: 8 }} />
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text-2)' }}>Sin proyectos aún</div>
                <div style={{ marginTop: 4 }}>Crea tu primer presupuesto.</div>
                <button className="btn brand" style={{ marginTop: 12 }} onClick={onNew}>
                  <I.Plus size={14} /> Crear proyecto
                </button>
              </div>
            )
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recent.map(p => <RecentRow key={p.id} project={p} onOpen={() => onOpenProject(p)} />)}
              </div>
            )
          }
        </div>

        {/* Favorites */}
        <div>
          <div className="sec-head">
            <div>
              <div className="sec-title"><I.Star size={16} /> Favoritos</div>
              <div className="sec-sub">Acceso rápido</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {favorites.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--c-text-3)', padding: '12px 0' }}>
                No tienes favoritos aún.
              </div>
            )}
            {favorites.map(p => (
              <div key={p.id} className="card"
                style={{ padding: 12, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }}
                onClick={() => onOpenProject(p)}>
                <div style={{ width: 36, height: 36, borderRadius: 7, background: p.cover, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{formatMoney(p.total, p.currency)}</div>
                </div>
                <I.ArrowUpRight size={14} style={{ color: 'var(--c-text-3)' }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <div className="sec-head">
          <div className="sec-title"><I.Sparkles size={16} /> Acciones rápidas</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <QuickAction icon="Plus"     title="Crear presupuesto" sub="Desde cero"                    color="#F59E0B" onClick={onNew} />
          <QuickAction icon="FileText" title="Exportar PDF"      sub="Cotización profesional"        color="#DC2626" />
          <QuickAction icon="FileSpreadsheet" title="Exportar Excel" sub="Con formato y colores"    color="#10B981" />
          <QuickAction icon="BookOpen" title="Biblioteca APUs"   sub="Análisis de Precios Unitarios" color="#2563EB" />
        </div>
      </div>
    </div>
  )
}

function RecentRow({ project, onOpen }) {
  return (
    <div className="card"
      style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'center', cursor: 'pointer' }}
      onClick={onOpen}>
      <div style={{ width: 52, height: 52, borderRadius: 9, background: project.cover, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <I.Building size={22} stroke={1.5} style={{ color: 'rgba(255,255,255,0.9)' }} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <StatusBadge status={project.status} />
          <span className="badge">Rev {project.revision}</span>
          <span className="muted" style={{ fontSize: 11 }}>· {project.updated}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>{project.name}</div>
        <div style={{ fontSize: 12, color: 'var(--c-text-3)', display: 'flex', gap: 14, marginTop: 2 }}>
          {project.client && <span>{project.client}</span>}
          {project.client && project.location && <span>·</span>}
          {project.location && <span><I.MapPin size={11} style={{ verticalAlign: '-2px' }} /> {project.location}</span>}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="proj-amount-label">Total</div>
        <div className="proj-amount">{formatMoney(project.total, project.currency)}</div>
      </div>
    </div>
  )
}

function QuickAction({ icon, title, sub, color, onClick }) {
  const Icon = I[icon]
  return (
    <button className="card" onClick={onClick}
      style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, background: 'var(--c-surface)', textAlign: 'left', cursor: onClick ? 'pointer' : 'default', border: '1px solid var(--c-line)' }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: color + '18', color, display: 'grid', placeItems: 'center' }}>
        <Icon size={18} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{sub}</div>
      </div>
    </button>
  )
}

function KPI({ label, value, icon, foot, delta, highlight }) {
  const Icon = icon ? I[icon] : null
  return (
    <div className={`kpi ${highlight ? 'highlight' : ''}`}>
      <div className="kpi-label">{Icon && <Icon size={12} className="ico" />}{label}</div>
      <div className="kpi-val">{value}</div>
      {foot && (
        <div className="kpi-foot">
          {delta != null && <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}%</span>}
          <span>{foot}</span>
        </div>
      )}
    </div>
  )
}

/* ============ Projects List ============ */
export function ProjectsView({ projects, onOpenProject, onNew, loading }) {
  const [layout, setLayout] = useState('grid')
  const [query,  setQuery]  = useState('')
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => projects.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false
    if (query && !(p.name + ' ' + p.client).toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [projects, filter, query])

  return (
    <>
      <div className="page-head">
        <div className="page-head-title">
          <h1>
            Proyectos
            <span className="badge" style={{ fontSize: 12, padding: '3px 9px' }}>{projects.length}</span>
          </h1>
          <div className="page-head-meta">
            <div style={{ fontSize: 13, color: 'var(--c-text-2)' }}>
              Cartera total: <b className="mono" style={{ color: 'var(--c-ink)' }}>
                {formatMoney(projects.reduce((s, p) => s + (p.total || 0), 0), 'USD')}
              </b>
            </div>
          </div>
        </div>
        <div className="page-head-actions">
          <button className="btn brand" onClick={() => onNew()}>
            <I.Plus size={14} stroke={2.5} /> Nuevo Proyecto
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--c-line)', background: 'var(--c-surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div className="topbar-search" style={{ width: 320, background: 'var(--c-bg)' }}>
          <I.Search size={14} />
          <input placeholder="Buscar por nombre o cliente…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="seg">
          {[
            { id: 'all',      label: 'Todos' },
            { id: 'active',   label: 'Activos' },
            { id: 'review',   label: 'En revisión' },
            { id: 'draft',    label: 'Borradores' },
            { id: 'approved', label: 'Aprobados' },
          ].map(f => (
            <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div className="seg">
          <button className={layout === 'grid' ? 'on' : ''} onClick={() => setLayout('grid')}><I.Grid size={13} /></button>
          <button className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')}><I.List size={13} /></button>
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 18 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--c-text-3)' }}>Cargando proyectos…</div>
        ) : layout === 'grid' ? (
          <div className="proj-grid">
            {filtered.map((p, i) => <ProjectCard key={p.id} project={p} onClick={() => onOpenProject(p)} />)}
            <button className="proj-card" onClick={() => onNew()}
              style={{ background: 'var(--c-bg-2)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', minHeight: 280, color: 'var(--c-text-3)', cursor: 'pointer' }}>
              <I.Plus size={28} stroke={1.5} />
              <div style={{ fontSize: 14, fontWeight: 500, marginTop: 8 }}>Crear nuevo proyecto</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Desde cero</div>
            </button>
          </div>
        ) : (
          <ProjectList projects={filtered} onOpen={onOpenProject} />
        )}
      </div>
    </>
  )
}

function ProjectCard({ project, onClick }) {
  const [fav, setFav] = useState(project.favorite)
  return (
    <div className="proj-card" onClick={onClick}>
      <div className="proj-thumb" style={{ background: project.cover }}>
        <span className="badge dark proj-thumb-tag">{project.tag}</span>
        <button className={`proj-thumb-fav ${fav ? 'on' : ''}`}
          onClick={e => { e.stopPropagation(); setFav(!fav) }}>
          <I.Star size={14} fill={fav ? 'currentColor' : 'none'} stroke={fav ? 0 : 1.75} />
        </button>
      </div>
      <div className="proj-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusBadge status={project.status} />
          <span className="badge">Rev {project.revision}</span>
          <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{project.updated}</span>
        </div>
        <div className="proj-name">{project.name}</div>
        <div className="proj-client">{project.client || '—'}</div>
        <div className="proj-meta">
          {project.location && <span className="proj-meta-item"><I.MapPin size={12} /> {project.location}</span>}
          <span className="proj-meta-item"><I.Layers size={12} /> {project.chapters} cap.</span>
          <span className="proj-meta-item"><I.Activity size={12} /> {project.activities} act.</span>
        </div>
        <div className="proj-progress"><div style={{ width: project.progress + '%' }} /></div>
      </div>
      <div className="proj-foot">
        <div>
          <div className="proj-amount-label">Total Estimado</div>
          <div className="proj-amount">{formatMoney(project.total, project.currency)}</div>
        </div>
        <I.ArrowUpRight size={16} style={{ color: 'var(--c-text-3)' }} />
      </div>
    </div>
  )
}

function ProjectList({ projects, onOpen }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="bt">
        <thead>
          <tr>
            <th>Proyecto</th>
            <th>Cliente</th>
            <th>Ubicación</th>
            <th>Estado</th>
            <th className="num">Total</th>
            <th>Actualizado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(p)}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: p.cover, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--c-ink)' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>Rev {p.revision} · {p.tag}</div>
                  </div>
                </div>
              </td>
              <td>{p.client || '—'}</td>
              <td>{p.location || '—'}</td>
              <td><StatusBadge status={p.status} /></td>
              <td className="num" style={{ fontWeight: 600, color: 'var(--c-ink)' }}>{formatMoney(p.total, p.currency)}</td>
              <td className="muted" style={{ fontSize: 12 }}>{p.updated}</td>
              <td className="actions">
                <button className="btn ghost icon sm" onClick={e => e.stopPropagation()}><I.MoreH size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
