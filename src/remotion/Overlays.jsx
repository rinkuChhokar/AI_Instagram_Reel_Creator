import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { fontFamily, ACCENTS } from './fonts';

// Instagram covers roughly the top ~220px (header) and bottom ~450px (caption,
// audio, buttons) of a 1080x1920 reel, plus a ~120px column on the right.
// Everything here stays inside that safe zone.

export const ProgressBar = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const width = (frame / Math.max(durationInFrames - 1, 1)) * 100;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 12, backgroundColor: 'rgba(255,255,255,0.15)' }}>
      <div style={{
        width: `${width}%`,
        height: '100%',
        background: `linear-gradient(90deg, ${ACCENTS.join(', ')})`,
        boxShadow: `0 0 18px ${ACCENTS[0]}`,
        borderRadius: '0 6px 6px 0',
      }} />
    </div>
  );
};

export const BrandChip = ({ handle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 10, fps, config: { damping: 15 } });

  return (
    <div style={{
      position: 'absolute',
      top: 1420,
      left: 80,
      right: 140,
      display: 'flex',
      justifyContent: 'center',
      opacity: enter * 0.9,
      transform: `translateY(${interpolate(enter, [0, 1], [20, 0])}px)`,
    }}>
      <div style={{
        fontFamily,
        fontSize: 34,
        fontWeight: 800,
        color: '#fff',
        padding: '10px 26px',
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.45)',
        border: '2px solid rgba(255,255,255,0.25)',
        backdropFilter: 'blur(8px)',
        letterSpacing: '0.5px',
      }}>
        {handle}
      </div>
    </div>
  );
};

// First ~2.5s: a big tilted title card. The first second decides whether people swipe.
export const HookTitle = ({ title, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 11, mass: 0.6, stiffness: 160 } });
  const exit = interpolate(frame, [durationInFrames - 8, durationInFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const wobble = Math.sin(frame / 6) * 0.6;

  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 290 }}>
      <div style={{
        maxWidth: 880,
        transform: `translateX(${exit * -1200}px) scale(${interpolate(enter, [0, 1], [0.4, 1])}) rotate(${-3 + wobble}deg)`,
        opacity: enter,
        backgroundColor: '#ffffff',
        color: '#0b0b0b',
        padding: '26px 38px 30px',
        borderRadius: 28,
        boxShadow: `0 20px 60px rgba(0,0,0,0.6), 12px 12px 0 ${ACCENTS[0]}`,
        fontFamily,
        fontSize: title.length > 55 ? 60 : 74,
        fontWeight: 900,
        lineHeight: 1.12,
        textAlign: 'center',
        letterSpacing: '-1px',
      }}>
        {title}
      </div>
    </AbsoluteFill>
  );
};

// Last ~3.5s: animated profile card where a finger taps "Follow", plus a save nudge
export const FollowCTA = ({ handle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const TAP_FRAME = 40;
  const enter = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  const fingerIn = spring({ frame: frame - 12, fps, config: { damping: 14 } });
  const tapped = frame >= TAP_FRAME;
  const tapPress = interpolate(frame, [TAP_FRAME - 4, TAP_FRAME, TAP_FRAME + 6], [1, 0.88, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ripple = interpolate(frame, [TAP_FRAME, TAP_FRAME + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const saveIn = spring({ frame: frame - TAP_FRAME - 8, fps, config: { damping: 12 } });

  const initials = handle.replace('@', '').slice(0, 2).toUpperCase();

  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 300, fontFamily }}>
      <div style={{
        width: 900,
        transform: `scale(${interpolate(enter, [0, 1], [0.6, 1])}) translateY(${interpolate(enter, [0, 1], [80, 0])}px)`,
        opacity: enter,
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        padding: '28px 30px',
        borderRadius: 36,
        backgroundColor: 'rgba(15,15,20,0.82)',
        border: '2px solid rgba(255,255,255,0.18)',
        boxShadow: '0 25px 70px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          width: 104,
          height: 104,
          borderRadius: '50%',
          padding: 6,
          background: 'linear-gradient(45deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5)',
          flexShrink: 0,
        }}>
          <div style={{
            width: '100%', height: '100%', borderRadius: '50%', backgroundColor: '#111',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 40, fontWeight: 900,
          }}>
            {initials}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 36, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {handle}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 28, fontWeight: 700, marginTop: 4 }}>
            Daily tech drops 🚀
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{
            transform: `scale(${tapPress})`,
            padding: '18px 26px',
            borderRadius: 18,
            fontSize: 30,
            fontWeight: 900,
            color: '#fff',
            background: tapped ? 'rgba(255,255,255,0.18)' : 'linear-gradient(90deg, #0095f6, #6a5cff)',
            whiteSpace: 'nowrap',
          }}>
            {tapped ? 'Following ✓' : 'Follow'}
          </div>
          {/* Tap ripple */}
          <div style={{
            position: 'absolute', left: '50%', top: '50%', width: 220, height: 220,
            marginLeft: -110, marginTop: -110, borderRadius: '50%',
            border: '6px solid #fff',
            transform: `scale(${ripple})`,
            opacity: ripple > 0 ? 1 - ripple : 0,
          }} />
          {/* Finger slides in, taps, then drifts away */}
          <div style={{
            position: 'absolute', left: '40%', top: '55%', fontSize: 90,
            transform: `translate(${interpolate(fingerIn, [0, 1], [260, 0])}px, ${interpolate(fingerIn, [0, 1], [300, 0])}px) scale(${tapPress})`,
            opacity: interpolate(frame, [12, 18, TAP_FRAME + 20, TAP_FRAME + 30], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            👆
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 36,
        transform: `scale(${saveIn}) rotate(-2deg)`,
        opacity: saveIn,
        padding: '16px 34px',
        borderRadius: 999,
        backgroundColor: ACCENTS[0],
        color: '#0b0b0b',
        fontSize: 40,
        fontWeight: 900,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>
        🔖 SAVE THIS FOR LATER
      </div>
    </AbsoluteFill>
  );
};
