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

## Judging

Registration desk and Judging both still work the way they do now. What's
new is inside Judging: a "Which judge are you?" picker (2 or 3 slots,
whichever the show is set to), and each entry opens into a scoring panel —
three criteria, Technical ability / Composition / Difficulty, marked 0–100.

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

## One real data-shape change: Category + Division

The old category editor let you attach free-text "classes" to a category
(the way Ordnance had Armor/Maritime/Aircraft/Civilian Vehicle stuffed
inside it). That doesn't line up with awards like Best Maritime or Best
Aircraft needing to query independently, so categories are back to a plain
name list, and every entry now also picks a **Division** — Open, Painters,
or Junior — the same one for every category. Existing entries load fine
without it (they default to Open); you'll want to open Organizer → Entries
once after deploying and set Division on anything registered before this
went live.

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
entry number, title, category, division, entrant, and a notes box roughly
double a single line — big enough for what people actually write.

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
