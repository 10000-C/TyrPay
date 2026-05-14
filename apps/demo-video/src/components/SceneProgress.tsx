import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

const steps = [
  'Claim',
  'Risk',
  'Gate',
  'Commit',
  'Escrow',
  'teeTLS',
  'Storage',
  'Verify',
  'Verdict',
  '0G',
];

const colors = {
  bg: 'rgba(3, 7, 18, 0.82)',
  border: 'rgba(148, 163, 184, 0.18)',
  text: '#cbd5e1',
  muted: '#64748b',
  amber: '#f59e0b',
  cyan: '#22d3ee',
  purple: '#8b5cf6',
};

export const SceneProgress = ({current}: {current: number}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const sceneProgress = interpolate(frame, [0, durationInFrames - 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={styles.wrap}>
      <div style={styles.track}>
        {steps.map((step, index) => {
          const isPast = index < current;
          const isCurrent = index === current;
          const segmentFill = isPast ? 1 : isCurrent ? sceneProgress : 0;
          return (
            <div key={step} style={styles.step}>
              <div style={styles.segmentBase}>
                <div
                  style={{
                    ...styles.segmentFill,
                    width: `${segmentFill * 100}%`,
                    background: isCurrent
                      ? `linear-gradient(90deg, ${colors.amber}, ${colors.cyan})`
                      : colors.purple,
                  }}
                />
              </div>
              <span
                style={{
                  ...styles.label,
                  color: isCurrent ? '#f8fafc' : isPast ? '#dbeafe' : colors.muted,
                  opacity: isCurrent || isPast ? 1 : 0.62,
                }}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'absolute',
    left: 46,
    right: 46,
    bottom: 10,
    zIndex: 60,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    border: `1px solid ${colors.border}`,
    borderRadius: 999,
    background: colors.bg,
    boxShadow: '0 0 28px rgba(0,0,0,0.28)',
  },
  track: {
    display: 'grid',
    gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
    gap: 10,
    width: '100%',
    alignItems: 'center',
  },
  step: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 7,
    alignItems: 'center',
    minWidth: 0,
  },
  segmentBase: {
    height: 5,
    overflow: 'hidden',
    borderRadius: 999,
    background: 'rgba(51,65,85,0.68)',
  },
  segmentFill: {
    height: '100%',
    borderRadius: 999,
    boxShadow: '0 0 12px rgba(34,211,238,0.45)',
  },
  label: {
    fontSize: 11,
    fontWeight: 850,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
};
