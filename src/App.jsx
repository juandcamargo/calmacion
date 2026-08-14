import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Flame, Sparkles, Sun, Zap, X, Trash2, Award, ChevronRight, ChevronLeft,
  MapPin, Clock, CheckCircle2, Info, BarChart3, Lock,
  Settings, Download, Upload, AlertTriangle, Loader2,
  Home, ListTree, Plus, LifeBuoy, Filter, Pencil, LogOut, Siren,
  Heart, Briefcase, Users, Baby, CalendarDays,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { C, MonkMark } from "./theme.jsx";
import Auth from "./Auth.jsx";

const WHO_OPTIONS = ["Jen", "Trabajo", "Otros", "Salvador"];
const DISPLAY_WHO = { Jen: "Con Jen", Trabajo: "Por el Trabajo", Otros: "Por Otros", Salvador: "Con Salvador" };
const WHO_ICONS = { Jen: Heart, Trabajo: Briefcase, Otros: Users, Salvador: Baby };
const WEEKDAY_LETTERS = ["D", "L", "M", "X", "J", "V", "S"]; // index = Date#getDay(), 0 = Sunday
const FAULT_OPTIONS = ["Mía", "De la otra persona", "Compartida"];
const RESOLUTION_OPTIONS = ["Se disculparon conmigo", "Me disculpé", "Lo superé"];
const TOOL_OPTIONS = ["Sándwich", "Tiempo Fuera", "Otro", "Sin herramientas"];

const LEVELS = [
  { name: "Aprendiz", days: 0 },
  { name: "Buscador", days: 3 },
  { name: "Practicante", days: 7 },
  { name: "Contemplativo", days: 14 },
  { name: "Sereno", days: 21 },
  { name: "Ecuánime", days: 30 },
  { name: "Centrado", days: 45 },
  { name: "Maestro de Sí", days: 60 },
  { name: "Sabio", days: 90 },
  { name: "Iluminado", days: 120 },
  { name: "Monje Tibetano", days: 180 },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

/* ---------------- helpers ---------------- */

function toLocalInputValue(date) {
  const d = new Date(date);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function msBetween(a, b) { return Math.max(0, new Date(b) - new Date(a)); }
function formatDHM(ms) {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days === 0 && hours === 0) return `${mins} min`;
  if (days === 0) return `${hours} h ${mins} min`;
  return `${days} d ${hours} h`;
}
function formatAgo(ms) {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days === 0 && hours === 0) return mins <= 1 ? "hace un momento" : `hace ${mins} min`;
  if (days === 0) return `hace ${hours} h ${mins} min`;
  return `hace ${days} d ${hours} h`;
}
function formatDate(iso) { return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }); }
function formatShortDate(iso) { return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" }); }
function formatTime(iso) { return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }); }
function dayLabel(iso) {
  const d = new Date(iso), now = new Date();
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return "Hoy";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Ayer";
  return formatDate(iso);
}
function lerpColor(hexA, hexB, t) {
  const a = hexA.match(/\w\w/g).map((x) => parseInt(x, 16));
  const b = hexB.match(/\w\w/g).map((x) => parseInt(x, 16));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function whoDisplay(who, detail) {
  if ((who === "Trabajo" || who === "Otros") && detail) return `${who} · ${detail}`;
  return who;
}
function periodOfHour(h) {
  if (h < 6) return "Madrugada";
  if (h < 12) return "Mañana";
  if (h < 18) return "Tarde";
  return "Noche";
}
function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ---------------- day coloring (home strip + calendar) ----------------
   When a day has more than one entry type, the "worst" one wins so the
   color stays a fast, at-a-glance signal: an angry day should read as
   angry even if something happy also happened that day. */
const DAY_COLOR_PRIORITY = ["episode", "trigger", "falsealarm", "joy"];
function sameLocalDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
function entriesForDay(entries, day) {
  return entries.filter((e) => sameLocalDay(e.date, day));
}
function dominantEntryType(dayEntries) {
  for (const t of DAY_COLOR_PRIORITY) if (dayEntries.some((e) => e.type === t)) return t;
  return null;
}

/* ---------------- Supabase row <-> entry mapping ----------------
   Each entry type (episode/eq/trigger/joy) has different fields, so
   everything except id/type/date is kept together in a single jsonb
   "data" column instead of modeling every field as its own column. */
function entryToRow(entry, userId) {
  const { id, type, date, ...rest } = entry;
  return { id, user_id: userId, type, date, data: rest };
}
function rowToEntry(row) {
  return { ...row.data, id: row.id, type: row.type, date: row.date };
}

/* ---------------- gamification ---------------- */

function levelInfo(days) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (days >= LEVELS[i].days) idx = i;
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1];
  const progress = next ? (days - cur.days) / (next.days - cur.days) : 1;
  return { level: idx + 1, name: cur.name, days, nextName: next ? next.name : null, nextDays: next ? next.days : null, progress: Math.min(1, Math.max(0, progress)) };
}

function useCountUp(value, duration = 700) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion()) { setDisplay(value); prevRef.current = value; return; }
    const from = prevRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    let raf;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

/* ---------------- face avatar (doubles as level avatar) ---------------- */

function CalmFace({ days }) {
  const maxDays = LEVELS[LEVELS.length - 1].days;
  const raw = Math.min(Math.max(days / maxDays, 0), 1);
  // Eased, not linear: happiness should be visible after days, not just
  // near the 180-day finish line. t=0 is calm/at-peace (never stern), and
  // most of the joyful growth happens in the first few weeks.
  const t = Math.pow(raw, 0.45);
  const bg = lerpColor("#C9D4CD", C.accent, t);
  const browRotate = 4 - t * 20;
  const mouthCurve = 10 + t * 32;
  const eyeHappy = Math.min(Math.max((t - 0.35) / 0.45, 0), 1);
  const blush = Math.min(Math.max((t - 0.15) * 1.3, 0), 1);
  return (
    <svg viewBox="0 0 160 160" className="w-full h-full breathing">
      <circle cx="80" cy="80" r="72" fill={bg} />
      <ellipse cx="46" cy="96" rx="10" ry="6" fill="#fff" opacity={blush * 0.45} />
      <ellipse cx="114" cy="96" rx="10" ry="6" fill="#fff" opacity={blush * 0.45} />
      <line x1="46" y1="66" x2="66" y2="66" stroke="#fff" strokeWidth="4" strokeLinecap="round" transform={`rotate(${browRotate} 56 66)`} opacity="0.9" />
      <line x1="94" y1="66" x2="114" y2="66" stroke="#fff" strokeWidth="4" strokeLinecap="round" transform={`rotate(${-browRotate} 104 66)`} opacity="0.9" />
      <circle cx="58" cy="82" r="6" fill="#fff" opacity={1 - eyeHappy} />
      <circle cx="102" cy="82" r="6" fill="#fff" opacity={1 - eyeHappy} />
      <path d="M 50 84 Q 58 74 66 84" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity={eyeHappy} />
      <path d="M 94 84 Q 102 74 110 84" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity={eyeHappy} />
      <path d={`M 54 106 Q 80 ${106 + mouthCurve} 106 106`} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.95" />
    </svg>
  );
}

/* ---------------- confetti ---------------- */

function Confetti() {
  const [pieces] = useState(() => {
    if (prefersReducedMotion()) return [];
    const colors = [C.accent, C.eq, C.joy, C.trigger, C.episode];
    return Array.from({ length: 26 }).map((_, i) => ({
      id: i,
      dx: (Math.random() - 0.5) * 260,
      dy: -(Math.random() * 180 + 60),
      rot: (Math.random() - 0.5) * 480,
      delay: Math.random() * 120,
      bg: colors[i % colors.length],
      size: 6 + Math.random() * 5,
    }));
  });
  return (
    <div style={{ position: "absolute", top: "38%", left: "50%", width: 0, height: 0, pointerEvents: "none" }}>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute", width: p.size, height: p.size * 0.5, background: p.bg, borderRadius: 2,
            animation: `confettiBurst 900ms cubic-bezier(0.16,1,0.3,1) ${p.delay}ms forwards`,
            "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--rot": `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- atoms ---------------- */

function Chip({ label, active, onClick, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-4 py-2 rounded-full text-xs font-bold chip-hover${active ? " chip-pop" : ""}`}
      style={{
        background: active ? (color || C.accent) : C.surfaceMuted,
        color: active ? "#fff" : C.inkSoft,
        border: `1px solid ${active ? (color || C.accent) : C.border}`,
        minHeight: 36,
      }}
    >
      {label}
    </button>
  );
}
function Field({ label, children }) {
  return (
    <label className="mb-4 block">
      <span className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: C.inkSoft }}>{label}</span>
      {children}
    </label>
  );
}
const inputStyle = { border: `1px solid ${C.border}`, color: C.ink, background: C.surfaceMuted, borderRadius: 14 };

function SaveButton({ onClick, disabled, saving, color, children }) {
  return (
    <button
      disabled={disabled || saving}
      onClick={onClick}
      className="w-full rounded-full py-3.5 text-sm font-extrabold mt-2 flex items-center justify-center gap-2"
      style={{ background: disabled || saving ? C.border : color, color: disabled || saving ? C.inkFaint : "#fff", minHeight: 50, cursor: disabled || saving ? "not-allowed" : "pointer" }}
    >
      {saving && <Loader2 size={15} className="spin" />}
      {children}
    </button>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <div className="mb-6">
      {title && <h3 className="font-display text-sm font-extrabold mb-2 flex items-center gap-1.5" style={{ color: C.ink }}>{icon}{title}</h3>}
      <div className="rounded-[22px] p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>{children}</div>
    </div>
  );
}

/* ---------------- day chip (home strip + calendar) ---------------- */

function DayChip({ date, type, onClick, muted, size = 38 }) {
  const colorMap = { episode: C.episode, trigger: C.trigger, falsealarm: C.falsealarm, joy: C.joy };
  const color = type ? colorMap[type] : null;
  const dayNum = new Date(date).getDate();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="rounded-full flex items-center justify-center font-display font-extrabold shrink-0"
      style={{
        width: size, height: size,
        background: color || C.surfaceMuted,
        color: color ? "#fff" : muted ? C.inkFaint : C.inkSoft,
        border: color ? "none" : `1px dashed ${C.border}`,
        fontSize: size < 36 ? 11 : 13,
        opacity: muted ? 0.45 : 1,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {dayNum}
    </button>
  );
}

/* ---------------- root: auth gate ---------------- */

export default function AppRoot() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh" }} className="flex items-center justify-center p-8">
        <p style={{ color: C.inkSoft }}>Cargando…</p>
      </div>
    );
  }
  if (!session) return <Auth />;
  return <Calma session={session} />;
}

