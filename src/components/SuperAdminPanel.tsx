import React, { useState, useEffect } from "react";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getFirestore,
  getDocs,
} from "firebase/firestore";
import { initializeApp, getApp } from "firebase/app";
import { OfficeSubscription, SubscriptionStatus } from "../../types";
import { Icons } from "../../constants";
import firebaseConfig from "../../firebase-applet-config.json";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export default function SuperAdminPanel() {
  const [subscriptions, setSubscriptions] = useState<OfficeSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "database">("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Partial<OfficeSubscription> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Form state for adding/editing
  const [formData, setFormData] = useState({
    officeId: "",
    officeName: "",
    ownerEmail: "",
    ownerId: "",
    status: SubscriptionStatus.FREE_TRIAL,
    validUntil: "",
    planName: "Plano Mensal",
  });

  const handleStatusChange = (newStatus: SubscriptionStatus) => {
    let targetPlanName = formData.planName;
    let targetValidUntil = formData.validUntil;

    if (newStatus === SubscriptionStatus.GRATIS) {
      targetPlanName = "Plano Cortesia";
      targetValidUntil = "2099-12-31";
    } else if (newStatus === SubscriptionStatus.FREE_TRIAL) {
      if (targetPlanName === "Plano Cortesia") {
        targetPlanName = "Período de Testes";
      }
      if (targetValidUntil === "2099-12-31" || !targetValidUntil) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        targetValidUntil = d.toISOString().split("T")[0];
      }
    } else if (newStatus === SubscriptionStatus.ACTIVE) {
      if (targetPlanName === "Plano Cortesia" || targetPlanName === "Período de Testes") {
        targetPlanName = "Plano Mensal";
      }
      if (targetValidUntil === "2099-12-31" || !targetValidUntil) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        targetValidUntil = d.toISOString().split("T")[0];
      }
    }

    setFormData(prev => ({
      ...prev,
      status: newStatus,
      planName: targetPlanName,
      validUntil: targetValidUntil,
    }));
  };

  const db = getFirestore(getApp(), firebaseConfig.firestoreDatabaseId);

  // Subscribe to all office subscriptions
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "officeSubscriptions"),
      (snapshot) => {
        const subs: OfficeSubscription[] = [];
        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() || {};
          const thirtyDaysFromNow = new Date();
          thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
          const defaultValidUntil = thirtyDaysFromNow.toISOString().split("T")[0];

          subs.push({
            officeId: raw.officeId || docSnap.id,
            officeName: raw.officeName || "Escritório Sem Nome",
            ownerId: raw.ownerId || "",
            ownerEmail: raw.ownerEmail || "",
            status: raw.status || SubscriptionStatus.FREE_TRIAL,
            validUntil: raw.validUntil || defaultValidUntil,
            planName: raw.planName || "Plano Mensal",
            createdAt: raw.createdAt || new Date().toISOString(),
            updatedAt: raw.updatedAt || new Date().toISOString()
          } as OfficeSubscription);
        });
        // Sort by last updated or created
        subs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setSubscriptions(subs);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching subscriptions:", error);
        setErrorMsg("Erro ao carregar assinaturas: " + error.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [db]);

  // Handle status quick change
  const handleToggleStatus = async (sub: OfficeSubscription, newStatus: SubscriptionStatus) => {
    try {
      const docRef = doc(db, "officeSubscriptions", sub.officeId);
      let validUntil = sub.validUntil;
      let planName = sub.planName || "Plano Mensal";
      
      // If activating/renewing, add 30 days of subscription from now
      if (newStatus === SubscriptionStatus.ACTIVE) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        validUntil = d.toISOString().split("T")[0];
        planName = "Plano Mensal";
      } else if (newStatus === SubscriptionStatus.GRATIS) {
        validUntil = "2099-12-31"; // long validity
        planName = "Plano Cortesia";
      } else if (newStatus === SubscriptionStatus.FREE_TRIAL) {
        planName = "Período de Testes";
      }

      await updateDoc(docRef, {
        status: newStatus,
        validUntil,
        planName,
        updatedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      alert("Erro ao atualizar status: " + e.message);
    }
  };

  // Keep a status helper
  const getBadgeStyle = (status: SubscriptionStatus) => {
    switch (status) {
      case SubscriptionStatus.ACTIVE:
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case SubscriptionStatus.FREE_TRIAL:
        return "bg-sky-100 text-sky-800 border-sky-200";
      case SubscriptionStatus.GRATIS:
        return "bg-purple-100 text-purple-800 border-purple-200";
      case SubscriptionStatus.PENDING_PAYMENT:
        return "bg-amber-100 text-amber-800 border-amber-200";
      case SubscriptionStatus.PENDING_CHOICE:
        return "bg-slate-200 text-slate-800 border-slate-300";
      case SubscriptionStatus.BLOCKED:
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  // Filter list
  const filteredSubs = subscriptions.filter((sub) => {
    const officeNameStr = sub.officeName || "";
    const ownerEmailStr = sub.ownerEmail || "";
    const officeIdStr = sub.officeId || "";

    const matchesSearch =
      officeNameStr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ownerEmailStr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      officeIdStr.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Check custom expiration
    const isExpired = sub.validUntil ? (new Date(sub.validUntil) < new Date() && sub.status !== SubscriptionStatus.GRATIS) : false;
    
    if (statusFilter === "ALL") return matchesSearch;
    if (statusFilter === "EXPIRED") return matchesSearch && isExpired;
    if (statusFilter === "ACTIVE_PAID") return matchesSearch && sub.status === SubscriptionStatus.ACTIVE && !isExpired;
    return matchesSearch && sub.status === statusFilter;
  });

  // Calculate metrics
  const totalOffices = subscriptions.length;
  const now = new Date();
  const activePaidOffices = subscriptions.filter(s => s.status === SubscriptionStatus.ACTIVE && new Date(s.validUntil) >= now).length;
  const trialOffices = subscriptions.filter(s => s.status === SubscriptionStatus.FREE_TRIAL && new Date(s.validUntil) >= now).length;
  const gratisOffices = subscriptions.filter(s => s.status === SubscriptionStatus.GRATIS).length;
  const expiredOrBlocked = subscriptions.filter(s => s.status === SubscriptionStatus.BLOCKED || (s.status !== SubscriptionStatus.GRATIS && new Date(s.validUntil) < now)).length;

  // --- GROWTH & COMPARATIVE TIMEFRAMES ---
  // Last 30 days boundaries
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  // Sign-ups last 30 days vs previous 30 days
  const signupsLast30Days = subscriptions.filter(s => {
    const created = s.createdAt ? new Date(s.createdAt) : thirtyDaysAgo; // fallback
    return created >= thirtyDaysAgo;
  }).length;

  const signupsPrior30Days = subscriptions.filter(s => {
    const created = s.createdAt ? new Date(s.createdAt) : sixtyDaysAgo; // fallback
    return created >= sixtyDaysAgo && created < thirtyDaysAgo;
  }).length;

  const signupsGrowthPct = signupsPrior30Days === 0
    ? (signupsLast30Days > 0 ? 100 : 0)
    : Math.round(((signupsLast30Days - signupsPrior30Days) / signupsPrior30Days) * 100);

  // Active Paid subscriptions in last 30 days vs previous
  const activePaidLast30Days = subscriptions.filter(s => {
    if (s.status !== SubscriptionStatus.ACTIVE) return false;
    const created = s.createdAt ? new Date(s.createdAt) : thirtyDaysAgo;
    return created >= thirtyDaysAgo;
  }).length;

  const activePaidPrior30Days = subscriptions.filter(s => {
    if (s.status !== SubscriptionStatus.ACTIVE) return false;
    const created = s.createdAt ? new Date(s.createdAt) : sixtyDaysAgo;
    return created >= sixtyDaysAgo && created < thirtyDaysAgo;
  }).length;

  const activePaidGrowthPct = activePaidPrior30Days === 0
    ? (activePaidLast30Days > 0 ? 100 : 0)
    : Math.round(((activePaidLast30Days - activePaidPrior30Days) / activePaidPrior30Days) * 100);

  // Financial Estimates (Assuming standard plan price of R$ 99,00)
  const currentMRR = activePaidOffices * 99;
  const priorMRR = (activePaidOffices - activePaidLast30Days + activePaidPrior30Days) * 99;
  const mrrGrowthPct = priorMRR === 0
    ? (currentMRR > 0 ? 100 : 0)
    : Math.round(((currentMRR - priorMRR) / priorMRR) * 100);

  const projectedARR = currentMRR * 12;

  // Lead Conversion Rate %
  const conversionRatePct = totalOffices === 0
    ? 0
    : Math.round(((activePaidOffices + gratisOffices) / totalOffices) * 100);

  // --- RECHARTS MONTHLY DATASET FOR GROWTH ---
  const monthlyDataMap: { [key: string]: { month: string; "Novos Cadastros": number; "Planos Ativos": number; "Trial": number } } = {};
  
  // Fill the last 6 months list so we have sequential labels
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = d.toISOString().substring(0, 7); // "YYYY-MM"
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    // Capitalize first letter of label month
    const formattedLabel = label.charAt(0).toUpperCase() + label.slice(1);
    monthlyDataMap[key] = { month: formattedLabel, "Novos Cadastros": 0, "Planos Ativos": 0, "Trial": 0 };
  }

  subscriptions.forEach(s => {
    const created = s.createdAt ? new Date(s.createdAt) : now;
    const key = created.toISOString().substring(0, 7);
    if (monthlyDataMap[key]) {
      monthlyDataMap[key]["Novos Cadastros"] += 1;
      if (s.status === SubscriptionStatus.ACTIVE) {
        monthlyDataMap[key]["Planos Ativos"] += 1;
      } else if (s.status === SubscriptionStatus.FREE_TRIAL) {
        monthlyDataMap[key]["Trial"] += 1;
      }
    }
  });

  const chartData = Object.values(monthlyDataMap);

  // Slice recent sign-ups list for the dashboard table (last 5)
  const recentRegistrations = [...subscriptions]
    .slice(0, 5);

  const openEditModal = (sub: OfficeSubscription) => {
    setEditingSubscription(sub);
    setFormData({
      officeId: sub.officeId,
      officeName: sub.officeName,
      ownerEmail: sub.ownerEmail,
      ownerId: sub.ownerId,
      status: sub.status,
      validUntil: sub.validUntil,
      planName: sub.planName || "Plano Mensal",
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubscription?.officeId) return;
    try {
      const docRef = doc(db, "officeSubscriptions", editingSubscription.officeId);
      await updateDoc(docRef, {
        officeName: formData.officeName,
        ownerEmail: formData.ownerEmail,
        status: formData.status,
        validUntil: formData.validUntil,
        planName: formData.planName,
        updatedAt: new Date().toISOString(),
      });
      setIsEditModalOpen(false);
      setEditingSubscription(null);
    } catch (err: any) {
      alert("Erro ao editar: " + err.message);
    }
  };

  const handleDeleteOffice = (officeId: string, officeName: string) => {
    setDeleteTarget({ id: officeId, name: officeName });
  };

  const openAddModal = () => {
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + 30);
    setFormData({
      officeId: "office-" + Date.now(),
      officeName: "",
      ownerEmail: "",
      ownerId: "manual-" + Math.floor(Math.random() * 100000),
      status: SubscriptionStatus.FREE_TRIAL,
      validUntil: defaultExpiry.toISOString().split("T")[0],
      planName: "Plano Mensal",
    });
    setIsAddModalOpen(true);
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.officeName || !formData.ownerEmail) {
      alert("Preencha o nome do escritório e e-mail do proprietário.");
      return;
    }
    try {
      const cleanId = formData.officeId.trim() || "office-" + Date.now();
      const docRef = doc(db, "officeSubscriptions", cleanId);
      const newSub: OfficeSubscription = {
        officeId: cleanId,
        officeName: formData.officeName.trim(),
        ownerEmail: formData.ownerEmail.trim().toLowerCase(),
        ownerId: formData.ownerId.trim(),
        status: formData.status,
        validUntil: formData.validUntil,
        planName: formData.planName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(docRef, newSub);
      setIsAddModalOpen(false);
    } catch (err: any) {
      alert("Erro ao adicionar: " + err.message);
    }
  };

  const getDaysLeft = (validUntilStr: string) => {
    const diff = new Date(validUntilStr).getTime() - new Date().setHours(0,0,0,0);
    const dayMs = 24 * 60 * 60 * 1000;
    const days = Math.ceil(diff / dayMs);
    return days;
  };  return (
    <div id="super_admin_panel_container" className="p-1 md:p-4 space-y-6 font-sans">
      
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl text-xs font-bold leading-normal flex items-start gap-2.5 animate-in fade-in duration-300">
          <Icons.AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold font-sans">Erro de Comunicação com Banco de Dados</p>
            <p className="text-red-700/80 mt-1 font-mono">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Tab Selector */}
      <div className="flex border-b border-slate-100 pb-px gap-3 md:gap-4 bg-slate-100/60 p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all ${
            activeTab === "dashboard"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-500 hover:bg-slate-200/50 hover:text-slate-800"
          }`}
        >
          <Icons.Dashboard className="w-4 h-4" /> Painel de Crescimento
        </button>
        <button
          onClick={() => setActiveTab("database")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all ${
            activeTab === "database"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-500 hover:bg-slate-200/50 hover:text-slate-800"
          }`}
        >
          <Icons.Table className="w-4 h-4" /> Gerenciar Escritórios
        </button>
      </div>

      {activeTab === "dashboard" ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Key Metrics Dashboard Row */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            
            {/* Metric 1 */}
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-slate-200 transition-all">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total de Cadastros</span>
                <span className="p-1.5 rounded-xl bg-slate-50 text-slate-600">
                  <Icons.Users className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-slate-800 tracking-tight block">{totalOffices}</span>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 ${signupsGrowthPct >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                    {signupsGrowthPct >= 0 ? `+${signupsGrowthPct}%` : `${signupsGrowthPct}%`}
                  </span>
                  <span className="text-[9px] font-semibold text-slate-400">MoM (+{signupsLast30Days} novos)</span>
                </div>
              </div>
            </div>

            {/* Metric 2 */}
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-slate-200 transition-all">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Planos Ativos (Pagos)</span>
                <span className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600">
                  <Icons.Check className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-emerald-600 tracking-tight block">{activePaidOffices}</span>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 ${activePaidGrowthPct >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                    {activePaidGrowthPct >= 0 ? `+${activePaidGrowthPct}%` : `${activePaidGrowthPct}%`}
                  </span>
                  <span className="text-[9px] font-semibold text-slate-400">MoM (+{activePaidLast30Days} novos)</span>
                </div>
              </div>
            </div>

            {/* Metric 3 */}
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-slate-200 transition-all">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Período de Testes (Trial)</span>
                <span className="p-1.5 rounded-xl bg-sky-50 text-sky-600">
                  <Icons.Clock className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-sky-600 tracking-tight block">{trialOffices}</span>
                <p className="mt-2 text-[9px] font-semibold text-slate-400 leading-snug">
                  Degustação ativa por 30 dias.
                </p>
              </div>
            </div>

            {/* Metric 4 */}
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-slate-200 transition-all">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Gratuitos/Cortesia</span>
                <span className="p-1.5 rounded-xl bg-purple-50 text-purple-600">
                  <Icons.Sparkles className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-purple-600 tracking-tight block">{gratisOffices}</span>
                <p className="mt-2 text-[9px] font-semibold text-purple-600 font-bold leading-snug">
                  Acesso livre por parceria/cortesia.
                </p>
              </div>
            </div>

            {/* Metric 5 */}
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-slate-200 transition-all col-span-2 lg:col-span-1">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest block">Expirados ou Bloqueados</span>
                <span className="p-1.5 rounded-xl bg-red-50 text-red-500">
                  <Icons.AlertCircle className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-red-500 tracking-tight block">{expiredOrBlocked}</span>
                <p className="mt-2 text-[9px] font-semibold text-red-500 leading-snug">
                  Acesso suspenso ou bloqueado.
                </p>
              </div>
            </div>

          </div>

          {/* Growth & Financial Analytics Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Growth metrics column info */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Performance & Métricas de Receita</h3>
                <p className="text-xs text-slate-450 mt-1">Estimativas de faturamento com base no plano padrão</p>
              </div>

              <div className="space-y-4">
                {/* Financial KPI */}
                <div className="border border-slate-50 p-4 rounded-2xl bg-slate-50/50 flex justify-between items-center">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Receita Recorrente Mensal (MRR)</span>
                    <span className="block text-xl font-bold font-mono text-slate-800 mt-0.5">
                      R$ {currentMRR.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-bold px-2 py-1 rounded-xl flex items-center justify-end gap-0.5 ${mrrGrowthPct >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                      {mrrGrowthPct >= 0 ? `+${mrrGrowthPct}%` : `${mrrGrowthPct}%`}
                    </span>
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase block mt-1">Crescimento MoM</span>
                  </div>
                </div>

                {/* Projected ARR */}
                <div className="border border-slate-50 p-3.5 rounded-2xl flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold">Projeção de Receita Anual (ARR)</span>
                  <span className="text-slate-800 font-black font-mono">
                    R$ {projectedARR.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Conversion rate */}
                <div className="border border-slate-50 p-3.5 rounded-2xl flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold">Taxa de Ativação Geral</span>
                  <div className="text-right flex items-center gap-2">
                    <div className="w-16 bg-slate-100 rounded-full h-1.5 hidden sm:block">
                      <div className="bg-slate-800 h-1.5 rounded-full" style={{ width: `${conversionRatePct}%` }} />
                    </div>
                    <span className="text-slate-800 font-black">{conversionRatePct}%</span>
                  </div>
                </div>

                {/* Active paying velocity */}
                <div className="border border-slate-50 p-3.5 rounded-2xl flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold">Novas Assinaturas (30 dias)</span>
                  <span className="text-emerald-600 font-black">+{activePaidLast30Days} contas</span>
                </div>
              </div>
              
              <div className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-50 flex items-start gap-3">
                <span className="text-indigo-600 mt-0.5 shrink-0">
                  <Icons.Sparkles className="w-4 h-4" />
                </span>
                <div className="text-xs text-indigo-950 font-medium leading-snug">
                  <p className="font-bold">Projeção Inteligente</p>
                  <p className="text-indigo-800/80 mt-1">
                    Cálculo do MRR considera o ticket médio de <span className="font-bold">R$ 99,00</span> por escritório ativo pagante.
                  </p>
                </div>
              </div>
            </div>

            {/* Line / Area Chart: Growth trend last 6 months */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-2 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Evolução Mensal (Últimos 6 Meses)</h3>
                <p className="text-xs text-slate-450 mt-1">Evolução de novos cadastros inseridos no sistema e conversões pagas</p>
              </div>

              <div className="h-64 mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCadastros" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorAtivos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="month" tickLine={false} tick={{ fontSize: 10, fill: "#94A3B8" }} />
                    <YAxis tickLine={false} tick={{ fontSize: 10, fill: "#94A3B8" }} />
                    <Tooltip contentStyle={{ background: "#0F172A", border: "none", borderRadius: "12px", color: "#FFF", fontSize: "11px" }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                    <Area type="monotone" dataKey="Novos Cadastros" stroke="#3B82F6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCadastros)" />
                    <Area type="monotone" dataKey="Planos Ativos" stroke="#10B981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAtivos)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* Recent Signups Table Layout */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Últimos Cadastros de Clientes</h3>
                <p className="text-xs text-slate-450 mt-1 font-sans">Visualização simplificada das contas adicionadas recentemente</p>
              </div>
              <button
                onClick={() => {
                  setActiveTab("database");
                  setStatusFilter("ALL");
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
              >
                Ver base completa <Icons.ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-extrabold border-b border-slate-100">
                    <th className="p-4">Escritório</th>
                    <th className="p-4">Proprietário (E-mail)</th>
                    <th className="p-4">Plano</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentRegistrations.map((sub) => {
                    const daysLeft = getDaysLeft(sub.validUntil);
                    return (
                      <tr key={sub.officeId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <span className="font-extrabold text-slate-800 block truncate max-w-[200px]">{sub.officeName}</span>
                          <span className="font-mono text-[9px] text-slate-450 block mt-0.5">ID: {sub.officeId}</span>
                        </td>
                        <td className="p-4 font-semibold text-slate-600">
                          {sub.ownerEmail}
                        </td>
                        <td className="p-4 font-medium text-slate-600">
                          {sub.planName || "Plano Mensal"}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-0.5 text-[8px] font-black border uppercase rounded-full ${getBadgeStyle(sub.status)}`}>
                            {sub.status === SubscriptionStatus.FREE_TRIAL ? "TRIAL" : sub.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(sub)}
                              className="bg-slate-900 text-white font-black text-[9px] uppercase px-3 py-1.5 rounded-lg transition-all hover:bg-slate-800"
                            >
                              Editar Cadastro
                            </button>
                            <button
                              onClick={() => handleDeleteOffice(sub.officeId, sub.officeName)}
                              className="bg-red-50 hover:bg-red-600 hover:text-white text-red-600 px-3 py-1.5 rounded-lg border border-red-200 transition-all flex items-center gap-1"
                              title="Excluir escritório permanentemente"
                            >
                              <Icons.Trash className="w-2.5 h-2.5" /> Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Controls Panel */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
              
              {/* Search Box */}
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <Icons.Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar por escritório, e-mail do proprietário ou ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              {/* Action button */}
              <button
                onClick={openAddModal}
                className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs px-5 py-3 rounded-xl tracking-wider uppercase transition-all shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 shrink-0"
              >
                <Icons.Plus className="w-4 h-4" /> Novo Cadastro Manual
              </button>
            </div>

            {/* Tab Filters */}
            <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-2">
              {["ALL", "ACTIVE", "FREE_TRIAL", "GRATIS", "PENDING_PAYMENT", "BLOCKED", "EXPIRED"].map((filter) => {
                const labelMap: { [key: string]: string } = {
                  ALL: "Todos",
                  ACTIVE: "Assinantes (Ativos)",
                  FREE_TRIAL: "Testes (Trial)",
                  GRATIS: "Gratuitos/Cortesia",
                  PENDING_PAYMENT: "Pagamento Pendente",
                  BLOCKED: "Bloqueados",
                  EXPIRED: "Expirados (Somente)",
                };
                return (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      statusFilter === filter
                        ? "bg-slate-900 text-white shadow-sm"
                        : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    }`}
                  >
                    {labelMap[filter]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subscription List */}
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-xs font-bold uppercase tracking-wider animate-pulse">
              Carregando banco de faturamento...
            </div>
          ) : filteredSubs.length === 0 ? (
            <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-400">
              Nenhum cadastro de escritório correspondente ao filtro ativo.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSubs.map((sub) => {
                const daysLeft = getDaysLeft(sub.validUntil);
                const isExpired = daysLeft <= 0 && sub.status !== SubscriptionStatus.GRATIS;
                
                return (
                  <div
                    key={sub.officeId}
                    className={`bg-white border rounded-3xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between ${
                      isExpired || sub.status === SubscriptionStatus.BLOCKED ? "border-red-100 bg-red-50/5" : "border-slate-100"
                    }`}
                  >
                    {/* Header info */}
                    <div>
                      <div className="flex justify-between items-start gap-1 pb-3 border-b border-slate-50">
                        <div>
                          <h4 className="font-black text-slate-800 text-base tracking-tight truncate max-w-[200px]">
                            {sub.officeName}
                          </h4>
                          <p className="text-[10px] font-semibold text-slate-400 mt-0.5 truncate max-w-[190px]">
                            ID: {sub.officeId}
                          </p>
                        </div>
                        <span className={`px-2.5 py-1 text-[9px] font-black border uppercase rounded-full select-none ${getBadgeStyle(sub.status)}`}>
                          {sub.status === SubscriptionStatus.FREE_TRIAL ? "TESTE / TRIAL" : sub.status}
                        </span>
                      </div>

                      {/* Body details */}
                      <div className="py-4 space-y-2.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-medium">Proprietário:</span>
                          <span className="text-slate-700 font-bold truncate max-w-[180px]" title={sub.ownerEmail}>
                            {sub.ownerEmail}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-medium">Plano Atual:</span>
                          <span className="text-slate-700 font-bold">
                            {sub.planName || "Plano Mensal"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-medium">Validade:</span>
                          <div className="text-right">
                            <span className={`font-bold ${isExpired ? "text-red-600" : "text-slate-800"}`}>
                              {new Date(sub.validUntil).toLocaleDateString("pt-BR")}
                            </span>
                            {sub.status !== SubscriptionStatus.GRATIS && (
                              <p className={`text-[8px] font-black uppercase mt-0.5 ${isExpired ? "text-red-500" : "text-emerald-600"}`}>
                                {isExpired ? "Expirou faz " + Math.abs(daysLeft) + " d" : daysLeft + " dias restantes"}
                              </p>
                            )}
                            {sub.status === SubscriptionStatus.GRATIS && (
                              <p className="text-[8px] font-black text-purple-600 uppercase mt-0.5">
                                Uso Complementar
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card actions */}
                    <div className="pt-3 border-t border-slate-50 flex flex-wrap gap-1.5 justify-end">
                      {/* Quick toggle shortcuts */}
                      {sub.status !== SubscriptionStatus.ACTIVE && (
                        <button
                          onClick={() => handleToggleStatus(sub, SubscriptionStatus.ACTIVE)}
                          className="text-[9px] font-black uppercase tracking-wider bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
                          title="Ativar assinatura por 30 dias"
                        >
                          Liberar Pago
                        </button>
                      )}
                      {sub.status !== SubscriptionStatus.GRATIS && (
                        <button
                          onClick={() => handleToggleStatus(sub, SubscriptionStatus.GRATIS)}
                          className="text-[9px] font-black uppercase tracking-wider bg-purple-50 hover:bg-purple-600 hover:text-white text-purple-700 px-3 py-1.5 rounded-lg border border-purple-200 transition-colors"
                          title="Ativar acesso gratuito/cortesia ilimitado"
                        >
                          Liberar Grátis
                        </button>
                      )}
                      {sub.status !== SubscriptionStatus.BLOCKED && (
                        <button
                          onClick={() => handleToggleStatus(sub, SubscriptionStatus.BLOCKED)}
                          className="text-[9px] font-black uppercase tracking-wider bg-red-50 hover:bg-red-600 hover:text-white text-red-600 px-3 py-1.5 rounded-lg border border-red-200 transition-colors"
                          title="Bloquear acesso imediatamente"
                        >
                          Bloquear
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(sub)}
                        className="text-[9px] font-black uppercase bg-slate-900 border border-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                        title="Editar manualmente todos os valores"
                      >
                        <Icons.Edit className="w-2.5 h-2.5" /> Detalhes
                      </button>
                      <button
                        onClick={() => handleDeleteOffice(sub.officeId, sub.officeName)}
                        className="text-[9px] font-black uppercase bg-red-50 hover:bg-red-600 hover:text-white text-red-600 px-3 py-1.5 rounded-lg border border-red-200 transition-colors flex items-center gap-1"
                        title="Excluir escritório permanentemente"
                      >
                        <Icons.Trash className="w-2.5 h-2.5" /> Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* Edit Form Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-base font-black uppercase tracking-wider text-slate-800">
                Editar Cadastro Faturamento
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl"
              >
                <Icons.Close className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  ID do Escritório (Não alterável)
                </label>
                <input
                  type="text"
                  value={formData.officeId}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-100 text-slate-500 font-medium text-xs outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Nome do Escritório
                  </label>
                  <input
                    type="text"
                    value={formData.officeName}
                    onChange={(e) => setFormData({ ...formData, officeName: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Nome do Plano
                  </label>
                  <input
                    type="text"
                    value={formData.planName}
                    onChange={(e) => setFormData({ ...formData, planName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    E-mail do Proprietário
                  </label>
                  <input
                    type="email"
                    value={formData.ownerEmail}
                    onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    ID do Proprietário (UID Firebase)
                  </label>
                  <input
                    type="text"
                    value={formData.ownerId}
                    onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Status da Assinatura
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleStatusChange(e.target.value as SubscriptionStatus)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white transition-all font-semibold"
                  >
                    <option value={SubscriptionStatus.ACTIVE}>Ativo / Pago</option>
                    <option value={SubscriptionStatus.FREE_TRIAL}>Fase de Testes (Trial)</option>
                    <option value={SubscriptionStatus.GRATIS}>Gratuito / Cortesia</option>
                    <option value={SubscriptionStatus.PENDING_PAYMENT}>Aguardando Pagamento</option>
                    <option value={SubscriptionStatus.PENDING_CHOICE}>Aguardando Nova Escolha</option>
                    <option value={SubscriptionStatus.BLOCKED}>Bloqueado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Data de Validade
                  </label>
                  <input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    required
                    disabled={formData.status === SubscriptionStatus.GRATIS}
                    className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-semibold ${
                      formData.status === SubscriptionStatus.GRATIS
                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                        : "border-slate-200 text-slate-700 bg-white"
                    }`}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase shadow-md flex items-center gap-1.5"
                >
                  <Icons.Save className="w-3.5 h-3.5" /> Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Form Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-base font-black uppercase tracking-wider text-slate-800">
                Adicionar Cadastro Manualmente
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl"
              >
                <Icons.Close className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  ID do Escritório (Será usado no faturamento)
                </label>
                <input
                  type="text"
                  value={formData.officeId}
                  onChange={(e) => setFormData({ ...formData, officeId: e.target.value })}
                  placeholder="Deixe em branco para auto-gerar"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Nome do Escritório
                  </label>
                  <input
                    type="text"
                    value={formData.officeName}
                    onChange={(e) => setFormData({ ...formData, officeName: e.target.value })}
                    required
                    placeholder="Ex: Santos e Associados"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Nome do Plano
                  </label>
                  <input
                    type="text"
                    value={formData.planName}
                    placeholder="Ex: Plano Cortesia"
                    onChange={(e) => setFormData({ ...formData, planName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    E-mail do Proprietário
                  </label>
                  <input
                    type="email"
                    value={formData.ownerEmail}
                    onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                    required
                    placeholder="advogado@email.com"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    ID do Proprietário (UID Firebase)
                  </label>
                  <input
                    type="text"
                    value={formData.ownerId}
                    onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                    placeholder="Opcional. Ex: manual-123"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Status da Assinatura
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleStatusChange(e.target.value as SubscriptionStatus)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none bg-white transition-all font-semibold"
                  >
                    <option value={SubscriptionStatus.ACTIVE}>Ativo / Pago</option>
                    <option value={SubscriptionStatus.FREE_TRIAL}>Fase de Testes (Trial)</option>
                    <option value={SubscriptionStatus.GRATIS}>Gratuito / Cortesia</option>
                    <option value={SubscriptionStatus.PENDING_PAYMENT}>Aguardando Pagamento</option>
                    <option value={SubscriptionStatus.PENDING_CHOICE}>Aguardando Nova Escolha</option>
                    <option value={SubscriptionStatus.BLOCKED}>Bloqueado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Data de Validade
                  </label>
                  <input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    required
                    disabled={formData.status === SubscriptionStatus.GRATIS}
                    className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-semibold ${
                      formData.status === SubscriptionStatus.GRATIS
                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                        : "border-slate-200 text-slate-700 bg-white"
                    }`}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase shadow-md flex items-center gap-1.5"
                >
                  <Icons.Plus className="w-3.5 h-3.5" /> Cadastrar Escritório
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Stateful Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-red-100 animate-in zoom-in-95 duration-250">
            <div className="flex items-start gap-3.5 mb-2">
              <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                <Icons.Trash className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-wider text-slate-800">
                  Confirmar Exclusão
                </h3>
                <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mt-0.5">
                  Ação Irreversível
                </p>
              </div>
            </div>
            
            <p className="text-slate-600 text-xs font-semibold leading-relaxed my-4">
              Atenção: Você tem certeza absoluta que deseja excluir permanentemente o escritório <span className="font-extrabold text-slate-800">"{deleteTarget.name}"</span>? 
              Isso removerá o registro de faturamento e impedirá o acesso de todos os membros vinculados ao ID de escritório <code className="bg-slate-100 text-red-600 px-1 py-0.5 rounded text-[11px] font-mono">{deleteTarget.id}</code>.
            </p>

            <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 mt-4">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const docRef = doc(db, "officeSubscriptions", deleteTarget.id);
                    await deleteDoc(docRef);
                    setDeleteTarget(null);
                  } catch (err: any) {
                    alert("Erro ao excluir escritório: " + err.message);
                  } finally {
                    setDeleting(false);
                  }
                }}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white rounded-xl font-black text-xs uppercase shadow-md flex items-center gap-1.5"
              >
                {deleting ? "Excluindo..." : "Sim, Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
