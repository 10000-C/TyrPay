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
  panel: 'rgba(9, 14, 27, 0.82)',
  panelStrong: 'rgba(13, 20, 36, 0.94)',
  text: '#f8fafc',
  muted: '#94a3b8',
  amber: '#f59e0b',
  cyan: '#22d3ee',
  blue: '#60a5fa',
  rose: '#f43f5e',
  purple: '#8b5cf6',
  emerald: '#10b981',
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

const reveal = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, start + 12], [0, 1], {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const riskCards = [
  {label: 'Cheap Model', detail: 'lower-cost shortcut', color: C.purple, start: 62},
  {label: 'Fake Log', detail: 'claim without trace', color: C.rose, start: 96},
  {label: 'Reused Response', detail: 'old output replayed', color: C.amber, start: 130},
  {label: 'Old Proof Replay', detail: 'proof from another task', color: C.blue, start: 164},
];

export const RiskReveal = () => {
  const frame = useCurrentFrame();

  const buyerOpacity = reveal(frame, 0, 240);
  const splitProgress = interp(frame, [28, 70], [0, 1]);
  const honestOpacity = reveal(frame, 34, 192) * 0.42;
  const evilOpacity = reveal(frame, 42, 256);
  const tokenThreat = interp(frame, [170, 232], [0, 1]);
  const warningOpacity = reveal(frame, 184, 268);

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
        <div style={styles.eyebrow}>Agent transaction risk</div>
        <h1 style={styles.h1}>Claim ≠ fulfillment</h1>
        <p style={styles.lede}>The buyer cannot distinguish real execution from a convincing shortcut.</p>
      </section>

      <div style={{...styles.buyerWrap, opacity: buyerOpacity}}>
        <Img src={staticFile('characters/buyer.svg')} style={styles.buyer} />
        <div style={styles.buyerLabel}>Buyer</div>
      </div>

      <div
        style={{
          ...styles.token,
          transform: `translate(${interpolate(tokenThreat, [0, 1], [0, 78])}px, ${Math.sin(frame / 11) * 6}px)`,
        }}
      >
        <span style={styles.tokenCore}>$</span>
        <span style={styles.tokenLabel}>buyer token</span>
      </div>

      <div
        style={{
          ...styles.splitLine,
          opacity: splitProgress,
          transform: `scaleY(${splitProgress})`,
        }}
      />

      <div
        style={{
          ...styles.honestWrap,
          opacity: honestOpacity,
          transform: `translateX(${interp(frame, [34, 82], [40, 0])}px) scale(0.78)`,
        }}
      >
        <div style={styles.honestLabel}>Honest Seller</div>
        <Img src={staticFile('characters/honest_seller.svg')} style={styles.sellerSvg} />
      </div>

      <div
        style={{
          ...styles.evilWrap,
          opacity: evilOpacity,
          transform: `translate(${interp(frame, [42, 104], [90, -8]) + tokenThreat * -36}px, ${
            Math.sin(frame / 5) * 2
          }px) scale(${interp(frame, [42, 104], [0.86, 1])})`,
          filter: `drop-shadow(${Math.sin(frame / 3) * 4}px 0 24px rgba(244,63,94,0.38))`,
        }}
      >
        <div style={styles.evilLabel}>Evil Seller</div>
        <Img src={staticFile('characters/evil_seller.svg')} style={styles.sellerSvg} />
      </div>

      <div style={styles.cardStack}>
        {riskCards.map((card, index) => {
          const opacity = reveal(frame, card.start, 230);
          return (
            <RiskCard
              key={card.label}
              label={card.label}
              detail={card.detail}
              color={card.color}
              opacity={opacity}
              x={index % 2 === 0 ? 0 : 300}
              y={Math.floor(index / 2) * 126}
              frame={frame}
              start={card.start}
            />
          );
        })}
      </div>

      <div style={{...styles.warningPanel, opacity: warningOpacity}}>
        <span style={styles.warningKicker}>Buyer scanner</span>
        <strong style={styles.warningTitle}>Cannot verify execution</strong>
        <p style={styles.warningText}>The output exists, but the model/API path is still unproven.</p>
      </div>

      <SceneProgress current={1} />
    </AbsoluteFill>
  );
};

const RiskCard = ({
  label,
  detail,
  color,
  opacity,
  x,
  y,
  frame,
  start,
}: {
  label: string;
  detail: string;
  color: string;
  opacity: number;
  x: number;
  y: number;
  frame: number;
  start: number;
}) => {
  const entry = interp(frame, [start, start + 18], [18, 0]);
  const pulse = 0.18 + Math.sin((frame - start) / 8) * 0.05;

  return (
    <div
      style={{
        ...styles.riskCard,
        left: x,
        top: y,
        opacity,
        transform: `translateY(${entry}px)`,
        borderColor: `${color}66`,
        boxShadow: `0 0 42px ${color}${Math.round(pulse * 255)
          .toString(16)
          .padStart(2, '0')}`,
      }}
    >
      <div style={{...styles.riskIcon, background: `${color}22`, color}}>!</div>
      <div>
        <strong style={{...styles.riskLabel, color}}>{label}</strong>
        <span style={styles.riskDetail}>{detail}</span>
      </div>
    </div>
  );
};

