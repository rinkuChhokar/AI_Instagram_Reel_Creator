import { loadFont } from '@remotion/google-fonts/Montserrat';

// Only load the heavy weights the reel actually uses to keep render startup fast
const { fontFamily: montserrat } = loadFont('normal', { weights: ['700', '800', '900'], subsets: ['latin'] });

// Devanagari + emoji fallbacks for hindi_content and AI-generated titles
export const fontFamily = `${montserrat}, "Nirmala UI", "Noto Sans Devanagari", "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;

// One accent per scene so every cut feels fresh
export const ACCENTS = ['#FFE500', '#39FF88', '#00E5FF', '#FF4FD8', '#FF8A00'];
