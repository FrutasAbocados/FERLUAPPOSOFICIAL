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

      {/* Right cluster: module actions + connection status */}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {actions}

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
      </div>
    </header>
  )
}
