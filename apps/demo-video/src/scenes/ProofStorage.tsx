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
  panel: 'rgba(9, 14, 27, 0.86)',
  panelStrong: 'rgba(13, 20, 36, 0.94)',
  text: '#f8fafc',
  muted: '#94a3b8',
  amber: '#f59e0b',
  cyan: '#22d3ee',
  purple: '#8b5cf6',
  violet: '#a78bfa',
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
  interpolate(frame, [start, start + 18], [0, 1], {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const bundleRows = [
  ['teeTLS receipt', 'signed'],
  ['taskId', 'T-2048'],
  ['commitmentHash', '0x72...c9'],
  ['usage metadata', 'bounded'],
];

const referenceRows = [
  ['proofHash', '0xbf...42'],
  ['storageReference', '0g://proof/archive/2048'],
];

export const ProofStorage = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const sellerIn = interp(frame, [8, 38], [46, 0]);
  const bundlePop = spring({
    frame: frame - 34,
    fps,
    config: {damping: 20, stiffness: 140},
  });
  const packProgress = interp(frame, [72, 150], [0, 1]);
  const uploadProgress = interp(frame, [150, 224], [0, 1]);
  const archivePulse = spring({
    frame: frame - 210,
    fps,
    config: {damping: 18, stiffness: 120},
  });
  const refsOpacity = fade(frame, 226);
  const chainOpacity = fade(frame, 248);
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
        <div style={styles.eyebrow}>Proof Archive</div>
        <h1 style={styles.h1}>Proof leaves the chain light.</h1>
        <p style={styles.lede}>The full bundle is archived on 0G Storage; the contract records only references.</p>
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

      <ProofBundle pop={bundlePop} pack={packProgress} />
      <StorageArchive pulse={archivePulse} />
      <UploadPath progress={uploadProgress} pack={packProgress} />

      <div style={{...styles.referenceCard, opacity: refsOpacity}}>
        <span style={styles.referenceKicker}>returned from 0G Storage</span>
        {referenceRows.map(([label, value]) => (
          <React.Fragment key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </React.Fragment>
        ))}
      </div>

      <ChainRail opacity={chainOpacity} />

      <SceneProgress current={6} />
    </AbsoluteFill>
  );
};

