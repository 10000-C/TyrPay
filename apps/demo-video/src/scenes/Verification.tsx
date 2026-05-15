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
  emerald: '#10b981',
  rose: '#fb7185',
  blue: '#60a5fa',
};

const checks = [
  ['Proof valid', 'receipt signature accepted'],
  ['Provider matched', 'identity equals commitment'],
  ['Task + commitment matched', 'taskId and commitmentHash bind'],
  ['Usage + deadline satisfied', 'limits and time window pass'],
  ['Replay protection', 'proof has not been reused'],
  ['0G Storage available', 'proof bundle can be retrieved'],
];

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

export const Verification = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const verifierPop = spring({
    frame: frame - 58,
    fps,
    config: {damping: 21, stiffness: 135},
  });
  const guideIn = interp(frame, [90, 128], [60, 0]);
  const scanProgress = interp(frame, [132, 292], [0, 1]);
  const boundaryOpacity = fade(frame, 180);
  const chainOpacity = fade(frame, 306);
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
        <div style={styles.eyebrow}>Settlement Decision</div>
        <h1 style={styles.h1}>Verification decides payment.</h1>
        <p style={styles.lede}>The verifier checks whether the seller earned settlement.</p>
      </section>

      <GateExpansion frame={frame} />

      <div
        style={{
          ...styles.verifier,
          opacity: verifierPop,
          transform: `translateY(${interpolate(verifierPop, [0, 1], [26, 0])}px) scale(${0.92 + verifierPop * 0.08})`,
        }}
      >
        <span style={styles.verifierKicker}>Verifier Panel</span>
        <strong style={styles.verifierQuestion}>Has the seller earned settlement?</strong>
        <div style={styles.checkList}>
          {checks.map(([label, detail], index) => {
            const itemOpacity = fade(frame, 130 + index * 22);
            const passed = scanProgress > (index + 0.55) / checks.length;
            return (
              <div key={label} style={{...styles.checkRow, opacity: itemOpacity}}>
                <div
                  style={{
                    ...styles.checkDot,
                    background: passed ? C.emerald : 'rgba(15,23,42,0.95)',
                    borderColor: passed ? 'rgba(187,247,208,0.62)' : 'rgba(148,163,184,0.28)',
                    boxShadow: passed ? '0 0 28px rgba(16,185,129,0.38)' : 'none',
                  }}
                >
                  {passed ? 'OK' : ''}
                </div>
                <div>
                  <b style={styles.checkLabel}>{label}</b>
                  <span style={styles.checkDetail}>{detail}</span>
                </div>
              </div>
            );
          })}
        </div>
        <ScanLine progress={scanProgress} />
      </div>

      <div
        style={{
          ...styles.guideWrap,
          opacity: fade(frame, 38),
          transform: `translateX(${guideIn}px)`,
        }}
      >
        <Img src={staticFile('characters/tyr.svg')} style={styles.guide} />
        <div style={styles.guideLabel}>Tyr Guide scans proof</div>
      </div>

      <InvalidProof opacity={fade(frame, 146)} />

      <div style={{...styles.boundary, opacity: boundaryOpacity}}>
        <span>Boundary</span>
        <strong>TyrPay does not judge answer quality.</strong>
        <b>It verifies committed execution.</b>
      </div>

      <ChainRail opacity={chainOpacity} />

      <SceneProgress current={7} />
    </AbsoluteFill>
  );
};

