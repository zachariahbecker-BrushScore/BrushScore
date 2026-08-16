# What changed

Four files. Drop them into `src/`, overwriting the current `App.jsx` and
adding the three new ones. Nothing else in the project changes — no new
dependencies, no Supabase schema change, no build config change. Verified
against your actual `vite build` (not just a syntax check).

```
src/App.jsx      — rewritten
src/scoring.js   — new
src/awards.js    — new
src/qrcode.js    — new
```

## Update — weighted points per criterion, and a new category list

Two changes on top of the original judging rewrite:

**Each criterion now has its own point cap, shown right on the input.**
Technical ability is 0–33, Composition is 0–33, Difficulty is 0–34 — those
three add up to exactly 100, so a judge's score is now the *sum* of their
three marks rather than an average of three 0–100 marks. The number input
for each criterion is capped at its own max (typing over it clamps down),
and the label shows the range inline: "Technical ability (0–33)." Nothing
about the tier bands changed — 86/76/65/50 still mean the same thing,
because the three maxes were chosen to sum to 100. If you want a different
split (weighting Difficulty higher, say), the three `.max` values in
`src/scoring.js` just need to keep summing to 100 — there's a comment
right above them saying so.

One thing recalibrated to match: the reconciliation threshold for "these
two judges disagree enough on this specific criterion to discuss it" used
to be 20 points on the old 0–100-per-criterion scale. Criteria now max out
around 33–34, so that's rescaled to 7 — same roughly-20%-of-range trigger,
just proportional to the smaller ranges.

**Categories are back to a flat, named list — Division is gone.** Rather
than "Historical" as one category with a Painters/Open/Junior division
attached, the category list is now the 14 names you gave me directly:

```
Junior (under 18 years only)   Ordnance/Armor/Military Vehicles
Historical Painters            Maritime/Ships
Historical Open                Aircraft
Fantasy/Science Fiction Painters   Civilian Vehicles
Fantasy/Science Fiction Open   Gundam Painters
Flats                          Gundam Open
Wargame                        Diorama
```

Registration and every other screen lost the separate Division field —
Painters/Open/Junior are baked into the category name itself now, so
there's nothing left to ask for twice. I updated the 27 awards' eligibility
filters to match these exact category names (Best Historical Painters now
filters on the category literally named "Historical Painters," and so on).
The four former Ordnance sub-classes each became a real category in their
own right, which lines up one-to-one with the four awards that already
existed for them — Best Ordnance now filters to
"Ordnance/Armor/Military Vehicles" specifically, Best Maritime to
"Maritime/Ships," and so on.

One thing worth a decision from you: **there's no Bust category in this
list**, but Best Bust was one of the 27 awards. I didn't delete the award —
I moved it to the panel-discretion group (same as Best Napoleonic Figure
or Blast from the Past), so the panel can still hand it to any entry, it
just doesn't pre-filter to anything. If Bust should come back as its own
category, or the award should go away entirely, say which and it's a
one-line change either way.

Also worth knowing: award names weren't part of this change, so "Best
Fantasy & Sci-Fi Painters" is still the award's display name even though
the category underneath it is spelled out as "Fantasy/Science Fiction
Painters." They don't have to match — the filter does the work — but flag
it if you'd rather the award name matched the category spelling exactly.

**A real bug got caught and fixed along the way.** Testing the new
category-name filters surfaced something that was silently broken since
the original rewrite: award eligibility was checking a `categoryName`
field that nothing ever actually set on an entry, so every category-
specific award dropdown (Best Historical Painters, Best Diorama, all of
them except Best Junior) has been showing zero eligible entries all along
— unless "Show all entries" was ticked, which bypassed the bug by
accident. Fixed in `src/awards.js` so eligibility now resolves the
category name properly through the show's category list. Worth confirming
on your next deploy that these dropdowns actually populate — that's a
one-line check in the Step 5 checklist from `DEPLOY.md`.

## Update — categories that don't show up on an already-configured show

The Ordnance subdivisions (and any other name added to the default
category list after a show was already set up) weren't appearing for a
real reason: the default list only seeds a brand-new show. An existing
show keeps whatever category list it already saved, and updating the
source code doesn't reach back and rewrite that — same as changing a
recipe doesn't change what's already in the oven.