const ProofBundle = ({pop, pack}: {pop: number; pack: number}) => {
  const shardScale = 0.85 + pack * 0.15;
  return (
    <div
      style={{
        ...styles.bundle,
        opacity: pop,
        transform: `translateY(${interpolate(pop, [0, 1], [24, 0])}px) scale(${0.9 + pop * 0.1})`,
      }}
    >
      <span style={styles.bundleKicker}>Proof Bundle</span>
      <strong style={styles.bundleTitle}>Execution evidence package</strong>
      <div style={styles.bundleRows}>
        {bundleRows.map(([label, value], index) => (
          <React.Fragment key={label}>
            <span style={{opacity: fadeForIndex(pack, index)}}>{label}</span>
            <b style={{opacity: fadeForIndex(pack, index)}}>{value}</b>
          </React.Fragment>
        ))}
      </div>
      <div style={styles.bundleFooter}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              ...styles.bundleShard,
              opacity: fadeForIndex(pack, i),
              transform: `scale(${shardScale})`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

const StorageArchive = ({pulse}: {pulse: number}) => (
  <div
    style={{
      ...styles.archive,
      boxShadow: `0 0 ${42 + pulse * 52}px rgba(139,92,246,${0.18 + pulse * 0.18})`,
    }}
  >
    <div style={styles.archiveWatermark}>0G</div>
    <span style={styles.archiveKicker}>0G Storage</span>
    <strong style={styles.archiveTitle}>Proof Archive</strong>
    <div style={styles.archiveCore}>
      <div style={styles.archiveCube}>0G</div>
      <div style={styles.archiveRings} />
    </div>
    <div style={styles.archiveGrid}>
      {Array.from({length: 20}).map((_, index) => {
        const row = Math.floor(index / 5);
        const col = index % 5;
        const active = index === 6 || index === 7 || index === 11 || index === 12 || index === 17;
        return (
          <div
            key={index}
            style={{
              ...styles.archiveNode,
              gridColumn: col + 1,
              gridRow: row + 1,
              opacity: active ? 0.9 : 0.38,
              transform: `scale(${active ? 1 + pulse * 0.08 : 1})`,
              borderColor: active ? 'rgba(34,211,238,0.58)' : 'rgba(167,139,250,0.28)',
              background: active ? 'rgba(34,211,238,0.13)' : 'rgba(15,23,42,0.68)',
            }}
          />
        );
      })}
    </div>
    <div style={styles.archiveBase}>
      <span>decentralized archive grid</span>
      <b>available for verifier</b>
    </div>
  </div>
);

const UploadPath = ({progress, pack}: {progress: number; pack: number}) => {
  const dash = 820 * (1 - progress);
  const packetX = interpolate(progress, [0, 1], [690, 1236]);
  const packetY = interpolate(progress, [0, 1], [518, 476]);

  return (
    <>
      <svg style={styles.pathSvg} viewBox="0 0 1920 1080">
        <defs>
          <linearGradient id="storageUploadGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={C.cyan} />
            <stop offset="58%" stopColor={C.purple} />
            <stop offset="100%" stopColor={C.violet} />
          </linearGradient>
          <marker id="storageArrow" markerHeight="28" markerUnits="userSpaceOnUse" markerWidth="36" orient="auto" refX="32" refY="14">
            <path d="M0,0 L36,14 L0,28 Z" fill={C.violet} />
          </marker>
        </defs>
        <path
          d="M690 518 C850 452 1054 442 1236 476"
          fill="none"
          stroke="url(#storageUploadGradient)"
          strokeDasharray="820"
          strokeDashoffset={dash}
          strokeLinecap="round"
          strokeWidth="8"
          markerEnd="url(#storageArrow)"
          opacity={0.74 * progress}
          style={{filter: 'drop-shadow(0 0 14px rgba(139,92,246,0.62))'}}
        />
      </svg>
      <div
        style={{
          ...styles.packet,
          opacity: Math.min(pack, progress * 1.4),
          left: packetX,
          top: packetY,
        }}
      >
        proof bundle
      </div>
    </>
  );
};

const ChainRail = ({opacity}: {opacity: number}) => (
  <div style={{...styles.chainRail, opacity}}>
    <div style={styles.chainHeader}>
      <span>0G Chain Contract</span>
      <b>PROOF_SUBMITTED</b>
    </div>
    <div style={styles.chainTrack}>
      {['COMMITTED', 'ESCROW_LOCKED', 'PROOF_SUBMITTED', 'VERIFIED'].map((label, index) => {
        const active = index <= 2;
        return (
          <div key={label} style={styles.chainStep}>
            <div
              style={{
                ...styles.chainDot,
                background: active
                  ? index === 2
                    ? C.purple
                    : index === 1
                      ? C.amber
                      : C.emerald
                  : 'rgba(15,23,42,0.95)',
                borderColor: active ? 'rgba(248,250,252,0.38)' : 'rgba(148,163,184,0.24)',
                boxShadow: active ? '0 0 30px rgba(139,92,246,0.34)' : 'none',
              }}
            />
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  </div>
);

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

const fadeForIndex = (progress: number, index: number) =>
  interpolate(progress, [index * 0.18, index * 0.18 + 0.36], [0.3, 1], {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

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
      'radial-gradient(circle at 70% 44%, rgba(139,92,246,0.22), transparent 32%), radial-gradient(circle at 40% 55%, rgba(34,211,238,0.14), transparent 28%), radial-gradient(circle at 18% 62%, rgba(16,185,129,0.10), transparent 26%), linear-gradient(180deg, rgba(2,6,23,0.20), rgba(2,6,23,0.94))',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    opacity: 0.2,
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
  titleBlock: {
    position: 'absolute',
    left: 68,
    top: 148,
    width: 640,
    zIndex: 7,
  },
  eyebrow: {
    marginBottom: 18,
    color: C.violet,
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
  },
  h1: {
    margin: 0,
    width: 620,
    fontSize: 70,
    lineHeight: 1,
    letterSpacing: 0,
  },
  lede: {
    margin: '24px 0 0',
    width: 360,
    color: '#cbd5e1',
    fontSize: 24,
    lineHeight: 1.42,
  },
  sellerWrap: {
    position: 'absolute',
    left: 100,
    bottom: 218,
    width: 260,
    height: 260,
    zIndex: 5,
  },
  seller: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 28px 52px rgba(0,0,0,0.44))',
  },
  sellerLabel: {
    position: 'absolute',
    left: 56,
    top: -4,
    padding: '8px 12px',
    border: '1px solid rgba(16,185,129,0.32)',
    borderRadius: 999,
    background: 'rgba(5,46,22,0.68)',
    color: '#bbf7d0',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  bundle: {
    position: 'absolute',
    left: 456,
    top: 354,
    zIndex: 12,
    width: 410,
    padding: 24,
    border: '1px solid rgba(34,211,238,0.34)',
    borderRadius: 24,
    background: C.panelStrong,
    boxShadow: '0 34px 90px rgba(0,0,0,0.34), 0 0 40px rgba(34,211,238,0.12)',
  },
  bundleKicker: {
    display: 'block',
    marginBottom: 8,
    color: C.cyan,
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  bundleTitle: {
    display: 'block',
    marginBottom: 20,
    color: C.text,
    fontSize: 27,
    lineHeight: 1.08,
  },
  bundleRows: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '11px 18px',
    color: C.muted,
    fontSize: 16,
  },
  bundleFooter: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 10,
    marginTop: 22,
  },
  bundleShard: {
    height: 10,
    borderRadius: 999,
    background: `linear-gradient(90deg, ${C.cyan}, ${C.purple})`,
    boxShadow: '0 0 18px rgba(34,211,238,0.28)',
  },
  pathSvg: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
    pointerEvents: 'none',
  },
  packet: {
    position: 'absolute',
    zIndex: 14,
    padding: '9px 13px',
    border: '1px solid rgba(167,139,250,0.46)',
    borderRadius: 999,
    background: 'rgba(30,27,75,0.92)',
    color: '#ede9fe',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    transform: 'translate(-50%, -50%)',
    boxShadow: '0 0 28px rgba(139,92,246,0.28)',
  },
  archive: {
    position: 'absolute',
    right: 86,
    top: 206,
    zIndex: 9,
    width: 640,
    height: 450,
    padding: 28,
    border: '1px solid rgba(167,139,250,0.34)',
    borderRadius: 28,
    background:
      'linear-gradient(180deg, rgba(34,22,68,0.86), rgba(13,20,36,0.92))',
  },
  archiveKicker: {
    display: 'block',
    marginBottom: 8,
    color: '#ddd6fe',
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  archiveTitle: {
    display: 'block',
    color: C.text,
    fontSize: 42,
    lineHeight: 1.05,
  },
  archiveWatermark: {
    position: 'absolute',
    right: 30,
    top: 18,
    color: 'rgba(167,139,250,0.12)',
    fontSize: 128,
    fontWeight: 950,
    lineHeight: 1,
  },
  archiveCore: {
    position: 'absolute',
    right: 42,
    top: 118,
    width: 170,
    height: 170,
    display: 'grid',
    placeItems: 'center',
  },
  archiveCube: {
    width: 88,
    height: 88,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 22,
    background: 'linear-gradient(135deg, rgba(139,92,246,0.92), rgba(34,211,238,0.42))',
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: 950,
    boxShadow: '0 0 48px rgba(139,92,246,0.48)',
  },
  archiveRings: {
    position: 'absolute',
    inset: 0,
    border: '2px solid rgba(34,211,238,0.26)',
    borderRadius: 999,
    boxShadow: 'inset 0 0 30px rgba(139,92,246,0.18)',
  },
  archiveGrid: {
    position: 'absolute',
    left: 34,
    right: 234,
    top: 144,
    height: 198,
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gridTemplateRows: 'repeat(4, 1fr)',
    gap: 12,
  },
  archiveNode: {
    border: '1px solid rgba(167,139,250,0.28)',
    borderRadius: 12,
    boxShadow: 'inset 0 0 20px rgba(139,92,246,0.10)',
  },
  archiveBase: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 24,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 18,
    paddingTop: 16,
    borderTop: '1px solid rgba(167,139,250,0.24)',
    color: C.muted,
    fontSize: 15,
  },
  referenceCard: {
    position: 'absolute',
    right: 112,
    top: 660,
    zIndex: 14,
    width: 430,
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '6px 18px',
    padding: 14,
    border: '1px solid rgba(34,211,238,0.30)',
    borderRadius: 22,
    background: 'rgba(8,47,73,0.86)',
    color: '#bae6fd',
    fontSize: 14,
    boxShadow: '0 0 42px rgba(34,211,238,0.12)',
  },
  referenceKicker: {
    gridColumn: '1 / -1',
    color: C.cyan,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  chainRail: {
    position: 'absolute',
    left: 64,
    right: 64,
    bottom: 172,
    zIndex: 15,
    height: 150,
    padding: '20px 24px',
    border: '1px solid rgba(139,92,246,0.34)',
    borderRadius: 24,
    background: 'rgba(8,13,27,0.92)',
    boxShadow: '0 0 48px rgba(139,92,246,0.14)',
  },
  chainHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#ede9fe',
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  chainTrack: {
    position: 'absolute',
    left: 76,
    right: 76,
    top: 60,
    height: 46,
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    borderTop: '3px solid rgba(148,163,184,0.22)',
  },
  chainStep: {
    position: 'relative',
    display: 'grid',
    justifyItems: 'center',
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: 850,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  chainDot: {
    width: 42,
    height: 42,
    marginTop: -22,
    border: '1px solid rgba(248,250,252,0.38)',
    borderRadius: 999,
  },
  chainRefs: {
    position: 'absolute',
    left: 74,
    right: 74,
    bottom: 20,
    display: 'flex',
    justifyContent: 'center',
    gap: 32,
    color: '#cffafe',
    fontSize: 15,
    fontWeight: 800,
  },
  caption: {
    position: 'absolute',
    left: 64,
    right: 64,
    bottom: 42,
    zIndex: 16,
    display: 'grid',
    gridTemplateColumns: '0.9fr 1.25fr',
    gap: 22,
    alignItems: 'stretch',
  },
  captionText: {
    display: 'flex',
    alignItems: 'center',
    padding: '24px 28px',
    border: '1px solid rgba(167,139,250,0.34)',
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
