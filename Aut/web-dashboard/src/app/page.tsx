"use client";

import { Button } from "@/components/ui/button";
import { Clock, MessageSquare, UserPlus, Key, MousePointer2, TrendingUp, Zap } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import Image from "next/image";

// ==========================================================
// 🚀 LANCIATORE UFFICIALE BCS AI
// ==========================================================
const IS_LIVE_MODE = true;
// ==========================================================

export default function LandingPage() {
  const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, minutes: number, seconds: number } | null>(null);
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [formState, setFormState] = useState({ name: "", channel: "", message: "" });
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const targetDate = new Date("2026-02-28T00:00:00").getTime();
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate - now;
      if (distance < 0) {
        clearInterval(timer);
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      } else {
        setTimeLeft({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000)
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handlePartnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`Richiesta Partnership: ${formState.name}`);
    const body = encodeURIComponent(`Nome/Azienda: ${formState.name}\nCanale Telegram: ${formState.channel}\n\nProposta:\n${formState.message}`);
    window.location.href = `mailto:info@studiodigitale.eu?subject=${subject}&body=${body}`;
    toast.success("Client email aperto!");
    setIsPartnerModalOpen(false);
  };

  const showWaitToast = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    toast.info("Lancio ufficiale il 28 Febbraio!", {
      description: "Le registrazoni pubbliche apriranno a mezzanotte."
    });
  };

  const steps = [
    { icon: UserPlus, title: "1. Ti Registri", desc: "Crea il tuo account BCS AI in meno di un minuto. Accesso immediato senza attese.", img: "/steps/1.png" },
    { icon: Key, title: "2. Procedi alla Licenza", desc: "Attiva la prova gratuita e ottieni il tuo codice seriale univoco direttamente in dashboard.", img: "/steps/2.png" },
    { icon: MousePointer2, title: "3. Incolli nel Bot", desc: "Invia /licenza al bot del tuo canale segnali. Nessun server da configurare, pensiamo a tutto noi.", img: "/steps/3.png" },
    { icon: TrendingUp, title: "4. Fine. Il Bot Lavora.", desc: "Il sistema replica i trade sul tuo conto in millisecondi. Controlla i profitti in tempo reale.", img: "/steps/4.png" }
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-blue-500/30 overflow-hidden relative">

      {/* Modal Partnership */}
      <AnimatePresence>
        {isPartnerModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsPartnerModalOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative bg-[#0d0d0d] border border-white/10 w-full max-w-lg rounded-[2.5rem] p-8 md:p-12 shadow-2xl">
              <div className="mb-8 text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest mb-4">Canali & Partner</div>
                <h2 className="text-3xl font-black mb-2 leading-tight tracking-tighter">Proposta <span className="text-blue-500 italic">Business</span></h2>
                <p className="text-gray-400 text-sm">Contatto diretto: info@studiodigitale.eu</p>
              </div>

              <form onSubmit={handlePartnerSubmit} className="space-y-4">
                <input required value={formState.name} onChange={e => setFormState({ ...formState, name: e.target.value })} className="w-full bg-black border border-white/5 rounded-2xl h-14 px-5 text-white focus:border-blue-500 outline-none" placeholder="Nome o Azienda" />
                <input required value={formState.channel} onChange={e => setFormState({ ...formState, channel: e.target.value })} className="w-full bg-black border border-white/5 rounded-2xl h-14 px-5 text-white focus:border-blue-500 outline-none" placeholder="Link Canale Telegram" />
                <textarea required value={formState.message} onChange={e => setFormState({ ...formState, message: e.target.value })} className="w-full bg-black border border-white/5 rounded-3xl p-5 text-white focus:border-blue-500 outline-none min-h-[100px]" placeholder="Messaggio / Proposta..." />
                <Button type="submit" className="w-full h-16 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-600/20 uppercase tracking-widest">Invia Proposta</Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }} transition={{ duration: 8, repeat: Infinity }} className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/20 rounded-full blur-[120px]" />
        <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 10, repeat: Infinity, delay: 2 }} className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-purple-600/20 rounded-full blur-[150px]" />
      </div>

      {/* Navbar */}
      <motion.nav initial={{ y: -100 }} animate={{ y: 0 }} className="fixed top-0 w-full z-40 border-b border-white/5 bg-black/40 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            {/* Logo Container with Neon Effect - Photo 1 Style */}
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl blur opacity-25 group-hover:opacity-50 transition-opacity duration-500" />
              <div className="relative w-11 h-11 rounded-xl bg-black border border-white/10 flex items-center justify-center overflow-hidden shadow-2xl">
                <Image
                  src="/logo_bcs.png"
                  alt="BCS Logo"
                  width={34}
                  height={34}
                  className="object-contain brightness-110 contrast-125"
                />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-black text-xl tracking-tighter text-white uppercase italic leading-none">BCS AI</span>
              <span className="text-[8px] font-bold text-blue-500 uppercase tracking-[0.3em] leading-none mt-1">Intelligence Hub</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin" className="hidden md:flex text-[10px] font-black text-red-400 border border-red-500/20 bg-red-500/10 rounded-full px-4 py-1.5 uppercase hover:bg-red-500/20 transition-all">Area Admin</Link>
            <Link href="/sign-in" className="text-sm font-black text-gray-300 hover:text-white border border-white/5 rounded-full px-5 py-2 transition-all bg-white/5 hover:bg-white/10 backdrop-blur-md">Accedi</Link>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-10 md:pt-48 px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 mb-8 backdrop-blur-md">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] font-bold text-blue-200 uppercase tracking-[0.2em] font-mono">LANCIO: 28 FEB 2026 - 00:00</span>
          </div>
          <h1 className="text-6xl md:text-9xl font-black tracking-tighter mb-8 leading-[0.9] uppercase italic italic-shadow">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 pb-2 inline-block">Future.</span><br />
            Is Online.
          </h1>

          {!IS_LIVE_MODE && (
            <div id="launch-timer" className="grid grid-cols-4 gap-3 md:gap-8 max-w-2xl mx-auto mb-20 p-8 md:p-14 bg-[#0a0a0a80] border border-white/10 rounded-[4rem] backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              {[
                { label: "Days", val: timeLeft?.days ?? "00" },
                { label: "Hours", val: timeLeft?.hours ?? "00" },
                { label: "Mins", val: timeLeft?.minutes ?? "00" },
                { label: "Secs", val: timeLeft?.seconds ?? "00" }
              ].map((unit, i) => (
                <div key={i} className="flex flex-col items-center relative z-10">
                  <div className="text-5xl md:text-7xl font-black text-white mb-2 tabular-nums italic tracking-tighter">{String(unit.val).padStart(2, '0')}</div>
                  <div className="text-[8px] md:text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mb-1">{unit.label}</div>
                  <div className="w-8 h-0.5 bg-blue-500/20 rounded-full" />
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </section>

      {/* USER JOURNEY */}
      <section className="py-32 relative bg-gradient-to-b from-transparent via-blue-900/5 to-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-7xl font-black mb-8 tracking-tighter uppercase italic">Automazione <span className="text-blue-500">Zero Stress</span></h2>
            <div className="flex justify-center items-center gap-4 text-gray-500 font-bold uppercase tracking-[0.3em] text-[10px] border border-white/5 bg-zinc-900/40 px-6 py-2 rounded-full w-fit mx-auto">
              <span className="text-blue-500 tracking-normal italic">Nessun VPS da pagare</span> {"//"} <span>Configurazione istantanea</span>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-12 items-center">
            <div className="lg:w-1/3 flex flex-col gap-4">
              {steps.map((step, i) => (
                <div key={i} onMouseEnter={() => setActiveStep(i)} className={`p-6 md:p-8 rounded-[2rem] border transition-all cursor-pointer group relative overflow-hidden ${activeStep === i ? 'bg-[#0d0d0d] border-blue-500/40 shadow-2xl scale-[1.02]' : 'bg-transparent border-white/5 opacity-40 hover:opacity-100'}`}>
                  <div className="relative z-10">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-colors ${activeStep === i ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-gray-400'}`}>
                      <step.icon className="w-5 h-5" />
                    </div>
                    <h3 className={`text-xl font-black mb-2 uppercase ${activeStep === i ? 'text-white italic' : 'text-gray-400'}`}>{step.title}</h3>
                    <p className="text-sm text-gray-500 font-medium leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:w-2/3 w-full relative">
              <div className="absolute -inset-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[3rem] blur opacity-10" />
              <div className="relative aspect-[16/10] md:aspect-[16/9] bg-zinc-900 border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl">
                <AnimatePresence mode="wait">
                  <motion.div key={activeStep} initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.6 }} className="absolute inset-0">
                    <Image src={steps[activeStep].img} alt={steps[activeStep].title} fill className="object-cover" priority unoptimized />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-8 left-8">
                      <div className="flex items-center gap-3 bg-blue-600 border border-white/20 px-6 py-2 rounded-2xl shadow-2xl">
                        <span className="text-xs font-black uppercase tracking-[0.2em]">Punto {activeStep + 1} di 4</span>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="mt-20 text-center">
            <p className="text-blue-500 font-black text-[10px] uppercase tracking-[0.4em] flex items-center justify-center gap-3">
              <Zap className="w-4 h-4 fill-blue-500" /> Alimentato da Infrastruttura Cloud
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Table */}
      <section id="pricing" className="py-24 relative z-10 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16 underline decoration-blue-500/30 underline-offset-8">
          <h2 className="text-3xl md:text-5xl font-black mb-6 tracking-tighter italic uppercase text-white">Prezzi & Piani</h2>
        </div>
        <div className="flex justify-center mb-24">
          <div className="w-full max-w-2xl relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-[3rem] blur opacity-25" />
            <div className="relative bg-[#0a0a0a80] border border-white/10 p-10 md:p-16 rounded-[3rem] shadow-3xl backdrop-blur-2xl text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] mb-8">Attivabile dal 28.02</div>
              <h3 className="text-7xl md:text-[6.5rem] font-black mb-8 uppercase italic tracking-tighter leading-[0.9] flex flex-col items-center px-10">
                <span className="text-white">Provaci</span>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 py-2 px-2">Gratis</span>
              </h3>
              <p className="text-lg text-gray-500 mb-10 uppercase tracking-widest font-bold">14 Giorni Full Access</p>

              {/* Live mode logic */}
              {IS_LIVE_MODE ? (
                <Button asChild className="w-full h-20 bg-blue-600 hover:bg-blue-500 text-white rounded-3xl text-2xl font-black shadow-xl uppercase">
                  <Link href="/sign-up">Inizia Prova</Link>
                </Button>
              ) : (
                <Button onClick={showWaitToast} className="w-full h-20 bg-zinc-900 border border-white/10 text-gray-500 rounded-3xl text-xl font-black uppercase tracking-tighter cursor-not-allowed">
                  Lancio 28 Febbraio
                </Button>
              )}
              <p className="mt-8 text-xs text-gray-500 font-bold uppercase tracking-widest">Opzionale 30€/mese dopo la prova</p>
            </div>
          </div>
        </div>

        {/* White Label */}
        <div className="p-10 md:p-20 bg-gradient-to-br from-zinc-900 to-black border border-white/5 rounded-[4rem] relative overflow-hidden group shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px]" />
          <div className="relative z-20 flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="flex-1 text-center lg:text-left">
              <h4 className="text-blue-500 font-black text-xs uppercase mb-6 tracking-[0.4em] flex items-center justify-center lg:justify-start gap-3">
                <MessageSquare className="w-4 h-4" /> Partner Program
              </h4>
              <h2 className="text-4xl md:text-7xl font-black text-white mb-6 tracking-tighter uppercase italic leading-none">White Label</h2>
              <p className="text-xl text-gray-400/80 font-medium italic border-l-4 border-blue-600 pl-8 leading-relaxed max-w-2xl bg-black/20 py-4 rounded-r-3xl">
                &quot;Porta la tua sala segnali al livello superiore con la nostra tecnologia brevettata a marchio tuo.&quot;
              </p>
            </div>
            <div className="flex flex-col gap-4 w-full lg:w-auto relative z-30">
              <Button onClick={() => setIsPartnerModalOpen(true)} className="h-24 px-16 bg-white text-black hover:bg-zinc-100 rounded-[2.5rem] font-black text-2xl shadow-3xl transition-transform hover:scale-[1.03] uppercase italic tracking-tighter">
                Candidati Ora
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Partners Section (REINSTATED & IMPROVED VISIBILITY) */}
      <section className="py-32 relative z-[50]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-gray-600">Strategic Partners</h4>
          </div>
          <div className="flex flex-col md:flex-row justify-center items-center gap-10">
            <Link href="https://www.bcs-ai.com" target="_blank" className="p-12 bg-zinc-900/60 border border-white/10 rounded-[3rem] text-center hover:border-blue-500/40 transition-all w-full md:w-80 shadow-2xl backdrop-blur-xl group relative overflow-hidden">
              <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="text-blue-500 font-black text-[10px] tracking-widest uppercase mb-4 opacity-60">Finance & Strategy</div>
              <div className="text-white text-2xl font-black italic tracking-tighter group-hover:scale-105 transition-transform relative z-10">BCS ADVISORY</div>
            </Link>
            <Link href="https://www.studiodigitale.eu" target="_blank" className="p-12 bg-zinc-900/60 border border-white/10 rounded-[3rem] text-center hover:border-purple-500/40 transition-all w-full md:w-80 shadow-2xl backdrop-blur-xl group relative overflow-hidden">
              <div className="absolute inset-0 bg-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="text-purple-500 font-black text-[10px] tracking-widest uppercase mb-4 opacity-60">Legal Counsel</div>
              <div className="text-white text-2xl font-black italic tracking-tighter group-hover:scale-105 transition-transform relative z-10">STUDIO LEGALE BCS</div>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 bg-black relative z-[60] text-center">
        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center gap-10">
          <div className="flex flex-col items-center gap-4">
            {/* Logo Footer with Neon Effect */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl blur opacity-10 group-hover:opacity-30 transition-opacity duration-500" />
              <div className="relative w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden">
                <Image
                  src="/logo_bcs.png"
                  alt="BCS Logo"
                  width={28}
                  height={28}
                  className="object-contain opacity-80 group-hover:opacity-100 transition-opacity"
                />
              </div>
            </div>
            <span className="text-gray-500 text-[10px] font-black uppercase tracking-[0.5em]">powered by <Link href="https://www.bcs-ai.com" target="_blank" className="text-white hover:text-blue-500">BCS ADVISORY</Link></span>
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-700">
            &copy; 2026 BCS Advisory // Tutte le innovazioni sono riservate.
          </div>
        </div>
      </footer>
    </div>
  );
}