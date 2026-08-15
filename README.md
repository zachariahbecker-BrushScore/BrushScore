# BrushScore

A standalone build of the model/hobby show manager — registration, check-in,
judging, organizer admin, and results — running on your own domain instead
of inside Claude.

The app code (`src/App.jsx`) is unchanged from the original. The only thing
that's different is where the data lives: instead of Claude's built-in
artifact storage, it now talks to a small Supabase database via
`src/storageShim.js`, which mimics the same interface so nothing else had to
change.

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

The QR decoding library (`jsQR`) and the QR image generator
(`api.qrserver.com`) are both loaded from the browser at runtime rather than
bundled — no new npm dependency was needed.

## Notes / limitations carried over from the original

* The staff PIN (set during show setup) is a soft deterrent, not real
login security — anyone with your site's URL and dev tools could read the
underlying data. Fine for a club show; if that ever matters more, Supabase
has built-in auth you could wire in later.
* Data model is intentionally simple: one row for show config, one row for
the full entries list, both in the `brushscore_kv` table. That's plenty for
a single event; if you want multiple shows running independently, give
each its own set of keys (e.g. prefix them per show) or its own project.
* No offline support — it needs a network connection to read/write.

