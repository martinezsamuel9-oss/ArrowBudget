/* Main App — Router & state */
const { useState: useStateA, useEffect: useEffectA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "comfortable",
  "accent": "#F59E0B",
  "sidebarStyle": "dark"
}/*EDITMODE-END*/;

function App() {
  const [view, setView] = useStateA('home');
  const [activeProject, setActiveProject] = useStateA(null);
  const [settingsOpen, setSettingsOpen] = useStateA(false);
  const [params, setParams] = useStateA(window.MOCK.PARAMS);

  // Tweaks
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // Expose for cross-component access
  window.__setView = setView;

  // Apply tweaks via CSS vars
  useEffectA(() => {
    document.documentElement.style.setProperty('--c-accent', t.accent);
    // simple accent-2: lighten by tinting
    document.documentElement.style.setProperty('--c-accent-2', t.accent);
    // density
    document.body.style.setProperty('--row-height', t.density === 'compact' ? '36px' : t.density === 'cozy' ? '40px' : '44px');
    document.body.dataset.density = t.density;
    // sidebar
    document.documentElement.style.setProperty('--c-side', t.sidebarStyle === 'light' ? '#FFFFFF' : t.sidebarStyle === 'midnight' ? '#050B19' : '#0A1428');
    document.body.dataset.sidebar = t.sidebarStyle;
  }, [t.accent, t.density, t.sidebarStyle]);

  const openProject = (p) => {
    setActiveProject(p);
    setView('budget');
  };

  const goHome = () => {
    setView('home');
  };

  const crumbs = (() => {
    const c = [];
    if (view === 'home') c.push({ label: 'Inicio' });
    else if (view === 'projects') c.push({ label: 'Proyectos' });
    else if (view === 'budget' && activeProject) {
      c.push({ label: 'Proyectos', onClick: () => setView('projects') });
      c.push({ label: activeProject.name });
    } else {
      const map = { materials: 'Materiales', labor: 'Mano de Obra', equipment: 'Herramientas / Equipo', subcontracts: 'Subcontratos', reports: 'Reportes', library: 'Biblioteca', plans: 'Planes y Facturación', settings: 'Configuración' };
      if (map[view]) c.push({ label: map[view] });
    }
    return c;
  })();

  return (
    <div className="app">
      <window.Sidebar view={view} setView={setView} project={activeProject} onSettings={() => setSettingsOpen(true)} />
      <main className="main">
        <window.Topbar
          crumbs={crumbs}
          onSettings={() => setSettingsOpen(true)}
          onHome={goHome}
          project={activeProject}
        />
        {view === 'home' && <window.HomeView onOpenProject={openProject} onNew={() => setView('projects')} />}
        {view === 'projects' && <window.ProjectsView onOpenProject={openProject} onNew={() => alert('Crear nuevo proyecto')} />}
        {view === 'budget' && activeProject && (
          <window.BudgetView
            project={activeProject}
            onBack={() => setView('projects')}
            onSettings={() => setSettingsOpen(true)}
            params={params}
            setParams={setParams}
          />
        )}
        {['materials', 'labor', 'equipment', 'subcontracts', 'reports', 'library', 'plans'].includes(view) && (
          <PlaceholderView label={crumbs[crumbs.length - 1]?.label || view} />
        )}
      </main>

      <window.SettingsView open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Tweaks panel */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="Apariencia">
          <window.TweakColor
            label="Color de acento"
            value={t.accent}
            options={['#F59E0B', '#2563EB', '#10B981', '#DC2626', '#7C3AED']}
            onChange={v => setTweak('accent', v)}
          />
          <window.TweakRadio
            label="Sidebar"
            value={t.sidebarStyle}
            options={[
              { value: 'dark', label: 'Oscuro' },
              { value: 'midnight', label: 'Negro' },
              { value: 'light', label: 'Claro' },
            ]}
            onChange={v => setTweak('sidebarStyle', v)}
          />
          <window.TweakSelect
            label="Densidad"
            value={t.density}
            options={[
              { value: 'compact', label: 'Compacta' },
              { value: 'cozy', label: 'Cómoda' },
              { value: 'comfortable', label: 'Confortable' },
            ]}
            onChange={v => setTweak('density', v)}
          />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
}

function PlaceholderView({ label }) {
  return (
    <React.Fragment>
      <div className="page-head">
        <div className="page-head-title">
          <h1>{label}</h1>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>Próximamente</div>
        </div>
      </div>
      <div className="page-body">
        <div className="card empty" style={{ padding: 80 }}>
          <window.I.Sparkles size={32} style={{ color: 'var(--c-text-4)', marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text-2)' }}>Esta sección estará disponible pronto</div>
          <div style={{ marginTop: 4 }}>Mientras tanto puedes consultar tus presupuestos activos.</div>
        </div>
      </div>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
