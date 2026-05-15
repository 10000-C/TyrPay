import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {OpeningClaim} from './scenes/OpeningClaim';
import {RiskReveal} from './scenes/RiskReveal';
import {TyrPayGate} from './scenes/TyrPayGate';
import {CommitmentOnChain} from './scenes/CommitmentOnChain';
import {EscrowFunding} from './scenes/EscrowFunding';
import {TeeTLSExecution} from './scenes/TeeTLSExecution';
import {ProofStorage} from './scenes/ProofStorage';
import {Verification} from './scenes/Verification';
import {Verdict} from './scenes/Verdict';
import {BuiltOnZeroGClose} from './scenes/BuiltOnZeroGClose';

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const transitionFrames = 24;

const subtitleChunks: string[][] = [
  [
    "Agents will pay other agents for research, data, code, and API-backed work.",
    "But when a seller says 'done,' the buyer only sees the result — not the execution.",
  ],
  [
    'Did it call the promised model?',
    'Did it use the right API?',
    'Or did it replace the work with a cheaper shortcut?',
  ],
  [
    'TyrPay turns agent payments into verifiable settlement.',
    'Funds can move only through commitment, proof,',
    'and verification enforced by contracts on 0G Chain.',
  ],
  [
    'Before funds move, the seller commits to the model, endpoint,',
    'usage, deadline, and proof mode.',
    'The commitment hash is recorded by the TyrPay contract on 0G Chain.',
  ],
  [
    'The buyer accepts the commitment and locks funds',
    'into the TyrPay contract on 0G Chain.',
    'The seller has not been paid yet.',
  ],
  [
    "Now the seller executes through TyrPay's default proof path: 0G teeTLS.",
    'The call produces a signed receipt bound to the provider,',
    'the request hash, and the response hash.',
    'For higher-assurance cases, TyrPay also provides zkTLS mode',
    'for stricter cryptographic proof of the API interaction.',
  ],
  [
    'The full proof bundle is stored on 0G Storage.',
    'The 0G Chain contract only keeps the proof hash, storage reference,',
    'commitment state, and escrow state.',
  ],
  [
    'The verifier checks whether the payment conditions were met:',
    'proof validity, provider match, task binding, commitment match,',
    'usage, deadline, replay protection, and proof availability on 0G Storage.',
    'TyrPay does not judge answer quality.',
    'It verifies committed execution.',
  ],
  [
    'If the proof passes, the TyrPay contract on 0G Chain',
    'releases escrow to the seller.',
    'If proof fails or times out, the buyer is refunded.',
  ],
  [
    'TyrPay is verifiable Agent settlement on 0G:',
    'settlement contracts on 0G Chain, proof archives on 0G Storage,',
    '0G teeTLS as the native proof path, and zkTLS for higher-assurance cases.',
  ],
];

const scenes = [
  {name: 'OpeningClaim', duration: 312, component: OpeningClaim},
  {name: 'RiskReveal', duration: 270, component: RiskReveal},
  {name: 'TyrPayGate', duration: 360, component: TyrPayGate},
  {name: 'CommitmentOnChain', duration: 330, component: CommitmentOnChain},
  {name: 'EscrowFunding', duration: 300, component: EscrowFunding},
  {name: 'TeeTLSExecution', duration: 570, component: TeeTLSExecution},
  {name: 'ProofStorage', duration: 300, component: ProofStorage},
  {name: 'Verification', duration: 540, component: Verification},
  {name: 'Verdict', duration: 285, component: Verdict},
  {name: 'BuiltOnZeroGClose', duration: 390, component: BuiltOnZeroGClose},
];

const sceneStarts = scenes.reduce<number[]>((starts, scene, index) => {
  if (index === 0) {
    return [0];
  }

  const previousStart = starts[index - 1];
  const previousDuration = scenes[index - 1].duration;
  return [...starts, previousStart + previousDuration - transitionFrames];
}, []);

export const fullDemoVideoDuration =
  sceneStarts[sceneStarts.length - 1] + scenes[scenes.length - 1].duration;

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

// Frame boundaries synced to actual voiceover audio via edge-tts SentenceBoundary.
// Each sub-array maps to a scene; values are the frame (at 30fps) when each subtitle chunk starts.
const subtitleTiming: number[][] = [
  [0, 153],                     // scene 01
  [0, 73, 143],                 // scene 02
  [0, 118, 202],                // scene 03
  [0, 120, 178],                // scene 04
  [0, 92, 158],                 // scene 05
  [0, 165, 265, 333, 444],      // scene 06
  [0, 105, 232],                // scene 07
  [0, 113, 222, 349, 435],      // scene 08
  [0, 106, 163],                // scene 09
  [0, 92, 218],                 // scene 10
];

