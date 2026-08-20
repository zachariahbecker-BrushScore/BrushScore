import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  UserPlus, ClipboardCheck, ListChecks, Settings, Trophy, ArrowLeft,
  Search, Plus, Trash2, Check, Lock, Edit2, Save, Loader2, BarChart3, Users,
  QrCode as QrCodeIcon, X, Copy, Printer, ChevronDown, ChevronUp, Minus,
} from 'lucide-react';
import { encodeQR } from './qrcode';
import {
  CRITERIA, MEDALS, MARK_GUIDE, MAX_PER_JUDGE, MEDAL_BANDS, medalByKey,
  computeGroup, makeGroupKey, emptyGroup, isOwnWork, flagLabel, fmtPoints,
} from './scoring';
import {
  DEFAULT_CATEGORIES, DEFAULT_SHOW_THEME,
  SPECIAL_AWARDS, AWARD_GROUPS, eligibleEntries,
} from './awards';
import brushscoreLogo from './assets/brushscore-logo.webp';
import brushscoreIcon from './assets/brushscore-icon-transparent.webp';

/* ---------------------------------- data ---------------------------------- */

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function pad(n) { return String(n).padStart(3, '0'); }
function categoryName(config, id) { return config.categories.find((c) => c.id === id)?.name || '—'; }

/* ------------------------- remembered entries (device) -------------------------

   Registration takes no account and no password, so there is nothing to log
   back in to. Instead the device that submitted an entry remembers it, and
   the home page offers those entries back — enough to recover a lost tag on
   your own phone without putting entrant names behind a public search box
   that anyone could browse. Anyone on a different device asks the desk,
   which can already search by name, number, or model and reprint.

   Walk-ins are deliberately not remembered: they are submitted on the desk's
   device, not the registrant's, and the tag is printed on the spot. */
/* Browsers throw a SecurityError on any localStorage access — not just on
   write — when site data is blocked (Chrome's "block all cookies", Safari in
   some configurations, embedded webviews). That would take down whichever
   screen touched it, so every access goes through these and degrades to
   "remembers nothing" rather than a blank page. */
function lsGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage blocked or full */ }
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* nothing to do */ }
}

const MY_ENTRIES_KEY = 'brushscore:myEntries';

function readMyEntries() {
  try {
    const raw = lsGet(MY_ENTRIES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}
function rememberMyEntry(entry) {
  const list = readMyEntries().filter((x) => x.id !== entry.id);
  list.push({ id: entry.id, number: entry.number });
  lsSet(MY_ENTRIES_KEY, JSON.stringify(list));
}
function forgetMyEntries() {
  lsRemove(MY_ENTRIES_KEY);
}

async function safeGet(key, shared) {
  try {
    const res = await window.storage.get(key, shared);
    return res ? res.value : null;
  } catch (e) {
    return null;
  }
}

/* One-time normalization so entries and config saved by an earlier version
   of the app (single-award dropdown, category classes, no judgeCount) load
   without crashing. New fields fill in with sensible defaults; old fields
   that are no longer used are simply ignored from here on.

   Under the Open system a piece is no longer scored on its own — the unit of
   judging is the group (one exhibitor's entries in one category), and marks
   live in their own store. Per-entry `scores` and `headConfirm` written by
   the old rubric build are left on the record but never read; they carry no
   meaning under this system and nothing recomputes from them. */
/* Registration used to collect one free-text "email or phone" box. Entries
   saved under that build are split here: an @ means it was an email, and
   anything else is treated as a phone number. The original string is kept in
   `contact` untouched, so nothing is lost if a guess goes the wrong way. */
function splitLegacyContact(e) {
  if (e.email !== undefined || e.phone !== undefined) return {};
  const legacy = (e.contact || '').trim();
  if (!legacy) return {};
  return legacy.includes('@') ? { email: legacy } : { phone: legacy };
}

function normalizeEntry(e) {
  return {
    contact: '', email: '', phone: '', notes: '',
    checkedIn: false, checkedInAt: null,
    registeredAt: null,
    ...e,
    ...splitLegacyContact(e),
  };
}

/* --------------------------------- groups ---------------------------------

   Groups are derived from the entry list, never stored as records of their
   own: one group per exhibitor per category, keyed by normalized name +
   category id. An exhibitor with pieces in three categories therefore has
   three groups, each judged separately; an exhibitor cannot have two
   separate groups inside one category. Move an entry to another category in
   the Organizer Console and it simply joins that category's group.

   Only the team's decisions about a group — the scope, the representative
   piece, the marks, any Chairman ruling — are persisted, under the group
   key, in `brushscore:groups`.
--------------------------------------------------------------------------- */
function buildGroups(entries) {
  const map = new Map();
  entries.forEach((e) => {
    const key = makeGroupKey(e.name, e.categoryId);
    if (!map.has(key)) {
      map.set(key, { key, name: e.name, categoryId: e.categoryId, entries: [] });
    }
    map.get(key).entries.push(e);
  });
  return Array.from(map.values()).map((g) => ({
    ...g,
    entries: g.entries.sort((a, b) => a.number - b.number),
  })).sort((a, b) => a.entries[0].number - b.entries[0].number);
}

/* Which team judges a given category. Categories left unassigned are open to
   every team so nothing silently goes unjudged. */
function teamForCategory(config, categoryId) {
  const teams = config.teams || [];
  return teams.find((t) => (t.categoryIds || []).includes(categoryId)) || null;
}
function judgeCountForGroup(config, categoryId) {
  const t = teamForCategory(config, categoryId);
  return Number(t?.judgeCount) || Number(config.teams?.[0]?.judgeCount) || 3;
}

/* Free-text search used by both the Registration Desk and the Organizer's
   entries list. Email and phone are included so desk staff can find someone
   who only remembers the address they signed up with. */
function entryMatches(e, query) {
  const s = (query || '').trim().toLowerCase();
  if (!s) return true;
  return [e.name, e.modelName, e.email, e.phone, String(e.number)]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(s));
}

/* Which entries actually hold a medal, and how they came by it. The two
   selection decisions differ exactly here: under `representative` only the
   selected piece is medalled and the rest of the group stays unmedalled;
   under `collection` every piece in the group takes the same medal. A group
   of one behaves like a representative decision with the choice made for it. */
function buildAwards(entries, groupRecords, config) {
  const rows = buildGroups(entries).map((g) => {
    const result = computeGroup(groupRecords[g.key], judgeCountForGroup(config, g.categoryId), g.entries.map((e) => e.id));
    const rep = result.scope === 'representative'
      ? g.entries.find((e) => e.id === result.repEntryId) || null
      : null;
    const won = result.finalMedal && result.finalMedal.key !== 'none';
    const medalled = !won ? [] : result.scope === 'representative' ? (rep ? [rep] : []) : g.entries;
    return { group: g, result, rep, medalled };
  });
  const byEntry = new Map();
  rows.forEach((row) => row.medalled.forEach((e) => byEntry.set(e.id, row)));
  return { rows, byEntry };
}

/* How a group's award should be described wherever it is announced or
   printed — the distinction the awards list has to carry. */
function awardScopeNote(row) {
  const n = row.group.entries.length;
  if (n === 1) return '';
  if (row.result.scope === 'collection') return `Collection award — all ${n} pieces`;
  return `Representative of ${n} pieces`;
}
// Adds any DEFAULT_CATEGORIES name missing from an existing list. Pure and
// additive only — never renames, reorders, or removes anything already
// there. Shared by normalizeConfig (runs automatically on load) and the
// manual "Restore missing categories" action in Organizer → Settings, so
// there's exactly one place this logic lives.
function mergeDefaultCategories(categories) {
  const list = categories || [];
  const existingNames = new Set(list.map((cat) => cat.name));
  const missing = DEFAULT_CATEGORIES
    .filter((n) => !existingNames.has(n))
    .map((n) => ({ id: uid('cat'), name: n }));
  return { categories: missing.length ? [...list, ...missing] : list, added: missing.length };
}

/* A show saved by the rubric build has `judgeCount` and `headJudgeSlot` and
   no teams. The Open system has no head judge — disagreement goes to the
   Awards Committee Chairman, who stays outside the judging — so the old head
   slot is dropped rather than translated. The old judgeCount becomes the
   size of a single starter team covering every category, which is exactly
   how a one-team show behaves anyway. */
function migrateTeams(c) {
  if (Array.isArray(c.teams) && c.teams.length) {
    return c.teams.map((t, i) => ({
      id: t.id || uid('team'),
      name: t.name || `Team ${String.fromCharCode(65 + i)}`,
      judgeCount: Number(t.judgeCount) === 2 ? 2 : 3,
      judgeNames: Array.isArray(t.judgeNames) ? t.judgeNames : ['', '', ''],
      categoryIds: Array.isArray(t.categoryIds) ? t.categoryIds : [],
    }));
  }
  return [{
    id: uid('team'),
    name: 'Team A',
    judgeCount: Number(c.judgeCount) === 2 ? 2 : 3,
    judgeNames: ['', '', ''],
    categoryIds: [],
  }];
}

function normalizeConfig(c) {
  if (!c) return c;
  // A show configured before the default category list changed keeps
  // whatever it already had — DEFAULT_CATEGORIES only seeds a brand new
  // show, it never rewrites one that already exists. So if the list has
  // moved on since (the Ordnance subdivisions, say), an existing show
  // won't pick that up on its own; mergeDefaultCategories adds whichever
  // default names are missing instead of requiring a manual Settings edit.
  const { categories } = mergeDefaultCategories(c.categories);
  const teams = migrateTeams(c);
  const known = new Set(categories.map((cat) => cat.id));
  return {
    showTheme: DEFAULT_SHOW_THEME, specialAwards: {}, chairmanName: '',
    ...c,
    categories,
    // A category assigned to a team and later deleted would otherwise leave a
    // dangling id that quietly counts as "assigned" and hides the category
    // from every other team.
    teams: teams.map((t) => ({ ...t, categoryIds: (t.categoryIds || []).filter((id) => known.has(id)) })),
  };
}

/* ---------------------------------- QR codes ---------------------------------- */

const JSQR_SRC = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

function entryQrPayload(number) { return `BrushScore-ENTRY-${number}`; }
function parseEntryQr(text) {
  const m = /^BrushScore-ENTRY-(\d+)$/.exec((text || '').trim());
  return m ? parseInt(m[1], 10) : null;
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (window.jsQR) { resolve(); return; }
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('load-failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('load-failed'));
    document.head.appendChild(s);
  });
}

/* Renders a QR code as inline SVG — generated in the browser, no network
   call and nothing sent to a third party. Used for on-screen confirmation
   and for every printed tag. */
function QrCode({ value, size = 120, className = '' }) {
  const svg = useMemo(() => {
    try {
      const m = encodeQR(value);
      const q = 2;
      const n = m.size + q * 2;
      let path = '';
      for (let r = 0; r < m.size; r++) {
        for (let c = 0; c < m.size; c++) {
          if (m.modules[r][c]) path += `M${c + q} ${r + q}h1v1h-1z`;
        }
      }
      return { n, path };
    } catch (e) {
      return null;
    }
  }, [value]);
  if (!svg) return <div className={className} style={{ width: size, height: size, background: '#f1f5f9' }} />;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${svg.n} ${svg.n}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code"
      className={className}
    >
      <rect width={svg.n} height={svg.n} fill="#fff" />
      <path d={svg.path} fill="#000" />
    </svg>
  );
}

