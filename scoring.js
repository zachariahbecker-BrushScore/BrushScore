// The judging engine: three criteria at 0-100, averaged twice.
//
//   judge score = average of that judge's three marks         -> 0-100
//   panel score = average of the judge scores, rounded        -> 0-100
//
// The formula is identical for a two-judge and a three-judge panel; only
// the count of numbers in the second average changes, so the tier bands
// never move with panel size.

// Each criterion carries its own share of the 100 points available, rather
// than all three being marked 0-100 and averaged. A judge's mark for a
// criterion cannot exceed that criterion's max, and a judge's score for an
// entry is the SUM of their three marks — which lands between 0 and 100 by
// construction, because the three max values below add up to exactly 100.
// If you rebalance these, keep that invariant: the three .max values must
// still sum to 100, or the tier bands (50/65/76/86) stop meaning what they say.
export const CRITERIA = [
  { key: 'technical', name: 'Technical ability', max: 33,
    hint: 'Brushwork, blending, edge control, surface finish. Seams, mold lines and gaps. Quality of assembly and conversion work.' },
  { key: 'composition', name: 'Composition', max: 33,
    hint: "Colour, value and contrast. Pose, focal point and balance. Base, plinth and groundwork, and how the piece reads at arm's length." },
  { key: 'difficulty', name: 'Difficulty', max: 34,
    hint: 'Ambition of the subject. Scratch-building, sculpting and conversion. How much the piece asked of the modeller.' },
];

// The sum of the three criteria maxes above — always 100 if the invariant
// noted above holds. Computed rather than hard-coded so the rules text and
// any future validation stay honest if the split above ever changes.
export const CRITERIA_TOTAL = CRITERIA.reduce((sum, c) => sum + c.max, 0);

// Mutable so a show's settings can move a band without a code change.
export const TIERS = [
  { key: 'gold', name: 'Gold', min: 86, className: 'gold' },
  { key: 'silver', name: 'Silver', min: 76, className: 'silver' },
  { key: 'bronze', name: 'Bronze', min: 65, className: 'bronze' },
  { key: 'merit', name: 'Merit', min: 50, className: 'merit' },
  { key: 'none', name: 'No award', min: 0, className: 'none' },
];

export const LIMITS = {
  divergence: 14,  // points apart two judge scores (each already 0-100) may sit before reconciling
  outlier: 20,     // points one judge score may sit from the average of the other two
  boundary: 2,     // points below a tier line that trigger a head-judge look
  // Per-criterion gap that gets re-marked during reconciliation. Criteria
  // now max out around 33-34 rather than 100, so this is set to keep the
  // same ~20% of range that 20-out-of-100 represented originally.
  criterionGap: 7,
};

export function tierFor(score) {
  return TIERS.find((t) => score >= t.min) || TIERS[TIERS.length - 1];
}

function nextTierUp(tier) {
  const i = TIERS.findIndex((t) => t.key === tier.key);
  return i > 0 ? TIERS[i - 1] : tier;
}

// A judge's score for an entry is the sum of their per-criterion marks
// (each already capped at that criterion's own max) — not an average.
// The three maxes already add up to 100, so the sum lands in 0-100 on its own.
function judgeTotal(marks) {
  if (!marks) return null;
  const vals = CRITERIA.map((c) => marks[c.key]);
  if (vals.some((v) => v === null || v === undefined || v === '' || Number.isNaN(Number(v)))) return null;
  return vals.reduce((a, b) => a + Number(b), 0);
}

export function fmt1(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * scoresBySlot: { 1: {technical,composition,difficulty}|undefined, 2: {...}, ... }
 * expectedJudges: how many judges the panel is configured for (2 or 3)
 * headConfirm: null | 'up' | 'hold'
 */
export function computeScore(scoresBySlot, expectedJudges, headConfirm) {
  const slots = Object.keys(scoresBySlot || {})
    .map(Number)
    .sort((a, b) => a - b);
  const judgeScores = slots
    .map((slot) => ({ slot, score: judgeTotal(scoresBySlot[slot]) }))
    .filter((j) => j.score !== null);
  const n = judgeScores.length;

  const out = {
    n,
    expected: expectedJudges,
    judgeScores,
    score: null,
    tier: null,
    finalTier: null,
    spread: 0,
    outlierSlot: null,
    flags: [],
    complete: false,
    headConfirm: headConfirm || null,
  };

  if (n === 0) {
    out.flags.push({ key: 'unjudged', text: 'Not yet judged' });
    return out;
  }

  const values = judgeScores.map((j) => j.score);
  const avg = values.reduce((a, b) => a + b, 0) / n;
  out.score = Math.round(avg);
  out.tier = tierFor(out.score);
  out.finalTier = out.tier;
  out.spread = n > 1 ? Math.max(...values) - Math.min(...values) : 0;

  if (n < 2) {
    out.flags.push({ key: 'incomplete', text: 'One judge only — needs a second score before any award stands' });
    return out;
  }

  out.complete = n >= Math.min(2, expectedJudges);

  // Two judges: no majority exists, so disagreement has to be resolved explicitly.
  if (n === 2 && out.spread > LIMITS.divergence) {
    out.flags.push({
      key: 'reconcile',
      text: `Judges are ${fmt1(out.spread)} points apart — reconcile before the tier stands`,
    });
  }

  // Three or more judges: the panel self-corrects, but a lone outlier is worth a look.
  if (n >= 3) {
    let worstIdx = -1;
    let worstDev = 0;
    values.forEach((v, i) => {
      const others = values.filter((_, k) => k !== i);
      const dev = Math.abs(v - others.reduce((a, b) => a + b, 0) / others.length);
      if (dev > worstDev) { worstDev = dev; worstIdx = i; }
    });
    if (worstDev > LIMITS.outlier) {
      out.outlierSlot = judgeScores[worstIdx].slot;
      out.flags.push({
        key: 'outlier',
        text: `Judge ${out.outlierSlot} sits ${fmt1(worstDev)} points off the other two — worth a second look`,
      });
    }
  }

  // Boundary band: on a two-judge panel, one point can swing a tier.
  if (n === 2) {
    const upper = TIERS[TIERS.findIndex((t) => t.key === out.tier.key) - 1];
    const nearLine = upper && upper.min - out.score <= LIMITS.boundary;
    if (nearLine) {
      if (out.headConfirm === 'up') {
        out.finalTier = nextTierUp(out.tier);
        out.flags.push({ key: 'confirmed', text: `Head judge moved this up to ${out.finalTier.name}` });
      } else if (out.headConfirm === 'hold') {
        out.flags.push({ key: 'confirmed', text: `Head judge held this at ${out.tier.name}` });
      } else {
        out.flags.push({
          key: 'boundary',
          text: `Within ${LIMITS.boundary} points of ${upper.name} (${upper.min}) — head judge decides`,
        });
      }
    }
  }

  return out;
}

export function reconciliationText(k) {
  if (k === 'reconcile') {
    return ` Compare line by line, discuss only the criteria that differ by ${LIMITS.criterionGap} or more, and re-mark those. Still apart? Bring in the head judge as a third score.`;
  }
  if (k === 'outlier') return ' The tier stands unless a judge changes a mark.';
  if (k === 'boundary') return ' Move it up or hold it — the decision is recorded against the entry.';
  return '';
}

export function flagLabel(k) {
  return (
    {
      reconcile: 'Reconcile',
      outlier: 'Outlier',
      boundary: 'Head judge',
      confirmed: 'Settled',
      incomplete: 'Incomplete',
      unjudged: 'Waiting',
    }[k] || k
  );
}
