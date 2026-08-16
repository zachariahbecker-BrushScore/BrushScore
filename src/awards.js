// Category + division taxonomy, and the 27-award catalogue that filters
// against it. Kept separate from App.jsx because both scoring and the
// award-eligibility filters read from here.

export const DEFAULT_CATEGORIES = [
  'Historical',
  'Fantasy & Sci-Fi',
  'Flat',
  'Wargame',
  'Ordnance',
  'Maritime',
  'Aircraft',
  'Civilian Vehicle',
  'Gundam',
  'Diorama',
  'Bust',
];

// Division applies across every category. Only some awards filter on it
// (Painters/Open splits for Historical, Fantasy & Sci-Fi and Gundam; Junior
// applies everywhere).
export const DIVISIONS = ['Open', 'Painters', 'Junior'];

export const DEFAULT_SHOW_THEME = 'Celebrating 250 Years Since the Signing of the Declaration of Independence';

// group: 'cat' (division/category), 'named' (subject, panel discretion),
// 'show' (announced last). multi: true allows more than one recipient.
export const SPECIAL_AWARDS = [
  { id: 'best-junior', name: 'Best Junior', group: 'cat', filter: { division: 'Junior' } },
  { id: 'best-hist-painters', name: 'Best Historical Painters', group: 'cat', filter: { category: 'Historical', division: 'Painters' } },
  { id: 'best-hist-open', name: 'Best Historical Open', group: 'cat', filter: { category: 'Historical', division: 'Open' } },
  { id: 'best-fsf-painters', name: 'Best Fantasy & Sci-Fi Painters', group: 'cat', filter: { category: 'Fantasy & Sci-Fi', division: 'Painters' } },
  { id: 'best-fsf-open', name: 'Best Fantasy & Sci-Fi Open', group: 'cat', filter: { category: 'Fantasy & Sci-Fi', division: 'Open' } },
  { id: 'best-flat', name: 'Best Flat', group: 'cat', filter: { category: 'Flat' } },
  { id: 'best-wargame', name: 'Best Wargame', group: 'cat', filter: { category: 'Wargame' } },
  { id: 'best-ordnance', name: 'Best Ordnance', group: 'cat', filter: { category: 'Ordnance' } },
  { id: 'best-maritime', name: 'Best Maritime', group: 'cat', filter: { category: 'Maritime' } },
  { id: 'best-aircraft', name: 'Best Aircraft', group: 'cat', filter: { category: 'Aircraft' } },
  { id: 'best-civilian-vehicle', name: 'Best Civilian Vehicle', group: 'cat', filter: { category: 'Civilian Vehicle' } },
  { id: 'best-gundam-painters', name: 'Best Gundam Painters', group: 'cat', filter: { category: 'Gundam', division: 'Painters' } },
  { id: 'best-gundam-open', name: 'Best Gundam Open', group: 'cat', filter: { category: 'Gundam', division: 'Open' } },
  { id: 'best-diorama', name: 'Best Diorama', group: 'cat', filter: { category: 'Diorama' } },
  { id: 'best-bust', name: 'Best Bust', group: 'cat', filter: { category: 'Bust' } },

  { id: 'best-wwi-figure', name: 'Best World War I Figure', group: 'named' },
  { id: 'joe-bles-semper-fi', name: 'Joe Bles "Semper Fi" Award', group: 'named' },
  { id: 'best-us-infantryman', name: 'Best U.S. Infantryman Figure', group: 'named' },
  { id: 'best-napoleonic', name: 'Best Napoleonic Figure', group: 'named' },
  { id: 'victory-in-europe', name: 'Victory in Europe Award', group: 'named' },
  { id: 'best-gundam-award', name: 'Best Gundam Award', group: 'named' },
  { id: 'blast-from-the-past', name: 'Blast from the Past Award', group: 'named' },
  { id: 'capital-palette', name: 'NOVA Open Capital Palette Awards', group: 'named', multi: true },
  { id: 'founding-fathers', name: 'Founding Fathers Award', group: 'named' },
  { id: 'show-theme', name: 'Show Theme Award', group: 'named', useShowTheme: true },

  { id: 'judges-best-of-show', name: 'Judges Best of Show', group: 'show' },
  { id: 'peoples-choice', name: "Peoples' Choice Award", group: 'show' },
];

export const AWARD_GROUPS = [
  { key: 'cat', title: 'Division & category awards', note: 'One per line. Lists narrow to eligible entries; switch to the full field if the panel wants to reach outside it.' },
  { key: 'named', title: 'Subject & named awards', note: 'Panel discretion — any entry may be nominated regardless of category.' },
  { key: 'show', title: 'Show awards', note: 'Announced last.' },
];

export function eligibleEntries(award, entries) {
  if (!award.filter) return entries;
  return entries.filter(
    (e) =>
      (!award.filter.category || e.categoryName === award.filter.category) &&
      (!award.filter.division || e.division === award.filter.division)
  );
}