const ProtocolGrid = ({frame}: {frame: number}) => {
  const drift = (frame % 240) * 0.2;
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
      'radial-gradient(circle at 21% 60%, rgba(96,165,250,0.13), transparent 31%), radial-gradient(circle at 72% 49%, rgba(244,63,94,0.18), transparent 31%), radial-gradient(circle at 58% 38%, rgba(139,92,246,0.14), transparent 30%), linear-gradient(180deg, rgba(2,6,23,0.28), rgba(2,6,23,0.92))',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    opacity: 0.23,
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
    top: 148,
    width: 690,
    zIndex: 6,
  },
  eyebrow: {
    marginBottom: 18,
    color: C.rose,
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
  },
  h1: {
    margin: 0,
    fontSize: 90,
    lineHeight: 0.96,
    letterSpacing: '-0.067em',
  },
  lede: {
    margin: '24px 0 0',
    width: 600,
    color: '#cbd5e1',
    fontSize: 26,
    lineHeight: 1.42,
  },
  buyerWrap: {
    position: 'absolute',
    left: 128,
    bottom: 225,
    width: 410,
    height: 410,
    zIndex: 4,
  },
  buyer: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 34px 60px rgba(0,0,0,0.46))',
  },
  buyerLabel: {
    position: 'absolute',
    left: 88,
    bottom: -8,
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
  token: {
    position: 'absolute',
    left: 556,
    bottom: 312,
    zIndex: 9,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '12px 16px 12px 12px',
    border: '1px solid rgba(245,158,11,0.34)',
    borderRadius: 999,
    background: 'rgba(24,18,6,0.86)',
    boxShadow: '0 0 36px rgba(245,158,11,0.24)',
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
  splitLine: {
    position: 'absolute',
    left: '50%',
    top: 190,
    bottom: 220,
    width: 2,
    zIndex: 3,
    transformOrigin: 'center top',
    background: 'linear-gradient(180deg, transparent, rgba(148,163,184,0.42), transparent)',
    boxShadow: '0 0 28px rgba(139,92,246,0.32)',
  },
  honestWrap: {
    position: 'absolute',
    right: 420,
    top: 240,
    width: 360,
    height: 360,
    zIndex: 4,
  },
  evilWrap: {
    position: 'absolute',
    right: 120,
    top: 210,
    width: 430,
    height: 430,
    zIndex: 5,
  },
  sellerSvg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  honestLabel: {
    position: 'absolute',
    left: 58,
    top: -26,
    color: '#bbf7d0',
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  evilLabel: {
    position: 'absolute',
    left: 82,
    top: -22,
    color: '#fecdd3',
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  cardStack: {
    position: 'absolute',
    left: 720,
    top: 468,
    zIndex: 8,
    width: 600,
    height: 260,
  },
  riskCard: {
    position: 'absolute',
    width: 270,
    minHeight: 96,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    border: '1px solid',
    borderRadius: 20,
    background: C.panelStrong,
  },
  riskIcon: {
    width: 42,
    height: 42,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 14,
    fontSize: 24,
    fontWeight: 950,
  },
  riskLabel: {
    display: 'block',
    marginBottom: 4,
    fontSize: 19,
    lineHeight: 1,
  },
  riskDetail: {
    color: '#cbd5e1',
    fontSize: 15,
    fontWeight: 650,
  },
  warningPanel: {
    position: 'absolute',
    right: 118,
    bottom: 244,
    zIndex: 9,
    width: 470,
    padding: 24,
    border: '1px solid rgba(244,63,94,0.3)',
    borderRadius: 24,
    background: 'rgba(28,12,22,0.82)',
    boxShadow: '0 0 60px rgba(244,63,94,0.16)',
  },
  warningKicker: {
    display: 'block',
    marginBottom: 8,
    color: '#fecdd3',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  warningTitle: {
    display: 'block',
    marginBottom: 10,
    color: C.rose,
    fontSize: 38,
    lineHeight: 1,
  },
  warningText: {
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
    zIndex: 10,
    display: 'grid',
    gridTemplateColumns: '0.9fr 1.25fr',
    gap: 22,
    alignItems: 'stretch',
  },
  captionText: {
    display: 'flex',
    alignItems: 'center',
    padding: '24px 28px',
    border: '1px solid rgba(244,63,94,0.28)',
    borderRadius: 24,
    background: C.panelStrong,
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
    fontSize: 22,
    fontWeight: 650,
    lineHeight: 1.32,
  },
};