/* ---------------- main app ---------------- */

function Calma({ session }) {
  const userId = session.user.id;
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [lastSeenLevel, setLastSeenLevel] = useState(null);
  const [tab, setTab] = useState("home");
  const [modal, setModal] = useState(null);
  const [dayDetail, setDayDetail] = useState(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [catalizador, setCatalizador] = useState(false);
  const [levelUp, setLevelUp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("todos");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: entryRows, error: entriesError }, { data: profileRow, error: profileError }] = await Promise.all([
          supabase.from("entries").select("*").eq("user_id", userId),
          supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        ]);
        if (entriesError) throw entriesError;
        if (profileError) throw profileError;

        let profile = profileRow;
        if (!profile) {
          const { data: inserted, error: insertError } = await supabase
            .from("profiles")
            .insert({ user_id: userId, start_date: new Date().toISOString(), last_seen_level: 1 })
            .select()
            .single();
          if (insertError) throw insertError;
          profile = inserted;
        }
        if (cancelled) return;
        setEntries((entryRows || []).map(rowToEntry));
        setStartDate(profile.start_date);
        setLastSeenLevel(profile.last_seen_level);
      } catch (e) {
        if (!cancelled) setError("No se pudo cargar tu bitácora.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function addEntry(entry) {
    setSaving(true);
    try {
      const row = entryToRow(entry, userId);
      const { error: insertError } = await supabase.from("entries").insert(row);
      if (insertError) throw insertError;
      setEntries((prev) => [...prev, entry]);
      setModal(null);
    } catch (e) { setError("No se pudo guardar. Intenta de nuevo."); }
    finally { setSaving(false); }
  }
  async function updateEntry(id, patch) {
    setSaving(true);
    try {
      const row = entryToRow(patch, userId);
      const { error: updateError } = await supabase
        .from("entries")
        .update({ type: row.type, date: row.date, data: row.data })
        .eq("id", id)
        .eq("user_id", userId);
      if (updateError) throw updateError;
      setEntries((prev) => prev.map((e) => (e.id === id ? patch : e)));
      setModal(null);
    } catch (e) { setError("No se pudo actualizar el registro."); }
    finally { setSaving(false); }
  }
  async function closeEpisode(id, closure) {
    setSaving(true);
    try {
      const current = entries.find((e) => e.id === id);
      const updated = { ...current, closed: true, closure };
      const row = entryToRow(updated, userId);
      const { error: updateError } = await supabase.from("entries").update({ data: row.data }).eq("id", id).eq("user_id", userId);
      if (updateError) throw updateError;
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
      setModal(null);
    } catch (e) { setError("No se pudo cerrar el episodio."); }
    finally { setSaving(false); }
  }
  async function deleteEntry(id) {
    try {
      const { error: deleteError } = await supabase.from("entries").delete().eq("id", id).eq("user_id", userId);
      if (deleteError) throw deleteError;
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) { setError("No se pudo eliminar."); }
  }
  function exportData() {
    const payload = { app: "Calmación", exportedAt: new Date().toISOString(), startDate, entries };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `calmacion-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }
  async function importData(payload, mode) {
    setSaving(true);
    try {
      if (!payload || !Array.isArray(payload.entries)) throw new Error("formato inválido");
      if (mode === "replace") {
        const { error: delError } = await supabase.from("entries").delete().eq("user_id", userId);
        if (delError) throw delError;
        const rows = payload.entries.map((e) => entryToRow(e, userId));
        if (rows.length) {
          const { error: insError } = await supabase.from("entries").insert(rows);
          if (insError) throw insError;
        }
        setEntries(payload.entries);
        if (payload.startDate) {
          const { error: profError } = await supabase.from("profiles").update({ start_date: payload.startDate }).eq("user_id", userId);
          if (profError) throw profError;
          setStartDate(payload.startDate);
        }
      } else {
        const existingIds = new Set(entries.map((e) => e.id));
        const toInsert = payload.entries.filter((imp) => !existingIds.has(imp.id));
        const rows = toInsert.map((e) => entryToRow(e, userId));
        if (rows.length) {
          const { error: insError } = await supabase.from("entries").insert(rows);
          if (insError) throw insError;
        }
        setEntries((prev) => [...prev, ...toInsert]);
      }
      setError(null);
    } catch (e) { setError("El archivo no tiene un formato válido de respaldo de Calmación."); }
    finally { setSaving(false); }
  }
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const episodes = useMemo(() => entries.filter((e) => e.type === "episode"), [entries]);
  const eqs = useMemo(() => entries.filter((e) => e.type === "eq"), [entries]);
  const joys = useMemo(() => entries.filter((e) => e.type === "joy"), [entries]);
  const triggers = useMemo(() => entries.filter((e) => e.type === "trigger"), [entries]);
  const falseAlarms = useMemo(() => entries.filter((e) => e.type === "falsealarm"), [entries]);
  const openEpisodes = useMemo(() => episodes.filter((e) => !e.closed), [episodes]);
  const now = new Date();

  const lastByWho = (who) => episodes.filter((e) => e.who === who).sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
  const lastOverallEpisode = useMemo(() => [...episodes].sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null, [episodes]);
  const overallCalmMs = msBetween(lastOverallEpisode ? lastOverallEpisode.date : startDate, now);
  const overallCalmDays = Math.floor(overallCalmMs / 86400000);
  const personStreak = (who) => msBetween((lastByWho(who) || {}).date || startDate, now);

  const gaps = useMemo(() => {
    if (!startDate) return [];
    const marks = [{ date: new Date(startDate) }, ...episodes.map((e) => ({ date: new Date(e.date) })).sort((a, b) => a.date - b.date)];
    const result = [];
    for (let i = 1; i < marks.length; i++) result.push({ days: Math.floor((marks[i].date - marks[i - 1].date) / 86400000), from: marks[i - 1].date, to: marks[i].date, ongoing: false });
    result.push({ days: Math.floor((now - marks[marks.length - 1].date) / 86400000), from: marks[marks.length - 1].date, to: now, ongoing: true });
    return result;
  }, [startDate, episodes]);
  const maxGapDays = useMemo(() => Math.max(0, ...gaps.map((g) => g.days)), [gaps]);
  const topGaps = useMemo(() => [...gaps].sort((a, b) => b.days - a.days).slice(0, 5), [gaps]);

  const calmMilestonesAchieved = LEVELS.filter((l) => l.days > 0 && maxGapDays >= l.days).map((l) => l.days);
  const nextCalmMilestone = LEVELS.find((l) => l.days > 0 && maxGapDays < l.days);
  const eqMilestonesAchieved = Math.floor(eqs.length / 5);
  const falseAlarmMilestonesAchieved = Math.floor(falseAlarms.length / 5);

  const lvl = useMemo(() => levelInfo(overallCalmDays), [overallCalmDays]);

  useEffect(() => {
    if (loading || lastSeenLevel === null) return;
    if (lvl.level > lastSeenLevel) {
      setLevelUp(lvl);
      supabase.from("profiles").update({ last_seen_level: lvl.level }).eq("user_id", userId).then(() => {});
      setLastSeenLevel(lvl.level);
    } else if (lvl.level !== lastSeenLevel) {
      supabase.from("profiles").update({ last_seen_level: lvl.level }).eq("user_id", userId).then(() => {});
      setLastSeenLevel(lvl.level);
    }
  }, [lvl.level, loading, lastSeenLevel, userId]);

  const eq7 = eqs.filter((e) => msBetween(e.date, now) <= 7 * 86400000).length;
  const eq30 = eqs.filter((e) => msBetween(e.date, now) <= 30 * 86400000).length;

  const timeline = useMemo(() => [...entries].sort((a, b) => new Date(b.date) - new Date(a.date)), [entries]);
  const filteredTimeline = useMemo(() => filter === "todos" ? timeline : timeline.filter((e) => e.type === filter), [timeline, filter]);
  const grouped = useMemo(() => {
    const map = {};
    filteredTimeline.forEach((e) => { const l = dayLabel(e.date); (map[l] = map[l] || []).push(e); });
    return map;
  }, [filteredTimeline]);

  if (loading) {
    return <div style={{ background: C.bg, minHeight: "100vh" }} className="flex items-center justify-center p-8"><p style={{ color: C.inkSoft }}>Cargando…</p></div>;
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Circular Spotify Text', sans-serif", position: "relative" }}>
      <style>{`
        :root { --ease-out: cubic-bezier(0.23, 1, 0.32, 1); --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1); }
        .font-display { font-family: 'Circular Spotify Text', sans-serif; }
        @keyframes breathe {
          0%, 100% { transform: scale(1, 1) rotate(0deg); }
          25% { transform: scale(1.045, 0.965) rotate(-1.5deg); }
          50% { transform: scale(0.975, 1.045) rotate(0deg); }
          75% { transform: scale(1.03, 0.98) rotate(1.5deg); }
        }
        .breathing { animation: breathe 3.2s var(--ease-in-out) infinite; transform-origin: 50% 65%; }
        @keyframes popIn { 0% { opacity: 0; transform: scale(0.7); } 60% { opacity: 1; transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
        .pop-in { opacity: 0; animation: popIn 380ms var(--ease-bounce) forwards; }
        .pop-in:nth-child(1){animation-delay:0ms}.pop-in:nth-child(2){animation-delay:40ms}.pop-in:nth-child(3){animation-delay:80ms}.pop-in:nth-child(4){animation-delay:120ms}.pop-in:nth-child(n+5){animation-delay:160ms}
        @keyframes chipPop { 0% { transform: scale(0.82); } 55% { transform: scale(1.1); } 100% { transform: scale(1); } }
        .chip-pop { animation: chipPop 340ms var(--ease-bounce); }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        .slide-up { animation: slideUp 320ms var(--ease-out); }
        .slide-down { animation: slideDown 200ms var(--ease-out) forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        .fade-in { animation: fadeIn 200ms var(--ease-out); }
        .fade-out { animation: fadeOut 160ms var(--ease-out) forwards; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.7s linear infinite; }
        @keyframes confettiBurst { to { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); opacity: 0; } }
        @keyframes popScale { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
        .pop-scale { animation: popScale 420ms var(--ease-out); }
        button { transition: opacity 200ms var(--ease-out), background-color 200ms var(--ease-out); }
        button:active { transition: transform 150ms var(--ease-bounce); transform: scale(0.88); }
        .card-hover { transition: background-color 200ms var(--ease-out), transform 200ms var(--ease-out); }
        @media (hover: hover) and (pointer: fine) {
          .card-hover:hover { background: ${C.surfaceMuted} !important; transform: translateY(-1px); }
          .chip-hover:hover { filter: brightness(1.06); }
        }
        button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .breathing { animation: none !important; }
          .pop-in, .slide-up, .slide-down, .fade-in, .fade-out, .pop-scale, .chip-pop { animation: fadeIn 200ms ease !important; }
          button:active { transform: none !important; }
        }
      `}</style>

      <div className="max-w-md mx-auto px-5 pt-8" style={{ paddingBottom: 110 }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="font-display text-xs tracking-widest uppercase mb-1" style={{ color: C.accent }}>{greeting()}, Juan David</p>
            <h1 className="font-display text-3xl font-extrabold flex items-center gap-2" style={{ color: C.ink }}>
              <MonkMark size={26} color={C.accent} /> Calmación
            </h1>
          </div>
          <button onClick={() => setModal("settings")} className="rounded-full p-2.5" style={{ background: C.surface, border: `1px solid ${C.border}`, minWidth: 44, minHeight: 44 }} aria-label="Opciones">
            <Settings size={18} color={C.inkSoft} />
          </button>
        </div>

        {error && <div className="mb-4 px-4 py-3 rounded-2xl text-sm" style={{ background: C.episodeBg, color: C.episode }}>{error}</div>}
        {openEpisodes.length > 0 && (
          <div className="mb-4 px-4 py-2.5 rounded-2xl text-xs flex items-center gap-2" style={{ background: C.episodeBg, color: C.episode }}>
            <Info size={14} /> {openEpisodes.length === 1 ? "Tienes 1 episodio sin cerrar" : `Tienes ${openEpisodes.length} episodios sin cerrar`}
          </div>
        )}

        {tab === "home" && (
          <HomeTab
            lvl={lvl} overallCalmMs={overallCalmMs} overallCalmDays={overallCalmDays} personStreak={personStreak}
            entries={entries}
            eqs={eqs} eq7={eq7} eq30={eq30} timeline={timeline} onSeeAll={() => setTab("log")}
            onEdit={(entry) => setModal({ type: entry.type, editEntry: entry })}
            onSelectDay={setDayDetail}
          />
        )}
        {tab === "log" && (
          <LogTab
            grouped={grouped} filter={filter} setFilter={setFilter} onDelete={deleteEntry}
            onClose={(id) => setModal({ closeId: id })}
            onEdit={(entry) => setModal({ type: entry.type, editEntry: entry })}
            isEmpty={timeline.length === 0}
          />
        )}
        {tab === "stats" && (
          <StatsTab episodes={episodes} eqs={eqs} joys={joys} triggers={triggers} falseAlarms={falseAlarms} entries={entries} topGaps={topGaps} calmMilestonesAchieved={calmMilestonesAchieved} eqMilestonesAchieved={eqMilestonesAchieved} falseAlarmMilestonesAchieved={falseAlarmMilestonesAchieved} overallCalmMs={overallCalmMs} personStreak={personStreak} onSelectDay={setDayDetail} />
        )}
      </div>

      <BottomNav tab={tab} setTab={setTab} onAdd={() => setQuickAdd(true)} onCatalizador={() => setCatalizador(true)} />

      {quickAdd && <QuickAddSheet onPick={(t) => { setQuickAdd(false); setModal(t); }} onClose={() => setQuickAdd(false)} />}
      {catalizador && (
        <CatalizadorModal
          onClose={() => setCatalizador(false)}
          eqs={eqs}
          personStreak={personStreak}
          onLogEq={(initial) => { setCatalizador(false); setModal({ type: "eq", initial }); }}
          onLogEpisode={(initial) => { setCatalizador(false); setModal({ type: "episode", initial }); }}
        />
      )}

      {(modal === "episode" || (modal && modal.type === "episode")) && (
        <EpisodeModal
          onCancel={() => setModal(null)}
          onSave={modal && modal.editEntry ? (patch) => updateEntry(modal.editEntry.id, patch) : addEntry}
          saving={saving}
          initial={modal && modal.initial}
          editEntry={modal && modal.editEntry}
        />
      )}
      {(modal === "eq" || (modal && modal.type === "eq")) && (
        <EqModal
          onCancel={() => setModal(null)}
          onSave={modal && modal.editEntry ? (patch) => updateEntry(modal.editEntry.id, patch) : addEntry}
          saving={saving}
          initial={modal && modal.initial}
          editEntry={modal && modal.editEntry}
        />
      )}
      {(modal === "joy" || (modal && modal.type === "joy")) && (
        <JoyModal
          onCancel={() => setModal(null)}
          onSave={modal && modal.editEntry ? (patch) => updateEntry(modal.editEntry.id, patch) : addEntry}
          saving={saving}
          editEntry={modal && modal.editEntry}
        />
      )}
      {(modal === "trigger" || (modal && modal.type === "trigger")) && (
        <TriggerModal
          onCancel={() => setModal(null)}
          onSave={modal && modal.editEntry ? (patch) => updateEntry(modal.editEntry.id, patch) : addEntry}
          saving={saving}
          editEntry={modal && modal.editEntry}
        />
      )}
      {(modal === "falsealarm" || (modal && modal.type === "falsealarm")) && (
        <FalseAlarmModal
          onCancel={() => setModal(null)}
          onSave={modal && modal.editEntry ? (patch) => updateEntry(modal.editEntry.id, patch) : addEntry}
          saving={saving}
          editEntry={modal && modal.editEntry}
        />
      )}
      {modal === "settings" && (
        <SettingsPanel
          onClose={() => setModal(null)}
          onExport={exportData}
          onImport={importData}
          onSignOut={handleSignOut}
          saving={saving}
          error={error}
          totalEntries={entries.length}
          userEmail={session.user.email}
        />
      )}
      {modal && modal.closeId && <CloseModal onCancel={() => setModal(null)} onSave={(c) => closeEpisode(modal.closeId, c)} saving={saving} />}
      {dayDetail && (
        <DayDetailModal
          date={dayDetail}
          entries={entriesForDay(entries, dayDetail)}
          onClose={() => setDayDetail(null)}
          onEdit={(entry) => { setDayDetail(null); setModal({ type: entry.type, editEntry: entry }); }}
          onDelete={deleteEntry}
          onCloseEpisode={(id) => { setDayDetail(null); setModal({ closeId: id }); }}
        />
      )}

      {levelUp && <LevelUpModal info={levelUp} onClose={() => setLevelUp(null)} />}
    </div>
  );
}

/* ---------------- bottom navigation + FAB ---------------- */

function BottomNav({ tab, setTab, onAdd, onCatalizador }) {
  const left = [
    { id: "home", label: "Inicio", icon: Home, action: () => setTab("home") },
    { id: "log", label: "Bitácora", icon: ListTree, action: () => setTab("log") },
  ];
  const right = [
    { id: "catalizador", label: "Catalizador", icon: LifeBuoy, action: onCatalizador },
    { id: "stats", label: "Datos", icon: BarChart3, action: () => setTab("stats") },
  ];
  const NavButton = ({ id, label, icon: Icon, action }) => (
    <button key={id} onClick={action} className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-full" style={{ minWidth: 56, minHeight: 48 }} aria-label={label} aria-pressed={tab === id}>
      <Icon size={19} color={tab === id ? C.accent : C.inkFaint} />
      <span className="text-[10px] font-bold" style={{ color: tab === id ? C.accent : C.inkFaint }}>{label}</span>
    </button>
  );
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40 }}>
      <div className="max-w-md mx-auto px-6 pb-5">
        <div className="rounded-full flex items-center justify-between px-3 py-2 relative" style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: "0 8px 24px rgba(20,27,23,0.08)" }}>
          {left.map((it) => <NavButton key={it.id} {...it} />)}
          <div style={{ width: 56 }} />
          {right.map((it) => <NavButton key={it.id} {...it} />)}
          <button
            onClick={onAdd}
            aria-label="Agregar registro"
            className="rounded-full flex items-center justify-center"
            style={{ position: "absolute", left: "50%", top: -22, transform: "translateX(-50%)", width: 56, height: 56, background: C.accent, boxShadow: "0 10px 22px rgba(15,160,110,0.4)" }}
          >
            <Plus size={26} color="#fff" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickAddSheet({ onPick, onClose }) {
  const [closing, setClosing] = useState(false);
  function handleClose() { if (closing) return; setClosing(true); setTimeout(onClose, 200); }
  function pick(t) { setClosing(true); setTimeout(() => onPick(t), 180); }
  const options = [
    { type: "episode", label: "Episodio de ira", sub: "Un momento que se salió de control", icon: Flame, color: C.episode, bg: C.episodeBg },
    { type: "eq", label: "Inteligencia emocional", sub: "Casi te detona y lo manejaste", icon: Sparkles, color: C.eq, bg: C.eqBg },
    { type: "trigger", label: "Pequeño detonante", sub: "Molestó, pero no escaló", icon: Zap, color: C.trigger, bg: C.triggerBg },
    { type: "joy", label: "Felicidad", sub: "Un momento que te alegró", icon: Sun, color: C.joy, bg: C.joyBg },
    { type: "falsealarm", label: "Falsa Alarma", sub: "Algo pequeño que no debería molestarte", icon: Siren, color: C.falsealarm, bg: C.falsealarmBg },
  ];
  return (
    <div className={closing ? "fade-out" : "fade-in"} style={{ position: "fixed", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, background: "rgba(20,27,23,0.45)" }} onClick={handleClose}>
      <div className={closing ? "slide-down" : "slide-up"} style={{ width: "100%", maxWidth: 448, borderRadius: "28px 28px 0 0", padding: "22px 20px 32px", background: C.surface }} onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-extrabold" style={{ color: C.ink }}>¿Qué quieres registrar?</h3>
          <button onClick={handleClose} aria-label="Cerrar" style={{ minWidth: 36, minHeight: 36 }}><X size={20} color={C.inkSoft} /></button>
        </div>
        <div className="flex flex-col gap-2.5">
          {options.map(({ type, label, sub, icon: Icon, color, bg }) => (
            <button key={type} onClick={() => pick(type)} className="rounded-[20px] p-3.5 flex items-center gap-3 text-left card-hover" style={{ background: C.surfaceMuted, border: `1px solid ${C.border}` }}>
              <div className="rounded-full p-3 shrink-0" style={{ background: bg }}><Icon size={20} color={color} /></div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold" style={{ color: C.ink }}>{label}</div>
                <div className="text-xs mt-0.5 truncate" style={{ color: C.inkSoft }}>{sub}</div>
              </div>
              <ChevronRight size={16} color={C.inkFaint} className="ml-auto shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- catalizador (in-the-moment guidance) ---------------- */

function buildAdvice({ who, intensity, eqs, personStreak }) {
  const pool = who ? eqs.filter((e) => e.who === who) : eqs;
  const source = pool.length ? pool : eqs;
  const toolCounts = {};
  source.forEach((e) => { if (e.tool && e.tool !== "Sin herramientas") toolCounts[e.tool] = (toolCounts[e.tool] || 0) + 1; });
  const ranked = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);
  const bestTool = ranked[0];

  const genericTip = who === "Salvador"
    ? (intensity >= 4
        ? "Si Salvador está en un lugar seguro (como la cuna), está bien alejarte unos segundos y respirar. Una pausa breve no le hace daño, y a ti te evita reaccionar desde el agotamiento."
        : "El llanto o la pataleta no es un ataque personal — es la única forma que tiene de comunicarse todavía. Respira, y si puedes, pide el relevo de alguien más unos minutos.")
    : intensity >= 4
    ? "Respira contando 4 segundos al inhalar y 6 al exhalar, al menos tres veces, antes de decir o hacer nada."
    : intensity === 3
    ? "Sal del espacio dos minutos antes de responder. No hace falta explicar por qué todavía."
    : "Nombra en voz baja o para ti mismo lo que sientes ahora mismo, y sigue con lo que estabas haciendo.";

  let toolLine = null;
  if (bestTool && pool.length) {
    toolLine = `Con ${DISPLAY_WHO[who] || who}, la herramienta que más te ha funcionado es "${bestTool[0]}" (la has usado ${bestTool[1]} ${bestTool[1] === 1 ? "vez" : "veces"}). Intenta eso primero.`;
  } else if (bestTool) {
    toolLine = `En general, la herramienta que más te ha funcionado es "${bestTool[0]}". Intenta eso primero.`;
  }

  let streakLine = null;
  if (who) {
    const ms = personStreak(who);
    const days = Math.floor(ms / 86400000);
    if (days >= 1) streakLine = `Llevas ${formatDHM(ms)} en calma ${DISPLAY_WHO[who] || who} — vale la pena protegerlo.`;
  }

  return { toolLine, genericTip, streakLine, bestToolName: bestTool ? bestTool[0] : null };
}

function CatalizadorModal({ onClose, eqs, personStreak, onLogEq, onLogEpisode }) {
  const [closing, setClosing] = useState(false);
  const [step, setStep] = useState("input");
  const [intensity, setIntensity] = useState(3);
  const [who, setWho] = useState("");
  const [cause, setCause] = useState("");
  function handleClose() { if (closing) return; setClosing(true); setTimeout(onClose, 200); }

  const advice = step === "result" ? buildAdvice({ who, intensity, eqs, personStreak }) : null;

  return (
    <div className={closing ? "fade-out" : "fade-in"} style={{ position: "fixed", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, background: "rgba(20,27,23,0.45)" }} onClick={handleClose}>
      <div className={closing ? "slide-down" : "slide-up"} style={{ width: "100%", maxWidth: 448, borderRadius: "28px 28px 0 0", padding: "20px 20px 32px", maxHeight: "88vh", overflowY: "auto", background: C.surface }} onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl font-extrabold flex items-center gap-2" style={{ color: C.ink }}><LifeBuoy size={18} color={C.accent} /> Catalizador</h3>
          <button onClick={handleClose} aria-label="Cerrar" style={{ minWidth: 36, minHeight: 36 }}><X size={20} color={C.inkSoft} /></button>
        </div>

        {step === "input" && (
          <>
            <p className="text-xs mb-4" style={{ color: C.inkSoft }}>Cuéntame qué está pasando ahora mismo, antes de reaccionar.</p>
            <Field label={`¿Qué tan molesto estás? ${intensity}/5`}>
              <input type="range" min="1" max="5" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-full" style={{ accentColor: C.accent }} />
            </Field>
            <Field label="¿Qué lo causó?">
              <div className="flex gap-2 flex-wrap mb-2">{WHO_OPTIONS.map((w) => <Chip key={w} label={w} active={who === w} onClick={() => setWho(w)} color={C.accent} />)}</div>
            </Field>
            <Field label="¿Algo más que quieras anotar? (opcional)">
              <textarea value={cause} onChange={(e) => setCause(e.target.value)} rows={2} className="w-full px-3 py-2.5 text-sm resize-none" style={inputStyle} />
            </Field>
            <SaveButton disabled={false} saving={false} color={C.accent} onClick={() => setStep("result")}>Dame una recomendación</SaveButton>
          </>
        )}

        {step === "result" && (
          <>
            <div className="rounded-[20px] p-4 mb-4" style={{ background: C.accentBg }}>
              {advice.toolLine && <p className="text-sm font-bold mb-2" style={{ color: C.accentDeep }}>{advice.toolLine}</p>}
              <p className="text-sm mb-2" style={{ color: C.ink }}>{advice.genericTip}</p>
              {advice.streakLine && <p className="text-xs mt-3 italic" style={{ color: C.inkSoft }}>{advice.streakLine}</p>}
            </div>
            <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>¿Cómo te fue?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onLogEq({ who, contextDetail: "", trigger: cause || "Detonante manejado con Catalizador", tool: advice.bestToolName || "" })}
                className="rounded-full py-3 text-sm font-extrabold flex items-center justify-center gap-2"
                style={{ background: C.eq, color: "#fff", minHeight: 48 }}
              >
                <Sparkles size={15} /> Lo logré — registrar Inteligencia Emocional
              </button>
              <button
                onClick={() => onLogEpisode({ who, contextDetail: "", intensity, note: cause })}
                className="rounded-full py-3 text-sm font-extrabold flex items-center justify-center gap-2"
                style={{ background: C.surfaceMuted, color: C.episode, border: `1px solid ${C.border}`, minHeight: 48 }}
              >
                <Flame size={15} /> Se salió de control — registrar episodio
              </button>
              <button onClick={handleClose} className="text-xs font-bold py-2" style={{ color: C.inkFaint }}>Cerrar sin registrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function HomeTab({ lvl, overallCalmMs, overallCalmDays, personStreak, entries, eqs, eq7, eq30, timeline, onSeeAll, onEdit, onSelectDay }) {
  const daysDisplay = useCountUp(overallCalmDays);
  const pct = Math.round(lvl.progress * 100);
  const last7Days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      const dayEntries = entriesForDay(entries, d);
      return { date: d, type: dominantEntryType(dayEntries), count: dayEntries.length };
    });
  }, [entries]);
  return (
    <div>
      <div className="rounded-[26px] p-6 mb-5 text-center relative overflow-hidden" style={{ background: `linear-gradient(160deg, ${C.accentBg}, ${C.surface})`, border: `1px solid ${C.border}` }}>
        <div className="w-24 h-24 mx-auto mb-3"><CalmFace days={overallCalmDays} /></div>
        <div className="font-display text-xs font-bold uppercase tracking-widest" style={{ color: C.accentDeep }}>Nivel {lvl.level}</div>
        <div className="font-display text-2xl font-extrabold mt-0.5" style={{ color: C.ink }}>{lvl.name}</div>

        <div className="mt-4 mb-1.5 flex justify-between text-[11px] font-bold" style={{ color: C.inkSoft }}>
          <span>{daysDisplay} días</span>
          <span>{lvl.nextDays !== null ? `${lvl.nextDays}d → ${lvl.nextName}` : "Nivel máximo"}</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: C.surfaceMuted }}>
          <div style={{ width: `${pct}%`, height: "100%", background: C.accent, borderRadius: 999, transition: "width 700ms var(--ease-out)" }} />
        </div>

        <div className="font-display text-xl font-extrabold mt-4" style={{ color: C.ink }}>{formatDHM(overallCalmMs)}</div>
        <div className="text-[11px] uppercase tracking-wide" style={{ color: C.inkSoft }}>tiempo de calma total</div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5">
        {WHO_OPTIONS.map((who) => {
          const Icon = WHO_ICONS[who];
          return (
            <div key={who} className="rounded-2xl p-3 flex items-center gap-2.5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="rounded-full flex items-center justify-center shrink-0" style={{ width: 34, height: 34, background: C.accentBg }}>
                <Icon size={16} color={C.accentDeep} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold truncate" style={{ color: C.ink }}>{DISPLAY_WHO[who]}</div>
                <div className="text-[11px] mt-0.5" style={{ color: C.inkSoft }}>{formatDHM(personStreak(who))}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-5">
        <h2 className="font-display text-sm font-extrabold mb-2" style={{ color: C.ink }}>Últimos 7 días</h2>
        <div className="rounded-2xl p-3 flex justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          {last7Days.map((d) => (
            <div key={d.date.toDateString()} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase" style={{ color: C.inkFaint }}>{WEEKDAY_LETTERS[d.date.getDay()]}</span>
              <DayChip date={d.date} type={d.type} onClick={() => onSelectDay(d.date)} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-4 mb-5 grid grid-cols-3 text-center" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div><div className="font-display text-xl font-extrabold" style={{ color: C.eq }}>{eqs.length}</div><div className="text-[11px] uppercase tracking-wide mt-0.5" style={{ color: C.inkSoft }}>total IE</div></div>
        <div><div className="font-display text-xl font-extrabold" style={{ color: C.eq }}>{eq7}</div><div className="text-[11px] uppercase tracking-wide mt-0.5" style={{ color: C.inkSoft }}>7 días</div></div>
        <div><div className="font-display text-xl font-extrabold" style={{ color: C.eq }}>{eq30}</div><div className="text-[11px] uppercase tracking-wide mt-0.5" style={{ color: C.inkSoft }}>30 días</div></div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg font-extrabold" style={{ color: C.ink }}>Actividad reciente</h2>
          <button onClick={onSeeAll} className="text-xs font-bold flex items-center gap-0.5" style={{ color: C.accent }}>Ver todo <ChevronRight size={13} /></button>
        </div>
        {timeline.length === 0 ? (
          <div className="rounded-[22px] p-6 text-center" style={{ background: C.surface, border: `1px dashed ${C.border}` }}>
            <Info size={18} color={C.inkSoft} className="mx-auto mb-2" />
            <p className="text-sm" style={{ color: C.inkSoft }}>Aún no hay registros. Toca el botón + para empezar.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {timeline.slice(0, 3).map((e) => <EntryCard key={e.id} entry={e} onDelete={() => {}} onClose={() => {}} onEdit={onEdit} readOnly />)}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------- log tab ---------------- */

function LogTab({ grouped, filter, setFilter, onDelete, onClose, onEdit, isEmpty }) {
  const filters = [
    { id: "todos", label: "Todos" },
    { id: "episode", label: "Ira" },
    { id: "eq", label: "IE" },
    { id: "trigger", label: "Detonantes" },
    { id: "joy", label: "Felicidad" },
    { id: "falsealarm", label: "Falsa Alarma" },
  ];
  const colorFor = { todos: C.accent, episode: C.episode, eq: C.eq, trigger: C.trigger, joy: C.joy, falsealarm: C.falsealarm };
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-4">
        <Filter size={14} color={C.inkFaint} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map((f) => <Chip key={f.id} label={f.label} active={filter === f.id} onClick={() => setFilter(f.id)} color={colorFor[f.id]} />)}
        </div>
      </div>
      {isEmpty ? (
        <div className="rounded-[22px] p-6 text-center" style={{ background: C.surface, border: `1px dashed ${C.border}` }}>
          <Info size={18} color={C.inkSoft} className="mx-auto mb-2" />
          <p className="text-sm" style={{ color: C.inkSoft }}>Aún no hay registros.</p>
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="rounded-[22px] p-6 text-center" style={{ background: C.surface, border: `1px dashed ${C.border}` }}>
          <p className="text-sm" style={{ color: C.inkSoft }}>Nada con este filtro todavía.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([label, list]) => (
          <div key={label} className="mb-4">
            <div className="text-xs font-extrabold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>{label}</div>
            <ul className="flex flex-col gap-2">
              {list.map((e) => <EntryCard key={e.id} entry={e} onDelete={() => onDelete(e.id)} onClose={() => onClose(e.id)} onEdit={onEdit} />)}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

/* ---------------- entry card ---------------- */

function EntryCard({ entry, onDelete, onClose, onEdit, readOnly }) {
  const meta = {
    episode: { icon: Flame, color: C.episode, bg: C.episodeBg, title: whoDisplay(entry.who, entry.contextDetail), label: "Episodio de ira" },
    eq: { icon: Sparkles, color: C.eq, bg: C.eqBg, title: whoDisplay(entry.who, entry.contextDetail), label: "Inteligencia emocional" },
    joy: { icon: Sun, color: C.joy, bg: C.joyBg, title: "Momento feliz", label: "Felicidad" },
    trigger: { icon: Zap, color: C.trigger, bg: C.triggerBg, title: entry.place || "Pequeño detonante", label: "Pequeño detonante" },
    falsealarm: { icon: Siren, color: C.falsealarm, bg: C.falsealarmBg, title: whoDisplay(entry.who, entry.contextDetail), label: "Falsa Alarma" },
  }[entry.type];
  const Icon = meta.icon;
  return (
    <li className="rounded-[20px] p-3.5 card-hover" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="flex gap-3">
        <div className="rounded-full flex items-center justify-center shrink-0" style={{ width: 36, height: 36, background: meta.bg }}><Icon size={16} color={meta.color} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-extrabold truncate" style={{ color: C.ink }}>{meta.label}</p>
            <div className="flex items-center gap-0.5 shrink-0">
              {onEdit && <button onClick={() => onEdit(entry)} aria-label="Editar" className="p-1" style={{ minWidth: 28, minHeight: 28 }}><Pencil size={13} color={C.inkFaint} /></button>}
              {!readOnly && <button onClick={onDelete} aria-label="Eliminar" className="p-1" style={{ minWidth: 28, minHeight: 28 }}><Trash2 size={13} color={C.inkFaint} /></button>}
            </div>
          </div>
          <p className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{meta.title}</p>
          {entry.trigger && <p className="text-xs mt-1" style={{ color: C.ink }}>{entry.trigger}</p>}
          {entry.detail && <p className="text-xs mt-1" style={{ color: C.ink }}>{entry.detail}</p>}
          {entry.description && <p className="text-xs mt-1" style={{ color: C.ink }}>{entry.description}</p>}
          {entry.note && <p className="text-xs mt-1 italic" style={{ color: C.inkSoft }}>"{entry.note}"</p>}
          {entry.management && <p className="text-xs mt-1 italic" style={{ color: C.inkSoft }}>"{entry.management}"</p>}
          {entry.resolution && <p className="text-xs mt-1 italic" style={{ color: C.inkSoft }}>"{entry.resolution}"</p>}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5 text-[11px] uppercase tracking-wide" style={{ color: C.inkSoft }}>
            <span className="flex items-center gap-0.5"><Clock size={10} /> {formatTime(entry.date)}</span>
            {entry.place && entry.type !== "trigger" && <span className="flex items-center gap-0.5"><MapPin size={10} /> {entry.place}</span>}
            {entry.intensity && <span>intensidad {entry.intensity}/5</span>}
            {entry.happiness && <span>nivel {entry.happiness}/5</span>}
            {entry.annoyance && <span>molestia {entry.annoyance}/5</span>}
            {entry.discomfort && <span>incomodidad {entry.discomfort}/5</span>}
            {entry.type === "falsealarm" && <span>{entry.resolvedInternally ? "resuelta internamente" : "sin resolver"}</span>}
            {entry.fault && <span>culpa: {entry.fault}</span>}
            {entry.tool && <span>herramienta: {entry.tool === "Otro" ? entry.toolDetail || "Otro" : entry.tool}</span>}
          </div>
          {entry.type === "episode" && !readOnly && (
            entry.closed ? (
              <div className="mt-2 rounded-xl p-2 text-[11px]" style={{ background: C.surfaceMuted }}>
                <div className="flex items-center gap-1 font-bold" style={{ color: C.accentDeep }}><CheckCircle2 size={12} /> {entry.closure.resolution}</div>
                {entry.closure.detail && <p className="mt-1" style={{ color: C.inkSoft }}>{entry.closure.detail}</p>}
                <p className="mt-1" style={{ color: C.inkSoft }}>{formatDate(entry.closure.date)}, {formatTime(entry.closure.date)}{entry.closure.place ? ` · ${entry.closure.place}` : ""}</p>
              </div>
            ) : (
              <button onClick={onClose} className="mt-2 text-[11px] font-extrabold px-3.5 py-2 rounded-full flex items-center gap-1" style={{ background: C.episode, color: "#fff", minHeight: 32 }}>Cerrar episodio <ChevronRight size={12} /></button>
            )
          )}
        </div>
      </div>
    </li>
  );
}

/* ---------------- level-up celebration ---------------- */

function LevelUpModal({ info, onClose }) {
  return (
    <div className="fade-in" style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(20,27,23,0.55)" }} onClick={onClose}>
      <div className="pop-scale rounded-[28px] p-8 text-center relative" style={{ background: C.surface, maxWidth: 320, margin: 20 }} onClick={(ev) => ev.stopPropagation()}>
        <Confetti />
        <div className="mx-auto mb-1" style={{ width: 40 }}><MonkMark size={40} color={C.accent} /></div>
        <div className="text-xs font-bold uppercase tracking-widest mt-2" style={{ color: C.accentDeep }}>¡Subiste de nivel!</div>
        <div className="font-display text-3xl font-extrabold mt-1" style={{ color: C.ink }}>Nivel {info.level}</div>
        <div className="font-display text-lg font-bold mt-0.5" style={{ color: C.accent }}>{info.name}</div>
        <p className="text-sm mt-3" style={{ color: C.inkSoft }}>Cada registro suma. Sigue así.</p>
        <button onClick={onClose} className="w-full rounded-full py-3 text-sm font-extrabold mt-5" style={{ background: C.accent, color: "#fff", minHeight: 48 }}>Seguir</button>
      </div>
    </div>
  );
}

/* ---------------- modal shell ---------------- */

function ModalShell({ title, icon, onCancel, children }) {
  const [closing, setClosing] = useState(false);
  function handleClose() { if (closing) return; setClosing(true); setTimeout(onCancel, 200); }
  return (
    <div className={closing ? "fade-out" : "fade-in"} style={{ position: "fixed", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, background: "rgba(20,27,23,0.45)" }} onClick={handleClose}>
      <div className={closing ? "slide-down" : "slide-up"} style={{ width: "100%", maxWidth: 448, borderRadius: "28px 28px 0 0", padding: "20px 20px 32px", maxHeight: "88vh", overflowY: "auto", background: C.surface }} onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl font-extrabold flex items-center gap-2" style={{ color: C.ink }}>{icon} {title}</h3>
          <button onClick={handleClose} aria-label="Cerrar" style={{ minWidth: 36, minHeight: 36 }}><X size={20} color={C.inkSoft} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function WhoPicker({ value, detail, onChange, onDetailChange, color }) {
  return (
    <>
      <div className="flex gap-2 flex-wrap mb-2">{WHO_OPTIONS.map((w) => <Chip key={w} label={w} active={value === w} onClick={() => onChange(w)} color={color} />)}</div>
      {(value === "Trabajo" || value === "Otros") && (
        <input value={detail} onChange={(ev) => onDetailChange(ev.target.value)} placeholder={value === "Trabajo" ? "¿Con quién o qué situación?" : "¿Qué o quién?"} className="w-full px-3 py-2.5 text-sm mb-2" style={inputStyle} />
      )}
    </>
  );
}

/* ---------------- entry modals ---------------- */

function EpisodeModal({ onCancel, onSave, saving, initial, editEntry }) {
  const src = editEntry || initial;
  const [date, setDate] = useState(toLocalInputValue(editEntry ? editEntry.date : new Date()));
  const [place, setPlace] = useState((src && src.place) || "");
  const [who, setWho] = useState((src && src.who) || "");
  const [whoDetail, setWhoDetail] = useState((src && src.contextDetail) || "");
  const [intensity, setIntensity] = useState((src && src.intensity) || 3);
  const [note, setNote] = useState((src && src.note) || "");
  const [fault, setFault] = useState((editEntry && editEntry.fault) || "");
  const canSave = who && date;
  return (
    <ModalShell title={editEntry ? "Editar episodio" : "Episodio de ira"} icon={<Flame size={18} color={C.episode} />} onCancel={onCancel}>
      <Field label="Fecha y hora"><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2.5 text-sm" style={inputStyle} /></Field>
      <Field label="Lugar"><input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="ej. casa, carro" className="w-full px-3 py-2.5 text-sm" style={inputStyle} /></Field>
      <Field label="¿Con quién o dónde?"><WhoPicker value={who} detail={whoDetail} onChange={setWho} onDetailChange={setWhoDetail} color={C.episode} /></Field>
      <Field label={`Intensidad: ${intensity}/5`}><input type="range" min="1" max="5" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-full" style={{ accentColor: C.episode }} /></Field>
      <Field label="¿Qué dijiste o hiciste?"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full px-3 py-2.5 text-sm resize-none" style={inputStyle} /></Field>
      <Field label="¿De quién fue la culpa?"><div className="flex gap-2 flex-wrap">{FAULT_OPTIONS.map((f) => <Chip key={f} label={f} active={fault === f} onClick={() => setFault(f)} color={C.episode} />)}</div></Field>
      <SaveButton
        disabled={!canSave}
        saving={saving}
        color={C.episode}
        onClick={() => onSave(editEntry
          ? { ...editEntry, date: new Date(date).toISOString(), place, who, contextDetail: whoDetail, intensity, note, fault }
          : { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: "episode", date: new Date(date).toISOString(), place, who, contextDetail: whoDetail, intensity, note, fault, closed: false }
        )}
      >
        {editEntry ? "Guardar cambios" : "Guardar episodio"}
      </SaveButton>
    </ModalShell>
  );
}

function EqModal({ onCancel, onSave, saving, initial, editEntry }) {
  const src = editEntry || initial;
  const [date, setDate] = useState(toLocalInputValue(editEntry ? editEntry.date : new Date()));
  const [place, setPlace] = useState((src && src.place) || "");
  const [who, setWho] = useState((src && src.who) || "");
  const [whoDetail, setWhoDetail] = useState((src && src.contextDetail) || "");
  const [trigger, setTrigger] = useState((src && src.trigger) || "");
  const [note, setNote] = useState((src && src.note) || "");
  const [tool, setTool] = useState((src && src.tool) || "");
  const [toolDetail, setToolDetail] = useState((editEntry && editEntry.toolDetail) || "");
  const canSave = trigger.trim() && date;
  return (
    <ModalShell title={editEntry ? "Editar inteligencia emocional" : "Inteligencia emocional"} icon={<Sparkles size={18} color={C.eq} />} onCancel={onCancel}>
      <Field label="Fecha y hora"><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2.5 text-sm" style={inputStyle} /></Field>
      <Field label="Lugar"><input value={place} onChange={(e) => setPlace(e.target.value)} className="w-full px-3 py-2.5 text-sm" style={inputStyle} /></Field>
      <Field label="Contexto"><WhoPicker value={who} detail={whoDetail} onChange={setWho} onDetailChange={setWhoDetail} color={C.eq} /></Field>
      <Field label="¿Qué casi te detona?"><input value={trigger} onChange={(e) => setTrigger(e.target.value)} className="w-full px-3 py-2.5 text-sm" style={inputStyle} /></Field>
      <Field label="¿Qué hiciste en su lugar?"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full px-3 py-2.5 text-sm resize-none" style={inputStyle} /></Field>
      <Field label="Herramienta usada (opcional)">
        <div className="flex gap-2 flex-wrap mb-2">{TOOL_OPTIONS.map((tl) => <Chip key={tl} label={tl} active={tool === tl} onClick={() => setTool(tl)} color={C.eq} />)}</div>
        {tool === "Otro" && <input value={toolDetail} onChange={(e) => setToolDetail(e.target.value)} placeholder="Nombra la herramienta" className="w-full px-3 py-2.5 text-sm" style={inputStyle} />}
      </Field>
      <SaveButton
        disabled={!canSave}
        saving={saving}
        color={C.eq}
        onClick={() => onSave(editEntry
          ? { ...editEntry, date: new Date(date).toISOString(), place, who, contextDetail: whoDetail, trigger, note, tool, toolDetail }
          : { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: "eq", date: new Date(date).toISOString(), place, who, contextDetail: whoDetail, trigger, note, tool, toolDetail }
        )}
      >
        {editEntry ? "Guardar cambios" : "Guardar registro"}
      </SaveButton>
    </ModalShell>
  );
}

function TriggerModal({ onCancel, onSave, saving, editEntry }) {
  const [date, setDate] = useState(toLocalInputValue(editEntry ? editEntry.date : new Date()));
  const [place, setPlace] = useState((editEntry && editEntry.place) || "");
  const [description, setDescription] = useState((editEntry && editEntry.description) || "");
  const [annoyance, setAnnoyance] = useState((editEntry && editEntry.annoyance) || 2);
  const [management, setManagement] = useState((editEntry && editEntry.management) || "");
  const canSave = description.trim() && date;
  return (
    <ModalShell title={editEntry ? "Editar detonante" : "Pequeño detonante"} icon={<Zap size={18} color={C.trigger} />} onCancel={onCancel}>
      <Field label="Fecha y hora"><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2.5 text-sm" style={inputStyle} /></Field>
      <Field label="Lugar"><input value={place} onChange={(e) => setPlace(e.target.value)} className="w-full px-3 py-2.5 text-sm" style={inputStyle} /></Field>
      <Field label="¿Qué pasó?"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2.5 text-sm resize-none" style={inputStyle} /></Field>
      <Field label={`Nivel de molestia: ${annoyance}/5`}><input type="range" min="1" max="5" value={annoyance} onChange={(e) => setAnnoyance(Number(e.target.value))} className="w-full" style={{ accentColor: C.trigger }} /></Field>
      <Field label="¿Qué manejo le diste?"><textarea value={management} onChange={(e) => setManagement(e.target.value)} rows={2} className="w-full px-3 py-2.5 text-sm resize-none" style={inputStyle} /></Field>
      <SaveButton
        disabled={!canSave}
        saving={saving}
        color={C.trigger}
        onClick={() => onSave(editEntry
          ? { ...editEntry, date: new Date(date).toISOString(), place, description, annoyance, management }
          : { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: "trigger", date: new Date(date).toISOString(), place, description, annoyance, management }
        )}
      >
        {editEntry ? "Guardar cambios" : "Guardar detonante"}
      </SaveButton>
    </ModalShell>
  );
}

function FalseAlarmModal({ onCancel, onSave, saving, editEntry }) {
  const [date, setDate] = useState(toLocalInputValue(editEntry ? editEntry.date : new Date()));
  const [who, setWho] = useState((editEntry && editEntry.who) || "");
  const [whoDetail, setWhoDetail] = useState((editEntry && editEntry.contextDetail) || "");
  const [discomfort, setDiscomfort] = useState((editEntry && editEntry.discomfort) || 2);
  const [description, setDescription] = useState((editEntry && editEntry.description) || "");
  const [resolvedInternally, setResolvedInternally] = useState(editEntry ? !!editEntry.resolvedInternally : null);
  const [resolution, setResolution] = useState((editEntry && editEntry.resolution) || "");
  const canSave = who && description.trim() && resolvedInternally !== null && date;
  return (
    <ModalShell title={editEntry ? "Editar falsa alarma" : "Falsa Alarma"} icon={<Siren size={18} color={C.falsealarm} />} onCancel={onCancel}>
      <Field label="Fecha y hora"><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2.5 text-sm" style={inputStyle} /></Field>
      <Field label="¿Quién detonó la falsa alarma?"><WhoPicker value={who} detail={whoDetail} onChange={setWho} onDetailChange={setWhoDetail} color={C.falsealarm} /></Field>
      <Field label={`Nivel de incomodidad: ${discomfort}/5`}><input type="range" min="1" max="5" value={discomfort} onChange={(e) => setDiscomfort(Number(e.target.value))} className="w-full" style={{ accentColor: C.falsealarm }} /></Field>
      <Field label="¿Qué pasó?"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2.5 text-sm resize-none" style={inputStyle} /></Field>
      <Field label="¿La resolviste internamente?">
        <div className="flex gap-2 flex-wrap">
          <Chip label="Sí" active={resolvedInternally === true} onClick={() => setResolvedInternally(true)} color={C.falsealarm} />
          <Chip label="No" active={resolvedInternally === false} onClick={() => setResolvedInternally(false)} color={C.falsealarm} />
        </div>
      </Field>
      {resolvedInternally === true && (
        <Field label="¿Cómo la resolviste?"><textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={2} className="w-full px-3 py-2.5 text-sm resize-none" style={inputStyle} /></Field>
      )}
      <SaveButton
        disabled={!canSave}
        saving={saving}
        color={C.falsealarm}
        onClick={() => onSave(editEntry
          ? { ...editEntry, date: new Date(date).toISOString(), who, contextDetail: whoDetail, discomfort, description, resolvedInternally, resolution: resolvedInternally ? resolution : "" }
          : { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: "falsealarm", date: new Date(date).toISOString(), who, contextDetail: whoDetail, discomfort, description, resolvedInternally, resolution: resolvedInternally ? resolution : "" }
        )}
      >
        {editEntry ? "Guardar cambios" : "Guardar falsa alarma"}
      </SaveButton>
    </ModalShell>
  );
}

function JoyModal({ onCancel, onSave, saving, editEntry }) {
  const [date, setDate] = useState(toLocalInputValue(editEntry ? editEntry.date : new Date()));
  const [place, setPlace] = useState((editEntry && editEntry.place) || "");
  const [detail, setDetail] = useState((editEntry && editEntry.detail) || "");
  const [happiness, setHappiness] = useState((editEntry && editEntry.happiness) || 3);
  const canSave = detail.trim() && date;
  return (
    <ModalShell title={editEntry ? "Editar felicidad" : "Felicidad"} icon={<Sun size={18} color={C.joy} />} onCancel={onCancel}>
      <Field label="Fecha y hora"><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2.5 text-sm" style={inputStyle} /></Field>
      <Field label="Lugar"><input value={place} onChange={(e) => setPlace(e.target.value)} className="w-full px-3 py-2.5 text-sm" style={inputStyle} /></Field>
      <Field label="¿Qué pasó?"><textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} className="w-full px-3 py-2.5 text-sm resize-none" style={inputStyle} /></Field>
      <Field label={`Nivel de felicidad: ${happiness}/5`}><input type="range" min="1" max="5" value={happiness} onChange={(e) => setHappiness(Number(e.target.value))} className="w-full" style={{ accentColor: C.joy }} /></Field>
      <SaveButton
        disabled={!canSave}
        saving={saving}
        color={C.joy}
        onClick={() => onSave(editEntry
          ? { ...editEntry, date: new Date(date).toISOString(), place, detail, happiness }
          : { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: "joy", date: new Date(date).toISOString(), place, detail, happiness }
        )}
      >
        {editEntry ? "Guardar cambios" : "Guardar momento"}
      </SaveButton>
    </ModalShell>
  );
}

function CloseModal({ onCancel, onSave, saving }) {
  const [date, setDate] = useState(toLocalInputValue(new Date()));
  const [place, setPlace] = useState("");
  const [resolution, setResolution] = useState("");
  const [detail, setDetail] = useState("");
  const canSave = resolution && date;
  return (
    <ModalShell title="Cerrar episodio" icon={<CheckCircle2 size={18} color={C.accent} />} onCancel={onCancel}>
      <Field label="Fecha y hora"><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2.5 text-sm" style={inputStyle} /></Field>
      <Field label="Lugar"><input value={place} onChange={(e) => setPlace(e.target.value)} className="w-full px-3 py-2.5 text-sm" style={inputStyle} /></Field>
      <Field label="¿Cómo se cerró?"><div className="flex gap-2 flex-wrap">{RESOLUTION_OPTIONS.map((r) => <Chip key={r} label={r} active={resolution === r} onClick={() => setResolution(r)} color={C.accent} />)}</div></Field>
      <Field label="¿Cómo se superó?"><textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} className="w-full px-3 py-2.5 text-sm resize-none" style={inputStyle} /></Field>
      <SaveButton disabled={!canSave} saving={saving} color={C.accent} onClick={() => onSave({ date: new Date(date).toISOString(), place, resolution, detail })}>Cerrar episodio</SaveButton>
    </ModalShell>
  );
}

/* ---------------- day detail (from the home strip / calendar) ---------------- */

function DayDetailModal({ date, entries, onClose, onEdit, onDelete, onCloseEpisode }) {
  return (
    <ModalShell title={formatDate(date)} icon={<CalendarDays size={18} color={C.accent} />} onCancel={onClose}>
      {entries.length === 0 ? (
        <p className="text-sm" style={{ color: C.inkSoft }}>No hay registros este día.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} onDelete={() => onDelete(e.id)} onClose={() => onCloseEpisode(e.id)} onEdit={onEdit} />
          ))}
        </ul>
      )}
    </ModalShell>
  );
}

/* ---------------- stats tab ---------------- */

function StatBar({ label, value, max, color }) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex justify-between text-xs mb-1" style={{ color: C.inkSoft }}><span>{label}</span><span>{value}</span></div>
      <div className="h-2 rounded-full" style={{ background: C.surfaceMuted }}>
        <div className="h-2 rounded-full" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color, transition: "width 0.4s var(--ease-out)" }} />
      </div>
    </div>
  );
}

function StatsTab({ episodes, eqs, joys, triggers, falseAlarms, entries, topGaps, calmMilestonesAchieved, eqMilestonesAchieved, falseAlarmMilestonesAchieved, overallCalmMs, personStreak, onSelectDay }) {
  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const monthGrid = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Monday = 0 ... Sunday = 6
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);
  const monthLabel = viewMonth.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const totalFault = episodes.reduce((acc, e) => (e.fault ? acc + 1 : acc), 0);
  const faultCounts = useMemo(() => { const c = { Mía: 0, "De la otra persona": 0, Compartida: 0 }; episodes.forEach((e) => { if (e.fault) c[e.fault] = (c[e.fault] || 0) + 1; }); return c; }, [episodes]);
  const byWhoCounts = useMemo(() => { const c = {}; WHO_OPTIONS.forEach((w) => (c[w] = 0)); episodes.forEach((e) => (c[e.who] = (c[e.who] || 0) + 1)); return c; }, [episodes]);
  const maxWho = Math.max(1, ...Object.values(byWhoCounts));
  const falseAlarmByWhoCounts = useMemo(() => { const c = {}; WHO_OPTIONS.forEach((w) => (c[w] = 0)); falseAlarms.forEach((e) => (c[e.who] = (c[e.who] || 0) + 1)); return c; }, [falseAlarms]);
  const maxFalseAlarmWho = Math.max(1, ...Object.values(falseAlarmByWhoCounts));
  const avgIntensity = episodes.length ? (episodes.reduce((s, e) => s + (e.intensity || 0), 0) / episodes.length).toFixed(1) : "0.0";
  const avgAnnoyance = triggers.length ? (triggers.reduce((s, e) => s + (e.annoyance || 0), 0) / triggers.length).toFixed(1) : "0.0";
  const avgHappiness = joys.length ? (joys.reduce((s, e) => s + (e.happiness || 0), 0) / joys.length).toFixed(1) : "0.0";
  const avgDiscomfort = falseAlarms.length ? (falseAlarms.reduce((s, e) => s + (e.discomfort || 0), 0) / falseAlarms.length).toFixed(1) : "0.0";
  const now = new Date();
  const trig7 = triggers.filter((e) => msBetween(e.date, now) <= 7 * 86400000).length;
  const trig30 = triggers.filter((e) => msBetween(e.date, now) <= 30 * 86400000).length;
  const joy7 = joys.filter((e) => msBetween(e.date, now) <= 7 * 86400000).length;
  const joy30 = joys.filter((e) => msBetween(e.date, now) <= 30 * 86400000).length;
  const fa7 = falseAlarms.filter((e) => msBetween(e.date, now) <= 7 * 86400000).length;
  const fa30 = falseAlarms.filter((e) => msBetween(e.date, now) <= 30 * 86400000).length;
  const periodCounts = useMemo(() => { const c = { Madrugada: 0, Mañana: 0, Tarde: 0, Noche: 0 }; [...episodes, ...triggers].forEach((e) => { c[periodOfHour(new Date(e.date).getHours())]++; }); return c; }, [episodes, triggers]);
  const maxPeriod = Math.max(1, ...Object.values(periodCounts));
  const placeCounts = useMemo(() => { const c = {}; [...episodes, ...triggers, ...joys].forEach((e) => { if (e.place) c[e.place] = (c[e.place] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6); }, [episodes, triggers, joys]);
  const maxPlace = Math.max(1, ...placeCounts.map(([, v]) => v));
  const toolCounts = useMemo(() => { const c = {}; TOOL_OPTIONS.forEach((t) => (c[t] = 0)); eqs.forEach((e) => { if (e.tool) c[e.tool] = (c[e.tool] || 0) + 1; }); return c; }, [eqs]);
  const maxTool = Math.max(1, ...Object.values(toolCounts));

  return (
    <div>
      <h2 className="font-display text-2xl font-extrabold mb-4" style={{ color: C.ink }}>Estadísticas</h2>

      <div className="rounded-[26px] p-5 mb-6" style={{ background: `linear-gradient(160deg, ${C.accentBg}, ${C.surface})`, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setViewMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })} aria-label="Mes anterior" className="rounded-full p-1.5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <ChevronLeft size={16} color={C.inkSoft} />
          </button>
          <span className="font-display text-sm font-extrabold capitalize" style={{ color: C.ink }}>{monthLabel}</span>
          <button onClick={() => setViewMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })} aria-label="Mes siguiente" className="rounded-full p-1.5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <ChevronRight size={16} color={C.inkSoft} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-2 mb-1">
          {["L", "M", "X", "J", "V", "S", "D"].map((l) => (
            <div key={l} className="text-center text-[10px] font-bold uppercase" style={{ color: C.inkFaint }}>{l}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-2">
          {monthGrid.map((date, i) => {
            if (!date) return <div key={`pad${i}`} />;
            const isFuture = date > now;
            const dayEntries = entriesForDay(entries, date);
            return (
              <div key={date.toDateString()} className="flex justify-center">
                <DayChip date={date} type={dominantEntryType(dayEntries)} muted={isFuture} size={32} onClick={isFuture ? undefined : () => onSelectDay(date)} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {[["episodios", episodes.length, C.episode], ["IE", eqs.length, C.eq], ["detonantes", triggers.length, C.trigger], ["felicidad", joys.length, C.joy], ["falsas alarmas", falseAlarms.length, C.falsealarm]].map(([label, val, color]) => (
          <div key={label} className="rounded-2xl p-2.5 text-center" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="font-display text-lg font-extrabold" style={{ color }}>{val}</div>
            <div className="text-[10px] uppercase" style={{ color: C.inkSoft }}>{label}</div>
          </div>
        ))}
      </div>

      <SectionCard title="Rachas">
        <div className="text-center mb-3">
          <div className="font-display text-2xl font-extrabold" style={{ color: C.accent }}>{formatDHM(overallCalmMs)}</div>
          <div className="text-[11px] uppercase" style={{ color: C.inkSoft }}>racha actual</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {WHO_OPTIONS.map((w) => (
            <div key={w} className="rounded-xl p-2 text-center" style={{ background: C.surfaceMuted }}>
              <div className="text-[11px] font-extrabold" style={{ color: C.ink }}>{DISPLAY_WHO[w]}</div>
              <div className="text-[11px]" style={{ color: C.inkSoft }}>{formatDHM(personStreak(w))}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Histórico de rachas">
        {topGaps.length === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>Aún no hay suficientes datos.</p> : topGaps.map((g, i) => (
          <div key={i} className="flex items-center justify-between py-1.5" style={{ borderBottom: i < topGaps.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <span className="text-xs" style={{ color: C.inkSoft }}>{formatShortDate(g.from)} – {g.ongoing ? "hoy" : formatShortDate(g.to)}</span>
            <span className="text-xs font-extrabold" style={{ color: C.accent }}>{g.days} d{g.ongoing ? " (actual)" : ""}</span>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Medallas">
        {calmMilestonesAchieved.length === 0 && eqMilestonesAchieved === 0 && falseAlarmMilestonesAchieved === 0 ? (
          <p className="text-xs" style={{ color: C.inkSoft }}>Aún no tienes medallas — ¡vas por la primera!</p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {calmMilestonesAchieved.map((m) => <div key={`c${m}`} className="rounded-full px-3 py-1.5 text-[11px] font-extrabold flex items-center gap-1" style={{ background: C.accent, color: "#fff" }}><Award size={11} /> {m}d</div>)}
            {Array.from({ length: eqMilestonesAchieved }).map((_, i) => <div key={`e${i}`} className="rounded-full px-3 py-1.5 text-[11px] font-extrabold flex items-center gap-1" style={{ background: C.eq, color: "#fff" }}><Award size={11} /> {(i + 1) * 5} IE</div>)}
            {Array.from({ length: falseAlarmMilestonesAchieved }).map((_, i) => <div key={`f${i}`} className="rounded-full px-3 py-1.5 text-[11px] font-extrabold flex items-center gap-1" style={{ background: C.falsealarm, color: "#fff" }}><Award size={11} /> {(i + 1) * 5} FA</div>)}
          </div>
        )}
      </SectionCard>

      <SectionCard title="¿Con quién peleo más?">{WHO_OPTIONS.map((w) => <StatBar key={w} label={w} value={byWhoCounts[w] || 0} max={maxWho} color={C.episode} />)}</SectionCard>

      <SectionCard title="¿Quién detona más falsas alarmas?">
        {falseAlarms.length === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>Aún no hay suficientes datos.</p> : WHO_OPTIONS.map((w) => <StatBar key={w} label={w} value={falseAlarmByWhoCounts[w] || 0} max={maxFalseAlarmWho} color={C.falsealarm} />)}
      </SectionCard>

      <SectionCard title="¿Quién inicia?">
        {totalFault === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>Aún no hay suficientes datos.</p> : Object.entries(faultCounts).map(([k, v]) => <StatBar key={k} label={k} value={`${Math.round((v / totalFault) * 100)}%`} max={100} color={C.accent} />)}
      </SectionCard>

      <SectionCard title="Pequeños detonantes">
        <div className="grid grid-cols-3 text-center mb-1">
          <div><div className="font-display text-lg font-extrabold" style={{ color: C.trigger }}>{trig7}</div><div className="text-[10px] uppercase" style={{ color: C.inkSoft }}>7 días</div></div>
          <div><div className="font-display text-lg font-extrabold" style={{ color: C.trigger }}>{trig30}</div><div className="text-[10px] uppercase" style={{ color: C.inkSoft }}>30 días</div></div>
          <div><div className="font-display text-lg font-extrabold" style={{ color: C.trigger }}>{avgAnnoyance}</div><div className="text-[10px] uppercase" style={{ color: C.inkSoft }}>molestia prom.</div></div>
        </div>
      </SectionCard>

      <SectionCard title="Falsas alarmas">
        <div className="grid grid-cols-3 text-center mb-1">
          <div><div className="font-display text-lg font-extrabold" style={{ color: C.falsealarm }}>{fa7}</div><div className="text-[10px] uppercase" style={{ color: C.inkSoft }}>7 días</div></div>
          <div><div className="font-display text-lg font-extrabold" style={{ color: C.falsealarm }}>{fa30}</div><div className="text-[10px] uppercase" style={{ color: C.inkSoft }}>30 días</div></div>
          <div><div className="font-display text-lg font-extrabold" style={{ color: C.falsealarm }}>{avgDiscomfort}</div><div className="text-[10px] uppercase" style={{ color: C.inkSoft }}>incomodidad prom.</div></div>
        </div>
      </SectionCard>

      <SectionCard title="Felicidad">
        <div className="grid grid-cols-3 text-center mb-1">
          <div><div className="font-display text-lg font-extrabold" style={{ color: C.joy }}>{joy7}</div><div className="text-[10px] uppercase" style={{ color: C.inkSoft }}>7 días</div></div>
          <div><div className="font-display text-lg font-extrabold" style={{ color: C.joy }}>{joy30}</div><div className="text-[10px] uppercase" style={{ color: C.inkSoft }}>30 días</div></div>
          <div><div className="font-display text-lg font-extrabold" style={{ color: C.joy }}>{avgHappiness}</div><div className="text-[10px] uppercase" style={{ color: C.inkSoft }}>nivel prom.</div></div>
        </div>
      </SectionCard>

      <SectionCard title="Intensidad promedio (ira)">
        <div className="text-center"><span className="font-display text-3xl font-extrabold" style={{ color: C.episode }}>{avgIntensity}</span><span className="text-sm" style={{ color: C.inkSoft }}> / 5</span></div>
      </SectionCard>

      <SectionCard title="Herramientas usadas">{eqs.length === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>Aún no hay suficientes datos.</p> : TOOL_OPTIONS.map((t) => <StatBar key={t} label={t} value={toolCounts[t] || 0} max={maxTool} color={C.eq} />)}</SectionCard>

      <SectionCard title="Momentos difíciles por hora del día">
        <div className="flex items-end justify-between gap-2" style={{ height: 100 }}>
          {Object.entries(periodCounts).map(([label, c]) => (
            <div key={label} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t-md" style={{ height: `${(c / maxPeriod) * 65}px`, minHeight: c > 0 ? 6 : 2, background: c > 0 ? C.trigger : C.border }} />
              <span className="text-[10px]" style={{ color: C.inkSoft }}>{label}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Lugares más frecuentes">{placeCounts.length === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>Aún no hay suficientes datos.</p> : placeCounts.map(([place, v]) => <StatBar key={place} label={place} value={v} max={maxPlace} color={C.joy} />)}</SectionCard>
    </div>
  );
}

/* ---------------- settings / export, import & session ---------------- */

function SettingsPanel({ onClose, onExport, onImport, onSignOut, saving, error, totalEntries, userEmail }) {
  const [closing, setClosing] = useState(false);
  function handleClose() { if (closing) return; setClosing(true); setTimeout(onClose, 200); }
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [mode, setMode] = useState("merge");
  const [done, setDone] = useState(false);

  function handleFile(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    setParseError(null); setDone(false);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.entries)) throw new Error("bad shape");
        setPendingPayload(parsed); setPendingFile(file.name);
      } catch (e) { setParseError("Ese archivo no parece ser un respaldo válido de Calmación."); setPendingPayload(null); setPendingFile(null); }
    };
    reader.readAsText(file);
  }
  async function confirmImport() { await onImport(pendingPayload, mode); setDone(true); setPendingPayload(null); setPendingFile(null); }

  return (
    <div className={closing ? "fade-out" : "fade-in"} style={{ position: "fixed", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, background: "rgba(20,27,23,0.45)" }} onClick={handleClose}>
      <div className={closing ? "slide-down" : "slide-up"} style={{ width: "100%", maxWidth: 448, borderRadius: "28px 28px 0 0", padding: "20px 20px 32px", maxHeight: "88vh", overflowY: "auto", background: C.surface }} onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl font-extrabold flex items-center gap-2" style={{ color: C.ink }}><Settings size={18} color={C.inkSoft} /> Opciones</h3>
          <button onClick={handleClose} aria-label="Cerrar" style={{ minWidth: 36, minHeight: 36 }}><X size={20} color={C.inkSoft} /></button>
        </div>
        {error && <div className="mb-4 px-4 py-3 rounded-2xl text-sm" style={{ background: C.episodeBg, color: C.episode }}>{error}</div>}

        <div className="rounded-[20px] p-4 mb-4" style={{ background: C.surfaceMuted, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-2"><Download size={16} color={C.accent} /><h4 className="font-display text-sm font-extrabold" style={{ color: C.ink }}>Exportar datos</h4></div>
          <p className="text-xs mb-3" style={{ color: C.inkSoft }}>Descarga un respaldo de tus {totalEntries} registros. Guárdalo antes de hacer cambios grandes a la app.</p>
          <button onClick={onExport} className="w-full rounded-full py-3 text-sm font-extrabold flex items-center justify-center gap-2" style={{ background: C.accent, color: "#fff", minHeight: 48 }}><Download size={15} /> Descargar respaldo (.json)</button>
        </div>

        <div className="rounded-[20px] p-4 mb-4" style={{ background: C.surfaceMuted, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-2"><Upload size={16} color={C.eq} /><h4 className="font-display text-sm font-extrabold" style={{ color: C.ink }}>Importar datos</h4></div>
          <p className="text-xs mb-3" style={{ color: C.inkSoft }}>Carga un archivo .json exportado antes desde Calma.</p>
          <label className="w-full rounded-full py-3 text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer" style={{ background: C.surface, color: C.ink, border: `1px solid ${C.border}`, minHeight: 48 }}>
            <Upload size={15} /> Elegir archivo
            <input type="file" accept="application/json" onChange={handleFile} className="hidden" />
          </label>
          {parseError && <div className="mt-3 px-3 py-2.5 rounded-xl text-xs flex items-center gap-2" style={{ background: C.episodeBg, color: C.episode }}><AlertTriangle size={13} /> {parseError}</div>}
          {pendingPayload && (
            <div className="mt-3 rounded-2xl p-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <p className="text-xs mb-2" style={{ color: C.ink }}><strong>{pendingFile}</strong> · {pendingPayload.entries.length} registros{pendingPayload.exportedAt ? `, del ${formatDate(pendingPayload.exportedAt)}` : ""}</p>
              <div className="flex gap-2 mb-3">
                <Chip label="Combinar con lo actual" active={mode === "merge"} onClick={() => setMode("merge")} color={C.eq} />
                <Chip label="Reemplazar todo" active={mode === "replace"} onClick={() => setMode("replace")} color={C.episode} />
              </div>
              {mode === "replace" && <div className="mb-3 px-3 py-2 rounded-xl text-[11px] flex items-start gap-1.5" style={{ background: C.episodeBg, color: C.episode }}><AlertTriangle size={12} className="shrink-0 mt-0.5" /> Esto borra tus registros actuales y los reemplaza por los del archivo. No se puede deshacer.</div>}
              <SaveButton disabled={false} saving={saving} color={mode === "replace" ? C.episode : C.eq} onClick={confirmImport}>{mode === "replace" ? "Reemplazar datos" : "Combinar registros"}</SaveButton>
            </div>
          )}
          {done && <div className="mt-3 px-3 py-2.5 rounded-xl text-xs flex items-center gap-2" style={{ background: C.accentBg, color: C.accentDeep }}><CheckCircle2 size={13} /> Importación completa.</div>}
        </div>

        <div className="rounded-[20px] p-4" style={{ background: C.surfaceMuted, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-2"><LogOut size={16} color={C.inkSoft} /><h4 className="font-display text-sm font-extrabold" style={{ color: C.ink }}>Cuenta</h4></div>
          {userEmail && <p className="text-xs mb-3" style={{ color: C.inkSoft }}>Conectado como {userEmail}</p>}
          <button onClick={onSignOut} className="w-full rounded-full py-3 text-sm font-extrabold flex items-center justify-center gap-2" style={{ background: C.surface, color: C.episode, border: `1px solid ${C.border}`, minHeight: 48 }}><LogOut size={15} /> Cerrar sesión</button>
        </div>
      </div>
    </div>
  );
}
