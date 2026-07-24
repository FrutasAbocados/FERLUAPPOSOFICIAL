'use client';
// ───────────────────────────────────────────────────────────────
// Abocados OS — Login Hero
// Drop-in React component. Pairs with `LoginHero.css` and `motd.ts`.
// Pass `onSubmit` to wire up your auth (Supabase, NextAuth, etc.).
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getMOTD, getGreeting } from './motd';
import './LoginHero.css';

export type LoginHeroProps = {
  /** Logo asset URL. Use the green-tinted PNG shipped in this folder.
   *  Drop the file into /public and pass e.g. "/abocados-logo.png". */
  logoSrc: string;
  /** App version shown in the form header. */
  version?: string;
  /** Called on form submit. Resolve to dismiss loading state; reject to show error. */
  onSubmit?: (credentials: { email: string; password: string }) => Promise<void> | void;
  /** Optional: handler for the Google Workspace SSO button. */
  onGoogleSignIn?: () => Promise<void> | void;
  /** Optional: handler for the "forgot password" link. */
  onForgotPassword?: () => void;
  /** Optional: pre-fill email (e.g. last logged-in user). */
  defaultEmail?: string;
};

export default function LoginHero({
  logoSrc,
  version = 'v2.4.1',
  onSubmit,
  onGoogleSignIn,
  onForgotPassword,
  defaultEmail = '',
}: LoginHeroProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const motd = useMemo(() => getMOTD(), []);
  const greet = useMemo(() => getGreeting(), []);
  const greetParts = useMemo(() => {
    const m = greet.match(/^(.*?)(equipo\.)$/i);
    return m ? { head: m[1], tail: m[2] } : { head: greet, tail: '' };
  }, [greet]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!onSubmit) return;
      setError(null);
      setSubmitting(true);
      try {
        await onSubmit({ email, password });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'No pudimos entrar. Inténtalo de nuevo.');
      } finally {
        setSubmitting(false);
      }
    },
    [email, password, onSubmit]
  );

  return (
    <div className="ab-stage">
      {/* atmospheric layers */}
      <div className="ab-base" />
      <div className="ab-bloom ab-bloom--d" />
      <div className="ab-bloom ab-bloom--a" />
      <div className="ab-bloom ab-bloom--b" />
      <div className="ab-bloom ab-bloom--c" />
      <div className="ab-vignette" />
      <div className="ab-haze" />
      <div className="ab-grain" />

      <Embers count={70} />
      <FloatingAvocados />

      {/* top chrome */}
      <header className="ab-header">
        <div className="ab-brand">
          <div className="ab-brand__mark">A</div>
          <div>
            <div className="ab-brand__name">Abocados OS</div>
            <div className="ab-eyebrow ab-brand__sub">Centro de control</div>
          </div>
        </div>

        <div className="ab-header__status">
          <span className="ab-chip"><span className="ab-dot" /> LIVE</span>
          <span className="ab-chip ab-header__clock"><Clock /></span>
        </div>
      </header>

      {/* hero body */}
      <main className="ab-main">
        {/* fused logo */}
        <div className="ab-logo">
          <div className="ab-logo__halo" />
          <img className="ab-logo__ghost" src={logoSrc} alt="" aria-hidden="true" />
          <div className="ab-logo__wrap">
            <img className="ab-logo__img" src={logoSrc} alt="Frutas Abocados" />
          </div>
        </div>

        {/* greeting + MOTD */}
        <div className="ab-greet-block">
          <h1 className="ab-greet">
            {greetParts.head}
            {greetParts.tail && <span className="ab-greet__accent">{greetParts.tail}</span>}
          </h1>
          <p className="ab-motd">
            <span className="ab-motd__rule ab-motd__rule--left" />
            {motd}
            <span className="ab-motd__rule ab-motd__rule--right" />
          </p>
        </div>

        {/* integrated login */}
        <form className="ab-glass ab-form" onSubmit={handleSubmit} noValidate>
          <div className="ab-form__head">
            <span className="ab-eyebrow" style={{ fontSize: 10 }}>Acceso interno</span>
            <span className="ab-form__meta">{version}</span>
          </div>

          <div>
            <label className="ab-label" htmlFor="ab-email">Email</label>
            <input
              id="ab-email"
              className="ab-field"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@frutasabocados.com"
            />
          </div>

          <div>
            <div className="ab-form__row">
              <label className="ab-label" htmlFor="ab-pw">Contraseña</label>
              {onForgotPassword && (
                <a
                  className="ab-form__forgot"
                  href="#"
                  onClick={(e) => { e.preventDefault(); onForgotPassword(); }}
                >¿la olvidaste?</a>
              )}
            </div>
            <input
              id="ab-pw"
              className="ab-field"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div role="alert" style={{
              fontSize: 12, color: '#fca5a5',
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.25)',
              padding: '8px 12px', borderRadius: 6,
            }}>
              {error}
            </div>
          )}

          <button className="ab-btn" type="submit" disabled={submitting} style={{ marginTop: 6 }}>
            {submitting ? 'Entrando…' : 'Entrar a Abocados OS  →'}
          </button>

          {onGoogleSignIn && (
            <button
              className="ab-btn-ghost"
              type="button"
              onClick={() => onGoogleSignIn()}
              disabled={submitting}
            >
              <span style={{ marginRight: 8 }}>◇</span> Entrar con Google Workspace
            </button>
          )}

          <div className="ab-form__footnote">
            ¿Sin cuenta? Pide acceso a <a href="mailto:luis@frutasabocados.com">Luis</a>.
          </div>
        </form>
      </main>
    </div>
  );
}

