/* Budget (Presupuesto) view — the redesigned main screen */
const { useState: useStateB, useMemo: useMemoB } = React;

function BudgetView({ project, onBack, onSettings, params, setParams }) {
  const { BUDGET } = window.MOCK;
  const [tab, setTab] = useStateB('budget');
  const [showCotizante, setShowCotizante] = useStateB(false);
  const [items, setItems] = useStateB(BUDGET);

  // Compute totals
  const totals = useMemoB(() => {
    let direct = 0;
    const byChapter = {};
    const bySub = {};
    items.forEach(it => {
      if (it.kind === 'activity') {
        const sub = (it.qty || 0) * (it.price || 0);
        direct += sub;
        bySub[it.parent] = (bySub[it.parent] || 0) + sub;
      }
    });
    items.forEach(it => {
      if (it.kind === 'subchapter') byChapter[it.parent] = (byChapter[it.parent] || 0) + (bySub[it.id] || 0);
    });
    const indirectos = direct * (params.indirectos / 100);
    const imprevistos = (direct + indirectos) * (params.imprevistos / 100);
    const subtotalBruto = direct + indirectos + imprevistos;
    const utilidad = subtotalBruto * (params.utilidad / 100);
    const subtotalConU = subtotalBruto + utilidad;
    const impuesto = subtotalConU * (params.impuesto / 100);
    const total = subtotalConU + impuesto;
    return { direct, indirectos, imprevistos, utilidad, impuesto, total, byChapter, bySub };
  }, [items, params]);

  const tabs = [
    { id: 'budget', label: 'Presupuesto', icon: 'FileText', count: items.length },
    { id: 'materials', label: 'Lista Materiales', icon: 'Box', count: 24 },
    { id: 'labor', label: 'Lista Mano de Obra', icon: 'HardHat', count: 12 },
    { id: 'equipment', label: 'Lista Herramientas/Equipo', icon: 'Wrench', count: 8 },
    { id: 'subcontracts', label: 'Lista Subcontratos', icon: 'Users', count: 5 },
  ];

  const updateActivity = (id, field, value) => {
    setItems(items.map(it => it.id === id ? { ...it, [field]: value } : it));
  };

  return (
    <React.Fragment>
      {/* Page header */}
      <div className="page-head">
        <div className="page-head-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--c-text-3)', fontWeight: 500 }}>
            <span className="badge brand">{project.tag}</span>
            <window.StatusBadge status={project.status} />
            <span className="badge">Rev {project.revision}</span>
            <span className="badge mono"><window.I.Coins size={11} /> {project.currency}</span>
          </div>
          <h1>
            {project.name}
            <button className="icon-btn" style={{ width: 26, height: 26 }} title="Renombrar"><window.I.Edit size={13} /></button>
          </h1>
          <div className="page-head-meta">
            <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}><window.I.Briefcase size={13} style={{ verticalAlign: '-2px' }} /> {project.client}</span>
            <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}><window.I.MapPin size={13} style={{ verticalAlign: '-2px' }} /> {project.location}</span>
            <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}><window.I.Calendar size={13} style={{ verticalAlign: '-2px' }} /> {project.date}</span>
            <span className="save-state"><span className="pulse"></span> Guardado · {project.updated}</span>
          </div>
        </div>
        <div className="page-head-actions">
          <div className="seg">
            <button className="" title="Importar Excel"><window.I.FileSpreadsheet size={13} stroke={1.8} style={{ color: '#10B981' }} /> Excel</button>
            <button className="" title="Importar PDF"><window.I.FileText size={13} stroke={1.8} style={{ color: '#DC2626' }} /> PDF</button>
          </div>
          <button className="btn"><window.I.Download size={14} /> Exportar</button>
          <button className="btn"><window.I.Sparkles size={14} stroke={2} /> Asistente IA</button>
          <button className="btn ghost icon" onClick={onSettings} title="Configuración del proyecto"><window.I.Settings size={16} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(t => {
          const Icon = window.I[t.icon];
          return (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <Icon size={14} />
              {t.label}
              <span className="count">{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="page-body">
        {tab === 'budget' ? (
          <React.Fragment>
            {/* KPI strip */}
            <div className="kpi-row">
              <window.KPI
                label="Costo Directo"
                value={totals.direct}
                icon="HardHat"
                foot="Materiales + Mano de obra + Equipo"
                currency={project.currency}
              />
              <window.KPI
                label="Indirectos + Imprevistos"
                value={totals.indirectos + totals.imprevistos}
                icon="Layers"
                foot={`${params.indirectos}% + ${params.imprevistos}%`}
                currency={project.currency}
              />
              <window.KPI
                label="Utilidad Esperada"
                value={totals.utilidad}
                icon="TrendUp"
                foot={`${params.utilidad}% sobre subtotal`}
                delta={params.utilidad}
                currency={project.currency}
              />
              <window.KPI
                label="Total General"
                value={totals.total}
                icon="DollarSign"
                foot={`Incluye impuesto ${params.impuesto}%`}
                highlight
                currency={project.currency}
              />
            </div>

            {/* Params strip */}
            <div className="params">
              <span className="params-label">Parámetros globales</span>
              {[
                { key: 'indirectos', label: 'Indirectos' },
                { key: 'imprevistos', label: 'Imprevistos' },
                { key: 'utilidad', label: 'Utilidad' },
                { key: 'impuesto', label: 'Impuesto' },
              ].map(p => (
                <div key={p.key} className="param-pill">
                  <span className="param-pill-lbl">{p.label}</span>
                  <input
                    type="number"
                    value={params[p.key]}
                    onChange={e => setParams({ ...params, [p.key]: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="suf">%</span>
                </div>
              ))}
              <div style={{ flex: 1 }}></div>
              <button className="btn ghost sm" onClick={() => setShowCotizante(true)}><window.I.Edit size={13} /> Datos del cotizante</button>
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="sec-title" style={{ flex: 1 }}>
                <window.I.Layers size={15} /> Desglose por capítulos
                <span className="badge" style={{ marginLeft: 6 }}>{items.filter(i => i.kind === 'chapter').length} capítulos · {items.filter(i => i.kind === 'activity').length} actividades</span>
              </div>
              <button className="btn sm ghost"><window.I.Filter size={13} /> Filtrar</button>
              <button className="btn sm ghost"><window.I.Search size={13} /> Buscar en presupuesto</button>
              <div style={{ width: 1, height: 22, background: 'var(--c-line)', margin: '0 4px' }}></div>
              <button className="btn sm"><window.I.Plus size={13} stroke={2.5} /> Nuevo Capítulo</button>
              <button className="btn sm brand"><window.I.Sparkles size={13} stroke={2} /> Generar APU con IA</button>
            </div>

            {/* Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <BudgetTable
                items={items}
                totals={totals}
                params={params}
                project={project}
                onUpdate={updateActivity}
              />
            </div>
          </React.Fragment>
        ) : (
          <div className="card empty">
            {React.createElement(window.I[tabs.find(t => t.id === tab).icon], { size: 28, style: { color: 'var(--c-text-4)', marginBottom: 8 }})}
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text-2)' }}>{tabs.find(t => t.id === tab).label}</div>
            <div style={{ marginTop: 4 }}>Esta lista se genera automáticamente desde las actividades del presupuesto.</div>
          </div>
        )}
      </div>

      {/* Cotizante drawer */}
      <window.Drawer
        open={showCotizante}
        onClose={() => setShowCotizante(false)}
        title="Datos del Cotizante y Proyecto"
        subtitle="Información que aparecerá en la portada de la cotización"
        footer={
          <React.Fragment>
            <button className="btn ghost" onClick={() => setShowCotizante(false)}>Cancelar</button>
            <button className="btn primary" onClick={() => setShowCotizante(false)}><window.I.Check size={14} /> Guardar cambios</button>
          </React.Fragment>
        }
      >
        <CotizanteForm project={project} />
      </window.Drawer>
    </React.Fragment>
  );
}

/* ============ Budget Table ============ */
function BudgetTable({ items, totals, params, project, onUpdate }) {
  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 480px)' }}>
      <table className="bt">
        <thead>
          <tr>
            <th style={{ width: 80 }}>ID</th>
            <th>Descripción</th>
            <th style={{ width: 80 }}>Unidad</th>
            <th className="num" style={{ width: 100 }}>Cantidad</th>
            <th className="num" style={{ width: 120 }}>P. Unitario</th>
            <th className="num" style={{ width: 140 }}>Subtotal</th>
            <th style={{ width: 120 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => {
            if (it.kind === 'chapter') {
              return (
                <tr key={it.id} className="chapter">
                  <td className="id">{it.code}</td>
                  <td className="desc" colSpan={4}>
                    <span style={{ marginRight: 8, color: 'var(--c-text-3)', fontSize: 11, fontWeight: 500 }}>CAPÍTULO</span>
                    {it.desc}
                  </td>
                  <td className="num" style={{ fontWeight: 700, color: 'var(--c-ink)' }}>
                    {window.formatMoney(totals.byChapter[it.id] || 0, project.currency)}
                  </td>
                  <td className="actions">
                    <div className="row-actions">
                      <button className="btn xs"><window.I.Plus size={11} /> Sub</button>
                      <button className="btn xs"><window.I.Plus size={11} /> Act</button>
                      <button className="btn xs ghost icon"><window.I.MoreH size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            }
            if (it.kind === 'subchapter') {
              return (
                <tr key={it.id} className="subchapter">
                  <td className="id">{it.code}</td>
                  <td className="desc" colSpan={4}>{it.desc}</td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {window.formatMoney(totals.bySub[it.id] || 0, project.currency)}
                  </td>
                  <td className="actions">
                    <div className="row-actions">
                      <button className="btn xs"><window.I.Plus size={11} /> Act</button>
                      <button className="btn xs ghost icon"><window.I.MoreH size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            }
            const sub = (it.qty || 0) * (it.price || 0);
            return (
              <tr key={it.id} className="activity">
                <td className="id">{it.code}</td>
                <td className="desc">{it.desc}</td>
                <td><span className="unit-chip">{it.unit}</span></td>
                <td className="num">
                  <input
                    className="cell-input num"
                    type="number"
                    value={it.qty}
                    onChange={e => onUpdate(it.id, 'qty', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td className="num">
                  <input
                    className="cell-input num"
                    type="number"
                    value={it.price}
                    step="0.01"
                    onChange={e => onUpdate(it.id, 'price', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td className="num" style={{ fontWeight: 600 }}>{window.formatMoney(sub, project.currency)}</td>
                <td className="actions">
                  <div className="row-actions">
                    <button className="btn xs ghost icon" title="Duplicar"><window.I.Copy size={12} /></button>
                    <button className="btn xs ghost icon" title="Editar APU"><window.I.Edit size={12} /></button>
                    <button className="btn xs danger icon" title="Eliminar"><window.I.Trash size={12} /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="lbl" colSpan={5}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span>Total General</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)', textTransform: 'none', letterSpacing: 0 }}>
                  Directo {window.formatMoney(totals.direct, project.currency)} · Indir. + Imp. {window.formatMoney(totals.indirectos + totals.imprevistos, project.currency)} · Util. {window.formatMoney(totals.utilidad, project.currency)} · Imp. {window.formatMoney(totals.impuesto, project.currency)}
                </span>
              </div>
            </td>
            <td className="num total-cell">{window.formatMoney(totals.total, project.currency)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ============ Cotizante Form ============ */
function CotizanteForm({ project }) {
  const { COMPANY } = window.MOCK;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <div className="sec-title" style={{ fontSize: 13, marginBottom: 12 }}><window.I.Building size={14} /> Empresa que cotiza</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label className="field-label">Nombre comercial</label>
            <input className="input" defaultValue={COMPANY.name} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">RTN</label>
              <input className="input mono" defaultValue={COMPANY.rtn} />
            </div>
            <div className="field">
              <label className="field-label">Teléfono</label>
              <input className="input" defaultValue={COMPANY.phone} />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Cliente</label>
            <input className="input" defaultValue={project.client} />
          </div>
        </div>
      </div>
      <div className="divider"></div>
      <div>
        <div className="sec-title" style={{ fontSize: 13, marginBottom: 12 }}><window.I.FileText size={14} /> Detalles del proyecto</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label className="field-label">Nombre del proyecto</label>
            <input className="input" defaultValue={project.name} />
          </div>
          <div className="field">
            <label className="field-label">Lugar del proyecto</label>
            <input className="input" defaultValue={project.location} />
          </div>
          <div className="grid-3">
            <div className="field">
              <label className="field-label">Fecha</label>
              <input type="date" className="input" defaultValue={project.date} />
            </div>
            <div className="field">
              <label className="field-label">Revisión</label>
              <input type="number" className="input mono" defaultValue={project.revision} />
            </div>
            <div className="field">
              <label className="field-label">Moneda</label>
              <select className="select" defaultValue={project.currency}>
                <option>USD</option>
                <option>HNL</option>
                <option>EUR</option>
                <option>MXN</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ Settings Drawer ============ */
function SettingsView({ open, onClose }) {
  const [pane, setPane] = useStateB('company');
  if (!open) return null;
  const { COMPANY, USER } = window.MOCK;
  return (
    <window.Drawer
      open={open}
      onClose={onClose}
      title="Configuración"
      subtitle="Gestiona tu empresa, plan y preferencias"
      width={560}
      footer={
        <React.Fragment>
          <button className="btn ghost" onClick={onClose}>Cerrar</button>
          <button className="btn primary"><window.I.Check size={14} /> Guardar cambios</button>
        </React.Fragment>
      }
    >
      <div className="seg" style={{ marginBottom: 18, width: '100%' }}>
        {[
          { id: 'company', label: 'Empresa', icon: 'Building' },
          { id: 'plan', label: 'Plan', icon: 'Crown' },
          { id: 'team', label: 'Equipo', icon: 'Users' },
          { id: 'prefs', label: 'Preferencias', icon: 'Settings' },
        ].map(p => {
          const Icon = window.I[p.icon];
          return (
            <button key={p.id} className={pane === p.id ? 'on' : ''} onClick={() => setPane(p.id)} style={{ flex: 1, justifyContent: 'center' }}>
              <Icon size={13} /> {p.label}
            </button>
          );
        })}
      </div>

      {pane === 'company' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field-row" style={{ gap: 14 }}>
            <div style={{ width: 64, height: 64, borderRadius: 10, background: 'linear-gradient(135deg, #F59E0B, #FBBF24)', display: 'grid', placeItems: 'center', color: '#14213D', fontWeight: 800, fontSize: 22, flexShrink: 0 }}>
              ED
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{COMPANY.name}</div>
              <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>Plan {COMPANY.plan} · Activo</div>
              <button className="btn sm ghost" style={{ marginTop: 8, padding: '3px 8px' }}><window.I.Upload size={11} /> Cambiar logo</button>
            </div>
          </div>
          <div className="divider"></div>
          <div className="field">
            <label className="field-label">Razón social</label>
            <input className="input" defaultValue={COMPANY.name} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">RTN</label>
              <input className="input mono" defaultValue={COMPANY.rtn} />
            </div>
            <div className="field">
              <label className="field-label">Teléfono</label>
              <input className="input" defaultValue={COMPANY.phone} />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Correo</label>
            <input className="input" defaultValue={COMPANY.email} />
          </div>
          <div className="field">
            <label className="field-label">Dirección</label>
            <input className="input" defaultValue={COMPANY.address} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">Moneda predeterminada</label>
              <select className="select" defaultValue="USD"><option>USD</option><option>HNL</option><option>EUR</option><option>MXN</option></select>
            </div>
            <div className="field">
              <label className="field-label">País</label>
              <select className="select" defaultValue="HN"><option value="HN">Honduras</option><option value="GT">Guatemala</option><option value="SV">El Salvador</option><option value="MX">México</option></select>
            </div>
          </div>
        </div>
      )}

      {pane === 'plan' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: 16, background: 'linear-gradient(135deg, #14213D, #0A1428)', color: '#fff', borderColor: 'transparent' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 600, letterSpacing: 0.08, textTransform: 'uppercase' }}>Plan Actual</div>
                <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <window.I.Crown size={20} style={{ color: '#FBBF24' }} /> Profesional
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Renovación: 15 de Junio, 2026</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600 }}>$49<span style={{ fontSize: 12, opacity: 0.5 }}>/mes</span></div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <PlanCard tier="Básico" price="$19" features={['5 proyectos', '100 actividades', 'Exportar PDF']} />
            <PlanCard tier="Empresarial" price="$129" features={['Ilimitado', 'API + integraciones', 'Soporte 24/7']} highlight />
          </div>
          <button className="btn brand" style={{ justifyContent: 'center', padding: '10px 13px' }}><window.I.Crown size={14} /> Mejorar plan</button>
        </div>
      )}

      {pane === 'team' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { name: USER.name, role: USER.role, email: USER.email, owner: true, initials: USER.initials, color: 'linear-gradient(135deg, #6366F1, #2563EB)' },
            { name: 'Ana Lucía Pineda', role: 'Cuantificadora', email: 'a.pineda@edificadora.hn', initials: 'AP', color: 'linear-gradient(135deg, #EC4899, #DB2777)' },
            { name: 'Carlos Hernández', role: 'Ingeniero Residente', email: 'c.hernandez@edificadora.hn', initials: 'CH', color: 'linear-gradient(135deg, #10B981, #059669)' },
            { name: 'Rodrigo Mejía', role: 'Asistente', email: 'r.mejia@edificadora.hn', initials: 'RM', color: 'linear-gradient(135deg, #F59E0B, #D97706)' },
          ].map((m, i) => (
            <div key={i} className="card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 38, height: 38, borderRadius: 999, background: m.color, color: '#fff', fontWeight: 600, display: 'grid', placeItems: 'center', fontSize: 13 }}>
                {m.initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {m.name}
                  {m.owner && <span className="badge brand">Propietario</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{m.role} · {m.email}</div>
              </div>
              {!m.owner && <button className="btn ghost icon sm"><window.I.MoreH size={14} /></button>}
            </div>
          ))}
          <button className="btn" style={{ justifyContent: 'center' }}><window.I.Plus size={13} /> Invitar miembro</button>
        </div>
      )}

      {pane === 'prefs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PrefRow label="Idioma" value="Español (Honduras)" />
          <PrefRow label="Formato de fecha" value="DD-MMM-YYYY" />
          <PrefRow label="Separador decimal" value="Punto (.)" />
          <PrefRow label="Decimales en moneda" value="2 decimales" />
          <div className="divider"></div>
          <Toggle label="Autoguardado" sub="Guarda los cambios cada 30 segundos" on />
          <Toggle label="Cálculo de utilidad sobre subtotal" sub="Aplica utilidad después de indirectos e imprevistos" on />
          <Toggle label="Sugerencias de IA" sub="Mostrar sugerencias de APU y precios" on />
          <Toggle label="Notificaciones por correo" sub="Cambios de revisión y aprobaciones" />
        </div>
      )}
    </window.Drawer>
  );
}

function PlanCard({ tier, price, features, highlight }) {
  return (
    <div className="card" style={{ padding: 12, borderColor: highlight ? 'var(--c-accent)' : 'var(--c-line)', background: highlight ? 'var(--c-accent-soft)' : 'var(--c-surface)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: highlight ? '#B45309' : 'var(--c-text-2)' }}>{tier}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, marginTop: 4 }}>{price}<span style={{ fontSize: 11, opacity: 0.5 }}>/mes</span></div>
      <ul style={{ fontSize: 11.5, color: 'var(--c-text-2)', paddingLeft: 16, margin: '8px 0 0' }}>
        {features.map((f, i) => <li key={i} style={{ marginBottom: 2 }}>{f}</li>)}
      </ul>
    </div>
  );
}
function PrefRow({ label, value }) {
  return (
    <div className="spread" style={{ padding: '6px 0' }}>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      <select className="select" style={{ width: 200 }} defaultValue={value}><option>{value}</option></select>
    </div>
  );
}
function Toggle({ label, sub, on }) {
  const [v, set] = useStateB(!!on);
  return (
    <div className="spread" style={{ padding: '4px 0' }}>
      <div style={{ flex: 1, paddingRight: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{sub}</div>}
      </div>
      <button onClick={() => set(!v)} style={{
        width: 36, height: 20, borderRadius: 999, background: v ? 'var(--c-success)' : '#CCD3DD', border: 0, position: 'relative',
        transition: 'background 150ms ease', cursor: 'pointer',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: v ? 18 : 2, width: 16, height: 16, borderRadius: 999, background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left 150ms ease',
        }}></span>
      </button>
    </div>
  );
}

Object.assign(window, { BudgetView, SettingsView });
