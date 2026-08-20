# What changed

Judging is now the **Open system** used by the NCMSS and most U.S. figure
exhibitions (Chicago, Atlanta, MFCA). This replaces the previous 100-point
rubric entirely — see [Superseded](#superseded-what-the-old-build-did) at the
bottom for what went away.

Five files change. No new dependencies, no Supabase schema change, no build
config change. Verified against a real `vite build`, not a syntax check.

```
src/App.jsx                  — rewritten
src/scoring.js               — rewritten
BrushScore-User-Manual.docx  — rewritten
CHANGES.md                   — this file
DEPLOY.md                    — rewritten
```

`src/awards.js` and `src/qrcode.js` are **unchanged** and need no edits. Their
exports still match every import in `App.jsx`.

---

## The judging system

### Teams, not a panel

Judging is done by two or more teams, each normally of three judges. Teams are
configured in Organizer → Settings: each has a name, a size (three or two), a
name for each judge seat, and the categories it covers. A category belongs to
at most one team — assigning it to a second moves it rather than duplicating
it — and a category left unassigned is visible to every team, so nothing goes
unjudged by accident.

There is **no head judge**. That role is gone; disagreements go to the Awards
Committee Chairman instead (below).

**Judges do not judge their own work.** Where judge names are filled in under
Settings, the app matches them against the exhibitor name and locks that group
on that judge's device. This is a convenience, not a guarantee: it only matches
the name as registered, so a spelling variant ("Bob Smith" vs "Robert Smith")
slips past, and an unnamed seat gets no check at all. The rule still needs the
panel to keep it.

### One mark per piece, 0–4

Each judge gives each selected piece or group **one whole number**, not a mark
per criterion:

| Mark | Meaning |
|---|---|
| 4 | Gold Medal standard |
| 3 | Silver Medal standard |
| 1–2 | Bronze Medal standard |
| 0 | No award |

The six criteria — Degree of Difficulty, Creativity, Workmanship, Painting
Skill, Presentation & Overall Effect, Historical Accuracy — are what a judge
weighs in reaching that number. They are not scored separately, carry no point
values, and are in no order of importance. They're available in-app under
"Judging criteria" on any open group.

### Points to medals

Marks are summed. The total earns the medal.

| Medal | Three judges (max 12) | Two judges (max 8) |
|---|---|---|
| Gold Medal | 11 – 12 | 8 |
| Silver Medal | 8 – 10 | 6 – 7 |
| Bronze Medal | 1 – 7 | 1 – 5 |
| No award | 0 | 0 |

The three-judge bands are the published ones. The two-judge bands are those
same proportions rescaled to a maximum of 8, so a Gold still means every judge
on the team independently saw gold-standard work. Panel size is set **per
team**, so one team can run short-handed without affecting the others.

Worth knowing: a two-judge team is stricter at the top. With three judges one
judge can mark 3 and the piece still golds; with two there's no room to absorb
that. The Chairman's ruling is the release valve.

Both band tables live in `MEDAL_BANDS` in `src/scoring.js` if you ever need to
change them.

### Groups: representative vs collection

The unit of judging is a **group** — one exhibitor's entries within one
category. An exhibitor with four figures in Historical Painters is one group of
four; an exhibitor with entries in three categories has three separate groups,
each judged on its own. An exhibitor cannot have two groups inside one
category.

Groups are derived from the entry list, never stored as records of their own,
so moving an entry between categories in the Organizer Console just moves it
between groups.

Where a group holds more than one piece, the team decides together, before
scoring:

- **Representative** — the single best piece is selected and judged as
  representative of the group. Only that piece is medalled.
- **Collection** — the group is judged as one and every piece in it takes the
  same medal.

The decision is recorded against the group as a team call — there's no
head-judge gate on it. Until it's made, the marking buttons stay disabled.

**Changing the decision clears the marks.** A mark for "the best of these four"
is not a mark for the collection, so carrying marks across would build a total
out of judgements nobody made. Deliberate; reversible if you'd rather it
didn't.

### The Awards Committee Chairman

Supervises the judging and does not score — the detachment is the point of the
role. Works from **Organizer → Judging**, which lists every group with its
marks, total, medal, and which pieces are medalled, with a filter for groups
needing review.

Opening a group gives him the ruling controls: set the medal directly to Gold,
Silver, Bronze, or No award with an optional recorded reason. A ruling
overrides the point total and can be cleared. This is his final say on any
disagreement or tie.

Groups are flagged for him when the marks on them range by **2 or more** — on a
0–4 scale that's a real disagreement about which medal is deserved, not a
rounding difference. Advisory: the total stands unless he rules.

---

## Registration: separate email and phone

The single "Email or phone" box is now two fields, with `type="email"` and
`type="tel"` so phones raise the right keyboard. Both remain optional.

**Old entries migrate automatically on load.** A saved `contact` string
containing `@` becomes the email, anything else becomes the phone. The original
string is kept untouched in `contact`, so nothing is lost if a guess goes the
wrong way. The migration is idempotent and won't overwrite entries that already
have the new fields.

Search at the Registration Desk and in Organizer → Entries now matches email
and phone as well as name, model, and entry number — useful when a name was
written down differently from how the entrant says it.

---

## Registrants can find their own entries again

Answering "what if someone loses their paperwork" without adding accounts.

The device that submitted an entry remembers it, and the home page offers those
entries back under **Your entries** — each with its QR code and a print button.
There's a "Not you? Clear" link for shared or borrowed machines.

This is per-device, not an account. It deliberately does **not** add a
public "look up entries by name" search, which would let anyone browse who
entered what. Anyone on a different device asks the desk, which can already
search and reprint.

Walk-ins are not remembered — they're submitted on the desk's device, not the
registrant's, and the tag is printed on the spot.

---

## Awards printout, by category and medal

Organizer → Print → results & awards sheet is now laid out for reading aloud at
the ceremony:

```
## Historical Painters
  SILVER MEDAL · 1
    Ann Lee                          8/12
      Collection award — all 2 pieces
        #004 Hussar
        #005 Lancer
  GOLD MEDAL · 1
    #002 Fusilier — Bob Smith       12/12
      Representative of 3 pieces
```

Categories run in configured order. Within each, medals appear in announcement
order — **Bronze, then Silver, then Gold** — and only where actually awarded,
so there are no empty headings. Within a medal, recipients sort by points
descending. A Chairman ruling is marked on the line. Categories with no medals
are collapsed into a single line at the end. Special awards follow in their own
table.

Page breaks are guarded so a name never gets orphaned from its medal.

---

## Data notes

Nothing needs a schema migration — `brushscore:groups` is simply another key in
the existing `brushscore_kv` store, written through the same `window.storage`
shim as everything else.

Two things to be aware of:

**Old scores don't carry over.** Per-entry `scores` and `headConfirm` written by
the rubric build are left on the record but never read. A show already judged
under the old system will show as unjudged. This is correct — a panel score out
of 100 has no meaning under the Open system and can't be converted honestly —
but it means an in-progress show should finish on the old build or be
re-judged.

**Old configs migrate.** `judgeCount` becomes the size of a single starter team
covering every category; `headJudgeSlot` is dropped rather than translated,
since the Open system has no head judge.

**Deleting an entry prunes its group.** If it was the last entry in a group, the
team's marks and decision go with it — otherwise an exhibitor deleted and
re-registered under the same name and category would silently inherit them.

---

## Verification

- **Real `vite build`** with all four `src/` files and both webp assets: clean,
  1807 modules.
- **42 scoring unit tests** covering both band tables, incomplete groups, the
  representative and collection paths, a representative invalidated by a
  category move, the spread flag boundary (fires at 2, not at 1), Chairman
  overrides including with partial marks, group-key normalisation, and the
  own-work check.
- **11 migration tests** on the contact split, including idempotency and the
  partial-new-format case.
- **Awards sheet grouping** driven with a fixture covering a representative
  award, a collection award, multiple medals in one category, and a category
  with none.
- **Manual** validated against the Word schema and rendered to PDF for a visual
  pass.

**Not verified:** anything needing a real browser — camera QR scanning, and how
the print CSS actually paginates on paper. Print one tag sheet and one awards
sheet before show day.

---

## Superseded: what the old build did

For anyone reading old notes. None of this is current:

- Three criteria scored separately — Technical ability 0–33, Composition 0–33,
  Difficulty 0–34 — summed to a judge score out of 100.
- Panel score as the rounded average of judge scores.
- Five tiers: Gold 86–100, Silver 76–85, Bronze 65–75, **Merit** 50–64, no
  award below 50. Merit no longer exists.
- A **head judge** slot who could move an entry up a tier at a boundary.
- A two-judge **reconcile** protocol at 14 points' divergence, with criterion
  re-marking at 7.
- A three-judge **outlier** flag at 20 points from the average of the other two.

The printed rules sheet in that build also contradicted itself, describing a
judge score as both the sum and the average of three marks. Gone with the
rewrite.
