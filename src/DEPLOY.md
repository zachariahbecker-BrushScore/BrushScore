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
2. **Register a test entry.** Confirm the form now asks for **Division**
   (Open / Painters / Junior) in addition to Category. Submit it, and on
   the confirmation screen confirm the QR renders instantly with no
   network request — open your browser's dev tools Network tab first if
   you want to see that nothing goes out to `api.qrserver.com` anymore.
   Click **Print my tag** and confirm a print preview opens with the QR,
   title, category, division, and a notes box that's visibly bigger than
   before.
3. **Registration Desk.** Confirm each row has a small print icon, and
   that you can select several entries and print them as a batch.
4. **Judging.** Unlock with your staff PIN. Confirm a row of judge-slot
   buttons appears at the top ("I am — Judge 1 · Head, Judge 2, Judge 3").
   Open your test entry, and as Judge 1 enter three marks (Technical
   ability, Composition, Difficulty — 0 to 100 each). Confirm a score
   meter and a tier chip appear. Switch to Judge 2, enter marks, then
   Judge 3 if your panel is set to 3 — confirm the panel score is the
   average of the three judge averages, rounded.
   Test the two-judge path too: in Settings, switch Judges per entry to
   2, come back, and score an entry with a wide split (like 90/90/90 for
   one judge, 70/70/70 for the other) — confirm a **Reconcile** notice
   appears. Then try two scores that land within 2 points of a tier
   line (84/84/84 both judges, just under Gold's 86) — confirm a
   **Head judge** notice appears, and that only the slot marked head in
   Settings can click "Move up a tier."
5. **Organizer → Awards.** Confirm all 27 named awards are listed, that
   Best Junior's dropdown only offers Junior-division entries, and that
   the Capital Palette award lets you add more than one recipient.
6. **Organizer → Print.** Try each of the three buttons — all tags,
   results & awards sheet, judging rules — and confirm each opens a print
   preview without error.
7. **Results.** With something published, confirm the tier groupings and
   the special-awards list render.

Delete the test entry when you're done (Organizer → Entries → trash
icon) so it doesn't show up in your real show.

---

## Step 6 — Migrate existing entries (skip if nothing's registered yet)

Two of the old fields don't carry over as cleanly as everything else, so
if you already have real registrations, do this before you announce the
update.

**Categories.** The old category editor let you attach free-text classes
to a category — that's how "Ordnance" held Armor, Maritime, Aircraft, and
Civilian Vehicles as one category with four classes. The new award list
needs those as independent categories so Best Maritime and Best Aircraft
can each query their own pool. In Organizer → Settings, rename or split
your categories to match:

```
Historical · Fantasy & Sci-Fi · Flat · Wargame · Ordnance · Maritime
Aircraft · Civilian Vehicle · Gundam · Diorama · Bust
```

You don't have to use these exact names or this exact set — the award
filters just need the category name to match what's in `src/awards.js`
for the category-specific awards to have anything to list. If you rename
a category that already has entries, go to Organizer → Entries and
reassign those entries to the new name.

**Division.** Every existing entry loads with Division defaulted to
Open. If some of those were really Painters or Junior entries under the
old scheme, go to Organizer → Entries and set Division on each — that
dropdown is right there in the row alongside Category.

Neither of these needs to happen before you deploy — the app runs fine
with everything defaulted to Open. It just means the Painters/Open/Junior
awards won't have the right candidates until you do this pass.

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
