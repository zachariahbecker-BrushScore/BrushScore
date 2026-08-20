/* ---------------------------------------------------------------------------
   scoring.js — the "Open" judging system

   As used by the NCMSS and most U.S. figure exhibitions (Chicago, Atlanta,
   MFCA). Judging is done by teams of three judges (two is supported as a
   reduced panel). Each judge awards each selected piece or group of pieces a
   single whole number from 0 to 4. Those marks are added together and the
   total earns the medal.

   This is NOT a rubric that adds criterion scores together. The six criteria
   below are what a judge weighs while arriving at their one mark — they are
   not scored separately and they carry no point values of their own.
--------------------------------------------------------------------------- */

export const MAX_PER_JUDGE = 4;

/* Listed in no particular order — the source system is explicit that these
   are not ranked by importance or order of consideration. */
export const CRITERIA = [
  { key: 'difficulty', name: 'Degree of Difficulty', hint: 'How much the piece asked of the modeler — scratch-building, sculpting, conversion, ambition of the subject.' },
  { key: 'creativity', name: 'Creativity', hint: 'Originality of concept, interpretation, and the ideas behind the piece.' },
  { key: 'workmanship', name: 'Workmanship', hint: 'Assembly and construction. Seams, mold lines, gaps, fit, and surface preparation.' },
  { key: 'painting', name: 'Painting Skill', hint: 'Brushwork, blending, edge control, colour, value and contrast, surface finish.' },
  { key: 'presentation', name: 'Presentation & Overall Effect', hint: 'Pose, focal point, balance, base, plinth and groundwork, and how the piece reads as a whole.' },
  { key: 'accuracy', name: 'Historical Accuracy', hint: 'Fidelity to the subject, period, uniform, markings and equipment where applicable.' },
];

/* What a single judge's mark means. A judge gives one of these numbers to
   the whole piece or group — not one per criterion. */
export const MARK_GUIDE = [
  { value: 4, short: 'Gold', label: 'Gold-medal standard' },
  { value: 3, short: 'Silver', label: 'Silver-medal standard' },
  { value: 2, short: 'Bronze', label: 'Bronze-medal standard' },
  { value: 1, short: 'Bronze', label: 'Bronze-medal standard' },
  { value: 0, short: 'None', label: 'No award' },
];

export const MEDALS = [
  { key: 'gold', name: 'Gold Medal' },
  { key: 'silver', name: 'Silver Medal' },
  { key: 'bronze', name: 'Bronze Medal' },
  { key: 'none', name: 'No award' },
];

export function medalByKey(key) {
  return MEDALS.find((m) => m.key === key) || null;
}

/* Point bands per panel size. The three-judge bands are the published ones
   (11–12 Gold, 8–10 Silver, 1–7 Bronze out of 12). The two-judge bands are
   those same proportions rescaled to a maximum of 8, so Gold still means
   both judges independently saw gold-standard work. */
export const MEDAL_BANDS = {
  3: { max: 12, gold: 11, silver: 8, bronze: 1 },
  2: { max: 8, gold: 8, silver: 6, bronze: 1 },
};

export function bandsFor(judgeCount) {
  return MEDAL_BANDS[judgeCount] || MEDAL_BANDS[3];
}

export function maxPointsFor(judgeCount) {
  return bandsFor(judgeCount).max;
}

export function medalFor(total, judgeCount) {
  const b = bandsFor(judgeCount);
  if (total >= b.gold) return medalByKey('gold');
  if (total >= b.silver) return medalByKey('silver');
  if (total >= b.bronze) return medalByKey('bronze');
  return medalByKey('none');
}

/* A spread of 2 or more between the highest and lowest mark on a 0–4 scale
   is a real disagreement about which medal the piece deserves, not a
   rounding difference. Advisory only — it puts the group in front of the
   Awards Committee Chairman, who has the final say. */
export const SPREAD_FLAG_AT = 2;

export const FLAG_LABELS = {
  unselected: 'Not yet selected',
  incomplete: 'Awaiting marks',
  spread: 'Judges disagree',
  ruled: 'Chairman ruling',
  conflict: 'Own work',
};

export function flagLabel(key) {
  return FLAG_LABELS[key] || key;
}

