import React, {useMemo} from 'react';
import {Text} from '@react-three/drei';
import {useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  AdditiveBlending,
  CatmullRomCurve3,
  Color,
  TubeGeometry,
  Vector3,
} from 'three';

const palette = {
  bg: '#050812',
  panel: 'rgba(9, 14, 27, 0.78)',
  panelStrong: 'rgba(13, 20, 36, 0.92)',
  line: 'rgba(148, 163, 184, 0.22)',
  text: '#f8fafc',
  muted: '#94a3b8',
  amber: '#f59e0b',
  cyan: '#22d3ee',
  emerald: '#10b981',
  blue: '#60a5fa',
  rose: '#f43f5e',
};

const states = ['INTENT', 'COMMITMENT', 'FUNDED', 'PROOF', 'SETTLED'];

const scriptLines = [
  {start: 0, end: 46, text: '"Done" is not a settlement condition.'},
  {start: 36, end: 100, text: 'TyrPay locks payment behind a verifiable commitment.'},
  {start: 92, end: 150, text: 'Proof passes. The contract releases escrow.'},
];

const checks = ['task context matched', 'model + usage satisfied', 'proof not consumed'];

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const fade = (frame: number, start: number, end: number) => {
  return interpolate(frame, [start, start + 10, end - 10, end], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

const smooth = (frame: number, input: [number, number], output: [number, number]) => {
  return interpolate(frame, input, output, {
    easing: Easing.bezier(0.2, 0.9, 0.18, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

export const TyrPayOpening5s = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  const titleOpacity = fade(frame, 4, 142);
  const claimOpacity = fade(frame, 0, 50);
  const reportOpacity = fade(frame, 88, 148);
  const railProgress = smooth(frame, [25, 142], [0, 1]);

  return (
    <AbsoluteFill style={styles.root}>
      <div style={styles.backdrop} />
      <ParticleField frame={frame} />

      <ThreeCanvas
        width={width}
        height={height}
        camera={{position: [6, 2.8, 8], fov: 42, near: 0.1, far: 100}}
        gl={{antialias: true, alpha: true}}
        dpr={1.5}
      >
        <CinematicScene />
      </ThreeCanvas>

      <div style={styles.vignette} />
      <TopBar frame={frame} />

      <section
        style={{
          ...styles.title,
          opacity: titleOpacity,
          transform: `translateY(${interpolate(titleOpacity, [0, 1], [18, 0])}px)`,
        }}
      >
        <div style={styles.eyebrow}>Hackathon Demo Opening</div>
        <h1 style={styles.h1}>Proof before pay.</h1>
        <p style={styles.lede}>
          AI agents can trade services only when a promise becomes verifiable settlement.
        </p>
      </section>

      <div
        style={{
          ...styles.cameraNote,
          opacity: fade(frame, 42, 116),
          transform: `translateY(${smooth(frame, [42, 62], [12, 0])}px)`,
        }}
      >
        <span style={styles.noteDot} />
        Camera move: claim bubble to escrow vault to verifier report
      </div>

      <div
        style={{
          ...styles.claimBubble,
          opacity: claimOpacity,
          transform: `translateY(${smooth(frame, [0, 15], [18, 0])}px) scale(${smooth(frame, [0, 15], [0.96, 1])})`,
        }}
      >
        <span style={styles.claimSmall}>Seller Agent</span>
        <strong style={styles.claimText}>
          Done<span style={{color: palette.rose}}>?</span>
        </strong>
      </div>

      <ReportPanel frame={frame} opacity={reportOpacity} />

      <div style={styles.hud}>
        <StateRail progress={railProgress} frame={frame} />
        <ScriptPanel frame={frame} />
      </div>
    </AbsoluteFill>
  );
};

const CinematicScene = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const proofProgress = smooth(frame, [52, 118], [0, 1]);
  const vaultSpring = spring({frame: frame - 18, fps, config: {damping: 18, stiffness: 120}});

  return (
    <>
      <CameraRig />
      <color attach="background" args={[palette.bg]} />
      <fog attach="fog" args={[palette.bg, 9, 28]} />
      <ambientLight intensity={0.42} />
      <directionalLight position={[-4, 7, 6]} intensity={2.7} color="#9ee7ff" />
      <pointLight position={[3.8, 2.6, 3.4]} intensity={86} color={palette.amber} />
      <pointLight position={[-2, 1.5, 0]} intensity={52 + proofProgress * 42} color={palette.cyan} />
      <GridFloor />
      <AgentNode position={[-4.4, 0.55, -1.4]} accent={palette.amber} title="BUYER" body="VALIDATES COMMITMENT" />
      <AgentNode position={[4.2, 0.55, -1.2]} accent={palette.cyan} title="SELLER" body="SUBMITS PROOF" />
      <AgentNode position={[-2.8, 1.7, -4.4]} accent={palette.blue} title="STORAGE" body="PROOFBUNDLE URI" small />
      <AgentNode position={[2.4, 1.72, -4.3]} accent={palette.emerald} title="VERIFIER" body="SIGNS PASS" small />
      <EscrowVault springValue={vaultSpring} frame={frame} />
      <ProofNetwork progress={proofProgress} frame={frame} />
      <TaskContextRibbon frame={frame} />
    </>
  );
};

const CameraRig = () => {
  const frame = useCurrentFrame();
  const {camera} = useThree();

  const cameraPath = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(6.2, 2.8, 8.4),
        new Vector3(3.9, 2.2, 5.4),
        new Vector3(0.0, 2.25, 5.1),
        new Vector3(-1.0, 2.0, 6.6),
      ]),
    [],
  );

  const lookPath = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(3.6, 1.15, -1.1),
        new Vector3(1.0, 0.62, -1.5),
        new Vector3(0.0, 0.35, -1.55),
        new Vector3(0.7, 1.4, -3.6),
      ]),
    [],
  );

  const t = smooth(frame, [0, 149], [0, 1]);
  camera.position.copy(cameraPath.getPoint(t));
  camera.lookAt(lookPath.getPoint(clamp(t + 0.04)));
  camera.updateProjectionMatrix();

  return null;
};

