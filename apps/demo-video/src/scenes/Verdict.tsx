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
  panel: 'rgba(9, 14, 27, 0.88)',
  text: '#f8fafc',
  muted: '#94a3b8',
  amber: '#f59e0b',
  cyan: '#22d3ee',
  purple: '#8b5cf6',
  emerald: '#10b981',
  blue: '#60a5fa',
  rose: '#fb7185',
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const interp = (frame: number, input: [number, number], output: [number, number]) =>
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

export const Verdict = () => {
  const frame = useCurrentFrame();

  const passProgress = interp(frame, [56, 120], [0, 1]);
  const failProgress = interp(frame, [84, 148], [0, 1]);
  const captionOpacity = fade(frame, 128);

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
        <div style={styles.shotLabel}>Scene 09 / Verdict</div>
      </header>

      <section style={styles.titleBlock}>
        <div style={styles.eyebrow}>Contract Verdict</div>
        <h1 style={styles.h1}>PASS settles. FAIL refunds.</h1>
        <p style={styles.lede}>The 0G Chain contract executes the outcome.</p>
      </section>

      <div style={styles.vault}>
        <span>0G Chain</span>
        <strong>Escrow Vault</strong>
        <b>locked funds</b>
      </div>

      <Actor side="left" label="Buyer Refund" src="characters/buyer.svg" />
      <Actor side="right" label="Honest Seller Wallet" src="characters/honest_seller.svg" />
      <EvilRejected />
      <VerdictPaths pass={passProgress} fail={failProgress} />

      <Token x={interp(passProgress, [0, 1], [960, 1506])} y={interp(passProgress, [0, 1], [456, 410])} opacity={passProgress} color={C.emerald} />
      <Token x={interp(failProgress, [0, 1], [960, 398])} y={interp(failProgress, [0, 1], [620, 660])} opacity={failProgress} color={C.blue} />

      <div style={{...styles.passCard, opacity: fade(frame, 82)}}>
        <span>PASS</span>
        <strong>Escrow released to Seller</strong>
      </div>

      <div style={{...styles.failCard, opacity: fade(frame, 108)}}>
        <span>FAIL / TIMEOUT</span>
        <strong>Funds refunded to Buyer</strong>
      </div>

      <footer style={{...styles.caption, opacity: captionOpacity}}>
        <span style={styles.captionText}>PASS settles. FAIL refunds.</span>
        <span style={styles.voiceover}>
          If the proof passes, escrow is released to the seller. If proof fails or times out, the buyer is refunded.
        </span>
      </footer>
      <SceneProgress current={8} />
    </AbsoluteFill>
  );
};

const Actor = ({side, label, src}: {side: 'left' | 'right'; label: string; src: string}) => (
  <div style={{...styles.actor, ...(side === 'left' ? styles.actorLeft : styles.actorRight)}}>
    <Img src={staticFile(src)} style={styles.actorImg} />
    <div style={styles.actorLabel}>{label}</div>
  </div>
);

const EvilRejected = () => (
  <div style={styles.evil}>
    <Img src={staticFile('characters/evil_seller.svg')} style={styles.evilImg} />
    <div style={styles.evilBadge}>INVALID PROOF</div>
  </div>
);

const VerdictPaths = ({pass, fail}: {pass: number; fail: number}) => (
  <svg style={styles.pathSvg} viewBox="0 0 1920 1080">
    <defs>
      <marker id="passArrow" markerHeight="28" markerUnits="userSpaceOnUse" markerWidth="36" orient="auto" refX="32" refY="14">
        <path d="M0,0 L36,14 L0,28 Z" fill={C.emerald} />
      </marker>
      <marker id="failArrow" markerHeight="28" markerUnits="userSpaceOnUse" markerWidth="36" orient="auto" refX="32" refY="14">
        <path d="M0,0 L36,14 L0,28 Z" fill={C.blue} />
      </marker>
    </defs>
    <path
      d="M960 456 C1110 394 1320 384 1506 410"
      fill="none"
      stroke={C.emerald}
      strokeDasharray="760"
      strokeDashoffset={760 * (1 - pass)}
      strokeLinecap="round"
      strokeWidth="9"
      markerEnd="url(#passArrow)"
      opacity={0.82 * pass}
      style={{filter: 'drop-shadow(0 0 16px rgba(16,185,129,0.52))'}}
    />
    <path
      d="M960 620 C802 692 600 710 398 660"
      fill="none"
      stroke={C.blue}
      strokeDasharray="760"
      strokeDashoffset={760 * (1 - fail)}
      strokeLinecap="round"
      strokeWidth="9"
      markerEnd="url(#failArrow)"
      opacity={0.78 * fail}
      style={{filter: 'drop-shadow(0 0 16px rgba(96,165,250,0.52))'}}
    />
  </svg>
);

