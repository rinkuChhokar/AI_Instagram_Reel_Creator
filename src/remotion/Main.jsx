import { Series, Sequence, Audio, AbsoluteFill, staticFile, useVideoConfig, interpolate } from 'remotion';
import { Scene } from './Scene';
import { ProgressBar, BrandChip, HookTitle, FollowCTA } from './Overlays';
import { ACCENTS } from './fonts';

// Matches the silent tail index.js appends after each scene's voice-over
const SCENE_TAIL_FRAMES = 15;

export const Main = ({ scenes, title, handle = '@RCBackendBite' }) => {
  const { durationInFrames, fps } = useVideoConfig();
  const hookFrames = Math.round(fps * 2.5);
  const ctaFrames = Math.round(fps * 3.5);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* Music stays well under the voice and fades in/out instead of hard cutting */}
      <Audio
        src={staticFile('audio/bg.mp3')}
        loop
        volume={(f) => interpolate(
          f,
          [0, fps / 2, durationInFrames - fps, durationInFrames],
          [0, 0.14, 0.14, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        )}
      />
      <Series>
        {scenes.map((scene, index) => (
          <Series.Sequence
            key={scene.id ?? scene.scene_id ?? index}
            durationInFrames={scene.durationInFrames}
          >
            <Scene
              index={index}
              text={scene.hinglish_content || scene.hindi_content}
              image={scene.imagePath}
              duration={scene.durationInFrames}
              captionFrames={scene.audioDurationInFrames || Math.max(scene.durationInFrames - SCENE_TAIL_FRAMES, 1)}
              accent={ACCENTS[index % ACCENTS.length]}
            />
            {scene.audioPath && (
                <Audio src={staticFile(scene.audioPath)} />
            )}
          </Series.Sequence>
        ))}
      </Series>

      <ProgressBar />
      <BrandChip handle={handle} />

      {title && (
        <Sequence durationInFrames={hookFrames}>
          <HookTitle title={title} durationInFrames={hookFrames} />
        </Sequence>
      )}

      {durationInFrames > hookFrames + ctaFrames && (
        <Sequence from={durationInFrames - ctaFrames}>
          <FollowCTA handle={handle} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
