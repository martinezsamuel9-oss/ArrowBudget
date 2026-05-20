import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider, useAuth } from './context/AuthContext'
import App from './App'
import LoginPage from './pages/LoginPage'
// styles.css is imported inside App.jsx

function Root() {
  const { user, loading } = useAuth()

  if (loading) {
    // Inline loading screen — styles.css not loaded yet at this point,
    // so use inline styles for the spinner
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 14, background: '#F5F7FA',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid #E4E8EF',
          borderTopColor: '#F59E0B', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 13, color: '#8693A8' }}>Cargando Arrow Budget…</div>
      </div>
    )
  }

  return user ? <App /> : <LoginPage />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
)
