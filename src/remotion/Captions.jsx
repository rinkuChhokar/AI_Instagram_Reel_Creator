import { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { fontFamily } from './fonts';

// Short pages (2-3 words) keep eyes on screen and read at Reels speed
const PAGE_MAX_WORDS = 3;
const PAGE_MAX_CHARS = 16;

// Longer words and punctuation take longer to speak, so weight them when
// spreading words across the voice-over instead of splitting evenly
const wordWeight = (word) => {
  let weight = word.length + 2;
  if (/[,;:]$/.test(word)) weight += 4;
  if (/[.!?।]$/.test(word)) weight += 8;
  return weight;
};

const buildPages = (text, totalFrames) => {
  const words = text.split(/\s+/).filter(Boolean);
  const totalWeight = words.reduce((acc, w) => acc + wordWeight(w), 0) || 1;

  let cursor = 0;
  const timed = words.map((word) => {
    const start = (cursor / totalWeight) * totalFrames;
    cursor += wordWeight(word);
    return { word, start };
  });

  const pages = [];
  let page = [];
  for (const w of timed) {
    const chars = page.reduce((acc, p) => acc + p.word.length + 1, 0) + w.word.length;
    if (page.length && (page.length >= PAGE_MAX_WORDS || chars > PAGE_MAX_CHARS)) {
      pages.push(page);
      page = [];
    }
    page.push(w);
    // Never carry a page across a sentence/clause break
    if (/[,.!?।]$/.test(w.word)) {
      pages.push(page);
      page = [];
    }
  }
  if (page.length) pages.push(page);
  return pages;
};

// Brand names, acronyms and numbers get the accent colour (DeepSpec, GitHub, AI, 10x)
const isKeyword = (word) => /\d/.test(word) || /^[A-Z]{2,}$/.test(word) || /[a-z][A-Z]/.test(word);

const cleanWord = (word) => word.replace(/[,.;:।"]/g, '');

const lastIndexWhere = (arr, fn) => {
  for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i])) return i;
  return 0;
};

const OUTLINE = [
  '0 0 2px #000', '3px 3px 0 #000', '-3px -3px 0 #000', '3px -3px 0 #000', '-3px 3px 0 #000',
  '0 4px 0 #000', '0 10px 24px rgba(0,0,0,0.75)',
].join(', ');

export const Captions = ({ text, totalFrames, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pages = useMemo(() => buildPages(text, totalFrames), [text, totalFrames]);

  if (!pages.length) return null;

  const page = pages[lastIndexWhere(pages, (p) => frame >= p[0].start)];
  const activeIndex = lastIndexWhere(page, (w) => frame >= w.start);

  // Each new page springs up from below
  const pop = spring({ frame: frame - page[0].start, fps, config: { damping: 12, mass: 0.5, stiffness: 180 } });

  return (
    <div style={{
      position: 'absolute',
      top: 1080,
      // Right side is padded more to clear Instagram's like/comment/share column
      left: 80,
      right: 140,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '6px 18px',
      transform: `translateY(${interpolate(pop, [0, 1], [40, 0])}px) scale(${interpolate(pop, [0, 1], [0.75, 1])})`,
      opacity: interpolate(pop, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
    }}>
      {page.map((w, i) => {
        const isActive = i === activeIndex;
        const wordPop = spring({ frame: frame - w.start, fps, config: { damping: 10, mass: 0.4, stiffness: 220 } });

        return (
          <span
            key={`${w.start}-${i}`}
            style={{
              fontFamily,
              fontSize: 88,
              fontWeight: 900,
              lineHeight: 1.15,
              textTransform: 'uppercase',
              letterSpacing: '-1px',
              padding: '2px 16px 6px',
              borderRadius: 20,
              color: isActive ? '#0b0b0b' : isKeyword(cleanWord(w.word)) ? accent : '#ffffff',
              backgroundColor: isActive ? accent : 'transparent',
              textShadow: isActive ? 'none' : OUTLINE,
              boxShadow: isActive ? `0 10px 30px rgba(0,0,0,0.45), 0 0 40px ${accent}66` : 'none',
              transform: `scale(${isActive ? interpolate(wordPop, [0, 1], [0.85, 1.08]) : 1}) rotate(${isActive ? -2 : 0}deg)`,
              // Words not spoken yet stay slightly dimmed so the eye follows the voice
              opacity: i > activeIndex ? 0.6 : 1,
            }}
          >
            {cleanWord(w.word)}
          </span>
        );
      })}
    </div>
  );
};
