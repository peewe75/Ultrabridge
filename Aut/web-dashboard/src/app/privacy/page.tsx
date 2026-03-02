"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, Lock, Eye, FileText, Scale } from "lucide-react";

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30">
            {/* Background Glow */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900/20 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative max-w-4xl mx-auto px-6 py-12 md:py-24">
                {/* Navigation */}
                <Link href="/">
                    <Button variant="ghost" className="mb-8 group text-gray-400 hover:text-white hover:bg-white/5 transition-all">
                        <ArrowLeft className="mr-2 w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Torna alla Home
                    </Button>
                </Link>

                {/* Header */}
                <header className="mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-4 uppercase tracking-wider">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Documento Legale
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        Protocollo Privacy
                    </h1>
                    <div className="flex flex-wrap items-center gap-6 text-sm text-gray-400">
                        <span className="flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Ultimo Aggiornamento: 2026.02.16
                        </span>
                        <span className="flex items-center gap-2">
                            <Scale className="w-4 h-4 text-green-500" />
                            Stato: <span className="text-green-500 font-medium tracking-wide">ATTIVO // COMPLIANCE: GDPR</span>
                        </span>
                    </div>
                </header>

                {/* Content */}
                <div className="space-y-12 text-gray-300 leading-relaxed">

                    <section className="bg-zinc-900/30 border border-white/5 p-8 rounded-3xl backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-4 text-white">
                            <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
                                <Lock className="w-5 h-5 text-blue-500" />
                            </div>
                            <h2 className="text-xl font-semibold">1. Titolare del Trattamento</h2>
                        </div>
                        <p>
                            I dati vengono trattati da <strong>BCS Advisory</strong>, con sede in <strong>Via Matteotti n. 33, Cantù (CO)</strong> (di seguito &quot;Titolare&quot;).
                            Potete contattarci all&apos;indirizzo email: <a href="mailto:info@studiodigitale.eu" className="text-blue-400 hover:underline">info@studiodigitale.eu</a>.
                            Il nostro approccio è <span className="text-blue-400 font-medium">Data Minimization</span>: raccogliamo solo ciò che è strettamente necessario per l&apos;operatività dei nostri sistemi di automazione.
                        </p>
                    </section>

                    <section>
                        <div className="flex items-center gap-3 mb-6 text-white text-xl font-semibold">
                            <div className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-500">
                                <Eye className="w-5 h-5" />
                            </div>
                            <h2>2. Tipologia dei Dati Trattati</h2>
                        </div>
                        <div className="grid md:grid-cols-3 gap-6">
                            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-white/5">
                                <h3 className="text-white font-medium mb-2">Dati di Contatto</h3>
                                <p className="text-sm text-gray-400">Indirizzo email, nome (facoltativo), azienda (facoltativo). Forniti tramite il modulo di contatto &quot;Comando&quot;.</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-white/5">
                                <h3 className="text-white font-medium mb-2">Dati Navigazione</h3>
                                <p className="text-sm text-gray-400">Indirizzi IP, URI, orari delle richieste acquisiti automaticamente per il funzionamento del sito.</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-white/5">
                                <h3 className="text-white font-medium mb-2">Cookie Tecnici</h3>
                                <p className="text-sm text-gray-400">Necessari per la navigazione. Non utilizziamo cookie di profilazione senza consenso esplicito.</p>
                            </div>
                        </div>
                    </section>

                    <section className="bg-zinc-900/30 border border-white/5 p-8 rounded-3xl">
                        <h2 className="text-xl font-semibold mb-6 text-white">3. Finalità del Trattamento</h2>
                        <p className="mb-4">I tuoi dati vengono processati esclusivamente per:</p>
                        <ul className="space-y-3 list-none">
                            <li className="flex items-start gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                                <span>Rispondere alle richieste operative inviate tramite il modulo di contatto.</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                                <span>Garantire la sicurezza e l&apos;integrità del sistema (rilevamento minacce).</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                                <span>Adempiere agli obblighi legali previsti dalla normativa vigente (2026).</span>
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-white">4. Modalità e Sicurezza</h2>
                        <p>
                            Il trattamento avviene mediante strumenti informatici e telematici con logiche strettamente correlate alle finalità.
                            Utilizziamo protocolli di crittografia avanzata e firewall per proteggere i dati da accessi non autorizzati
                            (<span className="italic text-gray-400">Privacy by Design</span>).
                        </p>
                    </section>

                    <section className="bg-blue-900/10 border border-blue-500/10 p-8 rounded-3xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <ShieldCheck className="w-24 h-24" />
                        </div>
                        <h2 className="text-xl font-semibold mb-6 text-white flex items-center gap-3">
                            5. Diritti dell&apos;Interessato
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-8">
                            <div className="text-sm font-medium text-white flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-400" /> Accesso ai dati
                            </div>
                            <div className="text-sm font-medium text-white flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-400" /> Rettifica
                            </div>
                            <div className="text-sm font-medium text-white flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-400" /> Cancellazione (Oblio)
                            </div>
                            <div className="text-sm font-medium text-white flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-400" /> Limitazione
                            </div>
                            <div className="text-sm font-medium text-white flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-400" /> Portabilità
                            </div>
                            <div className="text-sm font-medium text-white flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-400" /> Opposizione
                            </div>
                        </div>
                    </section>

                    <footer className="pt-12 border-t border-white/5 text-center text-sm text-gray-500">
                        <p>© 2026 BCS Advisory // Via Matteotti n. 33, Cantù (CO) // info@studiodigitale.eu</p>
                        <p className="mt-2">Tutti i diritti riservati.</p>
                    </footer>
                </div>
            </div>
        </div>
    );
}
