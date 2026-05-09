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
      <AbsoluteFill style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: '50px'
      }}>
        <div style={{
          fontSize: '36px',
          fontFamily: 'sans-serif',
          color: 'rgba(255, 255, 255, 0.8)',
          fontWeight: 'bold',
          textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
          backgroundColor: 'rgba(0,0,0,0.4)',
          padding: '10px 25px',
          borderRadius: '15px'
        }}>
          RCBackendBite
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
