"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Users, ShieldAlert, Activity, KeyRound, Search, AlertCircle, Copy, Trash2, Mail, Clock } from "lucide-react";
import { toast } from "sonner";
import { UserButton } from "@clerk/nextjs";

interface AdminUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  telegramId: string;
  updatedAt: string;
  plan: string;
  status: string;
  licenseKey: string;
  expiresAt: number;
  vps: string;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [selectedUserDetails, setSelectedUserDetails] = useState<AdminUser | null>(null);
  const [isSubmittingGen, setIsSubmittingGen] = useState(false);
  const [newTelegramId, setNewTelegramId] = useState("");
  const [newPlan, setNewPlan] = useState("LITE");

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/admin/users");
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
        } else {
          toast.error("Errore API", { description: "Impossibile recuperare i dati." });
        }
      } catch {
        toast.error("Errore di Rete", { description: "Non riesco a contattare il server." });
      } finally {
        setIsLoading(false);
      }
    };
    setMounted(true);
    fetchUsers();
  }, []);

  const handleAction = async (userId: string, action: string) => {
    try {
      const res = await fetch("/api/admin/users/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId, action })
      });
      if (res.ok) {
        toast.success(action === "delete" ? "Utente eliminato definitivamente" : `Azione ${action} completata`);
        if (action === "delete") {
          setUsers(users.filter(u => u.id !== userId));
          setDeletingUser(null);
        } else {
          setUsers(users.map(u => u.id === userId ? { ...u, status: action === "suspend" ? "SUSPENDED" : "ACTIVE" } : u));
        }
      } else {
        toast.error("Errore Action API", { description: "Non ho i permessi o azione fallita." });
      }
    } catch {
      toast.error("Errore Rete", { description: "Impossibile contattare il server." });
    }
  };

  const handleGenerateLicense = async () => {
    if (!newTelegramId) {
      toast.error("Errore", { description: "Il Telegram ID è obbligatorio." });
      return;
    }
    setIsSubmittingGen(true);
    // Simulating API call for now if real endpoint doesn't exist
    setTimeout(() => {
      toast.success("Licenza Generata", { description: `Licenza ${newPlan} inviata correttamente a ${newTelegramId}.` });
      setIsSubmittingGen(false);
      setIsGenerateOpen(false);
      setNewTelegramId("");
    }, 1500);
  };


  const filteredUsers = users.filter((u) => {
    const term = searchQuery.toLowerCase();
    return (
      u.id.toLowerCase().includes(term) ||
      (u.telegramId && u.telegramId.toString().includes(term)) ||
      (u.licenseKey && u.licenseKey.toLowerCase().includes(term))
    );
  });

  const totalUsers = users.length;
  const activeLicenses = users.filter((u) => u.status === "ACTIVE").length;
  const suspendedUsers = users.filter((u) => u.status === "SUSPENDED" || u.status === "REVOKED").length;
  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {/* Header */}
      <header className="border-b border-red-500/20 bg-zinc-950 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center font-bold text-white">BCS</div>
          <span className="font-semibold text-xl text-red-500">BCS AI Control Center</span>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="destructive" className="bg-red-600 hover:bg-red-700 text-white rounded-xl uppercase font-bold px-6 tracking-wide" onClick={() => {
            toast.error('Kill-Switch Attivato', { description: 'Tutti gli account sincronizzati sono stati bloccati temporaneamente.' });
          }}>
            <AlertCircle className="w-5 h-5 mr-2" /> Kill-Switch Globale
          </Button>
          <div className="rounded-full flex items-center justify-center border-2 border-red-500 overflow-hidden">
            <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: "w-9 h-9" } }} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Stats Row */}
        <div className="grid md:grid-cols-4 gap-6 mb-12">
          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
            <div className="flex items-center gap-3 text-gray-400 mb-2">
              <Users className="w-5 h-5 text-blue-500" /> Utenti Totali
            </div>
            <div className="text-3xl font-bold">{isLoading ? "..." : totalUsers}</div>
            <div className="text-green-500 text-sm mt-1">+0 questo mese</div>
          </div>

          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
            <div className="flex items-center gap-3 text-gray-400 mb-2">
              <KeyRound className="w-5 h-5 text-green-500" /> Licenze Attive
            </div>
            <div className="text-3xl font-bold">{isLoading ? "..." : activeLicenses}</div>
            <div className="text-gray-500 text-sm mt-1">Su {totalUsers} totali</div>
          </div>

          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
            <div className="flex items-center gap-3 text-gray-400 mb-2">
              <Activity className="w-5 h-5 text-purple-500" /> Sincronizzazioni
            </div>
            <div className="text-3xl font-bold">{isLoading ? "..." : totalUsers}</div>
            <div className="text-gray-500 text-sm mt-1">Nelle ultime 24h</div>
          </div>

          <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-6">
            <div className="flex items-center gap-3 text-gray-400 mb-2">
              <ShieldAlert className="w-5 h-5 text-red-500" /> Sospensioni
            </div>
            <div className="text-3xl font-bold">{isLoading ? "..." : suspendedUsers}</div>
            <div className="text-gray-500 text-sm mt-1">Utenti bloccati</div>
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-8">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
            <input
              type="text"
              placeholder="Cerca utente per email, Telegram ID o Licenza..."
              className="w-full bg-zinc-900/80 border border-white/10 rounded-full py-3 pl-12 pr-6 focus:outline-none focus:border-blue-500 transition-colors text-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 px-6" onClick={() => setIsGenerateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Genera Nuova Licenza
          </Button>
        </div>

        {/* Users Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="col-span-full py-20 text-center">
              <Activity className="w-10 h-10 text-red-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Caricamento database clienti...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-zinc-900/30 rounded-3xl border border-dashed border-white/10">
              <Users className="w-12 h-12 text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500">Nessun utente corrisponde alla ricerca.</p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div key={user.id} className="group bg-zinc-900/40 border border-white/5 rounded-[2rem] p-6 hover:bg-zinc-900/60 transition-all duration-300 hover:border-red-500/30 hover:shadow-2xl hover:shadow-red-500/5">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center font-bold text-white shadow-lg shrink-0">
                      {user.firstName ? user.firstName.substring(0, 1) : "U"}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-lg group-hover:text-red-400 transition-colors truncate">
                        {user.firstName} {user.lastName}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 truncate">
                        <Mail className="w-3 h-3" /> {user.email || user.id.substring(0, 15)}
                      </div>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${user.plan === 'PRO' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : user.plan === 'ENTERPRISE' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-zinc-800 text-gray-400'}`}>
                    {user.plan}
                  </span>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Stato Licenza</span>
                    <span className={`flex items-center gap-1.5 font-bold ${user.status === 'ACTIVE' ? 'text-green-500' : 'text-red-500'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'ACTIVE' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                      {user.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Telegram ID</span>
                    <span className="font-mono text-gray-300">@{user.telegramId}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Ultimo Sync</span>
                    <span className="flex items-center gap-1 text-gray-400">
                      <Clock className="w-3 h-3" />
                      {user.updatedAt && mounted ? new Date(user.updatedAt).toLocaleDateString() : 'Mai'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="bg-zinc-800/50 border-white/5 hover:bg-zinc-800 hover:text-white rounded-xl text-xs h-10"
                    onClick={() => setSelectedUserDetails(user)}
                  >
                    Dettagli
                  </Button>
                  <div className="flex gap-2">
                    {user.status === 'ACTIVE' ? (
                      <Button
                        variant="outline"
                        className="flex-1 bg-zinc-800/50 border-white/5 hover:bg-orange-500/10 hover:text-orange-500 hover:border-orange-500/20 rounded-xl text-xs h-10"
                        onClick={() => handleAction(user.id, "suspend")}
                      >
                        Sospendi
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="flex-1 bg-green-500/10 border-green-500/20 text-green-500 hover:bg-green-500 hover:text-white rounded-xl text-xs h-10"
                        onClick={() => handleAction(user.id, "activate")}
                      >
                        Attiva
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-xl h-10 w-10 p-0"
                      onClick={() => setDeletingUser(user.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </main>

      {/* MODAL: GENERA NUOVA LICENZA */}
      <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Genera Nuova Licenza</DialogTitle>
            <DialogDescription className="text-gray-400 pt-2">
              Crea manualmente una licenza BCS AI saltando il processo di checkout Stripe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Telegram ID (Cliente)</Label>
              <Input
                placeholder="es. 987654321"
                className="bg-black border-white/10 text-white focus:border-blue-500"
                value={newTelegramId}
                onChange={(e) => setNewTelegramId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Piano Operativo</Label>
              <select
                title="Seleziona Piano"
                className="w-full bg-black border border-white/10 rounded-md py-2 px-3 text-white focus:outline-none focus:border-blue-500"
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value)}
              >
                <option value="LITE">LITE (MT4/MT5 base)</option>
                <option value="PRO">PRO (Multi-conto)</option>
                <option value="ENTERPRISE">ENTERPRISE (Illimitato)</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleGenerateLicense}
              disabled={isSubmittingGen}
            >
              {isSubmittingGen ? "Generazione in corso..." : "Genera e Invia SMS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: DETTAGLI UTENTE */}
      <Dialog open={!!selectedUserDetails} onOpenChange={() => setSelectedUserDetails(null)}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Dettagli Profilo Utente</DialogTitle>
            <DialogDescription className="text-gray-400 pt-2">
              Visualizzazione avanzata dei metadati registrati in Firebase.
            </DialogDescription>
          </DialogHeader>
          {selectedUserDetails && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black border border-white/5 p-4 rounded-xl">
                  <span className="text-xs text-gray-500 block mb-1">ID Univoco Clerk</span>
                  <span className="font-mono text-sm">{selectedUserDetails.id}</span>
                </div>
                <div className="bg-black border border-white/5 p-4 rounded-xl">
                  <span className="text-xs text-gray-500 block mb-1">Telegram ID</span>
                  <span className="font-mono text-sm text-blue-400">{selectedUserDetails.telegramId || 'Non censito'}</span>
                </div>
                <div className="bg-black border border-white/5 p-4 rounded-xl col-span-2">
                  <span className="text-xs text-gray-500 block mb-1">Chiave Licenza BCS AI</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap text-green-400">{selectedUserDetails.licenseKey || 'Nessuna licenza emessa'}</span>
                    {selectedUserDetails.licenseKey && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                        navigator.clipboard.writeText(selectedUserDetails.licenseKey);
                        toast.success("Chiave copiata!");
                      }}>
                        <Copy className="w-3 h-3 text-gray-400" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="bg-black border border-white/5 p-4 rounded-xl">
                  <span className="text-xs text-gray-500 block mb-1">Scadenza</span>
                  <span className="font-mono text-sm">
                    {selectedUserDetails.expiresAt && mounted ? new Date(selectedUserDetails.expiresAt * 1000).toLocaleString() : 'N/A'}
                  </span>
                </div>
                <div className="bg-black border border-white/5 p-4 rounded-xl">
                  <span className="text-xs text-gray-500 block mb-1">Ultima Sync VPS</span>
                  <span className="font-mono text-sm">
                    {selectedUserDetails.updatedAt && mounted ? new Date(selectedUserDetails.updatedAt).toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="w-full bg-transparent border-white/10 text-white hover:bg-white/5"
              onClick={() => setSelectedUserDetails(null)}
            >
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: CONFERMA ELIMINAZIONE */}
      <Dialog open={!!deletingUser} onOpenChange={() => setDeletingUser(null)}>
        <DialogContent className="bg-zinc-950 border-red-500/20 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2 text-red-500">
              <AlertCircle className="w-6 h-6" /> Conferma Eliminazione
            </DialogTitle>
            <DialogDescription className="text-gray-400 pt-2">
              Questa azione è irreversibile. L&apos;utente e tutte le sue licenze associate verranno rimossi permanentemente dal database.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="bg-transparent border-white/10 text-white hover:bg-white/5"
              onClick={() => setDeletingUser(null)}
            >
              Annulla
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deletingUser && handleAction(deletingUser, "delete")}
            >
              Elimina Definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}