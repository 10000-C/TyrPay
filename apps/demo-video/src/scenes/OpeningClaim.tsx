import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {SceneProgress} from '../components/SceneProgress';

const C = {
  bg: '#050812',
  panel: 'rgba(9, 14, 27, 0.78)',
  panelStrong: 'rgba(13, 20, 36, 0.92)',
  text: '#f8fafc',
  muted: '#94a3b8',
  amber: '#f59e0b',
  cyan: '#22d3ee',
  blue: '#60a5fa',
  rose: '#f43f5e',
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

export const OpeningClaim = () => {
  const frame = useCurrentFrame();

  const buyerX = interp(frame, [0, 42], [-260, 0]);
  const buyerOpacity = interp(frame, [0, 20], [0, 1]);
  const taskOpacity = interp(frame, [22, 48], [0, 1]);
  const tokenOpacity = interp(frame, [34, 58], [0, 1]);
  const bubbleOpacity = interpolate(frame, [50, 66], [0, 1], {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const bubbleScale = interp(frame, [50, 66], [0.92, 1]);
  const scanProgress = interp(frame, [92, 160], [0, 1]);
  const questionOpacity = interp(frame, [134, 172], [0, 1]);

  return (
    <AbsoluteFill style={styles.root}>
      <div style={styles.bgGlow} />
      <ProtocolGrid frame={frame} />

      <header style={styles.topbar}>
        <div style={styles.brand}>
          <div style={styles.mark}>
            <Img src={staticFile('logo.png')} style={{width: 30, height: 30, objectFit: 'contain'}} />
          </div>
          <span>TyrPay</span>
        </div>
      </header>

      <section style={styles.titleBlock}>
        <div style={styles.eyebrow}>0G Hackathon Demo Film</div>
        <h1 style={styles.h1}>A seller says "done."</h1>
        <p style={styles.lede}>But the buyer can only see the result, not the execution.</p>
      </section>

      <div
        style={{
          ...styles.buyerWrap,
          opacity: buyerOpacity,
          transform: `translateX(${buyerX}px)`,
        }}
      >
        <div style={styles.buyerAura} />
        <Img src={staticFile('characters/buyer.svg')} style={styles.buyer} />
        <div style={styles.buyerLabel}>Buyer</div>
      </div>

      <TaskCard opacity={taskOpacity} frame={frame} />
      <TokenChip opacity={tokenOpacity} frame={frame} />

      <div
        style={{
          ...styles.sellerBubble,
          opacity: bubbleOpacity,
          transform: `translateY(${interp(frame, [50, 66], [22, 0])}px) scale(${bubbleScale})`,
        }}
      >
        <span style={styles.bubbleLabel}>Seller Agent</span>
        <strong style={styles.done}>Done.</strong>
      </div>

      <div
        style={{
          ...styles.scanBeam,
          opacity: scanProgress > 0 && scanProgress < 1 ? 0.78 : 0,
          transform: `translateX(${interpolate(scanProgress, [0, 1], [0, 650])}px)`,
        }}
      />

      <div style={{...styles.unknownPanel, opacity: questionOpacity}}>
        <span style={styles.unknownKicker}>Execution visibility</span>
        <strong style={styles.unknownTitle}>Unknown</strong>
        <p style={styles.unknownText}>Model call, API path, usage, and response origin are still hidden.</p>
      </div>

      <SceneProgress current={0} />
    </AbsoluteFill>
  );
};

const ProtocolGrid = ({frame}: {frame: number}) => {
  const drift = (frame % 240) * 0.22;
  return (
    <div
      style={{
        ...styles.grid,
        backgroundPosition: `${-drift}px ${drift}px`,
      }}
    />
  );
};

const TaskCard = ({opacity, frame}: {opacity: number; frame: number}) => (
  <div
    style={{
      ...styles.taskCard,
      opacity,
      transform: `translateY(${interp(frame, [22, 48], [22, 0])}px) rotate(-2deg)`,
    }}
  >
    <span style={styles.cardKicker}>Task Card</span>
    <strong style={styles.cardTitle}>API-backed research</strong>
    <div style={styles.cardRows}>
      <span>deadline</span>
      <b>8 min</b>
      <span>budget</span>
      <b>120 USDC</b>
      <span>needs</span>
      <b>verifiable call</b>
    </div>
  </div>
);

const TokenChip = ({opacity, frame}: {opacity: number; frame: number}) => {
  const lift = Math.sin(frame / 11) * 8;
  return (
    <div
      style={{
        ...styles.token,
        opacity,
        transform: `translateY(${lift}px)`,
      }}
    >
      <span style={styles.tokenCore}>$</span>
      <span style={styles.tokenLabel}>payment ready</span>
    </div>
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
      'radial-gradient(circle at 22% 62%, rgba(96,165,250,0.16), transparent 32%), radial-gradient(circle at 73% 42%, rgba(244,63,94,0.12), transparent 26%), radial-gradient(circle at 45% 48%, rgba(34,211,238,0.10), transparent 36%), linear-gradient(180deg, rgba(2,6,23,0.3), rgba(2,6,23,0.9))',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    opacity: 0.26,
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 8,
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
  titleBlock: {
    position: 'absolute',
    left: 68,
    top: 146,
    width: 700,
    zIndex: 6,
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
    fontSize: 86,
    lineHeight: 0.96,
    letterSpacing: '-0.065em',
  },
  lede: {
    margin: '24px 0 0',
    width: 560,
    color: '#cbd5e1',
    fontSize: 26,
    lineHeight: 1.42,
  },
  buyerWrap: {
    position: 'absolute',
    left: 124,
    bottom: 224,
    width: 438,
    height: 438,
    zIndex: 4,
  },
  buyerAura: {
    position: 'absolute',
    left: 44,
    right: 44,
    bottom: 22,
    height: 106,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(96,165,250,0.28), transparent 65%)',
    filter: 'blur(6px)',
  },
  buyer: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 34px 60px rgba(0,0,0,0.46))',
  },
  buyerLabel: {
    position: 'absolute',
    left: 88,
    top: -12,
    padding: '8px 12px',
    border: '1px solid rgba(34,211,238,0.30)',
    borderRadius: 999,
    background: 'rgba(8,47,73,0.82)',
    color: '#cffafe',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  taskCard: {
    position: 'absolute',
    left: 522,
    top: 480,
    zIndex: 7,
    width: 322,
    padding: 22,
    border: '1px solid rgba(96,165,250,0.28)',
    borderRadius: 22,
    background: C.panelStrong,
    boxShadow: '0 28px 90px rgba(0,0,0,0.32)',
  },
  cardKicker: {
    display: 'block',
    marginBottom: 8,
    color: C.blue,
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  cardTitle: {
    display: 'block',
    marginBottom: 18,
    color: C.text,
    fontSize: 25,
    lineHeight: 1.05,
  },
  cardRows: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '8px 18px',
    color: C.muted,
    fontSize: 15,
  },
  token: {
    position: 'absolute',
    left: 625,
    bottom: 238,
    zIndex: 7,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '12px 16px 12px 12px',
    border: '1px solid rgba(245,158,11,0.34)',
    borderRadius: 999,
    background: 'rgba(24,18,6,0.84)',
    boxShadow: '0 0 34px rgba(245,158,11,0.22)',
  },
  tokenCore: {
    width: 48,
    height: 48,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 999,
    color: '#08111f',
    background: C.amber,
    fontSize: 28,
    fontWeight: 950,
  },
  tokenLabel: {
    color: '#fde68a',
    fontSize: 15,
    fontWeight: 850,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  sellerBubble: {
    position: 'absolute',
    right: 188,
    top: 244,
    zIndex: 7,
    width: 390,
    padding: '24px 28px',
    borderRadius: '26px 26px 8px 26px',
    background: 'rgba(248,250,252,0.96)',
    color: '#0f172a',
    boxShadow: '0 30px 100px rgba(0,0,0,0.42)',
  },
  bubbleLabel: {
    display: 'block',
    marginBottom: 8,
    color: '#475569',
    fontSize: 14,
    fontWeight: 950,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
  },
  done: {
    fontSize: 78,
    lineHeight: 0.95,
    letterSpacing: '-0.06em',
  },
  scanBeam: {
    position: 'absolute',
    left: 470,
    top: 310,
    zIndex: 6,
    width: 4,
    height: 430,
    borderRadius: 999,
    background: `linear-gradient(180deg, transparent, ${C.cyan}, transparent)`,
    boxShadow: '0 0 36px rgba(34,211,238,0.88)',
  },
  unknownPanel: {
    position: 'absolute',
    right: 170,
    bottom: 260,
    zIndex: 7,
    width: 420,
    padding: 24,
    border: '1px solid rgba(244,63,94,0.28)',
    borderRadius: 24,
    background: 'rgba(28,12,22,0.78)',
    boxShadow: '0 0 60px rgba(244,63,94,0.13)',
  },
  unknownKicker: {
    display: 'block',
    marginBottom: 8,
    color: '#fecdd3',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  unknownTitle: {
    display: 'block',
    marginBottom: 10,
    color: C.rose,
    fontSize: 44,
    lineHeight: 1,
  },
  unknownText: {
    margin: 0,
    color: '#e2e8f0',
    fontSize: 20,
    lineHeight: 1.35,
  },
  caption: {
    position: 'absolute',
    left: 64,
    right: 64,
    bottom: 42,
    zIndex: 8,
    display: 'grid',
    gridTemplateColumns: '0.9fr 1.25fr',
    gap: 22,
    alignItems: 'stretch',
  },
  captionText: {
    display: 'flex',
    alignItems: 'center',
    padding: '24px 28px',
    border: '1px solid rgba(34,211,238,0.26)',
    borderRadius: 24,
    background: C.panelStrong,
    color: C.text,
    fontSize: 32,
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
    fontSize: 22,
    fontWeight: 650,
    lineHeight: 1.32,
  },
};