/* --------------------------------------------------------------------------
   Group scoring

   The unit of judging is a group: one exhibitor's entries within one
   category. A group holds a scope decision made by the team —

     'representative'  one piece is selected and judged as the best of the
                       group; only that piece takes the medal.
     'collection'      the whole group is judged together and every piece in
                       it takes the same medal.

   A group of one piece needs no scope decision; it is simply that piece.
-------------------------------------------------------------------------- */

export function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function makeGroupKey(name, categoryId) {
  return `${normalizeName(name)}::${categoryId}`;
}

export function emptyGroup(key) {
  return { key, scope: null, repEntryId: null, teamId: null, marks: {}, ruling: null, rulingNote: '' };
}

/* Judges do not judge their own work. Matching is on the exhibitor's name as
   registered against the judge's name as configured in Settings — if a judge
   seat has no name set, no conflict can be detected and the rule falls back
   to the panel policing it themselves. */
export function isOwnWork(judgeName, exhibitorName) {
  const j = normalizeName(judgeName);
  return !!j && j === normalizeName(exhibitorName);
}

/**
 * @param {object} group      stored group record (may be undefined)
 * @param {number} judgeCount size of the team judging it (2 or 3)
 * @param {string[]} memberIds ids of the entries currently in the group
 */
export function computeGroup(group, judgeCount, memberIds = []) {
  const g = group || emptyGroup('');
  const expected = judgeCount || 3;
  const b = bandsFor(expected);
  const members = Array.isArray(memberIds) ? memberIds : [];
  const memberCount = members.length || 1;
  // The organizer can move an entry to another category after the team has
  // selected it as the representative for this one. That leaves the stored
  // rep pointing outside the group, so the selection no longer means
  // anything and has to be made again rather than silently ignored.
  const repValid = !!g.repEntryId && (members.length === 0 || members.includes(g.repEntryId));

  const marks = Object.entries(g.marks || {})
    .map(([slot, value]) => ({ slot: Number(slot), value }))
    .filter((m) => m.value !== null && m.value !== undefined && !Number.isNaN(Number(m.value)))
    .sort((a, x) => a.slot - x.slot);

  const n = marks.length;
  const total = marks.reduce((sum, m) => sum + Number(m.value), 0);
  const complete = n >= expected;

  const needsScope = memberCount > 1;
  const scopeSet = !needsScope || g.scope === 'collection' || (g.scope === 'representative' && repValid);

  const provisional = medalFor(total, expected);
  const ruled = !!g.ruling;
  const finalMedal = ruled ? medalByKey(g.ruling) : complete && scopeSet ? provisional : null;

  const flags = [];
  if (!scopeSet) {
    flags.push({
      key: 'unselected',
      text: `${memberCount} pieces from this exhibitor in this category. The team decides together whether to judge one as representative of the group, or to judge the whole collection as one.`,
    });
  }
  if (scopeSet && !complete) {
    flags.push({ key: 'incomplete', text: `${n} of ${expected} judges' marks are in.` });
  }
  if (n >= 2) {
    const values = marks.map((m) => Number(m.value));
    const spread = Math.max(...values) - Math.min(...values);
    if (spread >= SPREAD_FLAG_AT) {
      flags.push({
        key: 'spread',
        text: `Marks range from ${Math.min(...values)} to ${Math.max(...values)}. Flagged for the Awards Committee Chairman, who has the final say. The total stands unless he rules otherwise.`,
      });
    }
  }
  if (ruled) {
    flags.push({
      key: 'ruled',
      text: `The Awards Committee Chairman set this to ${medalByKey(g.ruling)?.name || g.ruling}${g.rulingNote ? ` — ${g.rulingNote}` : ''}.`,
    });
  }

  return {
    marks, n, expected, total,
    max: b.max,
    scope: needsScope ? g.scope : 'single',
    repEntryId: repValid ? g.repEntryId : null,
    needsScope, scopeSet, complete, ruled,
    provisionalMedal: provisional,
    finalMedal,
    flags,
  };
}

/* Convenience for display: "8 / 12" */
export function fmtPoints(total, max) {
  return `${total} / ${max}`;
}
