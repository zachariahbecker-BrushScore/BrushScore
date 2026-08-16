// Category taxonomy, and the 27-award catalogue that filters against it.
// Kept separate from App.jsx because both scoring and the award-eligibility
// filters read from here.
//
// Painters/Open and Junior are baked directly into the category names below
// rather than tracked as a separate Division field — "Historical Painters"
// and "Historical Open" are two distinct categories, not one category with
// a division attached. Ordnance is deliberately not its own category: it's
// split into the four subdivisions below, each a full category in its own
// right, matching the four awards (Best Ordnance, Best Maritime, Best
// Aircraft, Best Civilian Vehicle) that already existed for them.
export const DEFAULT_CATEGORIES = [
  'Junior (under 18 years only)',
  'Historical Painters',
  'Historical Open',
  'Fantasy/Science Fiction Painters',
  'Fantasy/Science Fiction Open',
  'Flats',
  'Wargame',
  'Ordnance/Armor/Military Vehicles',
  'Maritime/Ships',
  'Aircraft',
  'Civilian Vehicles',
  'Gundam Painters',
  'Gundam Open',
  'Diorama',
];

export const DEFAULT_SHOW_THEME = 'Celebrating 250 Years Since the Signing of the Declaration of Independence';

// group: 'cat' (category), 'named' (subject, panel discretion),
// 'show' (announced last). multi: true allows more than one recipient.
export const SPECIAL_AWARDS = [
  { id: 'best-junior', name: 'Best Junior', group: 'cat', filter: { category: 'Junior (under 18 years only)' } },
  { id: 'best-hist-painters', name: 'Best Historical Painters', group: 'cat', filter: { category: 'Historical Painters' } },
  { id: 'best-hist-open', name: 'Best Historical Open', group: 'cat', filter: { category: 'Historical Open' } },
  { id: 'best-fsf-painters', name: 'Best Fantasy & Sci-Fi Painters', group: 'cat', filter: { category: 'Fantasy/Science Fiction Painters' } },
  { id: 'best-fsf-open', name: 'Best Fantasy & Sci-Fi Open', group: 'cat', filter: { category: 'Fantasy/Science Fiction Open' } },
  { id: 'best-flat', name: 'Best Flat', group: 'cat', filter: { category: 'Flats' } },
  { id: 'best-wargame', name: 'Best Wargame', group: 'cat', filter: { category: 'Wargame' } },
  { id: 'best-ordnance', name: 'Best Ordnance', group: 'cat', filter: { category: 'Ordnance/Armor/Military Vehicles' } },
  { id: 'best-maritime', name: 'Best Maritime', group: 'cat', filter: { category: 'Maritime/Ships' } },
  { id: 'best-aircraft', name: 'Best Aircraft', group: 'cat', filter: { category: 'Aircraft' } },
  { id: 'best-civilian-vehicle', name: 'Best Civilian Vehicle', group: 'cat', filter: { category: 'Civilian Vehicles' } },
  { id: 'best-gundam-painters', name: 'Best Gundam Painters', group: 'cat', filter: { category: 'Gundam Painters' } },
  { id: 'best-gundam-open', name: 'Best Gundam Open', group: 'cat', filter: { category: 'Gundam Open' } },
  { id: 'best-diorama', name: 'Best Diorama', group: 'cat', filter: { category: 'Diorama' } },
  // No Bust category in the current list, so this has nothing to filter on
  // — moved to panel discretion like the other named awards rather than
  // silently dropped. Remove it, or give it a category filter, if that's
  // not what you want.
  { id: 'best-bust', name: 'Best Bust', group: 'named' },

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
  { key: 'cat', title: 'Category awards', note: 'One per line. Lists narrow to eligible entries; switch to the full field if the panel wants to reach outside it.' },
  { key: 'named', title: 'Subject & named awards', note: 'Panel discretion — any entry may be nominated regardless of category.' },
  { key: 'show', title: 'Show awards', note: 'Announced last.' },
];

// Entries carry a categoryId, not a category name, so eligibility has to
// resolve the name through the show's category list. (Earlier versions of
// this function checked e.categoryName directly — a field nothing ever set,
// which meant every category-specific award silently had zero eligible
// entries unless "Show all entries" was ticked. Fixed by resolving the name
// here instead of expecting the caller to have already attached it.)
export function eligibleEntries(award, entries, config) {
  if (!award.filter?.category) return entries;
  return entries.filter((e) => {
    const name = config?.categories?.find((c) => c.id === e.categoryId)?.name;
    return name === award.filter.category;
  });
}
