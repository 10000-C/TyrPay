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

const commitmentRows = [
  ['Task ID', 'research-042'],
  ['Promised API', 'model/provider v1'],
  ['Usage Limit', '120k tokens'],
  ['Deadline', '8 min'],
  ['Proof Mode', '0G teeTLS'],
];

const chainStates = ['INIT', 'COMMITTED', 'ESCROW NEXT', 'PROOF MODE'];

export const CommitmentOnChain = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const sellerIn = interp(frame, [18, 58], [120, 0]);
  const cardTravel = interp(frame, [74, 136], [0, 1]);
  const cardX = interpolate(cardTravel, [0, 1], [0, -640]);
  const cardY = interpolate(cardTravel, [0, 1], [0, 26]);
  const gatePulse = spring({
    frame: frame - 124,
    fps,
    config: {damping: 22, stiffness: 110},
  });
  const stamp = spring({
    frame: frame - 148,
    fps,
    config: {damping: 18, stiffness: 150},
  });
  const hashOpacity = fade(frame, 168);
  const railOpacity = fade(frame, 152);
  const captionOpacity = fade(frame, 188);

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
        <div style={styles.shotLabel}>Scene 04 / Commitment on 0G</div>
      </header>

      <section style={styles.titleBlock}>
        <div style={styles.eyebrow}>Execution commitment</div>
        <h1 style={styles.h1}>A claim becomes a commitment.</h1>
        <p style={styles.lede}>The seller accepts the rule: commit first, then earn payment through proof.</p>
      </section>

      <div style={styles.buyerWrap}>
        <Img src={staticFile('characters/buyer.svg')} style={styles.buyer} />
        <div style={styles.buyerLabel}>Buyer watches</div>
      </div>

      <TyrPayGateCore pulse={gatePulse} frame={frame} />

      <div
        style={{
          ...styles.sellerWrap,
          opacity: fade(frame, 8),
          transform: `translateX(${sellerIn}px)`,
        }}
      >
        <Img src={staticFile('characters/honest_seller.svg')} style={styles.seller} />
        <div style={styles.sellerLabel}>Honest Seller</div>
      </div>

      <div
        style={{
          ...styles.cardWrap,
          opacity: fade(frame, 42),
          transform: `translate(${cardX}px, ${cardY}px) rotate(${interpolate(cardTravel, [0, 1], [-2, 0])}deg)`,
        }}
      >
        <CommitmentCard />
      </div>

      <div
        style={{
          ...styles.tyrWrap,
          opacity: fade(frame, 110),
          transform: `translate(${interp(frame, [110, 144], [54, 0])}px, ${interp(frame, [110, 144], [14, 0])}px)`,
        }}
      >
        <Img src={staticFile('characters/tyr.svg')} style={styles.tyr} />
      </div>

      <div
        style={{
          ...styles.stamp,
          opacity: stamp,
          transform: `translate(-50%, -50%) rotate(-8deg) scale(${0.64 + stamp * 0.36})`,
        }}
      >
        COMMITMENT
      </div>

      <div style={{...styles.hashPanel, opacity: hashOpacity}}>
        <span style={styles.hashKicker}>0G Chain write</span>
        <strong>commitmentHash</strong>
        <code>0x7a4f...91c2</code>
      </div>

      <CommitmentRail opacity={railOpacity} progress={interp(frame, [154, 244], [0, 1])} frame={frame} />

      <footer style={{...styles.caption, opacity: captionOpacity}}>
        <span style={styles.captionText}>A claim becomes an execution commitment.</span>
        <span style={styles.voiceover}>
          Before funds move, the seller commits to the model, endpoint, usage, deadline, and proof mode. The commitment
          hash is recorded by the TyrPay contract on 0G Chain.
        </span>
      </footer>
      <SceneProgress current={3} />
    </AbsoluteFill>
  );
};

const CommitmentCard = () => (
  <div style={styles.commitmentCard}>
    <span style={styles.cardKicker}>Execution Commitment</span>
    <strong style={styles.cardTitle}>Call terms before payment</strong>
    <div style={styles.cardRows}>
      {commitmentRows.map(([label, value]) => (
        <React.Fragment key={label}>
          <span>{label}</span>
          <b>{value}</b>
        </React.Fragment>
      ))}
    </div>
  </div>
);

