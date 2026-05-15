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
  panel: 'rgba(9, 14, 27, 0.82)',
  panelStrong: 'rgba(13, 20, 36, 0.94)',
  text: '#f8fafc',
  muted: '#94a3b8',
  amber: '#f59e0b',
  cyan: '#22d3ee',
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

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, start + 14], [0, 1], {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const chainStates = ['INIT', 'GATE_ACTIVE', 'ESCROW_READY', 'PROOF_REQUIRED'];

export const TyrPayGate = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const gateDrop = spring({
    frame: frame - 120,
    fps,
    config: {damping: 18, stiffness: 92, mass: 0.75},
  });
  const shield = spring({
    frame: frame - 166,
    fps,
    config: {damping: 20, stiffness: 95},
  });
  const directPath = spring({
    frame: frame - 54,
    fps,
    config: {damping: 20, stiffness: 72},
  });
  const redirectPath = spring({
    frame: frame - 226,
    fps,
    config: {damping: 20, stiffness: 76},
  });
  const railProgress = interp(frame, [232, 330], [0, 1]);
  const railOpacity = fade(frame, 208, 344);
  const blockFlash = fade(frame, 172, 300);
  const tokenStop = interp(frame, [52, 172], [0, 1]);
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
        <div style={styles.eyebrow}>TyrPay on 0G enters</div>
        <h1 style={styles.h1}>Payment waits for proof.</h1>
        <p style={styles.lede}>Direct payment is blocked. Settlement must pass through 0G Chain rules.</p>
      </section>

      <div style={styles.buyerWrap}>
        <Img src={staticFile('characters/buyer.svg')} style={styles.buyer} />
        <div style={styles.buyerLabel}>Buyer</div>
      </div>

      <div
        style={{
          ...styles.evilWrap,
          transform: `translateX(${interp(frame, [10, 84], [80, -55])}px) scale(0.9)`,
          opacity: fade(frame, 0, 222),
        }}
      >
        <Img src={staticFile('characters/evil_seller.svg')} style={styles.evil} />
        <div style={styles.evilLabel}>Evil Seller</div>
      </div>

      <div
        style={{
          ...styles.token,
          transform: `translate(${interpolate(tokenStop, [0, 1], [0, 0])}px, ${Math.sin(frame / 18) * 3}px)`,
        }}
      >
        <span style={styles.tokenCore}>$</span>
      </div>

      <PaymentPathOverlay direct={directPath} redirect={redirectPath} block={blockFlash} frame={frame} />

      <TyrPayGateCore frame={frame} progress={gateDrop} flash={blockFlash} />

      <div
        style={{
          ...styles.tyrGuide,
          opacity: fade(frame, 104, 250),
          transform: `translate(${interp(frame, [104, 138], [96, 0])}px, ${interp(frame, [104, 138], [18, 0])}px) scale(${
            0.76 + shield * 0.14
          })`,
        }}
      >
        <Img src={staticFile('characters/tyr.svg')} style={styles.tyr} />
      </div>

      <div
        style={{
          ...styles.shield,
          opacity: shield,
          transform: `translate(-50%, -50%) rotate(-10deg) scale(${0.48 + shield * 0.52})`,
        }}
      >
        <span style={styles.shieldMain}>BLOCKED</span>
        <span style={styles.shieldSub}>NO PROOF / NO PAY</span>
      </div>

      <ZeroGChainRail progress={railProgress} opacity={railOpacity} frame={frame} />

      <SceneProgress current={2} />
    </AbsoluteFill>
  );
};