/* ------------------------------- little bits ------------------------------- */

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
      .sb-root { font-family: 'Inter', sans-serif; }
      .sb-display { font-family: 'Oswald', sans-serif; letter-spacing: 0.02em; text-transform: uppercase; }
      .sb-mono { font-family: 'JetBrains Mono', monospace; }
      .sb-blueprint-bg {
        background-image:
          linear-gradient(rgba(30, 64, 130, 0.07) 1px, transparent 1px),
          linear-gradient(90deg, rgba(30, 64, 130, 0.07) 1px, transparent 1px);
        background-size: 28px 28px;
      }
      .sb-input {
        width: 100%; border: 1px solid #cbd5e1; border-radius: 0.5rem;
        padding: 0.55rem 0.75rem; font-size: 0.9rem; background: #fff; color: #0f172a;
      }
      .sb-input:focus { outline: 2px solid #f59e0b; outline-offset: 1px; border-color: #f59e0b; }
      @media (prefers-reduced-motion: reduce) {
        * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
      }

      .print-only { display: none; }
      @media print {
        @page { size: letter portrait; margin: 0.45in; }
        body { background: #fff; }
        .no-print { display: none !important; }
        .print-only { display: block !important; }
        .tagsheet { page-break-after: always; }
        .tagsheet:last-child { page-break-after: auto; }
        .tag {
          border: 1.5pt solid #000; padding: 0.22in; height: 4.45in;
          display: grid; grid-template-rows: auto auto auto 1fr; gap: 0.1in;
          page-break-inside: avoid; break-inside: avoid; background: #fff; color: #000;
        }
        .tag + .tag { margin-top: 0.25in; }
        .tag-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.2in; }
        .tag-no { font-family: 'JetBrains Mono', monospace; font-size: 11pt; letter-spacing: .14em; text-transform: uppercase; }
        .tag-no b { display: block; font-family: 'Oswald', sans-serif; font-size: 28pt; line-height: .95; }
        .tag-qrcap { font-family: 'JetBrains Mono', monospace; font-size: 6.5pt; text-align: center; margin-top: 2pt; letter-spacing: .04em; }
        .tag-title { font-family: 'Oswald', sans-serif; font-size: 17pt; font-weight: 700; line-height: 1.05; border-top: 1pt solid #000; padding-top: 0.08in; }
        .tag-meta { font-family: 'JetBrains Mono', monospace; font-size: 9pt; letter-spacing: .05em; text-transform: uppercase; }
        .tag-meta span { margin-right: 0.2in; white-space: nowrap; }
        .tag-notes { border: 0.75pt solid #000; padding: 0.1in; min-height: 2.05in; }
        .tag-notes .lbl { font-family: 'JetBrains Mono', monospace; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 0.06in; }
        .tag-notes .body { font-size: 10.5pt; white-space: pre-wrap; line-height: 1.35; }
        .printdoc { color: #000; }
        .printdoc h1 { font-family: 'Oswald', sans-serif; font-size: 20pt; margin-bottom: 2pt; }
        .printdoc h2 { font-family: 'Oswald', sans-serif; font-size: 13pt; margin: 14pt 0 4pt; border-bottom: 1pt solid #000; padding-bottom: 2pt; }
        .printdoc p { font-size: 10pt; }
        .printdoc table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 4pt; }
        .printdoc th { text-align: left; border-bottom: 1pt solid #000; padding: 4pt 6pt; font-family: 'JetBrains Mono', monospace; font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; }
        .printdoc td { padding: 4pt 6pt; border-bottom: 0.5pt solid #ccc; vertical-align: top; }

        /* Awards sheet: category → medal → recipients. Each category block and
           each recipient line avoids splitting across a page break, so a name
           never ends up orphaned from the medal it won. */
        .printdoc h3 { font-family: 'Oswald', sans-serif; font-size: 12.5pt; margin: 12pt 0 2pt; }
        .printdoc .cat { page-break-inside: avoid; break-inside: avoid; margin-bottom: 6pt; }
        .printdoc .medalgroup { margin: 0 0 5pt; }
        .printdoc .medalhead {
          font-family: 'JetBrains Mono', monospace; font-size: 8pt; letter-spacing: .12em;
          text-transform: uppercase; border-bottom: 0.5pt solid #999; padding-bottom: 1pt;
          margin: 5pt 0 3pt;
        }
        .printdoc .awardline { margin-bottom: 3.5pt; page-break-inside: avoid; break-inside: avoid; }
        .printdoc .awardline .who { font-size: 10.5pt; }
        .printdoc .awardline .pts { font-family: 'JetBrains Mono', monospace; font-size: 8pt; color: #555; }
        .printdoc .awardline .scope { font-size: 8.5pt; font-style: italic; color: #444; padding-left: 10pt; }
        .printdoc .awardline .piece { font-size: 9.5pt; padding-left: 16pt; }

        /* full-page table sign: legible from a few feet away, meant to
           stand alone on an easel or lie flat on the registration table.
           Deliberately does NOT rely on a fixed height + flex centering to
           vertically center the content — that combination is inconsistent
           across print engines and risks silently overflowing onto a
           near-blank second page. Generous padding does the same visual
           job without that risk. */
        .regsign {
          color: #000; box-sizing: border-box;
          border: 3pt solid #000; padding: 0.85in 0.6in;
          text-align: center;
        }
        .regsign .eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 13pt; letter-spacing: .2em; text-transform: uppercase; color: #444; margin-bottom: 0.16in; }
        .regsign h1 { font-family: 'Oswald', sans-serif; font-size: 40pt; font-weight: 700; line-height: 1.08; margin: 0 0 0.4in; }
        .regsign .qrwrap { border: 2pt solid #000; padding: 0.18in; display: inline-block; margin-bottom: 0.3in; }
        .regsign .urltext { font-family: 'JetBrains Mono', monospace; font-size: 13pt; word-break: break-all; max-width: 5.6in; margin: 0 auto 0.5in; }
        .regsign ol { text-align: left; max-width: 5.2in; margin: 0 auto; font-size: 15pt; line-height: 1.55; padding-left: 0.3in; }
        .regsign ol li { margin-bottom: 0.16in; }
        .regsign .foot { font-family: 'JetBrains Mono', monospace; font-size: 10.5pt; letter-spacing: .1em; text-transform: uppercase; color: #444; margin-top: 0.5in; }
      }
    `}</style>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function EntryBadge({ number, size = 'md' }) {
  const sizes = { sm: 'w-9 h-9 text-xs', md: 'w-12 h-12 text-sm', lg: 'w-20 h-20 text-2xl' };
  return (
    <div className={`sb-mono ${sizes[size]} rounded-full bg-slate-900 text-amber-400 border-2 border-amber-500 flex items-center justify-center font-bold shrink-0`}>
      {pad(number)}
    </div>
  );
}

function EntryBadgeInline({ number }) {
  return <span className="sb-mono text-xs bg-slate-900 text-amber-400 px-1.5 py-0.5 rounded mr-1">#{pad(number)}</span>;
}

function Toast({ message, type }) {
  if (!message) return null;
  const color = type === 'error' ? 'bg-red-600' : 'bg-slate-900';
  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 ${color} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm z-50`}>
      {message}
    </div>
  );
}

function TopBar({ title, onBack }) {
  return (
    <div className="sticky top-0 z-40 bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
      <button onClick={onBack} className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm">
        <ArrowLeft size={16} /> Home
      </button>
      <h2 className="sb-display text-sm tracking-wide">{title}</h2>
      <img src={brushscoreIcon} alt="" className="w-9 h-auto shrink-0" />
    </div>
  );
}

function PinGate({ config, unlocked, onUnlock, children, label }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  if (unlocked) return children;
  const submit = (e) => {
    e.preventDefault();
    if (pin === (config?.adminPin || '')) onUnlock();
    else setErr('Incorrect PIN — ask your organizer.');
  };
  return (
    <div className="max-w-sm mx-auto mt-16 px-4">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4 text-slate-700">
          <Lock size={18} />
          <h2 className="sb-display text-lg">{label} Access</h2>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setErr(''); }}
            placeholder="Staff PIN"
            className="sb-input sb-mono tracking-widest text-center"
            autoFocus
          />
          {err && <p className="text-red-600 text-sm" role="alert">{err}</p>}
          <button className="w-full bg-slate-900 text-white rounded-lg py-2.5 font-semibold hover:bg-slate-800 transition">
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}

function QrScanner({ onDetect, onClose, title }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | scanning | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && window.jsQR) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          onDetect(code.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    async function start() {
      try {
        await loadScriptOnce(JSQR_SRC);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (!cancelled) { setStatus('scanning'); tick(); }
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(
            e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
              ? 'Camera access was blocked. Allow camera access, or enter the number manually.'
              : 'Could not start the camera on this device. Enter the number manually instead.'
          );
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.94)' }}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Scan QR code'}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-white font-semibold text-sm">{title || 'Scan entry QR code'}</p>
          <button onClick={onClose} aria-label="Close scanner" className="text-slate-300 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>
        <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '1 / 1' }}>
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          {status === 'scanning' && <div className="absolute inset-6 border-2 border-amber-400 rounded-lg pointer-events-none" />}
          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="animate-spin text-white" size={28} />
            </div>
          )}
        </div>
        {status === 'error' && <p className="text-red-300 text-sm mt-3 text-center">{errorMsg}</p>}
        <button onClick={onClose} className="w-full mt-4 text-slate-300 hover:text-white text-sm underline">
          Enter the number manually instead
        </button>
      </div>
    </div>
  );
}

/* -------------------------- medal + points display -------------------------- */

const MEDAL_STYLE = {
  gold: 'bg-amber-50 text-amber-700 border-amber-300',
  silver: 'bg-slate-100 text-slate-600 border-slate-300',
  bronze: 'bg-orange-50 text-orange-800 border-orange-300',
  none: 'bg-white text-slate-400 border-slate-200 border-dashed',
};
const MEDAL_COLOR = {
  gold: '#b45309', silver: '#64748b', bronze: '#9a3412', none: '#cbd5e1',
};

function MedalChip({ medal, size = 'md', provisional = false }) {
  if (!medal) return <span className="text-xs text-slate-400">Unjudged</span>;
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`font-semibold rounded-full border ${pad} ${MEDAL_STYLE[medal.key]} ${provisional ? 'opacity-60' : ''}`}>
      {medal.name}{provisional ? '?' : ''}
    </span>
  );
}

/* Points out of the panel maximum, with the medal bands marked. The bands
   move with panel size — 12 points across three judges, 8 across two — so
   the meter reads its notches off the band table rather than hard-coding
   them. */
