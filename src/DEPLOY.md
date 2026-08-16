# Deploying the judging update

This updates the app that's actually live on your domain — the
React + Vite + Supabase build, not the standalone HTML version from
earlier in this project. Four files change. Nothing else does: same
`package.json`, same Supabase table, no new environment variables, no
schema migration. That's what makes this a much shorter deploy than the
relational-database version would have been.

Budget 30–45 minutes if this is a fresh show with no entries yet, or about
an hour if you need to migrate existing registrations (Step 6 covers that
— skip it if there's nothing registered yet).

---

## Step 1 — Get your repo in front of you

```bash
git clone https://github.com/<you>/brushscore.git
cd brushscore
git checkout -b judging-update
```

Already have it cloned? Just make sure it's current and start a branch
there instead:

```bash
cd brushscore
git pull
git checkout -b judging-update
```

Working on a branch means production keeps running on the old code until
you're ready to merge — nothing changes for anyone using the live link
until Step 9.

---

## Step 2 — Back up your data

Before touching anything, export what's in Supabase now. **Table Editor →
`brushscore_kv` → Export → CSV**, or from SQL Editor:

```sql
copy (select * from brushscore_kv) to stdout with csv header;
```

Takes ten seconds and means a bad deploy costs you a rollback, not your
show's registrations.

---

## Step 3 — Drop in the four files

Copy these into `src/`, overwriting `App.jsx`:

```
src/App.jsx      (replace)
src/scoring.js   (new)
src/awards.js    (new)
src/qrcode.js    (new)
```

Nothing else in the project changes. Specifically — do **not** touch:
`package.json`, `vite.config.js`, `tailwind.config.js`,
`postcss.config.js`, `main.jsx`, `index.html`, `index.css`,
`storageShim.js`, `supabaseClient.js`, `supabase-setup.sql`, `.env`. If
your diff touches any of those, something copied wrong — check before
continuing.

```bash
git add src/App.jsx src/scoring.js src/awards.js src/qrcode.js
git status
```

Confirm the status shows exactly one modified file and three new ones.

---

## Step 4 — Install and build locally

No new dependencies were added, but running install confirms your
lockfile is happy:

```bash
npm install
npm run build
```

The build should complete clean — this is the same command Vercel or
Netlify will run, so a failure here is a failure there. If it fails, stop
and paste the error rather than pushing.

---

## Step 5 — Run it and walk through the checklist

```bash
npm run dev
```

Open `http://localhost:5173` and go through this in order:

1. **Setup or Settings.** If this is a fresh install you'll land on the
   setup wizard. If you already have a show configured, go to
   Organizer → Settings → Edit show settings. Either way, confirm the new
   **Judging panel** section is there — Judges per entry (2 or 3) and
   Head judge — and a **Show theme** field. Set them for your show.
2. **Register a test entry.** Confirm the Category dropdown lists the
   full 14-name set — Junior, Historical Painters, Historical Open, and
   so on — with no separate Division field alongside it (Painters, Open
   and Junior are baked into the category names themselves now). Submit
   it, and on the confirmation screen confirm the QR renders instantly
   with no network request — open your browser's dev tools Network tab first if
   you want to see that nothing goes out to `api.qrserver.com` anymore.
   Click **Print my tag** and confirm a print preview opens with the QR,
   title, category, and a notes box that's visibly bigger than before.
3. **Registration Desk.** Confirm each row has a small print icon, and
   that you can select several entries and print them as a batch.
4. **Judging.** Unlock with your staff PIN. Confirm a row of judge-slot
   buttons appears at the top ("I am — Judge 1 · Head, Judge 2, Judge 3").
   Open your test entry, and as Judge 1 enter three marks — Technical
   ability (0–33), Composition (0–33), Difficulty (0–34), each field
   capped at its own max, with the range printed right next to the
   label. Confirm a score meter and a tier chip appear. Switch to
   Judge 2, enter marks, then Judge 3 if your panel is set to 3 —
   confirm the panel score is the average of the three judges' totals,
   rounded.
   Test the two-judge path too: in Settings, switch Judges per entry to
   2, come back, and score an entry with a wide split — something like
   29/30/31 for one judge (a 90) and 23/23/24 for the other (a 70) —
   confirm a **Reconcile** notice appears. Then try two scores landing
   within 2 points of a tier line — 27/28/29 both judges (an 84, just
   under Gold's 86) — confirm a **Head judge** notice appears, and that
   only the slot marked head in Settings can click "Move up a tier."
5. **Organizer → Awards.** Confirm all 27 named awards are listed, that
   Best Junior's dropdown only offers entries registered under the
   Junior category, that Best Historical Painters only offers Historical
   Painters entries (not Historical Open), and that the Capital Palette
   award lets you add more than one recipient. If any category-specific
   dropdown comes up empty when it shouldn't, that's the eligibility bug
   this update fixed — see CHANGES.md — so it's worth this specific check.
6. **Organizer → Print.** Try each of the three buttons — all tags,
   results & awards sheet, judging rules — and confirm each opens a print
   preview without error.
7. **Results.** With something published, confirm the tier groupings and
   the special-awards list render.

Delete the test entry when you're done (Organizer → Entries → trash
icon) so it doesn't show up in your real show.

---

## Step 6 — Migrate existing entries (skip if nothing's registered yet)

One field doesn't carry over as cleanly as everything else, so if you
already have real registrations, do this before you announce the update.

**Categories.** The category list is now this exact 14-name set — Division
is gone, so Painters/Open/Junior live in the category name itself:

```
Junior (under 18 years only)      Ordnance/Armor/Military Vehicles
Historical Painters               Maritime/Ships
Historical Open                   Aircraft
Fantasy/Science Fiction Painters  Civilian Vehicles
Fantasy/Science Fiction Open      Gundam Painters
Flats                             Gundam Open
Wargame                           Diorama
```

In Organizer → Settings, rename your existing categories to match these —
you don't strictly have to use these exact names, but the 27 awards'
eligibility filters in `src/awards.js` are written against this exact set,
so a category that doesn't match one of these strings won't feed any
award's dropdown. If you rename a category that already has entries, go to
Organizer → Entries afterward and reassign those entries to the new name —
renaming the category in Settings doesn't retroactively touch entries
already filed under the old name.

If your existing categories used a Division field (Open/Painters/Junior)
alongside a plain category name, that field is gone from the entry form
now — there's nothing to migrate for it specifically, since the category
rename above is what replaces it. An entry that was "Historical" +
division "Painters" just needs its category changed to "Historical
Painters" directly.

This doesn't need to happen before you deploy — the app runs fine with
whatever category names are already there. It just means the category-
specific awards won't have the right candidates in their dropdowns until
you do this pass.

---

## Step 7 — Commit

```bash
git add -A
git commit -m "Judging: multi-judge scoring, 27 awards, offline QR, tag printing"
git push -u origin judging-update
```

---

## Step 8 — Open a PR and check the preview

If your repo is connected to Vercel or Netlify, pushing the branch
triggers a preview deployment automatically — check your host's dashboard
for a preview URL, or look for a bot comment on the PR with the link.

Run through the Step 5 checklist again on the preview URL specifically.
It's talking to the same Supabase project as production, so use another
throwaway test entry and delete it after — don't test against anything
that matters on the branch preview.

---

## Step 9 — Merge and deploy

```bash
git checkout main
git merge judging-update
git push
```

This triggers your production deploy the same way any other push does —
no new environment variables, no dashboard changes, nothing else to flip.
Watch your host's dashboard for the build to go green.

---

## Step 10 — Final check on the real domain

Once production is live, do one more pass on your actual URL: register a
test entry, print its tag, score it as two different judges, confirm the
tier and a special-award assignment show up on Results, then delete the
test entry. This is the same list as Step 5 — the point is running it
against the real domain and real DNS, not localhost, since that's what
catches anything environment-specific.

---

## What to tell your judges and desk staff

Nothing about their PIN or their link changes. What's new for judges: they
now pick which judge they are before scoring, and they score three
numbers instead of picking one award from a list. Print the judging rules
sheet (Organizer → Print) and hand it out before the next show — it has
the rubric and both the two-judge and three-judge protocols spelled out.

## If a judge doesn't show up on show day

Organizer → Settings → Judges per entry → 2. Save. No redeploy, no code
change — the two-judge reconciliation and boundary rules take over
immediately for every entry from that point on.
