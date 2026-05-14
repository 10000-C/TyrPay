import React from 'react';
import {AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame} from 'remotion';
import {OpeningClaim} from './scenes/OpeningClaim';
import {RiskReveal} from './scenes/RiskReveal';
import {TyrPayGate} from './scenes/TyrPayGate';
import {CommitmentOnChain} from './scenes/CommitmentOnChain';
import {EscrowFunding} from './scenes/EscrowFunding';

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const transitionFrames = 24;

const scenes = [
  {name: 'OpeningClaim', duration: 240, component: OpeningClaim},
  {name: 'RiskReveal', duration: 270, component: RiskReveal},
  {name: 'TyrPayGate', duration: 360, component: TyrPayGate},
  {name: 'CommitmentOnChain', duration: 330, component: CommitmentOnChain},
  {name: 'EscrowFunding', duration: 300, component: EscrowFunding},
];

const sceneStarts = scenes.reduce<number[]>((starts, scene, index) => {
  if (index === 0) {
    return [0];
  }

  const previousStart = starts[index - 1];
  const previousDuration = scenes[index - 1].duration;
  return [...starts, previousStart + previousDuration - transitionFrames];
}, []);

export const firstFivePreviewDuration =
  sceneStarts[sceneStarts.length - 1] + scenes[scenes.length - 1].duration;

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

export const FirstFivePreview = () => {
  return (
    <AbsoluteFill style={styles.root}>
      {scenes.map((scene, index) => {
        const Component = scene.component;

        return (
          <Sequence key={scene.name} from={sceneStarts[index]} durationInFrames={scene.duration}>
            <SceneBlend duration={scene.duration} isFirst={index === 0} isLast={index === scenes.length - 1}>
              <Component />
            </SceneBlend>
          </Sequence>
        );
      })}

      {sceneStarts.slice(1).map((start, index) => (
        <Sequence key={`transition-${start}`} from={start - 4} durationInFrames={32}>
          <TransitionWash index={index} />
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
  const accent = index % 2 === 0 ? 'rgba(34,211,238,0.58)' : 'rgba(139,92,246,0.52)';

  return (
    <AbsoluteFill style={{...styles.washWrap, opacity}}>
      <div
        style={{
          ...styles.wash,
          transform: `translateX(${x}px) rotate(-12deg)`,
          background: `linear-gradient(90deg, transparent, ${accent}, rgba(245,158,11,0.22), transparent)`,
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