const GridFloor = () => {
  return (
    <gridHelper
      args={[24, 48, new Color('#1f3b5b'), new Color('#10223a')]}
      position={[0, -1.45, -1.2]}
    />
  );
};

const AgentNode = ({
  position,
  accent,
  title,
  body,
  small = false,
}: {
  position: [number, number, number];
  accent: string;
  title: string;
  body: string;
  small?: boolean;
}) => {
  const frame = useCurrentFrame();
  const pulse = 0.7 + Math.sin(frame / 10 + position[0]) * 0.12;
  const scale = small ? 0.75 : 1;

  return (
    <group position={position} scale={scale}>
      <mesh>
        <boxGeometry args={[2.45, 1.05, 0.16]} />
        <meshStandardMaterial
          color="#0f172a"
          emissive={accent}
          emissiveIntensity={0.08 + pulse * 0.09}
          roughness={0.32}
          metalness={0.22}
        />
      </mesh>
      <mesh position={[-0.72, 0.09, 0.11]}>
        <boxGeometry args={[0.52, 0.42, 0.06]} />
        <meshStandardMaterial color="#111827" emissive={accent} emissiveIntensity={0.22} />
      </mesh>
      <mesh position={[-0.82, 0.12, 0.16]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      <mesh position={[-0.62, 0.12, 0.16]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      <Text
        position={[0.36, 0.19, 0.13]}
        fontSize={0.16}
        anchorX="center"
        anchorY="middle"
        color={accent}
        material-toneMapped={false}
      >
        {title}
      </Text>
      <Text
        position={[0.36, -0.12, 0.13]}
        fontSize={0.105}
        anchorX="center"
        anchorY="middle"
        color="#cbd5e1"
        material-toneMapped={false}
      >
        {body}
      </Text>
    </group>
  );
};

const EscrowVault = ({frame, springValue}: {frame: number; springValue: number}) => {
  const unlock = smooth(frame, [112, 145], [0, 1]);
  const ringColor = unlock > 0.58 ? palette.emerald : palette.amber;

  return (
    <group position={[0, 0.28, -1.6]} scale={0.92 + springValue * 0.08} rotation={[0, -0.28, 0]}>
      <mesh rotation={[0, Math.sin(frame / 30) * 0.08, 0]}>
        <boxGeometry args={[2.25, 1.35, 1.35]} />
        <meshStandardMaterial
          color="#111827"
          emissive="#2a1800"
          emissiveIntensity={0.24 + unlock * 0.32}
          metalness={0.86}
          roughness={0.28}
        />
      </mesh>
      <mesh position={[0, 0, 0.72]} rotation={[Math.PI / 2, 0, frame * 0.08 + unlock * 0.7]}>
        <torusGeometry args={[0.56, 0.055, 20, 96]} />
        <meshStandardMaterial
          color={ringColor}
          emissive={ringColor}
          emissiveIntensity={1.1 + unlock * 0.8}
          metalness={0.65}
          roughness={0.18}
        />
      </mesh>
      <mesh position={[0, 0, 0.76]} rotation={[frame * 0.03, frame * 0.04, 0]}>
        <icosahedronGeometry args={[0.36, 2]} />
        <meshStandardMaterial
          color={unlock > 0.58 ? palette.emerald : palette.cyan}
          emissive={unlock > 0.58 ? palette.emerald : palette.cyan}
          emissiveIntensity={1.4 + unlock * 0.65}
          roughness={0.18}
        />
      </mesh>
      <Text position={[0, -0.93, 0.76]} fontSize={0.14} color="#fde68a" anchorX="center" material-toneMapped={false}>
        ESCROW
      </Text>
    </group>
  );
};

const ProofNetwork = ({progress, frame}: {progress: number; frame: number}) => {
  const curves = useMemo(() => {
    return [
      {
        color: palette.amber,
        geometry: makeTube([
          [-3.3, 0.62, -1.2],
          [-2.2, 0.98, -0.7],
          [-1.1, 0.5, -1.3],
          [-0.45, 0.28, -1.1],
        ]),
      },
      {
        color: palette.cyan,
        geometry: makeTube([
          [3.15, 0.72, -1.2],
          [1.8, 1.8, -2.6],
          [-1.4, 2.1, -3.55],
          [-2.2, 2.1, -4.25],
        ]),
      },
      {
        color: palette.blue,
        geometry: makeTube([
          [-1.7, 2.18, -4.35],
          [-0.2, 2.78, -5.2],
          [1.7, 2.35, -4.55],
        ]),
      },
      {
        color: palette.emerald,
        geometry: makeTube([
          [1.7, 2.12, -4.05],
          [1.0, 1.5, -3.0],
          [0.35, 0.72, -1.2],
        ]),
      },
    ];
  }, []);

  const packetPositions = useMemo(
    () =>
      [
        new CatmullRomCurve3([
          new Vector3(3.15, 0.72, -1.2),
          new Vector3(1.8, 1.8, -2.6),
          new Vector3(-1.4, 2.1, -3.55),
          new Vector3(-2.2, 2.1, -4.25),
        ]),
        new CatmullRomCurve3([
          new Vector3(-1.7, 2.18, -4.35),
          new Vector3(-0.2, 2.78, -5.2),
          new Vector3(1.7, 2.35, -4.55),
        ]),
        new CatmullRomCurve3([
          new Vector3(1.7, 2.12, -4.05),
          new Vector3(1.0, 1.5, -3.0),
          new Vector3(0.35, 0.72, -1.2),
        ]),
      ],
    [],
  );

  return (
    <group>
      {curves.map((curve, index) => {
        const visible = clamp(progress * 1.35 - index * 0.18);
        return (
          <mesh key={curve.color} geometry={curve.geometry}>
            <meshBasicMaterial
              color={curve.color}
              transparent
              opacity={0.12 + visible * 0.78}
              blending={AdditiveBlending}
            />
          </mesh>
        );
      })}
      {Array.from({length: 15}, (_, index) => {
        const curve = packetPositions[index % packetPositions.length];
        const t = (progress * 1.25 + index / 15 + frame / 360) % 1;
        const pos = curve.getPoint(t);
        const opacity = progress < 0.08 ? 0 : 0.25 + Math.sin(t * Math.PI) * 0.7;
        return (
          <mesh key={index} position={[pos.x, pos.y, pos.z]} scale={0.72 + Math.sin(frame / 9 + index) * 0.18}>
            <icosahedronGeometry args={[0.08, 1]} />
            <meshBasicMaterial color={palette.cyan} transparent opacity={opacity} blending={AdditiveBlending} />
          </mesh>
        );
      })}
    </group>
  );
};

const makeTube = (points: Array<[number, number, number]>) => {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)));
  return new TubeGeometry(curve, 100, 0.018, 8, false);
};

