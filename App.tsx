import React, { useState, useEffect, useMemo } from "react";
import {
  Deadline,
  DeadlineStatus,
  NotificationSettings,
  NotificationRule,
  AuthUser,
  Client,
  ClientProcess,
  ProcessNote,
  AdminTask,
  AdminTaskCategory,
  AdminTaskAlert,
  DocumentTemplate,
  UserRole,
  Sector,
  UserProfile,
  MonitoredProcess,
  ProcessMovement,
  FinanceTransaction,
  FinanceTransactionType,
  FinanceCategory,
  FinanceStatus,
  RecurringExpense,
  DjenPublication,
  TimeLog,
  TimeLogStatus,
  ReviewState,
  ReviewLogEntry
} from "./types";
import {
  Icons,
  PECA_OPTIONS as INITIAL_PECAS,
  RESPONSAVEL_OPTIONS as INITIAL_RESPONSAVEIS,
  EMPRESA_OPTIONS as INITIAL_EMPRESAS,
} from "./constants";
import { suggestActionObject } from "./services/geminiService";
import FinanceManagement from "./src/components/FinanceManagement";
import SuperAdminPanel from "./src/components/SuperAdminPanel";
import PaywallScreen from "./src/components/PaywallScreen";
import { TimesheetView } from "./src/components/TimesheetView";

// Gráficos
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

// PDF Export
import { jsPDF } from "jspdf";
import "jspdf-autotable";

// Firebase Imports
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  setDoc,
  or,
  getDoc,
  getDocs,
  query as firestoreQuery,
} from "firebase/firestore";

import firebaseConfig from "./firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const getParties = (h: any) => {
  const raw = getRawParties(h);
  return raw
    .map((p: any) => (
      p.nome || 
      p.nomePersonagem || 
      p.pessoa?.nome || 
      p.nome_pessoa || 
      p.nome_parte || 
      p.nome_completo ||
      p.nomeOriginal ||
      (typeof p === 'string' ? p : "")
    ).toUpperCase())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
};

const getRawParties = (h: any) => {
  return [
    ...(h.participantes || []),
    ...(h.polos?.flatMap((p: any) => p.participantes || []) || []),
    ...(h.personagens || []),
    ...(h.partes || []),
    ...(h.poloAtivo || []),
    ...(h.poloPassivo || []),
    ...(h.partes?.poloAtivo || []),
    ...(h.partes?.poloPassivo || []),
    ...(h.assuntos || []),
    ...(Array.isArray(h.partes) ? h.partes : [])
  ];
};

// --- Utilitários ---
const formatLocalDate = (dateStr: string) => {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("pt-BR");
};

const formatCNJ = (processNumber: string) => {
  if (!processNumber) return "";
  const clean = processNumber.replace(/\D/g, "");
  if (clean.length === 20) {
    return `${clean.substring(0, 7)}-${clean.substring(7, 9)}.${clean.substring(9, 13)}.${clean.substring(13, 14)}.${clean.substring(14, 16)}.${clean.substring(16, 20)}`;
  }
  return processNumber;
};

const getDaysDiff = (dateStr: string) => {
  if (!dateStr) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateStr.split("-").map(Number);
  const deadlineDate = new Date(year, month - 1, day);
  deadlineDate.setHours(0, 0, 0, 0);
  const diffTime = deadlineDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const formatDateToISO = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getFirstName = (name?: string) => {
  if (!name) return "Não definido";
  return name.trim().split(/\s+/)[0].toUpperCase();
};

const getClientInitials = (name?: string) => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  const f = parts[0][0] || "";
  const l = parts[parts.length - 1][0] || "";
  return (f + l).toUpperCase();
};

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  
  // Log safely without complex JSON.stringify that might hit circularity in some environments
  console.error("Firestore Error:", errMessage, {
    operation: operationType,
    path: path,
    userId: auth?.currentUser?.uid || null
  });

  let serializedErr: string;
  try {
    const seen = new WeakSet();
    serializedErr = JSON.stringify(errInfo, (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    });
  } catch (stringifyError) {
    serializedErr = JSON.stringify({
      error: errMessage,
      operationType,
      path,
      authInfo: {
        userId: auth?.currentUser?.uid || null,
        email: auth?.currentUser?.email || null,
      }
    });
  }

  throw new Error(serializedErr);
}

// --- Componentes ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
}

const Modal = ({ isOpen, onClose, title, children }: ModalProps) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-6 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl max-h-[95vh] rounded-3xl shadow-2xl flex flex-col relative animate-in zoom-in-95 duration-200">
        <div className="px-6 py-3.5 md:px-8 md:py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-base md:text-lg font-black text-slate-900 tracking-tight">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
          >
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 pt-3 pb-5 md:px-8 md:pt-4 md:pb-8 overflow-y-auto flex-1 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

const AuthScreen = ({
  onLogin,
  onGoogleLogin,
  loading,
}: {
  onLogin: (email: string, pass: string, isSignUp: boolean) => void;
  onGoogleLogin: () => void;
  loading: boolean;
}) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="fixed inset-0 bg-[#020617] flex items-center justify-center z-[100] p-6">
      <div className="bg-white/5 backdrop-blur-xl p-8 md:p-12 rounded-[2.5rem] w-full max-w-md border border-white/10 shadow-2xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-xl shadow-blue-500/20 mb-6 text-white text-2xl font-black">
            LP
          </div>
          <h2 className="text-2xl font-black text-white tracking-tighter">
            LexPremium
          </h2>
          <p className="text-slate-500 font-bold uppercase text-[9px] tracking-[0.2em] mt-2">
            Legal Performance System
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onLogin(email, password, isSignUp);
          }}
          className="space-y-4"
        >
          <input
            type="email"
            required
            className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-white font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-600"
            placeholder="E-mail profissional"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-white font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-600"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex justify-end px-2">
            {!isSignUp && (
              <button
                type="button"
                onClick={() => {
                  if (!email) {
                    alert("Digite seu e-mail para recuperar a senha.");
                    return;
                  }
                  // @ts-ignore
                  import("firebase/auth").then(
                    ({ getAuth, sendPasswordResetEmail }) => {
                      sendPasswordResetEmail(getAuth(), email)
                        .then(() => alert("E-mail de recuperação enviado!"))
                        .catch((e) => alert("Erro: " + e.message));
                    },
                  );
                }}
                className="text-[10px] font-black text-slate-500 hover:text-blue-400 uppercase tracking-widest transition-colors"
              >
                Esqueci minha senha
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white p-5 rounded-2xl font-bold text-sm uppercase tracking-widest transition-all disabled:opacity-50 mt-4"
          >
            {loading
              ? "Sincronizando..."
              : isSignUp
                ? "Criar Nova Conta"
                : "Acessar Painel"}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
            <span className="bg-[#0b1120] px-4 text-slate-500">
              Ou continue com
            </span>
          </div>
        </div>

        <button
          onClick={onGoogleLogin}
          disabled={loading}
          type="button"
          className="w-full bg-white hover:bg-slate-50 text-[#001d3d] p-5 rounded-2xl font-bold text-sm uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-3 group"
        >
          <svg
            className="w-5 h-5 transition-transform group-hover:scale-110"
            viewBox="0 0 24 24"
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Acessar com Google
        </button>

        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="w-full mt-8 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
        >
          {isSignUp
            ? "Já possui acesso? Entrar"
            : "Solicitar novo acesso corporativo"}
        </button>
      </div>
    </div>
  );
};

// --- Componentes Auxiliares ---

const DEFAULT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "prop-ad-judicia",
    name: "Procuração Ad Judicia",
    type: "PROCURACAO",
    content: `PROCURAÇÃO AD JUDICIA\n\nOUTORGANTE: {{NOME}}, {{NACIONALIDADE}}, {{ESTADO_CIVIL}}, {{PROFISSAO}}, inscrito no CPF sob o nº {{DOCUMENTO}}, residente e domiciliado em {{ENDERECO}}.\n\nOUTORGADO: [NOME DO ADVOGADO], inscrito na OAB/{{ESTADO}} sob o nº [NUMERO], com escritório profissional em [ENDEREÇO DO ESCRITÓRIO].\n\nPODERES: Pelo presente instrumento particular de procuração, o outorgante nomeia e constitui o outorgado seu procurador, conferindo-lhe os poderes da cláusula ad judicia et extra, para o foro em geral, em qualquer Juízo, Instância ou Tribunal, bem como os poderes especiais para confessar, reconhecer a procedência do pedido, transigir, desistir, receber, dar quitação e firmar compromisso, e tudo o mais que for necessário ao fiel cumprimento do presente mandato.\n\n{{DATA_ATUAL}}.\n\n__________________________________________\n{{NOME}}`,
    createdAt: new Date().toISOString(),
  },
  {
    id: "contrato-honorarios",
    name: "Contrato de Honorários",
    type: "CONTRATO",
    content: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS\n\nCONTRATANTE: {{NOME}}, inscrito no CPF/CNPJ sob o nº {{DOCUMENTO}}, residente/sediado em {{ENDERECO}}.\n\nCONTRATADO: [NOME DO ESCRITÓRIO/ADVOGADO], com sede em [ENDEREÇO].\n\nCLÁUSULA PRIMEIRA - DO OBJETO: O presente contrato tem como objeto a prestação de serviços advocatícios para [DESCREVER OBJETO].\n\nCLÁUSULA SEGUNDA - DOS HONORÁRIOS: Pelos serviços prestados, o CONTRATANTE pagará ao CONTRATADO a importância de R$ [VALOR], na forma de [FORMA DE PAGAMENTO].\n\nCLÁUSULA TERCEIRA - DAS DESPESAS: Todas as despesas judiciais e extrajudiciais serão de responsabilidade do CONTRATANTE.\n\nPor estarem assim justos e contratados, firmam o presente instrumento em duas vias de igual teor.\n\n{{DATA_ATUAL}}.\n\n__________________________________________\nCONTRATANTE\n\n__________________________________________\nCONTRATADO`,
    createdAt: new Date().toISOString(),
  },
];

const MonitoringView = ({
  processes,
  clients,
  isAdding,
  onSetIsAdding,
  onAdd,
  onRemove,
  onRefresh,
  onUpdate,
  userProfile,
  publications,
  setUserProfile,
  teamProfiles,
}: {
  processes: MonitoredProcess[];
  clients: Client[];
  isAdding: boolean;
  onSetIsAdding: (val: boolean) => void;
  onAdd: (cnj: string, clientId?: string) => void;
  onRemove: (id: string) => void;
  onRefresh: (process: MonitoredProcess) => void;
  onUpdate: (process: MonitoredProcess) => void;
  userProfile: UserProfile | null;
  publications: DjenPublication[];
  setUserProfile: (profile: UserProfile | null) => void;
  teamProfiles: UserProfile[];
}) => {
  const highlightTeamNames = (text: string) => {
    if (!text) return "";
    if (!teamProfiles || teamProfiles.length === 0) return text;

    const names = teamProfiles
      .map(p => p.name?.trim())
      .filter((n): n is string => !!n && n.length > 2)
      .sort((a, b) => b.length - a.length);

    if (names.length === 0) return text;

    const escapedNames = names.map(name => name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const pattern = new RegExp(`\\b(${escapedNames.join('|')})\\b`, 'gi');

    const parts = text.split(pattern);
    return parts.map((part, index) => {
      const isMatch = names.some(name => name.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return (
          <span key={index} className="bg-yellow-100 text-amber-900 font-extrabold px-1.5 py-0.5 rounded-md border border-yellow-250 inline-block text-[10px]">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const [activeTab, setActiveTab] = useState<"processes" | "djen">("processes");
  const [isEditing, setIsEditing] = useState(false);
  const [editingProcess, setEditingProcess] = useState<MonitoredProcess | null>(null);
  const [newCnj, setNewCnj] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [editClientName, setEditClientName] = useState("");
  const [editClientId, setEditClientId] = useState("");
  const [selectedProcess, setSelectedProcess] = useState<MonitoredProcess | null>(null);

  // States for OAB setups
  const [userOab, setUserOab] = useState(userProfile?.oab || "");
  const [userUf, setUserUf] = useState(userProfile?.ufOab || "SP");
  const [advAdminOab, setAdvAdminOab] = useState(userProfile?.adminOab || "");
  const [advAdminUf, setAdvAdminUf] = useState(userProfile?.adminUfOab || "SP");
  const [isSavingOab, setIsSavingOab] = useState(false);
  const [isFetchingDjen, setIsFetchingDjen] = useState(false);
  const [showOabSettings, setShowOabSettings] = useState(false);
  const [djenSearchQuery, setDjenSearchQuery] = useState("");
  const [selectedDjenPub, setSelectedDjenPub] = useState<DjenPublication | null>(null);

  const handleSelectDjenPub = (pub: DjenPublication | null) => {
    setSelectedDjenPub(pub);
    if (pub && !pub.isRead) {
      handleMarkAsRead([pub.id], true);
    }
  };

  useEffect(() => {
    if (selectedDjenPub) {
      const currentPub = publications.find(p => p.id === selectedDjenPub.id);
      if (currentPub) {
        if (
          currentPub.isRead !== selectedDjenPub.isRead ||
          currentPub.isInTrash !== selectedDjenPub.isInTrash
        ) {
          setSelectedDjenPub(currentPub);
        }
      } else {
        setSelectedDjenPub(null);
      }
    }
  }, [publications]);

  const [djenJournalFilter, setDjenJournalFilter] = useState("ALL");
  const [djenNotebookFilter, setDjenNotebookFilter] = useState("ALL");
  const [djenPeriodFilter, setDjenPeriodFilter] = useState("ALL");
  const [djenStatusFilter, setDjenStatusFilter] = useState("ACTIVE"); // "ACTIVE", "UNREAD", "READ", "TRASH"
  const [selectedPubIds, setSelectedPubIds] = useState<string[]>([]);
  const [djenViewLayout, setDjenViewLayout] = useState<"list" | "grid">("list");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, 4000);
  };

  const handleMarkAsRead = async (ids: string[], isRead: boolean) => {
    try {
      for (const id of ids) {
        const docRef = doc(db, "publications", id);
        await updateDoc(docRef, { isRead });
      }
      showToast(isRead ? "A publicação foi marcada como lida!" : "A publicação foi marcada como não lida!");
      setSelectedPubIds([]);
    } catch (err: any) {
      console.error("Error marking as read:", err);
      handleFirestoreError(err, OperationType.UPDATE, `publications/${ids.join(",")}`);
    }
  };

  const handleMoveToTrash = async (ids: string[], isInTrash: boolean) => {
    try {
      for (const id of ids) {
        const docRef = doc(db, "publications", id);
        await updateDoc(docRef, { isInTrash });
      }
      showToast(isInTrash ? "Publicação movida para a lixeira!" : "Publicação restaurada da lixeira!");
      setSelectedPubIds([]);
      if (selectedDjenPub && ids.includes(selectedDjenPub.id)) {
        setSelectedDjenPub(null);
      }
    } catch (err: any) {
      console.error("Error moving to trash:", err);
      handleFirestoreError(err, OperationType.UPDATE, `publications/${ids.join(",")}`);
    }
  };

  const handlePermanentDelete = async (ids: string[]) => {
    if (!window.confirm("Deseja realmente excluir permanentemente as " + ids.length + " publicações selecionadas?")) return;
    try {
      for (const id of ids) {
        const docRef = doc(db, "publications", id);
        await deleteDoc(docRef);
      }
      showToast("Exclusão permanente realizada com sucesso!");
      setSelectedPubIds([]);
      if (selectedDjenPub && ids.includes(selectedDjenPub.id)) {
        setSelectedDjenPub(null);
      }
    } catch (err: any) {
      console.error("Error deleting permanently:", err);
      handleFirestoreError(err, OperationType.DELETE, `publications/${ids.join(",")}`);
    }
  };

  const handlePrintPub = (pub: DjenPublication) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Ative as permissões de pop-up para imprimir.");
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>${pub.numeroProcesso} - JurisControl</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
            h1 { font-size: 20px; font-weight: 800; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; text-transform: uppercase; }
            .meta { background-color: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 12px; }
            .content { font-family: monospace; white-space: pre-wrap; font-size: 13px; background: #fff; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <h1>Diário de Justiça Eletrônico Nacional (DJEN)</h1>
          <div class="meta">
            <strong>Processo:</strong> ${pub.numeroProcesso}<br/>
            <strong>Tribunal:</strong> ${pub.tribunal}<br/>
            <strong>Disponibilização:</strong> ${new Date(pub.dataDisponibilizacao).toLocaleDateString("pt-BR")}<br/>
            ${pub.dataPublicacao ? `<strong>Publicação:</strong> ${new Date(pub.dataPublicPublicacao || pub.dataPublicacao).toLocaleDateString("pt-BR")}<br/>` : ""}
            <strong>Tipo de Ato:</strong> ${pub.tipoComunicacao || "Intimação"}<br/>
            <strong>Meio:</strong> ${pub.meio}
          </div>
          <div class="content">${pub.texto}</div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadPub = (pub: DjenPublication) => {
    const element = document.createElement("a");
    const file = new Blob([
      `PROCESSO: ${pub.numeroProcesso}\nTRIBUNAL: ${pub.tribunal}\nDISPONIBILIZAÇÃO: ${pub.dataDisponibilizacao}\n-----------------------------------\n\n${pub.texto}`
    ], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${pub.numeroProcesso || "publicacao"}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast("Texto da publicação baixado com sucesso!");
  };

  const handleSendEmailPub = (pub: DjenPublication) => {
    const subject = encodeURIComponent(`Publicação Processual - Proc ${pub.numeroProcesso}`);
    const body = encodeURIComponent(`Prezado(a),\n\nSegue abaixo o teor da publicação encontrada no DJEN:\n\nTribunal: ${pub.tribunal}\nProcesso: ${pub.numeroProcesso}\nData: ${new Date(pub.dataDisponibilizacao).toLocaleDateString("pt-BR")}\n\nTeor:\n\n${pub.texto}\n\nJurisControl.`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    showToast("Disparando cliente de e-mail local...");
  };

  useEffect(() => {
    if (userProfile) {
      setUserOab(userProfile.oab || "");
      setUserUf(userProfile.ufOab || "SP");
      setAdvAdminOab(userProfile.adminOab || "");
      setAdvAdminUf(userProfile.adminUfOab || "SP");
    }
  }, [userProfile]);

  const rawUfs = [
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", 
    "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"
  ];

  const handleEdit = (proc: MonitoredProcess) => {
    setEditingProcess(proc);
    setEditClientName(proc.clientName);
    setEditClientId(proc.clientId || "");
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (!editingProcess) return;
    const updated = {
      ...editingProcess,
      clientName: editClientName,
      clientId: editClientId || undefined
    };
    onUpdate(updated);
    setIsEditing(false);
    setEditingProcess(null);
    if (selectedProcess?.id === updated.id) {
      setSelectedProcess(updated);
    }
  };

  const saveOabConfig = async () => {
    if (!userProfile) return;
    setIsSavingOab(true);
    try {
      const profileRef = doc(db, "userProfiles", userProfile.id);
      await updateDoc(profileRef, {
        oab: userOab,
        ufOab: userUf,
        adminOab: advAdminOab,
        adminUfOab: advAdminUf
      });
      setUserProfile({
        ...userProfile,
        oab: userOab,
        ufOab: userUf,
        adminOab: advAdminOab,
        adminUfOab: advAdminUf
      });
      alert("Configuração de OABs salva com sucesso!");
      setShowOabSettings(false);
    } catch (err) {
      console.error("[OAB Save Error] details:", err);
      alert("Falha ao salvar a configuração de OAB na nuvem.");
    } finally {
      setIsSavingOab(false);
    }
  };

  const handleSyncDjen = async () => {
    if (!userProfile) return;
    if (!userOab) {
      alert("Adicione e salve o seu número da OAB principal para realizar a busca.");
      setShowOabSettings(true);
      return;
    }

    setIsFetchingDjen(true);
    let successfullyFetched = 0;
    const errors: string[] = [];

    const searchConfigs = [{ oab: userOab, uf: userUf }];
    // If coordinator or user is standard lawyer & specify their general manager's OAB, fetch also for manager OAB
    if (userProfile.role !== UserRole.ADMIN && advAdminOab) {
      searchConfigs.push({ oab: advAdminOab, uf: advAdminUf });
    }

    try {
      for (const config of searchConfigs) {
        console.log(`[DJEN Fetching] OAB: ${config.oab}, UF: ${config.uf}`);
        const cleanOabDigits = config.oab.replace(/\D/g, "");
        const cleanUfLower = config.uf.toLowerCase();

        // Calculate start and end dates (60 days range)
        const today = new Date();
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(today.getDate() - 60);

        const formatDate = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        };

        const queryDataInicio = formatDate(sixtyDaysAgo);
        const queryDataFim = formatDate(today);

        const directUrl = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=${cleanOabDigits}&ufOab=${cleanUfLower}&dataDisponibilizacaoInicio=${queryDataInicio}&dataDisponibilizacaoFim=${queryDataFim}`;

        let data: any = {};
        let success = false;
        let responseStatusText = "";

        // Try direct browser client-side request first (bypasses WAF datacenter IP blocks!)
        try {
          console.log(`[DJEN] Initiating direct client-side search: ${directUrl}`);
          const clientResponse = await fetch(directUrl, {
            method: "GET",
            headers: {
              "Accept": "application/json"
            }
          });

          if (clientResponse.ok) {
            data = await clientResponse.json();
            success = true;
            console.log(`[DJEN] Direct client-side fetch succeeded with ${data.items?.length || 0} items!`);
          } else {
            responseStatusText = `HTTP ${clientResponse.status}`;
            console.warn(`[DJEN] Direct client-side fetch failed (${responseStatusText}). Falling back to backend...`);
          }
        } catch (clientErr: any) {
          responseStatusText = clientErr?.message || "Erro de conexão do cliente (CORS ou Rede)";
          console.warn(`[DJEN] Direct client-side fetch exception: ${responseStatusText}. Falling back to backend...`);
        }

        // Fallback to Server Proxy if client-side request failed
        if (!success) {
          console.log(`[DJEN] Querying via server-side proxy route...`);
          const serverResponse = await fetch("/api/v1/comunicacao", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              numeroOab: cleanOabDigits,
              ufOab: cleanUfLower,
              dataInicio: queryDataInicio,
              dataFim: queryDataFim
            })
          });

          try {
            if (serverResponse.headers.get("Content-Type")?.includes("application/json")) {
              data = await serverResponse.json();
            } else {
              const rawText = await serverResponse.text();
              data = { error: rawText || `Erro HTTP ${serverResponse.status}` };
            }
          } catch (jsonErr) {
            data = { error: `Erro de formato de resposta inválido do servidor (HTTP ${serverResponse.status})` };
          }

          if (!serverResponse.ok) {
            console.error("[DJEN Proxy] Server response err:", data.error);
            errors.push(`OAB ${config.oab}/${config.uf.toUpperCase()}: ${data.error || "Erro na consulta"}. (Tentativa direta: ${responseStatusText})`);
            continue;
          }
        }

        const items = data.comunicacoes || data.items || data.itens || [];
        console.log(`[DJEN] Got ${items.length} items for OAB ${config.oab}`);

        for (const rawItem of items) {
          // Robust mapping of properties & clean ID sanitization (removes slashes which break path hierarchy)
          const rawId = String(rawItem.id || rawItem.idComunicacao || `pub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
          const sanitizedId = rawId.replace(/[^a-zA-Z0-9_\-]/g, "-");
          
          const safeOfficeId = userProfile.officeId || userProfile.id || auth.currentUser?.uid || "";
          if (!safeOfficeId) {
            console.warn("[DJEN Sync] Skipped item due to empty office ID context.");
            continue;
          }

          const publicationId = `${safeOfficeId}_${sanitizedId}`;

          const mappedDoc: DjenPublication = {
            id: publicationId,
            numeroProcesso: rawItem.numeroProcesso || rawItem.numero_processo || "",
            dataDisponibilizacao: rawItem.dataDisponibilizacao || rawItem.data_disponibilizacao || "",
            dataPublicacao: rawItem.data_publicacao || rawItem.dataPublicacao || "",
            tribunal: rawItem.siglaTribunal || rawItem.nomeTribunal || rawItem.tribunal || "",
            texto: rawItem.texto || "",
            tipoComunicacao: rawItem.tipoComunicacao || rawItem.tipo_comunicacao || "",
            destinatarios: rawItem.destinatarios || [],
            meio: rawItem.meio || "Diário de Justiça Eletrônico Nacional (DJEN)",
            officeId: safeOfficeId,
            searchOab: config.oab,
            searchUfOab: config.uf,
            createdAt: new Date().toISOString()
          };

          // Overwrite/de-duplicate in Firestore using publication API identifier with { merge: true } to retain local user fields (e.g. read/unread, trash states)
          try {
            await setDoc(doc(db, "publications", publicationId), mappedDoc, { merge: true });
            successfullyFetched++;
          } catch (writeErr: any) {
            console.error(`[DJEN Sync] Error writing doc ${publicationId} to Firestore:`, writeErr);
            handleFirestoreError(writeErr, OperationType.WRITE, `publications/${publicationId}`);
          }
        }
      }

      if (errors.length > 0) {
        alert(`Não foi possível sincronizar todas as OABs devido a bloqueios do servidor público:\n\n${errors.join("\n")}`);
      } else {
        alert(`Sincronização concluída! ${successfullyFetched} publicações processadas e armazenadas com sucesso.`);
      }
    } catch (e: any) {
      console.error("[DJEN Sync Hook Fail]:", e);
      alert("Falha ao comunicar com os servidores do DJEN nacional. Tente novamente mais tarde.");
    } finally {
      setIsFetchingDjen(false);
    }
  };

  // Memoized filter containing Brazilian OAB rules requested back and forth
  const displayedPublications = useMemo(() => {
    if (!userProfile) return [];

    let filtered = publications;

    // Apply strict team visual boundaries requested:
    if (userProfile.role !== UserRole.ADMIN) {
      const myOabClean = (userProfile.oab || "").replace(/\D/g, "");
      const bossOabClean = (userProfile.adminOab || "").replace(/\D/g, "");

      filtered = publications.filter((pub) => {
        const rawText = (pub.texto || "").toLowerCase();

        // Match user's own OAB
        let matchesUser = false;
        if (myOabClean) {
          const hasMyOabInText = rawText.includes(myOabClean);
          const hasMyOabInDest = (pub.destinatarios || []).some((d: any) => 
            String(d.oab || "").replace(/\D/g, "").includes(myOabClean)
          );
          const matchesSearchOab = pub.searchOab === userProfile.oab;
          matchesUser = hasMyOabInText || hasMyOabInDest || matchesSearchOab;
        }

        // Match admin/boss's OAB
        let matchesBoss = false;
        if (bossOabClean) {
          const hasBossOabInText = rawText.includes(bossOabClean);
          const hasBossOabInDest = (pub.destinatarios || []).some((d: any) => 
            String(d.oab || "").replace(/\D/g, "").includes(bossOabClean)
          );
          const matchesSearchOab = pub.searchOab === userProfile.adminOab;
          matchesBoss = hasBossOabInText || hasBossOabInDest || matchesSearchOab;
        }

        // Return true if it matches either configured OAB
        if (myOabClean && bossOabClean) {
          return matchesUser || matchesBoss;
        } else if (myOabClean) {
          return matchesUser;
        } else if (bossOabClean) {
          return matchesBoss;
        }
        return false;
      });
    } else {
      // Admin sees everything mapped, matching or general searched
      const myOabStr = userProfile.oab || "";
      if (myOabStr) {
        filtered = publications.filter(pub => pub.searchOab === myOabStr || pub.texto.includes(myOabStr.replace(/\D/g, "")));
      }
    }

    // Advise Hub Filter: Status Filter (Active, Unread, Read, Trash)
    if (djenStatusFilter === "TRASH") {
      filtered = filtered.filter(pub => pub.isInTrash === true);
    } else if (djenStatusFilter === "UNREAD") {
      filtered = filtered.filter(pub => !pub.isInTrash && !pub.isRead);
    } else if (djenStatusFilter === "READ") {
      filtered = filtered.filter(pub => !pub.isInTrash && pub.isRead === true);
    } else {
      // ACTIVE - shows both read and unread, but not in trash
      filtered = filtered.filter(pub => !pub.isInTrash);
    }

    // Advise Hub Filter: Journal (Tribunal) Filter
    if (djenJournalFilter !== "ALL") {
      filtered = filtered.filter(pub => pub.tribunal === djenJournalFilter);
    }

    // Advise Hub Filter: Notebook (Caderno / Tipo de ato) Filter
    if (djenNotebookFilter !== "ALL") {
      filtered = filtered.filter(pub => pub.tipoComunicacao === djenNotebookFilter);
    }

    // Advise Hub Filter: Period Filter
    if (djenPeriodFilter !== "ALL") {
      const days = parseInt(djenPeriodFilter, 10);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      filtered = filtered.filter(pub => {
        const pubDate = new Date(pub.dataDisponibilizacao || pub.createdAt || 0);
        return pubDate >= cutoffDate;
      });
    }

    // Apply search query string locally
    if (djenSearchQuery.trim()) {
      const criteria = djenSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.numeroProcesso.includes(criteria) ||
          p.tribunal.toLowerCase().includes(criteria) ||
          p.texto.toLowerCase().includes(criteria) ||
          p.tipoComunicacao.toLowerCase().includes(criteria)
      );
    }

    return filtered;
  }, [
    publications, 
    userProfile, 
    djenSearchQuery, 
    djenStatusFilter, 
    djenJournalFilter, 
    djenNotebookFilter, 
    djenPeriodFilter
  ]);

  const getGrauDisplay = (grau: string) => {
    let val = String(grau || "").toUpperCase();
    if (val.startsWith("G") && val.length > 1 && !val.includes("GRAU")) {
      val = val.substring(1);
    }

    if (val === "1") return { label: "1º Grau", color: "text-emerald-600 bg-emerald-50" };
    if (val === "2") return { label: "2º Grau", color: "text-blue-600 bg-blue-50" };
    if (val === "JE" || val.includes("JUIZADO")) return { label: "Juizado Especial", color: "text-purple-600 bg-purple-50" };
    if (val === "TR" || val.includes("TURMA")) return { label: "Turma Recursal", color: "text-amber-600 bg-amber-50" };
    if (val) return { label: `${val}${val.length === 1 ? 'º' : ''} Grau`, color: "text-slate-600 bg-slate-50" };
    return null;
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Dynamic Tab Switcher */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl max-w-lg shadow-sm">
        <button
          onClick={() => setActiveTab("processes")}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "processes" ? "bg-white text-blue-600 shadow-md" : "text-slate-500 hover:text-slate-800"}`}
        >
          <Icons.Activity className="w-4 h-4" />
          Processos Ativos ({processes.length})
        </button>
        <button
          onClick={() => setActiveTab("djen")}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "djen" ? "bg-white text-blue-600 shadow-md" : "text-slate-500 hover:text-slate-800"}`}
        >
          <Icons.BookmarkCheck className="w-4 h-4" />
          Diário de Justiça (DJEN)
        </button>
      </div>

      {activeTab === "processes" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1 space-y-2 overflow-y-auto max-h-[85vh] pr-2 custom-scrollbar">
            {processes.length === 0 ? (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
                <div className="text-slate-300 mb-4 flex justify-center">
                  <Icons.Activity className="w-12 h-12" />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Nenhum processo sendo monitorado
                </p>
              </div>
            ) : (
              processes.map((proc) => {
                const linkedClient = clients.find(c => c.id === proc.clientId);
                return (
                  <div
                    key={proc.id}
                    onClick={() => setSelectedProcess(proc)}
                    className={`w-full p-2.5 rounded-lg border-2 text-left transition-all relative overflow-hidden group cursor-pointer ${selectedProcess?.id === proc.id ? "bg-blue-50 border-blue-600 shadow-lg shadow-blue-600/5" : "bg-white border-slate-100 hover:border-slate-300"}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedProcess(proc); } }}
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="flex flex-wrap gap-1">
                        <span className="text-[9px] font-black text-blue-600 bg-blue-100/50 px-2 py-0.5 rounded-full uppercase">
                          {proc.court}
                        </span>
                        {getGrauDisplay(proc.grau || "") && (
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${getGrauDisplay(proc.grau || "")?.color}`}>
                            {getGrauDisplay(proc.grau || "")?.label}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                           onClick={(e) => { e.stopPropagation(); onRefresh(proc); }}
                           className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                           title="Atualizar agora"
                        >
                          <Icons.RefreshCcw className="w-3.5 h-3.5" />
                        </button>
                        <button 
                           onClick={(e) => { e.stopPropagation(); handleEdit(proc); }}
                           className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors"
                           title="Editar"
                        >
                          <Icons.Edit className="w-3.5 h-3.5" />
                        </button>
                        <button 
                           onClick={(e) => { e.stopPropagation(); onRemove(proc.id); }}
                           className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
                           title="Remover"
                        >
                          <Icons.Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <h4 className="text-xs font-black text-slate-900 mb-0.5">{proc.cnj}</h4>
                    <p className="text-[9px] font-bold text-slate-600 uppercase tracking-tight truncate">
                      {linkedClient ? linkedClient.name : proc.clientName}
                    </p>
                    <p className="text-[8px] font-medium text-slate-400 uppercase tracking-tight truncate mt-0.5">
                      {proc.classe}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-[7px] font-black text-emerald-600 uppercase">
                        At: {new Date(proc.lastUpdate).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="lg:col-span-2">
            {selectedProcess ? (
              <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-100 space-y-3 animate-in slide-in-from-right-4 duration-300">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">{selectedProcess.cnj}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wide">
                        {selectedProcess.court}
                      </span>
                      {getGrauDisplay(selectedProcess.grau || "") && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wide ${getGrauDisplay(selectedProcess.grau || "")?.color}`}>
                          {getGrauDisplay(selectedProcess.grau || "")?.label}
                        </span>
                      )}
                      <div className="w-1 h-1 rounded-full bg-slate-300" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                        {clients.find(c => c.id === selectedProcess.clientId)?.name || selectedProcess.clientName}
                      </p>
                    </div>
                    {selectedProcess.classe && (
                      <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">
                        {selectedProcess.classe}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                     <div className="text-right">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Status Atual</p>
                       <p className="text-[10px] font-black text-slate-900 uppercase">{selectedProcess.status || "Em andamento"}</p>
                     </div>
                     <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                       <Icons.Activity className="w-4 h-4" />
                     </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.15em] flex items-center gap-2">
                    <Icons.List className="w-3.5 h-3.5 text-blue-600" /> Histórico de Movimentações
                  </h4>
                  
                  <div className="relative space-y-2 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                    {selectedProcess.movements.length > 0 ? (
                      [...selectedProcess.movements]
                        .sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime())
                        .map((move, idx) => (
                          <div key={idx} className="relative pl-8 animate-in fade-in duration-500" style={{ animationDelay: `${idx * 50}ms` }}>
                          <div className={`absolute left-0 top-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center z-10 ${idx === 0 ? "bg-blue-600 shadow-lg shadow-blue-300" : "bg-slate-200"}`}>
                            {idx === 0 && <Icons.Flame className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <div className={`p-2.5 rounded-xl border transition-all ${idx === 0 ? "bg-slate-50 border-blue-200" : "bg-white border-slate-100"}`}>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5 block">
                              {new Date(move.dataHora).toLocaleString("pt-BR")}
                            </span>
                            <p className={`text-xs font-bold leading-snug ${idx === 0 ? "text-slate-900" : "text-slate-600"}`}>
                              {move.descricao}
                            </p>
                            {move.complementos && move.complementos.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {move.complementos.map((c, ki) => (
                                  <span key={ki} className="text-[8px] font-black bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded-md uppercase">
                                    {c}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="pl-10 text-slate-400 text-sm font-medium italic">
                        Nenhuma movimentação detalhada encontrada na API Pública.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[400px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center text-center p-12">
                <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mb-6 text-slate-200">
                  <Icons.Activity className="w-10 h-10" />
                </div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-2">Selecione um Processo</h3>
                <p className="text-xs font-medium text-slate-400 max-w-[280px]">
                  Clique em um processo na lista lateral para visualizar o histórico completo de movimentações.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* DJEN Tab layout showing high-fidelity Advise Hub user experience */
        <div className="space-y-4">
          {/* Floating Action Toasts */}
          {toastMessage && (
            <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-800 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <Icons.ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-black uppercase tracking-wider">{toastMessage}</span>
            </div>
          )}

          {/* Controls & Filter Bar */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xl space-y-4">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-base font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                  <Icons.BookmarkCheck className="w-5 h-5 text-blue-600" />
                  Publicações do Diário de Justiça (DJEN)
                </h3>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowOabSettings(!showOabSettings)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 border ${showOabSettings ? "bg-slate-950 text-white border-slate-950 shadow-md" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}
                >
                  <Icons.Settings className="w-3.5 h-3.5" />
                  Configurar Busca
                </button>
                <button
                  onClick={handleSyncDjen}
                  disabled={isFetchingDjen}
                  className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/10 hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isFetchingDjen ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Pesquisando...
                    </>
                  ) : (
                    <>
                      <Icons.RefreshCcw className="w-3.5 h-3.5" />
                      Sincronizar
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Advise Hub Filters Block */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-2">
              {/* Journal / Tribunal Filter */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Tribunal</label>
                <select
                  value={djenJournalFilter}
                  onChange={(e) => setDjenJournalFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                >
                  <option value="ALL">Todos</option>
                  {Array.from(new Set(publications.map(p => p.tribunal).filter(Boolean))).map((court: string) => (
                    <option key={court} value={court}>{court}</option>
                  ))}
                  {/* Common defaults as fallback */}
                  <option value="TJRN">TJ Rio Grande do Norte (TJRN)</option>
                  <option value="TJSP">TJ São Paulo (TJSP)</option>
                </select>
              </div>

              {/* Notebook / Act type Filter */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Tipo de Comunicação</label>
                <select
                  value={djenNotebookFilter}
                  onChange={(e) => setDjenNotebookFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                >
                  <option value="ALL">Todos</option>
                  {Array.from(new Set(publications.map(p => p.tipoComunicacao).filter(Boolean))).map((act: string) => (
                    <option key={act} value={act}>{act}</option>
                  ))}
                  <option value="Intimação">Intimação</option>
                  <option value="Citação">Citação</option>
                  <option value="Notificação">Notificação</option>
                </select>
              </div>

              {/* Period Filter */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Período</label>
                <select
                  value={djenPeriodFilter}
                  onChange={(e) => setDjenPeriodFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                >
                  <option value="ALL">Todos</option>
                  <option value="7">Últimos 7 dias</option>
                  <option value="15">Últimos 15 dias</option>
                  <option value="30">Últimos 30 dias</option>
                  <option value="60">Últimos 60 dias</option>
                </select>
              </div>

              {/* Read / Bin Status Filter */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Status</label>
                <select
                  value={djenStatusFilter}
                  onChange={(e) => setDjenStatusFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                >
                  <option value="ACTIVE">Todos</option>
                  <option value="UNREAD">Não lidas</option>
                  <option value="READ">Lidas</option>
                  <option value="TRASH">Lixeiras / Descartadas</option>
                </select>
              </div>

              {/* Text Search Input */}
              <div className="space-y-1 sm:col-span-2 md:col-span-4 lg:col-span-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Pesquisa textual</label>
                <div className="relative">
                  <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-100 pl-9 pr-3 py-2.5 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 text-slate-700"
                    placeholder="Filtrar por palavra..."
                    value={djenSearchQuery}
                    onChange={(e) => setDjenSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* OAB setups panel */}
          {showOabSettings && (
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-4 animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-start gap-3">
                <Icons.Key className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="text-xs font-black text-slate-950 uppercase tracking-wider mb-1">
                    Painel de Identificação por OAB
                  </h4>
                  <p className="text-[11px] font-medium text-slate-500 leading-relaxed max-w-2xl">
                    Configure os registros abaixo correspondente aos advogados do escritório. O sistema utilizará os números para importar as publicações de forma autoritativa do Diário de Justiça Eletrônico Nacional (DJEN).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* User's own OAB block */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3">
                  <span className="text-[8px] font-black text-blue-600 uppercase tracking-[0.1em] bg-blue-50 px-2 py-0.5 rounded-md">
                    Sua OAB Principal
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Número</label>
                      <input
                        type="text"
                        className="w-full bg-slate-50 p-2.5 rounded-xl text-xs font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Ex: 12345"
                        value={userOab}
                        onChange={(e) => setUserOab(e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Estado (UF)</label>
                      <select
                        className="w-full bg-slate-50 p-2.5 rounded-xl text-xs font-bold border border-slate-100 outline-none"
                        value={userUf}
                        onChange={(e) => setUserUf(e.target.value)}
                      >
                        {rawUfs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Administrator OAB check, only toggleable or showing rules accordingly */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3">
                  <span className="text-[8px] font-black text-purple-600 uppercase tracking-[0.1em] bg-purple-50 px-3 py-0.5 rounded-md">
                    OAB do Administrador (Chefe)
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Número</label>
                      <input
                        type="text"
                        disabled={userProfile?.role === UserRole.ADMIN}
                        className="w-full bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed p-2.5 rounded-xl text-xs font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder={userProfile?.role === UserRole.ADMIN ? "Não Aplicável (Você é o Administrador)" : "Ex: 54321"}
                        value={userProfile?.role === UserRole.ADMIN ? "" : advAdminOab}
                        onChange={(e) => setAdvAdminOab(e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Estado (UF)</label>
                      <select
                        disabled={userProfile?.role === UserRole.ADMIN}
                        className="w-full bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed p-2.5 rounded-xl text-xs font-bold border border-slate-100 outline-none"
                        value={advAdminUf}
                        onChange={(e) => setAdvAdminUf(e.target.value)}
                      >
                        {rawUfs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowOabSettings(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveOabConfig}
                  disabled={isSavingOab}
                  className="bg-slate-900 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50 shadow-md"
                >
                  <Icons.Save className="w-3.5 h-3.5" />
                  {isSavingOab ? "Gravando..." : "Salvar Configuração"}
                </button>
              </div>
            </div>
          )}

          {/* Batch Selector & Actions Ribbon */}
          <div className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                checked={displayedPublications.length > 0 && displayedPublications.every(pub => selectedPubIds.includes(pub.id))}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedPubIds(displayedPublications.map(p => p.id));
                  } else {
                    setSelectedPubIds([]);
                  }
                }}
              />
              <span className="font-extrabold text-slate-700 uppercase tracking-wider text-[11px]">
                Exibindo {displayedPublications.length} de {publications.length} publicações
              </span>
              
              {selectedPubIds.length > 0 && (
                <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider animate-in pulse duration-1000 infinite">
                  {selectedPubIds.length} selecionadas
                </span>
              )}
            </div>

            {/* Mass actions */}
            <div className="flex items-center gap-2">
              {selectedPubIds.length > 0 ? (
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm animate-in zoom-in-95 duration-200">
                  <button
                    onClick={() => handleMarkAsRead(selectedPubIds, true)}
                    className="px-3 py-1.5 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 font-bold text-[10px] uppercase rounded-lg transition-colors border border-transparent hover:border-slate-100"
                    title="Marcar selecionadas como lidas"
                  >
                    <Icons.Check className="w-3.5 h-3.5 text-emerald-500" />
                    Lidas
                  </button>
                  <button
                    onClick={() => handleMarkAsRead(selectedPubIds, false)}
                    className="px-3 py-1.5 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 font-bold text-[10px] uppercase rounded-lg transition-colors border border-transparent hover:border-slate-100"
                    title="Marcar selecionadas como não lidas"
                  >
                    <Icons.EyeOff className="w-3.5 h-3.5 text-blue-500" />
                    Não Lidas
                  </button>
                  {djenStatusFilter === "TRASH" ? (
                    <>
                      <button
                        onClick={() => handleMoveToTrash(selectedPubIds, false)}
                        className="px-3 py-1.5 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 font-bold text-[10px] uppercase rounded-lg transition-colors border border-transparent hover:border-slate-100"
                        title="Restaurar selecionadas"
                      >
                        <Icons.Sync className="w-3.5 h-3.5 text-indigo-500" />
                        Restaurar
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(selectedPubIds)}
                        className="px-3 py-1.5 hover:bg-red-50 text-red-700 flex items-center gap-1.5 font-bold text-[10px] uppercase rounded-lg transition-colors border border-transparent hover:border-red-100"
                        title="Excluir permanentemente"
                      >
                        <Icons.Trash className="w-3.5 h-3.5 text-red-500" />
                        Excluir Definitivo
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleMoveToTrash(selectedPubIds, true)}
                      className="px-3 py-1.5 hover:bg-red-50 text-red-700 flex items-center gap-1.5 font-bold text-[10px] uppercase rounded-lg transition-colors border border-transparent hover:border-red-100"
                      title="Mover selecionadas para Lixeira"
                    >
                      <Icons.Trash className="w-3.5 h-3.5 text-red-500" />
                      Lixeira
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedPubIds([])}
                    className="px-2.5 py-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg text-[9px] uppercase font-bold"
                  >
                    Limpar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-lg border border-slate-200">
                  <button
                    onClick={() => setDjenViewLayout("list")}
                    className={`p-2 rounded-md transition-all ${djenViewLayout === "list" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-700"}`}
                    title="Layout em Lista (Advise Hub)"
                  >
                    <Icons.ListLayout className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDjenViewLayout("grid")}
                    className={`p-2 rounded-md transition-all ${djenViewLayout === "grid" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-700"}`}
                    title="Layout em Grade Benta"
                  >
                    <Icons.GridLayout className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Workspace Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left Column: Publications feed list/grid */}
            <div className="lg:col-span-1 space-y-3 overflow-y-auto max-h-[85vh] pr-2 custom-scrollbar">
              {displayedPublications.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
                  <div className="text-slate-300 mb-4 flex justify-center">
                    <Icons.BookmarkCheck className="w-16 h-16" />
                  </div>
                  <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest leading-relaxed">
                    Nenhuma publicação encontrada
                  </h4>
                  <p className="text-[9px] font-medium text-slate-400 max-w-[200px] mx-auto mt-2 leading-relaxed">
                    Não há publicações processuais que correspondam ao filtro ou OAB selecionados atualmente. Busque novamente ou mude os filtros!
                  </p>
                </div>
              ) : djenViewLayout === "grid" ? (
                <div className="grid grid-cols-1 gap-3">
                  {displayedPublications.map((pub) => (
                    <div
                      key={pub.id}
                      onClick={() => handleSelectDjenPub(pub)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer relative shadow-sm ${selectedDjenPub?.id === pub.id ? "bg-blue-50/50 border-blue-600" : "bg-white border-slate-100 hover:border-slate-300"}`}
                    >
                      <div className="absolute top-4 right-4 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={selectedPubIds.includes(pub.id)}
                          onChange={() => {
                            setSelectedPubIds(prev =>
                              prev.includes(pub.id) ? prev.filter(x => x !== pub.id) : [...prev, pub.id]
                            );
                          }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mb-2 max-w-[85%]">
                        <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wider max-w-[150px] truncate">
                          {pub.tribunal}
                        </span>
                        {pub.isRead ? (
                          <span className="text-[8px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-wider">Lida</span>
                        ) : (
                          <span className="text-[8px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wider">Não Lida</span>
                        )}
                      </div>

                      <h4 className="text-xs font-black text-slate-900 mb-1 tracking-tight truncate pr-6">{formatCNJ(pub.numeroProcesso)}</h4>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                        Disp: {pub.dataDisponibilizacao ? new Date(pub.dataDisponibilizacao).toLocaleDateString("pt-BR") : "S/ Data"}
                      </p>
                      {pub.destinatarios && pub.destinatarios.length > 0 ? (
                        <div className="mt-1 space-y-0.5">
                          <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest block">Destinatário Mencionado:</span>
                          <div className="flex flex-wrap gap-1">
                            {pub.destinatarios.map((d: any, key: number) => (
                              <span key={key} className="text-[8.5px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                                {d.nome || d.nomeDestinatario || "Parte Interessada"}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 text-[8.5px] font-semibold text-slate-400 italic">Nenhum destinatário mencionado</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* Grouped lists chronologically formatted */
                <div className="space-y-4">
                  {(() => {
                    const sortedDates = Array.from(new Set(displayedPublications.map(pub => {
                      if (!pub.dataDisponibilizacao) return "Sem Data";
                      try {
                        return new Date(pub.dataDisponibilizacao).toLocaleDateString("pt-BR");
                      } catch(e) { return "Sem Data"; }
                    }))).sort((a, b) => {
                      if (a === "Sem Data") return 1;
                      if (b === "Sem Data") return -1;
                      const [da, ma, ya] = a.split("/").map(Number);
                      const [db, mb, yb] = b.split("/").map(Number);
                      return new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime();
                    });

                    return sortedDates.map(dateStr => {
                      const listForDate = displayedPublications.filter(pub => {
                        if (!pub.dataDisponibilizacao) return dateStr === "Sem Data";
                        try {
                          return new Date(pub.dataDisponibilizacao).toLocaleDateString("pt-BR") === dateStr;
                        } catch(e) { return dateStr === "Sem Data"; }
                      });

                      const allDateSelected = listForDate.every(p => selectedPubIds.includes(p.id));

                      return (
                        <div key={dateStr} className="space-y-2 animate-in fade-in duration-300">
                          {/* Chronological Header Divider */}
                          <div className="flex items-center gap-2 px-1 py-1 bg-slate-100/75 rounded-lg border border-slate-250">
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              checked={allDateSelected}
                              onChange={(e) => {
                                const listIds = listForDate.map(p => p.id);
                                if (e.target.checked) {
                                  setSelectedPubIds(prev => Array.from(new Set([...prev, ...listIds])));
                                } else {
                                  setSelectedPubIds(prev => prev.filter(id => !listIds.includes(id)));
                                }
                              }}
                            />
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              Dia {dateStr} ({listForDate.length} {listForDate.length === 1 ? 'publicação' : 'publicações'})
                            </span>
                          </div>

                          {/* Cards representing the records of that specific date */}
                          <div className="space-y-1.5">
                            {listForDate.map((pub) => (
                              <div
                                key={pub.id}
                                onClick={() => handleSelectDjenPub(pub)}
                                className={`w-full p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer relative ${selectedDjenPub?.id === pub.id ? "bg-blue-50/70 border-blue-600 shadow-md transform scale-[1.01]" : "bg-white border-slate-100 hover:border-slate-350 hover:bg-slate-50/50"}`}
                              >
                                <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    checked={selectedPubIds.includes(pub.id)}
                                    onChange={() => {
                                      setSelectedPubIds(prev =>
                                        prev.includes(pub.id) ? prev.filter(x => x !== pub.id) : [...prev, pub.id]
                                      );
                                    }}
                                  />
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 mb-1.5 max-w-[85%]">
                                  <span className="text-[8px] font-black text-blue-600 bg-blue-55 px-1.5 py-0.5 rounded uppercase tracking-wide truncate max-w-[140px]">
                                    {pub.tribunal}
                                  </span>
                                  {pub.isRead ? (
                                    <span className="text-[7.5px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wider">Lida</span>
                                  ) : (
                                    <span className="text-[7.5px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded uppercase tracking-wider">Não Lida</span>
                                  )}
                                </div>

                                <h4 className="text-xs font-black text-slate-900 mb-1 tracking-tight truncate pr-6">{formatCNJ(pub.numeroProcesso)}</h4>
                                <div className="text-[8px] font-black text-slate-500 bg-slate-150 px-1.5 py-0.5 rounded inline-block uppercase tracking-wider mb-1">
                                  {pub.tipoComunicacao || "Intimação"}
                                </div>
                                {pub.destinatarios && pub.destinatarios.length > 0 ? (
                                  <div className="mt-1 space-y-0.5">
                                    <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest block">Destinatário Mencionado:</span>
                                    <div className="flex flex-wrap gap-1">
                                      {pub.destinatarios.map((d: any, key: number) => (
                                        <span key={key} className="text-[8.5px] font-bold text-slate-700 bg-slate-50 border border-slate-200/60 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                                          {d.nome || d.nomeDestinatario || "Parte Interessada"}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-1 text-[8.5px] font-semibold text-slate-400 italic">Nenhum destinatário mencionado</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* Right Column: Detailed publication expanded reading view pane */}
            <div className="lg:col-span-2">
              {selectedDjenPub ? (
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-150 space-y-5 animate-in slide-in-from-right-4 duration-300">
                  {/* Top toolbar header containing rich action controls & lists navigators */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      {/* Navigate controls */}
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                        <button
                          onClick={() => {
                            const idx = displayedPublications.findIndex(p => p.id === selectedDjenPub.id);
                            if (idx > 0) handleSelectDjenPub(displayedPublications[idx - 1]);
                          }}
                          disabled={displayedPublications.findIndex(p => p.id === selectedDjenPub.id) <= 0}
                          className="p-1.5 hover:bg-white text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-all"
                          title="Voltar publicação anterior"
                        >
                          <Icons.ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-[9px] font-black text-slate-400 px-1">
                          {displayedPublications.findIndex(p => p.id === selectedDjenPub.id) + 1} / {displayedPublications.length}
                        </span>
                        <button
                          onClick={() => {
                            const idx = displayedPublications.findIndex(p => p.id === selectedDjenPub.id);
                            if (idx >= 0 && idx < displayedPublications.length - 1) handleSelectDjenPub(displayedPublications[idx + 1]);
                          }}
                          disabled={displayedPublications.findIndex(p => p.id === selectedDjenPub.id) >= displayedPublications.length - 1}
                          className="p-1.5 hover:bg-white text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-all"
                          title="Próxima publicação"
                        >
                          <Icons.ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Right side operational actions toolbox */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Mark read button toggle */}
                      <button
                        onClick={() => handleMarkAsRead([selectedDjenPub.id], !selectedDjenPub.isRead)}
                        className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1"
                        title={selectedDjenPub.isRead ? "Marcar como Não Lida" : "Marcar como Lida"}
                      >
                        {selectedDjenPub.isRead ? (
                          <>
                            <Icons.EyeOff className="w-3.5 h-3.5 text-blue-600" />
                            <span className="hidden sm:inline">Não Lida</span>
                          </>
                        ) : (
                          <>
                            <Icons.Eye className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden sm:inline">Marcar Lida</span>
                          </>
                        )}
                      </button>

                      {/* Print button */}
                      <button
                        onClick={() => handlePrintPub(selectedDjenPub)}
                        className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1"
                        title="Imprimir publicação"
                      >
                        <Icons.Printer className="w-3.5 h-3.5 text-slate-500" />
                        <span className="hidden sm:inline">Imprimir</span>
                      </button>

                      {/* Download button */}
                      <button
                        onClick={() => handleDownloadPub(selectedDjenPub)}
                        className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1"
                        title="Baixar arquivo TXT da publicação"
                      >
                        <Icons.Download className="w-3.5 h-3.5 text-slate-500" />
                        <span className="hidden sm:inline">Baixar</span>
                      </button>

                      {/* Email Send button */}
                      <button
                        onClick={() => handleSendEmailPub(selectedDjenPub)}
                        className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1"
                        title="Enviar teor completo por e-mail"
                      >
                        <Icons.Mail className="w-3.5 h-3.5 text-slate-500" />
                        <span className="hidden sm:inline">E-mail</span>
                      </button>

                      {/* Trash action button */}
                      {selectedDjenPub.isInTrash ? (
                        <button
                          onClick={() => handleMoveToTrash([selectedDjenPub.id], false)}
                          className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-indigo-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1"
                          title="Restaurar da lixeira"
                        >
                          <Icons.Sync className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Restaurar</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleMoveToTrash([selectedDjenPub.id], true)}
                          className="p-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1"
                          title="Mover para a Lixeira"
                        >
                          <Icons.Trash className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Lixeira</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Core publication metadata list */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Metadados Processuais</span>
                    <div className="bg-slate-50 p-4 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-4 border border-slate-100 text-[11px] font-bold text-slate-700 leading-tight">
                      <div>
                        <span className="font-extrabold text-slate-400 text-[8px] uppercase block mb-0.5">Meio Judicial</span>
                        <span className="font-black text-slate-900 uppercase">
                          {selectedDjenPub.meio?.toUpperCase().trim() === "E"
                            ? "Edital"
                            : selectedDjenPub.meio?.toUpperCase().trim() === "D"
                            ? "Diário Eletrônico"
                            : selectedDjenPub.meio || "Diário Eletrônico"}
                        </span>
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-400 text-[8px] uppercase block mb-0.5">Tipo de Comunicação</span>
                        <span className="font-black text-slate-900 uppercase">{selectedDjenPub.tipoComunicacao || "Intimação"}</span>
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-400 text-[8px] uppercase block mb-0.5">Disponibilização</span>
                        <span className="font-black text-slate-900">{selectedDjenPub.dataDisponibilizacao ? new Date(selectedDjenPub.dataDisponibilizacao).toLocaleDateString("pt-BR") : "S/ Data"}</span>
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-400 text-[8px] uppercase block mb-0.5">Publicação</span>
                        <span className="font-black text-slate-900">{selectedDjenPub.dataPublicacao ? new Date(selectedDjenPub.dataPublicacao).toLocaleDateString("pt-BR") : "S/ Data"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Large Process ID / Number Banner with copy button */}
                  <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md border border-slate-850">
                    <div>
                      <span className="text-[7.5px] font-black text-slate-450 uppercase tracking-[0.15em] block mb-0.5">Diário de Justiça Eletrônico Nacional</span>
                      <h3 className="text-sm sm:text-base font-extrabold tracking-wider leading-none text-slate-100">
                        Processo {formatCNJ(selectedDjenPub.numeroProcesso)}
                      </h3>
                    </div>
                    
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedDjenPub.numeroProcesso);
                        showToast("Número do processo copiado!");
                      }}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-white border border-slate-700 hover:border-slate-600 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 self-start sm:self-auto shadow-sm"
                      title="Copiar número do processo CNJ"
                    >
                      <Icons.Copy className="w-3 h-3 text-slate-300" />
                      Copiar Número
                    </button>
                  </div>

                  {/* Destinatários info panel */}
                  {selectedDjenPub.destinatarios && selectedDjenPub.destinatarios.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Advogados / Destinatários Mencionados</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedDjenPub.destinatarios.map((d: any, key: number) => (
                          <span key={key} className="bg-slate-50 border border-slate-200 text-slate-750 px-3 py-1.5 rounded-xl font-extrabold text-[10px] uppercase tracking-tight flex items-center gap-1.5">
                            <Icons.Users className="w-3.5 h-3.5 text-blue-500" />
                            {d.nome || d.nomeDestinatario || "Parte Interessada"} {d.oab ? `• OAB: ${d.oab}` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Beautiful body text reader with intelligent advocate name highlighter */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Teor da Publicação</span>
                    <div className="bg-slate-50 text-slate-850 p-6 rounded-3xl font-mono text-xs leading-relaxed whitespace-pre-wrap select-all max-h-[450px] overflow-y-auto custom-scrollbar border border-slate-200 shadow-inner">
                      {highlightTeamNames(selectedDjenPub.texto)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[450px] bg-slate-50 border-2 border-dashed border-slate-250 rounded-[2rem] flex flex-col items-center justify-center text-center p-12">
                  <div className="w-20 h-20 bg-white rounded-3xl shadow-md flex items-center justify-center mb-6 text-slate-350">
                    <Icons.BookmarkCheck className="w-10 h-10 text-blue-500" />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-2">Painel de Leitura Completo</h3>
                  <p className="text-xs font-medium text-slate-500 max-w-[280px] leading-relaxed">
                    Selecione qualquer publicação listada à esquerda para carregar o leitor dinâmico do diário oficial.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      <Modal
        isOpen={isAdding}
        onClose={() => onSetIsAdding(false)}
        title="Monitorar Novo Processo"
      >
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl flex gap-4 items-start">
             <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg">
               <Icons.ShieldCheck className="w-5 h-5" />
             </div>
             <div>
               <p className="text-xs font-black text-blue-900 uppercase tracking-tight mb-1">Dica de Formatação</p>
               <p className="text-[11px] font-medium text-blue-700 leading-relaxed">
                 O padrão CNJ é NNNNNNN-DD.YYYY.J.TR.OOOO. O sistema buscará automaticamente as informações nos tribunais integrados ao Datajud.
               </p>
             </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Número do Processo (CNJ)</label>
            <input
              type="text"
              className="w-full bg-slate-50 p-5 rounded-2xl font-black text-lg outline-none focus:ring-4 focus:ring-blue-100 transition-all placeholder:text-slate-300"
              placeholder="0000000-00.0000.0.00.0000"
              value={newCnj}
              onChange={(e) => setNewCnj(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Vincular a Cliente (Opcional)</label>
            <select
              className="w-full bg-slate-50 p-5 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100 transition-all"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
            >
              <option value="">Nenhum cliente selecionado</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              onAdd(newCnj, selectedClientId || undefined);
              onSetIsAdding(false);
              setNewCnj("");
              setSelectedClientId("");
            }}
            disabled={!newCnj}
            className="w-full bg-slate-900 text-white p-6 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-blue-600 transition-all disabled:opacity-30"
          >
            CONFIRMAR MONITORAMENTO
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isEditing}
        onClose={() => { setIsEditing(false); setEditingProcess(null); }}
        title="Editar Processo"
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">CNJ (Não Editável)</label>
            <input
              type="text"
              readOnly
              className="w-full bg-slate-100 p-5 rounded-2xl font-black text-lg text-slate-400 outline-none"
              value={editingProcess?.cnj || ""}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome de Exibição do Cliente</label>
            <input
              type="text"
              className="w-full bg-slate-50 p-5 rounded-2xl font-black text-lg outline-none focus:ring-4 focus:ring-blue-100 transition-all placeholder:text-slate-300"
              placeholder="Nome do Cliente"
              value={editClientName}
              onChange={(e) => setEditClientName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Vincular a Cliente do Sistema</label>
            <select
              className="w-full bg-slate-50 p-5 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100 transition-all"
              value={editClientId}
              onChange={(e) => setEditClientId(e.target.value)}
            >
              <option value="">Acompanhamento Geral</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={saveEdit}
            className="w-full bg-blue-600 text-white p-6 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all"
          >
            SALVAR ALTERAÇÕES
          </button>
        </div>
      </Modal>
    </div>
  );
};

const DocGenerator = ({ clients }: { clients: Client[] }) => {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedTemplate, setSelectedTemplate] =
    useState<DocumentTemplate | null>(null);
  const [generatedContent, setGeneratedContent] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);

  const generate = () => {
    if (!selectedClient || !selectedTemplate) return;

    let content = selectedTemplate.content;
    const data = {
      NOME: selectedClient.name,
      DOCUMENTO: selectedClient.document,
      ENDERECO: selectedClient.address || "[ENDEREÇO NÃO CADASTRADO]",
      NACIONALIDADE: "[NACIONALIDADE]",
      ESTADO_CIVIL: "[ESTADO CIVIL]",
      PROFISSAO: "[PROFISSÃO]",
      DATA_ATUAL: new Date().toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    };

    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      content = content.replace(regex, value);
    });

    setGeneratedContent(content);
    setIsEditing(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedContent);
    alert("Copiado para a área de transferência!");
  };

  const downloadAsTxt = () => {
    const element = document.createElement("a");
    const file = new Blob([generatedContent], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `${selectedTemplate?.name || "documento"}.txt`;
    document.body.appendChild(element);
    element.click();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 space-y-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg">
              <Icons.FileText />
            </div>
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              Configurar Documento
            </h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                1. Selecionar Cliente
              </label>
              <select
                className="w-full bg-slate-50 p-4 rounded-xl font-bold text-sm border border-slate-100 outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                onChange={(e) =>
                  setSelectedClient(
                    clients.find((c) => c.id === e.target.value) || null,
                  )
                }
                value={selectedClient?.id || ""}
              >
                <option value="">Selecione o Cliente...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                2. Escolher Modelo
              </label>
              <div className="grid grid-cols-1 gap-3">
                {DEFAULT_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t)}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-start text-left ${selectedTemplate?.id === t.id ? "bg-blue-50 border-blue-600" : "bg-white border-slate-100 hover:border-slate-300"}`}
                  >
                    <span className="text-xs font-black text-slate-900 uppercase tracking-tight">
                      {t.name}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 mt-1">
                      {t.type}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={generate}
              disabled={!selectedClient || !selectedTemplate}
              className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-blue-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed mt-4"
            >
              GERAR RASCUNHO AGORA
            </button>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 space-y-6 flex flex-col min-h-[500px]">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              Visualização
            </h3>
            {isEditing && (
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm"
                  title="Copiar"
                >
                  <Icons.Copy />
                </button>
                <button
                  onClick={downloadAsTxt}
                  className="p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 transition-all shadow-sm"
                  title="Baixar TXT"
                >
                  <Icons.Download />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 p-6 relative overflow-hidden h-full">
            {isEditing ? (
              <textarea
                className="w-full h-full bg-transparent border-none outline-none font-serif text-sm leading-relaxed text-slate-800 resize-none p-2 min-h-[400px]"
                value={generatedContent}
                onChange={(e) => setGeneratedContent(e.target.value)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4 mt-20">
                <div className="scale-[2]">
                  <Icons.Sparkles />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] max-w-[200px] text-center">
                  Configure os dados à esquerda para gerar o documento
                  automaticamente
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({
  currentView,
  setView,
  user,
  userProfile,
  dynamicSettings,
  onLogout,
  onSwitchOffice,
  isOpen,
  toggleSidebar,
}: {
  currentView: string;
  setView: (v: string) => void;
  user: AuthUser | null;
  userProfile: UserProfile | null;
  dynamicSettings: NotificationSettings;
  onLogout: () => void;
  onSwitchOffice: (officeId: string) => void;
  isOpen: boolean;
  toggleSidebar: () => void;
}) => {
  const [isOfficeSelectorOpen, setIsOfficeSelectorOpen] = useState(false);
  
  const menuItems = currentView === "superadmin"
    ? [
        { id: "superadmin", label: "Faturamento Geral", icon: <Icons.ShieldCheck /> },
      ]
    : [
        { id: "dashboard", label: "Dashboard", icon: <Icons.Dashboard /> },
        { id: "agenda", label: "Agenda", icon: <Icons.Calendar /> },
        { id: "deadlines", label: "Controle de Prazos", icon: <Icons.List /> },
        { id: "timesheet", label: "Gestão de Tempo", icon: <Icons.Clock /> },
        { id: "clients", label: "Clientes", icon: <Icons.Users /> },
        { id: "correspondence", label: "Ofícios e Memorandos", icon: <Icons.Correspondence /> },
        { id: "monitoring", label: "Monitoramento", icon: <Icons.Activity /> },
        { id: "documents", label: "Documentos", icon: <Icons.FileText /> },
        { id: "reports", label: "Relatórios", icon: <Icons.Report /> },
        { id: "finance", label: "Financeiro", icon: <Icons.Finance /> },
        { id: "team", label: "Equipe", icon: <Icons.Users /> },
        { id: "settings", label: "Configurações", icon: <Icons.Settings /> },
      ].filter(item => {
        if (item.id === "team") {
          return userProfile?.role === UserRole.ADMIN || userProfile?.role === UserRole.COORDINATOR;
        }
        if (item.id === "finance") {
          return userProfile?.role === UserRole.ADMIN;
        }
        return true;
      });

  return (
    <>
      {/* Overlay para mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45] md:hidden transition-opacity"
          onClick={toggleSidebar}
        ></div>
      )}

      <aside
        className={`w-[260px] bg-[#020617] text-white h-full min-h-screen flex flex-col fixed left-0 top-0 z-50 transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <div className="pl-6 pr-5 pt-[10px] pb-[10px] md:pr-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {dynamicSettings.officeLogo ? (
                  <img 
                    src={dynamicSettings.officeLogo} 
                    alt={dynamicSettings.officeName || "Logo"} 
                    className="h-20 md:h-24 w-auto max-w-[210px] object-contain animate-in fade-in duration-500"
                    referrerPolicy="no-referrer"
                  />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-lg shadow-lg shadow-blue-500/20">
                    LP
                  </div>
                  <h1 className="text-lg font-black tracking-tight">LexPremium</h1>
                </div>
              )}
            </div>
            <button
              onClick={toggleSidebar}
              className="md:hidden p-2 text-slate-400 hover:text-white"
            >
              <Icons.Close />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setView(item.id);
                if (window.innerWidth < 768) toggleSidebar();
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${currentView === item.id ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-500 hover:text-slate-300"}`}
            >
              <span
                className={`${currentView === item.id ? "text-white" : "text-slate-500 group-hover:text-slate-300"}`}
              >
                {item.icon}
              </span>
              <span className="font-bold text-[13px]">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-3 md:p-4 mt-auto border-t border-white/5 space-y-3 bg-white/[0.01]">
          {userProfile && (userProfile.offices || user?.email === "rudyendo@gmail.com") && (
            <div className="relative">
              <button
                onClick={() => setIsOfficeSelectorOpen(!isOfficeSelectorOpen)}
                className="w-full bg-white/5 border border-white/10 p-2.5 rounded-lg flex items-center justify-between group hover:bg-white/10 transition-all font-sans"
              >
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[7px] font-black text-blue-400 uppercase tracking-widest mb-0.5">
                    Workspace Ativo
                  </span>
                  <span className="text-[11px] font-bold text-white truncate w-full flex items-center gap-2 justify-between">
                    <span className="truncate">
                      {currentView === "superadmin"
                        ? "🛡️ Painel de Controle Geral"
                        : (dynamicSettings.officeName || userProfile.offices?.find(o => o.id === userProfile.officeId)?.name || userProfile.email)}
                    </span>
                    <Icons.ChevronDown className={`w-2.5 h-2.5 shrink-0 transition-transform ${isOfficeSelectorOpen ? 'rotate-180' : ''}`} />
                  </span>
                </div>
              </button>

              {isOfficeSelectorOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-3 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="p-2 space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar">
                    {/* Lista de escritórios reais do usuário */}
                    {userProfile.offices?.map((office) => (
                      <button
                        key={office.id}
                        onClick={() => {
                          onSwitchOffice(office.id);
                          setView("dashboard");
                          setIsOfficeSelectorOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl flex flex-col items-start transition-all ${(userProfile.officeId === office.id && currentView !== "superadmin") ? 'bg-blue-600 text-white' : 'hover:bg-white/5 text-slate-400 hover:text-white'}`}
                      >
                        <span className="text-[11px] font-bold truncate w-full text-left">
                          {office.id === userProfile.officeId && dynamicSettings.officeName ? dynamicSettings.officeName : office.name}
                        </span>
                        <span className="text-[8px] font-black uppercase opacity-60 tracking-wider mt-0.5 text-left">
                          {office.role}
                        </span>
                      </button>
                    ))}

                    {/* Divisor / Opção especial de Super Admin */}
                    {user?.email === "rudyendo@gmail.com" && (
                      <div className="border-t border-white/10 pt-1.5 mt-1.5">
                        <button
                          onClick={() => {
                            setView("superadmin");
                            setIsOfficeSelectorOpen(false);
                          }}
                          className={`w-full p-2.5 rounded-xl flex flex-col items-start transition-all border border-dashed text-left ${currentView === "superadmin" ? 'bg-indigo-900 border-indigo-500 text-white animate-pulse' : 'hover:bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:text-indigo-300'}`}
                        >
                          <span className="text-[11px] font-black truncate w-full flex items-center gap-1.5">
                            🛡️ Painel de Controle Geral
                          </span>
                          <span className="text-[8px] font-black uppercase opacity-80 tracking-wider mt-0.5">
                            SISTEMA & FATURAMENTO
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {user && (
            <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5 transition-all hover:bg-white/[0.05] group">
              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="User"
                      className="w-10 h-10 rounded-full border-2 border-white/10 shadow-lg group-hover:border-blue-500/30 transition-all"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 border border-white/10">
                      <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#0b1120] rounded-full"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[12px] font-bold text-white truncate group-hover:text-blue-200 transition-colors"
                    title={user.displayName || user.email || ""}
                  >
                    {user.displayName ||
                      (user.email ? user.email.split("@")[0] : "Usuário")}
                  </p>
                  <p className="text-[10px] font-medium text-slate-400 truncate opacity-40 mt-0.5">
                    {user.email}
                  </p>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="w-full bg-slate-800/40 hover:bg-red-500/10 text-slate-400 hover:text-red-500 p-3 rounded-xl font-black text-[8px] uppercase tracking-[0.2em] transition-all border border-white/5 hover:border-red-500/20 flex items-center justify-center gap-2 group/logout"
              >
                <svg
                  className="w-3.5 h-3.5 transition-transform group-hover/logout:-translate-x-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                SAIR DO SISTEMA
              </button>
            </div>
          )}

          <p className="text-[9px] font-medium text-slate-600">
            Criado por Rudy Endo (Versão 1.1.44)
          </p>
        </div>
      </aside>
    </>
  );
};

const DEFAULT_SETTINGS: NotificationSettings = {
  greenAlertDays: 5,
  yellowAlertDays: 1,
  enableBrowserNotifications: true,
  notificationFrequency: "always",
  quietMode: false,
  responsaveis: INITIAL_RESPONSAVEIS,
  pecas: INITIAL_PECAS,
  empresas: INITIAL_EMPRESAS,
  clients: [],
  rules: [],
  officeName: "",
  officeLogo: "",
};

export default function App() {
  const [view, setView] = useState("dashboard");
  const [deadlinesSearch, setDeadlinesSearch] = useState("");
  const [deadlinesResponsavelFilter, setDeadlinesResponsavelFilter] = useState("Todos");
  const [deadlinesEmpresaFilter, setDeadlinesEmpresaFilter] = useState("Todas");
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [adminTasks, setAdminTasks] = useState<AdminTask[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [monitoredProcesses, setMonitoredProcesses] = useState<MonitoredProcess[]>([]);
  const [publications, setPublications] = useState<DjenPublication[]>([]);
  const [sentNotifications, setSentNotifications] = useState<Set<string>>(
    new Set(),
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<any>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [teamProfiles, setTeamProfiles] = useState<UserProfile[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [newRule, setNewRule] = useState<Partial<NotificationRule>>({
    deadlineType: "ALL",
    priority: "MÉDIA",
    leadTimeDays: 5,
    channels: { email: true, push: false, inApp: true },
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAgendaModalOpen, setIsAgendaModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<{
    type: "deadline" | "task";
    data: Deadline | AdminTask;
  } | null>(null);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [dashboardCalendarDate, setDashboardCalendarDate] = useState(
    new Date(),
  );

  // Time Tracking Module States
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [activeTimers, setActiveTimers] = useState<{
    deadlineId: string;
    peca: string;
    empresa: string;
    elapsedSeconds: number;
    lastStartedAt: number | null; // null if paused
    isPlaying: boolean;
    activityType: string;
    reviewState?: ReviewState;
    assignedTo?: string;
    userId?: string;
  }[]>(() => {
    try {
      const saved = localStorage.getItem("activeTimers");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Watch to persist activeTimers
  useEffect(() => {
    if (!activeTimers) return;
    const cleanTimers = activeTimers.map(t => ({
      deadlineId: t.deadlineId || "",
      peca: t.peca || "",
      empresa: t.empresa || "",
      elapsedSeconds: Number(t.elapsedSeconds) || 0,
      lastStartedAt: t.lastStartedAt ? Number(t.lastStartedAt) : null,
      isPlaying: Boolean(t.isPlaying),
      activityType: t.activityType || "",
      reviewState: t.reviewState || "",
      assignedTo: t.assignedTo || "",
      userId: t.userId || "",
    }));
    try {
      localStorage.setItem("activeTimers", JSON.stringify(cleanTimers));
    } catch (e) {
      console.error("Failed to serialize active timers:", e);
    }
  }, [activeTimers]);

  // Dynamic Favicon & Title for Pending Reviews
  useEffect(() => {
     if (!userProfile) return;
     let pendingCount = 0;
     
     deadlines.forEach(d => {
        if (d.status === DeadlineStatus.COMPLETED) return;
        
        if (userProfile.role === UserRole.LAWYER) {
           const isMyDeadline = d.assignedTo === userProfile.id;
           if (isMyDeadline && d.reviewState === ReviewState.RETURNED_TO_LAWYER) {
              pendingCount++;
           }
        } else if (userProfile.role === UserRole.COORDINATOR) {
           if (d.reviewState === ReviewState.WAITING_COORDINATOR || d.reviewState === ReviewState.VALIDATED_BY_ADMIN_WAITING_COORDINATOR) {
              pendingCount++;
           }
        } else if (userProfile.role === UserRole.ADMIN) {
           if (d.reviewState === ReviewState.WAITING_ADMIN) {
              pendingCount++;
           }
        }
     });

     // Update Document Title
     document.title = pendingCount > 0 ? `(${pendingCount}) LexPremium` : "LexPremium";

     // Update Favicon via Canvas
     const canvas = document.createElement("canvas");
     canvas.width = 32;
     canvas.height = 32;
     const ctx = canvas.getContext("2d");
     if (ctx) {
       const img = new Image();
       img.onload = () => {
         ctx.drawImage(img, 0, 0, 32, 32);
         if (pendingCount > 0) {
           ctx.beginPath();
           ctx.arc(22, 10, 10, 0, 2 * Math.PI);
           ctx.fillStyle = "#ef4444"; // red-500
           ctx.fill();
           
           ctx.font = "bold 12px Arial";
           ctx.fillStyle = "white";
           ctx.textAlign = "center";
           ctx.textBaseline = "middle";
           ctx.fillText(pendingCount.toString(), 22, 11);
         }
         
         let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
         if (!link) {
           link = document.createElement("link");
           link.rel = "icon";
           document.head.appendChild(link);
         }
         link.href = canvas.toDataURL("image/png");
       };
       // Depending on the public dir setup, wait, if the generic favicon is just a generic shield or default vite icon, we can use a hardcoded data url or fetch the existing link href. 
       const existingLink = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
       img.src = existingLink ? existingLink.href : "/favicon.ico";
     }
  }, [deadlines, userProfile]);

  // Modal to confirm stopping a timer and saving/submitting log
  const [isStopTimerModalOpen, setIsStopTimerModalOpen] = useState(false);
  const [timerToStop, setTimerToStop] = useState<{
    deadlineId: string;
    peca: string;
    empresa: string;
    elapsedSeconds: number;
    lastStartedAt: number | null;
    isPlaying: boolean;
    activityType: string;
    reviewState?: ReviewState;
    assignedTo?: string;
    userId?: string;
  } | null>(null);

  const [stopTimerForm, setStopTimerForm] = useState({
    description: "",
    durationSeconds: 0,
    status: TimeLogStatus.APPROVED as TimeLogStatus,
    activityType: "Elaboração de Peça",
    manualProcessTitle: "",
    manualPiece: "",
  });

  const [stopTimerError, setStopTimerError] = useState("");

  useEffect(() => {
    setDetailsReviewObservation("");
    setDetailsReviewError("");
  }, [selectedAppointment]);
  const [detailsReviewObservation, setDetailsReviewObservation] = useState("");
  const [detailsReviewError, setDetailsReviewError] = useState("");

  // For starting a manual timer
  const [isManualTimerModalOpen, setIsManualTimerModalOpen] = useState(false);
  const [manualTimerForm, setManualTimerForm] = useState({
    processTitle: "",
    peca: "",
    activityType: "Elaboração de Peça",
  });

  // For manual / retroactive log registration
  const [isRetroactiveLogModalOpen, setIsRetroactiveLogModalOpen] = useState(false);
  const [retroactiveLogForm, setRetroactiveLogForm] = useState({
    processTitle: "",
    peca: "",
    activityType: "Elaboração de Peça",
    durationMinutes: "",
    date: formatDateToISO(new Date()),
    description: "",
    status: TimeLogStatus.APPROVED as TimeLogStatus,
  });

  // Clock ticker to sync state rendering
  const [ticker, setTicker] = useState(0);
  useEffect(() => {
    const handle = setInterval(() => {
      setTicker((t) => t + 1);
    }, 1000);
    return () => clearInterval(handle);
  }, []);

  // Finance Module
  const [financeTransactions, setFinanceTransactions] = useState<FinanceTransaction[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [financeForm, setFinanceForm] = useState({
    type: FinanceTransactionType.RECEITA,
    category: FinanceCategory.HONORARIOS,
    amount: "",
    description: "",
    date: formatDateToISO(new Date()),
    clientId: "",
    status: FinanceStatus.PENDENTE,
  });

  const resetFinanceForm = () => {
    setEditingTransactionId(null);
    setFinanceForm({
      type: FinanceTransactionType.RECEITA,
      category: FinanceCategory.HONORARIOS,
      amount: "",
      description: "",
      date: formatDateToISO(new Date()),
      clientId: "",
      status: FinanceStatus.PENDENTE,
    });
  };

  // Team Management
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.LAWYER);
  const [newUserSector, setNewUserSector] = useState<Sector>(Sector.GENERAL);
  const [newUserName, setNewUserName] = useState("");

  const [personalOab, setPersonalOab] = useState("");
  const [personalUf, setPersonalUf] = useState("SP");
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [tempPersonalName, setTempPersonalName] = useState("");
  const [tempPersonalOab, setTempPersonalOab] = useState("");
  const [tempPersonalUf, setTempPersonalUf] = useState("SP");

  const [isEditingOfficeIdentity, setIsEditingOfficeIdentity] = useState(false);
  const [tempOfficeName, setTempOfficeName] = useState("");
  const [tempOfficeLogo, setTempOfficeLogo] = useState("");
  const rawUfs = [
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", 
    "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"
  ];

  useEffect(() => {
    if (userProfile) {
      setPersonalOab(userProfile.oab || "");
      setPersonalUf(userProfile.ufOab || "SP");
    }
  }, [userProfile]);

  // Reset agenda to current week when opening the view
  useEffect(() => {
    if (view === "agenda") {
      setCurrentCalendarDate(new Date());
    }
  }, [view]);

  const getDaysInWeek = (date: Date) => {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - (day === 0 ? -1 : day - 1); // No domingo, pula para a próxima segunda-feira
    const monday = new Date(startOfWeek.setDate(diff));

    const days = [];
    for (let i = 0; i < 5; i++) {
      // Apenas 5 dias (Seg-Sex)
      const nextDay = new Date(monday);
      nextDay.setDate(monday.getDate() + i);
      days.push(nextDay);
    }
    return days;
  };

  const getWeekRangeLabel = (date: Date) => {
    const days = getDaysInWeek(date);
    const first = days[0];
    const last = days[4];

    const options: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "short",
    };
    return `${first.toLocaleDateString("pt-BR", options)} - ${last.toLocaleDateString("pt-BR", options)}`.toUpperCase();
  };

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [isClientDetailsModalOpen, setIsClientDetailsModalOpen] =
    useState(false);
  const [selectedClientForDetails, setSelectedClientForDetails] =
    useState<Client | null>(null);
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(
    null,
  );
  const [editingAdminTaskId, setEditingAdminTaskId] = useState<string | null>(
    null,
  );
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [activeClientForProcesses, setActiveClientForProcesses] =
    useState<Client | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isFetchingCNPJ, setIsFetchingCNPJ] = useState(false);
  const [isFetchingDatajud, setIsFetchingDatajud] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientTypeFilter, setClientTypeFilter] = useState<"ALL" | "PF" | "PJ">("ALL");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAddingMonitoredProcess, setIsAddingMonitoredProcess] = useState(false);

  // State para Processos e Notas
  const [newProcess, setNewProcess] = useState({ number: "", title: "" });
  const [activeProcessForNotes, setActiveProcessForNotes] = useState<
    string | null
  >(null);
  const [newNoteText, setNewNoteText] = useState("");

  // State para Formulário de Cliente
  const [clientType, setClientType] = useState<"PF" | "PJ">("PJ");
  const [preferredNameSource, setPreferredNameSource] = useState<
    "RAZAO" | "FANTASIA"
  >("FANTASIA");
  const [clientForm, setClientForm] = useState<Partial<Client>>({
    name: "",
    document: "",
    driveUrl: "",
    tradeName: "",
    address: "",
    adminName: "",
    email: "",
    phone: "",
  });

  // Correspondência
  const [usedOficioNumbers, setUsedOficioNumbers] = useState<number[]>([]);
  const [usedMemorandoNumbers, setUsedMemorandoNumbers] = useState<number[]>(
    [],
  );
  const [oficioDetails, setOficioDetails] = useState<Record<number, { reservedBy: string; userName: string; deadlineId: string; deadlinePeca?: string; deadlineEmpresa?: string; timestamp?: string }>>({});
  const [memorandoDetails, setMemorandoDetails] = useState<Record<number, { reservedBy: string; userName: string; deadlineId: string; deadlinePeca?: string; deadlineEmpresa?: string; timestamp?: string }>>({});
  const [linkingNumber, setLinkingNumber] = useState<{ num: number; category: "oficio" | "memorando" } | null>(null);
  const [selectedDeadlineForLink, setSelectedDeadlineForLink] = useState<Deadline | null>(null);
  const [deadlineSearchTerm, setDeadlineSearchTerm] = useState("");
  const [activeCorrespondenceTab, setActiveCorrespondenceTab] = useState<
    "oficio" | "memorando"
  >("oficio");
  const [maxOficioRange, setMaxOficioRange] = useState(50);

  const [reportFilters, setReportFilters] = useState({
    empresa: "",
    responsavel: "",
    dataInicio: "",
    dataFim: "",
  });

  const [dynamicSettings, setDynamicSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);

  const [newDeadline, setNewDeadline] = useState<Partial<Deadline>>({
    peca: "",
    responsavel: "",
    empresa: "",
    assunto: "",
    instituicao: "",
    data: formatDateToISO(new Date()),
    hora: "",
    status: DeadlineStatus.PENDING,
    documentUrl: "",
    sector: Sector.GENERAL,
    assignedTo: "",
  });

  const [newAdminTask, setNewAdminTask] = useState<Partial<AdminTask>>({
    category: AdminTaskCategory.MEETING,
    title: "",
    description: "",
    date: formatDateToISO(new Date()),
    time: "",
    status: DeadlineStatus.PENDING,
    alerts: [],
    sector: Sector.GENERAL,
    assignedTo: "",
    isRecurring: false,
    recurrenceType: 'DAILY',
    recurrenceEndDate: "",
  });

  // Solicitar permissão de notificação ao carregar
  useEffect(() => {
    if ("Notification" in window) {
      if (
        Notification.permission !== "granted" &&
        Notification.permission !== "denied"
      ) {
        Notification.requestPermission();
      }
    }
  }, []);

  const playNotificationSound = () => {
    try {
      const audio = new Audio(
        "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
      );
      audio.volume = 0.5;
      audio
        .play()
        .catch((e) => console.log("Audio play blocked by browser policy"));
    } catch (e) {
      console.log("Error playing notification sound", e);
    }
  };

  const sendBrowserNotification = (title: string, body: string) => {
    if (
      dynamicSettings.enableBrowserNotifications &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(title, {
        body,
        icon: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
        badge: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
      });
      playNotificationSound();
    }
  };

  // Motor de Notificações
  useEffect(() => {
    const checkNotifications = () => {
      const now = new Date();

      // 1. Checar Tarefas Administrativas
      adminTasks.forEach((task) => {
        if (
          task.status === DeadlineStatus.COMPLETED ||
          !task.time ||
          !task.date
        )
          return;

        const [taskHour, taskMin] = task.time.split(":").map(Number);

        // Criar data base da tarefa
        const [y, m, d] = task.date.split("-").map(Number);
        const taskDateObj = new Date(y, m - 1, d, taskHour, taskMin);
        const diffMs = taskDateObj.getTime() - now.getTime();
        const diffMin = Math.floor(diffMs / 60000);

        task.alerts?.forEach((alertType) => {
          const alertId = `${task.id}-${alertType}`;
          if (sentNotifications.has(alertId)) return;

          let shouldAlert = false;
          let label = "";

          if (alertType === "ON_TIME" && diffMin <= 0 && diffMin > -5) {
            shouldAlert = true;
            label = "AGORA";
          } else if (alertType === "1H" && diffMin <= 60 && diffMin > 55) {
            shouldAlert = true;
            label = "EM 1 HORA";
          } else if (alertType === "2H" && diffMin <= 120 && diffMin > 115) {
            shouldAlert = true;
            label = "EM 2 HORAS";
          } else if (alertType === "24H" && diffMin <= 1440 && diffMin > 1435) {
            shouldAlert = true;
            label = "EM 24 HORAS";
          }

          if (shouldAlert) {
            sendBrowserNotification(
              `ALERTA: ${task.title}`,
              `${label}: ${task.time} - ${task.description || ""}`,
            );
            setSentNotifications((prev) => new Set(prev).add(alertId));
          }
        });
      });

      // 2. Checar Prazos Processuais baseados em Regras
      deadlines.forEach((deadline) => {
        if (deadline.status === DeadlineStatus.COMPLETED) return;

        const rule = (dynamicSettings.rules || []).find(
          (r) => r.deadlineType === "ALL" || r.deadlineType === deadline.peca,
        );
        if (!rule) return;

        const daysLeft = getDaysDiff(deadline.data);
        const alertId = `deadline-${deadline.id}-${rule.id}`;

        if (daysLeft === rule.leadTimeDays && !sentNotifications.has(alertId)) {
          sendBrowserNotification(
            `PRAZO: ${deadline.peca}`,
            `Faltam ${daysLeft} dias para o prazo de ${deadline.empresa}`,
          );
          setSentNotifications((prev) => new Set(prev).add(alertId));
        }
      });
    };

    const interval = setInterval(checkNotifications, 60000); // Checa a cada minuto
    checkNotifications(); // Checa imediatamente ao montar

    return () => clearInterval(interval);
  }, [adminTasks, deadlines, dynamicSettings, sentNotifications]);

  const currentMonthName = "Compilado por Mês";

  const productivityData = useMemo(() => {
    const months = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];
    const currentYear = new Date().getFullYear();

    return months.map((month, index) => {
      const dCount = deadlines.filter((d) => {
        if (d.status !== DeadlineStatus.COMPLETED) return false;
        if (!d.data) return false;
        const [y, m] = d.data.split("-").map(Number);
        return y === currentYear && m === index + 1;
      }).length;

      const tCount = adminTasks.filter((t) => {
        if (t.status !== DeadlineStatus.COMPLETED) return false;
        if (!t.date) return false;
        const [y, m] = t.date.split("-").map(Number);
        return y === currentYear && m === index + 1;
      }).length;

      return {
        name: month,
        total: dCount + tCount,
        prazos: dCount,
        tarefas: tCount,
      };
    });
  }, [deadlines, adminTasks]);

  const companyDemandData = useMemo(() => {
    const counts: Record<string, number> = {};
    deadlines.forEach((d) => {
      if (d.empresa) {
        counts[d.empresa] = (counts[d.empresa] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [deadlines]);

  const lawyerProductivityData = useMemo(() => {
    const resps = dynamicSettings.responsaveis || INITIAL_RESPONSAVEIS;
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    return resps
      .map((name) => {
        const total = deadlines.filter((d) => {
          if (d.status !== DeadlineStatus.COMPLETED || d.responsavel !== name)
            return false;
          const dDate = new Date(d.data);
          return (
            dDate.getMonth() === curMonth && dDate.getFullYear() === curYear
          );
        }).length;
        return { name, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [deadlines, dynamicSettings.responsaveis]);

  useEffect(() => {
    let unsubscribeProfileSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Limpar snapshot anterior se houver
      if (unsubscribeProfileSnapshot) {
        unsubscribeProfileSnapshot();
        unsubscribeProfileSnapshot = null;
      }

      if (firebaseUser) {
        const u = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        };
        setUser(u);

        const profileRef = doc(db, "userProfiles", firebaseUser.uid);

        // Snapshot do perfil para atualizações em tempo real
        unsubscribeProfileSnapshot = onSnapshot(profileRef, async (profileSnap) => {
          if (profileSnap.exists()) {
            let profileData = profileSnap.data() as UserProfile;
            
            // Garantir que campo offices exista
            if (!profileData.offices || profileData.offices.length === 0) {
              const legacyOffices = [{ 
                id: profileData.officeId || profileData.id, 
                name: profileData.email || "Meu Escritório", 
                role: profileData.role || UserRole.ADMIN, 
                sector: profileData.sector || Sector.GENERAL 
              }];
              await updateDoc(profileRef, { 
                offices: legacyOffices,
                memberOf: [profileData.officeId || profileData.id]
              });
              profileData.offices = legacyOffices;
              profileData.memberOf = [profileData.officeId || profileData.id];
            } else if (!profileData.memberOf || profileData.memberOf.length !== profileData.offices.length) {
              // Sincronizar memberOf se estiver faltando ou desatualizado
              const memberOf = profileData.offices.map(o => o.id);
              await updateDoc(profileRef, { memberOf });
              profileData.memberOf = memberOf;
            }

            const currentOffice = profileData.offices?.find(o => o.id === (profileData.officeId || profileData.id));
            if (currentOffice) {
              const needsSync = profileData.role !== currentOffice.role || 
                               profileData.sector !== (currentOffice.sector || Sector.GENERAL);
              
              if (needsSync) {
                profileData.role = currentOffice.role;
                profileData.sector = currentOffice.sector || Sector.GENERAL;
                await updateDoc(profileRef, { 
                  role: profileData.role, 
                  sector: profileData.sector 
                });
              } else {
                profileData.role = currentOffice.role;
                profileData.sector = currentOffice.sector || Sector.GENERAL;
              }
            }
            setUserProfile(profileData);

            // Checar convites (apenas uma vez após login ou quando perfil muda?)
            // Aqui fazemos dentro do snapshot para garantir que se o usuário recebeu um convite ele o veja
            if (firebaseUser.email) {
              try {
                const invitesRef = collection(db, "officeInvites");
                const qInvites = query(invitesRef, where("email", "==", firebaseUser.email));
                const inviteSnap = await getDocs(qInvites);
                
                if (!inviteSnap.empty) {
                  let updatedOffices = [...(profileData.offices || [])];
                  let changed = false;

                  for (const docInvite of inviteSnap.docs) {
                    const invite = docInvite.data() as any;
                    if (!updatedOffices.some(o => o.id === invite.officeId)) {
                      updatedOffices.push({ 
                        id: invite.officeId, 
                        name: invite.officeName, 
                        role: invite.role,
                        sector: invite.sector || Sector.GENERAL
                      });
                      changed = true;
                    }
                    await deleteDoc(docInvite.ref);
                  }

                  if (changed) {
                    const memberOf = updatedOffices.map(o => o.id);
                    await updateDoc(profileRef, { 
                      offices: updatedOffices,
                      memberOf
                    });
                  }
                }
              } catch (e) {
                console.error("Erro no processamento de convites:", e);
              }
            }
          } else {
            // Perfil inicial para novo usuário - Checar se já possui convites pendentes
            let initialOffices: any[] = [];
            let initialOfficeId = firebaseUser.uid;
            let initialRole = UserRole.ADMIN;
            let initialSector = Sector.GENERAL;

            if (firebaseUser.email) {
              try {
                const invitesRef = collection(db, "officeInvites");
                const qInvites = query(invitesRef, where("email", "==", firebaseUser.email));
                const inviteSnap = await getDocs(qInvites);
                
                if (!inviteSnap.empty) {
                  const inviteDocs = inviteSnap.docs;
                  for (const docInvite of inviteDocs) {
                    const invite = docInvite.data() as any;
                    initialOffices.push({
                      id: invite.officeId,
                      name: invite.officeName,
                      role: invite.role,
                      sector: invite.sector || Sector.GENERAL
                    });
                    await deleteDoc(docInvite.ref);
                  }
                  // Definir o primeiro convite como escritório ativo
                  initialOfficeId = initialOffices[0].id;
                  initialRole = initialOffices[0].role;
                  initialSector = initialOffices[0].sector;
                } else {
                  // Se não tiver convites, cria o escritório próprio padrão
                  initialOffices = [{ 
                    id: firebaseUser.uid, 
                    name: firebaseUser.email || "Meu Escritório", 
                    role: UserRole.ADMIN, 
                    sector: Sector.GENERAL 
                  }];
                }
              } catch (e) {
                console.error("Erro ao buscar convites iniciais:", e);
                initialOffices = [{ id: firebaseUser.uid, name: "Meu Escritório", role: UserRole.ADMIN, sector: Sector.GENERAL }];
              }
            } else {
              initialOffices = [{ id: firebaseUser.uid, name: "Meu Escritório", role: UserRole.ADMIN, sector: Sector.GENERAL }];
            }

            const newProfile: UserProfile = {
              id: firebaseUser.uid,
              email: firebaseUser.email || "",
              name: firebaseUser.displayName || "Usuário",
              role: initialRole,
              sector: initialSector,
              officeId: initialOfficeId,
              offices: initialOffices,
              memberOf: initialOffices.map(o => o.id),
              createdAt: new Date().toISOString(),
            };
            await setDoc(profileRef, newProfile);
            setUserProfile(newProfile);
          }
          setAuthLoading(false);
        });
      } else {
        setUser(null);
        setUserProfile(null);
        setDeadlines([]);
        setTeamProfiles([]);
        setDynamicSettings(DEFAULT_SETTINGS);
        setAuthLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfileSnapshot) (unsubscribeProfileSnapshot as () => void)();
    };
  }, []);

  // Sync Team Members of the same Office
  useEffect(() => {
    if (!userProfile) return;
    const q = query(
      collection(db, "userProfiles"),
      where("memberOf", "array-contains", userProfile.officeId),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const profiles = snap.docs.map((doc) => {
          const data = doc.data() as UserProfile;
          // Important: We need to show the role/sector for THIS office
          const officeInfo = data.offices?.find(o => o.id === userProfile.officeId);
          return {
            ...data,
            id: doc.id,
            role: officeInfo?.role || data.role,
            sector: officeInfo?.sector || data.sector
          };
        }).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setTeamProfiles(profiles as UserProfile[]);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "userProfiles"),
    );
    return () => unsubscribe();
  }, [userProfile]);

  // Sync Convites Pendentes
  useEffect(() => {
    if (!userProfile || userProfile.role !== UserRole.ADMIN) return;
    const q = query(
      collection(db, "officeInvites"),
      where("officeId", "==", userProfile.officeId)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setPendingInvites(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("Erro na sincronização de convites:", err);
    });
    return () => unsubscribe();
  }, [userProfile]);

  // Sync Status de Assinatura do Escritório (Faturamento)
  useEffect(() => {
    if (!user || !userProfile || !userProfile.officeId) {
      setSubscriptionLoading(false);
      return;
    }
    setSubscriptionLoading(true);
    const subRef = doc(db, "officeSubscriptions", userProfile.officeId);
    
    const unsubscribe = onSnapshot(
      subRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          setCurrentSubscription(docSnap.data());
          setSubscriptionLoading(false);
        } else {
          // Se não existir, inicializa o cadastro de faturamento do escritório
          try {
            const newSub = {
              officeId: userProfile.officeId,
              officeName: userProfile.offices?.find(o => o.id === userProfile.officeId)?.name || userProfile.name || "Meu Escritório",
              ownerId: user.uid,
              ownerEmail: user.email || "",
              status: "PENDING_CHOICE",
              validUntil: null,
              planName: "Escolha um Plano",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            
            await setDoc(subRef, newSub);
            setCurrentSubscription(newSub);
          } catch (e) {
            console.error("Erro ao inicializar faturamento do escritório:", e);
          } finally {
            setSubscriptionLoading(false);
          }
        }
      },
      (err) => {
        console.error("Erro na leitura de faturamento:", err);
        setSubscriptionLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user, userProfile?.officeId]);

  // Sync Configurações do Escritório
  useEffect(() => {
    if (!user || !userProfile) return;
    const settingsRef = doc(db, "settings", userProfile.officeId);
    const unsubscribe = onSnapshot(
      settingsRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          setDynamicSettings((prev) => ({
            ...DEFAULT_SETTINGS,
            ...data,
            responsaveis: data.responsaveis || INITIAL_RESPONSAVEIS,
            pecas: data.pecas || INITIAL_PECAS,
            empresas: data.empresas || INITIAL_EMPRESAS,
            rules: data.rules || [],
          }));
          setPermissionError(null);
        } else {
          // Inicializar configurações do escritório com padrões
          setDoc(settingsRef, {
            officeId: userProfile.officeId,
            responsaveis: INITIAL_RESPONSAVEIS,
            pecas: INITIAL_PECAS,
            empresas: INITIAL_EMPRESAS,
            rules: [],
            createdAt: new Date().toISOString(),
          }).catch((err) =>
            handleFirestoreError(err, OperationType.WRITE, "settings"),
          );
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, "settings"),
    );
    return () => unsubscribe();
  }, [user, userProfile?.officeId]);

  // Sync Monitored Processes
  useEffect(() => {
    if (!userProfile) return;
    let q;
    if (userProfile.role === UserRole.ADMIN) {
      q = query(
        collection(db, "monitoredProcesses"),
        where("officeId", "==", userProfile.officeId),
      );
    } else if (userProfile.role === UserRole.COORDINATOR) {
      q = query(
        collection(db, "monitoredProcesses"),
        where("officeId", "==", userProfile.officeId),
        where("sector", "==", userProfile.sector),
      );
    } else {
      q = query(
        collection(db, "monitoredProcesses"),
        where("officeId", "==", userProfile.officeId),
        where("userId", "==", userProfile.id),
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const procs = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as MonitoredProcess[];
        setMonitoredProcesses(procs);
      },
      (err) => {
        console.error("Monitored Processes Listener Error:", err);
        if (err.message.includes("index")) {
          console.warn("Missing Firestore Index. Please check console for the link to create it.");
        }
        handleFirestoreError(err, OperationType.LIST, "monitoredProcesses");
      },
    );
    return () => unsubscribe();
  }, [userProfile]);

  // Sync Publications (DJEN)
  useEffect(() => {
    if (!userProfile || !userProfile.officeId) return;

    const q = query(
      collection(db, "publications"),
      where("officeId", "==", userProfile.officeId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const pubs = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as DjenPublication[];
        pubs.sort((a, b) => {
          const dateA = new Date(a.dataDisponibilizacao || a.dataPublicacao || 0).getTime();
          const dateB = new Date(b.dataDisponibilizacao || b.dataPublicacao || 0).getTime();
          return dateB - dateA;
        });
        setPublications(pubs);
      },
      (err) => {
        console.error("Publications Listener Error:", err);
        handleFirestoreError(err, OperationType.LIST, "publications");
      }
    );
    return () => unsubscribe();
  }, [userProfile]);

  // Sync Prazos
  useEffect(() => {
    if (!userProfile) return;
    setIsSyncing(true);

    // Sync Prazos
    let q = firestoreQuery(
      collection(db, "deadlines"),
      where("officeId", "==", userProfile.officeId),
    );

    // Filtros de visibilidade por cargo
    if (userProfile.role === UserRole.COORDINATOR) {
      if (userProfile.sector === Sector.GENERAL) {
        q = firestoreQuery(
          q,
          or(
            where("sector", "==", Sector.GENERAL),
            where("sector", "==", null),
            where("sector", "==", ""),
          ),
        );
      } else {
        q = firestoreQuery(q, where("sector", "==", userProfile.sector));
      }
    } else if (userProfile.role === UserRole.LAWYER || userProfile.role === UserRole.INTERN) {
      q = firestoreQuery(
        q,
        or(
          where("userId", "==", userProfile.id),
          where("assignedTo", "==", userProfile.id),
        ),
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedDeadlines = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Deadline[];
        setDeadlines(
          loadedDeadlines.sort((a, b) => a.data.localeCompare(b.data)),
        );
        setIsSyncing(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, "deadlines"),
    );
    return () => unsubscribe();
  }, [userProfile]);

  // Sync Agenda Adm
  useEffect(() => {
    if (!userProfile) return;

    // Sync Agenda Adm
    let q = firestoreQuery(
      collection(db, "adminTasks"),
      where("officeId", "==", userProfile.officeId),
    );

    // Filtros de visibilidade por cargo
    if (userProfile.role === UserRole.COORDINATOR) {
      if (userProfile.sector === Sector.GENERAL) {
        q = firestoreQuery(
          q,
          or(
            where("sector", "==", Sector.GENERAL),
            where("sector", "==", null),
            where("sector", "==", ""),
          ),
        );
      } else {
        q = firestoreQuery(q, where("sector", "==", userProfile.sector));
      }
    } else if (userProfile.role === UserRole.LAWYER || userProfile.role === UserRole.INTERN) {
      q = firestoreQuery(
        q,
        or(
          where("userId", "==", userProfile.id),
          where("assignedTo", "==", userProfile.id),
        ),
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as AdminTask[];
        setAdminTasks(
          loaded.sort(
            (a, b) =>
              a.date.localeCompare(b.date) ||
              (a.time || "").localeCompare(b.time || ""),
          ),
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, "adminTasks"),
    );
    return () => unsubscribe();
  }, [userProfile]);

  // Sync Clientes
  useEffect(() => {
    if (!userProfile) return;
    let q = firestoreQuery(
      collection(db, "clients"),
      where("officeId", "==", userProfile.officeId),
    );

    // Filtros de visibilidade por cargo
    if (userProfile.role === UserRole.COORDINATOR) {
      if (userProfile.sector === Sector.GENERAL) {
        q = firestoreQuery(
          q,
          or(
            where("sector", "==", Sector.GENERAL),
            where("sector", "==", null),
            where("sector", "==", ""),
          ),
        );
      } else {
        q = firestoreQuery(q, where("sector", "==", userProfile.sector));
      }
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Client[];
        setClients(loaded.sort((a, b) => a.name.localeCompare(b.name)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, "clients"),
    );
    return () => unsubscribe();
  }, [userProfile]);

  // Migração automática de clientes legados (do settings para a coleção dedicada)
  useEffect(() => {
    if (
      !user ||
      !dynamicSettings.clients ||
      dynamicSettings.clients.length === 0
    )
      return;

    const migrate = async () => {
      console.log("Detectados clientes legados para migração...");
      const legacyClients = dynamicSettings.clients!;

      for (const client of legacyClients) {
        try {
          const existingDoc = await getDoc(doc(db, "clients", client.id));
          if (!existingDoc.exists()) {
            await setDoc(doc(db, "clients", client.id), {
              ...client,
              userId: user.uid,
              officeId: userProfile?.officeId || user.uid,
              userEmail: user.email,
              migratedAt: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error("Falha ao migrar cliente:", client.name, e);
        }
      }

      await updateSettings({ clients: [] });
      console.log("Migração de clientes concluída.");
    };

    migrate();
  }, [user, dynamicSettings.clients]);

  // Sync Correspondência
  useEffect(() => {
    if (!user) return;
    
    // Agora usamos officeId se disponível para compartilhamento no escritório
    const docId = userProfile?.officeId || user.uid;
    const oficioRef = doc(db, "correspondence", docId);
    const individualRef = doc(db, "correspondence", user.uid);
    const emailRef = doc(db, "correspondence", user.email || "no-email");

    const unsubscribe = onSnapshot(
      oficioRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          setUsedOficioNumbers(data.oficio || []);
          setUsedMemorandoNumbers(data.memorando || []);
          setOficioDetails(data.oficioDetails || {});
          setMemorandoDetails(data.memorandoDetails || {});
        } else {
          // Migração cascade: OfficeId -> Individual UID -> Individual Email
          const attemptMigration = async () => {
            try {
              // Tenta individual UID primeiro (se for diferente do docId atual)
              if (docId !== user.uid) {
                const individualSnap = await getDoc(individualRef);
                if (individualSnap.exists()) {
                  const data = individualSnap.data() as any;
                  await setDoc(oficioRef, { ...data, officeId: userProfile?.officeId }, { merge: true });
                  return;
                }
              }

              // Tenta Email (legado antigo)
              const emailSnap = await getDoc(emailRef);
              if (emailSnap.exists()) {
                const data = emailSnap.data() as any;
                await setDoc(oficioRef, { ...data, officeId: userProfile?.officeId }, { merge: true });
              } else {
                // Cria novo se não existir nada
                await setDoc(
                  oficioRef,
                  { oficio: [], memorando: [], officeId: userProfile?.officeId },
                  { merge: true },
                );
              }
            } catch (err) {
              console.error("Erro na migração de correspondência:", err);
            }
          };
          attemptMigration();
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "correspondence");
      },
    );
    return () => unsubscribe();
  }, [user, userProfile]);

  // Sync Finance Transactions
  useEffect(() => {
    if (!userProfile || userProfile.role !== UserRole.ADMIN) {
      setFinanceTransactions([]);
      return;
    }

    const q = firestoreQuery(
      collection(db, "financeTransactions"),
      where("officeId", "==", userProfile.officeId),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const transList = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as FinanceTransaction[];
        setFinanceTransactions(transList);
      },
      (err) => {
        console.error("Finance Transactions Listener Error:", err);
        handleFirestoreError(err, OperationType.LIST, "financeTransactions");
      },
    );
    return () => unsubscribe();
  }, [userProfile]);

  // Sync Recurring Expenses
  useEffect(() => {
    if (!userProfile || userProfile.role !== UserRole.ADMIN) {
      setRecurringExpenses([]);
      return;
    }

    const q = firestoreQuery(
      collection(db, "recurringExpenses"),
      where("officeId", "==", userProfile.officeId),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as RecurringExpense[];
        setRecurringExpenses(list);
      },
      (err) => {
        console.error("Recurring Expenses Listener Error:", err);
      },
    );
    return () => unsubscribe();
  }, [userProfile]);

  // Sync Time Logs
  useEffect(() => {
    if (!userProfile) {
      setTimeLogs([]);
      return;
    }

    const q = firestoreQuery(
      collection(db, "timeLogs"),
      where("officeId", "==", userProfile.officeId),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as TimeLog[];
        setTimeLogs(list);
      },
      (err) => {
        console.error("Time Logs Listener Error:", err);
      },
    );
    return () => unsubscribe();
  }, [userProfile]);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  // Verificação de Senha Admin
  const verifyAdminPassword = async (): Promise<boolean> => {
    if (!user || !auth.currentUser) return false;

    // Se o usuário logou com Google, não pedimos senha de e-mail (pois não existe)
    // Usamos uma confirmação explícita para ações sensíveis
    const isGoogleUser = auth.currentUser.providerData.some(
      (p) => p.providerId === "google.com",
    );

    if (isGoogleUser) {
      return confirm(
        "Esta é uma ação sensível (excluir numeração permanente). Deseja confirmar sua identidade e prosseguir?",
      );
    }

    const password = prompt(
      "Confirmação de Segurança. Digite sua senha de acesso:",
    );
    if (!password || !user.email) return false;

    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(auth.currentUser, credential);
      return true;
    } catch (error: any) {
      console.error("Erro na reautenticação:", error);
      alert("Falha na verificação: Senha incorreta ou erro de conexão.");
      return false;
    }
  };

  const handleToggleCorrespondenceNumber = async (
    num: number,
    category: "oficio" | "memorando",
  ) => {
    if (!user || !userProfile) return;
    const currentList =
      category === "oficio" ? usedOficioNumbers : usedMemorandoNumbers;
    const isAlreadyUsed = currentList.includes(num);

    if (isAlreadyUsed) {
      const isAuthorized =
        userProfile.role === UserRole.ADMIN ||
        userProfile.role === UserRole.COORDINATOR;
      if (!isAuthorized) {
        alert(
          "Apenas coordenadores e administradores possuem autorização para desmarcar ou liberar um número reservado."
        );
        return;
      }

      const confirmRelease = confirm(
        `Deseja realmente desmarcar o ${
          category === "oficio" ? "Ofício" : "Memorando"
        } Nº ${num.toString().padStart(3, "0")}?`
      );
      if (!confirmRelease) return;

      const updatedList = currentList.filter((n) => n !== num);
      const detailField =
        category === "oficio" ? "oficioDetails" : "memorandoDetails";
      const currentDetails =
        category === "oficio" ? { ...oficioDetails } : { ...memorandoDetails };
      delete currentDetails[num];

      try {
        const docId = userProfile.officeId || user.uid;
        const oficioRef = doc(db, "correspondence", docId);
        await setDoc(
          oficioRef,
          {
            [category]: updatedList,
            [detailField]: currentDetails,
            officeId: userProfile.officeId,
          },
          { merge: true }
        );
      } catch (err: any) {
        alert("Erro ao remover reserva.");
      }
    } else {
      // Abre modal de vinculação ao prazo para marcação
      setLinkingNumber({ num, category });
      setSelectedDeadlineForLink(null);
      setDeadlineSearchTerm("");
    }
  };

  const handleSaveCorrespondenceLink = async (
    num: number,
    category: "oficio" | "memorando",
    deadline: Deadline
  ) => {
    if (!user || !userProfile) return;
    const currentList =
      category === "oficio" ? usedOficioNumbers : usedMemorandoNumbers;
    
    if (currentList.includes(num)) {
      alert("Este número já está em uso.");
      return;
    }

    const updatedList = [...currentList, num].sort((a, b) => a - b);
    const detailField = category === "oficio" ? "oficioDetails" : "memorandoDetails";
    
    const currentDetails = category === "oficio" ? { ...oficioDetails } : { ...memorandoDetails };
    currentDetails[num] = {
      reservedBy: user.uid,
      userName: userProfile.name || user.email || "Membro",
      deadlineId: deadline.id,
      deadlinePeca: deadline.peca,
      deadlineEmpresa: deadline.empresa,
      timestamp: new Date().toISOString()
    };

    try {
      const docId = userProfile.officeId || user.uid;
      const oficioRef = doc(db, "correspondence", docId);
      await setDoc(oficioRef, { 
        [category]: updatedList, 
        [detailField]: currentDetails,
        officeId: userProfile.officeId 
      }, { merge: true });
      
      setLinkingNumber(null);
      setSelectedDeadlineForLink(null);
      setDeadlineSearchTerm("");
    } catch (err: any) {
      alert("Erro ao gravar reserva.");
    }
  };

  const getNextNumber = (category: "oficio" | "memorando") => {
    const list =
      category === "oficio" ? usedOficioNumbers : usedMemorandoNumbers;
    for (let i = 1; i <= 5000; i++) {
      if (!list.includes(i)) return i;
    }
    return 1;
  };

  const nextOficioNumber = useMemo(
    () => getNextNumber("oficio"),
    [usedOficioNumbers],
  );
  const nextMemorandoNumber = useMemo(
    () => getNextNumber("memorando"),
    [usedMemorandoNumbers],
  );

  const handleLogin = async (
    email: string,
    pass: string,
    isSignUp: boolean,
  ) => {
    setAuthLoading(true);
    try {
      if (isSignUp) await createUserWithEmailAndPassword(auth, email, pass);
      else await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      alert("Credenciais inválidas.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Erro Google Login:", err);
      if (err.code === "auth/unauthorized-domain") {
        alert(
          "Erro: Este domínio não está autorizado no Firebase Console. Adicione '" +
            window.location.hostname +
            "' em Authentication > Settings > Authorized Domains.",
        );
      } else {
        alert(
          `Falha no login com Google: ${err.message || "Erro desconhecido"}`,
        );
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const resetAdminTaskForm = () => {
    setNewAdminTask({
      category: AdminTaskCategory.MEETING,
      title: "",
      description: "",
      date: formatDateToISO(new Date()),
      time: "",
      status: DeadlineStatus.PENDING,
      sector: userProfile?.sector || Sector.GENERAL,
      alerts: [],
      isRecurring: false,
      recurrenceType: 'DAILY',
      recurrenceEndDate: "",
    });
    setEditingAdminTaskId(null);
  };

  const resetDeadlineForm = () => {
    setNewDeadline({
      peca: "",
      responsavel: "",
      empresa: "",
      assunto: "",
      instituicao: "",
      data: formatDateToISO(new Date()),
      hora: "",
      status: DeadlineStatus.PENDING,
      sector: userProfile?.sector || Sector.GENERAL,
      documentUrl: "",
    });
    setEditingDeadlineId(null);
  };

  const handleEditClick = (d: Deadline) => {
    setEditingDeadlineId(d.id);
    setNewDeadline({ ...d });
    setIsModalOpen(true);
  };

  const handleEditAdminTaskClick = (t: AdminTask) => {
    setEditingAdminTaskId(t.id);
    setNewAdminTask({ ...t });
    setIsAgendaModalOpen(true);
  };

  const handleAddUser = async () => {
    if (!userProfile || userProfile.role !== UserRole.ADMIN) return;
    if (!newUserEmail || !newUserName) return;

    try {
      // In a real app, you'd send an invite. Here we pre-create the profile.
      // We will search for existing profiles by email first to avoid duplicates.
      const q = query(
        collection(db, "userProfiles"),
        where("email", "==", newUserEmail.toLowerCase()),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        alert("Este usuário já está cadastrado em um escritório.");
        return;
      }

      // Generate a temporary ID or wait for them to join? 
      // Let's create a pending profile or just assume the admin knows the UID?
      // Better strategy: Admin enters details, and when the user logs in, they are matched by email.
      // But rules require known ID. For simplicity, we'll use email as doc ID if UID not known?
      // No, let's use a random ID for now or a specific collection for invites.
      // For this demo, let's just allow the admin to change roles of already joined members.

      alert("Funcionalidade: Membros devem se cadastrar primeiro. O administrador então altera o cargo deles na lista da equipe.");
      setIsAddUserModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "userProfiles");
    }
  };

  const canManageMember = (memberRole: UserRole, memberSector: Sector) => {
    if (!userProfile) return false;
    if (userProfile.role === UserRole.ADMIN) return true;
    if (userProfile.role === UserRole.COORDINATOR) {
      // Coordenador não gerencia Administrador nem outros Coordenadores
      if (memberRole === UserRole.ADMIN || memberRole === UserRole.COORDINATOR)
        return false;
      // Coordenador gerencia apenas Advogados/Estagiários do seu setor
      return (
        (memberRole === UserRole.LAWYER || memberRole === UserRole.INTERN) &&
        memberSector === userProfile.sector
      );
    }
    return false;
  };

  const handleUpdateUserRole = async (
    member: UserProfile,
    role: UserRole,
    sector: Sector,
  ) => {
    if (!userProfile || !canManageMember(member.role, member.sector)) return;
    try {
      const updatedOffices = member.offices?.map(o => 
        o.id === userProfile.officeId ? { ...o, role, sector } : o
      ) || [];
      const memberOf = updatedOffices.map(o => o.id);

      await updateDoc(doc(db, "userProfiles", member.id), { 
        role, 
        sector,
        offices: updatedOffices,
        memberOf
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "userProfiles");
    }
  };

  const handleDeleteMember = async (member: UserProfile) => {
    if (!userProfile || !canManageMember(member.role, member.sector)) return;
    if (
      !window.confirm(
        `Tem certeza que deseja remover ${member.name || member.email} do escritório?`,
      )
    )
      return;

    try {
      const updatedOffices =
        member.offices?.filter((o) => o.id !== userProfile.officeId) || [];
      const memberOf = updatedOffices.map((o) => o.id);

      await updateDoc(doc(db, "userProfiles", member.id), {
        offices: updatedOffices,
        memberOf,
        ...(member.officeId === userProfile.officeId ? { officeId: "" } : {}),
      });
      alert("Membro removido com sucesso.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "userProfiles");
    }
  };

  const handleSwitchOffice = async (officeId: string) => {
    if (!user || !userProfile) return;
    try {
      const selectedOffice = userProfile.offices?.find((o) => o.id === officeId);
      if (!selectedOffice) return;

      const profileRef = doc(db, "userProfiles", user.uid);
      await updateDoc(profileRef, {
        officeId,
        role: selectedOffice.role,
        sector: selectedOffice.sector || Sector.GENERAL,
      });

      // Limpar estados locais antes de atualizar o perfil para evitar flash de dados antigos
      setDeadlines([]);
      setAdminTasks([]);
      setClients([]);
      setTeamProfiles([]);
      setDynamicSettings(DEFAULT_SETTINGS);

      setUserProfile((prev) =>
        prev ? { ...prev, officeId, role: selectedOffice.role, sector: selectedOffice.sector || Sector.GENERAL } : null,
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "userProfiles");
    }
  };

  const handleInviteMember = async () => {
    if (!user || !userProfile || !newUserEmail) return;
    
    // Check permission
    const isAdmin = userProfile.role === UserRole.ADMIN;
    const isCoordinator = userProfile.role === UserRole.COORDINATOR;
    
    if (!isAdmin && !isCoordinator) return;
    
    // Restrictions for Coordinator
    if (isCoordinator) {
      if (newUserRole === UserRole.ADMIN || newUserRole === UserRole.COORDINATOR) {
        alert("Coordenadores não podem convidar Administradores ou outros Coordenadores.");
        return;
      }
      if (newUserSector !== userProfile.sector) {
        alert(`Você só pode convidar membros para o setor ${userProfile.sector}.`);
        return;
      }
    }

    try {
      const activeOffice = userProfile.offices?.find(o => o.id === userProfile.officeId);
      const officeName = dynamicSettings.officeName || activeOffice?.name || "Escritório Compartilhado";

      await addDoc(collection(db, "officeInvites"), {
        email: newUserEmail,
        officeId: userProfile.officeId,
        officeName: officeName,
        role: newUserRole,
        sector: newUserSector,
        invitedBy: user.uid,
        createdAt: new Date().toISOString()
      });

      alert(`Convite enviado para ${newUserEmail}`);
      setIsAddUserModalOpen(false);
      setNewUserEmail("");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "officeInvites");
    }
  };

  const handleCreateNewOffice = async (name: string) => {
    if (!user || !userProfile) return;
    const newOfficeId = `office-${Date.now()}`;
    const newOfficeEntry = { id: newOfficeId, name, role: UserRole.ADMIN, sector: Sector.GENERAL };
    
    try {
      const profileRef = doc(db, "userProfiles", user.uid);
      const updatedOffices = [...(userProfile.offices || []), newOfficeEntry];
      const memberOf = updatedOffices.map(o => o.id);
      
      // Criar a assinatura em officeSubscriptions com 30 dias de trial gratuito
      const defaultExpiry = new Date();
      defaultExpiry.setDate(defaultExpiry.getDate() + 30);
      const subRef = doc(db, "officeSubscriptions", newOfficeId);
      
      await setDoc(subRef, {
        officeId: newOfficeId,
        officeName: name.trim(),
        ownerId: user.uid,
        ownerEmail: user.email || "",
        status: "FREE_TRIAL",
        validUntil: defaultExpiry.toISOString().split("T")[0],
        planName: "Período de Testes",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await updateDoc(profileRef, { 
        offices: updatedOffices,
        memberOf,
        officeId: newOfficeId,
        role: UserRole.ADMIN
      });

      setUserProfile(prev => prev ? { 
        ...prev, 
        offices: updatedOffices, 
        officeId: newOfficeId, 
        role: UserRole.ADMIN 
      } : null);

      alert(`Novo escritório "${name}" criado com sucesso! Inicializado com 30 dias de Trial.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "userProfiles");
    }
  };

  const TeamManagement = () => {
    const getInitials = (name: string) => {
      const parts = (name || "?").trim().split(/\s+/);
      if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    return (
      <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
        <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -translate-y-12 translate-x-12 opacity-50 group-hover:scale-110 transition-all"></div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6 relative">
            {/* Título e ícone */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                <Icons.Users />
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
                  Membros do Escritório
                </h3>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                  Gerencie quem tem acesso e as permissões de cada integrante
                </p>
              </div>
            </div>

            {/* Ações superiores */}
            {(userProfile?.role === UserRole.ADMIN ||
              userProfile?.role === UserRole.COORDINATOR) && (
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {userProfile.role === UserRole.ADMIN && (
                  <>
                    <button
                      onClick={() => {
                        const name = prompt("Nome do Novo Escritório:");
                        if (name) handleCreateNewOffice(name);
                      }}
                      className="bg-slate-50 text-slate-900 px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-100 hover:border-slate-300 transition-all border border-slate-200 flex items-center gap-2"
                    >
                      <Icons.Plus className="w-3.5 h-3.5" /> NOVO ESCRITÓRIO
                    </button>
                    <button
                      onClick={async () => {
                        const confirm = window.confirm(
                          "Isso irá sincronizar as permissões de acesso de todos os membros visíveis da equipe. Continuar?",
                        );
                        if (!confirm) return;
                        try {
                          let count = 0;
                          for (const profile of teamProfiles) {
                            const correctMemberOf = (profile.offices || []).map(
                              (o: any) => o.id,
                            );
                            if (correctMemberOf.length > 0) {
                              await updateDoc(
                                doc(db, "userProfiles", profile.id),
                                {
                                  memberOf: correctMemberOf,
                                },
                              );
                              count++;
                            }
                          }
                          alert(`${count} membros atualizados com sucesso!`);
                        } catch (err) {
                          console.error(err);
                          alert("Erro ao sincronizar. Verifique o console.");
                        }
                      }}
                      className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-100/55 transition-all flex items-center gap-2"
                      title="Sincronizar Permissões da Equipe"
                    >
                      <Icons.ShieldCheck className="w-3.5 h-3.5" /> SINCRONIZAR DADOS
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    if (userProfile?.role === UserRole.COORDINATOR) {
                      setNewUserRole(UserRole.LAWYER);
                      setNewUserSector(userProfile.sector);
                    }
                    setIsAddUserModalOpen(true);
                  }}
                  className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md hover:shadow-lg hover:bg-blue-700 hover:-translate-y-0.5 transition-all flex items-center gap-2"
                >
                  <Icons.Users className="w-3.5 h-3.5" /> CONVIDAR MEMBRO
                </button>
              </div>
            )}
          </div>

          {/* Tabela Otimizada e Compacta */}
          <div className="overflow-x-auto no-scrollbar relative">
            <table className="w-full text-left border-separate border-spacing-y-2">
              <thead>
                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-4 pb-2">Nome / E-mail</th>
                  <th className="px-4 pb-2">Função</th>
                  <th className="px-4 pb-2">Setor</th>
                  <th className="px-4 pb-2">OAB Associada</th>
                  <th className="px-4 pb-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {teamProfiles.map((member) => (
                  <tr
                    key={member.id}
                    className="group bg-slate-50/50 hover:bg-slate-100/70 border border-slate-100 transition-all"
                  >
                    <td className="px-4 py-3 rounded-l-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs shrink-0 shadow-sm border border-blue-200">
                          {getInitials(member.name)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 text-xs md:text-sm uppercase tracking-tight flex items-center gap-2">
                            {member.name || "Sem Nome"}
                            {member.id === userProfile?.id && (
                              <span className="bg-emerald-500 text-white text-[7px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter shadow-sm">Você</span>
                            )}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {member.email}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {canManageMember(member.role, member.sector) ? (
                        <select
                          className="bg-white border border-slate-200 text-slate-800 rounded-xl px-2.5 py-1.5 text-[9px] font-black uppercase outline-none focus:ring-2 focus:ring-blue-500 hover:border-slate-300 transition-all cursor-pointer"
                          value={member.role}
                          onChange={(e) =>
                            handleUpdateUserRole(
                              member,
                              e.target.value as UserRole,
                              member.sector,
                            )
                          }
                        >
                          {Object.values(UserRole).map((r) => {
                            if (
                              userProfile?.role === UserRole.COORDINATOR &&
                              r !== UserRole.LAWYER &&
                              r !== UserRole.INTERN
                            )
                              return null;
                            return (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider ${
                            member.role === UserRole.ADMIN 
                              ? "bg-red-100 text-red-600" 
                              : "bg-blue-100 text-blue-600"
                          }`}
                        >
                          {member.role}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canManageMember(member.role, member.sector) ? (
                        <select
                          className="bg-white border border-slate-200 text-slate-800 rounded-xl px-2.5 py-1.5 text-[9px] font-black uppercase outline-none focus:ring-2 focus:ring-blue-500 hover:border-slate-300 transition-all cursor-pointer"
                          value={member.sector}
                          onChange={(e) =>
                            handleUpdateUserRole(
                              member,
                              member.role,
                              e.target.value as Sector,
                            )
                          }
                        >
                          {Object.values(Sector).map((s) => {
                            if (
                              userProfile?.role === UserRole.COORDINATOR &&
                              s !== userProfile.sector
                            )
                              return null;
                            return (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          {member.sector}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {member.oab ? (
                        <span className="bg-blue-50/50 text-blue-700 text-[9px] px-2 py-1 rounded-lg font-black uppercase tracking-wider border border-blue-100">
                          OAB: {member.oab}/{member.ufOab || "SP"}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 italic">
                          Não cadastrada
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right rounded-r-xl">
                      {member.id === userProfile?.id ? (
                        <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mr-2">
                          Você
                        </span>
                      ) : (
                        canManageMember(member.role, member.sector) && (
                          <button
                            onClick={() => handleDeleteMember(member)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all border border-transparent hover:border-red-100"
                          >
                            <Icons.Trash className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
                
                {pendingInvites.map((invite) => (
                  <tr key={invite.id} className="bg-amber-50/20 border border-amber-100 rounded-xl animate-pulse">
                    <td className="px-4 py-3 rounded-l-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-black text-xs shrink-0 border border-amber-200">
                          {getInitials(invite.email)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-500 text-xs italic">
                            Convite enviado
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {invite.email}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-[8px] font-black uppercase tracking-wider">
                        {invite.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        {invite.sector}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold text-slate-400 italic">
                        -
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right rounded-r-xl">
                      {canManageMember(invite.role as UserRole, invite.sector as Sector) && (
                        <button 
                          onClick={async () => {
                            try {
                              await deleteDoc(doc(db, "officeInvites", invite.id));
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 hover:border-red-100 border border-transparent transition-all"
                        >
                          <Icons.Trash className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };
  const handleAddDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;
    try {
      let finalResponsavel = userProfile?.name || "";
      if (newDeadline.assignedTo) {
        const assignedUser = teamProfiles.find(t => t.id === newDeadline.assignedTo);
        if (assignedUser) finalResponsavel = assignedUser.name;
      }

      if (editingDeadlineId) {
        const { id, ...updateData } = newDeadline as Deadline;
        await updateDoc(doc(db, "deadlines", editingDeadlineId), {
          ...updateData,
          sector: newDeadline.sector || userProfile?.sector || Sector.GENERAL,
          responsavel: finalResponsavel,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await addDoc(collection(db, "deadlines"), {
          ...newDeadline,
          sector: newDeadline.sector || userProfile?.sector || Sector.GENERAL,
          responsavel: finalResponsavel,
          userId: user.uid,
          officeId: userProfile?.officeId || user.uid,
          userEmail: user.email,
          createdAt: new Date().toISOString(),
          status: DeadlineStatus.PENDING,
        });
      }
      setIsModalOpen(false);
      resetDeadlineForm();
    } catch (err: any) {
      handleFirestoreError(
        err,
        editingDeadlineId ? OperationType.UPDATE : OperationType.CREATE,
        "deadlines",
      );
    }
  };

  const handleAddAdminTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;
    try {
      if (editingAdminTaskId) {
        const { id, ...updateData } = newAdminTask as AdminTask;
        await updateDoc(doc(db, "adminTasks", editingAdminTaskId), {
          ...updateData,
          sector: newAdminTask.sector || userProfile?.sector || Sector.GENERAL,
          updatedAt: new Date().toISOString(),
        });
      } else {
        if (newAdminTask.isRecurring && newAdminTask.recurrenceEndDate) {
          const dates: string[] = [];
          const start = new Date(newAdminTask.date + 'T12:00:00');
          const end = new Date(newAdminTask.recurrenceEndDate + 'T12:00:00');
          
          if (start <= end) {
            let current = new Date(start);
            let count = 0;
            while (current <= end && count < 200) {
              const yr = current.getFullYear();
              const mo = String(current.getMonth() + 1).padStart(2, '0');
              const dy = String(current.getDate()).padStart(2, '0');
              dates.push(`${yr}-${mo}-${dy}`);
              
              if (newAdminTask.recurrenceType === 'DAILY') {
                current.setDate(current.getDate() + 1);
              } else if (newAdminTask.recurrenceType === 'WEEKLY') {
                current.setDate(current.getDate() + 7);
              } else if (newAdminTask.recurrenceType === 'MONTHLY') {
                current.setMonth(current.getMonth() + 1);
              } else if (newAdminTask.recurrenceType === 'ANNUALLY') {
                current.setFullYear(current.getFullYear() + 1);
              } else {
                break;
              }
              count++;
            }
          }

          if (dates.length > 0) {
            const promises = dates.map(dateStr => {
              return addDoc(collection(db, "adminTasks"), {
                ...newAdminTask,
                date: dateStr,
                sector: newAdminTask.sector || userProfile?.sector || Sector.GENERAL,
                userId: user.uid,
                officeId: userProfile?.officeId || user.uid,
                userEmail: user.email,
                createdAt: new Date().toISOString(),
                status: DeadlineStatus.PENDING,
              });
            });
            await Promise.all(promises);
          } else {
            await addDoc(collection(db, "adminTasks"), {
              ...newAdminTask,
              sector: newAdminTask.sector || userProfile?.sector || Sector.GENERAL,
              userId: user.uid,
              officeId: userProfile?.officeId || user.uid,
              userEmail: user.email,
              createdAt: new Date().toISOString(),
              status: DeadlineStatus.PENDING,
            });
          }
        } else {
          await addDoc(collection(db, "adminTasks"), {
            ...newAdminTask,
            sector: newAdminTask.sector || userProfile?.sector || Sector.GENERAL,
            userId: user.uid,
            officeId: userProfile?.officeId || user.uid,
            userEmail: user.email,
            createdAt: new Date().toISOString(),
            status: DeadlineStatus.PENDING,
          });
        }
      }
      setIsAgendaModalOpen(false);
      resetAdminTaskForm();
    } catch (err: any) {
      handleFirestoreError(
        err,
        editingAdminTaskId ? OperationType.UPDATE : OperationType.CREATE,
        "adminTasks",
      );
    }
  };

  const handleSaveRule = () => {
    const rules = [...(dynamicSettings.rules || [])];
    const ruleToSave = {
      ...newRule,
      id: newRule.id || Date.now().toString(),
    } as NotificationRule;

    if (editingRuleIndex !== null) {
      rules[editingRuleIndex] = ruleToSave;
    } else {
      rules.push(ruleToSave);
    }

    updateSettings("rules", rules);
    setIsRuleModalOpen(false);
    setNewRule({
      deadlineType: "ALL",
      priority: "MÉDIA",
      leadTimeDays: 5,
      channels: { email: true, push: false, inApp: true },
    });
    setEditingRuleIndex(null);
  };

  const handleDeleteRule = (index: number) => {
    if (confirm("Deseja realmente excluir este alerta?")) {
      const rules = dynamicSettings.rules.filter((_, i) => i !== index);
      updateSettings("rules", rules);
    }
  };

  const updateSettings = async (
    fieldOrUpdates: keyof NotificationSettings | Partial<NotificationSettings>,
    newValue?: any,
  ) => {
    if (!user || !userProfile) return;
    setIsSavingSettings(true);
    const settingsRef = doc(db, "settings", userProfile.officeId);
    try {
      const updates =
        typeof fieldOrUpdates === "string"
          ? { [fieldOrUpdates]: newValue }
          : fieldOrUpdates;
      
      await setDoc(
        settingsRef,
        { ...updates, userId: user.uid, userEmail: user.email },
        { merge: true },
      );

      // Sincronizar nome do escritório no perfil do usuário para o seletor
      if (updates.officeName && userProfile.offices) {
        const profileRef = doc(db, "userProfiles", user.uid);
        const updatedOffices = userProfile.offices.map(o => 
          o.id === userProfile.officeId ? { ...o, name: updates.officeName } : o
        );
        await updateDoc(profileRef, { offices: updatedOffices });
        setUserProfile(prev => prev ? { ...prev, offices: updatedOffices } : null);
      }
    } finally {
      setIsSavingSettings(false);
    }
  };

  const toggleStatus = async (d: Deadline) => {
    const newS =
      d.status === DeadlineStatus.COMPLETED
        ? DeadlineStatus.PENDING
        : DeadlineStatus.COMPLETED;
    await updateDoc(doc(db, "deadlines", d.id), { status: newS });
  };

  const toggleAdminTaskStatus = async (t: AdminTask) => {
    const newS =
      t.status === DeadlineStatus.COMPLETED
        ? DeadlineStatus.PENDING
        : DeadlineStatus.COMPLETED;
    try {
      await updateDoc(doc(db, "adminTasks", t.id), { status: newS });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "adminTasks");
    }
  };

  const deleteDeadline = async (id: string) => {
    try {
      await deleteDoc(doc(db, "deadlines", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "deadlines");
    }
  };

  const deleteAdminTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, "adminTasks", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "adminTasks");
    }
  };

  const handleSendToReview = (d: Deadline) => {
    if (!d.documentUrl) {
      alert("Vincule um link primeiro.");
      return;
    }
    const phone = "5584999598686";
    const message = `Solicito revisão: *${d.peca}* (Cliente: *${d.empresa}*). Link: ${d.documentUrl}`;
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank",
    );
  };

  // --- Gestão de Tempo / Time Tracking Functions ---

  const handleStartTimerForDeadline = async (deadline: Deadline, activityType: string = "Elaboração de Peça") => {
    if (!userProfile) return;

    const currentReviewState = deadline.reviewState || ReviewState.NONE;

    if (currentReviewState === ReviewState.WAITING_COORDINATOR || currentReviewState === ReviewState.REVIEWING_COORDINATOR || currentReviewState === ReviewState.VALIDATED_BY_ADMIN_WAITING_COORDINATOR) {
      if (userProfile.role !== UserRole.COORDINATOR && userProfile.role !== UserRole.ADMIN) {
        alert("Apenas coordenadores e administradores podem iniciar o cronômetro nesta etapa de revisão.");
        return;
      }
      if (currentReviewState === ReviewState.WAITING_COORDINATOR) {
         try {
           await updateDoc(doc(db, "deadlines", deadline.id), { reviewState: ReviewState.REVIEWING_COORDINATOR });
         } catch (e) {
           console.error(e);
         }
      }
    } else if (currentReviewState === ReviewState.WAITING_ADMIN || currentReviewState === ReviewState.REVIEWING_ADMIN) {
      if (userProfile.role !== UserRole.ADMIN) {
        alert("Apenas administradores podem iniciar o cronômetro nesta etapa de validação.");
        return;
      }
      if (currentReviewState === ReviewState.WAITING_ADMIN) {
         try {
           await updateDoc(doc(db, "deadlines", deadline.id), { reviewState: ReviewState.REVIEWING_ADMIN });
         } catch (e) {
           console.error(e);
         }
      }
    } else if (currentReviewState === ReviewState.COMPLETED) {
       alert("Esta tarefa já foi concluída e não pode ser cronometrada.");
       return;
    }

    // 1. Pause all other running timers
    const updatedTimers = activeTimers.map((t) => {
      if (t.isPlaying && t.lastStartedAt) {
        const secondsVal = t.elapsedSeconds + (Date.now() - t.lastStartedAt) / 1000;
        return { ...t, isPlaying: false, lastStartedAt: null, elapsedSeconds: secondsVal };
      }
      return t;
    });

    // 2. Check if a timer for this deadline already exists
    let targetReviewState = deadline.reviewState || ReviewState.NONE;
    if (targetReviewState === ReviewState.WAITING_COORDINATOR) {
      targetReviewState = ReviewState.REVIEWING_COORDINATOR;
    } else if (targetReviewState === ReviewState.WAITING_ADMIN) {
      targetReviewState = ReviewState.REVIEWING_ADMIN;
    }

    const idx = updatedTimers.findIndex((t) => t.deadlineId === deadline.id);
    if (idx >= 0) {
      // Resume it
      updatedTimers[idx].isPlaying = true;
      updatedTimers[idx].lastStartedAt = Date.now();
      updatedTimers[idx].activityType = activityType;
      updatedTimers[idx].reviewState = targetReviewState;
      updatedTimers[idx].assignedTo = deadline.assignedTo || updatedTimers[idx].assignedTo || "";
      updatedTimers[idx].userId = deadline.userId || updatedTimers[idx].userId || "";
    } else {
      // Add a clean new timer
      updatedTimers.push({
        deadlineId: deadline.id,
        peca: deadline.peca || "Atividade de Prazo",
        empresa: deadline.empresa || "Cliente S/A",
        elapsedSeconds: 0,
        lastStartedAt: Date.now(),
        isPlaying: true,
        activityType,
        reviewState: targetReviewState,
        assignedTo: deadline.assignedTo || "",
        userId: deadline.userId || "",
      });
    }

    setActiveTimers(updatedTimers);
  };

  const handlePauseTimer = (deadlineId: string) => {
    const updatedTimers = activeTimers.map((t) => {
      if (t.deadlineId === deadlineId && t.isPlaying && t.lastStartedAt) {
        const added = (Date.now() - t.lastStartedAt) / 1000;
        return {
          ...t,
          isPlaying: false,
          lastStartedAt: null,
          elapsedSeconds: t.elapsedSeconds + added,
        };
      }
      return t;
    });
    setActiveTimers(updatedTimers);
  };

  const handleStopTimer = (deadlineId: string) => {
    const timer = activeTimers.find((t) => t.deadlineId === deadlineId);
    if (!timer) return;

    // Calculate final actual seconds
    let finalSeconds = timer.elapsedSeconds;
    if (timer.isPlaying && timer.lastStartedAt) {
      finalSeconds += (Date.now() - timer.lastStartedAt) / 1000;
    }

    // Pause it in state first
    handlePauseTimer(deadlineId);

    // Set structure for confirm/stop modal
    setTimerToStop(timer);
    setStopTimerError("");
    
    // Auto populate submission/stop forms
    const defaultStatus = TimeLogStatus.APPROVED;

    setStopTimerForm({
      description: "",
      durationSeconds: Math.round(finalSeconds),
      status: defaultStatus,
      activityType: timer.activityType || "Elaboração de Peça",
      manualProcessTitle: timer.empresa,
      manualPiece: timer.peca,
    });

    setIsStopTimerModalOpen(true);
  };

  const handleDirectReviewAction = async (deadline: Deadline, reviewAction: 'RETURN' | 'COMPLETE' | 'FORWARD') => {
    if (!userProfile) return;

    let observation = detailsReviewObservation.trim() || (reviewAction === 'RETURN' ? "Devolvido" : "Ação de revisão direta");
    if (reviewAction === 'RETURN') {
       if (!detailsReviewObservation.trim()) {
          setDetailsReviewError("A devolução exige o preenchimento de uma justificativa no campo de observações.");
          alert("A devolução exige o preenchimento de uma justificativa no campo de observações.");
          return;
       }
       observation = detailsReviewObservation.trim();
    }

    try {
        let newState: ReviewState | undefined;
        let actionLabel: ReviewLogEntry['action'] = 'TIMER_SESSION';
        
        // Reviewer actions
        if (userProfile.role === UserRole.COORDINATOR) {
            if (reviewAction === 'RETURN') {
                newState = ReviewState.RETURNED_TO_LAWYER;
                actionLabel = 'RETURNED';
            } else if (reviewAction === 'COMPLETE') {
                newState = ReviewState.COMPLETED;
                actionLabel = 'COMPLETED';
            } else if (reviewAction === 'FORWARD') {
                newState = ReviewState.WAITING_ADMIN;
                actionLabel = 'SENT_TO_ADMIN';
            }
        }
        else if (userProfile.role === UserRole.ADMIN) {
            if (reviewAction === 'RETURN') {
                newState = ReviewState.RETURNED_TO_LAWYER;
                actionLabel = 'RETURNED';
            } else if (reviewAction === 'COMPLETE') {
                const responsibleUserId = deadline.assignedTo || deadline.userId || userProfile.id;
                const responsibleProfile = teamProfiles.find(t => t.id === responsibleUserId) || userProfile;
                
                if (responsibleProfile.role === UserRole.ADMIN) {
                    newState = ReviewState.COMPLETED;
                    actionLabel = 'COMPLETED';
                } else {
                    newState = ReviewState.VALIDATED_BY_ADMIN_WAITING_COORDINATOR;
                    actionLabel = 'ADMIN_APPROVED';
                }
            }
        }

        if (newState) {
            const newLogEntry: ReviewLogEntry = {
                id: Date.now().toString(),
                userId: userProfile.id,
                userName: userProfile.name,
                userRole: userProfile.role,
                action: actionLabel,
                fromState: deadline.reviewState || ReviewState.NONE,
                toState: newState,
                observation: observation,
                timestamp: new Date().toISOString(),
                durationSeconds: 0,
            };

            const updatedLogs = [...(deadline.reviewLogs || []), newLogEntry];

            await updateDoc(doc(db, "deadlines", deadline.id), {
                reviewState: newState,
                reviewLogs: updatedLogs,
                ...(newState === ReviewState.COMPLETED ? { status: DeadlineStatus.COMPLETED } : {})
            });
            
            setIsDetailsModalOpen(false);
            setSelectedAppointment(null);
        }
    } catch (e) {
        console.error(e);
        alert("Ocorreu um erro ao processar a ação.");
    }
  };

  const handleSaveTimeLog = async (reviewAction?: 'SUBMIT' | 'RETURN' | 'COMPLETE' | 'FORWARD') => {
    if (!userProfile) return;

    const isManual = !timerToStop || timerToStop.deadlineId.startsWith("general");
    const processTitle = isManual ? stopTimerForm.manualProcessTitle : timerToStop.empresa;
    const peca = isManual ? stopTimerForm.manualPiece : timerToStop.peca;

    if (!processTitle || !peca) {
      alert("Por favor, preencha o processo/cliente e descrição do trabalho.");
      return;
    }
    
    if (reviewAction === 'RETURN' && !stopTimerForm.description.trim()) {
      setStopTimerError("A devolução exige o preenchimento de uma justificativa no campo de observações.");
      alert("A devolução exige o preenchimento de uma justificativa no campo de observações.");
      return;
    }

    try {
      const payload: Partial<TimeLog> = {
        userId: userProfile.id,
        userName: userProfile.name,
        deadlineId: isManual ? "" : timerToStop.deadlineId,
        processTitle,
        peca,
        activityType: stopTimerForm.activityType,
        description: stopTimerForm.description,
        durationSeconds: Number(stopTimerForm.durationSeconds),
        status: stopTimerForm.status,
        createdAt: new Date().toISOString(),
        date: formatDateToISO(new Date()),
        officeId: userProfile.officeId,
      };

      if (stopTimerForm.status === TimeLogStatus.APPROVED) {
        payload.approvedBy = userProfile.id;
        payload.approvedByName = userProfile.name;
        payload.approvedAt = new Date().toISOString();
      }

      const logDocRef = await addDoc(collection(db, "timeLogs"), payload);

      if (!isManual && timerToStop) {
         let newState: ReviewState | undefined;
         let actionLabel: ReviewLogEntry['action'] = 'TIMER_SESSION';
         
         let deadline = deadlines.find(d => d.id === timerToStop!.deadlineId);
         if (!deadline && timerToStop?.deadlineId) {
            try {
               const docSnap = await getDoc(doc(db, "deadlines", timerToStop.deadlineId));
               if (docSnap && docSnap.exists()) {
                  deadline = { id: docSnap.id, ...docSnap.data() } as Deadline;
               }
            } catch (e) {
               console.error("Erro ao buscar prazo de backup:", e);
            }
         }
         
         if (deadline && reviewAction) {
            const isExecutor = deadline.reviewState === undefined || deadline.reviewState === ReviewState.NONE || deadline.reviewState === ReviewState.RETURNED_TO_LAWYER;

            const responsibleUserId = deadline.assignedTo || deadline.userId || userProfile.id;
            const responsibleProfile = teamProfiles.find(t => t.id === responsibleUserId) || userProfile;

            if (isExecutor && reviewAction === 'SUBMIT') {
               if (responsibleProfile.role === UserRole.LAWYER) {
                  newState = ReviewState.WAITING_COORDINATOR;
                  actionLabel = 'SUBMITTED_FOR_REVIEW';
               } else if (responsibleProfile.role === UserRole.COORDINATOR) {
                  newState = ReviewState.WAITING_ADMIN;
                  actionLabel = 'SUBMITTED_FOR_REVIEW';
               } else if (responsibleProfile.role === UserRole.ADMIN) {
                  newState = ReviewState.COMPLETED;
                  actionLabel = 'COMPLETED';
               }
            } else {
               // Reviewer actions
               if (userProfile.role === UserRole.COORDINATOR) {
                  if (reviewAction === 'RETURN') {
                     newState = ReviewState.RETURNED_TO_LAWYER;
                     actionLabel = 'RETURNED';
                  } else if (reviewAction === 'COMPLETE') {
                     newState = ReviewState.COMPLETED;
                     actionLabel = 'COMPLETED';
                  } else if (reviewAction === 'FORWARD') {
                     newState = ReviewState.WAITING_ADMIN;
                     actionLabel = 'SENT_TO_ADMIN';
                  }
               }
               else if (userProfile.role === UserRole.ADMIN) {
                  if (reviewAction === 'RETURN') {
                     newState = ReviewState.RETURNED_TO_LAWYER;
                     actionLabel = 'RETURNED';
                  } else if (reviewAction === 'COMPLETE') {
                     if (responsibleProfile.role === UserRole.ADMIN) {
                        newState = ReviewState.COMPLETED;
                        actionLabel = 'COMPLETED';
                     } else {
                        newState = ReviewState.VALIDATED_BY_ADMIN_WAITING_COORDINATOR;
                        actionLabel = 'ADMIN_APPROVED';
                     }
                  }
               }
            }

            if (newState) {
               const newLogEntry: ReviewLogEntry = {
                  id: Date.now().toString(),
                  userId: userProfile.id,
                  userName: userProfile.name,
                  userRole: userProfile.role,
                  action: actionLabel,
                  fromState: deadline.reviewState || ReviewState.NONE,
                  toState: newState,
                  observation: stopTimerForm.description,
                  timestamp: new Date().toISOString(),
                  durationSeconds: Number(stopTimerForm.durationSeconds),
               };

               const updatedLogs = [...(deadline.reviewLogs || []), newLogEntry];

               await updateDoc(doc(db, "deadlines", deadline.id), {
                  reviewState: newState,
                  reviewLogs: updatedLogs,
                  ...(newState === ReviewState.COMPLETED ? { status: DeadlineStatus.COMPLETED } : {})
               });
            }
         }
      }

      // Clean up timer if it belonged to active timers list
      if (timerToStop) {
        setActiveTimers((curr) => curr.filter((t) => t.deadlineId !== timerToStop.deadlineId));
      }

      setIsStopTimerModalOpen(false);
      setIsDetailsModalOpen(false);
      setTimerToStop(null);
    } catch (err) {
      console.error("Error creating time log:", err);
      handleFirestoreError(err, OperationType.WRITE, "timeLogs");
    }
  };

  const handleSaveRetroactiveTimeLog = async () => {
    if (!userProfile) return;
    const { processTitle, peca, activityType, durationMinutes, date, description } = retroactiveLogForm;

    if (!processTitle || !peca || !durationMinutes) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    const durationSeconds = Number(durationMinutes) * 60;
    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      alert("A duração em minutos deve ser um número válido.");
      return;
    }

    try {
      const defaultStatus = TimeLogStatus.APPROVED;

      const payload: Partial<TimeLog> = {
        userId: userProfile.id,
        userName: userProfile.name,
        processTitle,
        peca,
        activityType,
        description,
        durationSeconds,
        status: defaultStatus,
        createdAt: new Date().toISOString(),
        date,
        officeId: userProfile.officeId,
      };

      if (defaultStatus === TimeLogStatus.APPROVED) {
        payload.approvedBy = userProfile.id;
        payload.approvedByName = userProfile.name;
        payload.approvedAt = new Date().toISOString();
      }

      await addDoc(collection(db, "timeLogs"), payload);
      setIsRetroactiveLogModalOpen(false);
      // Reset form
      setRetroactiveLogForm({
        processTitle: "",
        peca: "",
        activityType: "Elaboração de Peça",
        durationMinutes: "",
        date: formatDateToISO(new Date()),
        description: "",
        status: TimeLogStatus.APPROVED,
      });
    } catch (err) {
      console.error("Error saving retroactive log:", err);
      handleFirestoreError(err, OperationType.WRITE, "timeLogs");
    }
  };

  const handleStartManualTimer = () => {
    const { processTitle, peca, activityType } = manualTimerForm;
    if (!processTitle || !peca) {
      alert("Preencha o processo/cliente e o nome da atividade.");
      return;
    }

    // 1. Pause other timers
    const updated = activeTimers.map((t) => {
      if (t.isPlaying && t.lastStartedAt) {
        const added = (Date.now() - t.lastStartedAt) / 1000;
        return { ...t, isPlaying: false, lastStartedAt: null, elapsedSeconds: t.elapsedSeconds + added };
      }
      return t;
    });

    // 2. Add manual timer
    updated.push({
      deadlineId: "general_" + Date.now(), // arbitrary key
      peca,
      empresa: processTitle,
      elapsedSeconds: 0,
      lastStartedAt: Date.now(),
      isPlaying: true,
      activityType,
    });

    setActiveTimers(updated);
    setIsManualTimerModalOpen(false);
    setManualTimerForm({
      processTitle: "",
      peca: "",
      activityType: "Elaboração de Peça",
    });
  };

  const handleApproveTimeLog = async (logId: string) => {
    if (!userProfile) return;
    try {
      await updateDoc(doc(db, "timeLogs", logId), {
        status: TimeLogStatus.APPROVED,
        approvedBy: userProfile.id,
        approvedByName: userProfile.name,
        approvedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Error approving log:", err);
      handleFirestoreError(err, OperationType.UPDATE, "timeLogs");
    }
  };

  const handleRejectTimeLog = async (logId: string, reason: string) => {
    if (!reason.trim()) {
      alert("Forneça uma justificativa para devolução.");
      return;
    }
    try {
      await updateDoc(doc(db, "timeLogs", logId), {
        status: TimeLogStatus.REJECTED,
        rejectionReason: reason,
      });
    } catch (err) {
      console.error("Error rejecting log:", err);
      handleFirestoreError(err, OperationType.UPDATE, "timeLogs");
    }
  };

  const handleEditTimeLogDuration = async (logId: string, newMinutes: number) => {
    if (isNaN(newMinutes) || newMinutes <= 0) {
      alert("Duração inválida.");
      return;
    }
    try {
      await updateDoc(doc(db, "timeLogs", logId), {
        durationSeconds: newMinutes * 60,
      });
    } catch (err) {
      console.error("Error editing log duration:", err);
      handleFirestoreError(err, OperationType.UPDATE, "timeLogs");
    }
  };

  const handleDeleteTimeLog = async (logId: string) => {
    try {
      await deleteDoc(doc(db, "timeLogs", logId));
    } catch (err) {
      console.error("Error deleting log:", err);
      handleFirestoreError(err, OperationType.DELETE, "timeLogs");
    }
  };

  // Lógica Avançada de Consulta CNPJ
  const handleFetchCNPJ = async () => {
    const rawCnpj = (clientForm.document || "").replace(/\D/g, "");
    if (rawCnpj.length !== 14) {
      alert("CNPJ deve conter 14 dígitos.");
      return;
    }

    setIsFetchingCNPJ(true);
    try {
      const response = await fetch(
        `https://brasilapi.com.br/api/cnpj/v1/${rawCnpj}`,
      );
      if (!response.ok) throw new Error("CNPJ não encontrado ou erro na API.");
      const data = (await response.json()) as any;

      const addr = `${data.logradouro}, ${data.numero}${data.complemento ? " - " + data.complemento : ""}, ${data.bairro}, ${data.municipio}/${data.uf}`;

      // Identifica Sócio-Administrador
      const admin = data.qsa?.find((s: any) =>
        s.qualificacao_socio.toLowerCase().includes("administrador"),
      );

      setClientForm((prev) => ({
        ...prev,
        name: data.razao_social,
        tradeName: data.nome_fantasia || "",
        address: addr,
        adminName: admin?.nome_socio || "",
        email: data.email || "",
        phone: data.ddd_telefone_1
          ? `(${data.ddd_telefone_1.slice(0, 2)}) ${data.ddd_telefone_1.slice(2)}`
          : data.email
            ? ""
            : "", // Tenta formatar se houver
      }));
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsFetchingCNPJ(false);
    }
  };

  const handleFetchDatajud = async () => {
    const cnj = newProcess.number.toUpperCase().trim();
    if (!cnj) {
      alert("Por favor, preencha o número do processo primeiro.");
      return;
    }

    setIsFetchingDatajud(true);
    try {
      const res = await fetch("/api/datajud/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnj })
      });
      if (!res.ok) {
        throw new Error("Erro ao consultar a API do Datajud.");
      }
      const data = await res.json();
      const hit = data.hits?.hits?.[0]?._source;
      if (!hit) {
        throw new Error("Processo não encontrado nos registros do tribunal.");
      }
      const classe = hit.classe?.nome || "Classe não informada";
      setNewProcess((p) => ({
        ...p,
        title: classe.toUpperCase(),
      }));
      alert(`Processo encontrado no Datajud!\nClasse: ${classe.toUpperCase()}`);
    } catch (err: any) {
      alert(err.message || "Não foi possível resgatar as informações do Datajud. Você pode digitar o título manualmente.");
    } finally {
      setIsFetchingDatajud(false);
    }
  };

  const handleEditClient = (c: Client) => {
    setEditingClientId(c.id);
    setClientType(c.type);
    setClientForm({ ...c, email: c.email || "", phone: c.phone || "" });
    // Tenta inferir a preferência se for PJ e já tiver displayName
    if (c.type === "PJ" && c.displayName === c.name) {
      setPreferredNameSource("RAZAO");
    } else {
      setPreferredNameSource("FANTASIA");
    }
    setIsClientModalOpen(true);
  };

  const handleSaveClient = async () => {
    if (!clientForm.name?.trim() || !user) {
      alert("Preencha o nome do cliente.");
      return;
    }

    const clientName = clientForm.name.toUpperCase();
    const tradeName = (
      clientType === "PJ" ? clientForm.tradeName || "" : ""
    ).toUpperCase();

    // Nome para Exibição baseado na preferência
    let preferredName;
    if (clientType === "PJ") {
      preferredName = (
        preferredNameSource === "FANTASIA"
          ? tradeName || clientName
          : clientName
      ).toUpperCase();
    } else {
      preferredName = clientName;
    }

    const isLegacy = editingClientId?.startsWith("legacy-");

    // Validação: Impedir duplicidade entre cadastros RICOS apenas
    const alreadyRegistered = clients.some(
      (c) =>
        c.id !== (isLegacy ? null : editingClientId) &&
        (c.name.toUpperCase() === clientName ||
          (c.tradeName && c.tradeName.toUpperCase() === tradeName)),
    );

    if (alreadyRegistered) {
      alert("Este cliente já possui um cadastro completo.");
      return;
    }

    const finalClientId =
      isLegacy || !editingClientId
        ? Math.random().toString(36).substr(2, 9)
        : editingClientId!;
    const existingClient = clients.find((c) => c.id === finalClientId);

    const clientData: any = {
      type: clientType,
      name: clientName,
      displayName: preferredName,
      document: clientForm.document || "",
      driveUrl: clientForm.driveUrl || "",
      tradeName: tradeName,
      address: clientType === "PJ" ? clientForm.address || "" : "",
      adminName: clientType === "PJ" ? clientForm.adminName || "" : "",
      email: clientForm.email || "",
      phone: clientForm.phone || "",
      processes: existingClient?.processes || [],
      sector: clientForm.sector || userProfile?.sector || Sector.GENERAL,
      userId: user.uid,
      officeId: userProfile?.officeId || user.uid,
      userEmail: user.email,
      createdAt: existingClient?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      // Salva na coleção dedicada
      await setDoc(doc(db, "clients", finalClientId), clientData);

      // Atualiza a lista simples nas configurações para o seletor de prazos
      let updatedEmpresas = [...dynamicSettings.empresas];
      if (editingClientId && isLegacy) {
        const legacyName = editingClientId.replace("legacy-", "").toUpperCase();
        const empIdx = updatedEmpresas.findIndex(
          (e) => e.toUpperCase() === legacyName,
        );
        if (empIdx > -1) updatedEmpresas[empIdx] = preferredName;
        else if (!updatedEmpresas.includes(preferredName))
          updatedEmpresas.push(preferredName);
      } else {
        const oldName = existingClient?.displayName?.toUpperCase();
        if (oldName) {
          const empIdx = updatedEmpresas.findIndex(
            (e) => e.toUpperCase() === oldName,
          );
          if (empIdx > -1) {
            updatedEmpresas[empIdx] = preferredName;
          } else if (!updatedEmpresas.includes(preferredName)) {
            updatedEmpresas.push(preferredName);
          }
        } else if (!updatedEmpresas.includes(preferredName)) {
          updatedEmpresas.push(preferredName);
        }
      }

      await updateSettings({ empresas: updatedEmpresas });

      setIsClientModalOpen(false);
      setEditingClientId(null);
      setClientForm({
        name: "",
        document: "",
        driveUrl: "",
        tradeName: "",
        address: "",
        adminName: "",
        email: "",
        phone: "",
      });
    } catch (err: any) {
      handleFirestoreError(
        err,
        editingClientId ? OperationType.UPDATE : OperationType.CREATE,
        "clients",
      );
    }
  };

  const handleDeleteClient = async (client: Client) => {
    if (
      !confirm(
        `Excluir cadastro de ${client.displayName}? (Isso não apagará os prazos vinculados)`,
      )
    )
      return;

    try {
      await deleteDoc(doc(db, "clients", client.id));

      // Remove da lista simples também if for desejado
      const preferredName = client.displayName.toUpperCase();
      const updatedEmpresas = dynamicSettings.empresas.filter(
        (e) => e.toUpperCase() !== preferredName,
      );
      await updateSettings({ empresas: updatedEmpresas });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, "clients");
    }
  };

  const handleSaveFinanceTransaction = async (
    transactionData: Omit<FinanceTransaction, "id" | "createdAt" | "userId" | "officeId">,
    id: string | null
  ) => {
    if (!user || !userProfile || userProfile.role !== UserRole.ADMIN) {
      alert("Acesso restrito para administradores.");
      return;
    }

    try {
      const selectedClient = clients.find(c => c.id === transactionData.clientId);
      const dataToSave = {
        ...transactionData,
        clientName: selectedClient ? selectedClient.displayName || selectedClient.name : null,
        userId: user.uid,
        officeId: userProfile.officeId,
        createdAt: new Date().toISOString()
      };

      if (id) {
        // Edit existing
        const transactionRef = doc(db, "financeTransactions", id);
        await updateDoc(transactionRef, dataToSave);
      } else {
        // Add new
        await addDoc(collection(db, "financeTransactions"), dataToSave);
      }
    } catch (err) {
      console.error("Erro ao salvar transação financeira:", err);
      handleFirestoreError(err, id ? OperationType.UPDATE : OperationType.CREATE, "financeTransactions");
    }
  };

  const handleDeleteFinanceTransaction = async (id: string) => {
    if (!userProfile || userProfile.role !== UserRole.ADMIN) {
      alert("Acesso restrito para administradores.");
      return;
    }

    if (!confirm("Tem certeza que deseja excluir este lançamento financeiro permanentemente?")) {
      return;
    }

    try {
      const transactionRef = doc(db, "financeTransactions", id);
      await deleteDoc(transactionRef);
    } catch (err) {
      console.error("Erro ao excluir transação financeira:", err);
      handleFirestoreError(err, OperationType.DELETE, "financeTransactions");
    }
  };

  const handleSaveRecurringExpense = async (
    data: Omit<RecurringExpense, "id" | "createdAt" | "userId" | "officeId">,
    id: string | null
  ) => {
    if (!user || !userProfile || userProfile.role !== UserRole.ADMIN) {
      alert("Acesso restrito para administradores.");
      return;
    }
    try {
      const dataToSave = {
        ...data,
        userId: user.uid,
        officeId: userProfile.officeId,
        createdAt: new Date().toISOString()
      };
      if (id) {
        await updateDoc(doc(db, "recurringExpenses", id), dataToSave);
      } else {
        await addDoc(collection(db, "recurringExpenses"), dataToSave);
      }
    } catch (err: any) {
      console.error("Erro ao salvar despesa recorrente:", err);
      handleFirestoreError(err, id ? OperationType.UPDATE : OperationType.CREATE, "recurringExpenses");
    }
  };

  const handleDeleteRecurringExpense = async (id: string) => {
    if (!userProfile || userProfile.role !== UserRole.ADMIN) {
      alert("Acesso restrito para administradores.");
      return;
    }
    if (!confirm("Tem certeza que deseja desativar/excluir este agendamento recorrente?")) {
      return;
    }
    try {
      await deleteDoc(doc(db, "recurringExpenses", id));
    } catch (err: any) {
      console.error("Erro ao excluir despesa recorrente:", err);
      handleFirestoreError(err, OperationType.DELETE, "recurringExpenses");
    }
  };

  // --- Gestão de Processos e Notas ---
  const handleOpenClientDetails = (client: Client) => {
    setSelectedClientForDetails(client);
    setIsClientDetailsModalOpen(true);
  };

  const handleOpenProcesses = (client: Client) => {
    setActiveClientForProcesses(client);
    setIsProcessModalOpen(true);
    setActiveProcessForNotes(null);
  };

  const handleAddProcess = async () => {
    if (!activeClientForProcesses || !newProcess.number.trim()) return;

    const cnj = newProcess.number.toUpperCase().trim();
    const title = newProcess.title.trim().toUpperCase() || "Classe não informada";
    setIsSyncing(true);

    try {
      // 1. Tenta consultar a API Datajud para obter dados completos do processo
      let partyNames: string[] = [];
      let classe = title;
      let movements: any[] = [];
      let status = "Ativo";
      let court = "Tribunais";
      let grau = "";

      try {
        const res = await fetch("/api/datajud/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cnj })
        });
        if (res.ok) {
          const data = await res.json();
          const hit = data.hits?.hits?.[0]?._source;
          if (hit) {
            partyNames = (getParties ? getParties(hit) : []).filter(name => 
              name !== (hit.classe?.nome || "").toUpperCase() && 
              !(hit.assuntos || []).some((a: any) => (a.nome || "").toUpperCase() === name)
            );
            classe = hit.classe?.nome || title;
            status = hit.situacaoProcesso || "Ativo";
            court = hit.tribunal || "Tribunal";
            grau = hit.grau || "";
            movements = (hit.movimentos || hit.movimentacao || [])
              .map((m: any) => ({
                 dataHora: m.dataHora || new Date().toISOString(),
                 descricao: m.movimentoNacional?.nome || 
                           m.movimentoNacional?.descricao || 
                           m.movimentoLocal?.nome || 
                           m.movimentoLocal?.descricao || 
                           m.descricao || 
                           m.nome || 
                           m.texto || 
                           m.tipo || 
                           "Sem descrição",
                 complementos: (m.complementos || m.complemento || [])?.map((c: any) => c.nome ? `${c.nome}: ${c.valor}` : (c.descricao ? `${c.descricao}: ${c.valor}` : c.valor)).filter(Boolean) || []
              }))
              .sort((a: any, b: any) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());
          }
        }
      } catch (searchErr) {
        console.warn("Datajud search failed, falls back to manual registry:", searchErr);
      }

      // 2. Cria o novo documento em monitoredProcesses vinculado a este cliente
      const newProc: any = {
        cnj: cnj,
        parties: partyNames.slice(0, 5),
        classe: classe,
        clientName: activeClientForProcesses.displayName || activeClientForProcesses.name,
        clientId: activeClientForProcesses.id,
        lastUpdate: new Date().toISOString(),
        movements: movements,
        status: status,
        court: court,
        grau: grau,
        officeId: userProfile?.officeId || "",
        sector: activeClientForProcesses.sector || userProfile?.sector || Sector.GENERAL,
        userId: userProfile?.id || "",
        createdAt: new Date().toISOString(),
        notes: []
      };

      // Limpar campos undefined
      Object.keys(newProc).forEach(k => { if(newProc[k] === undefined) delete newProc[k]; });

      await addDoc(collection(db, "monitoredProcesses"), newProc);
      setNewProcess({ number: "", title: "" });
      alert("Processo cadastrado e vinculado para monitoramento com sucesso!");
    } catch (err: any) {
      console.error(err);
      alert("Erro ao adicionar processo: " + (err.message || ""));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteProcess = async (procId: string) => {
    if (!activeClientForProcesses) return;
    if (!window.confirm("Deseja realmente remover este processo e todas as suas notas definitivamente?")) return;
    try {
      await deleteDoc(doc(db, "monitoredProcesses", procId));
      if (activeProcessForNotes === procId) setActiveProcessForNotes(null);
      alert("Processo excluído com sucesso!");
    } catch (err: any) {
      console.error("[handleDeleteProcess] Error removing doc:", err);
      alert("Erro ao remover processo: " + (err.message || "Erro desconhecido"));
    }
  };

  const handleAddNote = async (procId: string) => {
    if (!newNoteText.trim()) return;

    const note: ProcessNote = {
      id: Math.random().toString(36).substr(2, 9),
      text: newNoteText,
      createdAt: new Date().toISOString(),
    };

    const targetProc = monitoredProcesses.find(p => p.id === procId);
    if (!targetProc) return;

    const updatedNotes = [note, ...(targetProc.notes || [])];

    try {
      await updateDoc(doc(db, "monitoredProcesses", procId), {
        notes: updatedNotes,
      });
      setNewNoteText("");
    } catch (err: any) {
      alert("Erro ao adicionar nota.");
    }
  };

  const handleDeleteNote = async (procId: string, noteId: string) => {
    if (!confirm("Remover esta anotação?")) return;

    const targetProc = monitoredProcesses.find(p => p.id === procId);
    if (!targetProc) return;

    const updatedNotes = (targetProc.notes || []).filter(n => n.id !== noteId);

    try {
      await updateDoc(doc(db, "monitoredProcesses", procId), {
        notes: updatedNotes,
      });
    } catch (err: any) {
      alert("Erro ao remover nota.");
    }
  };

  const filteredDeadlines = useMemo(() => {
    return deadlines.filter((d) => {
      // Filtro de visibilidade por cargo para Coordenadores (movido do servidor para suportar dados legados)
      if (userProfile?.role === UserRole.COORDINATOR && userProfile.sector !== Sector.GENERAL) {
        const matchesSector = !d.sector || d.sector === userProfile.sector || d.sector === Sector.GENERAL;
        if (!matchesSector) return false;
      }

      const matchEmpresa =
        !reportFilters.empresa || d.empresa === reportFilters.empresa;
      const matchResponsavel =
        !reportFilters.responsavel ||
        d.responsavel === reportFilters.responsavel;
      const matchInicio =
        !reportFilters.dataInicio || d.data >= reportFilters.dataInicio;
      const matchFim =
        !reportFilters.dataFim || d.data <= reportFilters.dataFim;
      return matchEmpresa && matchResponsavel && matchInicio && matchFim;
    });
  }, [deadlines, reportFilters, userProfile]);

  const activeClientProcesses = useMemo(() => {
    if (!activeClientForProcesses) return [];
    return monitoredProcesses.filter((proc) => proc.clientId === activeClientForProcesses.id);
  }, [monitoredProcesses, activeClientForProcesses]);

  const selectedClientProcesses = useMemo(() => {
    if (!selectedClientForDetails) return [];
    return monitoredProcesses.filter((proc) => proc.clientId === selectedClientForDetails.id);
  }, [monitoredProcesses, selectedClientForDetails]);

  const chartData = useMemo(() => {
    const completed = filteredDeadlines.filter(
      (d) => d.status === DeadlineStatus.COMPLETED,
    ).length;
    const pending = filteredDeadlines.filter(
      (d) => d.status === DeadlineStatus.PENDING,
    ).length;
    return [
      { name: "Concluídos", value: completed, color: "#10b981" },
      { name: "Pendentes", value: pending, color: "#3b82f6" },
    ];
  }, [filteredDeadlines]);

  const stats = useMemo(
    () => ({
      atrasados: filteredDeadlines.filter(
        (d) => d.status === DeadlineStatus.PENDING && getDaysDiff(d.data) < 0,
      ).length,
      fatais: filteredDeadlines.filter(
        (d) => d.status === DeadlineStatus.PENDING && getDaysDiff(d.data) === 0,
      ).length,
      amanha: filteredDeadlines.filter(
        (d) => d.status === DeadlineStatus.PENDING && getDaysDiff(d.data) === 1,
      ).length,
      prox5dias: filteredDeadlines.filter(
        (d) =>
          d.status === DeadlineStatus.PENDING &&
          getDaysDiff(d.data) > 1 &&
          getDaysDiff(d.data) <= 5,
      ).length,
    }),
    [filteredDeadlines],
  );

  // LISTA UNIFICADA PARA O SELETOR DE CLIENTES (Preferência Nome Fantasia + Deduplicação)
  const unifiedEmpresasOptions = useMemo(() => {
    const namesSet = new Set<string>();
    const richFromColl = clients || [];
    const richFromLeg = dynamicSettings.clients || [];

    const allRich = [...richFromColl];
    const collIds = new Set(richFromColl.map((c) => c.id));
    richFromLeg.forEach((lc) => {
      if (!collIds.has(lc.id)) allRich.push(lc);
    });

    const knownReasonSocials = new Set(
      allRich.map((c) => c.name.toUpperCase()),
    );
    const knownDisplayNames = new Set(
      allRich.map((c) => c.displayName.toUpperCase()),
    );

    allRich.forEach((c) => {
      namesSet.add(c.displayName.toUpperCase());
    });

    dynamicSettings.empresas.forEach((e) => {
      const upperE = e.toUpperCase();
      // Se o nome legado já é a razão social ou o display name de alguém, ignora
      if (!knownReasonSocials.has(upperE) && !knownDisplayNames.has(upperE)) {
        namesSet.add(upperE);
      }
    });

    return Array.from(namesSet).sort((a: string, b: string) =>
      a.localeCompare(b),
    );
  }, [dynamicSettings.empresas, clients, dynamicSettings.clients]);

  // UNIFICAÇÃO DA LISTA DE CLIENTES PARA A ABA DE CONSULTA
  const filteredClientsList = useMemo(() => {
    if (!user) return [];
    const fromColl = clients || [];
    const fromLeg = dynamicSettings.clients || [];

    // Combina fontes com prioridade para a coleção
    const richClients = [...fromColl];
    const collIds = new Set(fromColl.map((c) => c.id));
    fromLeg.forEach((lc) => {
      if (!collIds.has(lc.id)) richClients.push(lc);
    });

    const existingNames = new Set(richClients.map((c) => c.name.toUpperCase()));
    const existingTrades = new Set(
      richClients.map((c) => (c.tradeName || "").toUpperCase()).filter(Boolean),
    );
    const existingDisplays = new Set(
      richClients.map((c) => c.displayName.toUpperCase()),
    );

    dynamicSettings.empresas.forEach((empName) => {
      const upperName = empName.toUpperCase();
      if (
        !existingNames.has(upperName) &&
        !existingTrades.has(upperName) &&
        !existingDisplays.has(upperName)
      ) {
        richClients.push({
          id: `legacy-${upperName}`,
          type: "PJ",
          name: upperName,
          displayName: upperName,
          document: "N/D",
          driveUrl: "",
          officeId: userProfile?.officeId || user!.uid,
          createdAt: new Date().toISOString(),
        });
      }
    });

    const list = richClients.sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );

    if (!clientSearch) return list;
    const s = clientSearch.toLowerCase();
    return list.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(s) ||
        (c.displayName || "").toLowerCase().includes(s) ||
        (c.tradeName || "").toLowerCase().includes(s) ||
        (c.document || "").toLowerCase().includes(s),
    );
  }, [
    clients,
    dynamicSettings.empresas,
    dynamicSettings.clients,
    clientSearch,
    user,
    userProfile,
  ]);

  const pendingDeadlines = useMemo(
    () =>
      filteredDeadlines
        .filter((d) => d.status === DeadlineStatus.PENDING)
        .sort((a, b) => {
          const dateCompare = a.data.localeCompare(b.data);
          if (dateCompare !== 0) return dateCompare;
          return (a.hora || "00:00").localeCompare(b.hora || "00:00");
        }),
    [filteredDeadlines],
  );
  const completedDeadlines = useMemo(
    () =>
      filteredDeadlines
        .filter((d) => d.status === DeadlineStatus.COMPLETED)
        .sort((a, b) => b.data.localeCompare(a.data)),
    [filteredDeadlines],
  );

  const uniqResponsaveis = useMemo(() => {
    const list = filteredDeadlines.map((d) => d.responsavel).filter(Boolean);
    return ["Todos", ...Array.from(new Set(list))];
  }, [filteredDeadlines]);

  const uniqEmpresas = useMemo(() => {
    const list = filteredDeadlines.map((d) => d.empresa).filter(Boolean);
    return ["Todas", ...Array.from(new Set(list))];
  }, [filteredDeadlines]);

  const filteredPendingDeadlines = useMemo(() => {
    return pendingDeadlines.filter((d) => {
      const matchSearch =
        !deadlinesSearch ||
        d.peca.toLowerCase().includes(deadlinesSearch.toLowerCase()) ||
        (d.assunto && d.assunto.toLowerCase().includes(deadlinesSearch.toLowerCase())) ||
        d.responsavel.toLowerCase().includes(deadlinesSearch.toLowerCase()) ||
        d.empresa.toLowerCase().includes(deadlinesSearch.toLowerCase());
      const matchResp =
        deadlinesResponsavelFilter === "Todos" || d.responsavel === deadlinesResponsavelFilter;
      const matchEmp =
        deadlinesEmpresaFilter === "Todas" || d.empresa === deadlinesEmpresaFilter;
      return matchSearch && matchResp && matchEmp;
    });
  }, [pendingDeadlines, deadlinesSearch, deadlinesResponsavelFilter, deadlinesEmpresaFilter]);

  const filteredCompletedDeadlines = useMemo(() => {
    return completedDeadlines.filter((d) => {
      const matchSearch =
        !deadlinesSearch ||
        d.peca.toLowerCase().includes(deadlinesSearch.toLowerCase()) ||
        (d.assunto && d.assunto.toLowerCase().includes(deadlinesSearch.toLowerCase())) ||
        d.responsavel.toLowerCase().includes(deadlinesSearch.toLowerCase()) ||
        d.empresa.toLowerCase().includes(deadlinesSearch.toLowerCase());
      const matchResp =
        deadlinesResponsavelFilter === "Todos" || d.responsavel === deadlinesResponsavelFilter;
      const matchEmp =
        deadlinesEmpresaFilter === "Todas" || d.empresa === deadlinesEmpresaFilter;
      return matchSearch && matchResp && matchEmp;
    });
  }, [completedDeadlines, deadlinesSearch, deadlinesResponsavelFilter, deadlinesEmpresaFilter]);

  const filteredDeadlinesForLink = useMemo(() => {
    if (!deadlines) return [];
    const search = deadlineSearchTerm.trim().toLowerCase();
    
    // Sort deadlines: PENDING first, then by date descending
    const sorted = [...deadlines].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === DeadlineStatus.PENDING ? -1 : 1;
      }
      return new Date(b.data).getTime() - new Date(a.data).getTime();
    });

    if (!search) return sorted;
    return sorted.filter((d) => {
      return (
        (d.peca || "").toLowerCase().includes(search) ||
        (d.responsavel || "").toLowerCase().includes(search) ||
        (d.empresa || "").toLowerCase().includes(search) ||
        (d.assunto || "").toLowerCase().includes(search)
      );
    });
  }, [deadlines, deadlineSearchTerm]);

  const handleEditSetting = (
    index: number,
    list: string[],
    field: keyof NotificationSettings,
  ) => {
    const current = list[index];
    const newValue = prompt(`Editar entrada:`, current);
    if (newValue && newValue.trim() !== "" && newValue !== current) {
      const updatedList = [...list];
      updatedList[index] =
        field === "responsaveis" ||
        field === "pecas" ||
        field === "empresas"
          ? newValue.toUpperCase()
          : newValue;
      updateSettings(field, updatedList);
    }
  };

  const handleDeleteSetting = (
    index: number,
    list: string[],
    field: keyof NotificationSettings,
  ) => {
    if (confirm(`Remover definitivamente?`)) {
      const updatedList = list.filter((_, idx) => idx !== index);
      updateSettings(field, updatedList);
    }
  };

  const handleExportCSV = () => {
    const headers = ["Cliente", "Peça", "ADV", "Vencimento", "Status"];
    const rows = filteredDeadlines.map((d) => [
      d.empresa,
      d.peca,
      d.responsavel,
      formatLocalDate(d.data),
      d.status,
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `lexpremium_report.csv`;
    link.click();
  };

  const handleExportPDF = () => {
    const docPdf = new jsPDF();
    docPdf.text("LexPremium - Relatório Operacional", 14, 15);
    const tableData = filteredDeadlines.map((d) => [
      d.empresa,
      d.peca,
      d.responsavel,
      formatLocalDate(d.data),
      d.status,
    ]);
    (docPdf as any).autoTable({
      head: [["Empresa", "Peça", "Responsável", "Data", "Status"]],
      body: tableData,
      startY: 20,
    });
    docPdf.save("lexpremium_report.pdf");
  };

  const handleExportBackup = () => {
    const backupData = {
      version: "1.1",
      exportedAt: new Date().toISOString(),
      deadlines,
      adminTasks,
      clients,
      settings: dynamicSettings,
    };

    // Safe circular-structure & complex Firestore field replacer
    const seen = new WeakSet();
    const circularReplacer = (key: string, value: any) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);

        // Firestore Timestamp serialization support
        if (typeof value.toDate === "function") {
          return value.toDate().toISOString();
        }
        if (value._seconds !== undefined && value._nanoseconds !== undefined) {
          return new Date((value._seconds * 1000) + (value._nanoseconds / 1000000)).toISOString();
        }
        if (value.seconds !== undefined && value.nanoseconds !== undefined) {
          try {
            return new Date((value.seconds * 1000) + (value.nanoseconds / 1000000)).toISOString();
          } catch (e) {}
        }
        
        // Exclude internal Firestore services or custom non-serializable fields/properties
        if (key === "icon" || key === "_service" || key === "firestore" || key === "db" || key === "app" || key === "onSnapshot") {
          return undefined;
        }
      }
      return value;
    };

    const blob = new Blob([JSON.stringify(backupData, circularReplacer, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `lexpremium_backup_${new Date().toISOString().split("T")[0]}.json`;
    link.click();
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (
      !confirm(
        "Isso irá sobrescrever ou duplicar dados dependendo do conteúdo. Deseja prosseguir com a restauração?",
      )
    )
      return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backup = JSON.parse(event.target?.result as string);
        if (!backup.deadlines && !backup.adminTasks && !backup.clients) {
          throw new Error("Arquivo de backup inválido.");
        }

        setIsSyncing(true);

        // Importar Clientes (Se houver no backup)
        if (backup.clients) {
          for (const c of backup.clients) {
            const { id, ...data } = c;
            await addDoc(collection(db, "clients"), {
              ...data,
              userId: user.uid,
              officeId: userProfile?.officeId || user.uid,
              userEmail: user.email,
              importedAt: new Date().toISOString(),
            });
          }
        } else if (backup.settings?.clients) {
          // Migração de backup antigo (onde clientes estavam nas settings)
          for (const c of backup.settings.clients) {
            const { id, ...data } = c;
            await addDoc(collection(db, "clients"), {
              ...data,
              userId: user.uid,
              officeId: userProfile?.officeId || user.uid,
              userEmail: user.email,
              importedAt: new Date().toISOString(),
            });
          }
        }

        // Importar Prazos
        if (backup.deadlines) {
          for (const d of backup.deadlines) {
            const { id, ...data } = d;
            await addDoc(collection(db, "deadlines"), {
              ...data,
              userId: user.uid,
              officeId: userProfile?.officeId || user.uid,
              userEmail: user.email,
              imported: true,
            });
          }
        }

        // Importar Tarefas
        if (backup.adminTasks) {
          for (const t of backup.adminTasks) {
            const { id, ...data } = t;
            await addDoc(collection(db, "adminTasks"), {
              ...data,
              userId: user.uid,
              officeId: userProfile?.officeId || user.uid,
              userEmail: user.email,
              imported: true,
            });
          }
        }

        alert("Restauração concluída com sucesso!");
      } catch (err: any) {
        console.error("Erro na restauração:", err);
        const errorMsg =
          err.code === "permission-denied"
            ? "Permissão negada no Firestore. Verifique as regras de segurança."
            : err.message || "Falha ao processar o arquivo de backup.";
        alert(`Erro na restauração: ${errorMsg}`);
      } finally {
        setIsSyncing(false);
      }
    };
    reader.readAsText(file);
  };

  const isSubscriptionInactive = useMemo(() => {
    if (!user) return false;
    
    // O Super Admin (rudyendo@gmail.com) só ignora o bloqueio na tela de superadmin ou no seu escritório pessoal
    if (user.email === "rudyendo@gmail.com" && (view === "superadmin" || userProfile?.officeId === user.uid)) {
      return false;
    }

    if (!currentSubscription) return false; // Libera provisório enquanto carrega
    
    const status = currentSubscription.status;
    const validUntil = currentSubscription.validUntil;
    
    if (status === "GRATIS") return false;
    if (status === "BLOCKED") return true;
    if (status === "PENDING_PAYMENT") return true;
    if (status === "PENDING_CHOICE") return true;
    
    if (validUntil) {
      const expiry = new Date(validUntil);
      const today = new Date();
      today.setHours(0,0,0,0);
      expiry.setHours(0,0,0,0);
      return expiry < today;
    }
    
    return false;
  }, [currentSubscription, user, userProfile?.officeId, view]);

  if (authLoading)
    return (
      <div className="fixed inset-0 bg-[#020617] flex items-center justify-center text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] animate-pulse">
        Sincronizando Sistema...
      </div>
    );
  if (!user)
    return (
      <AuthScreen
        onLogin={handleLogin}
        onGoogleLogin={handleGoogleLogin}
        loading={authLoading}
      />
    );

  if (isSubscriptionInactive)
    return (
      <PaywallScreen
        currentSubscription={currentSubscription}
        userProfile={userProfile}
        onSwitchOffice={handleSwitchOffice}
        onLogout={() => signOut(auth)}
      />
    );

  const renderDeadlineList = (list: Deadline[]) => (
    <div className="divide-y divide-slate-100">
      {list.map((d) => (
        <div
          key={d.id}
          className="p-3.5 md:p-5 flex flex-col hover:bg-slate-50/50 transition-all border-l-4 md:border-l-8 border-transparent hover:border-blue-500"
        >
          <div className="flex flex-col lg:flex-row justify-between items-start mb-2 w-full gap-3">
            <div className="flex-1 md:pr-6 w-full">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 mb-1">
                <span className="font-black text-[#0F172A] text-base md:text-lg tracking-tight uppercase">
                  {d.peca}
                </span>
                <span
                  className={`w-fit px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${d.status === DeadlineStatus.COMPLETED ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                >
                  {d.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  {d.empresa} • {d.sector || "GERAL"} • ADV: {d.responsavel}
                </p>
                {d.documentUrl && (
                  <a
                    href={d.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-6 h-6 flex items-center justify-center bg-blue-50 text-blue-600 rounded flex-shrink-0 hover:bg-blue-600 hover:text-white transition-all scale-90"
                    title="Ver Link"
                  >
                    <Icons.ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex flex-row-reverse lg:flex-row items-center justify-between lg:justify-end w-full lg:w-auto gap-3">
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => handleSendToReview(d)}
                  className="w-8 h-8 md:w-10 md:h-10 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm flex items-center justify-center"
                  title="Enviar p/ Revisão"
                >
                  <Icons.Review className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleStatus(d)}
                  className="w-8 h-8 md:w-10 md:h-10 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center justify-center"
                  title="Alternar Status"
                >
                  <Icons.Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleEditClick(d)}
                  className="w-8 h-8 md:w-10 md:h-10 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center justify-center"
                  title="Editar"
                >
                  <Icons.Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Remover prazo definitivamente?"))
                      deleteDeadline(d.id);
                  }}
                  className="w-8 h-8 md:w-10 md:h-10 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm flex items-center justify-center"
                  title="Excluir"
                >
                  <Icons.Trash className="w-4 h-4" />
                </button>
              </div>
              <div className="text-left lg:text-right min-w-[90px] md:min-w-[110px]">
                <p className="font-black text-[#0F172A] text-base md:text-lg tracking-tighter">
                  {formatLocalDate(d.data)}{" "}
                  {d.hora && (
                    <span className="text-blue-600 text-xs ml-1">
                      às {d.hora}
                    </span>
                  )}
                </p>
                <p
                  className={`text-[7px] font-black uppercase mt-0.5 ${getDaysDiff(d.data) <= 1 ? "text-red-500" : "text-slate-400"}`}
                >
                  {getDaysDiff(d.data)} dias
                </p>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-50 w-full">
            <p className="text-slate-600 text-[11px] md:text-xs leading-relaxed font-medium">
              "{d.assunto}"
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex bg-[#F8FAFC] min-h-screen antialiased flex-col md:flex-row">
      <Sidebar
        currentView={view}
        setView={setView}
        user={user}
        userProfile={userProfile}
        dynamicSettings={dynamicSettings}
        onLogout={() => signOut(auth)}
        onSwitchOffice={handleSwitchOffice}
        isOpen={isMobileMenuOpen}
        toggleSidebar={toggleMobileMenu}
      />

      {/* Mobile Header */}
      <div className="md:hidden bg-[#020617] text-white p-5 flex justify-between items-center sticky top-0 z-[40] shadow-xl">
        <div className="flex items-center gap-3">
          {dynamicSettings.officeLogo ? (
            <img 
              src={dynamicSettings.officeLogo} 
              alt={dynamicSettings.officeName || "Logo"} 
              className="h-16 w-auto max-w-[180px] object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <>
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-lg">
                LP
              </div>
              <h1 className="text-lg font-black tracking-tight">LexPremium</h1>
            </>
          )}
        </div>
        <button
          onClick={toggleMobileMenu}
          className="p-2 bg-white/5 rounded-lg"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </button>
      </div>

      <main className="md:ml-[260px] flex-1 p-4 md:p-8">
        {permissionError && (
          <div className="mb-6 md:mb-8 p-5 md:p-6 bg-red-50 border border-red-200 rounded-3xl animate-in slide-in-from-top-4 shadow-xl">
            <div className="flex flex-col md:flex-row items-start gap-4 md:gap-6 text-red-700">
              <div className="p-2.5 bg-red-100 rounded-xl shadow-sm">
                <Icons.AlertCircle />
              </div>
              <div className="flex-1">
                <p className="font-black text-lg md:text-xl tracking-tight mb-3 uppercase">
                  Erro de Configuração
                </p>
                <p className="text-xs md:text-sm font-medium leading-relaxed mb-6 opacity-80">
                  Firestore bloqueado. Atualize as regras no console Firebase:
                </p>

                <div className="bg-slate-900 p-4 md:p-6 rounded-2xl border border-white/10 shadow-inner mb-4 overflow-x-auto">
                  <pre className="text-[9px] md:text-[10px] font-mono text-emerald-400 whitespace-pre leading-relaxed">
                    {`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /settings/{userId} { allow read, write: if request.auth != null && request.auth.uid == userId; }
    match /deadlines/{id} { allow read, write: if request.auth != null && (resource == null || resource.data.userId == request.auth.uid); }
    match /adminTasks/{id} { allow read, write: if request.auth != null && (resource == null || resource.data.userId == request.auth.uid); }
    match /correspondence/{userId} { allow read, write: if request.auth != null && request.auth.uid == userId; }
    match /{document=**} { allow read, write: if false; }
  }
}`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 md:mb-8">
          <div>
            <h2 className="text-xl md:text-3xl font-black text-[#0F172A] tracking-tight mb-0.5 uppercase">
              {view === "dashboard"
                ? "Dashboard"
                : view === "clients"
                  ? "Consulta de Clientes"
                  : view === "deadlines"
                    ? "Controle de Prazos"
                    : view === "agenda"
                      ? "Agenda"
                      : view === "correspondence"
                        ? "Ofícios e Memorandos"
                        : view === "documents"
                            ? "Gerador de Documentos"
                            : view === "reports"
                      ? "Relatórios"
                      : view === "team"
                        ? "Gestão de Equipe"
                        : view === "monitoring"
                          ? "Acompanhamento Processual"
                          : view === "finance"
                            ? "Controle Financeiro"
                            : view === "superadmin"
                              ? "Controle Financeiro Geral (Sistema)"
                              : "Configurações"}
            </h2>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#34D399] animate-pulse" />
              <span className="text-[9px] md:text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">
                {view === "superadmin"
                  ? "SISTEMA & ADMINISTRAÇÃO"
                  : (userProfile ? `${userProfile.role} | ${userProfile.sector}` : "SISTEMA OPERACIONAL")}
              </span>
            </div>
          </div>
          <div className="w-full md:w-auto flex items-center gap-4">
            {view === "dashboard" ? (
              <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                <button
                  onClick={() => {
                    resetDeadlineForm();
                    setIsModalOpen(true);
                  }}
                  className="flex-1 md:flex-none bg-red-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl font-black text-xs md:text-sm shadow-xl shadow-red-600/30 hover:bg-red-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
                >
                  <Icons.Plus /> NOVO PRAZO
                </button>
                <button
                  onClick={() => {
                    resetAdminTaskForm();
                    setIsAgendaModalOpen(true);
                  }}
                  className="flex-1 md:flex-none bg-blue-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl font-black text-xs md:text-sm shadow-xl shadow-blue-600/30 hover:bg-blue-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
                >
                  <Icons.Plus /> NOVA TAREFA
                </button>
              </div>
            ) : view === "agenda" ? (
              <button
                onClick={() => {
                  resetAdminTaskForm();
                  setIsAgendaModalOpen(true);
                }}
                className="w-full md:w-auto bg-blue-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl font-black text-xs md:text-sm shadow-xl shadow-blue-600/30 hover:bg-blue-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
              >
                <Icons.Plus /> NOVA TAREFA
              </button>
            ) : view === "clients" ? (
              <button
                onClick={() => {
                  setEditingClientId(null);
                  setClientType("PJ");
                  setClientForm({
                    name: "",
                    document: "",
                    driveUrl: "",
                    tradeName: "",
                    address: "",
                    adminName: "",
                    email: "",
                    phone: "",
                  });
                  setPreferredNameSource("FANTASIA");
                  setIsClientModalOpen(true);
                }}
                className="w-full md:w-auto bg-emerald-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl font-black text-xs md:text-sm shadow-xl shadow-emerald-600/30 hover:bg-emerald-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
              >
                <Icons.Plus /> CADASTRAR CLIENTE
              </button>
            ) : view === "finance" ? (
              <button
                onClick={() => {
                  resetFinanceForm();
                  setIsFinanceModalOpen(true);
                }}
                className="w-full md:w-auto bg-indigo-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl font-black text-xs md:text-sm shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
              >
                <Icons.Plus /> NOVO LANÇAMENTO
              </button>
            ) : view === "monitoring" ? (
              <button
                onClick={() => {
                  setIsAddingMonitoredProcess(true);
                }}
                className="w-full md:w-auto bg-blue-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl font-black text-xs md:text-sm shadow-xl shadow-blue-600/30 hover:bg-blue-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
              >
                <Icons.Plus /> MONITORAR NOVO PRAZO
              </button>
            ) : view === "deadlines" ? (
              <button
                onClick={() => {
                  resetDeadlineForm();
                  setIsModalOpen(true);
                }}
                className="w-full md:w-auto bg-blue-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl font-black text-xs md:text-sm shadow-xl shadow-blue-600/30 hover:bg-blue-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
              >
                <Icons.Plus /> REGISTRAR PRAZO
              </button>
            ) : null}
          </div>
        </header>

        {view === "dashboard" && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-slate-100 overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-80" />
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                    <span className="p-2.5 bg-slate-900 text-white rounded-xl shadow-lg">
                      <Icons.Dashboard />
                    </span>
                    Cronograma Integrado
                  </h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-12">
                    {getWeekRangeLabel(dashboardCalendarDate)}
                  </p>
                </div>
                <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner">
                  <button
                    onClick={() => {
                      const newDate = new Date(dashboardCalendarDate);
                      newDate.setDate(newDate.getDate() - 7);
                      setDashboardCalendarDate(newDate);
                    }}
                    className="p-2 text-slate-400 hover:text-blue-600 transition-all bg-white rounded-lg border border-slate-100 shadow-sm shrink-0"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDashboardCalendarDate(new Date())}
                    className="px-4 py-2 bg-white text-slate-900 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all border border-slate-100 shadow-sm"
                  >
                    Hoje
                  </button>
                  <button
                    onClick={() => {
                      const newDate = new Date(dashboardCalendarDate);
                      newDate.setDate(newDate.getDate() + 7);
                      setDashboardCalendarDate(newDate);
                    }}
                    className="p-2 text-slate-400 hover:text-blue-600 transition-all bg-white rounded-lg border border-slate-100 shadow-sm shrink-0"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {getDaysInWeek(dashboardCalendarDate).map((day) => {
                  const dayStr = formatDateToISO(day);
                  const filteredDeadlines = deadlines.filter((d) => {
                    if (userProfile?.role === UserRole.ADMIN) return true;
                    if (userProfile?.role === UserRole.COORDINATOR && (!d.sector || d.sector === userProfile.sector || d.sector === Sector.GENERAL)) return true;
                    if (userProfile?.role === UserRole.LAWYER && (d.userId === user?.uid || d.assignedTo === user?.uid)) return true;
                    if (userProfile?.role === UserRole.INTERN) return true;
                    return false;
                  });

                  const dayDeadlines = filteredDeadlines
                    .filter((d) => d.data === dayStr)
                    .sort((a, b) =>
                      (a.hora || "00:00").localeCompare(b.hora || "00:00"),
                    );

                  const filteredAdminTasks = adminTasks.filter((t) => {
                    if (userProfile?.role === UserRole.ADMIN) return true;
                    if (userProfile?.role === UserRole.COORDINATOR && (!t.sector || t.sector === userProfile.sector || t.sector === Sector.GENERAL)) return true;
                    if (userProfile?.role === UserRole.LAWYER && (t.userId === user?.uid || t.assignedTo === user?.uid)) return true;
                    if (userProfile?.role === UserRole.INTERN) return true;
                    return false;
                  });

                  const dayAdm = filteredAdminTasks
                    .filter((t) => t.date === dayStr)
                    .sort((a, b) =>
                      (a.time || "00:00").localeCompare(b.time || "00:00"),
                    );
                  const isToday = formatDateToISO(new Date()) === dayStr;

                  return (
                    <div
                      key={dayStr}
                      className={`p-1 rounded-2xl border transition-all flex flex-col gap-3 min-h-[260px] ${isToday ? "bg-slate-50 border-blue-200 ring-2 ring-blue-50" : "bg-white border-slate-100"}`}
                    >
                      <div className="text-center pb-0 border-b border-slate-100">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                          {day.toLocaleDateString("pt-BR", {
                            weekday: "short",
                          })}
                        </p>
                        <p
                          className={`text-lg font-black ${isToday ? "text-blue-600" : "text-slate-900"}`}
                        >
                          {day.getDate()}
                        </p>
                      </div>
                      <div className="space-y-3 flex-1 overflow-y-auto no-scrollbar px-1 py-1">
                        {dayDeadlines.length === 0 && dayAdm.length === 0 && (
                          <div className="h-full flex items-center justify-center py-10 opacity-20">
                            <Icons.Clock />
                          </div>
                        )}
                        {dayDeadlines.map((d) => {
                          const isCompleted = d.status === DeadlineStatus.COMPLETED;
                          const isMyDeadline = d.assignedTo === userProfile?.id || (d.responsavel && userProfile?.name && d.responsavel.toLowerCase().trim() === userProfile.name.toLowerCase().trim());
                          
                          let cardClasses = "bg-red-50 border-red-100 border";
                          
                          if (isCompleted) {
                             cardClasses = "bg-emerald-50 border-emerald-100 border";
                          } else if (d.reviewState === ReviewState.WAITING_COORDINATOR || d.reviewState === ReviewState.REVIEWING_COORDINATOR || d.reviewState === ReviewState.VALIDATED_BY_ADMIN_WAITING_COORDINATOR) {
                             cardClasses = "bg-yellow-100 border-yellow-400 border-2";
                             if (d.reviewState !== ReviewState.REVIEWING_COORDINATOR && userProfile?.role === UserRole.COORDINATOR) {
                                cardClasses += " animate-pulse ring-2 ring-yellow-400 ring-offset-2";
                             }
                          } else if (d.reviewState === ReviewState.WAITING_ADMIN || d.reviewState === ReviewState.REVIEWING_ADMIN) {
                             cardClasses = "bg-orange-100 border-orange-500 border-2";
                             if (d.reviewState === ReviewState.WAITING_ADMIN && userProfile?.role === UserRole.ADMIN) {
                                cardClasses += " animate-pulse ring-2 ring-orange-500 ring-offset-2";
                             }
                          } else if (d.reviewState === ReviewState.RETURNED_TO_LAWYER) {
                             cardClasses = "bg-red-100 border-red-400 border-2";
                             if (userProfile?.role === UserRole.LAWYER && isMyDeadline) {
                                cardClasses += " animate-pulse ring-2 ring-red-400 ring-offset-2";
                             }
                          } else if (isMyDeadline) {
                             cardClasses = "bg-red-50/95 border-red-500 border-2 shadow-md font-semibold";
                          }

                          return (
                            <div
                              key={d.id}
                              onClick={() => {
                                setSelectedAppointment({
                                  type: "deadline",
                                  data: d,
                                });
                                setIsDetailsModalOpen(true);
                              }}
                              className={`p-3 rounded-2xl flex flex-col gap-1 cursor-pointer hover:shadow-md transition-all group relative ${cardClasses}`}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleStatus(d);
                                }}
                                className={`absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isCompleted ? "bg-emerald-600 text-white" : "bg-white text-slate-300 hover:text-emerald-600 border border-slate-100 shadow-sm"}`}
                                title={
                                  isCompleted
                                    ? "Marcar como pendente"
                                    : "Concluir"
                                }
                              >
                                <div className="scale-75">
                                  <Icons.Check />
                                </div>
                              </button>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <div
                                  className={`w-1 h-1 rounded-full ${isCompleted ? "bg-emerald-500" : "bg-red-500"}`}
                                />
                                <span
                                  className={`text-[7px] font-black uppercase ${isCompleted ? "text-emerald-600" : "text-red-600"}`}
                                >
                                  Processual
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-slate-900 leading-tight uppercase line-clamp-2">
                                  {d.peca}
                                </span>
                                <span className={`text-[7.5px] font-black uppercase tracking-widest mt-1 flex items-center gap-1 flex-wrap px-1.5 py-0.5 rounded ${
                                  isCompleted
                                    ? "text-emerald-700 bg-emerald-100/60 border border-emerald-200/40"
                                    : isMyDeadline 
                                      ? "text-red-700 bg-red-100/60 border border-red-200/40" 
                                      : "text-slate-500 bg-slate-50 border border-slate-100"
                                }`}>
                                  <Icons.Users className={`w-2 h-2 inline ${isCompleted ? "text-emerald-600" : isMyDeadline ? "text-red-600" : "text-blue-500"}`} /> 
                                  {isMyDeadline ? `★ RESP: ${getFirstName(d.responsavel)}` : `RESP: ${getFirstName(d.responsavel)}`}
                                </span>
                                {d.assignedTo && teamProfiles.find(t => t.id === d.assignedTo)?.name !== d.responsavel && (
                                  <span className={`text-[7.5px] font-black uppercase tracking-widest mt-0.5 flex items-center gap-1 flex-wrap px-1.5 py-0.5 rounded border ${
                                    isCompleted
                                      ? "text-emerald-600 bg-emerald-100/30 border-emerald-250/30"
                                      : "text-slate-400 bg-slate-50 border-slate-100"
                                  }`}>
                                    <Icons.Users className={`w-1.5 h-1.5 inline ${isCompleted ? "text-emerald-500" : "text-slate-400"}`} /> ATRIBUÍDO: {getFirstName(teamProfiles.find(t => t.id === d.assignedTo)?.name)}
                                  </span>
                                )}
                              </div>
                              <p
                                className={`text-[8px] font-black truncate ${isCompleted ? "text-emerald-400" : "text-slate-400"}`}
                              >
                                {d.empresa}
                              </p>
                            </div>
                          );
                        })}
                        {dayAdm.map((t) => {
                          const isCompleted =
                            t.status === DeadlineStatus.COMPLETED;
                          const isMyTask = t.assignedTo === userProfile?.id || (!t.assignedTo && t.userId === userProfile?.id);
                          const taskRespName = teamProfiles.find(member => member.id === t.assignedTo)?.name 
                            || teamProfiles.find(member => member.id === t.userId)?.name 
                            || (t.userId === user?.uid ? userProfile?.name : null)
                            || "Membro";
                          return (
                            <div
                              key={t.id}
                              onClick={() => {
                                setSelectedAppointment({
                                  type: "task",
                                  data: t,
                                });
                                setIsDetailsModalOpen(true);
                              }}
                              className={`p-3 border rounded-2xl flex flex-col gap-1 cursor-pointer hover:shadow-md transition-all group relative ${
                                isCompleted 
                                  ? "bg-emerald-50 border-emerald-100" 
                                  : isMyTask 
                                    ? "bg-blue-50/95 border-blue-500 border-2 shadow-md font-semibold" 
                                    : "bg-blue-50 border-blue-100"
                              }`}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleAdminTaskStatus(t);
                                }}
                                className={`absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isCompleted ? "bg-emerald-600 text-white" : "bg-white text-slate-300 hover:text-emerald-600 border border-slate-100 shadow-sm"}`}
                                title={
                                  isCompleted
                                    ? "Marcar como pendente"
                                    : "Concluir"
                                }
                              >
                                <div className="scale-75">
                                  <Icons.Check />
                                </div>
                              </button>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <div
                                  className={`w-1 h-1 rounded-full ${isCompleted ? "bg-emerald-500" : "bg-blue-600"}`}
                                />
                                <span
                                  className={`text-[7px] font-black uppercase ${isCompleted ? "text-emerald-600" : "text-blue-600"}`}
                                >
                                  Administrativo
                                </span>
                              </div>
                              <p
                                className={`text-[10px] font-bold leading-tight uppercase line-clamp-2 ${isCompleted ? "text-emerald-900" : "text-slate-900"}`}
                              >
                                {t.title}
                              </p>
                              <span className={`text-[7.5px] font-black uppercase tracking-widest mt-1 flex items-center gap-1 flex-wrap px-1.5 py-0.5 rounded ${
                                isCompleted
                                  ? "text-emerald-700 bg-emerald-100/60 border border-emerald-250/30"
                                  : isMyTask 
                                    ? "text-blue-700 bg-blue-100/50 border border-blue-200/40" 
                                    : "text-slate-500 bg-slate-50 border border-slate-100"
                              }`}>
                                <Icons.Users className={`w-2 h-2 inline ${isCompleted ? "text-emerald-600" : isMyTask ? "text-blue-600" : "text-blue-500"}`} /> 
                                {isMyTask ? `★ RESP: ${getFirstName(taskRespName)}` : `RESP: ${getFirstName(taskRespName)}`}
                              </span>
                              <p
                                className={`text-[8px] font-black ${isCompleted ? "text-emerald-400" : "text-slate-400"}`}
                              >
                                {t.time || "--:--"}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
              <div className="lg:col-span-12 bg-[#020617] p-6 md:p-10 rounded-3xl shadow-xl flex flex-col items-center gap-8">
                <div className="w-full space-y-4 text-center">
                  <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">
                    Métricas de Produtividade
                  </h3>
                  <p className="text-slate-400 font-medium text-xs md:text-sm leading-relaxed opacity-70">
                    Produtividade mensal consolidada (Prazos e Tarefas concluídas).
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                  <div className="bg-white/5 p-6 rounded-[1.5rem] border border-white/10 backdrop-blur-sm">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="text-[9px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                        <Icons.ChartIcon className="w-4 h-4" /> Produtividade Anual
                      </h4>
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                        {currentMonthName}
                      </span>
                    </div>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={productivityData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.05)"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="name"
                            stroke="rgba(255,255,255,0.3)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="rgba(255,255,255,0.3)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0f172a",
                              border: "none",
                              borderRadius: "12px",
                              fontSize: "10px",
                            }}
                            itemStyle={{ color: "#60a5fa" }}
                          />
                          <Bar
                            dataKey="total"
                            fill="#3b82f6"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white/5 p-6 rounded-[1.5rem] border border-white/10 backdrop-blur-sm">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="text-[9px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
                        <Icons.Users className="w-4 h-4" /> Produção / Advogado
                      </h4>
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                        Mês Atual
                      </span>
                    </div>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={lawyerProductivityData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.05)"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="name"
                            stroke="rgba(255,255,255,0.3)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="rgba(255,255,255,0.3)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0f172a",
                              border: "none",
                              borderRadius: "12px",
                              fontSize: "10px",
                            }}
                            itemStyle={{ color: "#f59e0b" }}
                          />
                          <Bar
                            dataKey="total"
                            fill="#f59e0b"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
 
                  <div className="bg-white/5 p-6 rounded-[1.5rem] border border-white/10 backdrop-blur-sm">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                        <Icons.Factory className="w-4 h-4" /> Top Demandantes
                      </h4>
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                        {currentMonthName}
                      </span>
                    </div>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={companyDemandData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.05)"
                            horizontal={false}
                          />
                          <XAxis type="number" hide />
                          <YAxis
                            type="category"
                            dataKey="name"
                            stroke="rgba(255,255,255,0.3)"
                            fontSize={10}
                            width={80}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0f172a",
                              border: "none",
                              borderRadius: "12px",
                              fontSize: "10px",
                            }}
                            itemStyle={{ color: "#10b981" }}
                          />
                          <Bar
                            dataKey="total"
                            fill="#10b981"
                            radius={[0, 4, 4, 0]}
                            barSize={20}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "clients" && (
          <div className="space-y-4 md:space-y-5 animate-in fade-in duration-500">
            {/* COMPACT CRM / HEADER PANEL */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                  <Icons.Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                    Gestão de Clientes & CRM
                  </h2>
                  <p className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                    Pastas, Contatos e Processos Integrados ({filteredClientsList.length} total)
                  </p>
                </div>
              </div>

              {/* FILTROS E BUSCA */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 lg:max-w-3xl lg:justify-end">
                {/* INPUT DE BUSCA */}
                <div className="relative flex-1 max-w-md">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Icons.Search className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar por nome, documento ou fantasia..."
                    className="w-full bg-slate-50 p-2.5 pl-10 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-blue-100 transition-all border border-transparent placeholder:text-slate-400"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                  />
                </div>

                {/* SEGMENT CONTROL (FILTRO TIPO) */}
                <div className="bg-slate-50 p-1 rounded-xl border border-slate-100 flex items-center gap-1 shadow-inner">
                  {(["ALL", "PJ", "PF"] as const).map((filterOpt) => {
                    const label = filterOpt === "ALL" ? "TODOS" : filterOpt;
                    const count = filterOpt === "ALL" 
                      ? filteredClientsList.length 
                      : filteredClientsList.filter(c => c.type === filterOpt).length;
                    const isActive = clientTypeFilter === filterOpt;
                    return (
                      <button
                        key={filterOpt}
                        onClick={() => setClientTypeFilter(filterOpt)}
                        className={`px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all ${
                          isActive 
                            ? "bg-white text-slate-800 shadow-sm border border-slate-200" 
                            : "text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        {label} <span className="ml-0.5 opacity-60 text-[8px] font-bold">({count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* GRID DE CLIENTES - 4 COLUNAS EM EXPANSAO DESKTOP */}
            {filteredClientsList.filter(c => clientTypeFilter === "ALL" || c.type === clientTypeFilter).length === 0 ? (
              <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
                <Icons.Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-400 font-black text-xs uppercase tracking-widest">
                  Nenhum cliente encontrado
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredClientsList
                  .filter(c => clientTypeFilter === "ALL" || c.type === clientTypeFilter)
                  .map((client) => {
                    const isLegacy = client.id.startsWith("legacy-");
                    const processesCount = monitoredProcesses.filter(p => p.clientId === client.id).length;
                    const avatarColor = client.type === "PJ" 
                      ? "bg-indigo-50 text-indigo-700 border-indigo-100" 
                      : "bg-emerald-50 text-emerald-700 border-emerald-100";

                    return (
                      <div
                        key={client.id}
                        onClick={() => {
                          setSelectedClientForDetails(client);
                          setIsClientDetailsModalOpen(true);
                        }}
                        className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col justify-between group hover:border-blue-300 hover:shadow-md transition-all duration-300 cursor-pointer min-h-[150px]"
                      >
                        <div>
                          {/* HEAD COM AVATAR, TIPO E BOTOES RAPIDOS */}
                          <div className="flex justify-between items-start gap-2 mb-3">
                            <div className="flex items-center gap-2">
                              {/* AVATAR COM INICIAIS */}
                              <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-black text-[10px] select-none ${avatarColor}`}>
                                {getClientInitials(client.displayName)}
                              </div>
                              <span className={`px-1.5 py-0.5 rounded text-[6px] font-black uppercase tracking-wider ${
                                client.type === "PJ" ? "bg-indigo-100/60 text-indigo-700" : "bg-emerald-100/60 text-emerald-700"
                              }`}>
                                {client.type}
                              </span>
                            </div>

                            {/* REGISTROS RAPIDOS EDIT / DELETE */}
                            <div
                              className="flex gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => handleEditClient(client)}
                                className="w-5.5 h-5.5 flex items-center justify-center bg-slate-50 text-slate-500 rounded hover:bg-blue-600 hover:text-white transition-all hover:shadow-sm"
                                title="Editar"
                              >
                                <Icons.Edit className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteClient(client)}
                                className="w-5.5 h-5.5 flex items-center justify-center bg-slate-50 text-slate-500 rounded hover:bg-red-600 hover:text-white transition-all hover:shadow-sm"
                                title="Excluir"
                              >
                                <Icons.Trash className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* TITULO E DOCUMENTO */}
                          <div className="mb-2">
                            <h3 className="text-xs font-black text-slate-900 leading-tight uppercase line-clamp-1 group-hover:text-blue-600 transition-colors">
                              {client.displayName}
                            </h3>
                            <p className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                              {client.document || "Sem Documento"}
                            </p>
                          </div>

                          {/* DETALHES DE CONTATO ADICIONAIS */}
                          <div className="space-y-1 mt-2 mb-1">
                            {client.phone && (
                              <p className="text-[8.5px] font-medium text-slate-500 flex items-center gap-1.5 truncate">
                                <Icons.Phone className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                                {client.phone}
                              </p>
                            )}
                            {client.email && (
                              <p className="text-[8.5px] font-medium text-slate-500 flex items-center gap-1.5 truncate">
                                <Icons.Mail className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                                {client.email}
                              </p>
                            )}
                            {processesCount > 0 && (
                              <p className="text-[8.5px] font-black text-indigo-600 flex items-center gap-1 uppercase tracking-wider">
                                <Icons.Table className="w-2.5 h-2.5 text-indigo-500" />
                                {processesCount === 1 ? "1 Processo" : `${processesCount} Processos`}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* BOTOES DE ACAO COMPACTOS INFRA */}
                        <div
                          className="flex gap-2 pt-3 border-t border-slate-100 mt-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleOpenProcesses(client)}
                            className="flex-1 bg-slate-900 text-white py-1.5 rounded-lg font-black text-[8px] uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-1 shadow-sm"
                          >
                            <Icons.Table className="w-2.5 h-2.5" />
                            Processos
                          </button>
                          {client.driveUrl && (
                            <a
                              href={client.driveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 transition-all shadow-inner border border-slate-200/50 flex items-center justify-center"
                              title="Pasta Cloud"
                            >
                              <Icons.ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {view === "deadlines" && (
          <div className="space-y-6 md:space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {/* CONTROLES E BUSCA */}
            <div className="bg-white rounded-3xl p-4 md:p-6 shadow-xl border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="w-full flex flex-col sm:flex-row items-center gap-3 flex-1">
                {/* Busca rápida */}
                <div className="relative w-full sm:max-w-xs">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Icons.Search className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={deadlinesSearch}
                    onChange={(e) => setDeadlinesSearch(e.target.value)}
                    placeholder="BUSCAR PRAZO, ASSUNTO, RESPONSÁVEL..."
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase tracking-widest"
                  />
                  {deadlinesSearch && (
                    <button
                      onClick={() => setDeadlinesSearch("")}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 font-bold text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filtro do Advogado */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">Advogado:</span>
                  <select
                    value={deadlinesResponsavelFilter}
                    onChange={(e) => setDeadlinesResponsavelFilter(e.target.value)}
                    className="w-full sm:w-auto py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {uniqResponsaveis.map((item) => (
                      <option key={item} value={item}>
                        {item === "Todos" ? "TODOS ADVOGADOS" : item}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro da Empresa */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">Cliente:</span>
                  <select
                    value={deadlinesEmpresaFilter}
                    onChange={(e) => setDeadlinesEmpresaFilter(e.target.value)}
                    className="w-full sm:w-auto py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 select-ellipsis"
                  >
                    {uniqEmpresas.map((item) => (
                      <option key={item} value={item}>
                        {item === "Todas" ? "TODAS EMPRESAS" : item}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* TABELA DE TRABALHO EXECUTIVA */}
            {(() => {
              const combinedDeadlinesForTable = [
                ...filteredPendingDeadlines,
                ...filteredCompletedDeadlines,
              ];
              return (
                <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                  <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icons.Table className="w-5 h-5 text-white" />
                      <h3 className="text-white font-black uppercase text-xs tracking-widest">
                        Tabela de Trabalho Executiva
                      </h3>
                    </div>
                    <span className="bg-white/10 text-white px-3 py-1 rounded-full text-[10px] font-black border border-white/10">
                      {combinedDeadlinesForTable.length} PRAZOS FILTRADOS
                    </span>
                  </div>
                  {combinedDeadlinesForTable.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="py-3.5 px-4 text-center w-12">Status</th>
                            <th className="py-3.5 px-4">Peça Processual / Assunto</th>
                            <th className="py-3.5 px-4">Cliente / Empresa</th>
                            <th className="py-3.5 px-4">Responsável</th>
                            <th className="py-3.5 px-4">Vencimento</th>
                            <th className="py-3.5 px-4 text-center w-36">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {combinedDeadlinesForTable.map((d) => {
                            const isCompleted = d.status === DeadlineStatus.COMPLETED;
                            const daysDiff = getDaysDiff(d.data);
                            return (
                              <tr
                                key={d.id}
                                className={`group hover:bg-slate-50/50 transition-colors ${
                                  isCompleted ? "bg-slate-50/30 text-slate-500" : ""
                                }`}
                              >
                                {/* Alternar Status */}
                                <td className="py-3 px-4 text-center">
                                  <button
                                    onClick={() => toggleStatus(d)}
                                    className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all border ${
                                      isCompleted
                                        ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                                        : "bg-white border-slate-200 hover:border-blue-500 text-slate-400"
                                    }`}
                                    title={isCompleted ? "Reabrir Prazo" : "Concluir Prazo"}
                                  >
                                    {isCompleted ? (
                                      <Icons.Check className="w-3.5 h-3.5" />
                                    ) : (
                                      <span className="w-2 h-2 rounded bg-slate-300 group-hover:bg-blue-500 transition-colors" />
                                    )}
                                  </button>
                                </td>

                                {/* Peça / Assunto */}
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-extrabold text-slate-900 uppercase tracking-tight text-xs">
                                      {d.peca}
                                    </span>
                                    <span className="text-[8px] px-1.5 py-0.5 rounded font-black uppercase bg-slate-100 text-slate-600">
                                      {d.sector || "GERAL"}
                                    </span>
                                  </div>
                                  {d.assunto && (
                                    <p className="text-[11px] text-slate-500 leading-wider font-medium line-clamp-1 italic mt-0.5" title={d.assunto}>
                                      "{d.assunto}"
                                    </p>
                                  )}
                                </td>

                                {/* Cliente / Empresa */}
                                <td className="py-3 px-4">
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded bg-blue-50 text-blue-700 border border-blue-100">
                                    {d.empresa}
                                  </span>
                                </td>

                                {/* Responsável */}
                                <td className="py-3 px-4 font-black text-slate-500 uppercase text-[9px]">
                                  {d.responsavel}
                                </td>

                                {/* Vencimento */}
                                <td className="py-3 px-4">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-slate-800 text-xs">
                                      {formatLocalDate(d.data)}{" "}
                                      {d.hora && (
                                        <span className="text-blue-600 text-[10px] ml-0.5 font-bold">
                                          às {d.hora}
                                        </span>
                                      )}
                                    </span>
                                    <span
                                      className={`text-[8px] font-black uppercase tracking-widest mt-0.5 ${
                                        isCompleted
                                          ? "text-emerald-600"
                                          : daysDiff <= 1
                                            ? "text-red-500"
                                            : "text-slate-400"
                                      }`}
                                    >
                                      {isCompleted ? "CONCLUÍDO" : `${daysDiff} dias`}
                                    </span>
                                  </div>
                                </td>

                                {/* Ações */}
                                <td className="py-3 px-4 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => handleSendToReview(d)}
                                      className="p-1 bg-blue-50 text-blue-600 hover:text-white hover:bg-blue-600 rounded-md transition-all shadow-sm"
                                      title="Enviar p/ Revisão"
                                    >
                                      <Icons.Review className="w-3.5 h-3.5" />
                                    </button>
                                    {d.documentUrl && (
                                      <a
                                        href={d.documentUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1 bg-slate-50 text-slate-600 hover:text-white hover:bg-slate-600 rounded-md transition-all shadow-sm"
                                        title="Ver Link do Documento"
                                      >
                                        <Icons.ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                    <button
                                      onClick={() => handleEditClick(d)}
                                      className="p-1 bg-amber-50 text-amber-600 hover:text-white hover:bg-amber-500 rounded-md transition-all shadow-sm"
                                      title="Editar"
                                    >
                                      <Icons.Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (window.confirm("Remover prazo definitivamente?"))
                                          deleteDeadline(d.id);
                                      }}
                                      className="p-1 bg-red-50 text-red-600 hover:text-white hover:bg-red-600 rounded-md transition-all shadow-sm"
                                      title="Excluir"
                                    >
                                      <Icons.Trash className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-400 font-bold uppercase text-[9px] tracking-widest">
                      Nenhum prazo encontrado correspondente aos filtros de busca
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {view === "agenda" && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
              <div className="bg-slate-900 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <h3 className="text-white font-black uppercase text-xs tracking-widest flex items-center gap-2">
                    <Icons.Calendar className="w-4 h-4" />
                    <span className="md:hidden">
                      {currentCalendarDate
                        .toLocaleDateString("pt-BR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                        .toUpperCase()}
                    </span>
                    <span className="hidden md:inline">
                      {getWeekRangeLabel(currentCalendarDate)}
                    </span>
                  </h3>
                </div>
                <div className="flex gap-2 w-full md:w-auto justify-between">
                  <button
                    onClick={() => {
                      const newDate = new Date(currentCalendarDate);
                      if (window.innerWidth < 768) {
                        newDate.setDate(newDate.getDate() - 1);
                      } else {
                        newDate.setDate(newDate.getDate() - 7);
                      }
                      setCurrentCalendarDate(newDate);
                    }}
                    className="p-1.5 text-white/60 hover:text-white transition-all bg-white/5 rounded-lg border border-white/10 shrink-0"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setCurrentCalendarDate(new Date())}
                    className="flex-1 md:flex-none px-4 py-1.5 bg-white/10 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-white hover:text-slate-900 transition-all border border-white/10"
                  >
                    Hoje
                  </button>
                  <button
                    onClick={() => {
                      const newDate = new Date(currentCalendarDate);
                      if (window.innerWidth < 768) {
                        newDate.setDate(newDate.getDate() + 1);
                      } else {
                        newDate.setDate(newDate.getDate() + 7);
                      }
                      setCurrentCalendarDate(newDate);
                    }}
                    className="p-1.5 text-white/60 hover:text-white transition-all bg-white/5 rounded-lg border border-white/10 shrink-0"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-1 grid grid-cols-1 md:grid-cols-5 gap-px bg-slate-100 border-b border-slate-100">
                {["Segunda", "Terça", "Quarta", "Quinta", "Sexta"].map(
                  (day) => (
                    <div
                      key={day}
                      className="hidden md:block bg-white py-3 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest"
                    >
                      {day}
                    </div>
                  ),
                )}
                <div className="md:hidden bg-white py-3 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  {currentCalendarDate
                    .toLocaleDateString("pt-BR", { weekday: "long" })
                    .toUpperCase()}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-px bg-slate-100">
                {getDaysInWeek(currentCalendarDate).map((day, idx) => {
                  const dayStr = formatDateToISO(day);
                  const selectedDayStr = formatDateToISO(currentCalendarDate);
                  const tasksForDay = adminTasks.filter((t) => {
                    if (t.date !== dayStr) return false;
                    if (userProfile?.role === UserRole.ADMIN) return true;
                    if (userProfile?.role === UserRole.COORDINATOR && (!t.sector || t.sector === userProfile.sector || t.sector === Sector.GENERAL)) return true;
                    if (userProfile?.role === UserRole.LAWYER && (t.userId === user?.uid || t.assignedTo === user?.uid)) return true;
                    if (userProfile?.role === UserRole.INTERN) return true;
                    return false;
                  });
                  const isToday = formatDateToISO(new Date()) === dayStr;
                  const isSelected = selectedDayStr === dayStr;

                  return (
                    <div
                      key={dayStr}
                      className={`bg-white min-h-[350px] p-3 transition-all flex flex-col gap-2 border-r border-slate-100 last:border-r-0 ${!isSelected ? "hidden md:flex" : "flex"}`}
                    >
                      <div className="flex items-center justify-between md:justify-center mb-1">
                        <span className="md:hidden text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          {day.toLocaleDateString("pt-BR", {
                            weekday: "short",
                          })}
                        </span>
                        <span
                          className={`text-sm font-black w-8 h-8 flex items-center justify-center rounded-full transition-all ${isToday ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-slate-400"}`}
                        >
                          {day.getDate()}
                        </span>
                      </div>

                      <div className="space-y-2 flex-1">
                        {tasksForDay.length === 0 && (
                          <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-50 rounded-2xl p-4">
                            <span className="text-[7px] font-black text-slate-200 uppercase tracking-widest text-center">
                              Vazio
                            </span>
                          </div>
                        )}
                        {tasksForDay.length > 0 && tasksForDay.map((task) => (
                          <div
                              key={task.id}
                              onClick={(e) => {
                                // Evitar que cliques nos botões de ação abram o modal de detalhes
                                if ((e.target as HTMLElement).closest("button"))
                                  return;
                                setSelectedAppointment({
                                  type: "task",
                                  data: task,
                                });
                                setIsDetailsModalOpen(true);
                              }}
                              className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition-all group cursor-pointer ${task.status === DeadlineStatus.COMPLETED ? "bg-slate-50 opacity-50 border-slate-100" : "bg-white shadow-sm border-slate-200 hover:border-blue-400 hover:shadow-md"}`}
                            >
                              <div className="flex flex-col">
                                <span className="text-[7px] font-black text-blue-600 uppercase mb-0.5">
                                  {task.category}
                                </span>
                                <span className="text-[11px] font-bold text-slate-900 leading-tight uppercase line-clamp-2">
                                  {task.title}
                                </span>
                                {task.assignedTo && (
                                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-1">
                                    <Icons.Users className="w-2 h-2" /> {teamProfiles.find(t => t.id === task.assignedTo)?.name || "Membro"}
                                  </span>
                                )}
                              </div>
                              <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-100 overflow-hidden">
                                <span className="text-[8px] font-black text-blue-600 shrink-0">
                                  {task.time || "--:--"}
                                </span>
                                <div className="flex gap-0.5 shrink-0">
                                  <button
                                    onClick={() => toggleAdminTaskStatus(task)}
                                    className={`p-1 rounded-lg transition-all ${task.status === DeadlineStatus.COMPLETED ? "text-emerald-500 bg-emerald-50" : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-500 font-bold"}`}
                                    title="Concluir"
                                  >
                                    <Icons.Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleEditAdminTaskClick(task)
                                    }
                                    className="p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-500 rounded-lg transition-all"
                                    title="Editar"
                                  >
                                    <Icons.Edit />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          "Remover tarefa definitivamente?",
                                        )
                                      )
                                        deleteAdminTask(task.id);
                                    }}
                                    className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all"
                                    title="Excluir"
                                  >
                                    <Icons.Trash />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        {view === "correspondence" && (
          <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
            {/* PAINEL DE CONTROLE DE NUMERAÇÃO */}
            <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden relative group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -translate-y-12 translate-x-12 opacity-50 group-hover:scale-110 transition-all font-sans"></div>

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative">
                {/* Título e Subtítulo */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                    <Icons.Correspondence />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
                      Ofícios e Memorandos
                    </h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                      Controle e gestão da numeração oficial do escritório
                    </p>
                  </div>
                </div>

                {/* Próximos Números (Compact Widgets) */}
                <div className="flex flex-wrap gap-3">
                  <div className="bg-blue-50/50 border border-blue-100 rounded-2xl px-4 py-2.5 flex items-center gap-3">
                    <div className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-pulse"></div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider leading-none">
                        Próximo Ofício
                      </p>
                      <p className="text-lg font-black text-blue-700 mt-1 font-mono">
                        {nextOficioNumber.toString().padStart(3, "0")}
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-50/50 border border-amber-100 rounded-2xl px-4 py-2.5 flex items-center gap-3">
                    <div className="w-2.5 h-2.5 bg-amber-600 rounded-full animate-pulse"></div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider leading-none">
                        Próximo Memo
                      </p>
                      <p className="text-lg font-black text-amber-700 mt-1 font-mono">
                        {nextMemorandoNumber.toString().padStart(3, "0")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-100 my-5 md:my-6 relative"></div>

              {/* Controles Principais: Seletor de Tipo e Ajuste de Faixa */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-2">Visualizar:</span>
                  <div className="flex p-1 bg-slate-100 rounded-xl">
                    <button
                      onClick={() => setActiveCorrespondenceTab("oficio")}
                      className={`px-4 py-2 rounded-lg font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all ${
                        activeCorrespondenceTab === "oficio" 
                          ? "bg-blue-600 text-white shadow-sm" 
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Ofícios
                    </button>
                    <button
                      onClick={() => setActiveCorrespondenceTab("memorando")}
                      className={`px-4 py-2 rounded-lg font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all ${
                        activeCorrespondenceTab === "memorando" 
                          ? "bg-amber-600 text-white shadow-sm" 
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Memorandos
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-2">Limite:</span>
                  <div className="flex p-1 bg-slate-100 rounded-xl">
                    {[50, 100, 150, 200].map((range) => (
                      <button
                        key={range}
                        onClick={() => setMaxOficioRange(range)}
                        className={`px-3 py-1.5 rounded-lg font-black text-[9px] md:text-[10px] transition-all ${
                          maxOficioRange === range 
                            ? "bg-slate-800 text-white shadow-sm" 
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* TABELA DE GRELHA DE NÚMEROS */}
            <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 relative">
              {/* Legenda do Status */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                  <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider">
                    {activeCorrespondenceTab === "oficio" ? "Painel de Ofícios" : "Painel de Memorandos"}
                  </h4>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-md bg-slate-50 border border-slate-200"></span>
                    <span>Disponível</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-3 h-3 rounded-md border ${activeCorrespondenceTab === "oficio" ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"}`}></span>
                    <span>Próximo</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-md bg-red-50 border border-red-100"></span>
                    <span>Reservado</span>
                  </div>
                </div>
              </div>

              {/* Grid maximizada */}
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-16 gap-2">
                {Array.from({ length: maxOficioRange }, (_, i) => i + 1).map((num) => {
                  const currentList =
                    activeCorrespondenceTab === "oficio"
                      ? usedOficioNumbers
                      : usedMemorandoNumbers;
                  const isUsed = currentList.includes(num);
                  const isNext =
                    num ===
                    (activeCorrespondenceTab === "oficio"
                      ? nextOficioNumber
                      : nextMemorandoNumber);
                  
                  const detail = activeCorrespondenceTab === "oficio" ? oficioDetails[num] : memorandoDetails[num];
                  const hasAuthorizationToUnreserve = userProfile?.role === UserRole.ADMIN || userProfile?.role === UserRole.COORDINATOR;
                  
                  let tooltip = "";
                  if (isUsed) {
                    if (detail) {
                      tooltip = `Reservado por ${detail.userName} para o prazo "${detail.deadlinePeca || "Geral"}" de ${detail.deadlineEmpresa || "Cliente"}.${hasAuthorizationToUnreserve ? " Clique para desmarcar." : " Apenas coordenadores/administradores desmarcam."}`;
                    } else {
                      tooltip = `Reservado.${hasAuthorizationToUnreserve ? " Clique para desmarcar." : " Apenas coordenadores/administradores desmarcam."}`;
                    }
                  } else if (isNext) {
                    tooltip = `Próximo número sugerido de ${activeCorrespondenceTab === "oficio" ? "Ofício" : "Memorando"}. Clique para vincular a um prazo e reservar.`;
                  } else {
                    tooltip = `Número disponível. Clique para vincular a um prazo e reservar.`;
                  }
                  
                  return (
                    <button
                      key={num}
                      onClick={() =>
                        handleToggleCorrespondenceNumber(
                          num,
                          activeCorrespondenceTab,
                        )
                      }
                      className={`h-11 md:h-12 flex flex-col items-center justify-center rounded-xl font-bold text-xs transition-all border relative cursor-pointer group ${
                        isUsed 
                          ? "bg-red-50 border-red-100 text-red-600 hover:bg-red-100/50" 
                          : isNext 
                            ? (activeCorrespondenceTab === "oficio" 
                                ? "border-blue-600 text-blue-600 bg-blue-50/70 shadow-sm" 
                                : "border-amber-600 text-amber-600 bg-amber-50/70 shadow-sm") + " animate-pulse font-black" 
                            : "bg-slate-50/50 hover:bg-white hover:shadow-sm hover:border-slate-300 border-slate-100 text-slate-600"
                      }`}
                      title={tooltip}
                    >
                      {isUsed && (
                        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></div>
                      )}
                      {!isUsed && isNext && (
                        <div className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${activeCorrespondenceTab === "oficio" ? "bg-blue-500" : "bg-amber-500"}`}></div>
                      )}
                      <span className="text-xs tracking-tight font-mono">
                        {num.toString().padStart(3, "0")}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Dica de uso */}
              <div className="mt-6 flex items-center justify-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <Icons.Sparkles className="w-4 h-4 text-slate-400 shrink-0 animate-bounce" />
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">
                  Dica: Clique em qualquer número disponível para vinculá-lo a um prazo e reservá-lo. Apenas coordenadores e administradores possuem permissão para desmarcar.
                </p>
              </div>

              {/* Tabela de conferencia de reservas */}
              <div className="mt-8 border-t border-slate-100 pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                    <Icons.List className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider">
                    Vínculos e Auditoria de Numerações ({activeCorrespondenceTab === "oficio" ? "Ofícios" : "Memorandos"})
                  </h4>
                </div>

                {(() => {
                  const currentList = activeCorrespondenceTab === "oficio" ? usedOficioNumbers : usedMemorandoNumbers;
                  const currentDetails = activeCorrespondenceTab === "oficio" ? oficioDetails : memorandoDetails;

                  const reservedItems = currentList.map(num => ({
                    num,
                    detail: currentDetails[num]
                  })).sort((a, b) => a.num - b.num);

                  if (reservedItems.length === 0) {
                    return (
                      <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                        Nenhuma numeração reservada neste painel
                      </div>
                    );
                  }

                  const hasAuthorizationToUnreserve = userProfile?.role === UserRole.ADMIN || userProfile?.role === UserRole.COORDINATOR;

                  return (
                    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                            <th className="py-3 px-4">Número</th>
                            <th className="py-3 px-4">Cliente / Empresa</th>
                            <th className="py-3 px-4">Prazo / Peça</th>
                            <th className="py-3 px-4">Reservado Por</th>
                            <th className="py-3 px-4">Data da Reserva</th>
                            <th className="py-3 px-4 text-right font-mono">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {reservedItems.map(({ num, detail }) => (
                            <tr key={num} className="hover:bg-slate-50/50 transition-colors text-xs font-semibold text-slate-700">
                              <td className="py-3 px-4 font-mono font-bold text-red-600">
                                {num.toString().padStart(3, "0")}
                              </td>
                              <td className="py-3 px-4 text-slate-500 font-mono text-[10px] uppercase">
                                {detail?.deadlineEmpresa || <span className="text-slate-300 font-sans italic text-[9px]">Não informado (legado)</span>}
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-bold text-slate-800">
                                  {detail?.deadlinePeca || <span className="text-slate-300 font-normal italic">Não informado (legado)</span>}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-500">
                                {detail?.userName || <span className="text-slate-300 italic">Desconhecido</span>}
                              </td>
                              <td className="py-3 px-4 text-slate-400 font-mono text-[10px]">
                                {detail?.timestamp ? new Date(detail.timestamp).toLocaleString("pt-BR") : <span className="text-slate-300">-</span>}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  onClick={() => handleToggleCorrespondenceNumber(num, activeCorrespondenceTab)}
                                  disabled={!hasAuthorizationToUnreserve}
                                  className={`p-1.5 rounded-lg border transition-all inline-flex items-center justify-center ${
                                    hasAuthorizationToUnreserve
                                      ? "bg-red-50 border-red-100 text-red-600 hover:bg-red-100 cursor-pointer"
                                      : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                                  }`}
                                  title={
                                    hasAuthorizationToUnreserve
                                      ? "Desmarcar e liberar este número"
                                      : "Apenas coordenadores/administradores podem desmarcar números."
                                  }
                                >
                                  <Icons.Trash className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {view === "documents" && <DocGenerator clients={clients} />}
        
        {view === "finance" && userProfile?.role === UserRole.ADMIN && (
          <FinanceManagement
            userProfile={userProfile}
            clients={clients}
            financeTransactions={financeTransactions}
            onSaveTransaction={handleSaveFinanceTransaction}
            onDeleteTransaction={handleDeleteFinanceTransaction}
            isModalOpen={isFinanceModalOpen}
            setIsModalOpen={setIsFinanceModalOpen}
            recurringExpenses={recurringExpenses}
            onSaveRecurringExpense={handleSaveRecurringExpense}
            onDeleteRecurringExpense={handleDeleteRecurringExpense}
          />
        )}
        
        {view === "monitoring" && (
          <MonitoringView 
            processes={monitoredProcesses}
            clients={clients}
            isAdding={isAddingMonitoredProcess}
            onSetIsAdding={setIsAddingMonitoredProcess}
            onAdd={async (cnj, clId) => {
               if(!userProfile) return;
               setIsSyncing(true);
               try {
                 console.log("[Monitoring] Starting search for:", cnj);
                 const res = await fetch('/api/datajud/search', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ cnj })
                 });
                 
                 const data = await res.json();
                 if(!res.ok) {
                   throw new Error(data.error || "Erro ao consultar a API");
                 }
                 
                 const hit = data.hits?.hits?.[0]?._source;
                 if(!hit) throw new Error("Processo não encontrado nos registros do tribunal informado.");
                 
                 const rawParties = getRawParties(hit);
                 const partyNames = getParties(hit);
                 
                 // Filtrar para garantir que o nome da classe ou assunto não entre como nome de parte
                 const cleanParties = partyNames.filter(name => 
                   name !== (hit.classe?.nome || "").toUpperCase() && 
                   !(hit.assuntos || []).some((a: any) => (a.nome || "").toUpperCase() === name)
                 );
                 
                 let finalClientId = clId;
                 if (!finalClientId) {
                   const matchedClient = clients.find(c => 
                     partyNames.some(pName => pName.includes(c.name.toUpperCase()) || c.name.toUpperCase().includes(pName))
                   );
                   if (matchedClient) finalClientId = matchedClient.id;
                 }

                 const movements = (hit.movimentos || [])
                   .map((m: any) => ({
                      dataHora: m.dataHora || new Date().toISOString(),
                      descricao: m.movimentoNacional?.nome || 
                                m.movimentoNacional?.descricao || 
                                m.movimentoLocal?.nome || 
                                m.movimentoLocal?.descricao || 
                                m.descricao || 
                                m.nome || 
                                m.texto || 
                                m.tipo || 
                                "Sem descrição",
                      complementos: (m.complementos || m.complemento || [])?.map((c: any) => c.nome ? `${c.nome}: ${c.valor}` : (c.descricao ? `${c.descricao}: ${c.valor}` : c.valor)).filter(Boolean) || []
                   }))
                   .sort((a: any, b: any) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());

                 const newProc: any = {
                   cnj: String(cnj || ""),
                   parties: cleanParties.slice(0, 5),
                   classe: String(hit.classe?.nome || "Classe não informada"),
                   clientName: String(
                     finalClientId ? (clients.find(c => c.id === finalClientId)?.name || "Cliente") :
                     "Não Identificado"
                   ),
                   lastUpdate: new Date().toISOString(),
                   movements,
                   status: String(hit.situacaoProcesso || "Ativo"),
                   court: String(hit.tribunal || "Tribunal"),
                   grau: String(hit.grau || ""),
                   officeId: userProfile.officeId || "",
                   sector: userProfile.sector || Sector.GENERAL,
                   userId: userProfile.id || "",
                   createdAt: new Date().toISOString(),
                 };

                 if (finalClientId) {
                   newProc.clientId = String(finalClientId);
                 }

                 // Clean undefined
                 Object.keys(newProc).forEach(k => { if(newProc[k] === undefined) delete newProc[k]; });

                 console.log("[Monitoring] Adding doc to Firestore:", newProc);
                 await addDoc(collection(db, "monitoredProcesses"), newProc);
                 alert(finalClientId ? "Processo adicionado e vinculado ao cliente!" : "Processo adicionado ao monitoramento!");
               } catch (err: any) {
                 console.error("[Monitoring] Full Error:", err);
                 alert("Erro ao cadastrar: " + (err.message || "Erro desconhecido"));
               } finally {
                 setIsSyncing(false);
               }
            }}
            onRemove={async (id) => {
              if(!window.confirm("Deseja realmente parar de monitorar e excluir este processo?")) return;
              try {
                await deleteDoc(doc(db, "monitoredProcesses", id));
                alert("Processo excluído com sucesso!");
              } catch (err: any) {
                console.error("[onRemove] Error removing doc:", err);
                alert("Erro ao excluir processo do monitoramento: " + (err.message || "Erro desconhecido"));
              }
            }}
            onRefresh={async (proc) => {
               setIsSyncing(true);
               try {
                 const res = await fetch('/api/datajud/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cnj: proc.cnj })
                  });
                  const data = await res.json();
                  const hit = data.hits?.hits?.[0]?._source;
                  if(!hit) return;

                  const rawParties = getRawParties(hit);
                  const partyNames = getParties(hit);

                  const cleanParties = partyNames.filter(name => 
                    name !== (hit.classe?.nome || "").toUpperCase() && 
                    !(hit.assuntos || []).some((a: any) => (a.nome || "").toUpperCase() === name)
                  );

                  const movements = (hit.movimentos || hit.movimentacao || []).map((m: any) => ({
                    dataHora: m.dataHora,
                    descricao: m.movimentoNacional?.nome || 
                               m.movimentoNacional?.descricao || 
                               m.movimentoLocal?.nome || 
                               m.movimentoLocal?.descricao || 
                               m.descricao || 
                               m.nome || 
                               m.texto || 
                               m.tipo || 
                               "Sem descrição",
                    complementos: (m.complementos || m.complemento || [])?.map((c: any) => c.nome ? `${c.nome}: ${c.valor}` : (c.descricao ? `${c.descricao}: ${c.valor}` : c.valor)).filter(Boolean) || []
                  })).sort((a: any, b: any) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());

                  await updateDoc(doc(db, "monitoredProcesses", proc.id), {
                    movements,
                    parties: cleanParties.slice(0, 5),
                    classe: String(hit.classe?.nome || ""),
                    grau: String(hit.grau || ""),
                    lastUpdate: new Date().toISOString(),
                    status: hit.situacaoProcesso || "Ativo"
                  });
               } catch (e) {
                  console.error(e);
               } finally {
                  setIsSyncing(false);
               }
            }}
            onUpdate={async (proc) => {
              try {
                const { id, ...data } = proc;
                await updateDoc(doc(db, "monitoredProcesses", id), data);
              } catch (e) {
                console.error("Error updating process:", e);
                alert("Erro ao atualizar processo.");
              }
            }}
            userProfile={userProfile}
            publications={publications}
            setUserProfile={setUserProfile}
            teamProfiles={teamProfiles}
          />
        )}

        {view === "reports" && (
          <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
            <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -translate-y-12 translate-x-12 opacity-50 group-hover:scale-110 transition-all"></div>
              
              <div className="flex items-center gap-4 mb-6 relative">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                  <Icons.Clock />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
                    Filtros do Relatório
                  </h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                    Personalize as opções abaixo para gerar e exportar relatórios de prazos
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                    Cliente
                  </label>
                  <select
                    className="w-full bg-slate-50/50 p-2.5 rounded-xl font-bold text-xs select-custom outline-none border border-slate-100 focus:border-slate-300 focus:ring-4 focus:ring-blue-50/50 transition-all cursor-pointer"
                    value={reportFilters.empresa || ""}
                    onChange={(e) =>
                      setReportFilters((p) => ({
                        ...p,
                        empresa: e.target.value,
                      }))
                    }
                  >
                    <option value="">Todos os Clientes</option>
                    {unifiedEmpresasOptions.map((emp) => (
                      <option key={emp} value={emp}>
                        {emp}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                    Responsável
                  </label>
                  <select
                    className="w-full bg-slate-50/50 p-2.5 rounded-xl font-bold text-xs select-custom outline-none border border-slate-100 focus:border-slate-300 focus:ring-4 focus:ring-blue-50/50 transition-all cursor-pointer"
                    value={reportFilters.responsavel || ""}
                    onChange={(e) =>
                      setReportFilters((p) => ({
                        ...p,
                        responsavel: e.target.value,
                      }))
                    }
                  >
                    <option value="">Todos os Advogados</option>
                    {dynamicSettings.responsaveis.map((resp) => (
                      <option key={resp} value={resp}>
                        {resp}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                    Início
                  </label>
                  <input
                    type="date"
                    className="w-full bg-slate-50/50 p-2.5 rounded-xl font-bold text-xs outline-none border border-slate-100 focus:border-slate-300 focus:ring-4 focus:ring-blue-50/50 transition-all"
                    value={reportFilters.dataInicio || ""}
                    onChange={(e) =>
                      setReportFilters((p) => ({
                        ...p,
                        dataInicio: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                    Fim
                  </label>
                  <input
                    type="date"
                    className="w-full bg-slate-50/50 p-2.5 rounded-xl font-bold text-xs outline-none border border-slate-100 focus:border-slate-300 focus:ring-4 focus:ring-blue-50/50 transition-all"
                    value={reportFilters.dataFim || ""}
                    onChange={(e) =>
                      setReportFilters((p) => ({
                        ...p,
                        dataFim: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                  <h3 className="text-xs md:text-sm font-black text-slate-900 uppercase tracking-wider">
                    Resultados ({filteredDeadlines.length})
                  </h3>
                </div>
                <div className="flex w-full sm:w-auto gap-2">
                  <button
                    onClick={handleExportCSV}
                    className="flex-1 sm:flex-none bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-[9px] md:text-[10px] uppercase shadow-md hover:bg-emerald-700 hover:-translate-y-0.5 transition-all"
                  >
                    Exportar CSV
                  </button>
                  <button
                    onClick={handleExportPDF}
                    className="flex-1 sm:flex-none bg-slate-800 text-white px-4 py-2 rounded-xl font-black text-[9px] md:text-[10px] uppercase shadow-md hover:bg-slate-900 hover:-translate-y-0.5 transition-all"
                  >
                    Exportar PDF
                  </button>
                </div>
              </div>
              <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100/60 custom-scrollbar pr-1">
                {filteredDeadlines.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 font-bold text-xs uppercase tracking-wider">
                    Nenhum resultado encontrado para os filtros selecionados
                  </div>
                ) : (
                  filteredDeadlines.map((d) => {
                     const isMyDeadline = d.assignedTo === userProfile?.id || (d.responsavel && userProfile?.name && d.responsavel.toLowerCase().trim() === userProfile.name.toLowerCase().trim());
                     let cardClasses = "p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center transition-colors gap-4 border border-transparent";
                     let statusText = d.status as string;
                     let statusLabelClasses = d.status === DeadlineStatus.COMPLETED 
                              ? "bg-emerald-100 text-emerald-700 border border-emerald-200" 
                              : "bg-amber-100 text-amber-700 border border-amber-200";

                     if (d.status !== DeadlineStatus.COMPLETED) {
                        cardClasses += " hover:bg-slate-50/40";
                        if (d.reviewState === ReviewState.WAITING_COORDINATOR || d.reviewState === ReviewState.REVIEWING_COORDINATOR || d.reviewState === ReviewState.VALIDATED_BY_ADMIN_WAITING_COORDINATOR) {
                           cardClasses += " bg-yellow-50/30 border-yellow-200";
                           statusText = "Em Coodenação";
                           statusLabelClasses = "bg-yellow-200 text-yellow-800 border-yellow-300";
                           if (d.reviewState !== ReviewState.REVIEWING_COORDINATOR && userProfile?.role === UserRole.COORDINATOR) {
                              cardClasses += " animate-pulse ring-2 ring-yellow-400 ring-offset-2";
                              statusText = "Coodenação (Pendente)";
                           }
                        } else if (d.reviewState === ReviewState.WAITING_ADMIN || d.reviewState === ReviewState.REVIEWING_ADMIN) {
                           cardClasses += " bg-orange-50/30 border-orange-200";
                           statusText = "Em Validação (Admin)";
                           statusLabelClasses = "bg-orange-200 text-orange-800 border-orange-300";
                           if (d.reviewState === ReviewState.WAITING_ADMIN && userProfile?.role === UserRole.ADMIN) {
                              cardClasses += " animate-pulse ring-2 ring-orange-500 ring-offset-2";
                              statusText = "Validação (Pendente)";
                           }
                        } else if (d.reviewState === ReviewState.RETURNED_TO_LAWYER) {
                           cardClasses += " bg-red-50/30 border-red-200";
                           statusText = "Devolvido p/ Ajustes";
                           statusLabelClasses = "bg-red-200 text-red-800 border-red-300";
                           if (userProfile?.role === UserRole.LAWYER && isMyDeadline) {
                              cardClasses += " animate-pulse ring-2 ring-red-400 ring-offset-2";
                           }
                        }
                     } else {
                        cardClasses += " border-emerald-50 hover:bg-emerald-50/20";
                     }

                     return (
                    <div
                      key={d.id}
                      onClick={() => {
                        setSelectedAppointment({
                           type: "deadline",
                           data: d,
                        });
                        setIsDetailsModalOpen(true);
                      }}
                      className={`${cardClasses} cursor-pointer rounded-xl`}
                    >
                      <div className="flex-1 sm:pr-8">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="text-[8px] font-black text-blue-600 bg-blue-50/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
                            {d.empresa}
                          </span>
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                            • ADV: {d.responsavel}
                          </span>
                          {d.assignedTo && (
                            <span className="text-[8px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md uppercase tracking-widest">
                              Atribuído a: {teamProfiles.find(t => t.id === d.assignedTo)?.name || 'Membro'}
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-slate-800 text-xs md:text-sm uppercase tracking-tight">
                          {d.peca}
                        </h4>
                      </div>
                      <div className="w-full sm:w-auto flex justify-between sm:justify-end items-center gap-6 border-t sm:border-t-0 pt-2 sm:pt-0 shrink-0">
                        <span
                          className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${statusLabelClasses}`}
                        >
                          {statusText}
                        </span>
                        <p className="font-black text-slate-950 text-xs md:text-sm tracking-tighter w-24 text-right font-mono">
                          {formatLocalDate(d.data)}
                        </p>
                      </div>
                    </div>
                  );
                 })
                )}
              </div>
            </div>
          </div>
        )}

        {view === "team" &&
          (userProfile?.role === UserRole.ADMIN ||
            userProfile?.role === UserRole.COORDINATOR) &&
          TeamManagement()}

        {view === "superadmin" && user?.email === "rudyendo@gmail.com" && (
          <SuperAdminPanel />
        )}

        {view === "timesheet" && (
          <TimesheetView
            timeLogs={timeLogs}
            activeTimers={activeTimers}
            userProfile={userProfile}
            onApprove={handleApproveTimeLog}
            onReject={handleRejectTimeLog}
            onEditDuration={handleEditTimeLogDuration}
            onDelete={handleDeleteTimeLog}
            onStartManual={() => setIsManualTimerModalOpen(true)}
            onRetroactiveEntry={() => setIsRetroactiveLogModalOpen(true)}
          />
        )}
        
        {view === "settings" && (
          <div className="space-y-6 md:space-y-8 animate-in fade-in duration-700 pb-10">
            {/* Backup e Restauração */}
            {userProfile?.role === UserRole.ADMIN && (
              <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden relative group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full -translate-y-12 translate-x-12 opacity-50 group-hover:scale-110 transition-all"></div>

                <div className="flex items-center gap-4 mb-6 relative">
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
                    <Icons.Sync />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
                      Segurança de Dados
                    </h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                      Backup e Restauração do Sistema
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:shadow-md hover:-translate-y-0.5">
                    <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                      Exportar Backup
                    </h4>
                    <p className="text-slate-500 text-[11px] leading-relaxed mb-4">
                      Baixe uma cópia completa de todos os seus prazos, tarefas e configurações em formato JSON.
                    </p>
                    <button
                      onClick={handleExportBackup}
                      className="w-full bg-slate-900 text-white p-3 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    >
                      Gerar Arquivo de Backup
                    </button>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:shadow-md hover:-translate-y-0.5">
                    <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      Restaurar Sistema
                    </h4>
                    <p className="text-slate-500 text-[11px] leading-relaxed mb-4">
                      Importe dados de um arquivo de backup anterior (.json).
                      Nota: Isso adicionará os registros ao banco de dados atual.
                    </p>
                    <label className="block w-full bg-blue-600 text-white p-3 rounded-xl font-black text-[9px] uppercase tracking-widest text-center cursor-pointer hover:bg-blue-700 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5">
                      Selecionar Arquivo
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleImportBackup}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
            
            {/* INFORMAÇÕES PESSOAIS */}
            <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden relative group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full -translate-y-12 translate-x-12 opacity-50 group-hover:scale-110 transition-all"></div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
                    <Icons.Users />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
                      Perfil Pessoal
                    </h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                      Como você aparece para sua equipe
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!isEditingPersonal ? (
                    <button
                      onClick={() => {
                        setTempPersonalName(userProfile?.name || "");
                        setTempPersonalOab(personalOab || "");
                        setTempPersonalUf(personalUf || "SP");
                        setIsEditingPersonal(true);
                      }}
                      className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-2"
                    >
                      <Icons.Edit className="w-3.5 h-3.5" /> Alterar
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={async () => {
                          if (!tempPersonalName.trim()) {
                            alert("O nome de exibição não pode ser vazio.");
                            return;
                          }
                          setIsSavingSettings(true);
                          try {
                            if (user) {
                              await updateDoc(doc(db, "userProfiles", user.uid), {
                                name: tempPersonalName.trim(),
                                oab: tempPersonalOab.trim(),
                                ufOab: tempPersonalUf,
                              });
                              setUserProfile(prev => prev ? {
                                ...prev,
                                name: tempPersonalName.trim(),
                                oab: tempPersonalOab.trim(),
                                ufOab: tempPersonalUf
                              } : null);
                              setPersonalOab(tempPersonalOab.trim());
                              setPersonalUf(tempPersonalUf);
                              setIsEditingPersonal(false);
                            }
                          } catch (err) {
                            console.error("Erro ao atualizar perfil:", err);
                            alert("Ocorreu um erro ao salvar o perfil.");
                          } finally {
                            setIsSavingSettings(false);
                          }
                        }}
                        disabled={isSavingSettings}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-2"
                      >
                        <Icons.Check className="w-3.5 h-3.5" /> Salvar
                      </button>
                      <button
                        onClick={() => setIsEditingPersonal(false)}
                        disabled={isSavingSettings}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Seu Nome de Exibição
                  </label>
                  <input 
                    type="text"
                    disabled={!isEditingPersonal}
                    className={`w-full p-3.5 rounded-xl font-bold outline-none focus:ring-4 focus:ring-emerald-100 transition-all placeholder:text-slate-300 ${!isEditingPersonal ? "bg-slate-100 border border-slate-100 text-slate-500 cursor-not-allowed" : "bg-slate-50 border border-slate-100 text-slate-900"}`}
                    placeholder="Ex: Rudy Endo"
                    value={isEditingPersonal ? tempPersonalName : (userProfile?.name || "")}
                    onChange={(e) => setTempPersonalName(e.target.value)}
                  />
                </div>

                <div className="space-y-1 opacity-50">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    E-mail (Não editável)
                  </label>
                  <input 
                    type="text"
                    disabled
                    className="w-full bg-slate-100 border border-slate-100 p-3.5 rounded-xl text-slate-400 font-bold cursor-not-allowed"
                    value={user?.email || ""}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Sua OAB Principal
                  </label>
                  <input 
                    type="text"
                    disabled={!isEditingPersonal}
                    className={`w-full p-3.5 rounded-xl font-bold outline-none focus:ring-4 focus:ring-emerald-100 transition-all placeholder:text-slate-300 ${!isEditingPersonal ? "bg-slate-100 border border-slate-100 text-slate-500 cursor-not-allowed" : "bg-slate-50 border border-slate-100 text-slate-900"}`}
                    placeholder="Ex: 12345"
                    value={isEditingPersonal ? tempPersonalOab : personalOab}
                    onChange={(e) => setTempPersonalOab(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Estado da OAB (UF)
                  </label>
                  <select
                    disabled={!isEditingPersonal}
                    className={`w-full p-3.5 rounded-xl font-bold outline-none focus:ring-4 focus:ring-emerald-100 transition-all cursor-pointer text-sm uppercase ${!isEditingPersonal ? "bg-slate-100 border border-slate-101 text-slate-500 cursor-not-allowed" : "bg-slate-50 border border-slate-100 text-slate-900"}`}
                    value={isEditingPersonal ? tempPersonalUf : personalUf}
                    onChange={(e) => setTempPersonalUf(e.target.value)}
                  >
                    {rawUfs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* IDENTIDADE DO ESCRITÓRIO */}
            {userProfile?.role === UserRole.ADMIN && (
              <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden relative group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -translate-y-12 translate-x-12 opacity-50 group-hover:scale-110 transition-all"></div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                      <Icons.Sparkles />
                    </div>
                    <div>
                      <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
                        Identidade Visual
                      </h3>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                        Personalize o nome e a logo do seu escritório
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!isEditingOfficeIdentity ? (
                      <button
                        onClick={() => {
                          setTempOfficeName(dynamicSettings.officeName || "");
                          setTempOfficeLogo(dynamicSettings.officeLogo || "");
                          setIsEditingOfficeIdentity(true);
                        }}
                        className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-2"
                      >
                        <Icons.Edit className="w-3.5 h-3.5" /> Alterar
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={async () => {
                            setIsSavingSettings(true);
                            try {
                              const updatedName = tempOfficeName.toUpperCase().trim();
                              await updateSettings({
                                officeName: updatedName,
                                officeLogo: tempOfficeLogo.trim(),
                              });
                              setDynamicSettings(prev => ({
                                  ...prev,
                                  officeName: updatedName,
                                  officeLogo: tempOfficeLogo.trim(),
                              }));
                              setIsEditingOfficeIdentity(false);
                            } catch (err) {
                              console.error("Erro ao salvar identidade visual:", err);
                              alert("Ocorreu um erro ao salvar as configurações.");
                            } finally {
                              setIsSavingSettings(false);
                            }
                          }}
                          disabled={isSavingSettings}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-2"
                        >
                          <Icons.Check className="w-3.5 h-3.5" /> Salvar
                        </button>
                        <button
                          onClick={() => setIsEditingOfficeIdentity(false)}
                          disabled={isSavingSettings}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Nome do Escritório
                      </label>
                      <input 
                        type="text"
                        disabled={!isEditingOfficeIdentity}
                        className={`w-full p-3.5 rounded-xl font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all placeholder:text-slate-300 ${!isEditingOfficeIdentity ? "bg-slate-100 border border-slate-100 text-slate-500 cursor-not-allowed" : "bg-slate-50 border border-slate-100 text-slate-900"}`}
                        placeholder="Ex: SILVA & ASSOCIADOS"
                        value={isEditingOfficeIdentity ? tempOfficeName : (dynamicSettings.officeName || "")}
                        onChange={(e) => setTempOfficeName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Logo do Escritório (URL da Imagem)
                      </label>
                      <input 
                        type="text"
                        disabled={!isEditingOfficeIdentity}
                        className={`w-full p-3.5 rounded-xl font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all placeholder:text-slate-300 ${!isEditingOfficeIdentity ? "bg-slate-100 border border-slate-100 text-slate-500 cursor-not-allowed" : "bg-slate-50 border border-slate-100 text-slate-900"}`}
                        placeholder="https://exemplo.com/sua-logo.png"
                        value={isEditingOfficeIdentity ? tempOfficeLogo : (dynamicSettings.officeLogo || "")}
                        onChange={(e) => setTempOfficeLogo(e.target.value)}
                      />
                      <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                        <p className="text-[8px] text-blue-700 font-medium leading-relaxed">
                          <span className="font-black uppercase tracking-tighter mr-1">Dica:</span>
                          Utilize links <span className="font-bold">PNG transparente</span>, JPG ou SVG. 
                          Tamanho ideal: <span className="font-bold">512x256 pixels (2:1)</span> retangular.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                      Pré-visualização
                    </p>
                    <div className="w-full max-w-[160px] aspect-[2/1] bg-white rounded-xl shadow-md flex items-center justify-center p-2 border border-slate-100 overflow-hidden">
                      {(isEditingOfficeIdentity ? tempOfficeLogo : dynamicSettings.officeLogo) ? (
                        <img 
                          src={isEditingOfficeIdentity ? tempOfficeLogo : dynamicSettings.officeLogo} 
                          alt="Preview Logo" 
                          className="max-h-full max-w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-slate-200">
                          <Icons.Image />
                          <span className="text-[8px] font-black uppercase tracking-tight">
                            Visualização Retangular
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO ESCRITÓRIO */}
            <section className="space-y-4">
              <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden relative group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -translate-y-12 translate-x-12 opacity-50 group-hover:scale-110 transition-all"></div>

                <div className="flex items-center gap-4 mb-6 relative">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                    <Icons.FileText />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
                      Configurações do Escritório
                    </h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                      Gerencie peças processuais cadastradas e tipos de documentos
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                    Tipos de Peças Processuais ({dynamicSettings.pecas.length})
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[350px] overflow-y-auto custom-scrollbar pr-2 pb-2">
                    {dynamicSettings.pecas.map((p, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center p-3 bg-slate-50 rounded-xl group border border-slate-100 hover:border-blue-200 hover:bg-white hover:shadow-sm transition-all"
                      >
                        <span className="font-bold text-slate-700 text-[10px] md:text-[11px] uppercase ml-1 truncate">
                          {p}
                        </span>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() =>
                              handleEditSetting(
                                i,
                                dynamicSettings.pecas,
                                "pecas",
                              )
                            }
                            className="w-7 h-7 flex items-center justify-center text-blue-500 bg-white rounded-lg shadow-sm border border-slate-100 hover:bg-blue-50 hover:border-blue-100 transition-all"
                          >
                            <Icons.Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteSetting(
                                i,
                                dynamicSettings.pecas,
                                "pecas",
                              )
                            }
                            className="w-7 h-7 flex items-center justify-center text-red-400 bg-white rounded-lg shadow-sm border border-slate-100 hover:bg-red-50 hover:border-red-100 transition-all"
                          >
                            <Icons.Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      disabled={isSavingSettings}
                      onClick={() => {
                        const n = prompt("Descrição:");
                        if (n && n.trim() !== "")
                          updateSettings("pecas", [
                            ...dynamicSettings.pecas,
                            n.toUpperCase(),
                          ]);
                      }}
                      className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center gap-2"
                    >
                      <Icons.Plus className="w-3.5 h-3.5" /> Adicionar Tipo de Peça
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* SEÇÃO NOTIFICAÇÕES E ALERTAS */}
            <section className="space-y-4">
              <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden relative group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full -translate-y-12 translate-x-12 opacity-50 group-hover:scale-110 transition-all"></div>

                <div className="flex items-center gap-4 mb-6 relative">
                  <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                    <Icons.Bell />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
                      Notificações e Alertas
                    </h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                      Gerencie as opções de alertas e as regras de prazos do sistema
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 relative">
                  <div className="xl:col-span-1 xl:border-r border-slate-100 xl:pr-6 space-y-4">
                    <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                      Configurações Gerais
                    </h4>
                    <div className="space-y-3">
                       <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl transition-all">
                        <div>
                          <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight">
                            Alertas no Browser
                          </p>
                          <p className="text-[8px] font-bold text-slate-400 mt-0.5">
                            Notificações Push
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            if (
                              !dynamicSettings.enableBrowserNotifications &&
                              "Notification" in window
                            ) {
                              Notification.requestPermission().then(
                                (permission) => {
                                  if (permission === "granted") {
                                    updateSettings(
                                      "enableBrowserNotifications",
                                      true,
                                    );
                                  } else {
                                    alert(
                                      "Permissão de notificação negada pelo navegador.",
                                    );
                                  }
                                },
                              );
                            } else {
                              updateSettings(
                                "enableBrowserNotifications",
                                !dynamicSettings.enableBrowserNotifications,
                              );
                            }
                          }}
                          className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${dynamicSettings.enableBrowserNotifications ? "bg-blue-600" : "bg-slate-200"}`}
                        >
                          <div
                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all transform ${dynamicSettings.enableBrowserNotifications ? "translate-x-4" : "translate-x-0"}`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl transition-all">
                        <div>
                          <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight">
                            Modo Silencioso
                          </p>
                          <p className="text-[8px] font-bold text-slate-400 mt-0.5">
                            Pausar alertas
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            updateSettings(
                              "quietMode",
                              !dynamicSettings.quietMode,
                            )
                          }
                          className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${dynamicSettings.quietMode ? "bg-blue-600" : "bg-slate-200"}`}
                        >
                          <div
                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all transform ${dynamicSettings.quietMode ? "translate-x-4" : "translate-x-0"}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="xl:col-span-3 space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                        Regras Personalizadas ({dynamicSettings.rules.length})
                      </h4>
                      <button
                        onClick={() => {
                          setEditingRuleIndex(null);
                          setNewRule({
                            deadlineType: "ALL",
                            priority: "MÉDIA",
                            leadTimeDays: 5,
                            channels: { email: true, push: false, inApp: true },
                          });
                          setIsRuleModalOpen(true);
                        }}
                        className="bg-blue-600 text-white px-3.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md flex items-center gap-1.5"
                      >
                        <Icons.Plus className="w-3 h-3" /> NOVA REGRA
                      </button>
                    </div>

                    {dynamicSettings.rules.length === 0 ? (
                      <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-300 mb-3">
                          <Icons.Bell className="w-5 h-5" />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Nenhuma regra de alerta definida
                        </p>
                        <p className="text-[9px] text-slate-400 mt-1">
                          Crie regras para receber notificações baseadas no tipo de prazo
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {dynamicSettings.rules.map((rule, idx) => (
                          <div
                            key={rule.id}
                            className="p-3 bg-slate-50 rounded-xl border border-transparent hover:border-blue-200 transition-all group relative flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex justify-between items-start mb-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${rule.priority === "ALTA" ? "bg-red-100 text-red-600" : rule.priority === "MÉDIA" ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"}`}
                                >
                                  {rule.priority}
                                </span>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                  <button
                                    onClick={() => {
                                      setEditingRuleIndex(idx);
                                      setNewRule(rule);
                                      setIsRuleModalOpen(true);
                                    }}
                                    className="w-6 h-6 rounded bg-white shadow-sm flex items-center justify-center text-blue-500 hover:bg-blue-50 transition-all"
                                  >
                                    <Icons.Edit className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRule(idx)}
                                    className="w-6 h-6 rounded bg-white shadow-sm flex items-center justify-center text-red-400 hover:bg-red-50 transition-all"
                                  >
                                    <Icons.Trash className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight mb-1">
                                {rule.deadlineType === "ALL"
                                  ? "Todos os Prazos"
                                  : rule.deadlineType}
                              </h4>
                              <div className="flex items-center gap-1.5 text-slate-500 mb-2">
                                <Icons.Clock className="w-3 h-3 text-slate-400" />
                                <span className="text-[8px] font-black uppercase tracking-wider">
                                  {rule.leadTimeDays} DIAS
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-1 pt-2 border-t border-slate-100/60 mt-2">
                              {rule.channels.email && (
                                <div
                                  className="w-4.5 h-4.5 rounded bg-white flex items-center justify-center text-slate-400 shadow-sm"
                                  title="E-mail"
                                >
                                  <Icons.Mail className="w-2.5 h-2.5" />
                                </div>
                              )}
                              {rule.channels.push && (
                                <div
                                  className="w-4.5 h-4.5 rounded bg-white flex items-center justify-center text-slate-400 shadow-sm"
                                  title="Browser Push"
                                >
                                  <Icons.Bell className="w-2.5 h-2.5" />
                                </div>
                              )}
                              {rule.channels.inApp && (
                                <div
                                  className="w-4.5 h-4.5 rounded bg-white flex items-center justify-center text-slate-400 shadow-sm"
                                  title="Notificação no Sistema"
                                >
                                  <Icons.Dashboard className="w-2.5 h-2.5" />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TIME TRACKING MODALS */}
        <Modal
          isOpen={isStopTimerModalOpen}
          onClose={() => setIsStopTimerModalOpen(false)}
          title="Salvar Registro de Tempo"
        >
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Tempo Contabilizado</p>
               <p className="text-3xl font-mono font-black text-blue-600">
                  {timerToStop ? `${Math.floor(stopTimerForm.durationSeconds / 3600).toString().padStart(2, "0")}:${Math.floor((stopTimerForm.durationSeconds % 3600) / 60).toString().padStart(2, "0")}:${Math.floor(stopTimerForm.durationSeconds % 60).toString().padStart(2, "0")}` : "00:00:00"}
               </p>
            </div>
            
            {(!timerToStop || timerToStop.deadlineId.startsWith("general")) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Cliente / Processo</label>
                    <input type="text" className="w-full bg-slate-50 p-3 rounded-xl border border-slate-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100" value={stopTimerForm.manualProcessTitle} onChange={e => setStopTimerForm({...stopTimerForm, manualProcessTitle: e.target.value})} placeholder="Ex: Cliente Silva" />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Tarefa Realizada</label>
                    <input type="text" className="w-full bg-slate-50 p-3 rounded-xl border border-slate-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100" value={stopTimerForm.manualPiece} onChange={e => setStopTimerForm({...stopTimerForm, manualPiece: e.target.value})} placeholder="Ex: Pesquisa de Jurisprudência" />
                 </div>
              </div>
            )}
            
            <div className="space-y-1">
               <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 flex justify-between">
                  <span>Descrição / Observações</span>
                  <span className="text-red-500 font-bold">* Obrigatório para devoluções</span>
               </label>
               <textarea 
                  className={`w-full bg-slate-50 p-3 min-h-[80px] rounded-xl border text-sm outline-none focus:ring-4 focus:ring-blue-100 ${stopTimerError ? 'border-red-500 ring-2 ring-red-100' : 'border-slate-100'}`} 
                  value={stopTimerForm.description} 
                  onChange={e => {
                     setStopTimerForm({...stopTimerForm, description: e.target.value});
                     setStopTimerError("");
                  }} 
                  placeholder="Escreva sua observação. Atenção: caso deseje Devolver o prazo, preencha obrigatoriamente a justificativa." 
               />
               {stopTimerError && (
                  <p className="text-[11px] font-black text-red-600 mt-1.5 flex items-center gap-1 bg-red-50 p-2.5 rounded-xl border border-red-200">
                     <span>⚠ Justificativa Obrigatória:</span> {stopTimerError}
                  </p>
               )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-wrap justify-end gap-3">
               {timerToStop && !timerToStop.deadlineId.startsWith("general") ? (
                  (() => {
                     const t = timerToStop;
                     const d = deadlines.find(dl => dl.id === t.deadlineId);
                     const currentReviewState = d?.reviewState ?? t.reviewState ?? ReviewState.NONE;
                     const isExecutor = currentReviewState === ReviewState.NONE || currentReviewState === ReviewState.RETURNED_TO_LAWYER;

                     return (
                        <>
                           <button onClick={() => {
                              setIsStopTimerModalOpen(false);
                              setActiveTimers(cur => cur.map(curT => curT.deadlineId === t.deadlineId ? {...curT, isPlaying: true, lastStartedAt: Date.now()} : curT));
                           }} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-amber-50 text-amber-600 hover:bg-amber-100 transition">Retomar</button>

                           {isExecutor ? (
                               <>
                                 <button onClick={() => handleSaveTimeLog('SUBMIT')} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition">
                                    {userProfile?.role === UserRole.ADMIN ? "Concluir" : "Enviar para Revisão"}
                                 </button>
                               </>
                           ) : (
                               <>
                                 {userProfile?.role === UserRole.COORDINATOR && (
                                    <>
                                       <button onClick={() => handleSaveTimeLog('RETURN')} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-red-100 text-red-600 hover:bg-red-200 transition">Devolver</button>
                                       <button onClick={() => handleSaveTimeLog('FORWARD')} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-amber-500 text-white hover:bg-amber-600 transition">Remeter para Validação</button>
                                       <button onClick={() => handleSaveTimeLog('COMPLETE')} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 transition">Concluir</button>
                                    </>
                                 )}

                                 {userProfile?.role === UserRole.ADMIN && (
                                    <>
                                       <button onClick={() => handleSaveTimeLog('RETURN')} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-red-100 text-red-600 hover:bg-red-200 transition">Devolver</button>
                                       <button onClick={() => handleSaveTimeLog('COMPLETE')} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 transition">Concluir</button>
                                    </>
                                 )}
                               </>
                           )}
                        </>
                     );
                  })()
               ) : (
                  <>
                     <button onClick={() => setIsStopTimerModalOpen(false)} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition">Cancelar</button>
                     <button onClick={() => handleSaveTimeLog()} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition">Confirmar e Submeter</button>
                  </>
               )}
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={isManualTimerModalOpen}
          onClose={() => setIsManualTimerModalOpen(false)}
          title="Iniciar Cronômetro Avulso"
        >
          <div className="space-y-4">
             <p className="text-xs text-slate-500 font-medium leading-relaxed">
               Inicie um cronômetro para uma tarefa que não está lista em seus prazos oficiais.
             </p>
             <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Cliente / Número do Processo</label>
                <input type="text" className="w-full bg-slate-50 p-3 rounded-xl border border-slate-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100" value={manualTimerForm.processTitle} onChange={e => setManualTimerForm({...manualTimerForm, processTitle: e.target.value})} placeholder="Pode ser nome ou CNJ" />
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Breve Descrição do Trabalho</label>
                   <input type="text" className="w-full bg-slate-50 p-3 rounded-xl border border-slate-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100" value={manualTimerForm.peca} onChange={e => setManualTimerForm({...manualTimerForm, peca: e.target.value})} placeholder="Ex: Análise de Documentos" />
                </div>
                <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Categoria de Atividade</label>
                   <select className="w-full bg-slate-50 p-3 rounded-xl border border-slate-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100" value={manualTimerForm.activityType} onChange={e => setManualTimerForm({...manualTimerForm, activityType: e.target.value})}>
                      <option value="Elaboração de Peça">Elaboração de Peça</option>
                      <option value="Pesquisa Jurídica">Pesquisa Jurídica</option>
                      <option value="Audiência">Audiência</option>
                      <option value="Reunião">Reunião</option>
                      <option value="Análise de Documento">Análise de Documento</option>
                      <option value="Diligência Externa">Diligência Externa</option>
                      <option value="Outros">Outros</option>
                   </select>
                </div>
             </div>
             
             <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setIsManualTimerModalOpen(false)} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition">Cancelar</button>
                <button onClick={handleStartManualTimer} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> INICIAR CRONÔMETRO
                </button>
             </div>
          </div>
        </Modal>

        <Modal
          isOpen={isRetroactiveLogModalOpen}
          onClose={() => setIsRetroactiveLogModalOpen(false)}
          title="Lançamento Retroativo de Horas"
        >
          <div className="space-y-4">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Cliente / Processo</label>
                   <input type="text" className="w-full bg-slate-50 p-3 rounded-xl border border-slate-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100" value={retroactiveLogForm.processTitle} onChange={e => setRetroactiveLogForm({...retroactiveLogForm, processTitle: e.target.value})} placeholder="Nome ou Documento" />
                </div>
                <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Data da Atividade</label>
                   <input type="date" className="w-full bg-slate-50 p-3 rounded-xl border border-slate-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100" value={retroactiveLogForm.date} onChange={e => setRetroactiveLogForm({...retroactiveLogForm, date: e.target.value})} />
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1 col-span-2">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Atividade Realizada</label>
                   <input type="text" className="w-full bg-slate-50 p-3 rounded-xl border border-slate-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100" value={retroactiveLogForm.peca} onChange={e => setRetroactiveLogForm({...retroactiveLogForm, peca: e.target.value})} placeholder="O que você fez?" />
                </div>
                <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Tempo Gasto (Minutos)</label>
                   <input type="number" min="1" className="w-full bg-slate-50 p-3 rounded-xl border border-slate-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100" value={retroactiveLogForm.durationMinutes} onChange={e => setRetroactiveLogForm({...retroactiveLogForm, durationMinutes: e.target.value})} placeholder="Ex: 120" />
                </div>
             </div>

             <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Categoria</label>
                <select className="w-full bg-slate-50 p-3 rounded-xl border border-slate-100 font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100" value={retroactiveLogForm.activityType} onChange={e => setRetroactiveLogForm({...retroactiveLogForm, activityType: e.target.value})}>
                   <option value="Elaboração de Peça">Elaboração de Peça</option>
                   <option value="Pesquisa Jurídica">Pesquisa Jurídica</option>
                   <option value="Audiência">Audiência</option>
                   <option value="Reunião">Reunião</option>
                   <option value="Análise de Documento">Análise de Documento</option>
                   <option value="Diligência Externa">Diligência Externa</option>
                   <option value="Outros">Outros</option>
                </select>
             </div>
             
             <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Observações (Opcional)</label>
                <textarea className="w-full bg-slate-50 p-3 min-h-[60px] rounded-xl border border-slate-100 text-sm outline-none focus:ring-4 focus:ring-blue-100" value={retroactiveLogForm.description} onChange={e => setRetroactiveLogForm({...retroactiveLogForm, description: e.target.value})} placeholder="Mais detalhes (Se necessário)..." />
             </div>

             <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setIsRetroactiveLogModalOpen(false)} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition">Cancelar</button>
                <button onClick={handleSaveRetroactiveTimeLog} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition">Lançar Horas</button>
             </div>
          </div>
        </Modal>

        <Modal
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedAppointment(null);
          }}
          title={
            selectedAppointment?.type === "deadline"
              ? "Detalhes do Prazo"
              : "Detalhes do Compromisso"
          }
        >
          {selectedAppointment && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
                <div
                  className={`p-3 rounded-2xl ${selectedAppointment.type === "deadline" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}
                >
                  {selectedAppointment.type === "deadline" ? (
                    <Icons.Clock className="w-5 h-5" />
                  ) : (
                    <Icons.Calendar className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                    {selectedAppointment.type === "deadline"
                      ? "Atividade Processual"
                      : "Atividade Administrativa"}
                  </p>
                  <h4 className="text-lg md:text-xl font-black text-slate-900 uppercase tracking-tight">
                    {selectedAppointment.type === "deadline"
                      ? (selectedAppointment.data as Deadline).peca
                      : (selectedAppointment.data as AdminTask).title}
                  </h4>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                      Informações Gerais
                    </p>
                    <div className="space-y-2.5">
                      {selectedAppointment.type === "deadline" && (
                        <>
                          <div className="flex justify-between items-center py-1.5 border-b border-white">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              Cliente
                            </span>
                            <span className="text-xs font-black text-slate-900">
                              {(selectedAppointment.data as Deadline).empresa}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1.5 border-b border-white">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              Responsável
                            </span>
                            <span className="text-xs font-black text-slate-900">
                              {
                                (selectedAppointment.data as Deadline)
                                  .responsavel
                              }
                            </span>
                          </div>
                          {(selectedAppointment.data as Deadline)
                            .instituicao && (
                            <div className="flex justify-between items-center py-1.5 border-b border-white">
                              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                Órgão
                              </span>
                              <span className="text-xs font-black text-slate-900">
                                {
                                  (selectedAppointment.data as Deadline)
                                    .instituicao
                                }
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      {selectedAppointment.type === "task" && (
                        <>
                          <div className="flex justify-between items-center py-1.5 border-b border-white">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              Categoria
                            </span>
                            <span className="text-xs font-black text-blue-600">
                              {(selectedAppointment.data as AdminTask).category}
                            </span>
                          </div>
                        </>
                      )}
                      {(selectedAppointment.data as AdminTask | Deadline).assignedTo && (
                        <div className="flex justify-between items-center py-1.5 border-b border-white">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                            Atribuído a
                          </span>
                          <span className="text-xs font-black text-blue-600">
                            {teamProfiles.find(t => t.id === (selectedAppointment.data as AdminTask | Deadline).assignedTo)?.name || 
                             (selectedAppointment.data.userId === user?.uid ? userProfile?.name || "Eu" : "Outro Usuário")}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center py-1.5 border-b border-white">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Data
                        </span>
                        <span className="text-xs font-black text-slate-900">
                          {formatLocalDate(
                            selectedAppointment.type === "deadline"
                              ? (selectedAppointment.data as Deadline).data
                              : (selectedAppointment.data as AdminTask).date,
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Horário
                        </span>
                        <span className="text-xs font-black text-slate-900">
                          {(selectedAppointment.type === "deadline"
                            ? (selectedAppointment.data as Deadline).hora
                            : (selectedAppointment.data as AdminTask).time) ||
                            "--:--"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col h-full">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">
                      Assunto / Descrição
                    </p>
                    <p className="text-[13px] font-medium text-slate-700 leading-relaxed italic border-l-4 border-slate-200 pl-3.5 py-1">
                      {selectedAppointment.type === "deadline"
                        ? (selectedAppointment.data as Deadline).assunto
                        : (selectedAppointment.data as AdminTask).description ||
                          "Nenhuma descrição fornecida."}
                    </p>

                    {selectedAppointment.type === "deadline" &&
                      (selectedAppointment.data as Deadline).documentUrl && (
                        <div className="mt-auto pt-4">
                          <a
                            href={
                              (selectedAppointment.data as Deadline).documentUrl
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2.5 bg-blue-600 text-white p-3.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg shadow-blue-500/10 hover:scale-[1.02] transition-all"
                          >
                            <Icons.ExternalLink className="w-4 h-4" /> ACESSAR DOCUMENTO
                          </a>
                        </div>
                      )}
                  </div>
                </div>
              </div>

              {selectedAppointment.type === "deadline" && (selectedAppointment.data as Deadline).reviewLogs && (selectedAppointment.data as Deadline).reviewLogs!.length > 0 && (
                <div className="pt-4 border-t border-slate-100">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                      Histórico de Atividades & Revisões
                   </p>
                   <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                      {((selectedAppointment.data as Deadline).reviewLogs || []).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).map((log, idx) => (
                         <div key={idx} className="flex flex-col gap-1 border-b border-slate-200/50 pb-3 last:border-0 last:pb-0">
                            <div className="flex justify-between items-start">
                               <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-black text-slate-800">{log.userName}</span>
                                  <span className="text-[8px] font-extrabold uppercase text-white bg-slate-800 px-1.5 py-0.5 rounded">{log.userRole}</span>
                               </div>
                               <span className="text-[9px] font-bold text-slate-400">{new Date(log.timestamp).toLocaleString("pt-BR")}</span>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-0.5">
                               {log.action === 'TIMER_SESSION' && <span className="text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Sessão Registrada</span>}
                               {log.action === 'SUBMITTED_FOR_REVIEW' && <span className="text-[9px] font-black uppercase tracking-widest text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">Enviado p/ Revisão</span>}
                               {log.action === 'RETURNED' && <span className="text-[9px] font-black uppercase tracking-widest text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Devolvido</span>}
                               {log.action === 'SENT_TO_ADMIN' && <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Remetido Validação</span>}
                               {log.action === 'ADMIN_APPROVED' && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Aprovado pelo Admin</span>}
                               {log.action === 'COMPLETED' && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Concluído Definitivo</span>}
                               
                               {typeof log.durationSeconds !== 'undefined' && log.durationSeconds > 0 && (
                                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                                     <Icons.Clock className="w-2.5 h-2.5 inline mr-1" />
                                     {Math.floor(log.durationSeconds / 3600).toString().padStart(2, "0")}:{Math.floor((log.durationSeconds % 3600) / 60).toString().padStart(2, "0")}:{Math.floor(log.durationSeconds % 60).toString().padStart(2, "0")}
                                  </span>
                               )}
                            </div>
                            
                            {log.observation && (
                               <p className="text-[11px] font-medium text-slate-600 italic bg-white p-2 rounded-xl border border-slate-100 mt-1">
                                  {log.observation}
                               </p>
                            )}
                         </div>
                      ))}
                   </div>
                </div>
              )}

              {selectedAppointment.type === "deadline" && (
                <div className="pt-4 border-t border-slate-100">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                      Cronômetro de Atividade
                   </p>
                   {(() => {
                      const d = selectedAppointment.data as Deadline;
                      const activeTimer = activeTimers.find(t => t.deadlineId === d.id);
                      const isPlaying = activeTimer?.isPlaying || false;
                      const elapsed = activeTimer?.elapsedSeconds || 0;
                      // Display dynamic elapsed time if playing
                      let displayElapsed = elapsed;
                      if (isPlaying && activeTimer?.lastStartedAt) {
                         // We use the ticker to re-evaluate this block every second
                         displayElapsed += (Date.now() - activeTimer.lastStartedAt) / 1000;
                      }
                      
                      const hrs = Math.floor(displayElapsed / 3600);
                      const mins = Math.floor((displayElapsed % 3600) / 60);
                      const secs = Math.floor(displayElapsed % 60);
                      const timeString = `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

                      return (
                        <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                          <div className="flex-1 flex items-center justify-center gap-3">
                            <span className="font-mono text-2xl font-black text-slate-800 tracking-wider">
                               {timeString}
                            </span>
                            {isPlaying && (
                               <div className="flex items-center gap-1.5">
                                 <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                 <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider">Em andamento</span>
                               </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                             {!isPlaying ? (
                               <button 
                                 onClick={() => handleStartTimerForDeadline(d)}
                                 className="w-12 h-12 flex items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition"
                                 title="Iniciar / Retomar Cronômetro"
                               >
                                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                               </button>
                             ) : (
                               <button 
                                 onClick={() => handlePauseTimer(d.id)}
                                 className="w-12 h-12 flex items-center justify-center rounded-xl bg-amber-500 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition"
                                 title="Pausar Cronômetro"
                               >
                                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>
                               </button>
                             )}
                             <button 
                               onClick={() => {
                                 handleStopTimer(d.id);
                                 setIsDetailsModalOpen(false); // Fechar detalhes ao ir para o modal de salvar
                               }}
                               disabled={!activeTimer}
                               className={`w-12 h-12 flex items-center justify-center rounded-xl transition ${activeTimer ? "bg-red-50 text-red-600 border border-red-100 hover:bg-red-600 hover:text-white" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}
                               title="Parar e Salvar Registro"
                             >
                               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg>
                             </button>
                          </div>
                        </div>
                      );
                   })()}
                </div>
              )}

              {(() => {
                 const isDeadline = selectedAppointment.type === "deadline";
                 if (isDeadline && userProfile) {
                    const d = selectedAppointment.data as Deadline;
                    const inCoordReview = d.reviewState === ReviewState.WAITING_COORDINATOR || d.reviewState === ReviewState.REVIEWING_COORDINATOR || d.reviewState === ReviewState.VALIDATED_BY_ADMIN_WAITING_COORDINATOR;
                    const inAdminReview = d.reviewState === ReviewState.WAITING_ADMIN || d.reviewState === ReviewState.REVIEWING_ADMIN;
                    const activeTimer = activeTimers.find(t => t.deadlineId === d.id);
                    
                    if (!activeTimer && ((userProfile.role === UserRole.COORDINATOR && inCoordReview) || (userProfile.role === UserRole.ADMIN && inAdminReview))) {
                       return (
                          <div className="space-y-1.5 bg-slate-50 border border-slate-100 p-3.5 rounded-2xl mb-4 w-full">
                             <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex justify-between">
                               <span>Justificativa / Observação de Revisão</span>
                               <span className="text-red-500 font-bold">* Obrigatório para devolver</span>
                             </label>
                             <textarea
                                className={`w-full bg-white p-3 min-h-[60px] rounded-xl border text-sm outline-none focus:ring-4 focus:ring-blue-100 placeholder-slate-400 font-medium ${detailsReviewError ? 'border-red-500 ring-2 ring-red-100' : 'border-slate-200'}`}
                                value={detailsReviewObservation}
                                onChange={e => {
                                   setDetailsReviewObservation(e.target.value);
                                   setDetailsReviewError("");
                                }}
                                placeholder="Descreva aqui o motivo para devolver ou observações para o histórico..."
                             />
                             {detailsReviewError && (
                                <p className="text-[10px] font-bold text-red-500 mt-1 flex items-center gap-1">
                                   <span>⚠</span> {detailsReviewError}
                                </p>
                             )}
                          </div>
                       );
                    }
                 }
                 return null;
              })()}

              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row flex-wrap gap-3">
                 {(() => {
                    const isDeadline = selectedAppointment.type === "deadline";
                    const d = selectedAppointment.data as Deadline;
                    
                    if (isDeadline && userProfile) {
                       const inCoordReview = d.reviewState === ReviewState.WAITING_COORDINATOR || d.reviewState === ReviewState.REVIEWING_COORDINATOR || d.reviewState === ReviewState.VALIDATED_BY_ADMIN_WAITING_COORDINATOR;
                       const inAdminReview = d.reviewState === ReviewState.WAITING_ADMIN || d.reviewState === ReviewState.REVIEWING_ADMIN;
                       
                       const activeTimer = activeTimers.find(t => t.deadlineId === d.id);
                       
                       if (!activeTimer) {
                          if (userProfile.role === UserRole.COORDINATOR && inCoordReview) {
                             return (
                               <>
                                 <button onClick={() => {
                                    handleDirectReviewAction(d, 'RETURN');
                                 }} className="flex-1 flex items-center justify-center gap-2.5 bg-red-100 text-red-600 p-3.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-red-200 transition-all shadow-sm">
                                   DEVOLVER
                                 </button>
                                 <button onClick={() => {
                                    handleDirectReviewAction(d, 'FORWARD');
                                 }} className="flex-1 flex items-center justify-center gap-2.5 bg-amber-500 text-white p-3.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-amber-600 transition-all shadow-sm">
                                   REMETER VALIDAÇÃO
                                 </button>
                                 <button onClick={() => {
                                    handleDirectReviewAction(d, 'COMPLETE');
                                 }} className="flex-1 flex items-center justify-center gap-2.5 bg-emerald-600 text-white p-3.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm">
                                   ENCERRAR
                                 </button>
                               </>
                             );
                          }
                          
                          if (userProfile.role === UserRole.ADMIN && inAdminReview) {
                             return (
                               <>
                                 <button onClick={() => {
                                     handleDirectReviewAction(d, 'RETURN');
                                 }} className="flex-1 flex items-center justify-center gap-2.5 bg-red-100 text-red-600 p-3.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-red-200 transition-all shadow-sm">
                                   DEVOLVER
                                 </button>
                                 <button onClick={() => {
                                     handleDirectReviewAction(d, 'COMPLETE');
                                 }} className="flex-1 flex items-center justify-center gap-2.5 bg-emerald-600 text-white p-3.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm">
                                   CONCLUIR VALIDAÇÃO
                                 </button>
                               </>
                             )
                          }
                       }
                    }

                    return (
                       <>
                          <button
                            onClick={() => {
                              if (isDeadline)
                                handleEditClick(selectedAppointment.data as Deadline);
                              else
                                handleEditAdminTaskClick(
                                  selectedAppointment.data as AdminTask,
                                );
                              setIsDetailsModalOpen(false);
                            }}
                            className="flex-1 flex items-center justify-center gap-2.5 bg-slate-900 text-white p-3.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-sm"
                          >
                            <Icons.Edit className="w-4 h-4" /> EDITAR
                          </button>
                          <button
                            onClick={() => {
                              if (isDeadline)
                                deleteDeadline((selectedAppointment.data as Deadline).id);
                              else
                                deleteAdminTask(
                                  (selectedAppointment.data as AdminTask).id,
                                );
                              setIsDetailsModalOpen(false);
                              setSelectedAppointment(null);
                            }}
                            className="flex-1 flex items-center justify-center gap-2.5 bg-white text-red-600 border border-red-100 p-3.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm"
                          >
                            <Icons.Trash className="w-4 h-4" /> EXCLUIR
                          </button>
                          {isDeadline && userProfile?.role === UserRole.ADMIN && (selectedAppointment.data as Deadline).status !== DeadlineStatus.COMPLETED && (
                              <button onClick={() => {
                                  handleDirectReviewAction(selectedAppointment.data as Deadline, 'COMPLETE');
                              }} className="flex-1 flex items-center justify-center gap-2.5 bg-emerald-600 text-white p-3.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm">
                                CONCLUIR PRAZO
                              </button>
                          )}
                       </>
                    )
                 })()}
                
                <button
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    setSelectedAppointment(null);
                  }}
                  className="px-6 p-3.5 rounded-xl font-black text-[9px] text-slate-400 uppercase tracking-widest bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-all"
                >
                  FECHAR
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* MODAL PARA GESTÃO DE PROCESSOS DO CLIENTE */}
        <Modal
          isOpen={isProcessModalOpen}
          onClose={() => {
            setIsProcessModalOpen(false);
            setActiveClientForProcesses(null);
            setActiveProcessForNotes(null);
          }}
          title={`Processos de ${activeClientForProcesses?.displayName}`}
        >
          <div className="space-y-4">
            {/* Formulário de Novo Processo */}
            <div className="p-4 md:p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
              <div className="p-3.5 md:p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-2">
                  Busca Automática Datajud
                </p>
                <div className="flex gap-2.5">
                  <input
                    type="text"
                    placeholder="Número do Processo (Ex: 0011222-33.2023.8.09.0000)"
                    className="flex-1 bg-white p-3 rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-200 border border-slate-100 uppercase"
                    value={newProcess.number || ""}
                    onChange={(e) =>
                      setNewProcess((p) => ({ ...p, number: e.target.value }))
                    }
                  />
                  <button
                    onClick={handleFetchDatajud}
                    disabled={isFetchingDatajud || !newProcess.number.trim()}
                    className="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-blue-500/10 hover:scale-[1.03] active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isFetchingDatajud ? "..." : "BUSCAR"}
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 p-3.5 bg-white rounded-2xl border border-slate-100">
                <div className="space-y-0.5">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1.5">
                    Título/Classe
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Cobrança, Indenizatória... (ou busque no Datajud)"
                    className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm border border-slate-200 outline-none focus:ring-4 focus:ring-blue-100 uppercase"
                    value={newProcess.title || ""}
                    onChange={(e) =>
                      setNewProcess((p) => ({ ...p, title: e.target.value }))
                    }
                  />
                </div>
              </div>

              <button
                onClick={handleAddProcess}
                disabled={isSyncing || isFetchingDatajud || !newProcess.number.trim()}
                className="w-full bg-blue-600 text-white p-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/10 hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSyncing ? "SALVANDO..." : "CADASTRAR PROCESSO"}
              </button>
            </div>

            {/* Listagem de Processos */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight ml-1">
                Processos Vinculados
              </h4>
              {activeClientProcesses.length === 0 ? (
                <div className="p-6 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                  <p className="text-slate-400 font-bold text-[9px] uppercase tracking-widest">
                    Nenhum cadastrado
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeClientProcesses.map((proc) => (
                    <div
                      key={proc.id}
                      className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden transition-all hover:shadow-md"
                    >
                      <div className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-slate-50/50">
                        <div className="flex-1">
                          <p className="font-black text-blue-600 text-sm md:text-base tracking-tight uppercase">
                            {proc.cnj || (proc as any).number}
                          </p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            {proc.classe || (proc as any).title || "Sem Título"}
                          </p>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                          <button
                            onClick={() =>
                              setActiveProcessForNotes(
                                activeProcessForNotes === proc.id
                                  ? null
                                  : proc.id,
                              )
                            }
                            className={`flex-1 md:flex-none px-4 py-2 rounded-lg font-black text-[8px] uppercase tracking-widest transition-all ${activeProcessForNotes === proc.id ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-blue-600 hover:bg-blue-50"}`}
                          >
                            {activeProcessForNotes === proc.id
                              ? "FECHAR NOTAS"
                              : `NOTAS (${(proc.notes || []).length})`}
                          </button>
                          <button
                            onClick={() => handleDeleteProcess(proc.id)}
                            className="p-2.5 bg-white border border-slate-200 text-red-500 rounded-xl hover:bg-red-50 transition-all shadow-sm"
                          >
                            <Icons.Trash />
                          </button>
                        </div>
                      </div>

                      {activeProcessForNotes === proc.id && (
                        <div className="p-4 md:p-5 bg-white border-t border-slate-100 animate-in slide-in-from-top-2 duration-200">
                          <div className="flex flex-col gap-3">
                            <div className="flex gap-2.5">
                              <input
                                type="text"
                                placeholder="Nova anotação..."
                                className="flex-1 bg-slate-50 p-3.5 rounded-xl font-medium text-sm outline-none border border-transparent focus:ring-4 focus:ring-blue-100 focus:bg-white transition-all"
                                value={newNoteText || ""}
                                onChange={(e) => setNewNoteText(e.target.value)}
                                onKeyDown={(e) =>
                                  e.key === "Enter" && handleAddNote(proc.id)
                                }
                              />
                              <button
                                onClick={() => handleAddNote(proc.id)}
                                disabled={!newNoteText.trim()}
                                className="bg-slate-900 text-white px-5 rounded-xl font-black text-[9px] uppercase shadow-lg hover:bg-blue-600 transition-all disabled:opacity-30"
                              >
                                ADD
                              </button>
                            </div>

                            <div className="space-y-2.5 mt-2.5">
                              {(proc.notes || []).length === 0 ? (
                                <p className="text-center py-4 text-slate-300 font-bold text-[8px] uppercase tracking-[0.2em]">
                                  Sem anotações
                                </p>
                              ) : (
                                (proc.notes || []).map((note) => (
                                  <div
                                    key={note.id}
                                    className="p-3.5 bg-slate-50 rounded-xl flex justify-between items-start group border border-transparent hover:border-slate-200 transition-all"
                                  >
                                    <div className="flex-1 pr-4">
                                      <p className="text-slate-700 text-[13px] font-medium leading-relaxed">
                                        {note.text}
                                      </p>
                                      <p className="text-[7px] font-black text-slate-400 uppercase mt-1.5 tracking-widest">
                                        {new Date(
                                          note.createdAt,
                                        ).toLocaleString("pt-BR")}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() =>
                                        handleDeleteNote(proc.id, note.id)
                                      }
                                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 transition-all"
                                    >
                                      <Icons.Trash className="w-4 h-4" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>

        {/* MODAL PARA AGENDA ADMINISTRATIVA */}
        <Modal
          isOpen={isAgendaModalOpen}
          onClose={() => {
            setIsAgendaModalOpen(false);
            resetAdminTaskForm();
          }}
          title={
            editingAdminTaskId
              ? "Editar Agendamento"
              : "Novo Agendamento Administrativo"
          }
        >
          <form onSubmit={handleAddAdminTask} className="space-y-3.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                  Categoria
                </label>
                <select
                  className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm border border-slate-100 focus:ring-4 focus:ring-blue-100 outline-none"
                  value={newAdminTask.category || ""}
                  onChange={(e) =>
                    setNewAdminTask((p) => ({
                      ...p,
                      category: e.target.value as AdminTaskCategory,
                    }))
                  }
                >
                  {Object.values(AdminTaskCategory).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                  Título / Assunto
                </label>
                <input
                  type="text"
                  required
                  className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm border border-slate-100 focus:ring-4 focus:ring-blue-100 outline-none"
                  value={newAdminTask.title || ""}
                  onChange={(e) =>
                    setNewAdminTask((p) => ({ ...p, title: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                Descrição (Opcional)
              </label>
              <textarea
                className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm border border-slate-100 focus:ring-4 focus:ring-blue-100 outline-none min-h-[80px]"
                value={newAdminTask.description || ""}
                onChange={(e) =>
                  setNewAdminTask((p) => ({
                    ...p,
                    description: e.target.value,
                  }))
                }
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                  Data
                </label>
                <input
                  type="date"
                  required
                  className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm border border-slate-100 focus:ring-4 focus:ring-blue-100 outline-none"
                  value={newAdminTask.date || ""}
                  onChange={(e) =>
                    setNewAdminTask((p) => ({ ...p, date: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                  Hora (Opcional)
                </label>
                <input
                  type="time"
                  className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm border border-slate-100 focus:ring-4 focus:ring-blue-100 outline-none"
                  value={newAdminTask.time || ""}
                  onChange={(e) =>
                    setNewAdminTask((p) => ({ ...p, time: e.target.value }))
                  }
                />
              </div>
              {(userProfile?.role === UserRole.ADMIN || userProfile?.role === UserRole.COORDINATOR) && (
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                    Setor
                  </label>
                  <select
                    className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm border border-slate-100 focus:ring-4 focus:ring-blue-100 outline-none"
                    value={newAdminTask.sector || ""}
                    onChange={(e) =>
                      setNewAdminTask((p) => ({ ...p, sector: e.target.value as Sector }))
                    }
                  >
                    {Object.values(Sector).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {(userProfile?.role === UserRole.ADMIN || userProfile?.role === UserRole.COORDINATOR) && (
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                  Responsável pela Tarefa
                </label>
                <select
                  className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm focus:ring-4 focus:ring-blue-100 outline-none"
                  value={newAdminTask.assignedTo || ""}
                  onChange={(e) =>
                    setNewAdminTask((p) => ({ ...p, assignedTo: e.target.value }))
                  }
                >
                  <option value="">
                    {userProfile ? `${userProfile.name || 'Sem Nome'} (${userProfile.role} - ${userProfile.sector}) (Eu)` : "Eu (Eu)"}
                  </option>
                  {teamProfiles
                    .filter((m) => m.id !== user?.uid)
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name || "Sem Nome"} ({member.role} - {member.sector})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {!editingAdminTaskId && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">Tarefa Recorrente</h4>
                    <p className="text-[10px] text-slate-400">Repetir esta tarefa automaticamente</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(newAdminTask.isRecurring)}
                      onChange={(e) => setNewAdminTask(p => ({ ...p, isRecurring: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {newAdminTask.isRecurring && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/50">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Frequência
                      </label>
                      <select
                        className="w-full bg-white p-2.5 rounded-lg font-bold text-xs border border-slate-100 focus:ring-4 focus:ring-blue-100 outline-none"
                        value={newAdminTask.recurrenceType || "DAILY"}
                        onChange={(e) => setNewAdminTask(p => ({ ...p, recurrenceType: e.target.value as any }))}
                      >
                        <option value="DAILY">Diariamente</option>
                        <option value="WEEKLY">Semanalmente</option>
                        <option value="MONTHLY">Mensalmente</option>
                        <option value="ANNUALLY">Anualmente</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Data Limite
                      </label>
                      <input
                        type="date"
                        required={Boolean(newAdminTask.isRecurring)}
                        min={newAdminTask.date || ""}
                        className="w-full bg-white p-2.5 rounded-lg font-bold text-xs border border-slate-100 focus:ring-4 focus:ring-blue-100 outline-none"
                        value={newAdminTask.recurrenceEndDate || ""}
                        onChange={(e) => setNewAdminTask(p => ({ ...p, recurrenceEndDate: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Alertas (Selecione até 2)
                </label>
                <span className="text-[8px] font-bold text-slate-400 uppercase">
                  {newAdminTask.alerts?.length || 0}/2
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: "24H", label: "24H ANTES" },
                  { value: "2H", label: "2H ANTES" },
                  { value: "1H", label: "1H ANTES" },
                  { value: "ON_TIME", label: "NA HORA" },
                ].map((opt) => {
                  const isSelected = newAdminTask.alerts?.includes(
                    opt.value as AdminTaskAlert,
                  );
                  const isMax =
                    !isSelected && (newAdminTask.alerts?.length || 0) >= 2;

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isMax}
                      onClick={() => {
                        const current = newAdminTask.alerts || [];
                        if (isSelected) {
                          setNewAdminTask((p) => ({
                            ...p,
                            alerts: current.filter((a) => a !== opt.value),
                          }));
                        } else {
                          setNewAdminTask((p) => ({
                            ...p,
                            alerts: [...current, opt.value as AdminTaskAlert],
                          }));
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-[8px] font-black uppercase transition-all flex flex-col items-center gap-1 ${isSelected ? "bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm" : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-white hover:border-slate-300"} ${isMax ? "opacity-30 cursor-not-allowed" : ""}`}
                    >
                      <Icons.Bell className="w-3.5 h-3.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white p-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] transition-all"
            >
              {editingAdminTaskId
                ? "ATUALIZAR AGENDAMENTO"
                : "SALVAR NA AGENDA"}
            </button>
          </form>
        </Modal>

        {/* MODAL PARA VISUALIZAR DADOS COMPLETOS DO CLIENTE */}
        <Modal
          isOpen={isClientDetailsModalOpen}
          onClose={() => {
            setIsClientDetailsModalOpen(false);
            setSelectedClientForDetails(null);
          }}
          title={`Dados Completos: ${selectedClientForDetails?.displayName}`}
        >
          {selectedClientForDetails && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Informações Cadastrais */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Informações Principais
                  </p>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Nome / Razão Social
                    </label>
                    <p className="font-bold text-slate-900 text-sm">
                      {selectedClientForDetails.name}
                    </p>
                  </div>
                  {selectedClientForDetails.tradeName && (
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Nome Fantasia
                      </label>
                      <p className="font-bold text-slate-900 text-sm">
                        {selectedClientForDetails.tradeName}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      {selectedClientForDetails.type === "PJ" ? "CNPJ" : "CPF"}
                    </label>
                    <p className="font-bold text-slate-900 text-sm">
                      {selectedClientForDetails.document}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Localização e Contato
                  </p>
                  {selectedClientForDetails.address && (
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Endereço
                      </label>
                      <p className="font-bold text-slate-900 text-xs leading-relaxed">
                        {selectedClientForDetails.address}
                      </p>
                    </div>
                  )}
                  {selectedClientForDetails.adminName && (
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Sócio-Administrador
                      </label>
                      <p className="font-bold text-blue-600 text-sm">
                        {selectedClientForDetails.adminName}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {selectedClientForDetails.email && (
                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          E-mail
                        </label>
                        <p className="font-bold text-slate-900 text-[11px] truncate">
                          {selectedClientForDetails.email}
                        </p>
                      </div>
                    )}
                    {selectedClientForDetails.phone && (
                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Telefone
                        </label>
                        <p className="font-bold text-slate-900 text-[11px]">
                          {selectedClientForDetails.phone}
                        </p>
                      </div>
                    )}
                  </div>
                  {selectedClientForDetails.driveUrl && (
                    <div>
                      <label className="text-[8px] font-black text-slate-500 uppercase">
                        Google Drive
                      </label>
                      <a
                        href={selectedClientForDetails.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-blue-600 font-bold text-[11px] hover:underline mt-0.5"
                      >
                        <Icons.ExternalLink className="w-3.5 h-3.5" /> ACESSAR PASTA
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Processos Vinculados */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                    Processos Cadastrados
                  </h4>
                  <span className="bg-slate-900 text-white px-3 py-0.5 rounded-full text-[9px] font-black">
                    {selectedClientProcesses.length} ATIVOS
                  </span>
                </div>

                {selectedClientProcesses.length === 0 ? (
                  <div className="p-6 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                    <p className="text-slate-400 font-bold text-[9px] uppercase tracking-widest">
                      Nenhum vinculado
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {selectedClientProcesses.map((proc) => (
                      <div
                        key={proc.id}
                        className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-black text-blue-600 text-base md:text-lg tracking-tight uppercase">
                              {proc.cnj || (proc as any).number}
                            </p>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              {proc.classe || (proc as any).title || "Sem Título"}
                            </p>
                          </div>
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">
                            CAD: {new Date(proc.createdAt).toLocaleDateString(
                              "pt-BR",
                            )}
                          </span>
                        </div>

                        {proc.notes && proc.notes.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-50 space-y-2">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
                              Últimas Anotações
                            </p>
                            {proc.notes.slice(0, 2).map((note) => (
                              <div
                                key={note.id}
                                className="bg-slate-50 p-2.5 rounded-xl transition-all"
                              >
                                <p className="text-[11px] text-slate-700 font-medium">
                                  {note.text}
                                </p>
                                <p className="text-[7px] font-bold text-slate-400 mt-1">
                                  {new Date(note.createdAt).toLocaleDateString(
                                    "pt-BR",
                                  )}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* MODAL PARA CADASTRO/EDIÇÃO DE CLIENTE (HÍBRIDO PF/PJ) */}
        <Modal
          isOpen={isClientModalOpen}
          onClose={() => {
            setIsClientModalOpen(false);
            setEditingClientId(null);
            setClientForm({
              name: "",
              document: "",
              driveUrl: "",
              tradeName: "",
              address: "",
              adminName: "",
              email: "",
              phone: "",
            });
          }}
          title={
            editingClientId ? "Atualizar Cliente" : "Cadastrar Novo Cliente"
          }
        >
          <div className="space-y-4">
            <div className="flex p-1 bg-slate-100 rounded-2xl">
              <button
                onClick={() => {
                  setClientType("PJ");
                  setClientForm((p) => ({ ...p }));
                }}
                className={`flex-1 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${clientType === "PJ" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"}`}
              >
                Pessoa Jurídica
              </button>
              <button
                onClick={() => {
                  setClientType("PF");
                  setClientForm((p) => ({
                    ...p,
                    tradeName: "",
                    address: "",
                    adminName: "",
                    email: "",
                    phone: "",
                  }));
                }}
                className={`flex-1 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${clientType === "PF" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400"}`}
              >
                Pessoa Física
              </button>
            </div>

            {clientType === "PJ" ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="p-3.5 md:p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-2">
                    Busca Automática Receita
                  </p>
                  <div className="flex gap-2.5">
                    <input
                      type="text"
                      placeholder="CNPJ (apenas números)"
                      className="flex-1 bg-white p-3 rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-200 border border-slate-100"
                      value={clientForm.document || ""}
                      onChange={(e) =>
                        setClientForm((p) => ({
                          ...p,
                          document: e.target.value,
                        }))
                      }
                    />
                    <button
                      onClick={handleFetchCNPJ}
                      disabled={
                        isFetchingCNPJ ||
                        (clientForm.document || "").replace(/\D/g, "")
                          .length !== 14
                      }
                      className="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-blue-500/10 hover:scale-105 transition-all disabled:opacity-50"
                    >
                      {isFetchingCNPJ ? "..." : "BUSCAR"}
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="space-y-0.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                      Razão Social
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white p-3 rounded-xl font-bold text-sm border border-slate-100 outline-none focus:ring-4 focus:ring-blue-100"
                      value={clientForm.name || ""}
                      onChange={(e) =>
                        setClientForm((p) => ({ ...p, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                      Nome Fantasia
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white p-3 rounded-xl font-bold text-sm border border-slate-100 outline-none focus:ring-4 focus:ring-blue-100"
                      value={clientForm.tradeName || ""}
                      onChange={(e) =>
                        setClientForm((p) => ({
                          ...p,
                          tradeName: e.target.value,
                        }))
                      }
                    />
                  </div>

                  {/* Seleção de Nome Preferencial */}
                  <div className="space-y-2 pt-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                      Nome para Exibição
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPreferredNameSource("RAZAO")}
                        className={`flex-1 flex flex-col items-center p-2 rounded-xl border-2 transition-all ${preferredNameSource === "RAZAO" ? "bg-blue-50 border-blue-600" : "bg-white border-slate-200 opacity-60 hover:opacity-100"}`}
                      >
                        <span className="text-[7px] font-black text-slate-400 uppercase mb-0.5">
                          Razão Social
                        </span>
                        <span className="text-[8px] font-bold text-slate-900 truncate w-full text-center">
                          {clientForm.name || "Pendente"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreferredNameSource("FANTASIA")}
                        className={`flex-1 flex flex-col items-center p-2 rounded-xl border-2 transition-all ${preferredNameSource === "FANTASIA" ? "bg-blue-50 border-blue-600" : "bg-white border-slate-200 opacity-60 hover:opacity-100"}`}
                      >
                        <span className="text-[7px] font-black text-slate-400 uppercase mb-0.5">
                          Nome Fantasia
                        </span>
                        <span className="text-[8px] font-bold text-slate-900 truncate w-full text-center">
                          {clientForm.tradeName ||
                            (clientForm.name ? clientForm.name : "Pendente")}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                      Link Google Drive
                    </label>
                    <input
                      type="url"
                      placeholder="https://drive.google.com/..."
                      className="w-full bg-white p-3 rounded-xl font-bold text-sm border border-slate-100 outline-none focus:ring-4 focus:ring-blue-100"
                      value={clientForm.driveUrl || ""}
                      onChange={(e) =>
                        setClientForm((p) => ({
                          ...p,
                          driveUrl: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                      Endereço
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white p-3 rounded-xl font-bold text-sm border border-slate-100 outline-none focus:ring-4 focus:ring-blue-100"
                      value={clientForm.address || ""}
                      onChange={(e) =>
                        setClientForm((p) => ({
                          ...p,
                          address: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                        E-mail
                      </label>
                      <input
                        type="email"
                        className="w-full bg-white p-3 rounded-xl font-bold text-sm border border-slate-100 outline-none focus:ring-4 focus:ring-blue-100"
                        value={clientForm.email || ""}
                        onChange={(e) =>
                          setClientForm((p) => ({
                            ...p,
                            email: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                        Telefone
                      </label>
                      <input
                        type="text"
                        className="w-full bg-white p-3 rounded-xl font-bold text-sm border border-slate-100 outline-none focus:ring-4 focus:ring-blue-100"
                        value={clientForm.phone || ""}
                        onChange={(e) =>
                          setClientForm((p) => ({
                            ...p,
                            phone: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1.5">
                      Sócio-ADM
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white p-3 rounded-xl font-bold text-sm border border-slate-100 outline-none focus:ring-4 focus:ring-blue-100"
                      value={clientForm.adminName || ""}
                      onChange={(e) =>
                        setClientForm((p) => ({
                          ...p,
                          adminName: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    placeholder="Nome do Cliente"
                    className="w-full bg-slate-50 p-3.5 rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-emerald-100 border border-transparent"
                    value={clientForm.name || ""}
                    onChange={(e) =>
                      setClientForm((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">
                    CPF
                  </label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    className="w-full bg-slate-50 p-3.5 rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-emerald-100 border border-transparent"
                    value={clientForm.document || ""}
                    onChange={(e) =>
                      setClientForm((p) => ({ ...p, document: e.target.value }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">
                      E-mail
                    </label>
                    <input
                      type="email"
                      placeholder="email@exemplo.com"
                      className="w-full bg-slate-50 p-3.5 rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-emerald-100 border border-transparent"
                      value={clientForm.email || ""}
                      onChange={(e) =>
                        setClientForm((p) => ({ ...p, email: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">
                      Telefone
                    </label>
                    <input
                      type="text"
                      placeholder="(00) 00000-0000"
                      className="w-full bg-slate-50 p-3.5 rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-emerald-100 border border-transparent"
                      value={clientForm.phone || ""}
                      onChange={(e) =>
                        setClientForm((p) => ({ ...p, phone: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2 tracking-widest">
                    Google Drive
                  </label>
                  <input
                    type="url"
                    placeholder="https://drive.google.com/..."
                    className="w-full bg-slate-50 p-3.5 rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-emerald-100 border border-transparent"
                    value={clientForm.driveUrl || ""}
                    onChange={(e) =>
                      setClientForm((p) => ({ ...p, driveUrl: e.target.value }))
                    }
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleSaveClient}
              disabled={!clientForm.name?.trim()}
              className={`w-full p-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg disabled:opacity-50 mt-1 ${clientType === "PJ" ? "bg-slate-900 hover:bg-blue-600 text-white" : "bg-slate-900 hover:bg-emerald-600 text-white"}`}
            >
              {editingClientId ? "SALVAR ATUALIZAÇÕES" : "FINALIZAR CADASTRO"}
            </button>
          </div>
        </Modal>

        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            resetDeadlineForm();
          }}
          title={editingDeadlineId ? "Editar Registro" : "Registrar Prazo"}
        >
          <form
            onSubmit={handleAddDeadline}
            className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3"
          >
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-1.5 tracking-widest">
                Tipo de Peça
              </label>
              <select
                className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm focus:ring-4 focus:ring-blue-100 outline-none"
                value={newDeadline.peca || ""}
                onChange={(e) =>
                  setNewDeadline((p) => ({ ...p, peca: e.target.value }))
                }
                required
              >
                <option value="">Selecione...</option>
                {[...dynamicSettings.pecas]
                  .sort((a, b) => a.localeCompare(b, "pt-BR"))
                  .map((p) => (
                    <option key={p} value={p.toUpperCase()}>
                      {p.toUpperCase()}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-1.5 tracking-widest">
                Cliente
              </label>
              <select
                className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm focus:ring-4 focus:ring-blue-100 outline-none"
                value={newDeadline.empresa || ""}
                onChange={(e) =>
                  setNewDeadline((p) => ({ ...p, empresa: e.target.value }))
                }
                required
              >
                <option value="">Selecione...</option>
                {unifiedEmpresasOptions.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-1.5 tracking-widest">
                Data do Prazo
              </label>
              <input
                type="date"
                className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm focus:ring-4 focus:ring-blue-100 outline-none"
                value={newDeadline.data || ""}
                onChange={(e) =>
                  setNewDeadline((p) => ({ ...p, data: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-1.5 tracking-widest">
                Hora do Prazo
              </label>
              <input
                type="time"
                className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm focus:ring-4 focus:ring-blue-100 outline-none"
                value={newDeadline.hora || ""}
                onChange={(e) =>
                  setNewDeadline((p) => ({ ...p, hora: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-1.5 tracking-widest">
                Órgão/Instituição
              </label>
              <input
                type="text"
                className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm focus:ring-4 focus:ring-blue-100 outline-none"
                value={newDeadline.instituicao || ""}
                onChange={(e) =>
                  setNewDeadline((p) => ({ ...p, instituicao: e.target.value }))
                }
                placeholder="Ex: TJSP, STJ, Receita Federal..."
              />
            </div>
            {(userProfile?.role === UserRole.ADMIN || userProfile?.role === UserRole.COORDINATOR) && (
              <>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1.5 tracking-widest">
                    Setor Responsável
                  </label>
                  <select
                    className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm focus:ring-4 focus:ring-blue-100 outline-none"
                    value={newDeadline.sector || ""}
                    onChange={(e) =>
                      setNewDeadline((p) => ({ ...p, sector: e.target.value as Sector }))
                    }
                  >
                    {Object.values(Sector).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1.5 tracking-widest">
                    Distribuir para Advogado
                  </label>
                  <select
                    className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm focus:ring-4 focus:ring-blue-100 outline-none"
                    value={newDeadline.assignedTo || ""}
                    onChange={(e) =>
                      setNewDeadline((p) => ({ ...p, assignedTo: e.target.value }))
                    }
                  >
                    <option value="">
                      {userProfile ? `${userProfile.name || 'Sem Nome'} (${userProfile.role} - ${userProfile.sector}) (Eu)` : "Eu (Eu)"}
                    </option>
                    {teamProfiles
                      .filter((m) => m.id !== user?.uid)
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name || "Sem Nome"} ({member.role} - {member.sector})
                        </option>
                      ))}
                  </select>
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-1.5 tracking-widest">
                Link do Documento (Drive)
              </label>
              <input
                type="url"
                className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm focus:ring-4 focus:ring-blue-100 outline-none"
                value={newDeadline.documentUrl || ""}
                onChange={(e) =>
                  setNewDeadline((p) => ({ ...p, documentUrl: e.target.value }))
                }
                placeholder="https://drive.google.com/..."
              />
            </div>
            <div className="md:col-span-2 space-y-3">
              <div className="flex justify-between items-center px-4">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Descrição da Atividade
                </label>
                <button
                  type="button"
                  disabled={
                    isSuggesting || !newDeadline.peca || !newDeadline.empresa
                  }
                  onClick={async () => {
                    setIsSuggesting(true);
                    const suggestion = await suggestActionObject(
                      newDeadline.peca!,
                      newDeadline.empresa!,
                    );
                    setNewDeadline((prev) => ({
                      ...prev,
                      assunto: suggestion,
                    }));
                    setIsSuggesting(false);
                  }}
                  className="text-[8px] font-black uppercase px-3 md:px-4 py-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                >
                  <Icons.Sparkles className="w-3 h-3" /> {isSuggesting ? "..." : "Sugestão IA"}
                </button>
              </div>
              <textarea
                className="w-full bg-slate-50 p-3.5 md:p-4 rounded-xl font-medium text-sm min-h-[80px] md:min-h-[100px] focus:ring-4 focus:ring-blue-100 outline-none"
                placeholder="Detalhes operacionais sobre a tarefa..."
                value={newDeadline.assunto || ""}
                onChange={(e) =>
                  setNewDeadline((p) => ({ ...p, assunto: e.target.value }))
                }
                required
              />
            </div>
            <button
              type="submit"
              className="md:col-span-2 bg-slate-900 text-white p-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-600 transition-all shadow-xl active:scale-95"
            >
              {editingDeadlineId ? "Salvar Alterações" : "Confirmar Registro"}
            </button>
          </form>
        </Modal>

        <Modal
          isOpen={isRuleModalOpen}
          onClose={() => {
            setIsRuleModalOpen(false);
            setEditingRuleIndex(null);
          }}
          title={
            editingRuleIndex !== null
              ? "Editar Alerta"
              : "Configurar Novo Alerta"
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1.5 tracking-widest">
                  Tipo de Prazo
                </label>
                <select
                  className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100"
                  value={newRule.deadlineType}
                  onChange={(e) =>
                    setNewRule((p) => ({ ...p, deadlineType: e.target.value }))
                  }
                >
                  <option value="ALL">TODOS OS PRAZOS</option>
                  {/* Opções de Peça ordenadas e em maiúsculo */}
                  {[...dynamicSettings.pecas]
                    .sort((a, b) => a.localeCompare(b, "pt-BR"))
                    .map((p) => (
                      <option key={p} value={p.toUpperCase()}>
                        {p.toUpperCase()}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1.5 tracking-widest">
                  Prioridade
                </label>
                <div className="flex gap-2">
                  {["ALTA", "MÉDIA", "BAIXA"].map((p) => (
                    <button
                      key={p}
                      onClick={() =>
                        setNewRule((prev) => ({ ...prev, priority: p as any }))
                      }
                      className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all shadow-sm ${newRule.priority === p ? (p === "ALTA" ? "bg-red-600 text-white shadow-red-200" : p === "MÉDIA" ? "bg-amber-500 text-white shadow-amber-200" : "bg-blue-600 text-white shadow-blue-200") : "bg-slate-50 text-slate-400 hover:bg-slate-100"}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1.5 tracking-widest">
                  Antecedência (Dias)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100"
                  value={newRule.leadTimeDays}
                  onChange={(e) =>
                    setNewRule((p) => ({
                      ...p,
                      leadTimeDays: parseInt(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1.5 tracking-widest">
                  Canais de Alerta
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() =>
                      setNewRule((p) => ({
                        ...p,
                        channels: { ...p.channels!, email: !p.channels!.email },
                      }))
                    }
                    className={`p-2.5 rounded-xl border transition-all flex flex-col items-center gap-1 ${newRule.channels?.email ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white border-slate-100 text-slate-300"}`}
                  >
                    <Icons.Mail className="w-4 h-4" />
                    <span className="text-[7px] font-black uppercase text-center">
                      Email
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      setNewRule((p) => ({
                        ...p,
                        channels: { ...p.channels!, push: !p.channels!.push },
                      }))
                    }
                    className={`p-2.5 rounded-xl border transition-all flex flex-col items-center gap-1 ${newRule.channels?.push ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white border-slate-100 text-slate-300"}`}
                  >
                    <Icons.Bell className="w-4 h-4" />
                    <span className="text-[7px] font-black uppercase text-center">
                      Push
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      setNewRule((p) => ({
                        ...p,
                        channels: { ...p.channels!, inApp: !p.channels!.inApp },
                      }))
                    }
                    className={`p-2.5 rounded-xl border transition-all flex flex-col items-center gap-1 ${newRule.channels?.inApp ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white border-slate-100 text-slate-300"}`}
                  >
                    <Icons.Dashboard className="w-4 h-4" />
                    <span className="text-[7px] font-black uppercase text-center">
                      In-App
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={handleSaveRule}
              className="w-full bg-slate-900 text-white p-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-xl active:scale-95"
            >
              {editingRuleIndex !== null
                ? "Atualizar Regra"
                : "Ativar Regra"}
            </button>
          </div>
        </Modal>
        <Modal
          isOpen={isAddUserModalOpen}
          onClose={() => setIsAddUserModalOpen(false)}
          title="Convidar Membro para o Escritório"
        >
          <div className="space-y-3.5">
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              Insira o e-mail do profissional que deseja convidar. Se ele já possuir uma conta no LexPremium, o escritório aparecerá automaticamente no seletor dele no próximo acesso.
            </p>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  E-mail do Profissional
                </label>
                <input
                  type="email"
                  className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100"
                  placeholder="exemplo@email.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Cargo
                  </label>
                   <select
                    className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100"
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  >
                    {Object.values(UserRole).map((r) => {
                      if (
                        userProfile?.role === UserRole.COORDINATOR &&
                        r !== UserRole.LAWYER &&
                        r !== UserRole.INTERN
                      )
                        return null;
                      return (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Setor Inicial
                  </label>
                   <select
                    className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm outline-none focus:ring-4 focus:ring-blue-100"
                    value={newUserSector}
                    onChange={(e) => setNewUserSector(e.target.value as Sector)}
                  >
                    {Object.values(Sector).map((s) => {
                      if (
                        userProfile?.role === UserRole.COORDINATOR &&
                        s !== userProfile.sector
                      )
                        return null;
                      return (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>
            <button
              onClick={handleInviteMember}
              disabled={!newUserEmail.includes("@")}
              className="w-full bg-slate-900 text-white p-4 rounded-xl font-black text-[9px] uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all disabled:opacity-50"
            >
              ENVIAR CONVITE
            </button>
          </div>
        </Modal>

        <Modal
          isOpen={linkingNumber !== null}
          onClose={() => {
            setLinkingNumber(null);
            setSelectedDeadlineForLink(null);
            setDeadlineSearchTerm("");
          }}
          title={`Reservar ${linkingNumber?.category === "oficio" ? "Ofício" : "Memorando"} Nº ${linkingNumber?.num.toString().padStart(3, "0")}`}
        >
          <div className="space-y-4">
            <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
              Selecione o prazo cadastrado que ficará vinculado a esta numeração para controle e auditoria posterior.
            </p>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Icons.Search className="w-4 h-4 text-slate-400" />
              </span>
              <input
                type="text"
                placeholder="Pesquisar por peça, cliente, responsável ou assunto..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                value={deadlineSearchTerm}
                onChange={(e) => setDeadlineSearchTerm(e.target.value)}
              />
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2 border border-slate-100 rounded-2xl p-2 bg-slate-50/50 custom-scrollbar">
              {filteredDeadlinesForLink.length > 0 ? (
                filteredDeadlinesForLink.map((d) => {
                  const isSelected = selectedDeadlineForLink?.id === d.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDeadlineForLink(d)}
                      type="button"
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                        isSelected
                          ? "bg-blue-50 border-blue-200 shadow-sm"
                          : "bg-white border-slate-100/80 hover:bg-slate-100/50 hover:border-slate-200"
                      }`}
                    >
                      <div className="space-y-1 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">
                            {d.empresa}
                          </span>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                            d.status === DeadlineStatus.COMPLETED
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-amber-50 text-amber-600"
                          }`}>
                            {d.status}
                          </span>
                        </div>
                        <h4 className="font-black text-slate-800 text-xs tracking-tight">
                          {d.peca}
                        </h4>
                        <p className="text-[10px] font-medium text-slate-400 truncate max-w-lg">
                          {d.assunto || "Sem assunto"} • Resp: {d.responsavel}
                        </p>
                      </div>
                      
                      <div className="text-right shrink-0">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                          Vencimento
                        </span>
                        <span className="text-xs font-bold text-slate-700 font-mono">
                          {d.data.split('-').reverse().join('/')}
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-8 text-center text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                  Nenhum prazo encontrado.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setLinkingNumber(null);
                  setSelectedDeadlineForLink(null);
                  setDeadlineSearchTerm("");
                }}
                className="px-4 py-2.5 hover:bg-slate-100 rounded-xl text-slate-500 font-black text-[9px] uppercase tracking-widest transition-all"
              >
                Cancelar
              </button>
              <button
                disabled={!selectedDeadlineForLink}
                onClick={() => {
                  if (linkingNumber && selectedDeadlineForLink) {
                    handleSaveCorrespondenceLink(
                      linkingNumber.num,
                      linkingNumber.category,
                      selectedDeadlineForLink
                    );
                  }
                }}
                className={`px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${
                  selectedDeadlineForLink
                    ? "bg-slate-900 text-white hover:bg-blue-600 shadow-lg cursor-pointer transform hover:-translate-y-0.5"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
              >
                Vincular e Reservar
              </button>
            </div>
          </div>
        </Modal>
        {/* FLOATING ACTIVE TIMERS WIDGET (TICKER) */}
        {activeTimers.length > 0 && typeof ticker !== 'undefined' && (
          <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3 items-end animate-in slide-in-from-bottom-5">
             {activeTimers.map(t => {
                let displayElapsed = t.elapsedSeconds;
                if (t.isPlaying && t.lastStartedAt) {
                  displayElapsed += (Date.now() - t.lastStartedAt) / 1000;
                }
                const hrs = Math.floor(displayElapsed / 3600).toString().padStart(2, "0");
                const mins = Math.floor((displayElapsed % 3600) / 60).toString().padStart(2, "0");
                const secs = Math.floor(displayElapsed % 60).toString().padStart(2, "0");

                return (
                  <div key={t.deadlineId} className="bg-slate-900 border border-slate-700 shadow-2xl shadow-blue-900/20 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 hover:scale-[1.02] transition">
                     <div className="flex flex-col">
                       <div className="flex items-center gap-2 mb-0.5">
                         {t.isPlaying && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>}
                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.empresa}</span>
                       </div>
                       <span className="text-xs font-bold text-white max-w-[200px] truncate" title={t.peca}>{t.peca}</span>
                     </div>
                     <div className="font-mono text-lg font-black tracking-wider text-blue-400 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800">
                       {hrs}:{mins}:{secs}
                     </div>
                     <div className="flex items-center gap-1.5 sm:border-l border-slate-700 sm:pl-4 sm:ml-1 w-full sm:w-auto">
                        {!t.isPlaying ? (
                          <button onClick={() => {
                             setActiveTimers(cur => cur.map(curT => curT.deadlineId === t.deadlineId ? {...curT, isPlaying: true, lastStartedAt: Date.now()} : curT));
                          }} className="w-full sm:w-8 h-8 rounded-lg bg-slate-800 text-blue-400 flex items-center justify-center hover:bg-blue-500 hover:text-white transition" title="Retomar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          </button>
                        ) : (
                          <button onClick={() => handlePauseTimer(t.deadlineId)} className="w-full sm:w-8 h-8 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center hover:bg-amber-500 hover:text-white transition" title="Pausar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>
                          </button>
                        )}
                        <button onClick={() => handleStopTimer(t.deadlineId)} className="w-full sm:w-8 h-8 rounded-lg bg-slate-800 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition" title="Parar e Salvar">
                           <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg>
                        </button>
                     </div>
                  </div>
                )
             })}
          </div>
        )}
      </main>
    </div>
  );
}
