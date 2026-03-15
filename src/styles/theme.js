/**
 * DESIGN TOKENS & COMPONENT STYLES
 *
 * Dark, monospace, brutalist-utilitarian.
 * The tool looks like what it is — an engine, not a toy.
 */

export const COLORS = {
  bg: "#0c0c0c",
  text: "#e8e4de",
  textDim: "rgba(232,228,222,0.3)",
  textMid: "rgba(232,228,222,0.5)",
  textBright: "#e8e4de",
  border: "rgba(232,228,222,0.06)",
  borderActive: "rgba(232,228,222,0.2)",
  surface: "rgba(255,255,255,0.02)",
  surfaceActive: "rgba(232,228,222,0.04)",
  surfaceInput: "rgba(255,255,255,0.03)",
  scoreGood: "#5a9a6a",
  scoreWarn: "#b89c4a",
  scoreError: "#c0564a",
  accent: "rgba(232,228,222,0.06)",
};

export const FONTS = {
  mono: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
};

export const S = {
  label: {
    fontFamily: FONTS.mono,
    fontSize: "9px",
    letterSpacing: "2.5px",
    color: COLORS.textDim,
    marginBottom: "6px",
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: COLORS.surfaceInput,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "3px",
    padding: "10px 12px",
    fontFamily: FONTS.mono,
    fontSize: "12px",
    color: COLORS.text,
    outline: "none",
  },
  card: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "4px",
    padding: "16px 20px",
  },
  cardHead: {
    fontFamily: FONTS.mono,
    fontSize: "9px",
    letterSpacing: "3px",
    color: "rgba(232,228,222,0.35)",
    marginBottom: "12px",
  },
  btnPrimary: {
    padding: "14px 24px",
    border: `1px solid ${COLORS.borderActive}`,
    borderRadius: "3px",
    background: COLORS.accent,
    color: COLORS.text,
    fontFamily: FONTS.mono,
    fontSize: "11px",
    letterSpacing: "2px",
    cursor: "pointer",
    width: "100%",
    transition: "all 0.2s",
  },
  btnSec: {
    padding: "8px 16px",
    border: "1px solid rgba(232,228,222,0.1)",
    borderRadius: "3px",
    background: "transparent",
    color: COLORS.textMid,
    fontFamily: FONTS.mono,
    fontSize: "10px",
    letterSpacing: "1.5px",
    cursor: "pointer",
  },
  mono: { fontFamily: FONTS.mono },
  dim: { color: COLORS.textDim },
  mid: { color: COLORS.textMid },
  bright: { color: COLORS.textBright },
};

export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::selection { background: rgba(232,228,222,0.15); }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(232,228,222,0.08); border-radius: 3px; }
  input:focus, textarea:focus, select:focus { border-color: rgba(232,228,222,0.2) !important; outline: none; }
  button:hover:not(:disabled) { opacity: 0.85; }
  button:disabled { opacity: 0.25; cursor: not-allowed; }
  select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6' fill='%23444'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px !important; }
  textarea { resize: vertical; }
  details summary::-webkit-details-marker { display: none; }
  details summary::marker { display: none; content: ""; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;
