/* ---------------------------------------------------------------------------
   deck.js — the awards ceremony deck

   Purely a renderer. App.jsx assembles the program (what is announced, in what
   order) because that is where buildAwards and the group helpers already live;
   this file turns that program into slides and knows nothing about groups,
   medals or scoring. Keeping the split means the ceremony order can change
   without touching layout, and layout can change without touching scoring.

   pptxgenjs is loaded with a dynamic import() from the caller, so its ~2MB
   never reaches anyone who doesn't press the button.

   Note on reveals: pptxgenjs cannot author entrance animations. A slide arrives
   whole. The announce-then-reveal pattern would have to be two slides per
   award; this deck deliberately puts a medal tier's winners on one slide
   instead, so the announcer reads down a list rather than clicking per name.
--------------------------------------------------------------------------- */

/* Palette sampled from the N.C.M.S.S. seal: the ring navy is #155083 and the
   cross is #FDFE2C. That yellow is too acid to set type in, so headings use a
   tempered gold and the raw yellow is kept for rules and marks where it reads
   as the seal's colour rather than as text. */
const NAVY = '081B33';        // deeper than the seal's ring, so the seal reads against it
const NAVY_SOFT = '10365C';
const RING = '155083';
const GOLD = 'F2CE3E';
const GOLD_BRIGHT = 'FDFE2C';
const WHITE = 'FFFFFF';
const MUTED = 'A9BCD2';
const ACCENT = '8FD3C3';

// Back-compat aliases for the slide helpers below.
const SLATE = NAVY;
const SLATE_SOFT = NAVY_SOFT;
const AMBER = GOLD;
const TEAL = ACCENT;

const W = 13.333;
const H = 7.5;

/* Vertical budget for a winners slide, in units of one headline's height.
   Costed rather than counted because the three line kinds are different
   heights: a name, its exhibitor line, and a collection's piece list. A
   four-piece collection costs about as much as two plain winners, and
   getting this wrong pushes names off the bottom of the slide where nobody
   sees them until the ceremony. */
const LINE_BUDGET = 8.5;
const COST_HEADLINE = 1.0;
const COST_SUB = 0.65;
const COST_PIECE = 0.55;

function itemLines(item) {
  return COST_HEADLINE
    + (item.sub ? COST_SUB : 0)
    + (item.pieces && item.pieces.length > 1 ? item.pieces.length * COST_PIECE : 0);
}

function paginate(items) {
  const pages = [];
  let page = [];
  let used = 0;
  items.forEach((item) => {
    const cost = itemLines(item);
    if (page.length && used + cost > LINE_BUDGET) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(item);
    used += cost;
  });
  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
}

/* The society's furniture, defined once. Everything the club's branding owns
   lives here and in the palette above, which is the point: it is in the repo,
   so it survives regenerating the deck. Anything added by hand in PowerPoint
   does not. */
const MASTER = 'NCMSS';
const MASTER_SOFT = 'NCMSS_SOFT';
const MASTER_BARE = 'NCMSS_BARE';

const BAND_H = 0.62;

function furniture(seal) {
  const objects = [
    // A solid band rather than a hairline: a rule thin enough to look elegant
    // on a laptop disappears entirely on a projector at the back of a hall.
    { rect: { x: 0, y: H - BAND_H, w: W, h: BAND_H, fill: { color: RING } } },
    { rect: { x: 0, y: H - BAND_H - 0.045, w: W, h: 0.045, fill: { color: GOLD_BRIGHT } } },
  ];
  if (seal) objects.push({ image: { data: seal, x: 0.42, y: H - BAND_H + 0.08, w: 0.46, h: 0.46 } });
  objects.push({
    text: {
      text: 'National Capital Model Soldier Society',
      options: {
        x: seal ? 1.0 : 0.42, y: H - BAND_H + 0.11, w: 6.0, h: 0.4,
        fontSize: 11, color: WHITE, valign: 'middle', charSpacing: 0.6, fontFace: 'Arial',
      },
    },
  });
  objects.push({
    text: {
      text: 'To Honor History Through Art',
      options: {
        x: W - 5.2, y: H - BAND_H + 0.11, w: 4.78, h: 0.4,
        fontSize: 11, italic: true, color: GOLD, align: 'right', valign: 'middle', fontFace: 'Arial',
      },
    },
  });
  return objects;
}

