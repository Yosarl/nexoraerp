import { motion } from 'motion/react';

const SPRING = { type: 'spring', bounce: 0.12, visualDuration: 0.5 } as const;

const SYMBOL_PLANES: Array<{ d: string; fill: string; initial: { opacity: number; x?: number; y?: number }; delay: number }> = [
  {
    d: 'M 44 48 L 44 208 C 44 214.627 49.373 220 56 220 L 88 220 C 94.627 220 100 214.627 100 208 L 100 144 L 44 72 Z',
    fill: '#0F172A',
    initial: { opacity: 0, x: -26 },
    delay: 0.05,
  },
  {
    d: 'M 44 48 C 44 41.373 49.373 36 56 36 L 96 36 L 212 184 L 212 208 C 212 214.627 206.627 220 200 220 L 160 220 L 44 72 Z',
    fill: '#2563EB',
    initial: { opacity: 0, y: -22 },
    delay: 0.18,
  },
  {
    d: 'M 156 112 L 156 48 C 156 41.373 161.373 36 168 36 L 200 36 C 206.627 36 212 41.373 212 48 L 212 184 Z',
    fill: '#0EA5E9',
    initial: { opacity: 0, y: -30 },
    delay: 0.3,
  },
];

const WORDMARK_LETTERS: Array<{ d: string; evenodd?: boolean }> = [
  { d: 'M 16 64 L 16 16 L 26 16 L 48 50 L 48 16 L 58 16 L 58 64 L 48 64 L 26 30 L 26 64 Z' },
  { d: 'M 72 64 L 72 16 L 108 16 L 108 26 L 82 26 L 82 35.0 L 102 35.0 L 102 45.0 L 82 45.0 L 82 54 L 108 54 L 108 64 Z' },
  { d: 'M 122 16 L 134 16 L 142 39.0 L 150 16 L 162 16 L 149 43.0 L 162 64 L 150 64 L 142 47.0 L 134 64 L 122 64 L 135 43.0 Z' },
  { d: 'M 198 16 C 227.26 16 227.26 64 198 64 C 168.74 64 168.74 16 198 16 Z M 198 26 C 182.04 26 182.04 54 198 54 C 213.96 54 213.96 26 198 26 Z', evenodd: true },
  { d: 'M 234 64 L 234 16 L 260 16 C 274 16 274 40.0 260 40.0 L 244 40.0 L 244 64 Z M 244 26 L 258 26 C 264 26 264 30.0 258 30.0 L 244 30.0 Z M 254 38.0 L 272 64 L 260 64 L 246 42.0 Z', evenodd: true },
  { d: 'M 309 16 L 330 64 L 318 64 L 314 50 L 304 50 L 300 64 L 288 64 Z M 309 30 L 306 41 L 312 41 Z', evenodd: true },
];

export function NexoraSymbol({
  size = 96,
  animated = true,
  colors,
}: {
  size?: number;
  animated?: boolean;
  colors?: string[];
}) {
  return (
    <motion.svg viewBox="0 0 256 256" width={size} height={size} role="img" aria-label="Nexora">
      {SYMBOL_PLANES.map((plane, i) => (
        <motion.path
          key={i}
          d={plane.d}
          fill={colors?.[i] ?? plane.fill}
          initial={animated ? plane.initial : false}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ ...SPRING, delay: plane.delay }}
        />
      ))}
    </motion.svg>
  );
}

export function NexoraWordmark({ width = 170, animated = true, delay = 0.35 }: { width?: number; animated?: boolean; delay?: number }) {
  return (
    <svg viewBox="0 0 340 80" width={width} height={width * (80 / 340)} fill="currentColor" role="img" aria-label="Nexora">
      {WORDMARK_LETTERS.map((letter, i) => (
        <motion.path
          key={i}
          d={letter.d}
          fillRule={letter.evenodd ? 'evenodd' : undefined}
          initial={animated ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', bounce: 0.1, visualDuration: 0.4, delay: delay + i * 0.06 }}
        />
      ))}
    </svg>
  );
}