const TaskContextRibbon = ({frame}: {frame: number}) => {
  const opacity = smooth(frame, [56, 88], [0, 1]) * fade(frame, 56, 128);
  return (
    <group position={[0.15, 1.32, -2.2]} rotation={[0, -0.12, 0]}>
      <mesh>
        <boxGeometry args={[3.9, 0.46, 0.04]} />
        <meshBasicMaterial color="#082f49" transparent opacity={0.34 * opacity} />
      </mesh>
      <Text fontSize={0.13} color="#cffafe" anchorX="center" anchorY="middle" material-toneMapped={false}>
        taskId + taskNonce + commitmentHash + callIntentHash
      </Text>
    </group>
  );
};

const ParticleField = ({frame}: {frame: number}) => {
  const dots = useMemo(() => {
    return Array.from({length: 90}, (_, index) => {
      const x = (Math.sin(index * 18.17) * 0.5 + 0.5) * 1920;
      const y = (Math.cos(index * 9.23) * 0.5 + 0.5) * 1080;
      const size = 1 + ((index * 7) % 3);
      const delay = (index * 11) % 70;
      return {x, y, size, delay};
    });
  }, []);

  return (
    <div style={styles.particles}>
      {dots.map((dot, index) => {
        const twinkle = 0.22 + Math.sin((frame + dot.delay) / 13) * 0.16;
        return (
          <span
            key={index}
            style={{
              position: 'absolute',
              left: dot.x,
              top: dot.y,
              width: dot.size,
              height: dot.size,
              borderRadius: 999,
              background: '#8ecaff',
              opacity: twinkle,
              boxShadow: '0 0 12px rgba(142,202,255,0.7)',
            }}
          />
        );
      })}
    </div>
  );
};