Fixed at load time rather than requiring a manual Settings visit: opening
the app now checks the saved category list against the current defaults,
and adds any default names that are missing — the four Ordnance
subdivisions, for instance, if they weren't there before. Anything you
renamed, reordered, or added yourself is left exactly as it is; this only
ever adds names that are missing, never touches ones that already exist.
The first time this runs it also saves the result back immediately, so
the newly-added categories keep the same id on every later load rather
than being regenerated — which matters, because entries already pointing
at one of those categories would otherwise go stale on the next reload.

Practically: deploy this update, open the app once, and the Ordnance
categories (and anything else the default list has picked up since your
show was configured) should just be there.

## Update — printed tags no longer show the entrant's name

Tags now carry only the model title, category, and notes — the entrant's
name is gone from the printed tag entirely. Everywhere else it's
unchanged: the desk, Organizer, and the results/awards sheet still show
who registered what.

## Judging

Registration desk and Judging both still work the way they do now. What's
new is inside Judging: a "Which judge are you?" picker (2 or 3 slots,
whichever the show is set to), and each entry opens into a scoring panel —
three criteria — Technical ability (0–33), Composition (0–33), Difficulty
(0–34) — each capped at its own max and summed, not averaged.

The maths: a judge's score is the average of their three marks. The panel
score is the average of the judges' scores, rounded. That's the tier:

| Tier | Panel score |
|---|---|
| Gold | 86–100 |
| Silver | 76–85 |
| Bronze | 65–75 |
| Merit | 50–64 |
| No award | below 50 |

Two judges get the same bands, resolved by a written protocol rather than a
majority vote: scores within 14 points stand as-is; wider than that, the
judges reconcile the criteria that differ by 20 or more; a panel score
landing within 2 points below a tier line goes to the head judge (set in
Settings) to move up or hold. All of this is in `src/scoring.js`, unit
tested against the worked examples independently of the UI.

Judges' individual marks stay hidden from each other on a given device
until that judge has entered their own — a soft gate, matching the trust
model the app already documents for the staff PIN. Anyone with dev tools
open could still read the underlying data; nothing here changes that, and I
didn't try to bolt on real per-judge accounts, since that's a materially
bigger change than what was asked. If you want that later, Supabase's
built-in auth is the natural next step — happy to build it when you want it.

## Awards

The 27 named awards live in `src/awards.js`, assignable from
Organizer → Awards. Category and division awards pre-filter their dropdown
to eligible entries (Best Junior only lists Juniors, Best Gundam Painters
only lists Gundam entries marked Painters); a checkbox opens each list to
every entry if the panel wants to reach outside it. Capital Palette takes
multiple recipients; the rest take one. Show Theme Award pulls its subtitle
from the show theme text you set in Settings.

## QR codes: no longer calls out to api.qrserver.com

The QR on the confirmation screen and on every printed tag is now generated
in the browser — same verified encoder from earlier in this conversation,
re-checked pixel-for-pixel against the reference `qrcode` library after the
port. Two effects: it keeps working with no internet at the point of
generation, and model titles and entrant names never leave the browser to
render a code. The payload format is unchanged (`BrushScore-ENTRY-<n>`), so
old printed tags still scan fine against the new build.

## Printing

Registrants get a "Print my tag" button on their confirmation screen. The
desk gets a print icon on every row plus a bulk "select and print" bar.
Organizer → Print adds print-all-tags, a results-and-awards sheet, and a
rules sheet for handing to judges. Tags print two to a Letter sheet: QR,
entry number, model title, category, and a notes box roughly double a
single line — big enough for what people actually write. **No entrant
name on the tag** — deliberately, so it's the model that gets identified
next to it, not who owns it. The entrant's name still lives in the data
(desk and Organizer screens show it) and still appears on the results and
awards sheet, since that one's naming a winner rather than sitting on a
table.

## Testing

Everything above was driven end to end in a headless browser (jsdom) built
from your actual project — setup wizard, registration, desk check-in, a
three-judge scoring pass matching the worked example from earlier
(marks of 88/84/80, 90/86/79, 74/78/76 → panel score 82, Silver), a
two-judge pass through reconcile → boundary → head-judge move-up, award
assignment including the Capital Palette multi-recipient case, and tag
printing. Then rebuilt through your real `vite build` — not a syntax
approximation — which completed clean.

What I didn't get to: a live run in an actual browser with a camera, so the
scan-to-check-in and scan-to-judge flows (unchanged from the current app)
are only as tested as they already were. Worth five minutes on a phone
before the next show.