const GateExpansion = ({frame}: {frame: number}) => (
  <div style={{...styles.gateExpansion, opacity: fade(frame, 24)}}>
    <div style={styles.gateShield}>
      <span>TyrPay</span>
      <strong>Gate</strong>
    </div>
    <div style={styles.layerStack}>
      {[
        ['Verifier Panel', 'checks settlement conditions'],
        ['0G Storage Reference', 'proof bundle available'],
        ['0G Chain Contract', 'escrow + settlement state'],
      ].map(([label, detail], index) => (
        <div key={label} style={{...styles.layerCard, opacity: fade(frame, 56 + index * 18)}}>
          <div style={styles.layerIcon}>{index + 1}</div>
          <div>
            <b style={styles.layerLabel}>{label}</b>
            <span style={styles.layerDetail}>{detail}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const ScanLine = ({progress}: {progress: number}) => (
  <div
    style={{
      ...styles.scanLine,
      top: `${18 + progress * 72}%`,
      opacity: progress > 0 && progress < 1 ? 0.9 : 0.2,
    }}
  />
);

const InvalidProof = ({opacity}: {opacity: number}) => (
  <div style={{...styles.invalid, opacity}}>
    <span>Fake Log</span>
    <strong>INVALID</strong>
    <b>replay proof rejected</b>
  </div>
);

const ChainRail = ({opacity}: {opacity: number}) => (
  <div style={{...styles.chainRail, opacity}}>
    <div style={styles.chainHeader}>
      <span>0G Chain Settlement Core</span>
      <b>VERIFICATION_RUNNING</b>
    </div>
    <div style={styles.chainTrack}>
      {['COMMITTED', 'ESCROW_LOCKED', 'PROOF_SUBMITTED', 'VERIFIED'].map((label, index) => {
        const active = index <= 2;
        return (
          <div key={label} style={styles.chainStep}>
            <div
              style={{
                ...styles.chainDot,
                background: active ? [C.emerald, C.amber, C.purple][index] : 'rgba(15,23,42,0.95)',
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
      'radial-gradient(circle at 53% 42%, rgba(34,211,238,0.16), transparent 28%), radial-gradient(circle at 72% 48%, rgba(139,92,246,0.20), transparent 31%), radial-gradient(circle at 24% 64%, rgba(245,158,11,0.08), transparent 27%), linear-gradient(180deg, rgba(2,6,23,0.20), rgba(2,6,23,0.94))',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    opacity: 0.19,
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
    width: 600,
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
    width: 500,
    fontSize: 62,
    lineHeight: 1,
    letterSpacing: 0,
  },
  lede: {
    margin: '24px 0 0',
    width: 470,
    color: '#cbd5e1',
    fontSize: 24,
    lineHeight: 1.42,
  },
  gateExpansion: {
    position: 'absolute',
    left: 76,
    top: 468,
    zIndex: 9,
    display: 'grid',
    gridTemplateColumns: '130px 1fr',
    alignItems: 'center',
    gap: 18,
    width: 460,
  },
  gateShield: {
    width: 118,
    height: 150,
    display: 'grid',
    justifyItems: 'center',
    alignContent: 'center',
    gap: 8,
    clipPath: 'polygon(50% 0%, 88% 14%, 82% 68%, 50% 100%, 18% 68%, 12% 14%)',
    background:
      'linear-gradient(180deg, rgba(245,158,11,0.50), rgba(139,92,246,0.32), rgba(34,211,238,0.20))',
    color: '#fde68a',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    boxShadow: '0 0 44px rgba(245,158,11,0.22)',
  },
  layerStack: {
    display: 'grid',
    gap: 10,
  },
  layerCard: {
    display: 'grid',
    gridTemplateColumns: '42px 1fr',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    border: '1px solid rgba(34,211,238,0.24)',
    borderRadius: 18,
    background: C.panel,
    boxShadow: '0 0 34px rgba(34,211,238,0.08)',
  },
  layerIcon: {
    width: 34,
    height: 34,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 999,
    background: C.cyan,
    color: '#082f49',
    fontSize: 14,
    fontWeight: 950,
  },
  layerLabel: {
    display: 'block',
    color: C.text,
    fontSize: 15,
    lineHeight: 1.1,
  },
  layerDetail: {
    display: 'block',
    marginTop: 4,
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 1.15,
  },
  verifier: {
    position: 'absolute',
    left: 586,
    top: 210,
    zIndex: 14,
    width: 620,
    height: 552,
    padding: 30,
    border: '1px solid rgba(34,211,238,0.38)',
    borderRadius: 28,
    background: C.panelStrong,
    boxShadow: '0 40px 110px rgba(0,0,0,0.36), 0 0 54px rgba(34,211,238,0.12)',
  },
  verifierKicker: {
    display: 'block',
    marginBottom: 10,
    color: C.cyan,
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  verifierQuestion: {
    display: 'block',
    width: 500,
    color: C.text,
    fontSize: 36,
    lineHeight: 1.08,
  },
  checkList: {
    display: 'grid',
    gap: 10,
    marginTop: 24,
  },
  checkRow: {
    display: 'grid',
    gridTemplateColumns: '48px 1fr',
    alignItems: 'center',
    gap: 14,
    padding: '8px 12px',
    border: '1px solid rgba(148,163,184,0.14)',
    borderRadius: 18,
    background: 'rgba(15,23,42,0.64)',
  },
  checkDot: {
    width: 38,
    height: 38,
    display: 'grid',
    placeItems: 'center',
    border: '1px solid rgba(148,163,184,0.28)',
    borderRadius: 999,
    color: '#dcfce7',
    fontSize: 11,
    fontWeight: 950,
  },
  checkLabel: {
    display: 'block',
    color: C.text,
    fontSize: 16,
    lineHeight: 1.1,
  },
  checkDetail: {
    display: 'block',
    marginTop: 4,
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 1.15,
  },
  scanLine: {
    position: 'absolute',
    left: 24,
    right: 24,
    height: 2,
    borderRadius: 999,
    background: `linear-gradient(90deg, transparent, ${C.cyan}, transparent)`,
    boxShadow: '0 0 18px rgba(34,211,238,0.54)',
  },
  guideWrap: {
    position: 'absolute',
    right: 116,
    top: 254,
    zIndex: 12,
    width: 292,
    height: 292,
  },
  guide: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 30px 64px rgba(0,0,0,0.46))',
  },
  guideLabel: {
    position: 'absolute',
    left: 18,
    bottom: -6,
    padding: '9px 13px',
    border: '1px solid rgba(245,158,11,0.38)',
    borderRadius: 999,
    background: 'rgba(69,26,3,0.72)',
    color: '#fde68a',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  invalid: {
    position: 'absolute',
    right: 114,
    top: 578,
    zIndex: 12,
    width: 300,
    display: 'grid',
    gap: 8,
    padding: 18,
    border: '1px solid rgba(251,113,133,0.34)',
    borderRadius: 20,
    background: 'rgba(76,5,25,0.70)',
    color: '#fecdd3',
    boxShadow: '0 0 36px rgba(251,113,133,0.12)',
  },
  boundary: {
    position: 'absolute',
    right: 114,
    top: 148,
    zIndex: 16,
    width: 430,
    display: 'grid',
    gap: 7,
    padding: 18,
    border: '1px solid rgba(245,158,11,0.36)',
    borderRadius: 22,
    background: 'rgba(69,26,3,0.86)',
    boxShadow: '0 0 42px rgba(245,158,11,0.16)',
  },
  chainRail: {
    position: 'absolute',
    left: 64,
    right: 64,
    bottom: 152,
    zIndex: 11,
    height: 142,
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
    top: 72,
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
  caption: {
    position: 'absolute',
    left: 64,
    right: 64,
    bottom: 42,
    zIndex: 18,
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
