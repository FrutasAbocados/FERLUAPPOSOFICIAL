import { Bell, Command } from 'lucide-react'

interface PageTopbarProps {
  breadcrumb?: string
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function PageTopbar({ breadcrumb, title, subtitle, actions }: PageTopbarProps) {
  return (
    <header
      style={{
        padding: '28px 36px 22px',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        minWidth: 0,
        flexWrap: 'wrap',
      }}
    >
      {/* Left: breadcrumb + title + subtitle */}
      <div style={{ minWidth: 0 }}>
        {breadcrumb && (
          <div className="micro-caps" style={{ color: 'var(--ink-mute)', marginBottom: 6 }}>
            {breadcrumb}
          </div>
        )}
        <h1
          style={{
            margin: 0,
            fontSize: 32,
            fontWeight: 500,
            letterSpacing: '-0.025em',
            color: 'var(--ink)',
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-dim)' }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Right cluster: module actions + bell + sync + ⌘K */}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {actions}

        <button
          type="button"
          style={{
            width: 34, height: 34,
            borderRadius: 'var(--radius)',
            display: 'grid', placeItems: 'center',
            background: 'rgba(255,255,255,.02)',
            border: '1px solid var(--line)',
            color: 'var(--ink-mute)',
            cursor: 'pointer',
          }}
          aria-label="Notificaciones"
        >
          <Bell size={15} strokeWidth={1.6} />
        </button>

        {/* Sync status pill */}
        <div
          className="flex items-center gap-1.5"
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--line)',
            background: 'rgba(255,255,255,.02)',
            fontSize: 11,
            color: 'var(--ink-dim)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--mint)',
              boxShadow: '0 0 8px var(--mint)',
              display: 'inline-block',
              animation: 'ping 1.4s ease-in-out infinite',
              flexShrink: 0,
            }}
          />
          LIVE
        </div>

        {/* ⌘K primary pill */}
        <button
          type="button"
          className="flex items-center gap-1.5"
          style={{
            padding: '8px 14px',
            borderRadius: 'var(--radius)',
            background: 'var(--mint)',
            color: '#0a1310',
            fontWeight: 600,
            fontSize: 12,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 14px var(--mint-glow)',
            transition: 'transform .15s ease, box-shadow .15s ease',
          }}
          aria-label="Buscar (⌘K)"
        >
          <Command size={13} strokeWidth={2} />
          <span className="mono" style={{ fontSize: 11 }}>⌘K</span>
        </button>
      </div>
    </header>
  )
}