const PaymentPathOverlay = ({
  direct,
  redirect,
  block,
  frame,
}: {
  direct: number;
  redirect: number;
  block: number;
  frame: number;
}) => {
  const directDash = 470 * (1 - direct);
  const redirectDash = 590 * (1 - redirect);
  const arrowPulse = 0.58 + Math.sin(frame / 12) * 0.1;

  return (
    <svg style={styles.paymentSvg} viewBox="0 0 1920 1080">
      <defs>
        <linearGradient id="directPayGradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={C.amber} />
          <stop offset="58%" stopColor={C.rose} />
          <stop offset="100%" stopColor={C.rose} />
        </linearGradient>
        <linearGradient id="redirectGradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={C.amber} />
          <stop offset="45%" stopColor={C.cyan} />
          <stop offset="100%" stopColor={C.purple} />
        </linearGradient>
        <marker
          id="directArrow"
          markerHeight="34"
          markerUnits="userSpaceOnUse"
          markerWidth="44"
          orient="auto"
          refX="38"
          refY="17"
        >
          <path d="M0,0 L44,17 L0,34 Z" fill={C.rose} />
        </marker>
        <marker
          id="redirectArrow"
          markerHeight="28"
          markerUnits="userSpaceOnUse"
          markerWidth="36"
          orient="auto"
          refX="32"
          refY="14"
        >
          <path d="M0,0 L36,14 L0,28 Z" fill={C.cyan} />
        </marker>
      </defs>
      <path
        d="M660 650 C780 626 904 590 1032 556"
        fill="none"
        stroke="url(#directPayGradient)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray="470"
        strokeDashoffset={directDash}
        markerEnd="url(#directArrow)"
        opacity={0.84 * direct}
        style={{filter: `drop-shadow(0 0 ${16 * arrowPulse}px rgba(244,63,94,0.72))`}}
      />
      <path
        d="M1204 536 C1280 520 1360 506 1430 498"
        fill="none"
        stroke={C.rose}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="22 24"
        opacity={0.2 * block}
      />
      <path
        d="M660 650 C720 598 748 542 806 506"
        fill="none"
        stroke="url(#redirectGradient)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="590"
        strokeDashoffset={redirectDash}
        markerEnd="url(#redirectArrow)"
        opacity={0.78 * redirect}
        style={{filter: 'drop-shadow(0 0 14px rgba(34,211,238,0.62))'}}
      />
      <g opacity={direct}>
        <rect x="1198" y="444" width="164" height="44" rx="22" fill="rgba(244,63,94,0.14)" stroke="rgba(244,63,94,0.42)" />
        <text x="1280" y="472" fill="#fecdd3" textAnchor="middle" fontSize="18" fontWeight="900" letterSpacing="2">
          DIRECT PAY
        </text>
      </g>
    </svg>
  );
};

