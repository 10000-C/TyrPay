import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {SceneProgress} from '../components/SceneProgress';

const C = {
  bg: '#050812',
  panel: 'rgba(9, 14, 27, 0.88)',
  text: '#f8fafc',
  muted: '#94a3b8',
  amber: '#f59e0b',
  cyan: '#22d3ee',
  purple: '#8b5cf6',
  emerald: '#10b981',
  blue: '#60a5fa',
};

const stack = [
  ['0G Chain', 'settlement contracts'],
  ['0G Storage', 'proof archive'],
  ['0G teeTLS', 'default proof path'],
  ['zkTLS', 'high-assurance mode'],
];

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const fade = (frame: number, start: number) =>
  interpolate(frame, [start, start + 18], [0, 1], {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export const BuiltOnZeroGClose = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const logoPop = spring({
    frame: frame - 12,
    fps,
    config: {damping: 18, stiffness: 130},
  });

  return (
    <AbsoluteFill style={styles.root}>
      <div style={styles.bgGlow} />
      <ProtocolGrid frame={frame} />

      <header style={styles.topbar}>
        <div style={styles.brand}>
          <div style={styles.mark}>
            <svg viewBox="0 0 24 24" width="30" height="30">
              <path d="M13 2 4 14h7l-1 8 10-13h-7V2Z" fill="currentColor" />
            </svg>
          </div>
          <span>TyrPay</span>
        </div>
        <div style={styles.shotLabel}>Built on 0G</div>
      </header>

      <div
        style={{
          ...styles.heroMark,
          opacity: logoPop,
          transform: `translate(-50%, -50%) scale(${0.86 + logoPop * 0.14})`,
        }}
      >
        <div style={styles.vaultCore}>
          <svg viewBox="0 0 24 24" width="58" height="58">
            <path d="M13 2 4 14h7l-1 8 10-13h-7V2Z" fill="currentColor" />
          </svg>
        </div>
        <div style={styles.orbitOne} />
        <div style={styles.orbitTwo} />
      </div>

      <Img src={staticFile('characters/tyr.svg')} style={{...styles.guide, opacity: fade(frame, 18)}} />

      <section style={styles.titleBlock}>
        <div style={styles.eyebrow}>TyrPay</div>
        <h1 style={styles.h1}>Verifiable Agent settlement on 0G.</h1>
        <p style={styles.lede}>
          TyrPay turns 0G Chain, 0G Storage, and 0G teeTLS into a proof-based settlement layer.
        </p>
      </section>

      <div style={styles.stackGrid}>
        {stack.map(([label, detail], index) => (
          <div key={label} style={{...styles.stackItem, opacity: fade(frame, 38 + index * 12)}}>
            <div style={styles.ok}>OK</div>
            <div>
              <strong style={styles.stackLabel}>{label}</strong>
              <span style={styles.stackDetail}>{detail}</span>
            </div>
          </div>
        ))}
      </div>

      <footer style={{...styles.footer, opacity: fade(frame, 104)}}>
        <span>Next</span>
        <strong>Proof-based reputation for Agent marketplaces.</strong>
      </footer>
      <SceneProgress current={9} />
    </AbsoluteFill>
  );
};

const ProtocolGrid = ({frame}: {frame: number}) => {
  const drift = (frame % 360) * 0.12;
  return <div style={{...styles.grid, backgroundPosition: `${-drift}px ${drift}px`}} />;
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    background: C.bg,
    color: C.text,
    overflow: 'hidden',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  bgGlow: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(circle at 50% 45%, rgba(245,158,11,0.16), transparent 25%), radial-gradient(circle at 65% 48%, rgba(139,92,246,0.22), transparent 34%), radial-gradient(circle at 35% 58%, rgba(34,211,238,0.15), transparent 29%), linear-gradient(180deg, rgba(2,6,23,0.12), rgba(2,6,23,0.96))',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    opacity: 0.22,
    backgroundImage:
      'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
    backgroundSize: '70px 70px',
    maskImage: 'radial-gradient(circle at center, #000 18%, transparent 78%)',
  },
  topbar: {
    position: 'absolute',
    left: 60,
    right: 60,
    top: 44,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, fontWeight: 850},
  mark: {
    width: 54,
    height: 54,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 18,
    color: '#08111f',
    background: `linear-gradient(135deg, #fbbf24, ${C.amber})`,
    boxShadow: '0 0 34px rgba(245,158,11,0.44)',
  },
  shotLabel: {
    padding: '10px 14px',
    border: '1px solid rgba(148,163,184,0.18)',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.72)',
    color: '#dbeafe',
    fontSize: 14,
    fontWeight: 850,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  heroMark: {
    position: 'absolute',
    left: '50%',
    top: '46%',
    zIndex: 4,
    width: 560,
    height: 560,
    borderRadius: 999,
    border: '1px solid rgba(139,92,246,0.20)',
    boxShadow: '0 0 120px rgba(139,92,246,0.14)',
  },
  vaultCore: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 154,
    height: 154,
    display: 'grid',
    placeItems: 'center',
    border: '1px solid rgba(245,158,11,0.44)',
    borderRadius: 38,
    background: 'rgba(69,26,3,0.82)',
    color: '#fde68a',
    transform: 'translate(-50%, -50%)',
    boxShadow: '0 0 64px rgba(245,158,11,0.26)',
  },
  orbitOne: {
    position: 'absolute',
    inset: 74,
    border: '2px solid rgba(34,211,238,0.24)',
    borderRadius: 999,
  },
  orbitTwo: {
    position: 'absolute',
    inset: 132,
    border: '2px solid rgba(139,92,246,0.28)',
    borderRadius: 999,
  },
  guide: {
    position: 'absolute',
    right: 118,
    bottom: 106,
    zIndex: 9,
    width: 280,
    height: 280,
    objectFit: 'contain',
    filter: 'drop-shadow(0 30px 64px rgba(0,0,0,0.48))',
  },
  titleBlock: {
    position: 'absolute',
    left: 92,
    top: 204,
    zIndex: 10,
    width: 720,
  },
  eyebrow: {
    marginBottom: 18,
    color: C.amber,
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
  },
  h1: {
    margin: 0,
    width: 700,
    fontSize: 76,
    lineHeight: 1,
    letterSpacing: 0,
  },
  lede: {
    margin: '26px 0 0',
    width: 650,
    color: '#cbd5e1',
    fontSize: 25,
    lineHeight: 1.42,
  },
  stackGrid: {
    position: 'absolute',
    right: 184,
    top: 248,
    zIndex: 10,
    width: 520,
    display: 'grid',
    gap: 16,
  },
  stackItem: {
    display: 'grid',
    gridTemplateColumns: '52px 1fr',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    border: '1px solid rgba(148,163,184,0.18)',
    borderRadius: 22,
    background: C.panel,
    boxShadow: '0 0 42px rgba(34,211,238,0.08)',
  },
  ok: {
    width: 42,
    height: 42,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 999,
    background: C.emerald,
    color: '#052e16',
    fontSize: 11,
    fontWeight: 950,
  },
  stackLabel: {
    display: 'block',
    color: C.text,
    fontSize: 23,
    lineHeight: 1.1,
  },
  stackDetail: {
    display: 'block',
    marginTop: 6,
    color: '#cbd5e1',
    fontSize: 17,
    lineHeight: 1.2,
  },
  footer: {
    position: 'absolute',
    left: 92,
    right: 462,
    bottom: 78,
    zIndex: 11,
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    padding: '24px 28px',
    border: '1px solid rgba(139,92,246,0.30)',
    borderRadius: 24,
    background: 'rgba(13,20,36,0.92)',
    color: '#dbeafe',
    fontSize: 24,
    boxShadow: '0 0 52px rgba(139,92,246,0.10)',
  },
};