const Subtitle = ({
  chunks,
  duration,
  timing,
}: {
  chunks: string[];
  duration: number;
  timing: number[];
}) => {
  const frame = useCurrentFrame();

  const sceneFadeIn = interpolate(frame, [6, 18], [0, 1], {...clamp, easing: ease});
  const sceneFadeOut = interpolate(frame, [duration - 30, duration - 12], [1, 0], {...clamp, easing: ease});
  const sceneOpacity = Math.min(sceneFadeIn, sceneFadeOut);

  // Determine current chunk based on audio-synced frame boundaries
  let currentChunk = 0;
  for (let i = timing.length - 1; i >= 0; i--) {
    if (frame >= timing[i]) {
      currentChunk = i;
      break;
    }
  }

  // Per-chunk fade-in for smooth transitions between chunks
  const chunkStart = timing[currentChunk];
  const nextStart = currentChunk < timing.length - 1 ? timing[currentChunk + 1] : duration;
  const chunkFade = interpolate(frame, [chunkStart, chunkStart + 8], [0, 1], {...clamp, easing: ease});
  const chunkFadeOut = interpolate(frame, [nextStart - 6, nextStart], [1, 0], {...clamp, easing: ease});

  return (
    <AbsoluteFill style={{pointerEvents: 'none', zIndex: 55}}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 50,
          transform: 'translateX(-50%)',
          maxWidth: 1200,
          padding: '12px 28px',
          background: 'rgba(0,0,0,0.72)',
          borderRadius: 12,
          color: '#f1f5f9',
          fontSize: 22,
          lineHeight: 1.48,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          opacity: sceneOpacity * Math.min(chunkFade, chunkFadeOut),
        }}
      >
        {chunks[currentChunk]}
      </div>
    </AbsoluteFill>
  );
};

const sfx: [number, string, number, number][] = [
  [1, 'error-buzz', 40, 0.35],
  [2, 'gate-drop', 36, 0.4],
  [2, 'shield-block', 72, 0.35],
  [3, 'stamp', 80, 0.35],
  [3, 'ui-tick', 160, 0.25],
  [4, 'token-slide', 60, 0.35],
  [4, 'lock', 150, 0.35],
  [5, 'scan-tick', 84, 0.25],
  [5, 'scan-tick', 190, 0.25],
  [5, 'success-chime', 278, 0.35],
  [6, 'data-write', 80, 0.35],
  [7, 'scan-tick', 130, 0.2],
  [7, 'scan-tick', 152, 0.2],
  [7, 'scan-tick', 174, 0.2],
  [7, 'scan-tick', 196, 0.2],
  [7, 'scan-tick', 218, 0.2],
  [7, 'scan-tick', 240, 0.2],
  [8, 'success-chime', 82, 0.35],
  [8, 'error-buzz', 108, 0.25],
  [9, 'closing-pulse', 20, 0.35],
];

export const FullDemoVideo = () => {
  return (
    <AbsoluteFill style={styles.root}>
      {scenes.map((scene, index) => {
        const Component = scene.component;

        return (
          <Sequence key={scene.name} from={sceneStarts[index]} durationInFrames={scene.duration}>
            <SceneBlend duration={scene.duration} isFirst={index === 0} isLast={index === scenes.length - 1}>
              <Component />
            </SceneBlend>
            <Audio
              src={staticFile(`voiceover/scene-${String(index + 1).padStart(2, '0')}.mp3`)}
              volume={1}
            />
            <Subtitle chunks={subtitleChunks[index]} duration={scene.duration} timing={subtitleTiming[index]} />
          </Sequence>
        );
      })}

      {sfx.map(([sceneIdx, file, frame, vol], i) => (
        <Sequence key={`sfx-${i}`} from={sceneStarts[sceneIdx] + frame} durationInFrames={120}>
          <Audio src={staticFile(`sfx/${file}.wav`)} volume={vol} />
        </Sequence>
      ))}

      {sceneStarts.slice(1).map((start, index) => (
        <Sequence key={`transition-${start}`} from={start - 4} durationInFrames={32}>
          <TransitionWash index={index} />
          <Audio src={staticFile('sfx/transition-whoosh.wav')} volume={0.3} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

const SceneBlend = ({
  children,
  duration,
  isFirst,
  isLast,
}: {
  children: React.ReactNode;
  duration: number;
  isFirst: boolean;
  isLast: boolean;
}) => {
  const frame = useCurrentFrame();
  const enterOpacity = isFirst
    ? interpolate(frame, [0, 18], [0, 1], {...clamp, easing: ease})
    : interpolate(frame, [0, transitionFrames], [0, 1], {...clamp, easing: ease});
  const exitOpacity = isLast
    ? 1
    : interpolate(frame, [duration - transitionFrames, duration], [1, 0], {...clamp, easing: ease});
  const enterY = isFirst ? 0 : interpolate(frame, [0, transitionFrames], [10, 0], {...clamp, easing: ease});

  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(enterOpacity, exitOpacity),
        transform: `translateY(${enterY}px)`,
        transformOrigin: '50% 50%',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const TransitionWash = ({index}: {index: number}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 24, 32], [0, 0.48, 0.28, 0], {
    ...clamp,
    easing: ease,
  });
  const x = interpolate(frame, [0, 32], [-360, 2050], {...clamp, easing: ease});
  const accent =
    index % 3 === 0
      ? 'rgba(34,211,238,0.58)'
      : index % 3 === 1
        ? 'rgba(139,92,246,0.52)'
        : 'rgba(245,158,11,0.42)';

  return (
    <AbsoluteFill style={{...styles.washWrap, opacity}}>
      <div
        style={{
          ...styles.wash,
          transform: `translateX(${x}px) rotate(-12deg)`,
          background: `linear-gradient(90deg, transparent, ${accent}, rgba(248,250,252,0.10), transparent)`,
        }}
      />
      <div style={styles.vignette} />
    </AbsoluteFill>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    background: '#050812',
    overflow: 'hidden',
  },
  washWrap: {
    zIndex: 100,
    pointerEvents: 'none',
  },
  wash: {
    position: 'absolute',
    top: -260,
    bottom: -260,
    width: 360,
    filter: 'blur(8px)',
    mixBlendMode: 'screen',
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    background:
      'linear-gradient(90deg, rgba(5,8,18,0.32), transparent 22%, transparent 78%, rgba(5,8,18,0.32))',
  },
};