const TyrPayGateCore = ({pulse, frame}: {pulse: number; frame: number}) => (
  <div style={styles.gateWrap}>
    <div style={{...styles.gateShield, transform: `scale(${1 + pulse * 0.03})`}}>
      <span style={styles.gateShieldKicker}>TyrPay Gate</span>
      <strong style={styles.gateShieldTitle}>Commit Rule Shield</strong>
      <div
        style={{
          ...styles.vaultRing,
          transform: `translate(-50%, -50%) rotate(${frame * 2.4}deg) scale(${1 + pulse * 0.06})`,
        }}
      />
      <div style={styles.vaultCore} />
      <span style={styles.shieldStatus}>ACCEPTS COMMITMENT</span>
    </div>
    <div style={styles.gateFoot}>0G Chain rule boundary</div>
  </div>
);

const CommitmentRail = ({opacity, progress, frame}: {opacity: number; progress: number; frame: number}) => (
  <div style={{...styles.chainRail, opacity}}>
    <div style={styles.chainHeader}>
      <span>0G Chain Contract</span>
      <span>commitment recorded</span>
    </div>
    <div style={styles.railTrack}>
      <div style={styles.railBack} />
      <div style={{...styles.railFill, width: `${progress * 78}%`}} />
      {chainStates.map((state, index) => {
        const active = frame >= 154 + index * 32;
        return (
          <div key={state} style={styles.chainState}>
            <span
              style={{
                ...styles.chainDot,
                background: active ? (index === 1 ? C.emerald : C.cyan) : '#0f172a',
                borderColor: active ? 'rgba(209,250,229,0.92)' : 'rgba(148,163,184,0.34)',
                boxShadow: active ? '0 0 24px rgba(16,185,129,0.58)' : 'none',
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
      'radial-gradient(circle at 46% 48%, rgba(139,92,246,0.20), transparent 34%), radial-gradient(circle at 74% 48%, rgba(16,185,129,0.13), transparent 27%), radial-gradient(circle at 22% 62%, rgba(34,211,238,0.10), transparent 30%), linear-gradient(180deg, rgba(2,6,23,0.26), rgba(2,6,23,0.92))',
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
    color: C.emerald,
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
  buyerWrap: {
    position: 'absolute',
    left: 128,
    bottom: 248,
    width: 330,
    height: 330,
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
    left: 78,
    top: -8,
    padding: '8px 12px',
    border: '1px solid rgba(34,211,238,0.28)',
    borderRadius: 999,
    background: 'rgba(8,47,73,0.68)',
    color: '#cffafe',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  sellerWrap: {
    position: 'absolute',
    right: 96,
    top: 248,
    width: 390,
    height: 390,
    zIndex: 5,
  },
  seller: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.45))',
  },
  sellerLabel: {
    position: 'absolute',
    left: 116,
    top: -10,
    padding: '8px 12px',
    border: '1px solid rgba(16,185,129,0.34)',
    borderRadius: 999,
    background: 'rgba(5,46,22,0.68)',
    color: '#bbf7d0',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  cardWrap: {
    position: 'absolute',
    right: 460,
    top: 388,
    zIndex: 12,
    transformOrigin: '50% 50%',
  },
  commitmentCard: {
    width: 360,
    padding: 22,
    border: '1px solid rgba(34,211,238,0.36)',
    borderRadius: 22,
    background: C.panelStrong,
    boxShadow: '0 34px 90px rgba(0,0,0,0.34), 0 0 40px rgba(34,211,238,0.12)',
  },
  cardKicker: {
    display: 'block',
    marginBottom: 8,
    color: C.cyan,
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
    lineHeight: 1.08,
  },
  cardRows: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '9px 18px',
    color: C.muted,
    fontSize: 15,
  },
  gateWrap: {
    position: 'absolute',
    left: '50%',
    top: '45%',
    width: 340,
    height: 470,
    zIndex: 8,
    display: 'grid',
    justifyItems: 'center',
    transform: 'translate(-50%, -50%)',
  },
  gateShield: {
    position: 'relative',
    zIndex: 3,
    width: 260,
    height: 315,
    display: 'grid',
    justifyItems: 'center',
    alignContent: 'start',
    paddingTop: 42,
    clipPath: 'polygon(50% 0%, 89% 13%, 82% 67%, 50% 100%, 18% 67%, 11% 13%)',
    background:
      'linear-gradient(180deg, rgba(16,185,129,0.42), rgba(34,211,238,0.20) 48%, rgba(245,158,11,0.28))',
    border: '1px solid rgba(209,250,229,0.38)',
    color: '#f8fafc',
    boxShadow: '0 0 76px rgba(16,185,129,0.28)',
  },
  gateShieldKicker: {
    color: '#bbf7d0',
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  gateShieldTitle: {
    marginTop: 10,
    width: 190,
    color: '#fde68a',
    fontSize: 23,
    lineHeight: 1.05,
    textAlign: 'center',
  },
  gateBeam: {
    position: 'absolute',
    top: 44,
    bottom: 34,
    width: 88,
    borderRadius: 999,
    background: 'linear-gradient(180deg, rgba(139,92,246,0.13), rgba(34,211,238,0.22), rgba(245,158,11,0.10))',
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
    width: 236,
    height: 160,
    marginTop: 62,
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
    top: '52%',
    width: 74,
    height: 74,
    border: `8px solid ${C.amber}`,
    borderRadius: 999,
    boxShadow: '0 0 34px rgba(245,158,11,0.74)',
  },
  vaultCore: {
    position: 'absolute',
    left: '50%',
    top: '52%',
    width: 30,
    height: 30,
    borderRadius: 999,
    transform: 'translate(-50%, -50%)',
    background: C.cyan,
    boxShadow: '0 0 30px rgba(34,211,238,0.9)',
  },
  shieldStatus: {
    position: 'absolute',
    left: '50%',
    bottom: 90,
    width: 162,
    transform: 'translateX(-50%)',
    color: '#bbf7d0',
    fontSize: 10,
    fontWeight: 950,
    letterSpacing: '0.08em',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  gateFoot: {
    zIndex: 2,
    marginTop: 34,
    padding: '10px 14px',
    border: '1px solid rgba(16,185,129,0.32)',
    borderRadius: 16,
    background: 'rgba(17,24,39,0.88)',
    color: '#bbf7d0',
    fontSize: 13,
    fontWeight: 850,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  tyrWrap: {
    position: 'absolute',
    left: 1034,
    top: 300,
    width: 170,
    height: 170,
    zIndex: 15,
  },
  tyr: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 28px 50px rgba(0,0,0,0.46))',
  },
  stamp: {
    position: 'absolute',
    left: 690,
    top: 548,
    zIndex: 18,
    padding: '10px 16px',
    border: '2px solid rgba(16,185,129,0.88)',
    borderRadius: 16,
    background: 'rgba(5,46,22,0.82)',
    color: '#bbf7d0',
    boxShadow: '0 0 42px rgba(16,185,129,0.36)',
    fontSize: 20,
    fontWeight: 950,
    letterSpacing: '0.12em',
  },
  hashPanel: {
    position: 'absolute',
    left: 1060,
    top: 620,
    zIndex: 12,
    width: 328,
    display: 'grid',
    gap: 6,
    padding: 18,
    border: '1px solid rgba(139,92,246,0.36)',
    borderRadius: 18,
    background: 'rgba(24,18,43,0.78)',
    boxShadow: '0 0 46px rgba(139,92,246,0.18)',
  },
  hashKicker: {
    color: '#c4b5fd',
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
    zIndex: 11,
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
    background: `linear-gradient(90deg, ${C.cyan}, ${C.emerald}, ${C.amber})`,
    boxShadow: '0 0 24px rgba(16,185,129,0.58)',
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
    border: '1px solid rgba(16,185,129,0.30)',
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