function PointsMeter({ result }) {
  const b = { gold: null, silver: null, bronze: null };
  const bands = MEDAL_BANDS[result.expected] || MEDAL_BANDS[3];
  b.gold = bands.gold; b.silver = bands.silver; b.bronze = bands.bronze;
  const max = result.max;
  const pct = max ? (result.total / max) * 100 : 0;
  const color = MEDAL_COLOR[(result.finalMedal || result.provisionalMedal)?.key || 'none'];
  return (
    <div>
      <div className="relative h-6 rounded bg-slate-100 border border-slate-200 overflow-hidden">
        <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: color, opacity: 0.85 }} />
        {[b.bronze, b.silver, b.gold].map((n) => (
          <div key={n} className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${(n / max) * 100}%` }} />
        ))}
        <span className="absolute inset-0 flex items-center justify-end pr-2 sb-mono text-xs font-semibold text-slate-900">
          {result.total} / {max}
        </span>
      </div>
      <div className="flex justify-between sb-mono text-[9.5px] text-slate-400 mt-0.5">
        <span>0</span>
        <span>Bronze {b.bronze}</span>
        <span>Silver {b.silver}</span>
        <span>Gold {b.gold}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function FlagNote({ flag }) {
  const calm = flag.key === 'ruled';
  return (
    <div className={`text-xs rounded p-2 mt-2 ${calm ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-800'}`}>
      <strong>{flagLabel(flag.key)}</strong> — {flag.text}
    </div>
  );
}

/* --------------------------------- landing --------------------------------- */

function RoleCard({ icon: Icon, title, desc, onClick, accent }) {
  const ring = accent === 'amber' ? 'hover:border-amber-400' : 'hover:border-teal-500';
  const iconColor = accent === 'amber' ? 'text-amber-600 bg-amber-50' : 'text-teal-700 bg-teal-50';
  return (
    <button onClick={onClick} className={`text-left bg-white border border-slate-200 ${ring} rounded-xl p-5 shadow-sm hover:shadow-md transition flex items-start gap-4`}>
      <div className={`p-2.5 rounded-lg ${iconColor}`}><Icon size={20} /></div>
      <div>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

function MyEntriesPanel({ config, entries, onPrintTag }) {
  const [mine, setMine] = useState(readMyEntries);
  // Match on id, then fall back to the entry number — an entry deleted and
  // re-added by the desk keeps its number but not its id.
  const found = mine
    .map((m) => entries.find((e) => e.id === m.id) || entries.find((e) => e.number === m.number))
    .filter(Boolean);
  if (found.length === 0) return null;

  const clear = () => { forgetMyEntries(); setMine([]); };

  return (
    <div className="max-w-3xl mx-auto px-4 pb-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2 gap-2">
          <h3 className="font-semibold text-slate-900 text-sm">Your entries</h3>
          <button onClick={clear} className="text-xs text-slate-400 hover:text-slate-600 underline shrink-0">
            Not you? Clear
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Registered from this device. Lost your tag? Reprint it here, or ask at the registration desk.
        </p>
        <div className="space-y-2">
          {found.map((e) => (
            <div key={e.id} className="flex items-center gap-3 border border-slate-100 rounded-lg p-2.5">
              <EntryBadge number={e.number} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate text-sm">{e.modelName}</p>
                <p className="text-xs text-slate-500 truncate">
                  {categoryName(config, e.categoryId)}
                  {e.checkedIn ? <span className="text-teal-700 font-semibold"> · Checked in</span> : ''}
                </p>
              </div>
              <QrCode value={entryQrPayload(e.number)} size={40} className="shrink-0 rounded border border-slate-200" />
              <button onClick={() => onPrintTag(e)} aria-label={`Print tag for entry ${e.number}`} className="shrink-0 p-2 text-slate-400 hover:text-slate-700">
                <Printer size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Landing({ config, entries, onNav, onPrintTag }) {
  const total = entries.length;
  const checkedIn = entries.filter((e) => e.checkedIn).length;
  return (
    <div className="sb-blueprint-bg">
      <div className="max-w-3xl mx-auto px-4 py-14 text-center">
        <img src={brushscoreLogo} alt="BrushScore" className="mx-auto w-52 sm:w-60 mb-8 rounded-md shadow-sm" />
        <p className="sb-mono text-amber-600 text-xs tracking-widest mb-2">ENTRY №{pad(total + 1)} NEXT UP</p>
        <h1 className="sb-display text-4xl md:text-5xl text-slate-900 mb-2">{config.name}</h1>
        <p className="text-slate-600">{config.date}{config.location ? ` · ${config.location}` : ''}</p>
        <div className="flex justify-center gap-6 mt-6 text-sm text-slate-600">
          <span><strong className="text-slate-900">{total}</strong> entries</span>
          <span><strong className="text-slate-900">{checkedIn}</strong> checked in</span>
          <span className="capitalize"><strong className="text-slate-900">{config.status}</strong></span>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 pb-6 grid sm:grid-cols-2 gap-4">
        <RoleCard icon={UserPlus} title="Register an Entry" desc="Sign up your model for the show." onClick={() => onNav('register')} accent="amber" />
        <RoleCard icon={ClipboardCheck} title="Registration Desk" desc="Check in entries, add walk-ins, print tags." onClick={() => onNav('desk')} accent="teal" />
        <RoleCard icon={ListChecks} title="Judging" desc="Score entries with your team." onClick={() => onNav('judge')} accent="teal" />
        <RoleCard icon={Settings} title="Organizer Console" desc="Categories, awards, and results." onClick={() => onNav('organizer')} accent="teal" />
      </div>
      <MyEntriesPanel config={config} entries={entries} onPrintTag={onPrintTag} />
      {config.status === 'published' && (
        <div className="max-w-3xl mx-auto px-4 pb-16">
          <button onClick={() => onNav('results')} className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-xl py-3 transition">
            <Trophy size={18} /> View Awards &amp; Results
          </button>
        </div>
      )}
      {config.status !== 'published' && <div className="pb-10" />}
    </div>
  );
}

/* -------------------------------- setup wizard -------------------------------- */

function SetupWizard({ initial, onSave, onCancel, isEdit }) {
  const [name, setName] = useState(initial?.name || '');
  const [date, setDate] = useState(initial?.date || '');
  const [location, setLocation] = useState(initial?.location || '');
  const [adminPin, setAdminPin] = useState(initial?.adminPin || '');
  const [chairmanName, setChairmanName] = useState(initial?.chairmanName || '');
  const [teams, setTeams] = useState(() => (
    initial?.teams?.length
      ? initial.teams.map((t) => ({ ...t, judgeNames: [...(t.judgeNames || ['', '', ''])] }))
      : [{ id: uid('team'), name: 'Team A', judgeCount: 3, judgeNames: ['', '', ''], categoryIds: [] }]
  ));
  const [showTheme, setShowTheme] = useState(initial?.showTheme ?? DEFAULT_SHOW_THEME);
  const [categories, setCategories] = useState(
    initial?.categories?.length ? initial.categories : DEFAULT_CATEGORIES.map((n) => ({ id: uid('cat'), name: n }))
  );
  const [saving, setSaving] = useState(false);

  const updateCat = (idx, value) => setCategories((cs) => cs.map((c, i) => (i === idx ? { ...c, name: value } : c)));
  const addCat = () => setCategories((cs) => [...cs, { id: uid('cat'), name: '' }]);
  const removeCat = (idx) => setCategories((cs) => cs.filter((_, i) => i !== idx));

  const patchTeam = (id, patch) => setTeams((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const addTeam = () => setTeams((ts) => [...ts, {
    id: uid('team'),
    name: `Team ${String.fromCharCode(65 + ts.length)}`,
    judgeCount: 3, judgeNames: ['', '', ''], categoryIds: [],
  }]);
  const removeTeam = (id) => setTeams((ts) => (ts.length > 1 ? ts.filter((t) => t.id !== id) : ts));
  const setJudgeName = (id, idx, value) => setTeams((ts) => ts.map((t) => {
    if (t.id !== id) return t;
    const names = [...(t.judgeNames || ['', '', ''])];
    names[idx] = value;
    return { ...t, judgeNames: names };
  }));
  // A category belongs to at most one team. Ticking it for a second team
  // moves it rather than duplicating it, so no group is ever owned twice.
  const toggleTeamCategory = (id, catId) => setTeams((ts) => ts.map((t) => {
    const has = (t.categoryIds || []).includes(catId);
    if (t.id === id) {
      return { ...t, categoryIds: has ? t.categoryIds.filter((x) => x !== catId) : [...(t.categoryIds || []), catId] };
    }
    return has ? { ...t, categoryIds: t.categoryIds.filter((x) => x !== catId) } : t;
  }));

  const canSave = name.trim() && adminPin.trim().length >= 4 && categories.some((c) => c.name.trim());

  const submit = async () => {
    setSaving(true);
    await onSave({
      ...initial,
      name: name.trim(),
      date,
      location: location.trim(),
      adminPin: adminPin.trim(),
      chairmanName: chairmanName.trim(),
      teams: teams.map((t) => ({
        ...t,
        name: (t.name || '').trim() || 'Team',
        judgeCount: Number(t.judgeCount) === 2 ? 2 : 3,
        judgeNames: (t.judgeNames || []).map((n) => (n || '').trim()),
      })),
      showTheme: showTheme.trim(),
      categories: categories.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim() })),
      status: initial?.status || 'open',
      nextEntryNumber: initial?.nextEntryNumber || 1,
      specialAwards: initial?.specialAwards || {},
    });
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h2 className="sb-display text-2xl mb-1">{isEdit ? 'Show Settings' : 'Set Up Your Show'}</h2>
      <p className="text-slate-500 text-sm mb-6">
        {isEdit ? 'Update your show details, judging panel, and categories.' : "Let's get your categories and judging panel set before entries open."}
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Field label="Show name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="sb-input" placeholder="Scale Modelers Show" />
        </Field>
        <Field label="Date">
          <input value={date} onChange={(e) => setDate(e.target.value)} className="sb-input" placeholder="Sept 12, 2026" />
        </Field>
        <Field label="Location">
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="sb-input" placeholder="Community Center Hall B" />
        </Field>
        <Field label="Staff PIN (shared with judges & desk staff)">
          <input value={adminPin} onChange={(e) => setAdminPin(e.target.value)} className="sb-input sb-mono" placeholder="1234" />
        </Field>
      </div>

      <div className="border border-slate-200 rounded-lg p-4 bg-white mb-6">
        <h3 className="font-semibold text-slate-800 mb-1 text-sm">Awards Committee Chairman</h3>
        <p className="text-xs text-slate-500 mb-3">
          Supervises the judging and has the final say on any disagreement or tie. He stays outside the judging
          teams — that detachment is what qualifies him to arbitrate, so he never scores as a judge.
        </p>
        <Field label="Chairman's name">
          <input value={chairmanName} onChange={(e) => setChairmanName(e.target.value)} className="sb-input" placeholder="Optional — recorded against any ruling" />
        </Field>
      </div>

      <div className="border border-slate-200 rounded-lg p-4 bg-white mb-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-800 text-sm">Judging teams</h3>
          <button onClick={addTeam} className="text-sm flex items-center gap-1 text-teal-700 hover:text-teal-800 font-medium">
            <Plus size={15} /> Add team
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          A team is normally three judges; two is supported as a reduced panel and shifts the medal bands
          accordingly. Give each judge a name and the app can stop them scoring their own work. Assign each team
          the categories it covers — a category left unassigned is open to every team.
        </p>
        <div className="space-y-4">
          {teams.map((t) => (
            <div key={t.id} className="border border-slate-200 rounded-lg p-3">
              <div className="flex gap-2 items-end mb-3">
                <div className="flex-1">
                  <Field label="Team name">
                    <input className="sb-input" value={t.name} onChange={(e) => patchTeam(t.id, { name: e.target.value })} />
                  </Field>
                </div>
                <div className="w-32">
                  <Field label="Judges">
                    <select className="sb-input" value={t.judgeCount} onChange={(e) => patchTeam(t.id, { judgeCount: Number(e.target.value) })}>
                      <option value={3}>3 — standard</option>
                      <option value={2}>2 — reduced</option>
                    </select>
                  </Field>
                </div>
                {teams.length > 1 && (
                  <button onClick={() => removeTeam(t.id)} aria-label="Remove team" className="p-2 mb-1 text-slate-400 hover:text-red-600 shrink-0">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <p className="text-xs font-medium text-slate-500 mb-1">Judges on this team</p>
              <div className="grid sm:grid-cols-3 gap-2 mb-3">
                {Array.from({ length: Number(t.judgeCount) }, (_, i) => i).map((i) => (
                  <input
                    key={i}
                    className="sb-input"
                    placeholder={`Judge ${i + 1} name`}
                    value={(t.judgeNames || [])[i] || ''}
                    onChange={(e) => setJudgeName(t.id, i, e.target.value)}
                  />
                ))}
              </div>
              <p className="text-xs font-medium text-slate-500 mb-1">
                Categories ({(t.categoryIds || []).length || 'none — open to all teams'})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {categories.filter((c) => c.name.trim()).map((c) => {
                  const on = (t.categoryIds || []).includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleTeamCategory(t.id, c.id)}
                      className={`text-xs px-2 py-1 rounded border ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Field label="Show theme (used for the Show Theme Award)">
        <textarea className="sb-input" rows={2} value={showTheme} onChange={(e) => setShowTheme(e.target.value)} />
      </Field>

      <div className="flex items-center justify-between mb-3 mt-6">
        <h3 className="font-semibold text-slate-800">Categories</h3>
        <button onClick={addCat} className="text-sm flex items-center gap-1 text-teal-700 hover:text-teal-800 font-medium">
          <Plus size={15} /> Add category
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Painters, Open, and Junior are separate category names here ("Historical Painters" vs "Historical Open") rather
        than a division picked alongside the category — keep these names matching{' '}
        <code className="sb-mono text-slate-600">src/awards.js</code> if you rename one, or its award loses its
        eligible entries.
      </p>
      <div className="space-y-2 mb-6">
        {categories.map((c, idx) => (
          <div key={c.id} className="flex gap-2 items-center">
            <input value={c.name} onChange={(e) => updateCat(idx, e.target.value)} className="sb-input flex-1" placeholder="Category name" />
            <button onClick={() => removeCat(idx)} aria-label="Remove category" className="p-2 text-slate-400 hover:text-red-600 shrink-0">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <button onClick={onCancel} className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium">
            Cancel
          </button>
        )}
        <button disabled={!canSave || saving} onClick={submit} className="flex-1 bg-slate-900 disabled:opacity-40 text-white rounded-lg py-2.5 font-semibold flex items-center justify-center gap-2">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isEdit ? 'Save changes' : 'Open registration'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------- register / desk ------------------------------- */

function RegisterView({ config, onSubmit, onPrintTag, remember = true }) {
  const firstCat = config.categories[0];
  const [form, setForm] = useState({
    name: '', email: '', phone: '', modelName: '',
    categoryId: firstCat?.id || '', notes: '',
  });
  const [confirmed, setConfirmed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const canSubmit = form.name.trim() && form.modelName.trim() && form.categoryId;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setErr('');
    try {
      const entry = await onSubmit(form);
      if (remember) rememberMyEntry(entry);
      setConfirmed(entry);
    } catch (e2) {
      setErr('Could not save your entry — please try again.');
    }
    setSaving(false);
  };

  if (confirmed) {
    return (
      <div className="max-w-md mx-auto px-4 py-14 text-center">
        <div className="flex justify-center"><EntryBadge number={confirmed.number} size="lg" /></div>
        <h2 className="sb-display text-2xl mt-5 mb-1">You're entered!</h2>
        <p className="text-slate-600 mb-1">{confirmed.modelName}</p>
        <p className="text-slate-400 text-sm mb-5">
          Remember entry #{pad(confirmed.number)} — or show the code below at check-in and judging.
        </p>
        <div className="flex justify-center mb-4">
          <QrCode value={entryQrPayload(confirmed.number)} size={160} className="rounded-lg border border-slate-200" />
        </div>
        {onPrintTag && (
          <button onClick={() => onPrintTag(confirmed)} className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white rounded-lg py-2.5 font-semibold mb-3">
            <Printer size={16} /> Print my tag
          </button>
        )}
        <p className="text-slate-400 text-xs mb-2">Or ask staff to print it for you and set it beside your model.</p>
        {remember && (
          <p className="text-slate-400 text-xs mb-6">
            This device will remember your entries — find them again under “Your entries” on the home page. On a
            different device, the registration desk can look you up and reprint.
          </p>
        )}
        <button onClick={() => setConfirmed(null)} className="text-teal-700 font-medium text-sm">
          Register another entry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-md mx-auto px-4 py-8 space-y-4">
      <h2 className="sb-display text-2xl mb-1">Register an Entry</h2>
      <p className="text-slate-500 text-sm mb-4">Takes about a minute. You can register more than one model.</p>
      <Field label="Your name">
        <input className="sb-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Email">
          <input
            className="sb-input"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Phone">
          <input
            className="sb-input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="(555) 555-5555"
          />
        </Field>
      </div>
      <p className="text-xs text-slate-400 -mt-2">
        Both optional — used only if the show needs to reach you about an award.
      </p>
      <Field label="Model / subject name">
        <input className="sb-input" value={form.modelName} onChange={(e) => setForm((f) => ({ ...f, modelName: e.target.value }))} placeholder="e.g. Sherman M4A3" required />
      </Field>
      <Field label="Category">
        <select className="sb-input" value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
          {config.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Notes — techniques, conversions, the subject">
        <textarea className="sb-input" rows={4} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Anything the judges should know (optional, but they do read it)" />
      </Field>
      {err && <p className="text-red-600 text-sm" role="alert">{err}</p>}
      <button disabled={!canSubmit || saving} className="w-full bg-amber-500 disabled:opacity-40 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2">
        {saving ? <Loader2 size={16} className="animate-spin" /> : null} Submit entry
      </button>
    </form>
  );
}

function DeskView({ config, entries, onCheckIn, onWalkIn, onPrintTags, notify }) {
  const [q, setQ] = useState('');
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const filtered = entries
    .filter((e) => {
      return entryMatches(e, q);
    })
    .sort((a, b) => a.number - b.number);

  const toggleSel = (id) => setSelected((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const handleScan = (text) => {
    setScanning(false);
    const number = parseEntryQr(text);
    if (number == null) { notify("That code isn't a BrushScore entry.", 'error'); return; }
    const found = entries.find((e) => e.number === number);
    if (!found) { notify(`No entry found for #${number}.`, 'error'); return; }
    onCheckIn(found.id, true);
  };

  if (showWalkIn) {
    return (
      <div>
        <div className="max-w-md mx-auto px-4 pt-4">
          <button onClick={() => setShowWalkIn(false)} className="text-sm text-slate-500 flex items-center gap-1 mb-2">
            <ArrowLeft size={14} /> Back to desk
          </button>
        </div>
        <RegisterView config={config} onSubmit={(form) => onWalkIn(form)} onPrintTag={(entry) => onPrintTags([entry])} remember={false} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="sb-display text-2xl">Registration Desk</h2>
        <div className="flex gap-2">
          <button onClick={() => setScanning(true)} className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3 py-2 rounded-lg">
            <QrCodeIcon size={15} /> Scan
          </button>
          <button onClick={() => setShowWalkIn(true)} className="flex items-center gap-1.5 bg-slate-900 text-white text-sm font-medium px-3 py-2 rounded-lg">
            <Plus size={15} /> Walk-in
          </button>
        </div>
      </div>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="sb-input pl-9" placeholder="Search name, entry #, or model" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-3 text-xs">
          <button onClick={() => setSelected(new Set(filtered.map((e) => e.id)))} className="text-teal-700 font-medium">Select all</button>
          <button onClick={() => setSelected(new Set())} className="text-slate-400 font-medium">Clear</button>
        </div>
        <button
          disabled={selected.size === 0}
          onClick={() => onPrintTags(entries.filter((e) => selected.has(e.id)))}
          className="flex items-center gap-1.5 text-xs font-semibold bg-slate-900 disabled:opacity-30 text-white px-3 py-1.5 rounded-lg"
        >
          <Printer size={13} /> Print {selected.size || ''} tag{selected.size === 1 ? '' : 's'}
        </button>
      </div>
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-slate-400 text-sm text-center py-10">No entries found.</p>}
        {filtered.map((e) => (
          <div key={e.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3">
            <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSel(e.id)} aria-label={`Select entry ${e.number}`} className="shrink-0 w-4 h-4" />
            <EntryBadge number={e.number} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 truncate">{e.modelName}</p>
              <p className="text-xs text-slate-500 truncate">{e.name} · {categoryName(config, e.categoryId)}</p>
            </div>
            <button onClick={() => onPrintTags([e])} aria-label="Print tag" className="shrink-0 p-2 text-slate-400 hover:text-slate-700">
              <Printer size={15} />
            </button>
            <button
              onClick={() => onCheckIn(e.id, !e.checkedIn)}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1 ${e.checkedIn ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'}`}
            >
              {e.checkedIn ? <><Check size={13} /> Checked in</> : 'Check in'}
            </button>
          </div>
        ))}
      </div>
      {scanning && <QrScanner title="Scan entry to check in" onDetect={handleScan} onClose={() => setScanning(false)} />}
    </div>
  );
}

/* ---------------------------------- judging ---------------------------------- */

function JudgeSeatPicker({ config, teamId, seat, onChange }) {
  const teams = config.teams || [];
  const team = teams.find((t) => t.id === teamId) || teams[0];
  const seats = Array.from({ length: Number(team?.judgeCount) || 3 }, (_, i) => i + 1);
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-2 mb-4 space-y-2">
      {teams.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 pl-1 shrink-0">My team</span>
          <select className="sb-input flex-1" value={team?.id || ''} onChange={(e) => onChange(e.target.value, 1)}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 pl-1 shrink-0">I am</span>
        {seats.map((s) => {
          const nm = (team?.judgeNames || [])[s - 1];
          return (
            <button
              key={s}
              onClick={() => onChange(team.id, s)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold ${seat === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Judge {s}{nm ? ` · ${nm}` : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* One mark, 0–4, for the whole piece or group. The six criteria are what the
   judge weighs to arrive at this number — they are not scored separately. */
function MarkInput({ value, onChange, disabled }) {
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2, 3, 4].map((v) => {
        const guide = MARK_GUIDE.find((m) => m.value === v);
        const on = value === v;
        return (
          <button
            key={v}
            disabled={disabled}
            onClick={() => onChange(on ? null : v)}
            aria-pressed={on}
            className={`flex-1 rounded-lg border px-1 py-2 text-center disabled:opacity-40 disabled:cursor-not-allowed ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300 hover:border-slate-400'}`}
          >
            <span className="sb-display block text-lg leading-none">{v}</span>
            <span className={`block text-[10px] mt-0.5 ${on ? 'text-slate-300' : 'text-slate-500'}`}>{guide.short}</span>
          </button>
        );
      })}
    </div>
  );
}

function CriteriaReminder() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((o) => !o)} className="text-xs text-teal-700 font-medium flex items-center gap-1">
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Judging criteria
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1">
          {CRITERIA.map((c) => (
            <li key={c.key} className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{c.name}</span> — {c.hint}
            </li>
          ))}
          <li className="text-xs text-slate-400 italic pt-1">
            In no particular order of importance or consideration. They inform one mark; they are not scored separately.
          </li>
        </ul>
      )}
    </div>
  );
}

/* The team's selection decision for a multi-piece group. Taken together by
   the team, not by any one judge — whoever records it is recording the
   panel's call, which is why there is no head-judge gate on these buttons. */
function ScopeChooser({ group, result, onSetScope }) {
  const [picking, setPicking] = useState(false);
  const count = group.entries.length;

  if (result.scope === 'collection') {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded p-2 mt-2 text-xs text-teal-900">
        <strong>Whole collection judged.</strong> All {count} pieces take the same medal.
        <button onClick={() => onSetScope(group.key, null, null)} className="ml-2 underline text-teal-700">Change</button>
      </div>
    );
  }
  if (result.scope === 'representative' && result.repEntryId) {
    const rep = group.entries.find((e) => e.id === result.repEntryId);
    return (
      <div className="bg-teal-50 border border-teal-200 rounded p-2 mt-2 text-xs text-teal-900">
        <strong>Representative piece:</strong> #{pad(rep?.number)} {rep?.modelName}. Judged as the best of {count};
        only this piece takes the medal.
        <button onClick={() => onSetScope(group.key, null, null)} className="ml-2 underline text-teal-700">Change</button>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded p-2.5 mt-2">
      <p className="text-xs text-amber-900 font-semibold mb-1">Team decision needed</p>
      <p className="text-xs text-amber-900 mb-2">
        This exhibitor has {count} pieces in this category. Decide together: judge the single best piece as
        representative of the group, or judge the whole collection as one and award them all the same medal.
      </p>
      {!picking ? (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setPicking(true)} className="text-xs font-semibold bg-slate-900 text-white rounded px-2.5 py-1.5">
            Pick one as representative
          </button>
          <button onClick={() => onSetScope(group.key, 'collection', null)} className="text-xs font-semibold bg-white border border-slate-300 text-slate-700 rounded px-2.5 py-1.5">
            Award the whole collection
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {group.entries.map((e) => (
            <button
              key={e.id}
              onClick={() => { onSetScope(group.key, 'representative', e.id); setPicking(false); }}
              className="w-full text-left text-xs bg-white border border-slate-300 hover:border-slate-500 rounded px-2 py-1.5"
            >
              <EntryBadgeInline number={e.number} /> {e.modelName}
            </button>
          ))}
          <button onClick={() => setPicking(false)} className="text-xs text-slate-500 underline">Cancel</button>
        </div>
      )}
    </div>
  );
}

function GroupCard({ group, config, record, teamId, seat, judgeName, onSetScope, onSetMark, categoryLabel, forceOpen }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);

  const judgeCount = judgeCountForGroup(config, group.categoryId);
  const result = computeGroup(record, judgeCount, group.entries.map((e) => e.id));
  const conflict = isOwnWork(judgeName, group.name);
  const myMark = record?.marks?.[seat];
  const myDone = myMark !== undefined && myMark !== null;
  const revealOthers = myDone || conflict;
  const anyNotCheckedIn = group.entries.some((e) => !e.checkedIn);

  const needsReview = result.flags.some((f) => ['unselected', 'spread'].includes(f.key));
  const headline = result.scope === 'collection'
    ? `Collection — ${group.entries.length} pieces`
    : result.scope === 'representative' && result.repEntryId
      ? group.entries.find((e) => e.id === result.repEntryId)?.modelName || group.entries[0].modelName
      : group.entries.length > 1
        ? `${group.entries.length} pieces — not yet selected`
        : group.entries[0].modelName;

  return (
    <div className={`bg-white border rounded-lg overflow-hidden ${needsReview ? 'border-amber-300' : 'border-slate-200'} ${forceOpen ? 'ring-2 ring-amber-200' : ''}`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 p-3 text-left">
        <EntryBadge number={group.entries[0].number} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 truncate">{headline}</p>
          <p className="text-xs text-slate-500 truncate">
            {group.name} · {categoryLabel}
            {anyNotCheckedIn && <span className="text-red-500 font-semibold uppercase ml-1">· Not all in</span>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <MedalChip medal={result.finalMedal} size="sm" />
          <p className="sb-mono text-[10px] text-slate-400 mt-0.5">
            {result.n}/{result.expected} in{myDone ? ' · yours in' : ''}
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-slate-100">
          <div className="mt-2 space-y-1.5">
            {group.entries.map((e) => {
              const isRep = result.scope === 'representative' && result.repEntryId === e.id;
              const dimmed = result.scope === 'representative' && result.repEntryId && !isRep;
              return (
                <div key={e.id} className={`text-xs rounded p-2 ${dimmed ? 'bg-slate-50 text-slate-400' : 'bg-slate-50'}`}>
                  <p className="font-medium">
                    <EntryBadgeInline number={e.number} />
                    {e.modelName}
                    {isRep && <span className="ml-1 text-teal-700 font-semibold uppercase text-[10px]">· Representative</span>}
                  </p>
                  {e.notes && !dimmed && <p className="whitespace-pre-wrap mt-1 text-slate-600">{e.notes}</p>}
                </div>
              );
            })}
          </div>

          {result.needsScope && <ScopeChooser group={group} result={result} onSetScope={onSetScope} />}

          {result.scopeSet && (
            <div className="mt-3">
              <PointsMeter result={result} />
            </div>
          )}
          {result.flags.map((f) => <FlagNote key={f.key} flag={f} />)}

          {conflict ? (
            <div className="text-xs rounded p-2 mt-3 bg-red-50 text-red-800">
              <strong>{flagLabel('conflict')}</strong> — this is your own work. Judges do not judge their own
              entries; another judge on the team scores this one.
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-500 mb-1.5">
                Your mark — Judge {seat}{' '}
                <span className="font-normal text-slate-400">(one number, 0–{MAX_PER_JUDGE}, for the whole {result.scope === 'collection' ? 'collection' : 'piece'})</span>
              </p>
              <MarkInput
                value={myMark ?? null}
                disabled={!result.scopeSet}
                onChange={(v) => onSetMark(group.key, seat, v, teamId)}
              />
              {!result.scopeSet && (
                <p className="text-xs text-slate-400 mt-1.5">Make the selection decision above before scoring.</p>
              )}
              <CriteriaReminder />
            </div>
          )}

          {revealOthers && result.marks.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 mb-1">All judges</p>
              {result.marks.map((m) => (
                <p key={m.slot} className="text-xs text-slate-600 sb-mono">Judge {m.slot}: {m.value}</p>
              ))}
              <p className="text-xs text-slate-500 sb-mono mt-1">Total: {fmtPoints(result.total, result.max)}</p>
            </div>
          )}
          {!revealOthers && result.n > 0 && (
            <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
              Other judges' marks stay hidden on this device until yours are in.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function JudgeView({ config, entries, groupRecords, onSetScope, onSetMark, notify }) {
  const teams = config.teams || [];
  const [teamId, setTeamId] = useState(() => {
    const saved = lsGet('brushscore:teamId');
    return teams.some((t) => t.id === saved) ? saved : teams[0]?.id;
  });
  const [seat, setSeat] = useState(() => {
    const saved = Number(lsGet('brushscore:judgeSeat'));
    return saved >= 1 && saved <= 3 ? saved : 1;
  });

  const team = teams.find((t) => t.id === teamId) || teams[0];

  useEffect(() => {
    // A team removed or shrunk in Settings must not leave this device
    // pointing at a seat that no longer exists.
    if (!teams.some((t) => t.id === teamId) && teams[0]) setTeamId(teams[0].id);
    else if (team && seat > Number(team.judgeCount)) setSeat(1);
    lsSet('brushscore:teamId', String(teamId || ''));
    lsSet('brushscore:judgeSeat', String(seat));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, seat, teams.length, team?.judgeCount]);

  const judgeName = (team?.judgeNames || [])[seat - 1] || '';

  const [categoryId, setCategoryId] = useState('all');
  const [jump, setJump] = useState('');
  const [highlight, setHighlight] = useState(null);
  const [scanning, setScanning] = useState(false);

  // Only the categories this team covers. A category assigned to no team is
  // open to every team rather than invisible to all of them.
  const myCategories = config.categories.filter((c) => {
    const owner = teamForCategory(config, c.id);
    return !owner || owner.id === team?.id;
  });
  const myCatIds = new Set(myCategories.map((c) => c.id));

  const groups = buildGroups(entries)
    .filter((g) => myCatIds.has(g.categoryId))
    .filter((g) => categoryId === 'all' || g.categoryId === categoryId);

  const done = groups.filter((g) => {
    const r = computeGroup(groupRecords[g.key], judgeCountForGroup(config, g.categoryId), g.entries.map((e) => e.id));
    return r.complete && r.scopeSet;
  }).length;

  const jumpToGroup = (g) => {
    if (!g) return;
    setCategoryId(g.categoryId);
    setHighlight(g.key);
    setTimeout(() => setHighlight(null), 2500);
  };

  const findGroupByNumber = (number) => {
    const entry = entries.find((e) => e.number === number);
    if (!entry) return null;
    return buildGroups(entries).find((g) => g.entries.some((e) => e.id === entry.id)) || null;
  };

  const doJump = (e) => {
    e.preventDefault();
    const g = findGroupByNumber(Number(jump.trim()));
    if (g && myCatIds.has(g.categoryId)) jumpToGroup(g);
    else if (g) notify('That entry belongs to another team\u2019s category.', 'error');
    setJump('');
  };

  const handleScan = (text) => {
    setScanning(false);
    const number = parseEntryQr(text);
    if (number == null) { notify("That code isn't a BrushScore entry.", 'error'); return; }
    const g = findGroupByNumber(number);
    if (!g) { notify(`No entry found for #${number}.`, 'error'); return; }
    if (!myCatIds.has(g.categoryId)) { notify('That entry belongs to another team\u2019s category.', 'error'); return; }
    jumpToGroup(g);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h2 className="sb-display text-2xl mb-1">Judging</h2>
      <p className="text-slate-500 text-sm mb-3">
        {done} of {groups.length} fully marked in this view
      </p>

      <JudgeSeatPicker
        config={config}
        teamId={team?.id}
        seat={seat}
        onChange={(tid, s) => { setTeamId(tid); setSeat(s); }}
      />

      <div className="flex gap-2 mb-4">
        <select className="sb-input flex-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="all">All my categories</option>
          {myCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <form onSubmit={doJump} className="flex gap-1">
          <input className="sb-input sb-mono w-20" placeholder="Entry #" value={jump} onChange={(e) => setJump(e.target.value)} />
          <button className="bg-slate-900 text-white rounded-lg px-3 text-sm font-medium">Go</button>
        </form>
        <button type="button" onClick={() => setScanning(true)} aria-label="Scan entry QR code" className="flex items-center justify-center bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-3">
          <QrCodeIcon size={16} />
        </button>
      </div>

      <div className="space-y-2">
        {groups.length === 0 && <p className="text-slate-400 text-sm text-center py-10">Nothing to judge in this view yet.</p>}
        {groups.map((g) => (
          <GroupCard
            key={g.key}
            group={g}
            config={config}
            record={groupRecords[g.key]}
            teamId={team?.id}
            seat={seat}
            judgeName={judgeName}
            onSetScope={onSetScope}
            onSetMark={onSetMark}
            categoryLabel={categoryName(config, g.categoryId)}
            forceOpen={highlight === g.key}
          />
        ))}
      </div>
      {scanning && <QrScanner title="Scan entry to judge" onDetect={handleScan} onClose={() => setScanning(false)} />}
    </div>
  );
}

/* -------------------------------- organizer -------------------------------- */

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
      <p className="sb-display text-3xl text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}

function CopyLinkRow({ label, view }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${window.location.pathname}?view=${view}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard API unavailable — the URL is still visible to copy manually
    }
  };
  return (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2">
      <QrCode value={url} size={44} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="sb-mono text-xs text-slate-800 truncate">{url}</p>
      </div>
      <button onClick={copy} className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 px-2.5 py-1.5 rounded-md border border-teal-200 hover:bg-teal-50">
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function OverviewTab({ config, entries, groupRecords, onPublishToggle }) {
  const total = entries.length;
  const checkedIn = entries.filter((e) => e.checkedIn).length;
  const { rows } = buildAwards(entries, groupRecords, config);
  const judged = rows.filter((r) => r.result.complete && r.result.scopeSet).length;
  const needsReview = rows.filter((r) => r.result.flags.some((f) => ['unselected', 'spread'].includes(f.key))).length;
  const byCategory = config.categories.map((c) => ({ ...c, count: entries.filter((e) => e.categoryId === c.id).length }));
  const maxCount = Math.max(1, ...byCategory.map((c) => c.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Entries" value={total} />
        <StatCard label="Checked in" value={checkedIn} />
        <StatCard label={`Groups judged (of ${rows.length})`} value={judged} />
        <StatCard label="Chairman review" value={needsReview} />
      </div>
      <div>
        <h3 className="font-semibold text-slate-800 mb-2 text-sm">Entries by category</h3>
        <div className="space-y-1.5">
          {byCategory.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span className="w-40 truncate text-slate-600">{c.name}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-teal-500 h-full" style={{ width: `${(c.count / maxCount) * 100}%` }} />
              </div>
              <span className="w-6 text-right text-slate-500 sb-mono text-xs">{c.count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-200 pt-5">
        <h3 className="font-semibold text-slate-800 mb-1 text-sm">Shareable links</h3>
        <p className="text-xs text-slate-500 mb-3">
          Send registrants straight to the registration form, and judges straight to Judging — scan the code or copy the link.
        </p>
        <div className="space-y-2">
          <CopyLinkRow label="Registration link" view="register" />
          <CopyLinkRow label="Judging link" view="judge" />
        </div>
      </div>
      <div className="border-t border-slate-200 pt-5">
        <h3 className="font-semibold text-slate-800 mb-1 text-sm">Results</h3>
        <p className="text-xs text-slate-500 mb-3">
          {config.status === 'published' ? 'Results are live on the public Results page.' : 'Publish once judging is complete to reveal awards to everyone.'}
        </p>
        <button
          onClick={onPublishToggle}
          className={`text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 ${config.status === 'published' ? 'bg-slate-100 text-slate-600 border border-slate-300' : 'bg-amber-500 hover:bg-amber-400 text-slate-900'}`}
        >
          <Trophy size={15} /> {config.status === 'published' ? 'Unpublish results' : 'Publish results'}
        </button>
      </div>
    </div>
  );
}

function EntriesTab({ config, entries, groupRecords, onUpdateEntry, onDeleteEntry }) {
  const [q, setQ] = useState('');
  const { byEntry } = buildAwards(entries, groupRecords, config);
  const filtered = entries
    .filter((e) => {
      return entryMatches(e, q);
    })
    .sort((a, b) => a.number - b.number);

  return (
    <div>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="sb-input pl-9" placeholder="Search entries" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="space-y-2">
        {filtered.map((e) => {
          const row = byEntry.get(e.id);
          const note = row ? awardScopeNote(row) : '';
          return (
            <div key={e.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3 flex-wrap">
              <EntryBadge number={e.number} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">{e.modelName}</p>
                <p className="text-xs text-slate-500 truncate">
                  {[e.name, e.email, e.phone, note].filter(Boolean).join(' · ')}
                </p>
              </div>
              <MedalChip medal={row ? row.result.finalMedal : null} size="sm" />
              <select className="sb-input text-xs w-40" value={e.categoryId} onChange={(ev) => onUpdateEntry(e.id, { categoryId: ev.target.value })}>
                {config.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => onDeleteEntry(e.id)} aria-label="Delete entry" className="p-2 text-slate-400 hover:text-red-600">
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-slate-400 text-sm text-center py-10">No entries yet.</p>}
      </div>
    </div>
  );
}

/* Medals are listed by group, not by entry, because the group is what was
   judged. A collection award is one line naming the exhibitor with its
   pieces underneath; a representative award names the piece that was judged
   and says what it stood for. */
function MedalSummary({ config, entries, groupRecords }) {
  const { rows } = buildAwards(entries, groupRecords, config);
  const buckets = MEDALS.filter((m) => m.key !== 'none').map((m) => ({
    m,
    list: rows
      .filter((r) => r.result.finalMedal?.key === m.key)
      .sort((a, b) => b.result.total - a.result.total),
  }));
  const pending = rows.filter((r) => !r.result.finalMedal).length;

  return (
    <div className="space-y-4 mb-6">
      {buckets.map((b) => (
        <div key={b.m.key}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: MEDAL_COLOR[b.m.key] }}>
            {b.m.name} · {b.list.length}
          </p>
          {b.list.length === 0 ? (
            <p className="text-xs text-slate-400">—</p>
          ) : (
            <ul className="space-y-1">
              {b.list.map((row) => {
                const note = awardScopeNote(row);
                const isCollection = row.result.scope === 'collection';
                const shown = isCollection ? row.group.entries : [row.rep || row.group.entries[0]];
                return (
                  <li key={row.group.key} className="text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {isCollection ? `${row.group.name} — ${categoryName(config, row.group.categoryId)}` : shown[0]?.modelName}
                      </span>
                      <span className="sb-mono text-xs text-slate-400 ml-auto shrink-0">
                        {row.result.total}/{row.result.max}
                      </span>
                    </div>
                    {note && <p className="text-[11px] text-teal-700 font-medium">{note}</p>}
                    <ul className="mt-0.5">
                      {shown.filter(Boolean).map((e) => (
                        <li key={e.id} className="text-xs text-slate-500 flex items-center gap-1">
                          <EntryBadgeInline number={e.number} />
                          <span className="truncate">{e.modelName}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
      {pending > 0 && <p className="text-xs text-slate-400">{pending} groups still awaiting a selection decision or marks.</p>}
    </div>
  );
}

function AwardRow({ award, config, entries, onAssign }) {
  const [showAll, setShowAll] = useState(false);
  const pool = showAll ? entries : eligibleEntries(award, entries, config);
  const current = config.specialAwards?.[award.id];

  if (award.multi) {
    const list = Array.isArray(current) ? current : [];
    const remaining = pool.filter((e) => !list.includes(e.id));
    return (
      <div className="border-b border-slate-100 py-2.5">
        <p className="text-sm font-semibold text-slate-800">
          {award.name}
          {award.useShowTheme && <span className="block text-xs font-normal text-slate-400 mt-0.5">{config.showTheme}</span>}
          <span className="block text-xs font-normal text-teal-600 mt-0.5">Multiple recipients allowed</span>
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
          {list.length === 0 && <span className="text-xs text-slate-400">None yet</span>}
          {list.map((id) => {
            const e = entries.find((x) => x.id === id);
            if (!e) return null;
            return (
              <span key={id} className="text-xs bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 flex items-center gap-1">
                #{pad(e.number)} {e.modelName}
                <button onClick={() => onAssign(award.id, list.filter((x) => x !== id))} aria-label="Remove" className="text-red-500 font-bold px-0.5">
                  <Minus size={11} />
                </button>
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <select
            className="sb-input text-sm flex-1"
            value=""
            onChange={(e) => { if (e.target.value) onAssign(award.id, [...list, e.target.value]); }}
          >
            <option value="">Add an entry…</option>
            {remaining.map((e) => <option key={e.id} value={e.id}>#{pad(e.number)} {e.modelName}</option>)}
          </select>
          <label className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> All entries
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-100 py-2.5">
      <p className="text-sm font-semibold text-slate-800">
        {award.name}
        {award.useShowTheme && <span className="block text-xs font-normal text-slate-400 mt-0.5">{config.showTheme}</span>}
      </p>
      <div className="flex items-center gap-2 mt-1.5">
        <select
          className="sb-input text-sm flex-1"
          value={current || ''}
          onChange={(e) => onAssign(award.id, e.target.value || null)}
        >
          <option value="">— not assigned —</option>
          {pool.map((e) => <option key={e.id} value={e.id}>#{pad(e.number)} {e.modelName} ({e.name})</option>)}
        </select>
        <label className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> All entries
        </label>
      </div>
    </div>
  );
}

function AwardsTab({ config, entries, groupRecords, onAssign }) {
  return (
    <div>
      <h3 className="font-semibold text-slate-800 text-sm mb-2">Medal results</h3>
      <MedalSummary config={config} entries={entries} groupRecords={groupRecords} />
      <div className="border-t border-slate-200 pt-4">
        <h3 className="font-semibold text-slate-800 text-sm mb-1">Special awards</h3>
        <p className="text-xs text-slate-500 mb-3">Assigned by the panel — not computed from scores.</p>
        {AWARD_GROUPS.map((g) => (
          <div key={g.key} className="mb-6">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-0.5">{g.title}</h4>
            <p className="text-xs text-slate-400 mb-2">{g.note}</p>
            {SPECIAL_AWARDS.filter((a) => a.group === g.key).map((a) => (
              <AwardRow key={a.id} award={a} config={config} entries={entries} onAssign={onAssign} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* The Awards Committee Chairman's view. He supervises the judging without
   scoring in it — the whole point of the role is that he sits outside the
   teams and can therefore see the exhibition and the judging process as a
   whole. Where a team disagrees or ties, his ruling here is final and is
   recorded against the group. */
function ChairmanRow({ row, config, onRule }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(row.result.ruled ? '' : '');
  const g = row.group;
  const team = teamForCategory(config, g.categoryId);
  const flagged = row.result.flags.some((f) => ['unselected', 'spread'].includes(f.key));

  return (
    <div className={`border rounded-lg p-3 ${flagged ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 text-left">
        <EntryBadge number={g.entries[0].number} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 truncate text-sm">
            {g.name} — {categoryName(config, g.categoryId)}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {g.entries.length} piece{g.entries.length === 1 ? '' : 's'}
            {awardScopeNote(row) ? ` · ${awardScopeNote(row)}` : ''}
            {team ? ` · ${team.name}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <MedalChip medal={row.result.finalMedal} size="sm" />
          <p className="sb-mono text-[10px] text-slate-400 mt-0.5">
            {row.result.total}/{row.result.max} · {row.result.n}/{row.result.expected} in
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap gap-3 mb-2">
            {row.result.marks.map((m) => (
              <span key={m.slot} className="sb-mono text-xs text-slate-600">Judge {m.slot}: {m.value}</span>
            ))}
            {row.result.marks.length === 0 && <span className="text-xs text-slate-400">No marks yet.</span>}
          </div>
          <ul className="mb-2">
            {g.entries.map((e) => (
              <li key={e.id} className="text-xs text-slate-500 flex items-center gap-1">
                <EntryBadgeInline number={e.number} />
                <span className="truncate">{e.modelName}</span>
                {row.medalled.some((x) => x.id === e.id) && (
                  <span className="text-teal-700 font-semibold uppercase text-[10px] ml-1">· Medalled</span>
                )}
              </li>
            ))}
          </ul>
          {row.result.flags.map((f) => <FlagNote key={f.key} flag={f} />)}

          <p className="text-xs font-semibold text-slate-500 mt-3 mb-1">Chairman's ruling — final say</p>
          <input
            className="sb-input mb-2"
            placeholder="Reason (optional, recorded with the ruling)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            {MEDALS.map((m) => (
              <button
                key={m.key}
                onClick={() => onRule(g.key, m.key, note)}
                className="text-xs font-semibold rounded px-2.5 py-1.5 bg-white border border-slate-300 hover:border-slate-500 text-slate-700"
              >
                Set {m.name}
              </button>
            ))}
            {row.result.ruled && (
              <button onClick={() => onRule(g.key, null, '')} className="text-xs text-slate-500 underline px-1">
                Clear ruling
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function JudgingTab({ config, entries, groupRecords, onRule }) {
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const { rows } = buildAwards(entries, groupRecords, config);
  const flaggedCount = rows.filter((r) => r.result.flags.some((f) => ['unselected', 'spread'].includes(f.key))).length;
  const shown = onlyFlagged
    ? rows.filter((r) => r.result.flags.some((f) => ['unselected', 'spread'].includes(f.key)))
    : rows;

  return (
    <div>
      <h3 className="font-semibold text-slate-800 text-sm mb-1">
        Judging oversight{config.chairmanName ? ` — ${config.chairmanName}` : ''}
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        Every group, its marks, and its point total. Where a team disagrees or ties, the Awards Committee
        Chairman has the final say — a ruling here overrides the point total and is recorded against the group.
      </p>
      <label className="text-xs text-slate-600 flex items-center gap-1.5 mb-3">
        <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
        Only groups needing review ({flaggedCount})
      </label>
      <div className="space-y-2">
        {shown.length === 0 && <p className="text-slate-400 text-sm text-center py-10">Nothing to review.</p>}
        {shown.map((row) => (
          <ChairmanRow key={row.group.key} row={row} config={config} onRule={onRule} />
        ))}
      </div>
    </div>
  );
}

function PrintTab({ onPrintAllTags, onPrintResults, onPrintRules, onPrintSign }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 mb-2">
        Entry tags print two to a Letter sheet with a QR code, the model title, category, and the
        entrant's notes in a full-height box.
      </p>
      <button onClick={onPrintSign} className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg py-2.5 font-semibold">
        <Printer size={16} /> Print registration sign
      </button>
      <button onClick={onPrintAllTags} className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white rounded-lg py-2.5 font-semibold">
        <Printer size={16} /> Print tags — all entries
      </button>
      <button onClick={onPrintResults} className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 rounded-lg py-2.5 font-semibold">
        <Printer size={16} /> Print results &amp; awards sheet
      </button>
      <button onClick={onPrintRules} className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 rounded-lg py-2.5 font-semibold">
        <Printer size={16} /> Print judging rules
      </button>
      <p className="text-xs text-slate-400">
        The registration sign carries a QR straight to this show's registration form — it reads the
        current address itself, so it stays correct even before you've set up a custom domain.
        Individual tags can also be printed from the Registration Desk, and a registrant can print their own right
        after they submit.
      </p>
    </div>
  );
}

function OrganizerView({ config, entries, groupRecords, onUpdateConfig, onUpdateEntry, onDeleteEntry, onPublishToggle, onAssignAward, onRule, onPrintAllTags, onPrintResults, onPrintRules, onPrintSign, onSyncCategories, categorySyncing }) {
  const [tab, setTab] = useState('overview');
  const [editingSettings, setEditingSettings] = useState(false);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'entries', label: 'Entries', icon: Users },
    { id: 'judging', label: 'Judging', icon: ListChecks },
    { id: 'awards', label: 'Awards', icon: Trophy },
    { id: 'print', label: 'Print', icon: Printer },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h2 className="sb-display text-2xl mb-4">Organizer Console</h2>
      <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setEditingSettings(false); }}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab config={config} entries={entries} groupRecords={groupRecords} onPublishToggle={onPublishToggle} />}
      {tab === 'entries' && <EntriesTab config={config} entries={entries} groupRecords={groupRecords} onUpdateEntry={onUpdateEntry} onDeleteEntry={onDeleteEntry} />}
      {tab === 'judging' && <JudgingTab config={config} entries={entries} groupRecords={groupRecords} onRule={onRule} />}
      {tab === 'awards' && <AwardsTab config={config} entries={entries} groupRecords={groupRecords} onAssign={onAssignAward} />}
      {tab === 'print' && <PrintTab onPrintAllTags={onPrintAllTags} onPrintResults={onPrintResults} onPrintRules={onPrintRules} onPrintSign={onPrintSign} />}
      {tab === 'settings' && (
        editingSettings ? (
          <SetupWizard
            initial={config}
            isEdit
            onCancel={() => setEditingSettings(false)}
            onSave={async (cfg) => { await onUpdateConfig(cfg); setEditingSettings(false); }}
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
            <div>
              <p className="text-sm text-slate-600 mb-1">
                Edit show name, date, location, staff PIN, the Awards Committee Chairman, the judging teams, and
                categories.
              </p>
              <p className="text-xs text-slate-500 mb-3">
                {(config.teams || []).map((t) => `${t.name} (${t.judgeCount} judges)`).join(' · ')}
                {config.chairmanName ? ` · Chairman: ${config.chairmanName}` : ''}
              </p>
              <button onClick={() => setEditingSettings(true)} className="text-sm font-medium text-teal-700 flex items-center gap-1">
                <Edit2 size={14} /> Edit show settings
              </button>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-500 mb-1">
                Category list ({config.categories.length})
              </p>
              <p className="text-xs text-slate-500 mb-2">{config.categories.map((c) => c.name).join(' · ')}</p>
              <button onClick={onSyncCategories} disabled={categorySyncing} className="text-sm font-medium text-teal-700 disabled:opacity-40 flex items-center gap-1">
                {categorySyncing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {categorySyncing ? 'Restoring…' : 'Restore any missing default categories'}
              </button>
              <p className="text-xs text-slate-400 mt-1">
                Only ever adds — never renames or removes anything already in your list.
              </p>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/* ---------------------------------- results ---------------------------------- */

function ResultsView({ config, entries, groupRecords }) {
  const { rows } = buildAwards(entries, groupRecords, config);
  const medalGroups = MEDALS.filter((m) => m.key !== 'none').map((m) => ({
    m,
    items: rows.filter((r) => r.result.finalMedal?.key === m.key).sort((a, b) => b.result.total - a.result.total),
  }));

  const namedResults = SPECIAL_AWARDS.map((a) => {
    const val = config.specialAwards?.[a.id];
    const ids = Array.isArray(val) ? val : val ? [val] : [];
    const winners = ids.map((id) => entries.find((e) => e.id === id)).filter(Boolean);
    return { a, winners };
  }).filter((x) => x.winners.length > 0);

  const bestOfShow = namedResults.find((x) => x.a.id === 'judges-best-of-show');
  const others = namedResults.filter((x) => x.a.id !== 'judges-best-of-show');

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <Trophy className="mx-auto text-amber-500 mb-2" size={32} />
        <h2 className="sb-display text-3xl">{config.name}</h2>
        <p className="text-slate-500 text-sm">Results</p>
      </div>

      {bestOfShow && bestOfShow.winners.map((e) => (
        <div key={e.id} className="bg-slate-900 text-white rounded-xl p-6 text-center mb-8">
          <p className="text-amber-400 text-xs uppercase tracking-widest font-semibold mb-2">Judges Best of Show</p>
          <p className="sb-display text-2xl">{e.modelName}</p>
          <p className="text-slate-300 text-sm mt-1">{e.name} · #{pad(e.number)}</p>
        </div>
      ))}

      <div className="space-y-6 mb-10">
        {medalGroups.map(({ m, items }) => items.length > 0 && (
          <div key={m.key}>
            <h3 className="sb-display text-lg mb-2 pb-2 border-b border-slate-200" style={{ color: MEDAL_COLOR[m.key] }}>
              {m.name}
            </h3>
            <div className="space-y-3">
              {items.map((row) => {
                const isCollection = row.result.scope === 'collection';
                const note = awardScopeNote(row);
                const shown = isCollection ? row.group.entries : [row.rep || row.group.entries[0]];
                return (
                  <div key={row.group.key}>
                    {isCollection ? (
                      <>
                        <p className="font-medium text-slate-900">
                          {row.group.name} — {categoryName(config, row.group.categoryId)}
                        </p>
                        <p className="text-xs text-teal-700 font-medium mb-1">{note}</p>
                        <div className="space-y-1 ml-1">
                          {shown.map((e) => (
                            <div key={e.id} className="flex items-center gap-2 text-sm">
                              <EntryBadgeInline number={e.number} />
                              <span className="text-slate-700">{e.modelName}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <EntryBadgeInline number={shown[0]?.number} />
                          <span className="font-medium text-slate-900">{shown[0]?.modelName}</span>
                          <span className="text-slate-400 text-sm">{row.group.name}</span>
                        </div>
                        {note && <p className="text-xs text-teal-700 font-medium ml-1">{note}</p>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {rows.every((r) => !r.result.finalMedal) && (
          <p className="text-slate-400 text-center py-10">Awards will appear here once published.</p>
        )}
      </div>

      {others.length > 0 && (
        <div>
          <h3 className="sb-display text-lg mb-3 pb-2 border-b border-slate-200">Special awards</h3>
          <div className="space-y-2">
            {others.map(({ a, winners }) => (
              <div key={a.id} className="text-sm">
                <span className="font-semibold text-amber-700">{a.name}</span>
                {a.useShowTheme && <span className="block text-xs text-slate-400">{config.showTheme}</span>}
                {winners.map((e) => (
                  <p key={e.id} className="text-slate-700 ml-1">
                    <EntryBadgeInline number={e.number} /> {e.modelName} — <span className="text-slate-500">{e.name}</span>
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------- print ----------------------------------- */

function TagCard({ entry, config }) {
  return (
    <div className="tag">
      <div className="tag-head">
        <div className="tag-no">Entry<b>{pad(entry.number)}</b></div>
        <div>
          <QrCode value={entryQrPayload(entry.number)} size={92} />
          <div className="tag-qrcap">SCAN AT DESK / JUDGING</div>
        </div>
      </div>
      <div className="tag-title">{entry.modelName}</div>
      <div className="tag-meta">
        <span>{categoryName(config, entry.categoryId)}</span>
      </div>
      <div className="tag-notes">
        <div className="lbl">Notes</div>
        <div className="body">{entry.notes}</div>
      </div>
    </div>
  );
}

/* Announcement order: bronze first, building to gold. The sheet is read out
   at the ceremony as well as filed, so it follows the order it will be
   spoken in rather than ranking best-first. */
const ANNOUNCE_ORDER = ['bronze', 'silver', 'gold'];

/* One recipient line. The representative/collection distinction has to survive
   onto paper, so a collection award names the exhibitor and lists its pieces
   underneath, while a representative award names the piece that was judged and
   says what it stood for. */
function AwardLines({ row }) {
  const note = awardScopeNote(row);
  const total = `${row.result.total}/${row.result.max}`;
  const ruled = row.result.ruled ? ' · Chairman ruling' : '';

  if (row.result.scope === 'collection') {
    return (
      <div className="awardline">
        <div className="who">
          {row.group.name} <span className="pts">{total}{ruled}</span>
        </div>
        <div className="scope">{note}</div>
        {row.group.entries.map((e) => (
          <div className="piece" key={e.id}>#{pad(e.number)} {e.modelName}</div>
        ))}
      </div>
    );
  }

  const piece = row.rep || row.group.entries[0];
  return (
    <div className="awardline">
      <div className="who">
        #{pad(piece.number)} {piece.modelName} — {row.group.name} <span className="pts">{total}{ruled}</span>
      </div>
      {note && <div className="scope">{note}</div>}
    </div>
  );
}

function ResultsSheet({ config, entries, groupRecords }) {
  const { rows } = buildAwards(entries, groupRecords, config);
  const teamLine = (config.teams || []).map((t) => `${t.name} (${t.judgeCount} judges)`).join(' · ');

  // Category order follows the configured list, so the printed sheet matches
  // the order categories appear everywhere else in the app.
  const byCategory = config.categories.map((c) => {
    const catRows = rows.filter(
      (r) => r.group.categoryId === c.id && r.result.finalMedal && r.result.finalMedal.key !== 'none'
    );
    const medals = ANNOUNCE_ORDER
      .map((key) => ({
        medal: medalByKey(key),
        list: catRows
          .filter((r) => r.result.finalMedal.key === key)
          .sort((a, b) => b.result.total - a.result.total),
      }))
      .filter((m) => m.list.length > 0);
    return { category: c, medals, count: catRows.length };
  });

  const awarded = byCategory.filter((x) => x.count > 0);
  const empty = byCategory.filter((x) => x.count === 0);

  return (
    <div className="printdoc">
      <h1>{config.name}</h1>
      <p>
        {config.date} · Open judging system · {teamLine}
        {config.chairmanName ? ` · Awards Committee Chairman: ${config.chairmanName}` : ''}
      </p>

      <h2>Medals by category</h2>
      <p style={{ fontSize: '8.5pt' }}>
        Listed in announcement order — Bronze, then Silver, then Gold. Medals are earned against the standard, so
        any number of entries can hold the same one. Where an exhibitor entered several pieces in a category, the
        team either judged the single best piece as representative of the group, or judged the whole collection
        together and awarded every piece in it — the line under each recipient says which.
      </p>

      {awarded.length === 0 && <p>No medals have been awarded yet.</p>}

      {awarded.map(({ category, medals }) => (
        <div className="cat" key={category.id}>
          <h3>{category.name}</h3>
          {medals.map(({ medal, list }) => (
            <div className="medalgroup" key={medal.key}>
              <div className="medalhead">{medal.name} · {list.length}</div>
              {list.map((row) => <AwardLines key={row.group.key} row={row} />)}
            </div>
          ))}
        </div>
      ))}

      {empty.length > 0 && (
        <p style={{ fontSize: '8.5pt', marginTop: '8pt' }}>
          <em>No medals awarded in: {empty.map((x) => x.category.name).join(', ')}.</em>
        </p>
      )}

      <h2>Special awards</h2>
      <table>
        <thead><tr><th style={{ width: '40%' }}>Award</th><th>Recipient</th></tr></thead>
        <tbody>
          {SPECIAL_AWARDS.map((a) => {
            const val = config.specialAwards?.[a.id];
            const ids = Array.isArray(val) ? val : val ? [val] : [];
            const names = ids.map((id) => {
              const e = entries.find((x) => x.id === id);
              return e ? `#${pad(e.number)} ${e.modelName} — ${e.name}` : null;
            }).filter(Boolean);
            return (
              <tr key={a.id}>
                <td>{a.name}{a.useShowTheme ? <><br /><em style={{ fontSize: '8pt' }}>{config.showTheme}</em></> : null}</td>
                <td>{names.length ? names.map((n, i) => <div key={i}>{n}</div>) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RegistrationSign({ config }) {
  const url = `${window.location.origin}${window.location.pathname}?view=register`;
  return (
    <div className="regsign">
      <div className="eyebrow">{config.name}</div>
      <h1>Register Your Model</h1>
      <div className="qrwrap">
        <QrCode value={url} size={250} />
      </div>
      <div className="urltext">{url}</div>
      <ol>
        <li>Scan the code above, or type the address into any browser.</li>
        <li>Fill in your name, the model's title, category, and a few notes — judges read them.</li>
        <li>Submit. You'll get an entry number and a QR code of your own.</li>
        <li>Print your tag on the spot, or ask desk staff to print it for you.</li>
      </ol>
      <div className="foot">No account needed &middot; Ask at the desk if you'd rather we register you</div>
    </div>
  );
}

function RulesSheet({ config }) {
  const teams = config.teams || [];
  const sizes = Array.from(new Set(teams.map((t) => Number(t.judgeCount) || 3))).sort((a, b) => b - a);
  return (
    <div className="printdoc">
      <h1>Judging rules &mdash; {config.name}</h1>
      <p>
        This show uses the Open judging system, as used at most U.S. figure exhibitions. Awards are earned against
        a standard, not won in competition against the other entries: any number of pieces can take the same
        medal, and every piece is judged on its own merits.
      </p>

      <h2>Teams</h2>
      <p>
        Judging is done by two or more teams, each normally of three judges. A judge never judges his own work; if
        a piece in front of a team is that judge&rsquo;s own, another judge on the team scores it.
        {teams.length > 0 && ` This show is running ${teams.length} team${teams.length === 1 ? '' : 's'}: ${teams.map((t) => `${t.name}, ${t.judgeCount} judges`).join('; ')}.`}
      </p>

      <h2>Selecting what is judged</h2>
      <p>
        The team first agrees, by concurrence, on what it is judging. It selects the piece or pieces most likely to
        give the exhibitor the highest award. At least one piece or group of pieces is selected for every
        exhibitor, even where the team feels the work is unlikely to win an award. Where an exhibitor has several
        pieces in one category, the team decides together between two outcomes: judge the single best piece as
        representative of the group, in which case only that piece is medalled; or judge the whole collection as
        one, in which case every piece in it takes the same medal. Each judge records the title of the piece and
        the exhibitor&rsquo;s name on his form as the selections are made.
      </p>

      <h2>Awarding points</h2>
      <p>
        The judges then award points independently of each other &mdash; no conferring, and no judge sees another
        judge&rsquo;s marks until his own are in. Each judge awards each selected piece or group up to four points:
        1&ndash;2 points for a Bronze Medal, 3 points for a Silver Medal, and 4 points for a Gold Medal. A piece a
        judge considers unworthy of an award scores 0.
      </p>
      <p>
        Note that this is one mark for the whole piece or group, not a mark per criterion. The criteria below are
        what a judge weighs in arriving at that single number.
      </p>
      <table>
        <thead><tr><th>Mark</th><th>Meaning</th></tr></thead>
        <tbody>
          {MARK_GUIDE.map((m) => (
            <tr key={m.value}><td>{m.value}</td><td>{m.label}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>Judging criteria</h2>
      <p>Not listed in order of importance or of consideration.</p>
      <table>
        <thead><tr><th style={{ width: '32%' }}>Criterion</th><th>What it covers</th></tr></thead>
        <tbody>
          {CRITERIA.map((c) => (
            <tr key={c.key}><td>{c.name}</td><td>{c.hint}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>From points to a medal</h2>
      <p>
        The sheets go to the Awards Committee, which checks them for accuracy and integrity and tallies the points
        each judge gave. The total earns the medal. With a full team of three judges the maximum any piece or
        group can receive is 12 points. Where a team is reduced to two judges the maximum is 8, and the bands are
        scaled to match, so a Gold still means every judge on the team independently saw gold-standard work.
      </p>
      {sizes.includes(3) && (
        <>
          <p><strong>Three judges &mdash; maximum 12 points</strong></p>
          <table>
            <thead><tr><th>Medal</th><th>Point total</th></tr></thead>
            <tbody>
              <tr><td>Gold Medal</td><td>11 &ndash; 12</td></tr>
              <tr><td>Silver Medal</td><td>8 &ndash; 10</td></tr>
              <tr><td>Bronze Medal</td><td>1 &ndash; 7</td></tr>
              <tr><td>No award</td><td>0</td></tr>
            </tbody>
          </table>
        </>
      )}
      {sizes.includes(2) && (
        <>
          <p><strong>Two judges &mdash; maximum 8 points</strong></p>
          <table>
            <thead><tr><th>Medal</th><th>Point total</th></tr></thead>
            <tbody>
              <tr><td>Gold Medal</td><td>8</td></tr>
              <tr><td>Silver Medal</td><td>6 &ndash; 7</td></tr>
              <tr><td>Bronze Medal</td><td>1 &ndash; 5</td></tr>
              <tr><td>No award</td><td>0</td></tr>
            </tbody>
          </table>
        </>
      )}

      <h2>The Awards Committee Chairman</h2>
      <p>
        The Awards Committee Chairman supervises the judging{config.chairmanName ? ` (${config.chairmanName})` : ''}.
        Experience with the system and detachment from the actual judging give him an overall view of the work on
        exhibition and of the judging process; he does not score as a judge. In the case of disagreement, or even a
        tie within a judging team, the Chairman has the final say. Any ruling he makes is recorded against the
        group it applies to.
      </p>

      <h2>Special awards</h2>
      <p>
        Medals are earned against the standard, so any number of entries can hold the same medal. The named and
        category awards are comparative: the panel picks one recipient each (or several, for the Capital Palette
        awards) by discussion. An entry can hold a medal and any number of special awards at once.
      </p>
    </div>
  );
}

function PrintLayer({ job, config, entries, groupRecords }) {
  if (!job) return <div className="print-only" />;

  if (job.type === 'tags') {
    const list = job.entries;
    const sheets = [];
    for (let i = 0; i < list.length; i += 2) sheets.push(list.slice(i, i + 2));
    return (
      <div className="print-only">
        {sheets.map((pair, i) => (
          <div className="tagsheet" key={i}>
            {pair.map((e) => <TagCard key={e.id} entry={e} config={config} />)}
          </div>
        ))}
      </div>
    );
  }
  if (job.type === 'results') return <div className="print-only"><ResultsSheet config={config} entries={entries} groupRecords={groupRecords} /></div>;
  if (job.type === 'rules') return <div className="print-only"><RulesSheet config={config} /></div>;
  if (job.type === 'sign') return <div className="print-only"><RegistrationSign config={config} /></div>;
  return <div className="print-only" />;
}

/* ------------------------------------ app ------------------------------------ */

const VALID_VIEWS = ['register', 'desk', 'judge', 'organizer', 'results'];

function getViewFromUrl() {
  try {
    const v = new URLSearchParams(window.location.search).get('view');
    return VALID_VIEWS.includes(v) ? v : 'landing';
  } catch {
    return 'landing';
  }
}

function viewTitle(v) {
  return { register: 'Register', desk: 'Registration Desk', judge: 'Judging', organizer: 'Organizer Console', results: 'Results' }[v] || '';
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [entries, setEntries] = useState([]);
  const [groupRecords, setGroupRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(getViewFromUrl);
  const [unlocked, setUnlocked] = useState({ desk: false, judge: false, organizer: false });
  const [toast, setToast] = useState(null);
  const [printJob, setPrintJob] = useState(null);

  const notify = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2400); };

  const refresh = useCallback(async () => {
    const cfgRaw = await safeGet('brushscore:config', true);
    const entRaw = await safeGet('brushscore:entries', true);
    const grpRaw = await safeGet('brushscore:groups', true);
    const rawConfig = cfgRaw ? JSON.parse(cfgRaw) : null;
    const normalized = normalizeConfig(rawConfig);
    setConfig(normalized);
    setEntries((entRaw ? JSON.parse(entRaw) : []).map(normalizeEntry));
    setGroupRecords(grpRaw ? JSON.parse(grpRaw) : {});
    setLoading(false);
    // If the default category list picked up names the saved show doesn't
    // have yet, normalizeConfig just added them with fresh ids. Persist
    // that once, immediately — otherwise the next reload generates new
    // random ids again, and any entry registered under the first set in
    // the meantime would point at a category id that no longer exists.
    if (rawConfig && normalized.categories.length !== (rawConfig.categories || []).length) {
      try { await window.storage.set('brushscore:config', JSON.stringify(normalized), true); }
      catch (e) { /* best effort — it simply re-merges next load if this fails */ }
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Trigger the browser print dialog once the print layer has actually
  // painted, and clear the job afterward so the next print starts fresh.
  useEffect(() => {
    if (!printJob) return undefined;
    const raf = requestAnimationFrame(() => window.print());
    const clear = () => setPrintJob(null);
    window.addEventListener('afterprint', clear);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('afterprint', clear); };
  }, [printJob]);

  const saveConfigNow = async (cfg) => {
    setConfig(cfg);
    try { await window.storage.set('brushscore:config', JSON.stringify(cfg), true); }
    catch (e) { notify('Could not save settings.', 'error'); }
  };

  const saveEntriesNow = async (list) => {
    setEntries(list);
    try { await window.storage.set('brushscore:entries', JSON.stringify(list), true); }
    catch (e) { notify('Could not save — try again.', 'error'); }
  };

  /* Group decisions are written by several judges on several devices at once,
     so each write re-reads the store and patches only its own group before
     saving. Two judges marking different groups seconds apart would otherwise
     each save a whole snapshot and the later one would erase the earlier. */
  const patchGroup = async (key, patch) => {
    const raw = await safeGet('brushscore:groups', true);
    const latest = raw ? JSON.parse(raw) : groupRecords;
    const current = latest[key] || emptyGroup(key);
    const next = { ...latest, [key]: { ...current, ...patch } };
    setGroupRecords(next);
    try { await window.storage.set('brushscore:groups', JSON.stringify(next), true); }
    catch (e) { notify('Could not save — try again.', 'error'); }
    return next;
  };

  const setGroupScope = async (key, scope, repEntryId) => {
    // Changing the scope invalidates marks given under the old one: a mark
    // for "the best of these four" is not a mark for the collection. Clearing
    // them is the honest option — better a visible re-score than a total
    // silently built from marks the judges gave to a different question.
    await patchGroup(key, { scope, repEntryId, marks: {}, ruling: null, rulingNote: '' });
    notify(
      scope === 'collection' ? 'Judging the whole collection.'
        : scope === 'representative' ? 'Representative piece selected.'
          : 'Selection cleared — marks reset.'
    );
  };

  const setGroupMark = async (key, seat, value, teamId) => {
    const raw = await safeGet('brushscore:groups', true);
    const latest = raw ? JSON.parse(raw) : groupRecords;
    const current = latest[key] || emptyGroup(key);
    const marks = { ...current.marks };
    if (value === null || value === undefined) delete marks[seat];
    else marks[seat] = value;
    await patchGroup(key, { marks, teamId: current.teamId || teamId || null });
  };

  const setChairmanRuling = async (key, medalKey, note) => {
    await patchGroup(key, { ruling: medalKey, rulingNote: medalKey ? (note || '') : '' });
    notify(medalKey ? `Chairman's ruling recorded: ${medalByKey(medalKey)?.name}.` : 'Ruling cleared.');
  };

  const addEntry = async (form, isWalkIn = false) => {
    const cfgRaw = await safeGet('brushscore:config', true);
    const entRaw = await safeGet('brushscore:entries', true);
    const latestConfig = cfgRaw ? normalizeConfig(JSON.parse(cfgRaw)) : config;
    const latestEntries = (entRaw ? JSON.parse(entRaw) : entries).map(normalizeEntry);
    const number = latestConfig.nextEntryNumber || latestEntries.length + 1;
    const entry = normalizeEntry({
      id: uid('entry'), number,
      name: form.name.trim(),
      email: (form.email || '').trim(),
      phone: (form.phone || '').trim(),
      modelName: form.modelName.trim(), categoryId: form.categoryId,
      notes: (form.notes || '').trim(),
      checkedIn: isWalkIn, checkedInAt: isWalkIn ? new Date().toISOString() : null,
      registeredAt: new Date().toISOString(),
    });
    const newEntries = [...latestEntries, entry];
    const newConfig = { ...latestConfig, nextEntryNumber: number + 1 };
    await saveEntriesNow(newEntries);
    await saveConfigNow(newConfig);
    notify(isWalkIn ? `Walk-in entry #${number} added.` : `Entry #${number} confirmed!`);
    return entry;
  };

  const updateEntry = async (id, patch) => {
    const newEntries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
    await saveEntriesNow(newEntries);
  };

  const checkIn = async (id, val) => {
    await updateEntry(id, { checkedIn: val, checkedInAt: val ? new Date().toISOString() : null });
    notify(val ? 'Checked in.' : 'Check-in removed.');
  };

  const assignAward = async (awardId, value) => {
    const newConfig = { ...config, specialAwards: { ...config.specialAwards, [awardId]: value } };
    await saveConfigNow(newConfig);
  };

  const deleteEntry = async (id) => {
    const newEntries = entries.filter((e) => e.id !== id);
    await saveEntriesNow(newEntries);
    // Drop any group the deletion emptied out. Without this, an exhibitor
    // removed and later re-registered under the same name and category would
    // silently inherit the old team's marks and ruling.
    const live = new Set(buildGroups(newEntries).map((g) => g.key));
    const pruned = Object.fromEntries(Object.entries(groupRecords).filter(([k]) => live.has(k)));
    if (Object.keys(pruned).length !== Object.keys(groupRecords).length) {
      setGroupRecords(pruned);
      try { await window.storage.set('brushscore:groups', JSON.stringify(pruned), true); }
      catch (e) { /* best effort — the stale record is inert until that name and category recur */ }
    }
    notify('Entry removed.');
  };

  const publishToggle = async () => {
    const newStatus = config.status === 'published' ? 'open' : 'published';
    await saveConfigNow({ ...config, status: newStatus });
    notify(newStatus === 'published' ? 'Results published!' : 'Results unpublished.');
  };

  // Guards syncCategories against overlapping runs. saveConfigNow updates
  // the UI immediately but persists to storage a tick later — a second
  // click before that write lands would read the old storage state and
  // silently race the first click's save. Ignoring calls while one is
  // already in flight closes that window entirely.
  const [categorySyncing, setCategorySyncing] = useState(false);
  const syncCategories = async () => {
    if (categorySyncing) return;
    setCategorySyncing(true);
    try {
      const cfgRaw = await safeGet('brushscore:config', true);
      const raw = cfgRaw ? JSON.parse(cfgRaw) : config;
      if (!raw) return;
      const { categories, added } = mergeDefaultCategories(raw.categories);
      await saveConfigNow(normalizeConfig({ ...raw, categories }));
      notify(
        added > 0
          ? `Added ${added} categor${added === 1 ? 'y' : 'ies'} — refresh the register form to see it.`
          : 'Every default category is already in your list.'
      );
    } finally {
      setCategorySyncing(false);
    }
  };

  const printTags = (list) => {
    if (!list.length) { notify('Nothing selected to print.', 'error'); return; }
    setPrintJob({ type: 'tags', entries: list });
  };
  const printResultsSheet = () => setPrintJob({ type: 'results' });
  const printRulesSheet = () => setPrintJob({ type: 'rules' });
  const printRegistrationSign = () => setPrintJob({ type: 'sign' });

  const nav = (v) => {
    setView(v);
    const url = new URL(window.location.href);
    if (v === 'landing') url.searchParams.delete('view');
    else url.searchParams.set('view', v);
    window.history.replaceState({}, '', url);
  };

  if (loading) {
    return (
      <>
        <GlobalStyles />
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 className="animate-spin text-slate-400" size={28} />
        </div>
      </>
    );
  }

  if (!config) {
    return (
      <>
        <GlobalStyles />
        <div className="min-h-screen bg-slate-50 sb-blueprint-bg sb-root">
          <SetupWizard onSave={async (cfg) => { await saveConfigNow(normalizeConfig(cfg)); await saveEntriesNow([]); }} />
        </div>
      </>
    );
  }

  return (
    <>
      <GlobalStyles />
      <div className="min-h-screen bg-slate-50 sb-root no-print">
        {view !== 'landing' && <TopBar title={viewTitle(view)} onBack={() => nav('landing')} />}
        {view === 'landing' && <Landing config={config} entries={entries} onNav={nav} onPrintTag={(entry) => printTags([entry])} />}
        {view === 'register' && <RegisterView config={config} onSubmit={(form) => addEntry(form, false)} onPrintTag={(entry) => printTags([entry])} />}
        {view === 'desk' && (
          <PinGate config={config} unlocked={unlocked.desk} onUnlock={() => setUnlocked((u) => ({ ...u, desk: true }))} label="Registration Desk">
            <DeskView config={config} entries={entries} onCheckIn={checkIn} onWalkIn={(form) => addEntry(form, true)} onPrintTags={printTags} notify={notify} />
          </PinGate>
        )}
        {view === 'judge' && (
          <PinGate config={config} unlocked={unlocked.judge} onUnlock={() => setUnlocked((u) => ({ ...u, judge: true }))} label="Judging">
            <JudgeView
              config={config}
              entries={entries}
              groupRecords={groupRecords}
              onSetScope={setGroupScope}
              onSetMark={setGroupMark}
              notify={notify}
            />
          </PinGate>
        )}
        {view === 'organizer' && (
          <PinGate config={config} unlocked={unlocked.organizer} onUnlock={() => setUnlocked((u) => ({ ...u, organizer: true }))} label="Organizer">
            <OrganizerView
              config={config}
              entries={entries}
              groupRecords={groupRecords}
              onUpdateConfig={(cfg) => saveConfigNow(normalizeConfig(cfg))}
              onUpdateEntry={updateEntry}
              onDeleteEntry={deleteEntry}
              onPublishToggle={publishToggle}
              onAssignAward={assignAward}
              onRule={setChairmanRuling}
              onPrintAllTags={() => printTags(entries)}
              onPrintResults={printResultsSheet}
              onPrintRules={printRulesSheet}
              onPrintSign={printRegistrationSign}
              onSyncCategories={syncCategories}
              categorySyncing={categorySyncing}
            />
          </PinGate>
        )}
        {view === 'results' && <ResultsView config={config} entries={entries} groupRecords={groupRecords} />}
        <Toast message={toast?.msg} type={toast?.type} />
      </div>
      <PrintLayer job={printJob} config={config} entries={entries} groupRecords={groupRecords} />
    </>
  );
}