export function defineMasters(pptx, seal) {
  pptx.defineSlideMaster({ title: MASTER, background: { color: NAVY }, objects: furniture(seal) });
  pptx.defineSlideMaster({ title: MASTER_SOFT, background: { color: NAVY_SOFT }, objects: furniture(seal) });
  // Title and closing carry the seal full size, so they take the band without
  // the small mark repeating it.
  pptx.defineSlideMaster({ title: MASTER_BARE, background: { color: NAVY }, objects: furniture(null) });
}

function base(pptx, { fill = SLATE, bare = false } = {}) {
  const name = bare ? MASTER_BARE : fill === SLATE_SOFT ? MASTER_SOFT : MASTER;
  return pptx.addSlide({ masterName: name });
}

function eyebrow(slide, text) {
  slide.addText(text.toUpperCase(), {
    x: 0.8, y: 0.55, w: W - 1.6, h: 0.4,
    fontSize: 14, bold: true, color: AMBER, charSpacing: 3, fontFace: 'Arial',
  });
}

function rule(slide, y) {
  slide.addShape('rect', { x: 0.8, y, w: 1.6, h: 0.05, fill: { color: GOLD_BRIGHT } });
}

/* ------------------------------- slide kinds ------------------------------ */

function titleSlide(pptx, show, seal) {
  const s = base(pptx, { bare: true });
  if (seal) s.addImage({ data: seal, x: (W - 2.5) / 2, y: 0.75, w: 2.5, h: 2.5 });
  s.addText(show.name || 'Awards Ceremony', {
    x: 0.6, y: 3.45, w: W - 1.2, h: 1.0,
    fontSize: 44, bold: true, color: WHITE, align: 'center', fontFace: 'Arial',
  });
  s.addText('Awards Ceremony', {
    x: 0.6, y: 4.5, w: W - 1.2, h: 0.5,
    fontSize: 22, color: GOLD, align: 'center', charSpacing: 2, fontFace: 'Arial',
  });
  const meta = [show.date, show.location].filter(Boolean).join('  \u00b7  ');
  if (meta) {
    s.addText(meta, {
      x: 0.6, y: 5.1, w: W - 1.2, h: 0.4,
      fontSize: 14, color: MUTED, align: 'center', fontFace: 'Arial',
    });
  }

  s.addNotes(
    `Generated ${show.generatedAt}.\n\n`
    + 'This deck is a snapshot of the results at that moment. If judging or award '
    + 'assignments changed afterwards, regenerate it from Organizer Console \u2192 Print.\n\n'
    + 'Branding and sponsor slides added by hand are lost on regeneration. Freeze the '
    + 'results, generate, then brand \u2014 not the other way round.'
  );
  return s;
}

function dividerSlide(pptx, title, subtitle) {
  const s = base(pptx, { fill: SLATE_SOFT });
  s.addShape('rect', { x: 0, y: 3.12, w: W, h: 0.055, fill: { color: GOLD_BRIGHT } });
  s.addShape('rect', { x: 0, y: 3.185, w: W, h: 0.02, fill: { color: RING } });
  s.addText(title, {
    x: 0.8, y: 2.0, w: W - 1.6, h: 1.0,
    fontSize: 46, bold: true, color: WHITE, align: 'center', fontFace: 'Arial',
  });
  if (subtitle) {
    s.addText(subtitle, {
      x: 0.8, y: 3.3, w: W - 1.6, h: 0.5,
      fontSize: 16, color: MUTED, align: 'center', fontFace: 'Arial',
    });
  }
  return s;
}

// One medal tier of one category: every winner at that tier, on one slide.
function winnersSlide(pptx, { eyebrowText, heading, items, continued, notes }) {
  const s = base(pptx);
  eyebrow(s, eyebrowText);
  s.addText(heading + (continued ? ' (continued)' : ''), {
    x: 0.8, y: 0.95, w: W - 1.6, h: 0.85,
    fontSize: 40, bold: true, color: WHITE, fontFace: 'Arial',
  });
  rule(s, 1.85);

  if (!items.length) {
    s.addText('No awards at this level', {
      x: 0.8, y: 2.2, w: W - 1.6, h: 0.5, fontSize: 18, color: MUTED, italic: true, fontFace: 'Arial',
    });
    return s;
  }

  const lines = [];
  items.forEach((item) => {
    lines.push({
      text: item.headline,
      options: { fontSize: 26, bold: true, color: WHITE, breakLine: true, paraSpaceBefore: 13 },
    });
    if (item.sub) {
      lines.push({
        text: item.sub,
        options: { fontSize: 17, color: item.subAccent ? TEAL : MUTED, breakLine: true },
      });
    }
    if (item.pieces && item.pieces.length > 1) {
      item.pieces.forEach((p) => {
        lines.push({
          text: `      ${p}`,
          options: { fontSize: 14, color: MUTED, breakLine: true },
        });
      });
    }
  });

  s.addText(lines, { x: 0.85, y: 2.15, w: W - 1.7, h: H - 3.05, valign: 'top', fontFace: 'Arial' });
  if (notes) s.addNotes(notes);
  return s;
}

