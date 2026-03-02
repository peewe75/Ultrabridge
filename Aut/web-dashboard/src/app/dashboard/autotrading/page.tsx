"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { UserButton, useUser } from "@clerk/nextjs";
import { Settings, Eye, EyeOff, Loader2, Save, AlertCircle, CheckCircle, RefreshCcw, Signal, SignalLow, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { testParseSignal, ParsedSignal } from "@/lib/signal-parser";

export default function AutoTradingPage() {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [accountNumber, setAccountNumber] = useState("");
  const [password, setPassword] = useState("");
  const [brokerServer, setBrokerServer] = useState("");
  const [signalSource, setSignalSource] = useState("");
  const [riskPercentage, setRiskPercentage] = useState("1.0");
  const [fixedLots, setFixedLots] = useState("0.01");
  const [useFixedLots, setUseFixedLots] = useState(false);
  const [existingConfig, setExistingConfig] = useState(false);

  // Signal Tester State
  const [testSignalText, setTestSignalText] = useState("");
  const [testResult, setTestResult] = useState<ParsedSignal | null>(null);
  const [hasTested, setHasTested] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState<{
    status: 'CONNECTED' | 'ERROR' | 'NOT_CONFIGURED' | 'UNKNOWN';
    lastError?: string;
    lastUpdated?: string;
  }>({ status: 'UNKNOWN' });

  useEffect(() => {
    if (user?.id) {
      fetchCredentials();
      checkConnectionStatus();
    }
  }, [user?.id]);

  const fetchCredentials = async () => {
    try {
      const res = await fetch("/api/trading-credentials");
      if (res.ok) {
        const data = await res.json();
        if (data.tradingAccount) {
          setAccountNumber(data.tradingAccount.accountNumber || "");
          setBrokerServer(data.tradingAccount.brokerServer || "");
          if (data.tradingAccount.riskPercentage) setRiskPercentage(data.tradingAccount.riskPercentage.toString());
          if (data.tradingAccount.fixedLots) setFixedLots(data.tradingAccount.fixedLots.toString());
          setUseFixedLots(!!data.tradingAccount.fixedLots);
          setExistingConfig(true);
        }
        if (data.allowed_signal_source) {
          setSignalSource(data.allowed_signal_source);
        }
      }
    } catch (error) {
      console.error("Error fetching credentials:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkConnectionStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const res = await fetch("/api/trading-credentials/status");
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus(data);
      }
    } catch (error) {
      console.error("Error checking status:", error);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleSave = async () => {
    const cleanAccountNumber = accountNumber.trim().replace(/\.$/, "");

    if (!cleanAccountNumber || (!password && !existingConfig) || !brokerServer || !signalSource) {
      toast.error("Campi obbligatori mancanti", {
        description: "Compila tutti i campi obbligatori (la password è necessaria solo al primo salvataggio).",
      });
      return;
    }

    setIsSaving(true);

    try {
      const res = await fetch("/api/trading-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountNumber: cleanAccountNumber,
          password: password || null,
          brokerServer,
          signalSource,
          riskPercentage: useFixedLots ? null : (riskPercentage ? Number(riskPercentage) : 1.0),
          fixedLots: useFixedLots ? (fixedLots ? Number(fixedLots) : 0.01) : null,
        }),
      });

      if (res.ok) {
        toast.success("Configurazione salvata!", {
          description: "Le tue credenziali sono state salvate in modo sicuro.",
        });
        setExistingConfig(true);
        setPassword("");
        // Check status immediately after saving
        setTimeout(checkConnectionStatus, 2000);
      } else {
        const data = await res.json();
        toast.error("Errore nel salvataggio", {
          description: data.error || "Riprova più tardi.",
        });
      }
    } catch (error) {
      console.error("Error saving credentials:", error);
      toast.error("Errore di rete", {
        description: "Impossibile contattare il server.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestSignal = () => {
    if (!testSignalText.trim()) return;
    const result = testParseSignal(testSignalText);
    setTestResult(result);
    setHasTested(true);
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {/* Header */}
      <header className="border-b border-white/10 bg-zinc-950 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded-xl transition-colors group text-gray-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Torna alla Dashboard</span>
          </Link>
          <div className="h-6 w-px bg-white/10 mx-2" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white">BCS</div>
            <span className="font-semibold text-xl">Auto-Trading</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: "w-10 h-10" } }} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {!existingConfig && !isLoading && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-8 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
            <div>
              <p className="text-sm text-amber-200 font-medium">Licenza richiesta per l&apos;operatività</p>
              <p className="text-xs text-amber-200/60 mt-1">
                Assicurati di aver generato una licenza nella dashboard principale prima di attivare il trading reale.
              </p>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <Card className="bg-zinc-900/50 border-white/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Settings className="w-5 h-5 text-blue-400" />
                    Credenziali Trading
                  </CardTitle>
                  <CardDescription>
                    Inserisci i dettagli del tuo account MT4/MT5
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="accountNumber" className="text-gray-300 text-xs uppercase tracking-wider font-bold">Numero Conto MT4/MT5 *</Label>
                      <p className="text-[10px] text-gray-500 mb-1">Il numero identificativo del tuo conto di trading.</p>
                      <Input
                        id="accountNumber"
                        placeholder="Esempio: 101671232"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        className="bg-black/50 border-white/10 text-white focus:border-blue-500/50 transition-all h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-gray-300 text-xs uppercase tracking-wider font-bold">Password Trading *</Label>
                      <p className="text-[10px] text-gray-500 mb-1">La password Master o Investor fornita dal broker.</p>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder={existingConfig ? "•••••••• (lascia vuoto per non cambiare)" : "Inserisci la password del conto"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="bg-black/50 border-white/10 text-white pr-10 focus:border-blue-500/50 transition-all h-11"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="brokerServer" className="text-gray-300 text-xs uppercase tracking-wider font-bold">Server del Broker *</Label>
                      <p className="text-[10px] text-gray-500 mb-1">Il nome esatto del server (es. Ava-Demo, IC-Markets-Live).</p>
                      <Input
                        id="brokerServer"
                        placeholder="Esempio: Ava-Demo"
                        value={brokerServer}
                        onChange={(e) => setBrokerServer(e.target.value)}
                        className="bg-black/50 border-white/10 text-white focus:border-blue-500/50 transition-all h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signalSource" className="text-gray-300 text-xs uppercase tracking-wider font-bold">Sorgente Segnali (Telegram) *</Label>
                      <p className="text-[10px] text-gray-500 mb-1">ID del canale/gruppo da cui copiare i trade.</p>
                      <Input
                        id="signalSource"
                        placeholder="Esempio: @IlTuoCanaleSegnali"
                        value={signalSource}
                        onChange={(e) => setSignalSource(e.target.value)}
                        className="bg-black/50 border-white/10 text-white focus:border-blue-500/50 transition-all h-11"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between bg-white/5 p-4 rounded-2xl">
                      <div>
                        <Label className="text-sm font-semibold">Usa Lot Fisso</Label>
                        <p className="text-xs text-gray-400">Se disattivato, verrà usata la percentuale di rischio</p>
                      </div>
                      <Switch
                        checked={useFixedLots}
                        onCheckedChange={setUseFixedLots}
                      />
                    </div>

                    <div className="bg-white/5 p-4 rounded-2xl">
                      {useFixedLots ? (
                        <div className="space-y-2">
                          <Label htmlFor="fixedLots" className="text-xs uppercase tracking-wider text-gray-400">Volume Lotti</Label>
                          <Input
                            id="fixedLots"
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={fixedLots}
                            onChange={(e) => setFixedLots(e.target.value)}
                            className="bg-black border-white/10 text-white h-11"
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label htmlFor="riskPercentage" className="text-xs uppercase tracking-wider text-gray-400">Rischio per Operazione (%)</Label>
                          <Input
                            id="riskPercentage"
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="10"
                            value={riskPercentage}
                            onChange={(e) => setRiskPercentage(e.target.value)}
                            className="bg-black border-white/10 text-white h-11"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl font-bold shadow-lg shadow-blue-900/20"
                  >
                    {isSaving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvataggio...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Salva Configurazione</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-zinc-900/50 border-white/5 overflow-hidden">
                <div className="h-1 bg-blue-600 w-full" />
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center justify-between text-white">
                    Stato Account
                    <button
                      onClick={checkConnectionStatus}
                      disabled={isCheckingStatus}
                      className="text-gray-400 hover:text-white transition-colors"
                      title="Aggiorna stato"
                      aria-label="Aggiorna stato"
                    >
                      <RefreshCcw className={`w-4 h-4 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {connectionStatus.status === 'CONNECTED' ? (
                    <div className="flex flex-col items-center py-4 space-y-3">
                      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                        <Signal className="w-8 h-8 text-green-500" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-green-400">ONLINE</p>
                        <p className="text-xs text-gray-500">Pronto per copiare segnali</p>
                      </div>
                    </div>
                  ) : connectionStatus.status === 'ERROR' ? (
                    <div className="flex flex-col items-center py-4 space-y-3">
                      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                        <SignalLow className="w-8 h-8 text-red-500" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-red-400">ERRORE CONNESSIONE</p>
                        <p className="text-xs text-red-300/60 px-4 mt-2">
                          {connectionStatus.lastError || "Controlla le credenziali o il server."}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-4 space-y-3">
                      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                        <AlertCircle className="w-8 h-8 text-gray-500" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-gray-400 italic">NON CONFIGURATO</p>
                        <p className="text-xs text-gray-500">Completa il modulo a sinistra</p>
                      </div>
                    </div>
                  )}

                  {connectionStatus.lastUpdated && (
                    <p className="text-[10px] text-center text-gray-500 mt-4 border-t border-white/5 pt-4 uppercase tracking-tighter">
                      Ultimo aggiornamento: {new Date(connectionStatus.lastUpdated).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/20 border border-blue-500/20 rounded-3xl p-6">
                <h4 className="font-bold text-blue-300 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Consigli
                </h4>
                <ul className="text-xs text-blue-100/60 space-y-2 list-disc list-inside">
                  <li>Usa un rischio dell&apos;1% o 2% per operazione.</li>
                  <li>Assicurati che il server broker sia esatto.</li>
                  <li>Il bot deve essere admin nel canale segnali.</li>
                </ul>
              </div>

              {/* Signal Tester Card */}
              <Card className="bg-zinc-900/50 border-white/5 order-last">
                <CardHeader>
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                    <Signal className="w-4 h-4 text-purple-400" />
                    Tester Segnali (BCS AI Core)
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Incolla un messaggio della tua sala segnali per verificare la compatibilità.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Esempio: BUY GOLD @ 2650.50 SL: 2640.00 TP1: 2660.00"
                    value={testSignalText}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTestSignalText(e.target.value)}
                    className="bg-black/50 border-white/10 text-white text-xs min-h-[80px] focus:border-purple-500/50 transition-all"
                  />
                  <Button
                    onClick={handleTestSignal}
                    size="sm"
                    className="w-full bg-purple-600/20 hover:bg-purple-600/40 text-purple-200 border border-purple-500/30 h-9 transition-all"
                  >
                    Testa Messaggio
                  </Button>

                  {hasTested && (
                    <div className="mt-4 p-4 rounded-xl bg-black/40 border border-white/5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      {testResult ? (
                        <>
                          <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <span className="text-[10px] text-gray-500 uppercase font-bold">Risultato Parsing</span>
                            <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">Compatibile</span>
                          </div>
                          <div className="grid grid-cols-2 gap-y-2 text-xs">
                            <span className="text-gray-500">Azione:</span>
                            <span className={`font-bold ${testResult.side.includes('BUY') ? 'text-green-400' : 'text-red-400'}`}>{testResult.side}</span>

                            <span className="text-gray-500">Asset:</span>
                            <span className="text-white font-mono">{testResult.symbol}</span>

                            <span className="text-gray-500">Ingresso:</span>
                            <span className="text-blue-400 font-mono">{testResult.entryPrice || 'MERCATO'}</span>

                            <span className="text-gray-500">Stop Loss:</span>
                            <span className="text-red-400 font-mono">{testResult.stopLoss || 'NOT SET'}</span>

                            <span className="text-gray-500">Target (TP):</span>
                            <span className="text-yellow-400 font-mono">{testResult.takeProfits.join(' | ') || 'NOT SET'}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-2">
                          <AlertCircle className="w-5 h-5 text-red-500 mx-auto mb-2" />
                          <p className="text-xs text-red-400 font-medium">Formato non riconosciuto</p>
                          <p className="text-[10px] text-gray-500 mt-1">Assicurati che il messaggio contenga BUY/SELL e l&apos;Asset.</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
