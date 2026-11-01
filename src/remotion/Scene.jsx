import { AbsoluteFill, useVideoConfig, useCurrentFrame, interpolate, spring, staticFile, Img } from 'remotion';
import { Captions } from './Captions';

// Camera moves rotate per scene so consecutive shots never feel identical
// [scale, translateX %, translateY %]
const CAMERA_MOVES = [
  { from: [1.05, 0, 0], to: [1.22, 0, -2] },   // slow push-in
  { from: [1.22, -3, 0], to: [1.1, 3, 0] },    // pull-out + pan right
  { from: [1.1, 0, 3], to: [1.2, 0, -3] },     // tilt up
  { from: [1.2, 3, 0], to: [1.08, -3, 1] },    // pull-out + pan left
];

const ENTRY_FRAMES = 10;
const EXIT_FRAMES = 6;

export const Scene = ({ index, text, image, duration, captionFrames, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const move = CAMERA_MOVES[index % CAMERA_MOVES.length];
  const progress = interpolate(frame, [0, duration], [0, 1], { extrapolateRight: 'clamp' });
  const ease = (t) => 1 - Math.pow(1 - t, 2);
  const [s, x, y] = move.from.map((v, i) => v + (move.to[i] - v) * ease(progress));

  // Punch-in on entry: overshoot zoom + motion blur that settles in ~10 frames
  const punch = spring({ frame, fps, config: { damping: 14, stiffness: 140 } });
  const entryScale = interpolate(punch, [0, 1], [1.3, 1]);
  const entryBlur = interpolate(frame, [0, ENTRY_FRAMES], [16, 0], { extrapolateRight: 'clamp' });

  // Whip-zoom out of the scene so the cut into the next one feels continuous
  const exitStart = duration - EXIT_FRAMES;
  const exitScale = interpolate(frame, [exitStart, duration], [1, 1.18], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const exitBlur = interpolate(frame, [exitStart, duration], [0, 14], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Accent-coloured light flash on every cut except the opening frame (keeps the hook instant)
  const flashOpacity = index === 0 ? 0 : interpolate(frame, [0, 6], [0.45, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black', overflow: 'hidden' }}>
      <AbsoluteFill style={{
        transform: `scale(${s * entryScale * exitScale}) translate(${x}%, ${y}%)`,
        filter: `blur(${entryBlur + exitBlur}px) saturate(1.15) contrast(1.05)`,
      }}>
        <Img src={staticFile(image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      {/* Cinematic vignette + darker caption band for readability on any image */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.55) 100%)',
      }} />
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 22%, transparent 48%, rgba(0,0,0,0.6) 62%, rgba(0,0,0,0.25) 78%, rgba(0,0,0,0.6) 100%)',
      }} />

      <Captions text={text} totalFrames={captionFrames} accent={accent} />

      <AbsoluteFill style={{
        background: `radial-gradient(circle at 50% 40%, #ffffff 0%, ${accent} 60%)`,
        mixBlendMode: 'screen',
        opacity: flashOpacity,
      }} />
    </AbsoluteFill>
  );
};
