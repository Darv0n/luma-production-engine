/**
 * CREDIT BUDGET
 *
 * Live credit counter showing running cost of the production session.
 */

import { COLORS, FONTS } from '../styles/theme.js';

export default function CreditBudget({ creditsUsed, mode }) {
  const estimate = mode === 'auteur' ? '~624' : '0';

  return (
    <div style={styles.container}>
      <div style={styles.label}>CREDITS</div>
      <div style={styles.row}>
        <span style={styles.used}>{creditsUsed || 0}</span>
        <span style={styles.sep}>/</span>
        <span style={styles.estimate}>{estimate} est</span>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
  },
  label: {
    fontFamily: FONTS.mono,
    fontSize: '8px',
    letterSpacing: '2px',
    color: COLORS.textDim,
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
  },
  used: {
    fontFamily: FONTS.mono,
    fontSize: '18px',
    fontWeight: 500,
    color: COLORS.text,
  },
  sep: {
    fontFamily: FONTS.mono,
    fontSize: '12px',
    color: COLORS.textDim,
  },
  estimate: {
    fontFamily: FONTS.mono,
    fontSize: '10px',
    color: COLORS.textDim,
  },
};
