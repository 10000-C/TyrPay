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

const chainStates = ['COMMITTED', 'ESCROW_LOCKED', 'SELLER_UNPAID', 'READY_TO_EXECUTE'];

export const EscrowFunding = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const tokenTravel = interp(frame, [62, 154], [0, 1]);
  const tokenX = interpolate(tokenTravel, [0, 1], [0, 420]);
  const tokenY = interpolate(tokenTravel, [0, 1], [0, -72]);
  const vaultLock = spring({
    frame: frame - 150,
    fps,
    config: {damping: 18, stiffness: 135},
  });
  const railOpacity = fade(frame, 96);
  const captionOpacity = fade(frame, 190);
  const statusOpacity = fade(frame, 150);

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
        <div style={styles.shotLabel}>Scene 05 / Escrow funding</div>
      </header>

      <section style={styles.titleBlock}>
        <div style={styles.eyebrow}>Escrow on 0G Chain</div>
        <h1 style={styles.h1}>Funds enter the contract.</h1>
        <p style={styles.lede}>The seller has committed, but has not been paid yet.</p>
      </section>

      <div style={styles.buyerWrap}>
        <Img src={staticFile('characters/buyer.svg')} style={styles.buyer} />
        <div style={styles.buyerLabel}>Buyer accepts commitment</div>
      </div>

      <div style={styles.sellerWrap}>
        <Img src={staticFile('characters/honest_seller.svg')} style={styles.seller} />
        <SellerWallet opacity={statusOpacity} />
      </div>

      <CommitmentSummary />

      <div
        style={{
          ...styles.token,
          transform: `translate(${tokenX}px, ${tokenY + Math.sin(frame / 18) * 3}px)`,
        }}
      >
        <span style={styles.tokenCore}>$</span>
      </div>

      <FundingPath progress={tokenTravel} locked={vaultLock} />

      <EscrowVault locked={vaultLock} frame={frame} />

      <div style={{...styles.lockPanel, opacity: statusOpacity}}>
        <span style={styles.lockKicker}>0G Chain Contract</span>
        <strong>ESCROW_LOCKED</strong>
        <p>Funds are locked by rules, not sent to the seller wallet.</p>
      </div>

      <EscrowRail opacity={railOpacity} progress={interp(frame, [104, 244], [0, 1])} frame={frame} />

      <footer style={{...styles.caption, opacity: captionOpacity}}>
        <span style={styles.captionText}>Funds enter the 0G Chain contract, not the seller wallet.</span>
        <span style={styles.voiceover}>
          The buyer accepts the commitment and locks funds into the TyrPay contract on 0G Chain. The seller has not
          been paid yet.
        </span>
      </footer>
      <SceneProgress current={4} />
    </AbsoluteFill>
  );
};

const CommitmentSummary = () => (
  <div style={styles.commitmentSummary}>
    <span>commitmentHash</span>
    <strong>0x7a4f...91c2</strong>
    <em>accepted</em>
  </div>
);

const SellerWallet = ({opacity}: {opacity: number}) => (
  <div style={{...styles.sellerWallet, opacity}}>
    <span>Seller wallet</span>
    <strong>0</strong>
    <em>unpaid</em>
  </div>
);

const EscrowVault = ({locked, frame}: {locked: number; frame: number}) => (
  <div style={styles.vaultWrap}>
    <div
      style={{
        ...styles.gateShield,
        transform: `scale(${1 + locked * 0.03})`,
        boxShadow: `0 0 ${70 + locked * 46}px rgba(245,158,11,${0.22 + locked * 0.26})`,
      }}
    >
      <span style={styles.gateShieldKicker}>TyrPay Escrow</span>
      <strong style={styles.gateShieldTitle}>0G Custody Shield</strong>
      <div
        style={{
          ...styles.vaultRing,
          transform: `translate(-50%, -50%) rotate(${frame * 2.2}deg) scale(${1 + locked * 0.08})`,
        }}
      />
      <div style={styles.vaultCore} />
      <div
        style={{
          ...styles.lockIcon,
          opacity: locked,
          transform: `translate(-50%, -50%) scale(${0.74 + locked * 0.26})`,
        }}
      >
        LOCKED
      </div>
    </div>
    <div style={styles.gateFoot}>0G Chain custody</div>
  </div>
);

