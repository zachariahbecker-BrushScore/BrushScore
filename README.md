# BrushScore

A standalone build of the model/hobby show manager — registration, check-in,
judging, organizer admin, and results — running on your own domain instead
of inside Claude.

Data lives in a small Supabase database rather than Claude's built-in
artifact storage. A shim exposes the same `window.storage` interface the app
expects (`get` / `set`), so the app code itself never had to care where the
data went.

Judging uses the **Open system** used at most U.S. figure exhibitions —
teams of judges, one 0–4 mark per piece or group, medals earned against a
standard rather than won in competition. See `CHANGES.md` for the full
description and `DEPLOY.md` for the deploy checklist.

## 1\. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Open **SQL Editor** and run the contents of `supabase-setup.sql` (in this
folder) once. That creates the one table the app needs.
3. Open **Settings → API** and copy your **Project URL** and **anon public
key**.

## 2\. Configure the app

```bash
cp .env.example .env
```

Paste your Project URL and anon key into `.env`.

## 3\. Run it locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. First load will walk you through naming
the show, setting a staff PIN, and setting categories — same as before.

## 4\. Deploy it

Push this folder to a GitHub repo, then connect it to
[Vercel](https://vercel.com) or [Netlify](https://netlify.com) (both have
free tiers and detect Vite automatically). In the host's project settings,
add the same two environment variables from your `.env` file
(`VITE\_SUPABASE\_URL`, `VITE\_SUPABASE\_ANON\_KEY`) — don't commit `.env`
itself. Then point your domain at the deployment from your host's domain
settings.

## QR codes

Every registered entry gets a QR code on its confirmation screen (encoding
just `BrushScore-ENTRY-<number>`, nothing personal). Registration Desk and
Judging both have a **Scan** button that opens the camera, decodes that
code, and jumps straight to the entry — check-in on the desk, or pulls it
up for scoring in Judging. Typing the number by hand still works everywhere
as a fallback.

Two things this needs once deployed:

* **HTTPS.** Camera access (`getUserMedia`) only works on secure origins.
Vercel/Netlify give you HTTPS by default, so this is automatic once
deployed — it just won't work over plain `http://`.
* **Camera permission.** The browser will prompt the first time; if it's
denied, the scanner shows a message and the manual entry field still
works.

QR codes are **generated locally** by `src/qrcode.js` — no network call, and
no model title or entrant name ever leaves the browser to render a code.

QR *decoding* is different: the scanner pulls `jsQR` from a CDN the moment
you tap Scan, so scanning needs working internet even though generating does
not. If venue wifi is unreliable, check-in by name search still works, and a
USB barcode scanner avoids the problem entirely.

## Notes / limitations carried over from the original

* The staff PIN (set during show setup) is a soft deterrent, not real
login security — anyone with your site's URL and dev tools could read the
underlying data. Fine for a club show; if that ever matters more, Supabase
has built-in auth you could wire in later.
* Data model is intentionally simple: three rows in the `brushscore_kv`
table — `brushscore:config` (show settings, teams, special awards),
`brushscore:entries` (the full entry list), and `brushscore:groups` (the
judging teams' decisions and marks). That's plenty for a single event; if
you want multiple shows running independently, give each its own set of
keys (e.g. prefix them per show) or its own project.
* Because each of those is one row holding one blob, every write replaces
the whole list. Writes re-read before modifying so two devices don't
overwrite each other, and retry once on failure — but if a write fails
twice you get an explicit "Not saved" message, and that change really
didn't land.
* No offline support — it needs a network connection to read/write.

