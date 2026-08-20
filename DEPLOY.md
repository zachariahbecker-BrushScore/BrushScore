# Deploying the Open judging system

This updates the app running on your domain — the React + Vite + Supabase
build. Two source files change, plus three documents. Nothing else does: same
`package.json`, same Supabase table, no new environment variables, no schema
migration.

Budget 30–45 minutes for a fresh show. Read **Step 0** first — if you have a
show that's already been judged, that changes your plan.

---

## Step 0 — Before anything: is a show already judged?

Scores from the previous rubric build **do not convert**. A judge score out of
100 has no honest translation into a 0–4 mark, so the app ignores old scores
rather than guessing. Any show already judged will show as unjudged after this
deploy.

- **Nothing judged yet** → carry on, no issue.
- **Judging in progress** → finish that show on the current build, then deploy.
- **Judged and finished, want the record kept** → print the results sheet from
  the current build *before* deploying, and keep the CSV from Step 2.

Registrations, check-ins, categories, and special awards are all unaffected.
This is only about scores.

---

## Step 1 — Get your repo in front of you

```bash
git clone https://github.com/<you>/brushscore.git
cd brushscore
git checkout -b open-judging
```

Already cloned? Update and branch there instead:

```bash
cd brushscore
git pull
git checkout -b open-judging
```

Working on a branch means production keeps running on the old code until you
merge at Step 9.

---

## Step 2 — Back up your data

**Table Editor → `brushscore_kv` → Export → CSV**, or from SQL Editor:

```sql
copy (select * from brushscore_kv) to stdout with csv header;
```

Ten seconds, and it means a bad deploy costs a rollback rather than your show's
registrations.

---

## Step 3 — Drop in the files

```
src/App.jsx                  (replace)
src/scoring.js               (replace)
BrushScore-User-Manual.docx  (replace)
CHANGES.md                   (replace)
DEPLOY.md                    (replace — this file)
```

`src/awards.js` and `src/qrcode.js` are **unchanged**. Do not replace them.

Do **not** touch: `package.json`, `vite.config.js`, `tailwind.config.js`,
`postcss.config.js`, `main.jsx`, `index.html`, `index.css`, `storageShim.js`,
`supabaseClient.js`, `supabase-setup.sql`, `.env`, or anything in
`src/assets/`. If your diff touches any of those, something copied wrong.

```bash
git status
```

Confirm exactly five modified files and nothing else.

---

## Step 4 — Install and build locally

```bash
npm install
npm run build
```

No new dependencies were added; the install just confirms your lockfile is
happy. The build must complete clean — it's the same command your host runs, so
a failure here is a failure there. If it fails, stop and report the error
rather than pushing.

---

## Step 5 — Run it and walk the checklist

```bash
npm run dev
```

Open `http://localhost:5173` and go in order.

### 5.1 Settings — teams and Chairman

Organizer → Settings → Edit show settings. Confirm:

- An **Awards Committee Chairman** field.
- A **Judging teams** section, with at least one team. Each team has a name, a
  size (3 or 2), a name box per judge seat, and a row of category buttons.
- The old "Judges per entry / Head judge" panel is **gone**. If it's still
  there, the file didn't copy.

Set up your real teams. Assign each its categories; anything you leave
unassigned is visible to all teams. Fill in judge names — that's what enables
the own-work check.

### 5.2 Register a test entry

Confirm the form has **separate Email and Phone boxes** (not one combined
field). Submit, and confirm:

- The QR renders instantly with no network request.
- **Print my tag** opens a preview with QR, title, category, notes box — and
  **no entrant name** on the tag.
- Back on the home page, a **Your entries** panel lists what you just
  registered, with a print button.

Register **three more entries under the same name in the same category** —
you'll need them for 5.4.

### 5.3 Registration Desk

Unlock with the staff PIN. Confirm the per-row print icon and batch select-and-
print still work. Search for your test entrant by the **email address** you
registered them with — it should match.

### 5.4 Judging — the important one

Unlock with the staff PIN.

1. Confirm a **team picker** (if you have more than one team) and a row of
   **Judge 1 / 2 / 3** seat buttons showing judge names.
2. Open a single-piece entry. Confirm **one row of 0–4 buttons**, not three
   numeric criterion fields. Confirm a "Judging criteria" expander listing the
   six criteria.
3. Open the four-piece group from 5.2. Confirm a **"Team decision needed"**
   notice and that the 0–4 buttons are **disabled**. Choose *Pick one as
   representative*, select a piece, and confirm the buttons enable.
4. Mark it 4 as Judge 1. Switch to Judge 2 — confirm you could not see Judge
   1's mark before entering your own. Mark 4, then 4 as Judge 3. Confirm
   **12/12 and a Gold Medal**.
