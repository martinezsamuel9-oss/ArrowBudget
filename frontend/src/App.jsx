// Main App — new design from costos/ + Supabase integration
import { useState, useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import { supabase } from './lib/supabase'
import { Sidebar, Topbar } from './components'
import { mapDBToProject } from './components'
import { HomeView, ProjectsView } from './views/HomeView'
import { BudgetView, SettingsView } from './views/BudgetView'
import './styles.css'

export default function App() {
  const { user, profile, signOut } = useAuth()

  const [view,          setView]          = useState('home')
  const [activeProject, setActiveProject] = useState(null)
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [projects,      setProjects]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [params,        setParams]        = useState({ indirectos: 10, imprevistos: 1, utilidad: 8, impuesto: 15 })

  // Load all projects on mount
  useEffect(() => {
    if (!user) return
    loadProjects()
  }, [user])

  const loadProjects = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('presupuestos')
      .select('*')
      .order('updated_at', { ascending: false })
    if (data) setProjects(data.map((p, i) => mapDBToProject(p, i)))
    setLoading(false)
  }

  const openProject = (p) => {
    setActiveProject(p)
    setParams({
      indirectos:  p.pct_indirectos  ?? 10,
      imprevistos: p.pct_imprevistos ?? 1,
      utilidad:    p.pct_utilidad    ?? 8,
      impuesto:    p.pct_impuesto    ?? 15,
    })
    setView('budget')
  }

  const createProject = async () => {
    const { data, error } = await supabase
      .from('presupuestos')
      .insert({
        user_id:         user.id,
        nombre_proyecto: 'Nuevo Presupuesto',
        cotizante:       profile?.company_name || '',
        cliente:         '',
        lugar:           '',
        moneda:          'USD',
        estado:          'draft',
        revision:        1,
        pct_indirectos:  10,
        pct_imprevistos: 1,
        pct_utilidad:    8,
        pct_impuesto:    15,
        items_json:      [],
      })
      .select()
      .single()

    if (error) { alert('Error al crear proyecto: ' + error.message); return }
    if (data) {
      const newProject = mapDBToProject(data, projects.length)
      setProjects(prev => [newProject, ...prev])
      openProject(newProject)
    }
  }

  // After BudgetView auto-saves, refresh the project in the list
  const handleProjectUpdate = (id, { items, params: newParams }) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== id) return p
      const activities = (items || []).filter(i => i.kind === 'activity')
      const direct  = activities.reduce((s, a) => s + (a.qty || 0) * (a.price || 0), 0)
      const indir   = direct * (newParams.indirectos / 100)
      const imprev  = (direct + indir) * (newParams.imprevistos / 100)
      const sub     = direct + indir + imprev
      const util    = sub * (newParams.utilidad / 100)
      const withU   = sub + util
      const total   = withU + withU * (newParams.impuesto / 100)
      return {
        ...p,
        items,
        total,
        chapters:   (items || []).filter(i => i.kind === 'chapter').length,
        activities: activities.length,
        pct_indirectos:  newParams.indirectos,
        pct_imprevistos: newParams.imprevistos,
        pct_utilidad:    newParams.utilidad,
        pct_impuesto:    newParams.impuesto,
      }
    }))
  }

  const goHome = () => setView('home')

  // Breadcrumbs
  const crumbs = (() => {
    const map = {
      home:         'Inicio',
      projects:     'Proyectos',
      materials:    'Materiales',
      labor:        'Mano de Obra',
      equipment:    'Herramientas / Equipo',
      subcontracts: 'Subcontratos',
      reports:      'Reportes',
      library:      'Biblioteca',
      plans:        'Planes y Facturación',
    }
    if (view === 'home') return [{ label: 'Inicio' }]
    if (view === 'budget' && activeProject) {
      return [
        { label: 'Proyectos', onClick: () => setView('projects') },
        { label: activeProject.name },
      ]
    }
    return [{ label: map[view] || view }]
  })()

  const placeholder = ['materials', 'labor', 'equipment', 'subcontracts', 'reports', 'library', 'plans'].includes(view)

  return (
    <div className="app">
      <Sidebar
        view={view}
        setView={setView}
        project={activeProject}
        onSettings={() => setSettingsOpen(true)}
        user={user}
        company={profile}
      />

      <main className="main">
        <Topbar
          crumbs={crumbs}
          onHome={goHome}
          onSettings={() => setSettingsOpen(true)}
          onSignOut={() => { signOut(); setView('home') }}
        />

        {view === 'home' && (
          <HomeView
            projects={projects}
            user={user}
            company={profile}
            onOpenProject={openProject}
            onNew={(goToList) => goToList === true ? setView('projects') : createProject()}
          />
        )}

        {view === 'projects' && (
          <ProjectsView
            projects={projects}
            loading={loading}
            onOpenProject={openProject}
            onNew={() => createProject()}
          />
        )}

        {view === 'budget' && activeProject && (
          <BudgetView
            project={activeProject}
            params={params}
            setParams={setParams}
            onBack={() => setView('projects')}
            onSettings={() => setSettingsOpen(true)}
            onProjectUpdate={handleProjectUpdate}
          />
        )}

        {placeholder && (
          <PlaceholderView label={crumbs[crumbs.length - 1]?.label || view} />
        )}
      </main>

      <SettingsView
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        profile={profile}
        onSignOut={() => { signOut(); setView('home'); setSettingsOpen(false) }}
      />
    </div>
  )
}

function PlaceholderView({ label }) {
  return (
    <>
      <div className="page-head">
        <div className="page-head-title">
          <h1>{label}</h1>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>Próximamente</div>
        </div>
      </div>
      <div className="page-body">
        <div className="card empty" style={{ padding: 80 }}>
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: 'var(--c-text-4)', marginBottom: 8 }}>
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
          </svg>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text-2)' }}>Esta sección estará disponible pronto</div>
          <div style={{ marginTop: 4 }}>Mientras tanto puedes consultar tus presupuestos activos.</div>
        </div>
      </div>
    </>
  )
}
