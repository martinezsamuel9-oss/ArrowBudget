// ============ COMPONENTES UI GENÉRICOS ============
// Modal, Drawer, Dropdown, StatusBadge, MathInput y hooks compartidos.
// Extraído de MainApp.jsx (paso 2 de la modularización) — sin cambios de lógica.
import { useState, useEffect, useRef, Fragment } from 'react'
import { X } from 'lucide-react'

export function useClickOutside(ref, cb) {
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) cb() }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [cb])
}

const evalMath = str => {
  const s = String(str ?? '').trim()
  if (!s) return 0
  if (/^-?\d+\.?\d*$/.test(s)) return parseFloat(s) || 0
  if (!/^[\d\s\+\-\*\/\.\(\)]+$/.test(s)) return parseFloat(s) || 0
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function('return (' + s + ')')()
    if (typeof result === 'number' && isFinite(result)) return Math.round(result * 1e8) / 1e8
    return 0
  } catch { return parseFloat(s) || 0 }
}

export function MathInput({ value, onChange, className, style, placeholder }) {
  const [raw, setRaw] = useState(String(value ?? 0))
  const [editing, setEditing] = useState(false)

  useEffect(() => { if (!editing) setRaw(String(value ?? 0)) }, [value, editing])

  const commit = () => {
    const result = evalMath(raw)
    setRaw(String(result))
    setEditing(false)
    onChange(result)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      style={style}
      placeholder={placeholder}
      value={raw}
      onFocus={e => { setEditing(true); e.target.select() }}
      onChange={e => setRaw(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
    />
  )
}

export function StatusBadge({ status }) {
  const map = {
    'Activo':      { cls: 'success', dot: 'var(--c-success)' },
    'En revisión': { cls: 'warn',    dot: 'var(--c-warn)' },
    'Borrador':    { cls: '',        dot: 'var(--c-text-3)' },
    'Aprobado':    { cls: 'primary', dot: 'var(--c-primary)' },
    'Rechazado':   { cls: 'danger',  dot: 'var(--c-danger)' },
    'En ejecución':{ cls: '',        dot: '#7c3aed' },
    'Archivado':   { cls: '',        dot: '#94a3b8' },
  }
  const s = map[status] || { cls: '', dot: 'var(--c-text-3)' }
  return (
    <span className={`badge ${s.cls}`}>
      <span className="pip" style={{ background: s.dot }}></span>
      {status || 'Borrador'}
    </span>
  )
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 480 }) {
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

export function Modal({ open, onClose, title, children, footer }) {
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

export function Dropdown({ trigger, children, align = 'right', minWidth = 220 }) {
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
