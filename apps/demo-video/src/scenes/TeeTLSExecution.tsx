import React from 'react';
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
  panel: 'rgba(9, 14, 27, 0.84)',
  panelStrong: 'rgba(13, 20, 36, 0.94)',
  text: '#f8fafc',
  muted: '#94a3b8',
  amber: '#f59e0b',
  cyan: '#22d3ee',
  purple: '#8b5cf6',
  emerald: '#10b981',
  blue: '#60a5fa',
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const interp = (
  frame: number,
  input: [number, number],
  output: [number, number],
) =>
  interpolate(frame, input, output, {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const fade = (frame: number, start: number) =>
  interpolate(frame, [start, start + 16], [0, 1], {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const receiptRows = [
  ['provider', 'matched'],
  ['request hash', '0x91...a7'],
  ['response hash', '0x4e...2d'],
];

export const TeeTLSExecution = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const sellerIn = interp(frame, [10, 50], [70, 0]);
  const requestProgress = interp(frame, [84, 190], [0, 1]);
  const responseProgress = interp(frame, [190, 292], [0, 1]);
  const tunnelGlow = spring({
    frame: frame - 116,
    fps,
    config: {damping: 22, stiffness: 110},
  });
  const receiptPop = spring({
    frame: frame - 278,
    fps,
    config: {damping: 18, stiffness: 140},
  });
  const seals = fade(frame, 316);
  const zkOpacity = fade(frame, 346);
  const captionOpacity = fade(frame, 360);

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
        <div style={styles.shotLabel}>Scene 06 / 0G teeTLS</div>
      </header>

      <section style={styles.titleBlock}>
        <div style={styles.eyebrow}>Default Proof Path</div>
        <h1 style={styles.h1}>0G teeTLS proves the call.</h1>
        <p style={styles.lede}>The seller executes through the native proof path before settlement can happen.</p>
      </section>

      <div
        style={{
          ...styles.sellerWrap,
          opacity: fade(frame, 0),
          transform: `translateX(${sellerIn}px)`,
        }}
      >
        <Img src={staticFile('characters/honest_seller.svg')} style={styles.seller} />
        <div style={styles.sellerLabel}>Honest Seller</div>
      </div>

      <ProviderWorld frame={frame} />

      <TeeTLSTunnel glow={tunnelGlow} />
      <ExecutionPaths request={requestProgress} response={responseProgress} />

      <div
        style={{
          ...styles.receipt,
          opacity: receiptPop,
          transform: `translateY(${interpolate(receiptPop, [0, 1], [22, 0])}px) scale(${0.88 + receiptPop * 0.12})`,
        }}
      >
        <span style={styles.receiptKicker}>teeTLS Receipt</span>
        <strong style={styles.receiptTitle}>Signed execution trace</strong>
        <div style={styles.receiptRows}>
          {receiptRows.map(([label, value], index) => (
            <React.Fragment key={label}>
              <span>{label}</span>
              <b style={{opacity: seals, color: index === 0 ? '#bbf7d0' : '#cffafe'}}>{value}</b>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div style={{...styles.zkToggle, opacity: zkOpacity}}>
        <span>Advanced Mode</span>
        <strong>zkTLS</strong>
        <em>stricter cryptographic proof</em>
      </div>

      <footer style={{...styles.caption, opacity: captionOpacity}}>
        <span style={styles.captionText}>Default Proof Path: 0G teeTLS.</span>
        <span style={styles.voiceover}>
          Now the seller executes through TyrPay's default proof path: 0G teeTLS. The call produces a signed receipt
          bound to the provider, the request hash, and the response hash.
        </span>
      </footer>
      <SceneProgress current={5} />
    </AbsoluteFill>
  );
};

const ProviderWorld = ({frame}: {frame: number}) => (
  <div style={styles.provider}>
    <span style={styles.providerKicker}>Model / API Provider</span>
    <div style={styles.providerCore}>
      <div
        style={{
          ...styles.providerRing,
          transform: `translate(-50%, -50%) rotate(${frame * 1.8}deg)`,
        }}
      />
      <strong>API</strong>
    </div>
    <div style={styles.providerRows}>
      <span>endpoint</span>
      <b>/v1/model-call</b>
      <span>identity</span>
      <b>provider verified</b>
    </div>
  </div>
);

const TeeTLSTunnel = ({glow}: {glow: number}) => (
  <div style={styles.tunnelWrap}>
    <div style={{...styles.tunnel, boxShadow: `0 0 ${60 + glow * 44}px rgba(34,211,238,${0.18 + glow * 0.22})`}}>
      <span style={styles.tunnelLabel}>0G teeTLS Proof Path</span>
      <div style={styles.teeShield}>TEE</div>
    </div>
  </div>
);

const ExecutionPaths = ({request, response}: {request: number; response: number}) => {
  const requestDash = 980 * (1 - request);
  const responseDash = 980 * (1 - response);

  return (
    <svg style={styles.pathSvg} viewBox="0 0 1920 1080">
      <defs>
        <linearGradient id="requestGradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={C.emerald} />
          <stop offset="50%" stopColor={C.cyan} />
          <stop offset="100%" stopColor={C.purple} />
        </linearGradient>
        <linearGradient id="responseGradient" x1="1" x2="0" y1="0" y2="0">
          <stop offset="0%" stopColor={C.purple} />
          <stop offset="50%" stopColor={C.cyan} />
          <stop offset="100%" stopColor={C.amber} />
        </linearGradient>
        <marker id="requestArrow" markerHeight="28" markerUnits="userSpaceOnUse" markerWidth="36" orient="auto" refX="32" refY="14">
          <path d="M0,0 L36,14 L0,28 Z" fill={C.cyan} />
        </marker>
        <marker id="responseArrow" markerHeight="28" markerUnits="userSpaceOnUse" markerWidth="36" orient="auto" refX="32" refY="14">
          <path d="M0,0 L36,14 L0,28 Z" fill={C.amber} />
        </marker>
      </defs>
      <path
        d="M470 610 C710 548 948 494 1121 477 C1262 454 1348 318 1438 302"
        fill="none"
        stroke="url(#requestGradient)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray="980"
        strokeDashoffset={requestDash}
        markerEnd="url(#requestArrow)"
        opacity={0.82 * request}
        style={{filter: 'drop-shadow(0 0 14px rgba(34,211,238,0.62))'}}
      />
      <path
        d="M1450 350 C1346 394 1236 448 1121 477 C974 514 838 592 704 664"
        fill="none"
        stroke="url(#responseGradient)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="980"
        strokeDashoffset={responseDash}
        markerEnd="url(#responseArrow)"
        opacity={0.78 * response}
        style={{filter: 'drop-shadow(0 0 14px rgba(245,158,11,0.48))'}}
      />
      <circle cx="1121" cy="477" r="12" fill={C.cyan} opacity={0.28 + request * 0.38} />
      <circle cx="1438" cy="302" r="10" fill={C.purple} opacity={0.18 + request * 0.42} />
    </svg>
  );
};

const ProtocolGrid = ({frame}: {frame: number}) => {
  const drift = (frame % 360) * 0.14;
  return (
    <div
      style={{
        ...styles.grid,
        backgroundPosition: `${-drift}px ${drift}px`,
      }}
    />
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    background: C.bg,
    color: C.text,
    overflow: 'hidden',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  bgGlow: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(circle at 53% 48%, rgba(34,211,238,0.16), transparent 32%), radial-gradient(circle at 72% 34%, rgba(139,92,246,0.18), transparent 30%), radial-gradient(circle at 23% 60%, rgba(16,185,129,0.10), transparent 27%), linear-gradient(180deg, rgba(2,6,23,0.26), rgba(2,6,23,0.92))',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    opacity: 0.22,
    backgroundImage:
      'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
    backgroundSize: '70px 70px',
    maskImage: 'radial-gradient(circle at center, #000 20%, transparent 78%)',
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
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    fontSize: 30,
    fontWeight: 850,
  },
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
  titleBlock: {
    position: 'absolute',
    left: 68,
    top: 148,
    width: 640,
    zIndex: 7,
  },
  eyebrow: {
    marginBottom: 18,
    color: C.cyan,
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
  },
  h1: {
    margin: 0,
    fontSize: 72,
    lineHeight: 1,
    letterSpacing: 0,
  },
  lede: {
    margin: '24px 0 0',
    width: 560,
    color: '#cbd5e1',
    fontSize: 24,
    lineHeight: 1.42,
  },
  sellerWrap: {
    position: 'absolute',
    left: 118,
    bottom: 224,
    width: 350,
    height: 350,
    zIndex: 5,
  },
  seller: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 30px 58px rgba(0,0,0,0.44))',
  },
  sellerLabel: {
    position: 'absolute',
    left: 82,
    top: -10,
    padding: '8px 12px',
    border: '1px solid rgba(16,185,129,0.32)',
    borderRadius: 999,
    background: 'rgba(5,46,22,0.68)',
    color: '#bbf7d0',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  provider: {
    position: 'absolute',
    right: 94,
    top: 178,
    zIndex: 7,
    width: 430,
    padding: 24,
    border: '1px solid rgba(139,92,246,0.32)',
    borderRadius: 24,
    background: 'rgba(24,18,43,0.76)',
    boxShadow: '0 0 58px rgba(139,92,246,0.16)',
  },
  providerKicker: {
    display: 'block',
    marginBottom: 16,
    color: '#ddd6fe',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  providerCore: {
    position: 'relative',
    width: 128,
    height: 128,
    display: 'grid',
    placeItems: 'center',
    marginBottom: 18,
    borderRadius: 999,
    background: 'rgba(15,23,42,0.82)',
    color: '#cffafe',
    fontSize: 36,
    fontWeight: 950,
  },
  providerRing: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 104,
    height: 104,
    border: `8px solid ${C.purple}`,
    borderRadius: 999,
    borderTopColor: C.cyan,
    boxShadow: '0 0 34px rgba(139,92,246,0.56)',
  },
  providerRows: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '8px 18px',
    color: C.muted,
    fontSize: 15,
  },
  tunnelWrap: {
    position: 'absolute',
    left: 570,
    top: 374,
    width: 650,
    height: 238,
    zIndex: 6,
  },
  tunnel: {
    position: 'absolute',
    inset: 0,
    border: '1px solid rgba(34,211,238,0.34)',
    borderRadius: 999,
    background:
      'linear-gradient(90deg, rgba(16,185,129,0.10), rgba(34,211,238,0.16), rgba(139,92,246,0.12))',
  },
  tunnelLabel: {
    position: 'absolute',
    left: 54,
    top: 26,
    color: '#cffafe',
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
  },
  teeShield: {
    position: 'absolute',
    right: 52,
    top: 56,
    width: 94,
    height: 94,
    display: 'grid',
    placeItems: 'center',
    border: '2px solid rgba(34,211,238,0.68)',
    borderRadius: '50% 50% 44% 44%',
    background: 'rgba(2,6,23,0.68)',
    color: '#cffafe',
    fontSize: 24,
    fontWeight: 950,
    letterSpacing: '0.1em',
    boxShadow: '0 0 38px rgba(34,211,238,0.36)',
  },
  pathSvg: {
    position: 'absolute',
    inset: 0,
    zIndex: 11,
    pointerEvents: 'none',
  },
  receipt: {
    position: 'absolute',
    left: 702,
    top: 642,
    zIndex: 12,
    width: 430,
    padding: 22,
    border: '1px solid rgba(34,211,238,0.36)',
    borderRadius: 22,
    background: C.panelStrong,
    boxShadow: '0 34px 90px rgba(0,0,0,0.34), 0 0 40px rgba(34,211,238,0.12)',
  },
  receiptKicker: {
    display: 'block',
    marginBottom: 8,
    color: C.cyan,
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  receiptTitle: {
    display: 'block',
    marginBottom: 18,
    color: C.text,
    fontSize: 25,
    lineHeight: 1.08,
  },
  receiptRows: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '9px 18px',
    color: C.muted,
    fontSize: 15,
  },
  zkToggle: {
    position: 'absolute',
    right: 126,
    bottom: 238,
    zIndex: 12,
    width: 360,
    display: 'grid',
    gap: 6,
    padding: 18,
    border: '1px solid rgba(96,165,250,0.34)',
    borderRadius: 20,
    background: 'rgba(15,23,42,0.86)',
    boxShadow: '0 0 44px rgba(96,165,250,0.14)',
  },
  caption: {
    position: 'absolute',
    left: 64,
    right: 64,
    bottom: 42,
    zIndex: 15,
    display: 'grid',
    gridTemplateColumns: '0.9fr 1.25fr',
    gap: 22,
    alignItems: 'stretch',
  },
  captionText: {
    display: 'flex',
    alignItems: 'center',
    padding: '24px 28px',
    border: '1px solid rgba(34,211,238,0.30)',
    borderRadius: 24,
    background: 'rgba(13,20,36,0.94)',
    color: C.text,
    fontSize: 31,
    fontWeight: 900,
    lineHeight: 1.08,
  },
  voiceover: {
    display: 'flex',
    alignItems: 'center',
    padding: '24px 28px',
    border: '1px solid rgba(148,163,184,0.18)',
    borderRadius: 24,
    background: C.panel,
    color: '#cbd5e1',
    fontSize: 21,
    fontWeight: 650,
    lineHeight: 1.32,
  },
};
