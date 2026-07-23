import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { C, MonkMark } from "./theme.jsx";

const inputStyle = { border: `1px solid ${C.border}`, color: C.ink, background: C.surfaceMuted, borderRadius: 14 };

function friendlyError(message) {
  if (!message) return "Algo salió mal. Intenta de nuevo.";
  if (message.includes("Invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (message.includes("User already registered")) return "Ya existe una cuenta con ese correo. Inicia sesión.";
  if (message.includes("Password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
  return message;
}

export default function Auth() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  async function handleSubmit(ev) {
    ev.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password });
        if (signUpError) throw signUpError;
        setInfo("Cuenta creada. Si tu proyecto de Supabase pide confirmación por correo, revísalo antes de entrar.");
        setMode("signin");
      }
    } catch (e) {
      setError(friendlyError(e.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }} className="flex items-center justify-center p-6">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.7s linear infinite; }
        button:focus-visible, input:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; }
      `}</style>
      <div className="w-full" style={{ maxWidth: 380 }}>
        <div className="text-center mb-8">
          <div className="mx-auto mb-3" style={{ width: 40 }}><MonkMark size={40} color={C.accent} /></div>
          <h1 className="font-display text-2xl font-extrabold" style={{ color: C.ink, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Calmación</h1>
          <p className="text-sm mt-1" style={{ color: C.inkSoft }}>Tu bitácora personal de calma</p>
        </div>

        <div className="rounded-[22px] p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex gap-1 mb-5 rounded-full p-1" style={{ background: C.surfaceMuted }}>
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
              className="flex-1 py-2 rounded-full text-xs font-bold"
              style={{ background: mode === "signin" ? C.surface : "transparent", color: mode === "signin" ? C.ink : C.inkSoft, minHeight: 36 }}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
              className="flex-1 py-2 rounded-full text-xs font-bold"
              style={{ background: mode === "signup" ? C.surface : "transparent", color: mode === "signup" ? C.ink : C.inkSoft, minHeight: 36 }}
            >
              Crear cuenta
            </button>
          </div>

          {error && <div className="mb-4 px-4 py-3 rounded-2xl text-sm" style={{ background: C.episodeBg, color: C.episode }}>{error}</div>}
          {info && <div className="mb-4 px-4 py-3 rounded-2xl text-sm" style={{ background: C.accentBg, color: C.accentDeep }}>{info}</div>}

          <form onSubmit={handleSubmit}>
            <label className="mb-4 block">
              <span className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: C.inkSoft }}>Correo</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 text-sm"
                style={inputStyle}
              />
            </label>
            <label className="mb-5 block">
              <span className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: C.inkSoft }}>Contraseña</span>
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 text-sm"
                style={inputStyle}
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full py-3.5 text-sm font-extrabold flex items-center justify-center gap-2"
              style={{ background: loading ? C.border : C.accent, color: loading ? C.inkFaint : "#fff", minHeight: 50, cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading && <Loader2 size={15} className="spin" />}
              {mode === "signin" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
