import React, { useState, useMemo } from "react";
import {
  FinanceTransaction,
  FinanceTransactionType,
  FinanceCategory,
  FinanceStatus,
  UserProfile,
  Client,
  RecurringExpense,
} from "../../types";
import { Icons } from "../../constants";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

interface FinanceManagementProps {
  userProfile: UserProfile | null;
  clients: Client[];
  financeTransactions: FinanceTransaction[];
  onSaveTransaction: (transaction: Omit<FinanceTransaction, "id" | "createdAt" | "userId" | "officeId">, id: string | null) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  recurringExpenses: RecurringExpense[];
  onSaveRecurringExpense: (expense: Omit<RecurringExpense, "id" | "createdAt" | "userId" | "officeId">, id: string | null) => Promise<void>;
  onDeleteRecurringExpense: (id: string) => Promise<void>;
}

export default function FinanceManagement({
  userProfile,
  clients,
  financeTransactions,
  onSaveTransaction,
  onDeleteTransaction,
  isModalOpen,
  setIsModalOpen,
  recurringExpenses = [],
  onSaveRecurringExpense,
  onDeleteRecurringExpense,
}: FinanceManagementProps) {
  // Filters State
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [periodFilter, setPeriodFilter] = useState<string>("MÊS"); // ALL, MÊS, 3_MESES, 6_MESES

  // Modal State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: FinanceTransactionType.RECEITA,
    category: FinanceCategory.HONORARIOS,
    amount: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
    clientId: "",
    status: FinanceStatus.PENDENTE,
  });

  // Automatically reset or sync form when modal opens from parent top navigation
  React.useEffect(() => {
    if (isModalOpen && !editingId) {
      setForm({
        type: FinanceTransactionType.RECEITA,
        category: FinanceCategory.HONORARIOS,
        amount: "",
        description: "",
        date: new Date().toISOString().split("T")[0],
        clientId: "",
        status: FinanceStatus.PENDENTE,
      });
    }
  }, [isModalOpen, editingId]);

  // Recurring Expenses Assistant States
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    description: "",
    category: FinanceCategory.INFRAESTRUTURA,
    amount: "",
    dueDay: 10,
    isVariable: false,
  });
  const [payingExpense, setPayingExpense] = useState<RecurringExpense | null>(null);
  const [payingAmount, setPayingAmount] = useState("");

  const currentYearMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const handleStartCheckRecurring = (expense: RecurringExpense) => {
    if (expense.isVariable) {
      setPayingExpense(expense);
      setPayingAmount(String(expense.amount));
    } else {
      executeRecurringPayment(expense, expense.amount);
    }
  };

  const executeRecurringPayment = async (expense: RecurringExpense, finalAmount: number) => {
    try {
      if (finalAmount <= 0) {
        alert("O valor da despesa deve ser maior que zero.");
        return;
      }
      
      const todayString = new Date().toISOString().split("T")[0];
      
      // 1. Create finance transaction
      await onSaveTransaction({
        type: FinanceTransactionType.DESPESA,
        category: expense.category,
        amount: finalAmount,
        description: `${expense.description} (Recorrente de ${todayString.substring(5, 7)}/${todayString.substring(0, 4)})`,
        date: todayString,
        status: FinanceStatus.PAGO,
      }, null);

      // 2. Mark as paid in the recurring template
      await onSaveRecurringExpense({
        description: expense.description,
        category: expense.category,
        amount: expense.amount, // Keep original default template value
        dueDay: expense.dueDay,
        isVariable: expense.isVariable,
        lastBillingMonth: currentYearMonth,
      }, expense.id);

      setPayingExpense(null);
      setPayingAmount("");
    } catch(err) {
      console.error("Erro ao liquidar despesa recorrente:", err);
    }
  };

  const handleSaveRecurringAndClose = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(recurringForm.amount);
    if (!recurringForm.description.trim()) {
      alert("Por favor, insira uma descrição.");
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Por favor, insira um valor válido e positivo.");
      return;
    }
    if (recurringForm.dueDay < 1 || recurringForm.dueDay > 31) {
      alert("Por favor, insira um dia de vencimento entre 1 e 31.");
      return;
    }

    try {
      await onSaveRecurringExpense({
        description: recurringForm.description.trim(),
        category: recurringForm.category,
        amount: parsedAmount,
        dueDay: recurringForm.dueDay,
        isVariable: recurringForm.isVariable,
      }, null);

      setIsRecurringModalOpen(false);
      setRecurringForm({
        description: "",
        category: FinanceCategory.INFRAESTRUTURA,
        amount: "",
        dueDay: 10,
        isVariable: false,
      });
    } catch (err) {
      console.error("Erro ao salvar despesa recorrente:", err);
    }
  };

  // Reset form helper
  const openNewTransactionModal = () => {
    setEditingId(null);
    setForm({
      type: FinanceTransactionType.RECEITA,
      category: FinanceCategory.HONORARIOS,
      amount: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
      clientId: "",
      status: FinanceStatus.PENDENTE,
    });
    setIsModalOpen(true);
  };

  const openEditTransactionModal = (t: FinanceTransaction) => {
    setEditingId(t.id);
    setForm({
      type: t.type,
      category: t.category,
      amount: t.amount.toString(),
      description: t.description,
      date: t.date,
      clientId: t.clientId || "",
      status: t.status,
    });
    setIsModalOpen(true);
  };

  // Date Parsing Helpers
  const parseISO = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  // Filter Logic
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return financeTransactions.filter((t) => {
      const tDate = parseISO(t.date);

      // Period Filter
      if (periodFilter === "MÊS") {
        if (tDate.getFullYear() !== currentYear || tDate.getMonth() !== currentMonth) {
          return false;
        }
      } else if (periodFilter === "3_MESES") {
        const diffTime = now.getTime() - tDate.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        if (diffDays > 90) return false;
      } else if (periodFilter === "6_MESES") {
        const diffTime = now.getTime() - tDate.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        if (diffDays > 180) return false;
      }

      // Dropdown Filters
      if (typeFilter !== "ALL" && t.type !== typeFilter) return false;
      if (categoryFilter !== "ALL" && t.category !== categoryFilter) return false;
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;

      // Search bar filter
      if (search.trim() !== "") {
        const query = search.toLowerCase();
        const descMatch = t.description.toLowerCase().includes(query);
        const clientMatch = t.clientName?.toLowerCase().includes(query);
        const catMatch = t.category.toLowerCase().includes(query);
        if (!descMatch && !clientMatch && !catMatch) return false;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date)); // Sort by date descending
  }, [financeTransactions, typeFilter, categoryFilter, statusFilter, periodFilter, search]);

  // Statistics Calculations
  const stats = useMemo(() => {
    let totalRevenuePaid = 0;
    let totalExpensePaid = 0;
    let totalRevenuePending = 0;
    let totalExpensePending = 0;

    filteredTransactions.forEach((t) => {
      const amt = t.amount;
      if (t.type === FinanceTransactionType.RECEITA) {
        if (t.status === FinanceStatus.PAGO) {
          totalRevenuePaid += amt;
        } else {
          totalRevenuePending += amt;
        }
      } else {
        if (t.status === FinanceStatus.PAGO) {
          totalExpensePaid += amt;
        } else {
          totalExpensePending += amt;
        }
      }
    });

    const netActiveBalance = totalRevenuePaid - totalExpensePaid;

    return {
      revenuePaid: totalRevenuePaid,
      expensePaid: totalExpensePaid,
      revenuePending: totalRevenuePending,
      expensePending: totalExpensePending,
      netBalance: netActiveBalance,
    };
  }, [filteredTransactions]);

  // Recharts Chart Data Prep
  const categoryBarChartData = useMemo(() => {
    const categoriesMap: { [key: string]: { category: string; receita: number; despesa: number } } = {};

    filteredTransactions.forEach((t) => {
      if (!categoriesMap[t.category]) {
        categoriesMap[t.category] = { category: t.category, receita: 0, despesa: 0 };
      }
      if (t.type === FinanceTransactionType.RECEITA) {
        categoriesMap[t.category].receita += t.amount;
      } else {
        categoriesMap[t.category].despesa += t.amount;
      }
    });

    return Object.values(categoriesMap);
  }, [filteredTransactions]);

  const expensesPieChartData = useMemo(() => {
    const expensesMap: { [key: string]: number } = {};
    let totalExpenses = 0;

    filteredTransactions.forEach((t) => {
      if (t.type === FinanceTransactionType.DESPESA) {
        expensesMap[t.category] = (expensesMap[t.category] || 0) + t.amount;
        totalExpenses += t.amount;
      }
    });

    const colors = [
      "#ef4444", "#fb923c", "#facc15", "#2dd4bf", "#3b82f6", 
      "#818cf8", "#a78bfa", "#f472b6", "#fda4af", "#94a3b8"
    ];

    return Object.keys(expensesMap).map((cat, idx) => ({
      name: cat,
      value: expensesMap[cat],
      color: colors[idx % colors.length],
      percentage: totalExpenses > 0 ? ((expensesMap[cat] / totalExpenses) * 100).toFixed(1) : "0",
    }));
  }, [filteredTransactions]);

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = parseFloat(form.amount);
    if (isNaN(numAmt) || numAmt <= 0) {
      alert("Valor inválido.");
      return;
    }

    try {
      await onSaveTransaction({
        type: form.type,
        category: form.category,
        amount: numAmt,
        description: form.description,
        date: form.date,
        clientId: form.clientId ? form.clientId : undefined,
        status: form.status,
      }, editingId);

      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Export CSV Utility
  const handleExportCSV = () => {
    const headers = ["Data", "Tipo", "Categoria", "Descrição", "Cliente", "Valor (R$)", "Status"];
    const rows = filteredTransactions.map((t) => [
      t.date,
      t.type,
      t.category,
      t.description.replace(/"/g, '""'),
      t.clientName || "",
      t.amount.toFixed(2),
      t.status,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `extrato_financeiro_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export PDF Report Utility
  const handleExportPDF = () => {
    const doc = new jsPDF() as any;
    
    // Title
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // slate 900
    doc.text("RELATÓRIO FINANCEIRO DE TRANSPARÊNCIA", 14, 20);
    
    doc.setFontSize(8);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(100, 116, 139); // slate 500
    doc.text(`ESCRITÓRIO: ${userProfile?.officeId || "EXCLUSIVO OPERACIONAL"}`, 14, 25);
    doc.text(`GERADO POR: ${userProfile?.name?.toUpperCase()} EM ${new Date().toLocaleDateString("pt-BR")} AS ${new Date().toLocaleTimeString("pt-BR")}`, 14, 29);

    // Filter summary
    doc.text(`Filtros Ativos: Periodo: ${periodFilter} | Tipo: ${typeFilter} | Categoria: ${categoryFilter} | Status: ${statusFilter}`, 14, 34);

    // Table of counters
    doc.autoTable({
      startY: 40,
      head: [["Métrica", "Efetivado (Pago)", "Pendente de Liquidação", "Total Absoluto"]],
      body: [
        [
          "Receitas / Honorários",
          formatBRL(stats.revenuePaid),
          formatBRL(stats.revenuePending),
          formatBRL(stats.revenuePaid + stats.revenuePending)
        ],
        [
          "Despesas / Custos",
          formatBRL(stats.expensePaid),
          formatBRL(stats.expensePending),
          formatBRL(stats.expensePaid + stats.expensePending)
        ],
        [
          "Saldo Líquido",
          formatBRL(stats.netBalance),
          formatBRL(stats.revenuePending - stats.expensePending),
          formatBRL(stats.netBalance + (stats.revenuePending - stats.expensePending))
        ]
      ],
      theme: "striped",
      headStyles: { fillColor: [30, 41, 59], fontStyle: "bold" },
      styles: { fontSize: 9 }
    });

    // Transactions list
    const transRows = filteredTransactions.map((t) => [
      t.date.split("-").reverse().join("/"),
      t.type,
      t.category,
      t.description,
      t.clientName || "-",
      formatBRL(t.amount),
      t.status,
    ]);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42); // slate 900
    doc.text("DETALHAMENTO DOS LANÇAMENTOS", 14, doc.lastAutoTable.finalY + 12);

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 16,
      head: [["Data", "Tipo", "Categoria", "Descrição", "Cliente", "Valor", "Status"]],
      body: transRows,
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold" },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 16 },
        2: { cellWidth: 24 },
        3: { cellWidth: 55 },
        4: { cellWidth: 35 },
        5: { cellWidth: 26 },
        6: { cellWidth: 16 },
      }
    });

    doc.save(`extrato_financeiro_oficial_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* 1. Statistics Cards Block */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        
        {/* Card 1: Efetivado Balance */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-600" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 tracking-wider uppercase">Saldo Líquido</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Icons.Finance className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className={`text-xl font-black tracking-tight ${stats.netBalance >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {formatBRL(stats.netBalance)}
            </h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Líquido em Caixa</p>
          </div>
        </div>

        {/* Card 2: Receitas Recebidas */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 tracking-wider uppercase">Receitas Efetuadas</span>
            <div className="p-2 bg-emerald-50 text-emerald-500 rounded-xl">
              <Icons.Check className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xl font-black tracking-tight text-emerald-600">
              {formatBRL(stats.revenuePaid)}
            </h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Confirmadas</p>
          </div>
        </div>

        {/* Card 3: Despesas Pagas */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 tracking-wider uppercase">Despesas Efetuadas</span>
            <div className="p-2 bg-red-50 text-red-500 rounded-xl">
              <Icons.Trash className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xl font-black tracking-tight text-red-500">
              {formatBRL(stats.expensePaid)}
            </h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Liquidadas</p>
          </div>
        </div>

        {/* Card 4: Receitas Pendentes */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-400" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 tracking-wider uppercase">A Receber</span>
            <div className="p-2 bg-amber-50 text-amber-500 rounded-xl">
              <Icons.Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xl font-black tracking-tight text-amber-500">
              {formatBRL(stats.revenuePending)}
            </h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Pendentes de Liquidação</p>
          </div>
        </div>

        {/* Card 5: Despesas Pendentes */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-600" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 tracking-wider uppercase">A Pagar</span>
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
              <Icons.AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xl font-black tracking-tight text-slate-800">
              {formatBRL(stats.expensePending)}
            </h3>
            <p className="text-[8px] font-bold text-red-500 uppercase mt-1">Contas pendentes a pagar</p>
          </div>
        </div>

      </div>

      {/* --- ASSISTENTE DE PAGAMENTOS E CONTAS RECORRENTES --- */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 px-2.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg tracking-wider uppercase">Lembrete Inteligente</span>
              <span className="text-[10px] font-bold text-slate-400">({currentYearMonth})</span>
            </div>
            <h3 className="text-xl font-black text-slate-950 mt-1 uppercase tracking-tight">Assistente de Contas & Pagamentos Recorrentes</h3>
            <p className="text-xs text-slate-500 mt-0.5">Agende suas despesas mensais recorrentes (como Aluguel, Provedor de Internet, Energia) e lance o pagamento com um único clique.</p>
          </div>
          <button
            onClick={() => setIsRecurringModalOpen(true)}
            className="self-start sm:self-center px-4 py-2 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm"
          >
            <Icons.Plus className="w-3.5 h-3.5" />
            Configurar Nova Conta Recorrente
          </button>
        </div>

        {recurringExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-3xl">
            <div className="p-3 bg-blue-50 text-blue-500 rounded-2xl mb-3">
              <Icons.Clock className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Nenhuma conta recorrente cadastrada</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1">Configure as despesas fixas ou variáveis frequentes do seu escritório (como aluguel, energia, telefone) para gerar lembretes mensais automáticos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Checklist of current month bills */}
            <div className="lg:col-span-2 space-y-4">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Lembretes de Pagamento do Mês ({currentYearMonth.substring(5, 7)}/{currentYearMonth.substring(0, 4)})</h4>
              
              <div className="grid grid-cols-1 gap-3">
                {recurringExpenses.map((exp) => {
                  const isPaidThisMonth = exp.lastBillingMonth === currentYearMonth;
                  return (
                    <div 
                      key={exp.id} 
                      className={`p-4 rounded-3xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        isPaidThisMonth 
                          ? "bg-slate-50/50 border-slate-100 opacity-70" 
                          : "bg-white border-slate-100 shadow-sm hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`p-2.5 rounded-2xl ${isPaidThisMonth ? "bg-slate-100 text-slate-400" : "bg-red-50 text-red-500"}`}>
                          {exp.isVariable ? (
                            <Icons.AlertCircle className="w-5 h-5" />
                          ) : (
                            <Icons.Check className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-sm">{exp.description}</span>
                            <span className="text-[9px] font-black text-slate-400 uppercase px-2 py-0.5 bg-slate-100 rounded">
                              {exp.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Icons.Calendar className="w-3.5 h-3.5 text-slate-400" />
                              Todo dia {exp.dueDay}
                            </span>
                            <span className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                            <span className="font-mono font-medium text-slate-700">
                              Estimativa: {formatBRL(exp.amount)}
                            </span>
                            {exp.isVariable && (
                              <>
                                <span className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                                <span className="p-0.5 px-2 bg-amber-50 text-amber-600 rounded text-[9px] font-black uppercase">
                                  Valor Variável
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {isPaidThisMonth ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold uppercase tracking-wider">
                            <Icons.Check className="w-3.5 h-3.5" />
                            PAGO ESTE MÊS
                          </div>
                        ) : (
                          <button
                            onClick={() => handleStartCheckRecurring(exp)}
                            className="px-4 py-1.5 bg-emerald-600 text-white hover:bg-emerald-500 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm flex items-center gap-1.5 transition"
                          >
                            <Icons.Check className="w-3.5 h-3.5" />
                            LIQUIDAR
                          </button>
                        )}
                        <button
                          onClick={() => onDeleteRecurringExpense(exp.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-slate-50 transition"
                          title="Remover Conta de Lembretes"
                        >
                          <Icons.Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Status and Information Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Painel do Assistente</h4>
              
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col justify-between space-y-6">
                <div>
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Status das Contas Fixas</h5>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Contas Agendadas:</span>
                      <span className="font-bold text-slate-900">{recurringExpenses.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium font-semibold text-emerald-600">Pagas no Mês:</span>
                      <span className="font-bold text-emerald-600">
                        {recurringExpenses.filter(e => e.lastBillingMonth === currentYearMonth).length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium font-semibold text-red-500">Pendentes no Mês:</span>
                      <span className="font-bold text-red-500">
                        {recurringExpenses.filter(e => e.lastBillingMonth !== currentYearMonth).length}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full mt-4 overflow-hidden flex">
                    {recurringExpenses.length > 0 && (() => {
                      const paidNum = recurringExpenses.filter(e => e.lastBillingMonth === currentYearMonth).length;
                      const pct = Math.round((paidNum / recurringExpenses.length) * 100);
                      return (
                        <div 
                          className="bg-emerald-500 h-full transition-all duration-500" 
                          style={{ width: `${pct}%` }} 
                        />
                      );
                    })()}
                  </div>
                </div>

                <div className="text-xs text-slate-500 leading-relaxed bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-1">
                  <span className="font-bold text-slate-800 uppercase text-[9px] block mb-1">Como Funciona?</span>
                  <p>1. Adicione os compromissos recorrentes una vez.</p>
                  <p>2. No mês atual, clique em <strong className="text-emerald-600">LIQUIDAR</strong>.</p>
                  <p>3. Se for do tipo <strong className="text-indigo-600">Variável</strong> (ex: Energia), informe o valor final pago de forma prática antes de gerar a transação de Despesa.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Visual Charts Container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Chart 1: Bar Chart of Categories Revenues vs Expenses */}
        <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="mb-6">
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Distribuição de Receitas e Despesas</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Visão agrupada por categorias em Reais (R$)</p>
          </div>
          {categoryBarChartData.length > 0 ? (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryBarChartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="category" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => formatBRL(value as number)} />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: 10, textTransform: "uppercase", fontWeight: "bold" }} />
                  <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesa" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-sm font-bold text-slate-400 uppercase">Nenhum dado para o período filtrado</p>
            </div>
          )}
        </div>

        {/* Chart 2: Circular Distribution of Costs */}
        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Centro de Custos</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Divisão percentual de saídas</p>
          </div>
          {expensesPieChartData.length > 0 ? (
            <div className="flex flex-col items-center justify-center my-4">
              <div className="h-[150px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expensesPieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {expensesPieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatBRL(value as number)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              {/* Pie Legends */}
              <div className="w-full grid grid-cols-2 gap-2 mt-2 max-h-[100px] overflow-y-auto custom-scrollbar">
                {expensesPieChartData.map((e, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tight truncate">
                      {e.name} ({e.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-sm font-bold text-slate-400 uppercase">Sem despesas registradas</p>
            </div>
          )}
        </div>

      </div>

      {/* --- MODAL PARA ADICIONAR NOVA CONTA RECORRENTE --- */}
      {isRecurringModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] max-w-md w-full p-6 md:p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-black text-slate-900 uppercase">Configurar Conta Recorrente</h3>
              <button 
                onClick={() => setIsRecurringModalOpen(false)} 
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveRecurringAndClose} className="space-y-4 mt-6">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">Descrição / Título do pagamento</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Energia - CPFL / Aluguel da Sede"
                  className="w-full mt-1.5 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-medium placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 transition"
                  value={recurringForm.description}
                  onChange={e => setRecurringForm({ ...recurringForm, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400">Categoria</label>
                  <select
                    className="w-full mt-1.5 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 transition"
                    value={recurringForm.category}
                    onChange={e => setRecurringForm({ ...recurringForm, category: e.target.value as FinanceCategory })}
                  >
                    {Object.values(FinanceCategory).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400">Dia de Vencimento</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    className="w-full mt-1.5 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 transition"
                    value={recurringForm.dueDay}
                    onChange={e => setRecurringForm({ ...recurringForm, dueDay: parseInt(e.target.value) || 10 })}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">Valor Base (Estimado / Fixo) R$</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  className="w-full mt-1.5 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 transition"
                  value={recurringForm.amount}
                  onChange={e => setRecurringForm({ ...recurringForm, amount: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <input
                  type="checkbox"
                  id="rawVariable"
                  className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-slate-400 transition"
                  checked={recurringForm.isVariable}
                  onChange={e => setRecurringForm({ ...recurringForm, isVariable: e.target.checked })}
                />
                <label htmlFor="rawVariable" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Valor é variável a cada mês (ex: fatura de energia ou água)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsRecurringModalOpen(false)}
                  className="px-5 py-3 bg-slate-50 text-slate-500 hover:bg-slate-100 text-xs font-bold uppercase rounded-2xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-bold uppercase rounded-2xl transition shadow-sm"
                >
                  Ativar Agendamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- POPUP / FORMULÁRIO DE CONFIRMAÇÃO PARA DESPESA VARIÁVEL --- */}
      {payingExpense && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] max-w-sm w-full p-6 md:p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-base font-black text-slate-900 uppercase">Liquidar Valor Variável</h3>
              <button 
                onClick={() => setPayingExpense(null)} 
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                A despesa <strong>{payingExpense.description}</strong> é variável. Por favor indique abaixo o valor total pago para esta fatura no mês corrente de {currentYearMonth}:
              </p>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">Valor Efetivamente Pago R$</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  className="w-full mt-1.5 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 transition"
                  value={payingAmount}
                  onChange={e => setPayingAmount(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setPayingExpense(null)}
                  className="px-4 py-2 bg-slate-50 text-slate-500 hover:bg-slate-100 text-xs font-bold uppercase rounded-xl transition"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => executeRecurringPayment(payingExpense, parseFloat(payingAmount) || 0)}
                  className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-bold uppercase rounded-xl transition shadow-sm"
                >
                  Confirmar Pagamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Filtering Panel */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
          
          {/* Quick Filters Group */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 flex-1 gap-4">
            
            {/* Filter 1: Quick Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar lançamentos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs font-semibold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>

            {/* Filter 2: Type Filter */}
            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs font-bold text-slate-700 outline-none"
              >
                <option value="ALL">TIPO: TODOS</option>
                <option value={FinanceTransactionType.RECEITA}>RECEITAS (ENTRADAS)</option>
                <option value={FinanceTransactionType.DESPESA}>DESPESAS (SAÍDAS)</option>
              </select>
            </div>

            {/* Filter 3: Category Filter */}
            <div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs font-bold text-slate-700 outline-none"
              >
                <option value="ALL">CATEGORIA: TODAS</option>
                {Object.values(FinanceCategory).map((c) => (
                  <option key={c} value={c}>
                    {c.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 4: Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs font-bold text-slate-700 outline-none"
              >
                <option value="ALL">LIQUIDAÇÃO: TODOS</option>
                <option value={FinanceStatus.PAGO}>PAGO (EFETIVADO)</option>
                <option value={FinanceStatus.PENDENTE}>PENDENTE (ABERTO)</option>
              </select>
            </div>

            {/* Filter 5: Period Filter */}
            <div>
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs font-bold text-slate-700 outline-none"
              >
                <option value="ALL">PERÍODO: HISTÓRICO MANUAL</option>
                <option value="MÊS">PERÍODO: MÊS CORRENTE</option>
                <option value="3_MESES">PERÍODO: SESTRE (90 D.)</option>
                <option value="6_MESES">PERÍODO: ÚLTIMOS 6 MESES</option>
              </select>
            </div>

          </div>

          {/* Export Actions Panel */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCSV}
              className="px-5 py-3 rounded-xl bg-emerald-500 text-white font-black text-[10px] uppercase shadow-md shadow-emerald-500/10 hover:scale-[1.02] transition-transform flex items-center gap-2"
            >
              CSV
            </button>
            <button
              onClick={handleExportPDF}
              className="px-5 py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase shadow-md shadow-slate-900/10 hover:scale-[1.02] transition-transform flex items-center gap-2"
            >
              EXPORTAR RELATÓRIO PDF
            </button>
          </div>

        </div>
      </div>

      {/* 4. Transactions List Block */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base md:text-lg font-black text-slate-900 uppercase tracking-tight">Extrato Consolidado</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Histórico de entradas e saídas do escritório</p>
          </div>
          <span className="text-[10px] bg-slate-100 text-slate-600 px-4 py-1.5 rounded-full font-black uppercase">
            {filteredTransactions.length} registros
          </span>
        </div>

        {filteredTransactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="p-5 md:p-6 w-32">Data Emissão</th>
                  <th className="p-5 md:p-6 w-28">Tipo</th>
                  <th className="p-5 md:p-6 w-44">Categoria</th>
                  <th className="p-5 md:p-6">Descrição do Lançamento</th>
                  <th className="p-5 md:p-6 w-48">Cliente Vinculado</th>
                  <th className="p-5 md:p-6 w-36">Valor</th>
                  <th className="p-5 md:p-6 w-32">Status</th>
                  <th className="p-5 md:p-6 w-24 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-5 md:p-6 text-xs font-black text-slate-900">
                      {t.date.split("-").reverse().join("/")}
                    </td>
                    <td className="p-5 md:p-6">
                      <span
                        className={`text-[8px] font-bold uppercase px-2.5 py-1.5 rounded-lg font-mono ${
                          t.type === FinanceTransactionType.RECEITA
                            ? "bg-emerald-55 text-emerald-600 font-bold"
                            : "bg-red-55 text-red-600 font-bold"
                        }`}
                      >
                        {t.type}
                      </span>
                    </td>
                    <td className="p-5 md:p-6 text-xs font-bold text-slate-500 uppercase tracking-tight">
                      {t.category}
                    </td>
                    <td className="p-5 md:p-6 text-xs text-slate-800 font-medium whitespace-pre-wrap max-w-sm">
                      {t.description}
                    </td>
                    <td className="p-5 md:p-6 text-xs font-bold text-slate-600">
                      {t.clientName ? (
                        <span className="text-indigo-600 capitalize hover:underline cursor-pointer">
                          {t.clientName}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">Geral / Escritório</span>
                      )}
                    </td>
                    <td className="p-5 md:p-6 text-sm font-black text-slate-900">
                      {formatBRL(t.amount)}
                    </td>
                    <td className="p-5 md:p-6">
                      <span
                        className={`text-[8px] font-black uppercase px-2.5 py-1.5 rounded-lg ${
                          t.status === FinanceStatus.PAGO
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="p-5 md:p-6">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditTransactionModal(t)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                          title="Editar lançamento"
                        >
                          <Icons.Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteTransaction(t.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                          title="Excluir lançamento"
                        >
                          <Icons.Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm font-bold uppercase">Nenhum lançamento financeiro registrado ou localizado</p>
            <p className="text-xs text-slate-300 uppercase mt-1">Utilize o botão "Novo Lançamento" no topo para registrar uma entrada ou saída</p>
          </div>
        )}
      </div>

      {/* 5. Add / Edit Transaction Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-6 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col relative animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-base md:text-lg font-black text-slate-900 tracking-tight uppercase">
                {editingId ? "Editar Lançamento" : "Novo Lançamento Financeiro"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
              >
                <Icons.Close className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-4">
              
              {/* Type Switch Selector */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: FinanceTransactionType.RECEITA }))}
                  className={`py-3.5 rounded-xl font-black text-xs uppercase transition-all ${
                    form.type === FinanceTransactionType.RECEITA
                      ? "bg-white text-emerald-600 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  Receita (Entrada)
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: FinanceTransactionType.DESPESA }))}
                  className={`py-3.5 rounded-xl font-black text-xs uppercase transition-all ${
                    form.type === FinanceTransactionType.DESPESA
                      ? "bg-white text-red-500 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  Despesa (Saída)
                </button>
              </div>

              {/* Amount Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Valor do Lançamento (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0.01"
                    placeholder="0,00"
                    value={form.amount}
                    onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] p-4 rounded-xl text-slate-900 text-sm font-bold placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Data do Lançamento</label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] p-4 rounded-xl text-slate-900 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* Category selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Categoria</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm(f => ({ ...f, category: e.target.value as FinanceCategory }))}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] p-4 rounded-xl text-slate-900 text-sm font-bold outline-none"
                  >
                    {Object.values(FinanceCategory).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Status de Liquidação</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm(f => ({ ...f, status: e.target.value as FinanceStatus }))}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] p-4 rounded-xl text-slate-900 text-sm font-semibold outline-none"
                  >
                    <option value={FinanceStatus.PENDENTE}>PENDENTE (EM ABERTO)</option>
                    <option value={FinanceStatus.PAGO}>PAGO (EFETIVADO)</option>
                  </select>
                </div>
              </div>

              {/* Client select option linking */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Cliente Vinculado (Opcional)</label>
                <select
                  value={form.clientId}
                  onChange={(e) => setForm(f => ({ ...f, clientId: e.target.value }))}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] p-4 rounded-xl text-slate-900 text-xs font-semibold outline-none"
                >
                  <option value="">Nenhum - Lançamento Geral do Escritório</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName || c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Form Input fields */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Histórico ou Detalhes da Operação</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ex: Recebimento de honorários contratuais iniciais da ação x..."
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] p-4 rounded-xl text-slate-900 text-xs font-medium placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                />
              </div>

              {/* Actions panel */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-50">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3.5 bg-slate-50 text-slate-500 rounded-xl font-black text-[10px] uppercase hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-3.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-colors"
                >
                  Salvar Lançamento
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