const TopBar = ({frame}: {frame: number}) => {
  return (
    <div style={styles.topbar}>
      <div style={styles.brand}>
        <div style={styles.brandMark}>
          <svg viewBox="0 0 24 24" width="30" height="30">
            <path d="M13 2 4 14h7l-1 8 10-13h-7V2Z" fill="currentColor" />
          </svg>
        </div>
        <span>TyrPay</span>
      </div>
      <div style={styles.timer}>
        <span>5s opening shot</span>
        <div style={styles.timerLine}>
          <div style={{...styles.timerFill, width: `${(frame / 149) * 100}%`}} />
        </div>
      </div>
    </div>
  );
};

const ReportPanel = ({frame, opacity}: {frame: number; opacity: number}) => {
  return (
    <aside
      style={{
        ...styles.report,
        opacity,
        transform: `translateY(${smooth(frame, [88, 110], [20, 0])}px)`,
      }}
    >
      <div style={styles.reportHead}>
        <span>Verifier Report</span>
        <span style={styles.passPill}>PASS</span>
      </div>
      {checks.map((check, index) => {
        const lineOpacity = smooth(frame, [96 + index * 8, 106 + index * 8], [0.28, 1]);
        return (
          <div key={check} style={{...styles.check, opacity: lineOpacity}}>
            <span>{check}</span>
            <b style={styles.trueText}>true</b>
          </div>
        );
      })}
    </aside>
  );
};