const TyrPayGateCore = ({
  frame,
  progress,
  flash,
}: {
  frame: number;
  progress: number;
  flash: number;
}) => {
  const y = interpolate(progress, [0, 1], [-820, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const glow = 0.22 + progress * 0.44 + flash * 0.28;

  return (
    <div
      style={{
        ...styles.gateWrap,
        transform: `translate(-50%, calc(-50% + ${y}px))`,
      }}
    >
      <div style={{...styles.gateShield, boxShadow: `0 0 ${70 + flash * 40}px rgba(139,92,246,${glow})`}}>
        <span style={styles.gateShieldKicker}>TyrPay Gate</span>
        <strong style={styles.gateShieldTitle}>0G Rule Shield</strong>
        <div
          style={{
            ...styles.vaultRing,
            transform: `translate(-50%, -50%) rotate(${frame * 2.8}deg)`,
          }}
        />
        <div style={styles.vaultCore} />
        <span style={styles.vaultLabel}>ESCROW VAULT</span>
      </div>
      <div style={styles.gateFoot}>0G Chain settlement boundary</div>
    </div>
  );
};

const ZeroGChainRail = ({progress, opacity, frame}: {progress: number; opacity: number; frame: number}) => (
  <div style={{...styles.chainRail, opacity}}>
    <div style={styles.chainHeader}>
      <span>0G Chain Contract</span>
      <span>initialized</span>
    </div>
    <div style={styles.railTrack}>
      <div style={styles.railBack} />
      <div style={{...styles.railFill, width: `${progress * 78}%`}} />
      {chainStates.map((state, index) => {
        const active = frame >= 232 + index * 28;
        return (
          <div key={state} style={styles.chainState}>
            <span
              style={{
                ...styles.chainDot,
                background: active ? (index === 0 ? C.purple : C.cyan) : '#0f172a',
                borderColor: active ? 'rgba(221,214,254,0.95)' : 'rgba(148,163,184,0.34)',
                boxShadow: active ? '0 0 24px rgba(139,92,246,0.7)' : 'none',
              }}
            />
            <span>{state}</span>
          </div>
        );
      })}
    </div>
  </div>
);

const ProtocolGrid = ({frame}: {frame: number}) => {
  const drift = (frame % 270) * 0.18;
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
      'radial-gradient(circle at 50% 49%, rgba(139,92,246,0.20), transparent 34%), radial-gradient(circle at 24% 60%, rgba(96,165,250,0.14), transparent 28%), radial-gradient(circle at 76% 45%, rgba(244,63,94,0.14), transparent 28%), linear-gradient(180deg, rgba(2,6,23,0.24), rgba(2,6,23,0.92))',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    opacity: 0.24,
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
    zIndex: 10,
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
    width: 650,
    zIndex: 7,
  },
  eyebrow: {
    marginBottom: 18,
    color: C.purple,
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
  },
  h1: {
    margin: 0,
    fontSize: 76,
    lineHeight: 0.96,
    letterSpacing: 0,
  },
  lede: {
    margin: '24px 0 0',
    width: 560,
    color: '#cbd5e1',
    fontSize: 25,
    lineHeight: 1.42,
  },
  buyerWrap: {
    position: 'absolute',
    left: 118,
    bottom: 250,
    width: 370,
    height: 370,
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
    left: 72,
    top: -10,
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
  evilWrap: {
    position: 'absolute',
    right: 80,
    top: 240,
    width: 410,
    height: 410,
    zIndex: 5,
  },
  evil: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 0 34px rgba(244,63,94,0.36))',
  },
  evilLabel: {
    position: 'absolute',
    left: 92,
    top: -10,
    padding: '8px 12px',
    border: '1px solid rgba(251,113,133,0.36)',
    borderRadius: 999,
    background: 'rgba(76,5,25,0.82)',
    color: '#fecdd3',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  token: {
    position: 'absolute',
    left: 620,
    top: 626,
    zIndex: 9,
    display: 'flex',
    alignItems: 'center',
    padding: 10,
    border: '1px solid rgba(245,158,11,0.34)',
    borderRadius: 999,
    background: 'rgba(24,18,6,0.88)',
    boxShadow: '0 0 36px rgba(245,158,11,0.26)',
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
  gateWrap: {
    position: 'absolute',
    left: '43.5%',
    top: '45%',
    zIndex: 8,
    width: 330,
    height: 460,
    display: 'grid',
    justifyItems: 'center',
    transformOrigin: '50% 50%',
  },
  gateShield: {
    position: 'relative',
    zIndex: 3,
    width: 260,
    height: 315,
    display: 'grid',
    justifyItems: 'center',
    alignContent: 'start',
    paddingTop: 44,
    clipPath: 'polygon(50% 0%, 89% 13%, 82% 67%, 50% 100%, 18% 67%, 11% 13%)',
    background:
      'linear-gradient(180deg, rgba(139,92,246,0.46), rgba(34,211,238,0.20) 48%, rgba(245,158,11,0.30))',
    border: '1px solid rgba(221,214,254,0.36)',
    color: '#f8fafc',
  },
  gateShieldKicker: {
    color: '#ddd6fe',
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  gateShieldTitle: {
    marginTop: 10,
    color: '#fde68a',
    fontSize: 24,
    lineHeight: 1.05,
    textAlign: 'center',
  },
  gateBeam: {
    position: 'absolute',
    top: 42,
    bottom: 30,
    width: 90,
    borderRadius: 999,
    background: 'linear-gradient(180deg, rgba(139,92,246,0.12), rgba(34,211,238,0.24), rgba(245,158,11,0.12))',
    border: '1px solid rgba(221,214,254,0.28)',
  },
  gateTop: {
    zIndex: 2,
    padding: '12px 18px',
    borderRadius: 999,
    border: '1px solid rgba(221,214,254,0.26)',
    background: 'rgba(24,18,43,0.86)',
    color: '#ddd6fe',
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  vault: {
    position: 'relative',
    zIndex: 2,
    width: 230,
    height: 154,
    marginTop: 60,
    display: 'grid',
    placeItems: 'center',
    border: '1px solid rgba(245,158,11,0.42)',
    borderRadius: 28,
    background:
      'radial-gradient(circle at 50% 44%, rgba(245,158,11,0.24), transparent 46%), linear-gradient(180deg, #1d2638, #0b101b)',
    boxShadow: '0 0 70px rgba(245,158,11,0.24)',
  },
  vaultRing: {
    position: 'absolute',
    left: '50%',
    top: '44%',
    width: 70,
    height: 70,
    border: `8px solid ${C.amber}`,
    borderRadius: 999,
    boxShadow: '0 0 34px rgba(245,158,11,0.74)',
  },
  vaultCore: {
    position: 'absolute',
    left: '50%',
    top: '44%',
    width: 28,
    height: 28,
    borderRadius: 999,
    transform: 'translate(-50%, -50%)',
    background: C.cyan,
    boxShadow: '0 0 30px rgba(34,211,238,0.9)',
  },
  vaultLabel: {
    display: 'block',
    position: 'absolute',
    bottom: 72,
    color: '#fde68a',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  gateFoot: {
    zIndex: 2,
    marginTop: 34,
    padding: '12px 18px',
    border: '1px solid rgba(139,92,246,0.34)',
    borderRadius: 16,
    background: 'rgba(17,24,39,0.88)',
    color: 'rgba(196,181,253,0.84)',
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: '0.06em',
  },
  tyrGuide: {
    position: 'absolute',
    left: 900,
    top: 318,
    width: 300,
    height: 300,
    zIndex: 16,
  },
  tyr: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 28px 50px rgba(0,0,0,0.46))',
  },
  shield: {
    position: 'absolute',
    left: 1100,
    top: 552,
    zIndex: 18,
    width: 230,
    height: 194,
    display: 'grid',
    gridTemplateRows: '1fr 1fr',
    alignContent: 'center',
    placeItems: 'center',
    borderRadius: '50% 50% 44% 44%',
    border: '3px solid rgba(34,211,238,0.9)',
    background:
      'radial-gradient(circle at 50% 42%, rgba(34,211,238,0.34), rgba(139,92,246,0.24), rgba(2,6,23,0.92))',
    boxShadow: '0 0 72px rgba(34,211,238,0.52), inset 0 0 36px rgba(34,211,238,0.2)',
    color: '#cffafe',
    fontSize: 19,
    fontWeight: 950,
    letterSpacing: '0.14em',
    textAlign: 'center',
  },
  paymentSvg: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
    pointerEvents: 'none',
  },
  shieldMain: {
    display: 'block',
    alignSelf: 'end',
    color: '#fecdd3',
    fontSize: 29,
    fontWeight: 950,
    letterSpacing: '0.12em',
    lineHeight: 1,
  },
  shieldSub: {
    display: 'block',
    alignSelf: 'start',
    color: '#cffafe',
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: '0.08em',
    lineHeight: 1.1,
    marginTop: 12,
  },
  blocked: {
    position: 'absolute',
    right: 418,
    top: 280,
    zIndex: 13,
    width: 350,
    display: 'grid',
    gap: 6,
    padding: 20,
    border: '1px solid rgba(244,63,94,0.35)',
    borderRadius: 22,
    background: 'rgba(28,12,22,0.84)',
    boxShadow: '0 0 60px rgba(244,63,94,0.18)',
    color: C.text,
    fontSize: 18,
    lineHeight: 1.18,
  },
  chainRail: {
    position: 'absolute',
    left: 62,
    right: 62,
    bottom: 180,
    zIndex: 14,
    padding: '20px 24px 18px',
    border: '1px solid rgba(139,92,246,0.28)',
    borderRadius: 24,
    background: 'rgba(13,20,36,0.88)',
    boxShadow: '0 0 50px rgba(139,92,246,0.12)',
  },
  chainHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 20,
    color: '#ddd6fe',
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  railTrack: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
  },
  railBack: {
    position: 'absolute',
    left: '11%',
    right: '11%',
    top: 22,
    height: 3,
    borderRadius: 999,
    background: 'rgba(148,163,184,0.18)',
  },
  railFill: {
    position: 'absolute',
    left: '11%',
    top: 22,
    height: 3,
    borderRadius: 999,
    background: `linear-gradient(90deg, ${C.purple}, ${C.cyan}, ${C.amber})`,
    boxShadow: '0 0 24px rgba(139,92,246,0.72)',
  },
  chainState: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    justifyItems: 'center',
    gap: 12,
    color: C.muted,
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textAlign: 'center',
  },
  chainDot: {
    width: 44,
    height: 44,
    borderRadius: 999,
    border: '1px solid',
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
    border: '1px solid rgba(139,92,246,0.34)',
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
