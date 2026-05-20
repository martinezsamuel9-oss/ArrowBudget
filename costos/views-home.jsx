/* Views — Home, Projects list, Settings */
const { useState: useStateV, useMemo } = React;

/* ============ Home Dashboard ============ */
function HomeView({ onOpenProject, onNew }) {
  const { PROJECTS, USER } = window.MOCK;
  const recent = PROJECTS.slice(0, 3);
  const favorites = PROJECTS.filter(p => p.favorite);
  const totalValue = PROJECTS.reduce((s, p) => s + p.total, 0);
  const activeCount = PROJECTS.filter(p => p.status === 'active').length;
  const reviewCount = PROJECTS.filter(p => p.status === 'review').length;
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  })();
  const firstName = USER.name.split(' ')[0];

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
            Tienes <b style={{ color: 'var(--c-ink)' }}>{activeCount} proyectos activos</b> y <b style={{ color: 'var(--c-warn)' }}>{reviewCount} en revisión</b>.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn"><window.I.Upload size={14} /> Importar</button>
          <button className="btn brand" onClick={onNew}><window.I.Plus size={14} stroke={2.5} /> Nuevo Proyecto</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        <window.KPI
          label="Valor Total Cartera"
          value={'$ ' + window.formatShort(totalValue)}
          icon="DollarSign"
          foot="Suma de 6 proyectos"
          delta={12.4}
          highlight
        />
        <window.KPI
          label="Proyectos Activos"
          value={String(activeCount)}
          icon="Activity"
          foot="3 esta semana"
          delta={8}
        />
        <window.KPI
          label="En Revisión"
          value={String(reviewCount)}
          icon="Clock"
          foot="Promedio: 4.2 días"
          delta={-15}
        />
        <window.KPI
          label="Tasa de Aprobación"
          value="84%"
          icon="TrendUp"
          foot="Últimos 90 días"
          delta={3.2}
        />
      </div>

      {/* Recent + Favorites */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginTop: 12 }}>
        {/* Recent */}
        <div>
          <div className="sec-head">
            <div>
              <div className="sec-title"><window.I.Clock size={16} /> Continuar trabajando</div>
              <div className="sec-sub">Proyectos abiertos recientemente</div>
            </div>
            <button className="btn ghost sm" onClick={() => window.__setView('projects')}>
              Ver todos <window.I.ArrowRight size={12} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recent.map(p => <RecentRow key={p.id} project={p} onOpen={() => onOpenProject(p)} />)}
          </div>
        </div>

        {/* Favorites */}
        <div>
          <div className="sec-head">
            <div>
              <div className="sec-title"><window.I.Star size={16} /> Favoritos</div>
              <div className="sec-sub">Acceso rápido</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {favorites.map(p => (
              <div key={p.id} className="card" style={{ padding: 12, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }} onClick={() => onOpenProject(p)}>
                <div style={{ width: 36, height: 36, borderRadius: 7, background: p.cover, flexShrink: 0 }}></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{window.formatMoney(p.total, p.currency)}</div>
                </div>
                <window.I.ArrowUpRight size={14} style={{ color: 'var(--c-text-3)' }} />
              </div>
            ))}
            <button className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--c-text-3)', fontSize: 12, fontWeight: 500, background: 'var(--c-bg-2)', borderStyle: 'dashed' }}>
              <window.I.Plus size={13} /> Agregar a favoritos
            </button>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ marginTop: 12 }}>
        <div className="sec-head">
          <div className="sec-title"><window.I.Sparkles size={16} /> Acciones rápidas</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <QuickAction icon="Plus" title="Crear presupuesto" sub="Desde plantilla o en blanco" color="#F59E0B" onClick={onNew} />
          <QuickAction icon="Upload" title="Importar Excel" sub="Migrar presupuestos existentes" color="#10B981" />
          <QuickAction icon="FileText" title="Importar PDF" sub="Extraer ítems con IA" color="#DC2626" />
          <QuickAction icon="BookOpen" title="Biblioteca APUs" sub="Análisis de Precios Unitarios" color="#2563EB" />
        </div>
      </div>
    </div>
  );
}

