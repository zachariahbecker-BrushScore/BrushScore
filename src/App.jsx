import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserPlus, ClipboardCheck, ListChecks, Settings, Trophy, ArrowLeft,
  Search, Plus, Trash2, Check, Lock, Edit2, Save, Loader2, BarChart3, Users,
  QrCode, X,
} from 'lucide-react';

/* ---------------------------------- data ---------------------------------- */

const AWARD_OPTIONS = [
  { value: '', label: 'No award' },
  { value: 'Merit', label: 'Merit' },
  { value: 'Bronze', label: 'Bronze' },
  { value: 'Silver', label: 'Silver' },
  { value: 'Gold', label: 'Gold' },
  { value: 'best_class', label: 'Best in Class' },
  { value: 'best_category', label: "People's Choice" },
  { value: 'best_show', label: 'Best in Show' },
];

const DEFAULT_CATEGORIES = [
  { name: 'Junior (under 18 years only)' },
  { name: 'Historical Painters' },
  { name: 'Historical Open' },
  { name: 'Fantasy/Sci-Fi Painters' },
  { name: 'Fantasy/Sci-Fi Open' },
  { name: 'Flats' },
  { name: 'Wargame' },
  { name: 'Ordnance', classes: ['Ordnance/Armor/Military Vehicles', 'Maritime/Ships', 'Aircraft', 'Civilian Vehicles'] },
  { name: 'Gundam Painters' },
  { name: 'Gundam Open' },
  { name: 'Diorama' }
];

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function pad(n) { return String(n).padStart(3, '0'); }
function categoryName(config, id) { return config.categories.find((c) => c.id === id)?.name || '—'; }
function awardLabel(v) { return AWARD_OPTIONS.find((a) => a.value === v)?.label || v; }
function awardRank(v) { const order = ['best_category', 'Gold', 'Silver', 'third', 'Bronze', 'Merit']; const i = order.indexOf(v); return i === -1 ? 99 : i; }

async function safeGet(key, shared) {
  try {
    const res = await window.storage.get(key, shared);
    return res ? res.value : null;
  } catch (e) {
    return null;
  }
}

/* ---------------------------------- QR codes ---------------------------------- */

const JSQR_SRC = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