const FundingPath = ({progress, locked}: {progress: number; locked: number}) => {
  const dash = 760 * (1 - progress);

  return (
    <svg style={styles.pathSvg} viewBox="0 0 1920 1080">
      <defs>
        <linearGradient id="fundingGradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={C.amber} />
          <stop offset="58%" stopColor={C.cyan} />
          <stop offset="100%" stopColor={C.purple} />
        </linearGradient>
        <marker
          id="fundingArrow"
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
        d="M560 652 C700 650 812 596 918 524"
        fill="none"
        stroke="url(#fundingGradient)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray="760"
        strokeDashoffset={dash}
        markerEnd="url(#fundingArrow)"
        opacity={0.82 * progress}
        style={{filter: 'drop-shadow(0 0 14px rgba(34,211,238,0.62))'}}
      />
      <g opacity={locked}>
        <rect x="704" y="548" width="164" height="40" rx="20" fill="rgba(34,211,238,0.10)" stroke="rgba(34,211,238,0.30)" />
        <text x="786" y="574" fill="#cffafe" textAnchor="middle" fontSize="15" fontWeight="900" letterSpacing="2">
          TO ESCROW
        </text>
      </g>
    </svg>
  );
};

const EscrowRail = ({opacity, progress, frame}: {opacity: number; progress: number; frame: number}) => (
  <div style={{...styles.chainRail, opacity}}>
    <div style={styles.chainHeader}>
      <span>0G Chain Contract</span>
      <span>escrow locked</span>
    </div>
    <div style={styles.railTrack}>
      <div style={styles.railBack} />
      <div style={{...styles.railFill, width: `${progress * 78}%`}} />
      {chainStates.map((state, index) => {
        const active = frame >= 104 + index * 34;
        return (
          <div key={state} style={styles.chainState}>
            <span
              style={{
                ...styles.chainDot,
                background: active ? (index === 1 ? C.amber : C.cyan) : '#0f172a',
                borderColor: active ? 'rgba(254,243,199,0.92)' : 'rgba(148,163,184,0.34)',
                boxShadow: active ? '0 0 24px rgba(245,158,11,0.58)' : 'none',
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
  const drift = (frame % 300) * 0.16;
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
      'radial-gradient(circle at 48% 48%, rgba(245,158,11,0.17), transparent 31%), radial-gradient(circle at 68% 48%, rgba(34,211,238,0.12), transparent 30%), radial-gradient(circle at 24% 62%, rgba(96,165,250,0.12), transparent 28%), linear-gradient(180deg, rgba(2,6,23,0.26), rgba(2,6,23,0.92))',
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
    width: 650,
    zIndex: 7,
  },
  eyebrow: {
    marginBottom: 18,
    color: C.amber,
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
  },
  h1: {
    margin: 0,
    fontSize: 76,
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
  buyerWrap: {
    position: 'absolute',
    left: 116,
    bottom: 250,
    width: 350,
    height: 350,
    zIndex: 4,
  },
  buyer: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 30px 58px rgba(0,0,0,0.44))',
  },
  buyerLabel: {
    position: 'absolute',
    left: 92,
    top: -12,
    padding: '8px 12px',
    border: '1px solid rgba(96,165,250,0.32)',
    borderRadius: 999,
    background: 'rgba(30,41,59,0.78)',
    color: '#dbeafe',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  sellerWrap: {
    position: 'absolute',
    right: 104,
    top: 252,
    width: 380,
    height: 380,
    zIndex: 5,
  },
  seller: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.45))',
  },
  sellerWallet: {
    position: 'absolute',
    left: -126,
    top: 18,
    bottom: 'auto',
    width: 190,
    display: 'grid',
    gap: 4,
    padding: 16,
    border: '1px solid rgba(148,163,184,0.22)',
    borderRadius: 18,
    background: 'rgba(15,23,42,0.86)',
  },
  commitmentSummary: {
    position: 'absolute',
    left: 640,
    top: 420,
    zIndex: 8,
    width: 290,
    display: 'grid',
    gap: 6,
    padding: 18,
    border: '1px solid rgba(16,185,129,0.32)',
    borderRadius: 18,
    background: 'rgba(5,46,22,0.62)',
    boxShadow: '0 0 34px rgba(16,185,129,0.12)',
  },
  token: {
    position: 'absolute',
    left: 500,
    bottom: 352,
    zIndex: 14,
    display: 'grid',
    placeItems: 'center',
    padding: 10,
    border: '1px solid rgba(245,158,11,0.34)',
    borderRadius: 999,
    background: 'rgba(24,18,6,0.88)',
    boxShadow: '0 0 36px rgba(245,158,11,0.28)',
  },
  tokenCore: {
    width: 52,
    height: 52,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 999,
    color: '#08111f',
    background: C.amber,
    fontSize: 29,
    fontWeight: 950,
  },
  pathSvg: {
    position: 'absolute',
    inset: 0,
    zIndex: 11,
    pointerEvents: 'none',
  },
  vaultWrap: {
    position: 'absolute',
    left: '50%',
    top: '45%',
    width: 360,
    height: 480,
    zIndex: 9,
    display: 'grid',
    justifyItems: 'center',
    transform: 'translate(-50%, -50%)',
  },
  gateShield: {
    position: 'relative',
    zIndex: 3,
    width: 270,
    height: 326,
    display: 'grid',
    justifyItems: 'center',
    alignContent: 'start',
    paddingTop: 42,
    clipPath: 'polygon(50% 0%, 89% 13%, 82% 67%, 50% 100%, 18% 67%, 11% 13%)',
    background:
      'linear-gradient(180deg, rgba(245,158,11,0.44), rgba(34,211,238,0.20) 48%, rgba(139,92,246,0.28))',
    border: '1px solid rgba(254,243,199,0.38)',
    color: '#f8fafc',
  },
  gateShieldKicker: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  gateShieldTitle: {
    marginTop: 10,
    width: 190,
    color: '#cffafe',
    fontSize: 23,
    lineHeight: 1.05,
    textAlign: 'center',
  },
  gateBeam: {
    position: 'absolute',
    top: 44,
    bottom: 34,
    width: 96,
    borderRadius: 999,
    background: 'linear-gradient(180deg, rgba(139,92,246,0.13), rgba(34,211,238,0.22), rgba(245,158,11,0.16))',
    border: '1px solid rgba(221,214,254,0.24)',
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
    width: 250,
    height: 170,
    marginTop: 62,
    display: 'grid',
    placeItems: 'center',
    border: '1px solid rgba(245,158,11,0.42)',
    borderRadius: 28,
    background:
      'radial-gradient(circle at 50% 44%, rgba(245,158,11,0.24), transparent 46%), linear-gradient(180deg, #1d2638, #0b101b)',
  },
  vaultRing: {
    position: 'absolute',
    left: '50%',
    top: '54%',
    width: 78,
    height: 78,
    border: `8px solid ${C.amber}`,
    borderRadius: 999,
    boxShadow: '0 0 34px rgba(245,158,11,0.74)',
  },
  vaultCore: {
    position: 'absolute',
    left: '50%',
    top: '54%',
    width: 30,
    height: 30,
    borderRadius: 999,
    transform: 'translate(-50%, -50%)',
    background: C.cyan,
    boxShadow: '0 0 30px rgba(34,211,238,0.9)',
  },
  lockIcon: {
    position: 'absolute',
    left: '50%',
    bottom: 66,
    padding: '6px 10px',
    borderRadius: 999,
    background: 'rgba(245,158,11,0.16)',
    color: '#fde68a',
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: '0.12em',
  },
  gateFoot: {
    zIndex: 2,
    marginTop: 36,
    padding: '10px 14px',
    border: '1px solid rgba(139,92,246,0.34)',
    borderRadius: 16,
    background: 'rgba(17,24,39,0.88)',
    color: '#c4b5fd',
    fontSize: 13,
    fontWeight: 850,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  lockPanel: {
    position: 'absolute',
    left: 1120,
    top: 548,
    zIndex: 12,
    width: 350,
    display: 'grid',
    gap: 8,
    padding: 20,
    border: '1px solid rgba(245,158,11,0.34)',
    borderRadius: 20,
    background: 'rgba(45,28,8,0.78)',
    boxShadow: '0 0 44px rgba(245,158,11,0.16)',
  },
  lockKicker: {
    color: '#fde68a',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  chainRail: {
    position: 'absolute',
    left: 62,
    right: 62,
    bottom: 180,
    zIndex: 13,
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
    background: `linear-gradient(90deg, ${C.cyan}, ${C.amber}, ${C.emerald})`,
    boxShadow: '0 0 24px rgba(245,158,11,0.58)',
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
    border: '1px solid rgba(245,158,11,0.30)',
    borderRadius: 24,
    background: 'rgba(13,20,36,0.94)',
    color: C.text,
    fontSize: 30,
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