const StateRail = ({progress, frame}: {progress: number; frame: number}) => {
  return (
    <section style={styles.stateRail}>
      <div style={styles.railHeader}>
        <span>Canonical task state</span>
        <span>Contract enforced</span>
      </div>
      <div style={styles.rail}>
        <div style={{...styles.railBack}} />
        <div style={{...styles.railFill, width: `${progress * 84}%`}} />
        {states.map((state, index) => {
          const active = frame >= 22 + index * 27;
          const final = state === 'SETTLED' && frame > 126;
          return (
            <div key={state} style={styles.state}>
              <span
                style={{
                  ...styles.stateDot,
                  background: active ? (final ? palette.emerald : palette.cyan) : '#0f172a',
                  borderColor: active ? '#cffafe' : 'rgba(148,163,184,0.34)',
                  boxShadow: active
                    ? `0 0 28px ${final ? 'rgba(16,185,129,0.72)' : 'rgba(34,211,238,0.7)'}`
                    : 'none',
                }}
              />
              <span>{state}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const ScriptPanel = ({frame}: {frame: number}) => {
  return (
    <section style={styles.scriptPanel}>
      <strong style={styles.scriptHead}>First 5 seconds script</strong>
      <div style={{position: 'relative', minHeight: 58}}>
        {scriptLines.map((line) => (
          <p
            key={line.text}
            style={{
              ...styles.scriptLine,
              opacity: fade(frame, line.start, line.end),
              transform: `translateY(${interpolate(
                fade(frame, line.start, line.end),
                [0, 1],
                [10, 0],
              )}px)`,
            }}
          >
            {line.text}
          </p>
        ))}
      </div>
    </section>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    background: palette.bg,
    color: palette.text,
    overflow: 'hidden',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(circle at 56% 48%, rgba(34,211,238,0.14), transparent 30%), radial-gradient(circle at 43% 44%, rgba(245,158,11,0.12), transparent 24%), linear-gradient(180deg, rgba(2,6,23,0.2), rgba(2,6,23,0.82))',
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background:
      'radial-gradient(circle at 50% 45%, transparent 42%, rgba(0,0,0,0.5) 100%), linear-gradient(180deg, rgba(2,6,23,0.18), rgba(2,6,23,0.7))',
  },
  particles: {
    position: 'absolute',
    inset: 0,
  },
  topbar: {
    position: 'absolute',
    left: 56,
    right: 56,
    top: 42,
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
    letterSpacing: '-0.02em',
  },
  brandMark: {
    width: 54,
    height: 54,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 17,
    color: '#08111f',
    background: `linear-gradient(135deg, #fbbf24, ${palette.amber})`,
    boxShadow: '0 0 34px rgba(245,158,11,0.46)',
  },
  timer: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    color: '#dbeafe',
    fontSize: 15,
    fontWeight: 850,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
  },
  timerLine: {
    width: 190,
    height: 4,
    overflow: 'hidden',
    borderRadius: 999,
    background: 'rgba(148,163,184,0.22)',
  },
  timerFill: {
    height: '100%',
    borderRadius: 999,
    background: `linear-gradient(90deg, ${palette.amber}, ${palette.cyan}, ${palette.emerald})`,
  },
  title: {
    position: 'absolute',
    left: 64,
    top: 154,
    zIndex: 6,
    width: 620,
  },
  eyebrow: {
    marginBottom: 18,
    color: palette.cyan,
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
  },
  h1: {
    margin: 0,
    fontSize: 96,
    lineHeight: 0.92,
    letterSpacing: '-0.067em',
  },
  lede: {
    margin: '26px 0 0',
    width: 520,
    color: '#cbd5e1',
    fontSize: 25,
    lineHeight: 1.42,
  },
  cameraNote: {
    position: 'absolute',
    left: 64,
    top: 472,
    zIndex: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    border: '1px solid rgba(245,158,11,0.26)',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.72)',
    color: '#fed7aa',
    fontSize: 16,
    fontWeight: 850,
  },
  noteDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    background: palette.amber,
    boxShadow: '0 0 18px rgba(245,158,11,0.9)',
  },
  claimBubble: {
    position: 'absolute',
    right: 172,
    top: 150,
    zIndex: 9,
    width: 380,
    padding: '22px 24px',
    border: '1px solid rgba(248,250,252,0.24)',
    borderRadius: '24px 24px 7px 24px',
    background: 'rgba(248,250,252,0.96)',
    color: '#0f172a',
    boxShadow: '0 22px 80px rgba(0,0,0,0.38)',
  },
  claimSmall: {
    display: 'block',
    marginBottom: 6,
    color: '#475569',
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
  },
  claimText: {
    fontSize: 56,
    lineHeight: 1,
    letterSpacing: '-0.055em',
  },
  report: {
    position: 'absolute',
    right: 96,
    top: 372,
    zIndex: 9,
    width: 390,
    padding: 22,
    border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: 24,
    background: 'rgba(6,19,22,0.84)',
    backdropFilter: 'blur(14px)',
    boxShadow: '0 0 60px rgba(16,185,129,0.14)',
  },
  reportHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    color: '#bbf7d0',
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  passPill: {
    padding: '6px 11px',
    borderRadius: 999,
    color: '#052e16',
    background: palette.emerald,
    fontSize: 12,
  },
  check: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '9px 0',
    borderTop: '1px solid rgba(148,163,184,0.14)',
    color: '#cbd5e1',
    fontSize: 17,
  },
  trueText: {
    color: palette.emerald,
  },
  hud: {
    position: 'absolute',
    left: 56,
    right: 56,
    bottom: 40,
    zIndex: 12,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 480px',
    gap: 22,
    alignItems: 'end',
  },
  stateRail: {
    minHeight: 130,
    padding: '22px 24px 18px',
    border: `1px solid ${palette.line}`,
    borderRadius: 24,
    background: palette.panel,
    backdropFilter: 'blur(16px)',
  },
  railHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 22,
    color: '#dbeafe',
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  rail: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 10,
  },
  railBack: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: 22,
    height: 3,
    borderRadius: 999,
    background: 'rgba(148,163,184,0.18)',
  },
  railFill: {
    position: 'absolute',
    left: '8%',
    top: 22,
    height: 3,
    borderRadius: 999,
    background: `linear-gradient(90deg, ${palette.amber}, ${palette.cyan}, ${palette.emerald})`,
    boxShadow: '0 0 22px rgba(34,211,238,0.68)',
  },
  state: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    justifyItems: 'center',
    gap: 12,
    color: palette.muted,
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textAlign: 'center',
  },
  stateDot: {
    width: 44,
    height: 44,
    borderRadius: 999,
    border: '1px solid',
  },
  scriptPanel: {
    minHeight: 130,
    padding: '22px 24px',
    border: '1px solid rgba(34,211,238,0.24)',
    borderRadius: 24,
    background: palette.panelStrong,
    backdropFilter: 'blur(16px)',
  },
  scriptHead: {
    display: 'block',
    marginBottom: 14,
    color: '#cffafe',
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  scriptLine: {
    position: 'absolute',
    inset: 0,
    margin: 0,
    color: palette.text,
    fontSize: 25,
    fontWeight: 850,
    lineHeight: 1.22,
  },
};
