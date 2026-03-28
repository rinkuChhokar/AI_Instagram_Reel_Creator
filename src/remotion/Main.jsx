import { Series, Audio, AbsoluteFill, staticFile } from 'remotion';
import { Scene } from './Scene';

export const Main = ({ scenes }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Audio src={staticFile('audio/bg.mp3')} volume={0.3} loop />
      <Series>
        {scenes.map((scene, index) => (
          <Series.Sequence
            key={scene.id}
            durationInFrames={scene.durationInFrames}
          >
            <Scene
              id={scene.id}
              text={scene.hinglish_content || scene.hindi_content}
              image={scene.imagePath}
              audio={scene.audioPath}
              duration={scene.durationInFrames}
            />
            {scene.audioPath && (
                <Audio src={staticFile(scene.audioPath)} />
            )}
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