function RecentRow({ project, onOpen }) {
  return (
    <div className="card" style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'center', cursor: 'pointer' }} onClick={onOpen}>
      <div style={{ width: 52, height: 52, borderRadius: 9, background: project.cover, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <window.I.Building size={22} stroke={1.5} style={{ color: 'rgba(255,255,255,0.9)' }} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <window.StatusBadge status={project.status} />
          <span className="badge">Rev {project.revision}</span>
          <span className="muted" style={{ fontSize: 11 }}>· {project.updated}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>{project.name}</div>
        <div style={{ fontSize: 12, color: 'var(--c-text-3)', display: 'flex', gap: 14, marginTop: 2 }}>
          <span>{project.client}</span>
          <span>·</span>
          <span><window.I.MapPin size={11} style={{ verticalAlign: '-2px' }} /> {project.location}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="proj-amount-label">Total</div>
        <div className="proj-amount">{window.formatMoney(project.total, project.currency)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
          <div style={{ width: 80, height: 5, background: 'var(--c-line-2)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: project.progress + '%', height: '100%', background: 'var(--c-accent)' }}></div>
          </div>
          <span className="mono" style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{project.progress}%</span>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon, title, sub, color, onClick }) {
  const Icon = window.I[icon];
  return (
    <button className="card" onClick={onClick} style={{
      padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10,
      background: 'var(--c-surface)', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--c-line)',
      transition: 'border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = '#CCD3DD'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-line)'; e.currentTarget.style.boxShadow = 'var(--shadow-xs)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: color + '18',
        color: color,
        display: 'grid', placeItems: 'center',
      }}>
        <Icon size={18} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{sub}</div>
      </div>
    </button>
  );
}

/* ============ Projects List ============ */
function ProjectsView({ onOpenProject, onNew }) {
  const { PROJECTS } = window.MOCK;
  const [layout, setLayout] = useStateV('grid');
  const [query, setQuery] = useStateV('');
  const [filter, setFilter] = useStateV('all');

  const filtered = useMemo(() => {
    return PROJECTS.filter(p => {
      if (filter !== 'all' && p.status !== filter) return false;
      if (query && !(p.name + ' ' + p.client).toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [PROJECTS, filter, query]);

  return (
    <React.Fragment>
      <div className="page-head">
        <div className="page-head-title">
          <h1>
            Proyectos
            <span className="badge" style={{ fontSize: 12, padding: '3px 9px' }}>{PROJECTS.length}</span>
          </h1>
          <div className="page-head-meta">
            <div style={{ fontSize: 13, color: 'var(--c-text-2)' }}>
              Cartera total: <b className="mono" style={{ color: 'var(--c-ink)' }}>{window.formatMoney(PROJECTS.reduce((s, p) => s + p.total, 0), 'USD')}</b>
            </div>
          </div>
        </div>
        <div className="page-head-actions">
          <button className="btn"><window.I.Upload size={14} /> Importar</button>
          <button className="btn brand" onClick={onNew}><window.I.Plus size={14} stroke={2.5} /> Nuevo Proyecto</button>
        </div>
      </div>

      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--c-line)', background: 'var(--c-surface)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="topbar-search" style={{ width: 320, background: 'var(--c-bg)' }}>
          <window.I.Search size={14} />
          <input placeholder="Buscar por nombre o cliente…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="seg">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'active', label: 'Activos' },
            { id: 'review', label: 'En revisión' },
            { id: 'draft', label: 'Borradores' },
            { id: 'approved', label: 'Aprobados' },
          ].map(f => (
            <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }}></div>
        <button className="btn sm ghost"><window.I.Filter size={13} /> Filtros</button>
        <div className="seg">
          <button className={layout === 'grid' ? 'on' : ''} onClick={() => setLayout('grid')}><window.I.Grid size={13} /></button>
          <button className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')}><window.I.List size={13} /></button>
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 18 }}>
        {layout === 'grid' ? (
          <div className="proj-grid">
            {filtered.map(p => <ProjectCard key={p.id} project={p} onClick={() => onOpenProject(p)} />)}
            <button className="proj-card" onClick={onNew} style={{
              background: 'var(--c-bg-2)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
              minHeight: 280, color: 'var(--c-text-3)', cursor: 'pointer',
            }}>
              <window.I.Plus size={28} stroke={1.5} />
              <div style={{ fontSize: 14, fontWeight: 500, marginTop: 8 }}>Crear nuevo proyecto</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Desde plantilla o en blanco</div>
            </button>
          </div>
        ) : (
          <ProjectList projects={filtered} onOpen={onOpenProject} />
        )}
      </div>
    </React.Fragment>
  );
}

function ProjectCard({ project, onClick }) {
  const [fav, setFav] = useStateV(project.favorite);
  return (
    <div className="proj-card" onClick={onClick}>
      <div className="proj-thumb" style={{ background: project.cover }}>
        <span className="badge dark proj-thumb-tag">{project.tag}</span>
        <button className={`proj-thumb-fav ${fav ? 'on' : ''}`} onClick={e => { e.stopPropagation(); setFav(!fav); }}>
          <window.I.Star size={14} fill={fav ? 'currentColor' : 'none'} stroke={fav ? 0 : 1.75} />
        </button>
      </div>
      <div className="proj-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <window.StatusBadge status={project.status} />
          <span className="badge">Rev {project.revision}</span>
          <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{project.updated}</span>
        </div>
        <div className="proj-name">{project.name}</div>
        <div className="proj-client">{project.client}</div>
        <div className="proj-meta">
          <span className="proj-meta-item"><window.I.MapPin size={12} /> {project.location}</span>
          <span className="proj-meta-item"><window.I.Layers size={12} /> {project.chapters} capítulos</span>
        </div>
        <div className="proj-progress" title={`${project.progress}% completado`}>
          <div style={{ width: project.progress + '%' }}></div>
        </div>
      </div>
      <div className="proj-foot">
        <div>
          <div className="proj-amount-label">Total Estimado</div>
          <div className="proj-amount">{window.formatMoney(project.total, project.currency)}</div>
        </div>
        <window.I.ArrowUpRight size={16} style={{ color: 'var(--c-text-3)' }} />
      </div>
    </div>
  );
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
            <th>Avance</th>
            <th>Actualizado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(p)}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: p.cover, flexShrink: 0 }}></div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--c-ink)' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>Rev {p.revision} · {p.tag}</div>
                  </div>
                </div>
              </td>
              <td>{p.client}</td>
              <td>{p.location}</td>
              <td><window.StatusBadge status={p.status} /></td>
              <td className="num" style={{ fontWeight: 600, color: 'var(--c-ink)' }}>{window.formatMoney(p.total, p.currency)}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 80, height: 5, background: 'var(--c-line-2)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: p.progress + '%', height: '100%', background: 'var(--c-accent)' }}></div>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{p.progress}%</span>
                </div>
              </td>
              <td className="muted" style={{ fontSize: 12 }}>{p.updated}</td>
              <td className="actions">
                <button className="btn ghost icon sm" onClick={e => e.stopPropagation()}><window.I.MoreH size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

Object.assign(window, { HomeView, ProjectsView });
