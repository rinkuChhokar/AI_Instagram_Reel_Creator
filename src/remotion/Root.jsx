import { Composition } from 'remotion';
import { Main } from './Main';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="Reel"
        component={Main}
        durationInFrames={1800}
        fps={30}
        width={1080}
        height={1920}
        schema={null}
        calculateMetadata={({ props }) => {
          const durationInFrames = props.scenes?.reduce((acc, s) => acc + s.durationInFrames, 0) || 1800;
          return {
            durationInFrames,
          };
        }}
        defaultProps={{
          scenes: [
            {
              id: 1,
              label: "HOOK",
              hindi_content: "ये है GitHub का सबसे ट्रेंडिंग प्रोजेक्ट!",
              imagePath: "scene_1.png",
              audioPath: "scene_1.mp3",
              durationInFrames: 150
            }
          ]
        }}
      />
    </>
  );
};
