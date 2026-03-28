import { AbsoluteFill, useVideoConfig, useCurrentFrame, interpolate, spring, staticFile, Img } from 'remotion';

export const Scene = ({ id, text, image, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 1. Text Subdivision Logic
  // Split text into words to prevent it from covering >25% of the screen
  const words = text.split(' ');
  const chunks = [];
  let currentChunk = [];
  
  // Roughly 4-5 words per chunk for fast-paced modern Reels reading
  for (let i = 0; i < words.length; i++) {
    currentChunk.push(words[i]);
    if (currentChunk.length >= 4 || i === words.length - 1) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [];
    }
  }

  // Calculate active chunk over the duration to naturally sync with the spoken audio
  const activeChunkIndex = Math.min(
    Math.floor((frame / duration) * chunks.length),
    chunks.length - 1
  );
  const activeText = chunks[activeChunkIndex];

  // 2. InShot-Style Flicker / Flash Transition Effect
  // A quick white flash at the beginning of the scene spanning a few frames
  const flashOpacity = interpolate(frame, [0, 4, 8], [0.8, 0, 0], {
     extrapolateRight: 'clamp',
  });
  
  // Film flicker effect (slight brightness pulse every few frames)
  const isFlicker = frame % 6 < 3 ? 1 : 0.95;

  // Zoom effect (Ken Burns)
  const scale = interpolate(frame, [0, duration], [1, 1.15], {
    extrapolateRight: 'clamp',
  });

  // Calculate duration of each chunk for snappy text popping animations
  const framesPerChunk = duration / chunks.length;
  const chunkFrame = frame % framesPerChunk;
  
  // Text pops in slightly on every new chunk!
  const textScale = spring({
    frame: chunkFrame,
    fps,
    config: { damping: 10, mass: 0.6 },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* Background Image with Zoom and Flicker */}
      <AbsoluteFill style={{
        transform: `scale(${scale})`,
        overflow: 'hidden',
        filter: `brightness(${isFlicker})`
      }}>
        <Img src={staticFile(image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      {/* Dark Overlay for insane text readability (top and bottom gradients) */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.7) 100%)'
      }} />

      {/* Modern Reel Caption (Instagram style: Yellow text, black stroke, bottom-center) */}
      <div style={{
        position: 'absolute',
        top: '60%', // Placed near the bottom center explicitly for Shorts/Reels layout bounds 
        left: '5%',
        right: '5%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        transform: `scale(${textScale})`, // POP effect on each word chunk!
      }}>
        <h1 style={{
          color: '#ffde59', // Classic Instagram Reels bright yellow
          fontSize: '72px',
          fontWeight: '900',
          fontFamily: '"Montserrat", "Impact", "Inter", sans-serif',
          margin: 0,
          lineHeight: 1.1,
          textAlign: 'center',
          textTransform: 'uppercase',
          WebkitTextStroke: '3px black', // Intense stroke like typical caption apps
          textShadow: '0px 6px 15px rgba(0,0,0,0.9)', // Deep drop shadow
        }}>
          {activeText}
        </h1>
      </div>

      {/* Flash Transition Overlay Layer (InShot Style) */}
      <AbsoluteFill style={{
        backgroundColor: 'white',
        opacity: flashOpacity,
        pointerEvents: 'none' // Don't block interactions
      }} />
    </AbsoluteFill>
  );
};
