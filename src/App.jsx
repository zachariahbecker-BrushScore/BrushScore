import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  UserPlus, ClipboardCheck, ListChecks, Settings, Trophy, ArrowLeft,
  Search, Plus, Trash2, Check, Lock, Edit2, Save, Loader2, BarChart3, Users,
  QrCode as QrCodeIcon, X, Copy, Printer, ChevronDown, ChevronUp, Minus,
} from 'lucide-react';
import { encodeQR } from './qrcode';
import {
  CRITERIA, PER_CRITERION_MAX, TIERS, LIMITS,
  computeScore, fmt1, flagLabel, reconciliationText,
} from './scoring';
import {
  DEFAULT_CATEGORIES, DIVISIONS, DEFAULT_SHOW_THEME,
  SPECIAL_AWARDS, AWARD_GROUPS, eligibleEntries,
} from './awards';

/* ---------------------------------- data ---------------------------------- */

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function pad(n) { return String(n).padStart(3, '0'); }
function categoryName(config, id) { return config.categories.find((c) => c.id === id)?.name || '—'; }

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
   that are no longer used are simply ignored from here on. */
function normalizeEntry(e) {
  return {
    contact: '', division: 'Open', notes: '',
    checkedIn: false, checkedInAt: null,
    scores: {}, headConfirm: null,
    registeredAt: null,
    ...e,
  };
}
function normalizeConfig(c) {
  if (!c) return c;
  return {
    judgeCount: 3, headJudgeSlot: 1, showTheme: DEFAULT_SHOW_THEME, specialAwards: {},
    ...c,
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
      <div className="w-14" />
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

/* --------------------------- tier + score display --------------------------- */

const TIER_STYLE = {
  gold: 'bg-amber-50 text-amber-700 border-amber-300',
  silver: 'bg-slate-100 text-slate-600 border-slate-300',
  bronze: 'bg-orange-50 text-orange-800 border-orange-300',
  merit: 'bg-slate-50 text-slate-500 border-slate-300',
  none: 'bg-white text-slate-400 border-slate-200 border-dashed',
};
const TIER_BAR_COLOR = {
  gold: '#b45309', silver: '#64748b', bronze: '#9a3412', merit: '#475569', none: '#cbd5e1',
};

function TierChip({ tier, size = 'md' }) {
  if (!tier) return <span className="text-xs text-slate-400">Unjudged</span>;
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs';
  return <span className={`font-semibold rounded-full border ${pad} ${TIER_STYLE[tier.key]}`}>{tier.name}</span>;
}

function ScoreMeter({ result }) {
  const notches = TIERS.filter((t) => t.key !== 'none').map((t) => t.min).reverse();
  const pct = result.score ?? 0;
  const color = TIER_BAR_COLOR[result.finalTier?.key || 'none'];
  return (
    <div>
      <div className="relative h-6 rounded bg-slate-100 border border-slate-200 overflow-hidden">
        {result.score !== null && (
          <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: color, opacity: 0.85 }} />
        )}
        {notches.map((n) => (
          <div key={n} className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${n}%` }} />
        ))}
        {result.score !== null && (
          <span className="absolute inset-0 flex items-center justify-end pr-2 sb-mono text-xs font-semibold text-slate-900">
            {result.score}
          </span>
        )}
      </div>
      <div className="flex justify-between sb-mono text-[9.5px] text-slate-400 mt-0.5">
        <span>0</span><span>Merit 50</span><span>Bronze 65</span><span>Silver 76</span><span>Gold 86</span><span>100</span>
      </div>
    </div>
  );
}

function FlagNote({ flag }) {
  const calm = flag.key === 'confirmed' || flag.key === 'unjudged';
  return (
    <div className={`text-xs rounded p-2 mt-2 ${calm ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-800'}`}>
      <strong>{flagLabel(flag.key)}</strong> — {flag.text}{reconciliationText(flag.key)}
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

function Landing({ config, entries, onNav }) {
  const total = entries.length;
  const checkedIn = entries.filter((e) => e.checkedIn).length;
  return (
    <div className="sb-blueprint-bg">
      <div className="max-w-3xl mx-auto px-4 py-14 text-center">
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
        <RoleCard icon={ListChecks} title="Judging" desc="Score entries against the rubric." onClick={() => onNav('judge')} accent="teal" />
        <RoleCard icon={Settings} title="Organizer Console" desc="Categories, awards, and results." onClick={() => onNav('organizer')} accent="teal" />
      </div>
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
  const [judgeCount, setJudgeCount] = useState(initial?.judgeCount || 3);
  const [headJudgeSlot, setHeadJudgeSlot] = useState(initial?.headJudgeSlot || 1);
  const [showTheme, setShowTheme] = useState(initial?.showTheme ?? DEFAULT_SHOW_THEME);
  const [categories, setCategories] = useState(
    initial?.categories?.length ? initial.categories : DEFAULT_CATEGORIES.map((n) => ({ id: uid('cat'), name: n }))
  );
  const [saving, setSaving] = useState(false);

  const updateCat = (idx, value) => setCategories((cs) => cs.map((c, i) => (i === idx ? { ...c, name: value } : c)));
  const addCat = () => setCategories((cs) => [...cs, { id: uid('cat'), name: '' }]);
  const removeCat = (idx) => setCategories((cs) => cs.filter((_, i) => i !== idx));

  const canSave = name.trim() && adminPin.trim().length >= 4 && categories.some((c) => c.name.trim());

  const submit = async () => {
    setSaving(true);
    await onSave({
      ...initial,
      name: name.trim(),
      date,
      location: location.trim(),
      adminPin: adminPin.trim(),
      judgeCount: Number(judgeCount),
      headJudgeSlot: Math.min(Number(headJudgeSlot), Number(judgeCount)),
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
        <h3 className="font-semibold text-slate-800 mb-1 text-sm">Judging panel</h3>
        <p className="text-xs text-slate-500 mb-3">
          Three criteria at 0–100 either way — panel size only changes how disagreement between judges gets resolved.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Judges per entry">
            <select className="sb-input" value={judgeCount} onChange={(e) => setJudgeCount(e.target.value)}>
              <option value={3}>3 — standard panel</option>
              <option value={2}>2 — reduced panel</option>
            </select>
          </Field>
          <Field label="Head judge">
            <select className="sb-input" value={headJudgeSlot} onChange={(e) => setHeadJudgeSlot(e.target.value)}>
              {Array.from({ length: Number(judgeCount) }, (_, i) => i + 1).map((s) => (
                <option key={s} value={s}>Judge {s}</option>
              ))}
            </select>
          </Field>
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
        Division (Open / Painters / Junior) is asked at registration for every category, so the Painters and Junior
        category awards work no matter which of these a model is entered under.
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

function RegisterView({ config, onSubmit, onPrintTag }) {
  const firstCat = config.categories[0];
  const [form, setForm] = useState({
    name: '', contact: '', modelName: '',
    categoryId: firstCat?.id || '', division: 'Open', notes: '',
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
        <p className="text-slate-400 text-xs mb-6">Or ask staff to print it for you and set it beside your model.</p>
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
      <Field label="Email or phone">
        <input className="sb-input" value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} placeholder="For award notifications (optional)" />
      </Field>
      <Field label="Model / subject name">
        <input className="sb-input" value={form.modelName} onChange={(e) => setForm((f) => ({ ...f, modelName: e.target.value }))} placeholder="e.g. Sherman M4A3" required />
      </Field>
      <Field label="Category">
        <select className="sb-input" value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
          {config.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Division">
        <select className="sb-input" value={form.division} onChange={(e) => setForm((f) => ({ ...f, division: e.target.value }))}>
          {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
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
      const s = q.toLowerCase();
      return !s || e.name.toLowerCase().includes(s) || String(e.number).includes(s) || e.modelName.toLowerCase().includes(s);
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
        <RegisterView config={config} onSubmit={(form) => onWalkIn(form)} onPrintTag={(entry) => onPrintTags([entry])} />
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
              <p className="text-xs text-slate-500 truncate">{e.name} · {categoryName(config, e.categoryId)} · {e.division}</p>
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

function JudgeSlotPicker({ config, slot, onChange }) {
  const slots = Array.from({ length: config.judgeCount || 3 }, (_, i) => i + 1);
  return (
    <div className="flex items-center gap-2 mb-4 bg-white border border-slate-200 rounded-lg p-2 flex-wrap">
      <span className="text-xs font-semibold text-slate-500 pl-1 shrink-0">I am</span>
      {slots.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`px-3 py-1.5 rounded-md text-sm font-semibold ${slot === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          Judge {s}{s === config.headJudgeSlot ? ' · Head' : ''}
        </button>
      ))}
    </div>
  );
}

function CriterionInput({ crit, value, onChange }) {
  return (
    <div className="border-t border-slate-100 first:border-t-0 py-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm text-slate-700">{crit.name}</label>
        <input
          type="number"
          min={0}
          max={PER_CRITERION_MAX}
          step={1}
          inputMode="numeric"
          className="sb-input sb-mono text-center w-20 py-1 shrink-0"
          value={value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            const v = raw === '' ? null : Math.max(0, Math.min(PER_CRITERION_MAX, Math.round(Number(raw))));
            onChange(v);
          }}
        />
      </div>
      <p className="text-xs text-slate-400 mt-0.5">{crit.hint}</p>
    </div>
  );
}

function JudgeEntryCard({ entry, config, mySlot, onScore, onHeadConfirm, categoryLabel, forceOpen }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);

  const result = computeScore(entry.scores, config.judgeCount, entry.headConfirm);
  const myMarks = entry.scores?.[mySlot] || {};
  const myDone = CRITERIA.every((c) => myMarks[c.key] !== undefined && myMarks[c.key] !== null);
  const revealOthers = myDone;

  const setMark = (key, v) => onScore(entry.id, mySlot, { ...myMarks, [key]: v });

  const isHead = mySlot === config.headJudgeSlot;
  const hasBoundary = result.flags.some((f) => f.key === 'boundary');
  const needsReview = result.flags.some((f) => ['reconcile', 'boundary', 'outlier'].includes(f.key));

  return (
    <div className={`bg-white border rounded-lg overflow-hidden ${needsReview ? 'border-amber-300' : 'border-slate-200'} ${forceOpen ? 'ring-2 ring-amber-200' : ''}`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 p-3 text-left">
        <EntryBadge number={entry.number} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 truncate">{entry.modelName}</p>
          <p className="text-xs text-slate-500 truncate">
            {entry.name} · {categoryLabel}
            {!entry.checkedIn && <span className="text-red-500 font-semibold uppercase ml-1">· Not in</span>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <TierChip tier={result.finalTier} size="sm" />
          <p className="sb-mono text-[10px] text-slate-400 mt-0.5">
            {result.n}/{result.expected} in{myDone ? ' · yours in' : ''}
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-slate-100">
          {entry.notes && <p className="text-xs bg-slate-50 rounded p-2 my-2 whitespace-pre-wrap">{entry.notes}</p>}
          <div className="mt-2">
            <ScoreMeter result={result} />
          </div>
          {result.flags.map((f) => <FlagNote key={f.key} flag={f} />)}

          {isHead && hasBoundary && (
            <div className="flex gap-2 mt-2">
              <button onClick={() => onHeadConfirm(entry.id, 'up')} className="text-xs font-semibold bg-slate-900 text-white rounded px-2.5 py-1.5">
                Move up a tier
              </button>
              <button onClick={() => onHeadConfirm(entry.id, 'hold')} className="text-xs font-semibold bg-slate-100 text-slate-700 rounded px-2.5 py-1.5">
                Hold at {result.tier.name}
              </button>
            </div>
          )}
          {isHead && entry.headConfirm && !hasBoundary && (
            <button onClick={() => onHeadConfirm(entry.id, null)} className="text-xs text-slate-400 underline mt-2">
              Undo head-judge decision
            </button>
          )}

          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-500 mb-1">Your marks — Judge {mySlot}</p>
            {CRITERIA.map((c) => (
              <CriterionInput key={c.key} crit={c} value={myMarks[c.key]} onChange={(v) => setMark(c.key, v)} />
            ))}
          </div>

          {revealOthers && result.judgeScores.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 mb-1">All judges</p>
              {result.judgeScores.map((j) => (
                <p key={j.slot} className="text-xs text-slate-600 sb-mono">Judge {j.slot}: {fmt1(j.score)}</p>
              ))}
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

function JudgeView({ config, entries, onScore, onHeadConfirm, notify }) {
  const [mySlot, setMySlot] = useState(() => {
    const saved = Number(localStorage.getItem('brushscore:judgeSlot'));
    return saved >= 1 && saved <= (config.judgeCount || 3) ? saved : 1;
  });
  useEffect(() => {
    if (mySlot > config.judgeCount) setMySlot(1);
    localStorage.setItem('brushscore:judgeSlot', String(mySlot));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySlot, config.judgeCount]);

  const [categoryId, setCategoryId] = useState('all');
  const [jump, setJump] = useState('');
  const [highlight, setHighlight] = useState(null);
  const [scanning, setScanning] = useState(false);

  const list = entries.filter((e) => categoryId === 'all' || e.categoryId === categoryId).sort((a, b) => a.number - b.number);
  const judgedCount = list.filter((e) => computeScore(e.scores, config.judgeCount, e.headConfirm).n >= Math.min(2, config.judgeCount)).length;

  const jumpToEntry = (found) => {
    if (!found) return;
    setCategoryId(found.categoryId);
    setHighlight(found.id);
    setTimeout(() => setHighlight(null), 2500);
  };

  const doJump = (e) => {
    e.preventDefault();
    const found = entries.find((en) => String(en.number) === jump.trim());
    if (found) jumpToEntry(found);
    setJump('');
  };

  const handleScan = (text) => {
    setScanning(false);
    const number = parseEntryQr(text);
    if (number == null) { notify("That code isn't a BrushScore entry.", 'error'); return; }
    const found = entries.find((en) => en.number === number);
    if (!found) { notify(`No entry found for #${number}.`, 'error'); return; }
    jumpToEntry(found);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h2 className="sb-display text-2xl mb-1">Judging</h2>
      <p className="text-slate-500 text-sm mb-3">{judgedCount} of {list.length} have a standing tier in this view</p>

      <JudgeSlotPicker config={config} slot={mySlot} onChange={setMySlot} />

      <div className="flex gap-2 mb-4">
        <select className="sb-input flex-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="all">All categories</option>
          {config.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
        {list.length === 0 && <p className="text-slate-400 text-sm text-center py-10">No entries in this category yet.</p>}
        {list.map((e) => (
          <JudgeEntryCard
            key={e.id}
            entry={e}
            config={config}
            mySlot={mySlot}
            onScore={onScore}
            onHeadConfirm={onHeadConfirm}
            categoryLabel={`${categoryName(config, e.categoryId)} · ${e.division}`}
            forceOpen={highlight === e.id}
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

function OverviewTab({ config, entries, onPublishToggle }) {
  const total = entries.length;
  const checkedIn = entries.filter((e) => e.checkedIn).length;
  const results = entries.map((e) => computeScore(e.scores, config.judgeCount, e.headConfirm));
  const judged = results.filter((r) => r.n >= Math.min(2, config.judgeCount)).length;
  const needsReview = results.filter((r) => r.flags.some((f) => ['reconcile', 'boundary', 'outlier'].includes(f.key))).length;
  const byCategory = config.categories.map((c) => ({ ...c, count: entries.filter((e) => e.categoryId === c.id).length }));
  const maxCount = Math.max(1, ...byCategory.map((c) => c.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Entries" value={total} />
        <StatCard label="Checked in" value={checkedIn} />
        <StatCard label="Judged" value={judged} />
        <StatCard label="Needs review" value={needsReview} />
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

function EntriesTab({ config, entries, onUpdateEntry, onDeleteEntry }) {
  const [q, setQ] = useState('');
  const filtered = entries
    .filter((e) => {
      const s = q.toLowerCase();
      return !s || e.name.toLowerCase().includes(s) || e.modelName.toLowerCase().includes(s) || String(e.number).includes(s);
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
          const result = computeScore(e.scores, config.judgeCount, e.headConfirm);
          return (
            <div key={e.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3 flex-wrap">
              <EntryBadge number={e.number} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">{e.modelName}</p>
                <p className="text-xs text-slate-500 truncate">{e.name}{e.contact ? ` · ${e.contact}` : ''}</p>
              </div>
              <TierChip tier={result.finalTier} size="sm" />
              <select className="sb-input text-xs w-40" value={e.categoryId} onChange={(ev) => onUpdateEntry(e.id, { categoryId: ev.target.value })}>
                {config.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="sb-input text-xs w-28" value={e.division} onChange={(ev) => onUpdateEntry(e.id, { division: ev.target.value })}>
                {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
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

function TierSummary({ config, entries }) {
  const buckets = TIERS.map((t) => ({
    t,
    list: entries
      .map((e) => ({ e, r: computeScore(e.scores, config.judgeCount, e.headConfirm) }))
      .filter((x) => x.r.score !== null && x.r.finalTier.key === t.key)
      .sort((a, b) => b.r.score - a.r.score),
  }));
  const unjudged = entries.filter((e) => computeScore(e.scores, config.judgeCount, e.headConfirm).score === null);

  return (
    <div className="space-y-4 mb-6">
      {buckets.filter((b) => b.t.key !== 'none').map((b) => (
        <div key={b.t.key}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: TIER_BAR_COLOR[b.t.key] }}>
            {b.t.name} · {b.list.length}
          </p>
          {b.list.length === 0 ? (
            <p className="text-xs text-slate-400">—</p>
          ) : (
            <ul className="space-y-0.5">
              {b.list.map(({ e, r }) => (
                <li key={e.id} className="text-sm text-slate-700 flex items-center gap-2">
                  <EntryBadgeInline number={e.number} />
                  <span className="truncate">{e.modelName}</span>
                  <span className="sb-mono text-xs text-slate-400 ml-auto">{r.score}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {unjudged.length > 0 && <p className="text-xs text-slate-400">{unjudged.length} entries still unjudged.</p>}
    </div>
  );
}

function AwardRow({ award, config, entries, onAssign }) {
  const [showAll, setShowAll] = useState(false);
  const pool = showAll ? entries : eligibleEntries(award, entries);
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

function AwardsTab({ config, entries, onAssign }) {
  return (
    <div>
      <h3 className="font-semibold text-slate-800 text-sm mb-2">Tier results</h3>
      <TierSummary config={config} entries={entries} />
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

function PrintTab({ onPrintAllTags, onPrintResults, onPrintRules }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 mb-2">
        Entry tags print two to a Letter sheet with a QR code, the model title, category, division, and the
        entrant's notes in a full-height box.
      </p>
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
        Individual tags can also be printed from the Registration Desk, and a registrant can print their own right
        after they submit.
      </p>
    </div>
  );
}

function OrganizerView({ config, entries, onUpdateConfig, onUpdateEntry, onDeleteEntry, onPublishToggle, onAssignAward, onPrintAllTags, onPrintResults, onPrintRules }) {
  const [tab, setTab] = useState('overview');
  const [editingSettings, setEditingSettings] = useState(false);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'entries', label: 'Entries', icon: Users },
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

      {tab === 'overview' && <OverviewTab config={config} entries={entries} onPublishToggle={onPublishToggle} />}
      {tab === 'entries' && <EntriesTab config={config} entries={entries} onUpdateEntry={onUpdateEntry} onDeleteEntry={onDeleteEntry} />}
      {tab === 'awards' && <AwardsTab config={config} entries={entries} onAssign={onAssignAward} />}
      {tab === 'print' && <PrintTab onPrintAllTags={onPrintAllTags} onPrintResults={onPrintResults} onPrintRules={onPrintRules} />}
      {tab === 'settings' && (
        editingSettings ? (
          <SetupWizard
            initial={config}
            isEdit
            onCancel={() => setEditingSettings(false)}
            onSave={async (cfg) => { await onUpdateConfig(cfg); setEditingSettings(false); }}
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-sm text-slate-600 mb-3">Edit show name, date, location, staff PIN, judging panel, and categories.</p>
            <button onClick={() => setEditingSettings(true)} className="text-sm font-medium text-teal-700 flex items-center gap-1">
              <Edit2 size={14} /> Edit show settings
            </button>
          </div>
        )
      )}
    </div>
  );
}

/* ---------------------------------- results ---------------------------------- */

function ResultsView({ config, entries }) {
  const results = entries.map((e) => ({ e, r: computeScore(e.scores, config.judgeCount, e.headConfirm) }));
  const tierGroups = TIERS.filter((t) => t.key !== 'none').map((t) => ({
    t,
    items: results.filter((x) => x.r.finalTier?.key === t.key).sort((a, b) => b.r.score - a.r.score),
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
        {tierGroups.map(({ t, items }) => items.length > 0 && (
          <div key={t.key}>
            <h3 className="sb-display text-lg mb-2 pb-2 border-b border-slate-200" style={{ color: TIER_BAR_COLOR[t.key] }}>
              {t.name}
            </h3>
            <div className="space-y-1.5">
              {items.map(({ e }) => (
                <div key={e.id} className="flex items-center gap-3">
                  <EntryBadgeInline number={e.number} />
                  <span className="font-medium text-slate-900">{e.modelName}</span>
                  <span className="text-slate-400 text-sm">{e.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {results.every((x) => x.r.finalTier === null) && (
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
        <span>{entry.division}</span>
        <span>{entry.name}</span>
      </div>
      <div className="tag-notes">
        <div className="lbl">Entrant notes</div>
        <div className="body">{entry.notes}</div>
      </div>
    </div>
  );
}

function ResultsSheet({ config, entries }) {
  const rows = entries
    .map((e) => ({ e, r: computeScore(e.scores, config.judgeCount, e.headConfirm) }))
    .sort((a, b) => a.e.number - b.e.number);
  return (
    <div className="printdoc">
      <h1>{config.name}</h1>
      <p>{config.date} · {config.judgeCount}-judge panel</p>
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
      <h2>Scores</h2>
      <table>
        <thead><tr><th>No.</th><th>Model</th><th>Entrant</th><th>Category</th><th>Division</th><th>Score</th><th>Tier</th></tr></thead>
        <tbody>
          {rows.map(({ e, r }) => (
            <tr key={e.id}>
              <td>{e.number}</td><td>{e.modelName}</td><td>{e.name}</td>
              <td>{categoryName(config, e.categoryId)}</td><td>{e.division}</td>
              <td>{r.score ?? '—'}</td><td>{r.finalTier ? r.finalTier.name : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RulesSheet({ config }) {
  return (
    <div className="printdoc">
      <h1>Judging rules — {config.name}</h1>
      <h2>The rubric</h2>
      <p>
        Every judge scores every entry independently on the same three criteria, 0 to 100 on each: Technical ability,
        Composition, and Difficulty. The three criteria carry equal weight. Judges do not compare notes before
        scoring, and do not see each other's marks until their own are in.
      </p>
      <h2>From marks to a tier</h2>
      <p>
        A judge score is the average of that judge's three marks. The panel score is the average of the judge
        scores, rounded to a whole number. That number is the entry's score out of 100 and it earns the tier.
      </p>
      <table>
        <thead><tr><th>Tier</th><th>Panel score</th></tr></thead>
        <tbody>
          <tr><td>Gold</td><td>86 – 100</td></tr>
          <tr><td>Silver</td><td>76 – 85</td></tr>
          <tr><td>Bronze</td><td>65 – 75</td></tr>
          <tr><td>Merit</td><td>50 – 64</td></tr>
          <tr><td>No award</td><td>below 50</td></tr>
        </tbody>
      </table>
      <h2>Three judges</h2>
      <p>
        Three scores give the panel a natural majority. One check applies: if any judge score sits more than{' '}
        {LIMITS.outlier} points from the average of the other two, the entry is flagged for the panel to look at
        again together. The flag is advisory — the tier stands unless a judge changes a mark.
      </p>
      <h2>Two judges</h2>
      <p>
        With two judges there is no majority, so disagreement is resolved rather than averaged away. If the two
        judge scores are within {LIMITS.divergence} points of each other, the result stands. If they are further
        apart, compare the sheet line by line, discuss only the criteria that differ by {LIMITS.criterionGap} or
        more, and re-mark those. Still apart afterward? The head judge scores the entry as a third judge and the
        result is computed across all three. If the panel score lands within {LIMITS.boundary} points below a tier
        line, the head judge inspects the model and either moves it up or holds it — the decision is recorded
        against the entry. A single judge score is advisory only; no tier is awarded on it.
      </p>
      <h2>Special awards</h2>
      <p>
        Tier awards are earned against the rubric — any number of entries can hold the same tier. The named and
        category awards are comparative: the panel picks one recipient each (or several, for the Capital Palette
        awards) by discussion. An entry can hold a tier award and any number of special awards at once.
      </p>
    </div>
  );
}

function PrintLayer({ job, config, entries }) {
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
  if (job.type === 'results') return <div className="print-only"><ResultsSheet config={config} entries={entries} /></div>;
  if (job.type === 'rules') return <div className="print-only"><RulesSheet config={config} /></div>;
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
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(getViewFromUrl);
  const [unlocked, setUnlocked] = useState({ desk: false, judge: false, organizer: false });
  const [toast, setToast] = useState(null);
  const [printJob, setPrintJob] = useState(null);

  const notify = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2400); };

  const refresh = useCallback(async () => {
    const cfgRaw = await safeGet('brushscore:config', true);
    const entRaw = await safeGet('brushscore:entries', true);
    setConfig(normalizeConfig(cfgRaw ? JSON.parse(cfgRaw) : null));
    setEntries((entRaw ? JSON.parse(entRaw) : []).map(normalizeEntry));
    setLoading(false);
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

  const addEntry = async (form, isWalkIn = false) => {
    const cfgRaw = await safeGet('brushscore:config', true);
    const entRaw = await safeGet('brushscore:entries', true);
    const latestConfig = cfgRaw ? normalizeConfig(JSON.parse(cfgRaw)) : config;
    const latestEntries = (entRaw ? JSON.parse(entRaw) : entries).map(normalizeEntry);
    const number = latestConfig.nextEntryNumber || latestEntries.length + 1;
    const entry = normalizeEntry({
      id: uid('entry'), number,
      name: form.name.trim(), contact: (form.contact || '').trim(),
      modelName: form.modelName.trim(), categoryId: form.categoryId, division: form.division || 'Open',
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

  const setScore = async (entryId, slot, marks) => {
    const newEntries = entries.map((e) => (e.id === entryId ? { ...e, scores: { ...e.scores, [slot]: marks } } : e));
    await saveEntriesNow(newEntries);
  };

  const setHeadConfirm = async (entryId, value) => {
    const newEntries = entries.map((e) => (e.id === entryId ? { ...e, headConfirm: value } : e));
    await saveEntriesNow(newEntries);
    notify(value === 'up' ? 'Moved up a tier.' : value === 'hold' ? 'Held at the current tier.' : 'Decision cleared.');
  };

  const assignAward = async (awardId, value) => {
    const newConfig = { ...config, specialAwards: { ...config.specialAwards, [awardId]: value } };
    await saveConfigNow(newConfig);
  };

  const deleteEntry = async (id) => {
    const newEntries = entries.filter((e) => e.id !== id);
    await saveEntriesNow(newEntries);
    notify('Entry removed.');
  };

  const publishToggle = async () => {
    const newStatus = config.status === 'published' ? 'open' : 'published';
    await saveConfigNow({ ...config, status: newStatus });
    notify(newStatus === 'published' ? 'Results published!' : 'Results unpublished.');
  };

  const printTags = (list) => {
    if (!list.length) { notify('Nothing selected to print.', 'error'); return; }
    setPrintJob({ type: 'tags', entries: list });
  };
  const printResultsSheet = () => setPrintJob({ type: 'results' });
  const printRulesSheet = () => setPrintJob({ type: 'rules' });

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
        {view === 'landing' && <Landing config={config} entries={entries} onNav={nav} />}
        {view === 'register' && <RegisterView config={config} onSubmit={(form) => addEntry(form, false)} onPrintTag={(entry) => printTags([entry])} />}
        {view === 'desk' && (
          <PinGate config={config} unlocked={unlocked.desk} onUnlock={() => setUnlocked((u) => ({ ...u, desk: true }))} label="Registration Desk">
            <DeskView config={config} entries={entries} onCheckIn={checkIn} onWalkIn={(form) => addEntry(form, true)} onPrintTags={printTags} notify={notify} />
          </PinGate>
        )}
        {view === 'judge' && (
          <PinGate config={config} unlocked={unlocked.judge} onUnlock={() => setUnlocked((u) => ({ ...u, judge: true }))} label="Judging">
            <JudgeView config={config} entries={entries} onScore={setScore} onHeadConfirm={setHeadConfirm} notify={notify} />
          </PinGate>
        )}
        {view === 'organizer' && (
          <PinGate config={config} unlocked={unlocked.organizer} onUnlock={() => setUnlocked((u) => ({ ...u, organizer: true }))} label="Organizer">
            <OrganizerView
              config={config}
              entries={entries}
              onUpdateConfig={(cfg) => saveConfigNow(normalizeConfig(cfg))}
              onUpdateEntry={updateEntry}
              onDeleteEntry={deleteEntry}
              onPublishToggle={publishToggle}
              onAssignAward={assignAward}
              onPrintAllTags={() => printTags(entries)}
              onPrintResults={printResultsSheet}
              onPrintRules={printRulesSheet}
            />
          </PinGate>
        )}
        {view === 'results' && <ResultsView config={config} entries={entries} />}
        <Toast message={toast?.msg} type={toast?.type} />
      </div>
      <PrintLayer job={printJob} config={config} entries={entries} />
    </>
  );
}