// A single named recipient, given the whole slide.
function awardSlide(pptx, { eyebrowText, award, item, notes, finale }) {
  const s = base(pptx, { fill: finale ? SLATE : SLATE });
  eyebrow(s, eyebrowText);
  s.addText(award, {
    x: 0.8, y: finale ? 1.75 : 1.6, w: W - 1.6, h: 1.2,
    fontSize: finale ? 46 : 38, bold: true, color: AMBER,
    align: 'center', fontFace: 'Arial',
  });
  if (!item) {
    s.addText('Not awarded', {
      x: 0.8, y: 3.1, w: W - 1.6, h: 0.6, fontSize: 20, color: MUTED, italic: true,
      align: 'center', fontFace: 'Arial',
    });
    return s;
  }
  s.addText(item.headline, {
    x: 0.8, y: finale ? 3.45 : 3.25, w: W - 1.6, h: 1.1,
    fontSize: finale ? 42 : 36, bold: true, color: WHITE, align: 'center', fontFace: 'Arial',
  });
  if (item.sub) {
    s.addText(item.sub, {
      x: 0.8, y: finale ? 4.25 : 3.95, w: W - 1.6, h: 0.5,
      fontSize: 17, color: item.subAccent ? TEAL : MUTED, align: 'center', fontFace: 'Arial',
    });
  }
  if (item.pieces && item.pieces.length > 1) {
    s.addText(item.pieces.join('   \u00b7   '), {
      x: 0.9, y: finale ? 4.85 : 4.55, w: W - 1.8, h: 0.9,
      fontSize: 13, color: MUTED, align: 'center', fontFace: 'Arial',
    });
  }
  if (notes) s.addNotes(notes);
  return s;
}

/* An award with several recipients (the Capital Palette awards) needs the list
   layout; a single recipient gets the full slide. */
function oneAward(pptx, eyebrowText, sp, finale) {
  if ((sp.items || []).length > 1) {
    paginate(sp.items).forEach((page, i) => {
      winnersSlide(pptx, {
        eyebrowText, heading: sp.award, items: page, continued: i > 0, notes: sp.notes,
      });
    });
    return;
  }
  awardSlide(pptx, { eyebrowText, award: sp.award, item: sp.items?.[0] || null, notes: sp.notes, finale });
}

/* --------------------------------- build ---------------------------------- */

export function renderDeck(pptx, program, seal) {
  pptx.defineLayout({ name: 'SB16x9', width: W, height: H });
  pptx.layout = 'SB16x9';
  pptx.author = 'N.C.M.S.S.';
  pptx.company = 'National Capital Model Soldier Society';
  pptx.title = `${program.show.name || 'Show'} \u2014 Awards`;

  defineMasters(pptx, seal);
  titleSlide(pptx, program.show, seal);

  program.categories.forEach((cat) => {
    dividerSlide(pptx, cat.name, cat.medalCount === 1 ? '1 award' : `${cat.medalCount} awards`);
    cat.tiers.forEach((tier) => {
      paginate(tier.items).forEach((page, i) => {
        winnersSlide(pptx, {
          eyebrowText: cat.name,
          heading: tier.label,
          items: page,
          continued: i > 0,
          notes: tier.notes,
        });
      });
    });
    if (cat.bestInCategory) oneAward(pptx, cat.name, cat.bestInCategory, false);
  });

  if (program.specials.length) {
    dividerSlide(pptx, 'Special Awards', null);
    program.specials.forEach((sp) => oneAward(pptx, 'Special Award', sp, false));
  }

  if (program.bestOfShow) oneAward(pptx, 'And finally', program.bestOfShow, true);

  const closing = base(pptx, { bare: true });
  closing.addText('Congratulations to every exhibitor', {
    x: 0.8, y: 2.6, w: W - 1.6, h: 1.0,
    fontSize: 32, bold: true, color: WHITE, align: 'center', fontFace: 'Arial',
  });
  if (seal) closing.addImage({ data: seal, x: (W - 1.5) / 2, y: 3.75, w: 1.5, h: 1.5 });


  return pptx;
}

export default renderDeck;