const Token = ({x, y, opacity, color}: {x: number; y: number; opacity: number; color: string}) => (
  <div
    style={{
      ...styles.token,
      left: x,
      top: y,
      opacity,
      background: color,
      boxShadow: `0 0 34px ${color}`,
    }}
  >
    $
  </div>
);

const ProtocolGrid = ({frame}: {frame: number}) => {
  const drift = (frame % 360) * 0.14;
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
      'radial-gradient(circle at 76% 38%, rgba(16,185,129,0.14), transparent 28%), radial-gradient(circle at 30% 58%, rgba(96,165,250,0.14), transparent 31%), radial-gradient(circle at 53% 52%, rgba(139,92,246,0.18), transparent 32%), linear-gradient(180deg, rgba(2,6,23,0.18), rgba(2,6,23,0.94))',
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
  titleBlock: {position: 'absolute', left: 68, top: 148, width: 660, zIndex: 7},
  eyebrow: {
    marginBottom: 18,
    color: C.amber,
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
  },
  h1: {margin: 0, width: 650, fontSize: 68, lineHeight: 1, letterSpacing: 0},
  lede: {margin: '24px 0 0', width: 480, color: '#cbd5e1', fontSize: 24, lineHeight: 1.42},
  vault: {
    position: 'absolute',
    left: '50%',
    top: 390,
    zIndex: 12,
    width: 260,
    height: 210,
    display: 'grid',
    placeItems: 'center',
    padding: 24,
    border: '1px solid rgba(245,158,11,0.38)',
    borderRadius: 34,
    background: 'linear-gradient(180deg, rgba(69,26,3,0.90), rgba(13,20,36,0.94))',
    boxShadow: '0 0 64px rgba(245,158,11,0.20)',
    transform: 'translateX(-50%)',
    textAlign: 'center',
  },
  actor: {position: 'absolute', zIndex: 8, width: 310, height: 310},
  actorLeft: {left: 194, top: 538},
  actorRight: {right: 164, top: 270},
  actorImg: {width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 30px 58px rgba(0,0,0,0.46))'},
  actorLabel: {
    position: 'absolute',
    left: 54,
    bottom: 0,
    padding: '9px 13px',
    border: '1px solid rgba(34,211,238,0.30)',
    borderRadius: 999,
    background: 'rgba(8,47,73,0.82)',
    color: '#cffafe',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  evil: {position: 'absolute', right: 174, top: 600, zIndex: 7, width: 230, height: 230, opacity: 0.62, filter: 'grayscale(0.25)'},
  evilImg: {width: '100%', height: '100%', objectFit: 'contain'},
  evilBadge: {
    position: 'absolute',
    left: 10,
    bottom: 16,
    padding: '8px 12px',
    border: '1px solid rgba(251,113,133,0.36)',
    borderRadius: 999,
    background: 'rgba(76,5,25,0.82)',
    color: '#fecdd3',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.08em',
  },
  pathSvg: {position: 'absolute', inset: 0, zIndex: 11, pointerEvents: 'none'},
  token: {
    position: 'absolute',
    zIndex: 16,
    width: 54,
    height: 54,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 999,
    color: '#03121f',
    fontSize: 28,
    fontWeight: 950,
    transform: 'translate(-50%, -50%)',
  },
  passCard: {
    position: 'absolute',
    right: 444,
    top: 292,
    zIndex: 15,
    width: 330,
    display: 'grid',
    gap: 8,
    padding: 18,
    border: '1px solid rgba(16,185,129,0.36)',
    borderRadius: 20,
    background: 'rgba(5,46,22,0.82)',
    color: '#dcfce7',
  },
  failCard: {
    position: 'absolute',
    left: 438,
    top: 656,
    zIndex: 15,
    width: 330,
    display: 'grid',
    gap: 8,
    padding: 18,
    border: '1px solid rgba(96,165,250,0.36)',
    borderRadius: 20,
    background: 'rgba(8,47,73,0.82)',
    color: '#dbeafe',
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
    border: '1px solid rgba(245,158,11,0.34)',
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