function qrCodeUrl(data, size = 180) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(data)}`;
}
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
        <RoleCard icon={ClipboardCheck} title="Registration Desk" desc="Check in entries, add walk-ins." onClick={() => onNav('desk')} accent="teal" />
        <RoleCard icon={ListChecks} title="Judging" desc="Score entries and assign awards." onClick={() => onNav('judge')} accent="teal" />
        <RoleCard icon={Settings} title="Organizer Console" desc="Categories, stats, and results." onClick={() => onNav('organizer')} accent="teal" />
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
  const [categories, setCategories] = useState(
    initial?.categories?.length ? initial.categories : DEFAULT_CATEGORIES.map((c) => ({ ...c, id: uid('cat') }))
  );
  const [saving, setSaving] = useState(false);

  const updateCat = (idx, field, value) => setCategories((cs) => cs.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  const updateClasses = (idx, value) => updateCat(idx, 'classes', value.split(',').map((s) => s.trim()).filter(Boolean));
  const addCat = () => setCategories((cs) => [...cs, { id: uid('cat'), name: '', classes: [] }]);
  const removeCat = (idx) => setCategories((cs) => cs.filter((_, i) => i !== idx));

  const canSave = name.trim() && adminPin.trim().length >= 4 && categories.some((c) => c.name.trim());

  const submit = async () => {
    setSaving(true);
    await onSave({
      name: name.trim(),
      date,
      location: location.trim(),
      adminPin: adminPin.trim(),
      categories: categories.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim(), classes: c.classes.filter(Boolean) })),
      status: initial?.status || 'open',
      nextEntryNumber: initial?.nextEntryNumber || 1,
    });
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h2 className="sb-display text-2xl mb-1">{isEdit ? 'Show Settings' : 'Set Up Your Show'}</h2>
      <p className="text-slate-500 text-sm mb-6">
        {isEdit ? 'Update your show details and categories.' : "Let's get your categories and classes set before entries open."}
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
        <Field label="Staff PIN (shared with judges &amp; desk staff)">
          <input value={adminPin} onChange={(e) => setAdminPin(e.target.value)} className="sb-input sb-mono" placeholder="1234" />
        </Field>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">Categories &amp; classes</h3>
        <button onClick={addCat} className="text-sm flex items-center gap-1 text-teal-700 hover:text-teal-800 font-medium">
          <Plus size={15} /> Add category
        </button>
      </div>
      <div className="space-y-3 mb-6">
        {categories.map((c, idx) => (
          <div key={c.id} className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-2">
                <input value={c.name} onChange={(e) => updateCat(idx, 'name', e.target.value)} className="sb-input" placeholder="Category name (e.g. Armor &amp; Military Vehicles)" />
                <input value={c.classes.join(', ')} onChange={(e) => updateClasses(idx, e.target.value)} className="sb-input text-sm" placeholder="Classes, comma separated (e.g. 1/72, 1/48, 1/35)" />
              </div>
              <button onClick={() => removeCat(idx)} aria-label="Remove category" className="p-2 text-slate-400 hover:text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
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

function RegisterView({ config, onSubmit }) {
  const firstCat = config.categories[0];
  const [form, setForm] = useState({
    name: '', contact: '', modelName: '',
    categoryId: firstCat?.id || '', className: firstCat?.classes?.[0] || '', notes: '',
  });
  const [confirmed, setConfirmed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const category = config.categories.find((c) => c.id === form.categoryId);

  useEffect(() => {
    if (category && !category.classes.includes(form.className)) {
      setForm((f) => ({ ...f, className: category.classes[0] || '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.categoryId]);

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
        <div className="flex justify-center mb-2">
          <img
            src={qrCodeUrl(entryQrPayload(confirmed.number))}
            alt={`QR code for entry ${pad(confirmed.number)}`}
            width={160}
            height={160}
            className="rounded-lg border border-slate-200"
          />
        </div>
        <p className="text-slate-400 text-xs mb-6">Screenshot this or ask staff to print it for your model.</p>
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
      {category?.classes?.length > 0 && (
        <Field label="Class">
          <select className="sb-input" value={form.className} onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))}>
            {category.classes.map((cl) => <option key={cl} value={cl}>{cl}</option>)}
          </select>
        </Field>
      )}
      <Field label="Notes">
        <textarea className="sb-input" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Anything judges should know (optional)" />
      </Field>
      {err && <p className="text-red-600 text-sm" role="alert">{err}</p>}
      <button disabled={!canSubmit || saving} className="w-full bg-amber-500 disabled:opacity-40 hover:bg-amber-400 text-slate-900 font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2">
        {saving ? <Loader2 size={16} className="animate-spin" /> : null} Submit entry
      </button>
    </form>
  );
}

function DeskView({ config, entries, onCheckIn, onWalkIn, notify }) {
  const [q, setQ] = useState('');
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [scanning, setScanning] = useState(false);

  const filtered = entries
    .filter((e) => {
      const s = q.toLowerCase();
      return !s || e.name.toLowerCase().includes(s) || String(e.number).includes(s) || e.modelName.toLowerCase().includes(s);
    })
    .sort((a, b) => a.number - b.number);

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
        <RegisterView config={config} onSubmit={(form) => onWalkIn(form)} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="sb-display text-2xl">Registration Desk</h2>
        <div className="flex gap-2">
          <button onClick={() => setScanning(true)} className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3 py-2 rounded-lg">
            <QrCode size={15} /> Scan
          </button>
          <button onClick={() => setShowWalkIn(true)} className="flex items-center gap-1.5 bg-slate-900 text-white text-sm font-medium px-3 py-2 rounded-lg">
            <Plus size={15} /> Walk-in
          </button>
        </div>
      </div>
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="sb-input pl-9" placeholder="Search name, entry #, or model" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-slate-400 text-sm text-center py-10">No entries found.</p>}
        {filtered.map((e) => (
          <div key={e.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3">
            <EntryBadge number={e.number} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 truncate">{e.modelName}</p>
              <p className="text-xs text-slate-500 truncate">{e.name} · {categoryName(config, e.categoryId)}{e.className ? ` · ${e.className}` : ''}</p>
            </div>
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

function JudgeView({ config, entries, onAward, notify }) {
  const [categoryId, setCategoryId] = useState('all');
  const [jump, setJump] = useState('');
  const [highlight, setHighlight] = useState(null);
  const [scanning, setScanning] = useState(false);

  const list = entries.filter((e) => categoryId === 'all' || e.categoryId === categoryId).sort((a, b) => a.number - b.number);
  const judgedCount = list.filter((e) => e.award).length;

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
      <p className="text-slate-500 text-sm mb-4">{judgedCount} of {list.length} judged in this view</p>

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
          <QrCode size={16} />
        </button>
      </div>

      <div className="space-y-2">
        {list.length === 0 && <p className="text-slate-400 text-sm text-center py-10">No entries in this category yet.</p>}
        {list.map((e) => (
          <div key={e.id} className={`bg-white border rounded-lg p-3 transition ${highlight === e.id ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3 mb-2">
              <EntryBadge number={e.number} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">{e.modelName}</p>
                <p className="text-xs text-slate-500 truncate">{e.name} · {e.className || categoryName(config, e.categoryId)}</p>
              </div>
              {!e.checkedIn && <span className="text-xs uppercase tracking-wide text-red-500 font-semibold">Not in</span>}
            </div>
            <select className="sb-input text-sm" value={e.award || ''} onChange={(ev) => onAward(e.id, ev.target.value)}>
              {AWARD_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
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

function OverviewTab({ config, entries, onPublishToggle }) {
  const total = entries.length;
  const checkedIn = entries.filter((e) => e.checkedIn).length;
  const judged = entries.filter((e) => e.award).length;
  const byCategory = config.categories.map((c) => ({ ...c, count: entries.filter((e) => e.categoryId === c.id).length }));
  const maxCount = Math.max(1, ...byCategory.map((c) => c.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Entries" value={total} />
        <StatCard label="Checked in" value={checkedIn} />
        <StatCard label="Judged" value={judged} />
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
        {filtered.map((e) => (
          <div key={e.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3">
            <EntryBadge number={e.number} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 truncate">{e.modelName}</p>
              <p className="text-xs text-slate-500 truncate">{e.name}{e.contact ? ` · ${e.contact}` : ''}</p>
            </div>
            <select className="sb-input text-xs w-40" value={e.categoryId} onChange={(ev) => onUpdateEntry(e.id, { categoryId: ev.target.value })}>
              {config.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => onDeleteEntry(e.id)} aria-label="Delete entry" className="p-2 text-slate-400 hover:text-red-600">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-slate-400 text-sm text-center py-10">No entries yet.</p>}
      </div>
    </div>
  );
}

function AwardsTab({ config, entries }) {
  const bestInShow = entries.filter((e) => e.award === 'best_show');
  const others = entries.filter((e) => e.award && e.award !== 'best_show');
  const grouped = config.categories
    .map((c) => ({ ...c, items: others.filter((e) => e.categoryId === c.id).sort((a, b) => awardRank(a.award) - awardRank(b.award)) }))
    .filter((c) => c.items.length > 0);

  return (
    <div className="space-y-6">
      {bestInShow.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1"><Trophy size={13} /> Best in Show</p>
          {bestInShow.map((e) => (
            <p key={e.id} className="text-slate-800"><EntryBadgeInline number={e.number} /> {e.modelName} — <span className="text-slate-500">{e.name}</span></p>
          ))}
        </div>
      )}
      {grouped.length === 0 && bestInShow.length === 0 && <p className="text-slate-400 text-sm text-center py-10">No awards assigned yet.</p>}
      {grouped.map((c) => (
        <div key={c.id}>
          <h3 className="font-semibold text-slate-800 text-sm mb-2">{c.name}</h3>
          <div className="space-y-1.5">
            {c.items.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-amber-600 w-32 shrink-0">{awardLabel(e.award)}</span>
                <span className="sb-mono text-xs text-slate-400">#{pad(e.number)}</span>
                <span className="text-slate-800 truncate">{e.modelName}</span>
                <span className="text-slate-400 truncate">— {e.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OrganizerView({ config, entries, onUpdateConfig, onUpdateEntry, onDeleteEntry, onPublishToggle }) {
  const [tab, setTab] = useState('overview');
  const [editingSettings, setEditingSettings] = useState(false);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'entries', label: 'Entries', icon: Users },
    { id: 'awards', label: 'Awards', icon: Trophy },
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
      {tab === 'awards' && <AwardsTab config={config} entries={entries} />}
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
            <p className="text-sm text-slate-600 mb-3">Edit show name, date, location, staff PIN, and categories.</p>
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
  const bestInShow = entries.filter((e) => e.award === 'best_show');
  const grouped = config.categories
    .map((c) => ({
      ...c,
      items: entries.filter((e) => e.categoryId === c.id && e.award && e.award !== 'best_show').sort((a, b) => awardRank(a.award) - awardRank(b.award)),
    }))
    .filter((c) => c.items.length > 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <Trophy className="mx-auto text-amber-500 mb-2" size={32} />
        <h2 className="sb-display text-3xl">{config.name}</h2>
        <p className="text-slate-500 text-sm">Results</p>
      </div>
      {bestInShow.map((e) => (
        <div key={e.id} className="bg-slate-900 text-white rounded-xl p-6 text-center mb-8">
          <p className="text-amber-400 text-xs uppercase tracking-widest font-semibold mb-2">Best in Show</p>
          <p className="sb-display text-2xl">{e.modelName}</p>
          <p className="text-slate-300 text-sm mt-1">{e.name} · #{pad(e.number)}</p>
        </div>
      ))}
      <div className="space-y-8">
        {grouped.map((c) => (
          <div key={c.id}>
            <h3 className="sb-display text-lg text-slate-800 mb-3 pb-2 border-b border-slate-200">{c.name}</h3>
            <div className="space-y-2">
              {c.items.map((e) => (
                <div key={e.id} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-amber-600 w-32 shrink-0">{awardLabel(e.award)}</span>
                  <span className="font-medium text-slate-900">{e.modelName}</span>
                  <span className="text-slate-400 text-sm">{e.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 && bestInShow.length === 0 && <p className="text-slate-400 text-center py-10">Awards will appear here once published.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------ app ------------------------------------ */

function viewTitle(v) {
  return { register: 'Register', desk: 'Registration Desk', judge: 'Judging', organizer: 'Organizer Console', results: 'Results' }[v] || '';
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('landing');
  const [unlocked, setUnlocked] = useState({ desk: false, judge: false, organizer: false });
  const [toast, setToast] = useState(null);

  const notify = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2400); };

  const refresh = useCallback(async () => {
    const cfgRaw = await safeGet('brushscore:config', true);
    const entRaw = await safeGet('brushscore:entries', true);
    setConfig(cfgRaw ? JSON.parse(cfgRaw) : null);
    setEntries(entRaw ? JSON.parse(entRaw) : []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
    const latestConfig = cfgRaw ? JSON.parse(cfgRaw) : config;
    const latestEntries = entRaw ? JSON.parse(entRaw) : entries;
    const number = latestConfig.nextEntryNumber || latestEntries.length + 1;
    const entry = {
      id: uid('entry'), number,
      name: form.name.trim(), contact: (form.contact || '').trim(),
      modelName: form.modelName.trim(), categoryId: form.categoryId, className: form.className || '',
      notes: (form.notes || '').trim(),
      checkedIn: isWalkIn, checkedInAt: isWalkIn ? new Date().toISOString() : null,
      award: '', judgeNotes: '', judgedAt: null,
      registeredAt: new Date().toISOString(),
    };
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

  const assignAward = async (id, award) => {
    await updateEntry(id, { award, judgedAt: award ? new Date().toISOString() : null });
    notify(award ? 'Award saved.' : 'Award cleared.');
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

  const nav = (v) => setView(v);

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
          <SetupWizard onSave={async (cfg) => { await saveConfigNow(cfg); await saveEntriesNow([]); }} />
        </div>
      </>
    );
  }

  return (
    <>
      <GlobalStyles />
      <div className="min-h-screen bg-slate-50 sb-root">
        {view !== 'landing' && <TopBar title={viewTitle(view)} onBack={() => nav('landing')} />}
        {view === 'landing' && <Landing config={config} entries={entries} onNav={nav} />}
        {view === 'register' && <RegisterView config={config} onSubmit={(form) => addEntry(form, false)} />}
        {view === 'desk' && (
          <PinGate config={config} unlocked={unlocked.desk} onUnlock={() => setUnlocked((u) => ({ ...u, desk: true }))} label="Registration Desk">
            <DeskView config={config} entries={entries} onCheckIn={checkIn} onWalkIn={(form) => addEntry(form, true)} notify={notify} />
          </PinGate>
        )}
        {view === 'judge' && (
          <PinGate config={config} unlocked={unlocked.judge} onUnlock={() => setUnlocked((u) => ({ ...u, judge: true }))} label="Judging">
            <JudgeView config={config} entries={entries} onAward={assignAward} notify={notify} />
          </PinGate>
        )}
        {view === 'organizer' && (
          <PinGate config={config} unlocked={unlocked.organizer} onUnlock={() => setUnlocked((u) => ({ ...u, organizer: true }))} label="Organizer">
            <OrganizerView
              config={config}
              entries={entries}
              onUpdateConfig={saveConfigNow}
              onUpdateEntry={updateEntry}
              onDeleteEntry={deleteEntry}
              onPublishToggle={publishToggle}
            />
          </PinGate>
        )}
        {view === 'results' && <ResultsView config={config} entries={entries} />}
        <Toast message={toast?.msg} type={toast?.type} />
      </div>
    </>
  );
}