// ── Clock ──────────────────────────────────────────────────────
function Clock() {
  const [t, setT] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'][t.getDay()];
  const mon = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'][t.getMonth()];
  return <span>{day} · {pad(t.getDate())} {mon} · {pad(t.getHours())}:{pad(t.getMinutes())}</span>;
}

// ── Embers (rising mint particles) ─────────────────────────────
function pseudoRandom(seed: number) {
  let x = (seed * 1664525 + 1013904223) >>> 0;
  x = (x * 1664525 + 1013904223) >>> 0;
  return x / 4294967296;
}

function Embers({ count = 70 }: { count?: number }) {
  const seeds = useMemo(
    () => Array.from({ length: count }).map((_, i) => ({
      x: pseudoRandom(i + 1) * 100,
      dx: (pseudoRandom(i + 101) - 0.5) * 90,
      dur: 6 + pseudoRandom(i + 201) * 10,
      delay: -pseudoRandom(i + 301) * 16,
      size: 2 + pseudoRandom(i + 401) * 4,
      op: 0.45 + pseudoRandom(i + 501) * 0.55,
    })),
    [count]
  );
  return (
    <>
      {seeds.map((s, i) => (
        <span
          key={i}
          className="ab-ember"
          style={{
            left: `${s.x}%`,
            width: s.size,
            height: s.size,
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
            '--ab-dx': `${s.dx}px`,
            opacity: s.op,
          } as React.CSSProperties & { '--ab-dx': string }}
        />
      ))}
    </>
  );
}

// ── Floating avocados (ambient, "pro") ─────────────────────────
function Avocado({ size = 60 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.34} viewBox="0 0 60 80" aria-hidden="true">
      <path
        d="M30 6 C42 6 52 19 52 42 C52 66 42 76 30 76 C18 76 8 66 8 42 C8 19 18 6 30 6 Z"
        fill="rgba(110, 231, 168, 0.8)"
      />
      <ellipse cx="30" cy="48" rx="8.5" ry="9" fill="rgba(6, 60, 38, 0.9)" />
    </svg>
  );
}

function FloatingAvocados() {
  const items = useMemo<Array<{
    top: string
    left: string
    size: number
    op: number
    dur: number
    delay: number
    dx: number
    dy: number
    r0: number
    r1: number
    blur?: number
  }>>(() => ([
    { top: '6%',  left: '8%',  size: 68, op: 0.10, dur: 62, delay: -10, dx:  40, dy: -70, r0: -12, r1:  18 },
    { top: '11%', left: '88%', size: 54, op: 0.08, dur: 78, delay: -28, dx: -50, dy: -90, r0:  18, r1:  -8 },
    { top: '4%',  left: '52%', size: 42, op: 0.07, dur: 70, delay: -45, dx:  30, dy: 110, r0:   8, r1:  28 },
    { top: '38%', left: '4%',  size: 90, op: 0.09, dur: 90, delay: -20, dx:  80, dy:  60, r0: -28, r1:  14 },
    { top: '46%', left: '94%', size: 76, op: 0.10, dur: 84, delay:  -5, dx: -60, dy:  80, r0:  22, r1: -16 },
    { top: '60%', left: '12%', size: 50, op: 0.07, dur: 72, delay: -35, dx:  40, dy: -80, r0: -10, r1:  20 },
    { top: '68%', left: '90%', size: 60, op: 0.08, dur: 76, delay: -50, dx: -50, dy: -60, r0:  12, r1: -20 },
    { top: '88%', left: '18%', size: 44, op: 0.06, dur: 66, delay: -12, dx:  50, dy: -100, r0: 16, r1: -10 },
    { top: '90%', left: '78%', size: 52, op: 0.07, dur: 70, delay: -40, dx: -40, dy:  -90, r0: -14, r1: 18 },
    { top: '24%', left: '70%', size: 120, op: 0.04, dur: 110, delay: -60, dx: -30, dy: -50, r0: -20, r1: 10, blur: 4 },
    { top: '76%', left: '30%', size: 100, op: 0.04, dur: 100, delay: -80, dx:  40, dy: -40, r0:  18, r1: -12, blur: 3 },
  ]), []);

  return (
    <div className="ab-av-field">
      {items.map((it, i) => (
        <div
          key={i}
          className="ab-av"
          style={{
            top: it.top,
            left: it.left,
            animationDuration: `${it.dur}s`,
            animationDelay: `${it.delay}s`,
            filter: `blur(${it.blur ?? 0.5}px)`,
            '--ab-op': it.op,
            '--ab-dx': `${it.dx}px`,
            '--ab-dy': `${it.dy}px`,
            '--ab-r0': `${it.r0}deg`,
            '--ab-r1': `${it.r1}deg`,
          } as React.CSSProperties & {
            '--ab-op': number
            '--ab-dx': string
            '--ab-dy': string
            '--ab-r0': string
            '--ab-r1': string
          }}
        >
          <Avocado size={it.size} />
        </div>
      ))}
    </div>
  );
}
