import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { Clock, Lock } from "lucide-react";

// ==========================================================
// 🚀 LANCIATORE UFFICIALE BCS AI
// ==========================================================
const IS_LIVE_MODE = true; // ✅ LIVE
// ==========================================================

export default function Page() {
  if (IS_LIVE_MODE) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 selection:bg-blue-500/30">
        <div className="mb-6">
          <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group">
            <div className="p-2 rounded-full bg-zinc-900 border border-white/5 transition-all">
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <span className="text-sm font-medium">Torna alla Home</span>
          </Link>
        </div>

        <div className="max-w-[400px] w-full mb-8 text-center bg-zinc-900/50 border border-white/5 p-4 rounded-2xl backdrop-blur-sm shadow-2xl">
          <p className="text-xs text-gray-400 leading-relaxed">
            Procedendo con la registrazione, dichiari di aver visionato e autorizzato il trattamento dei tuoi dati secondo il <Link href="/privacy" className="text-blue-500 hover:underline font-medium">Protocollo Privacy BCS AI</Link>.
            <br /><span className="text-[10px] mt-1 block text-gray-500 uppercase tracking-tighter italic">Compliance GDPR 2026 // Data Minimization Enabled</span>
          </p>
        </div>

        <SignUp appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-zinc-950 border border-white/10 shadow-2xl",
            headerTitle: "text-white font-bold",
            headerSubtitle: "text-gray-400 font-medium",
            socialButtonsBlockButton: "bg-zinc-900 border-white/10 text-white hover:bg-zinc-800 transition-all",
            dividerLine: "bg-white/10",
            dividerText: "text-gray-500",
            formFieldLabel: "text-gray-300",
            formFieldInput: "bg-black border-white/10 text-white focus:border-blue-500 transition-all",
            formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20",
            footerActionText: "text-gray-400",
            footerActionLink: "text-blue-500 hover:text-blue-400 transition-colors",
          }
        }} />
      </div>
    );
  }

  // MODALITÀ PRE-LANCIO (COMING SOON)
  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 font-sans">
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-md w-full text-center scale-up-center">
        <div className="mb-10 inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-zinc-900 border border-white/10 shadow-2xl animate-pulse">
          <Lock className="w-8 h-8 text-blue-500" />
        </div>

        <h1 className="text-4xl font-black mb-6 tracking-tight leading-tight">
          Registrazioni <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 font-black">Temporaneamente Chiuse</span>
        </h1>

        <p className="text-gray-400 mb-10 leading-relaxed font-medium">
          Stiamo ultimando la configurazione dei server BCS AI.
          <br />Le registrazioni apriranno ufficialmente il:
        </p>

        <div className="mb-12 inline-block bg-white/5 border border-white/10 px-8 py-3 rounded-2xl shadow-2xl">
          <span className="text-white font-black text-xl tracking-wider">28 FEBBRAIO 2026 - 00:00</span>
        </div>

        <div className="flex flex-col gap-4">
          <Link href="/" className="w-full h-14 bg-white text-black hover:bg-gray-200 rounded-2xl flex items-center justify-center font-bold text-lg shadow-xl transition-all hover:scale-[1.02]">
            Torna alla Home
          </Link>
          <Link href="/sign-in" className="w-full h-14 border border-white/10 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center font-bold text-gray-300 transition-all hover:scale-[1.02]">
            Sei già un tester? Accedi qui
          </Link>
        </div>

        <div className="mt-12 pt-8 border-t border-white/5 flex items-center justify-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em]">
          <Clock className="w-3 h-3 text-blue-500" />
          BCS AI System // Deployment Status: Calibration
        </div>
      </div>
    </div>
  );
}