5. Switch that group to **Award the whole collection** and confirm the marks
   **clear** — that's intended, not a bug.
6. Score another group 4 / 2 / 4 and confirm a **Judges disagree** flag.
7. If a judge's name in Settings matches the test entrant's name exactly,
   confirm that group locks for that seat with an **Own work** notice.

### 5.5 Organizer → Judging

Confirm the tab exists and lists your groups with marks and totals. Tick **Only
groups needing review** and confirm the flagged one appears. Open it, set a
Chairman ruling with a reason, and confirm the medal changes and is marked as a
ruling. Clear it again.

### 5.6 Organizer → Awards

Confirm the **Medal results** summary shows your groups, with collection awards
naming the exhibitor and listing pieces underneath, and representative awards
noting what they stood for.

Confirm all 27 special awards list, that Best Junior only offers Junior
entries, Best Historical Painters only Historical Painters, and that Capital
Palette accepts more than one recipient.

### 5.7 Organizer → Print

**Four** buttons now: registration sign, all tags, results & awards sheet,
judging rules. Open each.

On the **results & awards sheet**, confirm it's grouped by category, that
medals within a category run **Bronze → Silver → Gold**, and that your
collection award lists its pieces.

On the **judging rules sheet**, confirm it describes the 0–4 mark and the
correct band table, and says nothing about tiers, Merit, or a head judge.

### 5.8 Results

Publish and confirm medals render with the collection/representative
distinction intact.

Delete your test entries when done (Organizer → Entries → trash icon).

---

## Step 6 — Existing shows

**Categories.** Unchanged by this update. If your Ordnance subdivisions are
already present, nothing to do. If not, Organizer → Settings → **Restore any
missing default categories**.

**Teams.** A show configured before this update is migrated automatically to a
single team named "Team A", sized from your old `judgeCount`, covering every
category. If you want more than one team, or want judge names for the own-work
check, set that up in Settings — it isn't done for you.

**Head judge.** Whatever slot was marked head is simply dropped. There's nothing
to migrate; the Chairman replaces the role.

**Contact details.** Existing entries split automatically: a saved contact
containing `@` becomes the email, anything else the phone. Spot-check a few in
Organizer → Entries. Anything that lands in the wrong box can be fixed by
re-registering that entrant, and the original string is preserved in the data
either way.

---

## Step 7 — Commit

```bash
git add -A
git commit -m "Judging: Open system — teams, 0-4 marks, group awards, Chairman rulings"
git push -u origin open-judging
```

---

## Step 8 — Open a PR and check the preview

If your repo is connected to Vercel or Netlify, pushing triggers a preview
deployment — check the dashboard or the PR bot comment for the URL.

Run the Step 5 checklist again on the preview. It talks to the **same Supabase
project as production**, so use throwaway entries and delete them after. Don't
test against anything that matters.

---

## Step 9 — Merge and deploy

```bash
git checkout main
git merge open-judging
git push
```

No new environment variables, no dashboard changes. Watch the build go green.

---

## Step 10 — Final check on the real domain

One more pass on your actual URL: register a test entry, print its tag, score
it as a full team, set and clear a Chairman ruling, print the awards sheet,
then delete the entry. Same list as Step 5 — the point is running it against
real DNS and the real domain, which is what catches anything
environment-specific.

**Also do these two on real hardware**, because they can't be checked any other
way:

- **Scan a printed tag with the actual desk device.** Camera QR scanning needs
  https and camera permission, and it downloads its decoding library from a CDN
  at the moment you tap Scan — so it needs working internet, not just a working
  camera. If venue wifi is unreliable, know that check-in by name search still
  works fine.
- **Print one tag sheet and one awards sheet on the actual printer.** The
  layouts use fixed-inch print CSS; a preview is not proof.

---

## What to tell your judges and desk staff

PINs and links are unchanged.

**Judges** have the biggest change and should be briefed before show day:

- Pick your **team and seat** once at the start.
- You give **one number from 0 to 4** per piece or group — not three criterion
  scores. The six criteria inform that one number.
- Where an exhibitor has several pieces in a category, **the team decides
  together** whether to judge the best one as representative or award the whole
  collection.
- You do not judge your own work.
- Disagreements and ties go to the **Awards Committee Chairman**, whose
  decision is final. There is no head judge.

Print the judging rules sheet (Organizer → Print) and hand it out. Appendix C
of the user manual is the same content.

**Desk staff:** registration now asks for email and phone separately, and the
search box matches both.

---

## If a judge doesn't show up on show day

Organizer → Settings → that team → Judges → 2. Save. The two-judge bands take
over immediately for that team's groups. No redeploy.

Note it changes the maximum from 12 to 8, so don't switch a team mid-category
if you can avoid it — groups already scored by three judges keep their
three-judge totals, and you'd be comparing across two different scales within
one category.
