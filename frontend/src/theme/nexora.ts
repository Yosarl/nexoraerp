export const INK = '#1E293B';
export const INK_DEEP = '#0F172A';
export const SUB = '#64748B';
export const FAINT = '#94A3B8';

export const ROSE = '#E11D48';
export const ROSE_DEEP = '#BE123C';
export const ROSE_SOFT = '#FFF1F2';
export const ROSE_RING = 'rgba(225,29,72,0.12)';
export const AMBER = '#F59E0B';

export const PAPER = '#FFFDF8';
export const PAPER_WARM = '#FBF3E6';
export const PAPER_DEEP = '#F6E7D3';
export const PAPER_BG = `linear-gradient(165deg, ${PAPER} 0%, ${PAPER_WARM} 60%, ${PAPER_DEEP} 100%)`;

export const LINE = 'rgba(30,41,59,0.10)';
export const HAIRLINE = 'rgba(30,41,59,0.08)';
export const WHITE_CARD = '0 12px 26px rgba(120,53,15,0.10)';
export const CARD_BORDER = `1px solid ${LINE}`;

export const GRAD = `linear-gradient(100deg, ${ROSE} 0%, #F43F5E 50%, ${AMBER} 135%)`;
export const GRAD_HOVER = 'linear-gradient(100deg, #BE123C 0%, #E11D48 55%, #D97706 135%)';
export const BAR_GRAD = 'linear-gradient(#F43F5E,#F59E0B)';
export const INK_GRAD = `linear-gradient(100deg, ${INK_DEEP} 0%, ${INK} 55%, #334155 135%)`;

export const LEDGER_RULES = 'repeating-linear-gradient(180deg, transparent 0 31px, rgba(30,41,59,0.055) 31px 32px)';

export const tileLabel = {
  fontSize: 9,
  letterSpacing: '0.09em',
  textTransform: 'uppercase' as const,
  fontWeight: 700,
  color: SUB,
};

export const tileValue = {
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  mt: 0.25,
  fontVariantNumeric: 'tabular-nums' as const,
};
