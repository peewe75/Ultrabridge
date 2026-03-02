"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { UserButton, useUser } from "@clerk/nextjs";
import { Copy, Plus, Activity, AlertCircle, Settings } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface License {
  id: string;
  license_key: string;
  plan: string;
  status: string;
  expires_at: string;
  created_at: string;
  allowed_accounts: string[];
  accounts_limit: number;
}

export default function UserDashboard() {
  const { user } = useUser();
  const [telegramId, setTelegramId] = useState("");
  const [hasTelegramId, setHasTelegramId] = useState<boolean | null>(null); // null means "checking"
  const [showMandatoryMessage, setShowMandatoryMessage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [licenseKey, setLicenseKey] = useState("Verifica in corso..."); // Stato per la chiave reale
  const [errorMsg, setErrorMsg] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [activeLicense, setActiveLicense] = useState<License | null>(null);
  const [mounted, setMounted] = useState(false);

  const handleStripeCheckout = async (plan: string) => {
    try {
      toast.info(`Reindirizzamento a Stripe per ${plan}...`);
      const res = await fetch("/api/user/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan })
      });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        toast.error("Errore Creazione Checkout", { description: "Impossibile contattare Stripe." });
      }
    } catch {
      toast.error("Errore Rete", { description: "Impossibile contattare il server." });
    }
  };

  const handleStripePortal = async () => {
    try {
      toast.info("Apertura Portale Clienti Stripe...");
      const res = await fetch("/api/user/portal", {
        method: "POST"
      });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        toast.error("Errore Portale Stripe", { description: "Devi prima effettuare un abbonamento per avere l'accesso." });
      }
    } catch {
      toast.error("Errore Rete", { description: "Impossibile contattare il server." });
    }
  };

  const fetchTelegramData = async () => {
    try {
      const res = await fetch("/api/user/me");
      if (res.ok) {
        const data = await res.json();
        setHasTelegramId(data.hasTelegramId ?? false);
        if (data.telegramId) setTelegramId(data.telegramId.toString());
        if (data.activeLicense) {
          setActiveLicense(data.activeLicense);
          setLicenseKey(data.activeLicense.license_key);
        } else {
          setLicenseKey("Nessuna licenza attiva");
        }
      }
    } catch (err) {
      console.error("Error fetching user data", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    if (user?.id) {
      fetchTelegramData();
    }
  }, [user?.id]);

  const handleSaveTelegramId = async () => {
    if (!telegramId || isNaN(Number(telegramId))) return;
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/user/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.licenseKey) {
          setLicenseKey(data.licenseKey);
          toast.success("Licenza Generata!", {
            description: "La tua nuova chiave è stata inviata anche sul tuo account Telegram."
          });
        }
        setHasTelegramId(true);
      } else {
        const text = await res.text();
        console.error("API error:", res.status, text);
        setErrorMsg(`Errore API (${res.status}): ${text}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Errore Sconosciuto";
      console.error(error);
      setErrorMsg(`Errore di rete: ${errorMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans relative">

      {/* POPUP OBBLIGATORIO TELEGRAM ID */}
      <Dialog open={hasTelegramId === false} onOpenChange={(open) => {
        if (!open) setShowMandatoryMessage(true);
      }}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          {showMandatoryMessage ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl text-red-500">
                  <AlertCircle className="w-6 h-6" />
                  Azione Obbligatoria
                </DialogTitle>
                <DialogDescription className="text-gray-400 pt-2">
                  L&apos;inserimento del <b>Telegram ID</b> è un passaggio strettamente necessario.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <p className="text-sm text-gray-300">
                  Senza questo dato non possiamo collegare l&apos;account ai server di trading, né inviarti i segnali operativi essenziali per il funzionamento delle licenze BCS AI.
                </p>
              </div>
              <DialogFooter className="flex flex-col gap-2">
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => setShowMandatoryMessage(false)}
                >
                  Torna all&apos;inserimento
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-gray-500 hover:text-white"
                  onClick={() => window.location.href = '/'}
                >
                  Esci e torna alla Home
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <AlertCircle className="text-blue-500 w-6 h-6" />
                  Collega Telegram
                </DialogTitle>
                <DialogDescription className="text-gray-400 pt-2">
                  Per poter generare e inviare la tua licenza, abbiamo bisogno del tuo <b>Telegram ID numerico</b>. Non inserire l&apos;username (@).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="tid" className="text-gray-300">Telegram ID Numerico</Label>
                  <Input
                    id="tid"
                    placeholder="es. 123456789"
                    className="bg-black border-white/10 text-white focus:border-blue-500"
                    value={telegramId}
                    onChange={(e) => setTelegramId(e.target.value)}
                  />
                </div>
                <p className="text-xs text-gray-500 bg-white/5 p-3 rounded-md">
                  💡 <b>Come trovarlo:</b> Cerca <code>@userinfobot</code> su Telegram, avvialo e copia il numero ID (es. 1958421) che ti restituisce.
                </p>
                {errorMsg && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
                    {errorMsg}
                  </div>
                )}
              </div>
              <DialogFooter className="flex flex-col gap-2">
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleSaveTelegramId}
                  disabled={isSubmitting || !telegramId}
                >
                  {isSubmitting ? "Salvataggio..." : "Salva e Genera Licenza"}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-gray-400 hover:text-white"
                  onClick={() => window.location.href = '/'}
                >
                  Indietro alla Home
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="border-b border-white/10 bg-zinc-950 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white">BCS</div>
          <span className="font-semibold text-xl">Dashboard Utente</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Licenza Attiva
          </div>
          <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: "w-10 h-10" } }} />
        </div>
      </header>

      <main className={`max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-3 gap-8 ${hasTelegramId === false || isLoading ? 'blur-sm pointer-events-none' : ''}`}>

        {/* Main Content (Left) */}
        <div className="md:col-span-2 space-y-8">

          {/* Subscription Card */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-8">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Il tuo Abbonamento</h2>
                <p className="text-gray-400">Gestisci il tuo piano e la fatturazione.</p>
              </div>
              <div className="bg-blue-600/10 text-blue-400 px-4 py-2 rounded-xl font-medium uppercase">
                {isLoading ? "CARICAMENTO..." : (activeLicense ? `PIANO ${activeLicense.plan}` : "NESSUN PIANO")}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-black/50 rounded-2xl p-4">
                <span className="text-sm text-gray-500 block mb-1">Scadenza</span>
                <span className="font-semibold text-lg">
                  {isLoading || !mounted ? "..." : (activeLicense?.expires_at ? new Date(activeLicense.expires_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : "-")}
                </span>
              </div>
              <div className="bg-black/50 rounded-2xl p-4">
                <span className="text-sm text-gray-500 block mb-1">Account Utilizzati</span>
                <span className="font-semibold text-lg">
                  {isLoading ? "..." : `${activeLicense?.allowed_accounts?.length || 0} / ${activeLicense?.accounts_limit || 2}`}
                </span>
              </div>
            </div>

            <div className="flex gap-4">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl" onClick={() => handleStripePortal()}>Gestisci su Stripe</Button>
              <Button variant="outline" className="border-white/10 hover:bg-white/5 rounded-xl text-black" onClick={() => handleStripeCheckout('PRO')}>Esegui Upgrade (PRO)</Button>
            </div>
          </div>

          {/* License & Configuration */}
          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-8">
            <h2 className="text-2xl font-semibold mb-6">La tua Licenza</h2>

            <div className="mb-0">
              <label className="text-sm text-gray-400 block mb-2">License Key</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-black/50 p-4 rounded-xl font-mono text-blue-400 border border-white/5 break-all">
                  {licenseKey}
                </code>
                <Button className="h-auto px-6 bg-zinc-800 hover:bg-zinc-700 rounded-xl" title="Copia negli appunti" onClick={() => { navigator.clipboard.writeText(licenseKey); toast.success('Copiato', { description: 'License Key copiata negli appunti.' }); }}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>

              {licenseKey.length > 30 && (
                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <p className="text-xs text-amber-200 mb-3">⚠️ Stai usando un formato chiave obsoleto (Legacy) non supportato dal Bot Telegram attuale.</p>
                  <Button
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold h-10 rounded-xl"
                    onClick={() => {
                      // Usa l'ID telegram salvato o chiedi di nuovo
                      handleSaveTelegramId();
                    }}
                  >
                    Converti in Licenza BCS AI
                  </Button>
                </div>
              )}

              <p className="text-sm text-gray-500 mt-4">Usa questa chiave per attivare il bot su Telegram tramite il comando <code>/sync</code>.</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium border-b border-white/10 pb-2">Account MT4/MT5 Autorizzati</h3>

              {isLoading ? (
                <div className="text-gray-500 text-sm">Caricamento account...</div>
              ) : activeLicense?.allowed_accounts && activeLicense.allowed_accounts.length > 0 ? (
                activeLicense.allowed_accounts.map((acc: string, idx: number) => (
                  <div key={idx} className="flex items-center justify-between bg-black/50 p-4 rounded-xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <Activity className="w-5 h-5 text-green-500" />
                      <span className="font-mono">{acc}</span>
                    </div>
                    <Button variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={() => toast.error('Azione Protetta', { description: 'La rimozione degli account sincronizzati deve essere fatta tramite bot Telegram.' })}>Rimuovi</Button>
                  </div>
                ))
              ) : (
                <div className="text-gray-500 text-sm py-2">Nessun account sincronizzato.</div>
              )}

              <Button variant="outline" className="w-full border-dashed border-white/20 text-gray-400 hover:text-white hover:border-white/40 h-14 rounded-xl mt-4 bg-transparent text-white focus:bg-white/5 focus:text-white" onClick={() => toast.info('Aggiunta Account MT4/MT5', { description: 'Per registrare un nuovo account, esegui il comando /sync dal bot Telegram del tuo VPS.' })}>
                <Plus className="w-4 h-4 mr-2" /> Aggiungi Account
              </Button>
            </div>
          </div>

        </div>

        {/* Sidebar (Right) */}
        <div className="space-y-8">
          <div className="bg-blue-900/20 border border-blue-500/20 rounded-3xl p-6">
            <h3 className="font-semibold text-blue-400 mb-2">Configurazione Auto-Trading</h3>
            <p className="text-sm text-blue-100/70 mb-4">
              Attiva il trading automatico. Inserisci le credenziali MT4/MT5 per copiare i segnali automaticamente.
            </p>
            <Link href="/dashboard/autotrading">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                <Settings className="w-4 h-4 mr-2" />
                Configura Auto-Trading
              </Button>
            </Link>
          </div>

          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
            <h3 className="font-semibold mb-4">Supporto</h3>
            <p className="text-sm text-gray-400 mb-4">Hai bisogno di aiuto con l&apos;installazione o hai problemi con la licenza?</p>
            <Button className="w-full bg-zinc-800 hover:bg-zinc-700 rounded-xl text-white" onClick={() => toast.success('Richiesta inviata', { description: 'Un assistente ti contatterà presto sul tuo Telegram.' })}>Contatta Assistenza</Button>
          </div>
        </div>

      </main>
    </div>
  );
}