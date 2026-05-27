
export enum DeadlineStatus {
  PENDING = 'PENDENTE',
  COMPLETED = 'CONCLUÍDO',
  OVERDUE = 'ATRASADO'
}

export enum ReviewState {
  NONE = 'NONE',
  WAITING_COORDINATOR = 'WAITING_COORDINATOR',
  REVIEWING_COORDINATOR = 'REVIEWING_COORDINATOR',
  WAITING_ADMIN = 'WAITING_ADMIN',
  REVIEWING_ADMIN = 'REVIEWING_ADMIN',
  VALIDATED_BY_ADMIN_WAITING_COORDINATOR = 'VALIDATED_BY_ADMIN_WAITING_COORDINATOR',
  RETURNED_TO_LAWYER = 'RETURNED_TO_LAWYER',
  COMPLETED = 'COMPLETED'
}

export enum UserRole {
  ADMIN = 'ADMINISTRADOR',
  COORDINATOR = 'COORDENADOR',
  LAWYER = 'ADVOGADO',
  INTERN = 'ESTAGIÁRIO'
}

export enum Sector {
  TAX = 'TRIBUTÁRIO',
  CIVIL = 'CÍVEL',
  BIDDING = 'LICITAÇÕES',
  LABOR = 'TRABALHISTA',
  GENERAL = 'GERAL'
}

export interface OfficeMember {
  id: string; // officeId
  name: string;
  role: UserRole;
  sector: Sector;
}

export interface UserProfile {
  id: string; // matches auth uid
  email: string;
  name: string;
  role: UserRole;
  sector: Sector;
  officeId: string; // Current active officeId
  offices?: OfficeMember[]; // List of offices the user belongs to
  memberOf?: string[]; // List of office IDs for easier querying
  createdAt: string;
  oab?: string;
  ufOab?: string;
  adminOab?: string;
  adminUfOab?: string;
}

export interface ProcessNote {
  id: string;
  text: string;
  createdAt: string;
}

export interface ClientProcess {
  id: string;
  number: string; // Número do processo
  title: string; // Título ou Classe
  notes: ProcessNote[];
  createdAt: string;
}

export interface Client {
  id: string;
  type: 'PF' | 'PJ';
  name: string; // Nome ou Razão Social
  displayName: string; // Nome amigável para exibição
  document: string; // CPF ou CNPJ
  driveUrl?: string; // Opcional
  // Detalhes extras para PJ
  tradeName?: string;
  address?: string;
  adminName?: string;
  email?: string;
  phone?: string;
  processes?: ClientProcess[];
  createdAt: string;
  officeId: string;
  sector?: Sector;
}

export interface ReviewLogEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: 'SUBMITTED_FOR_REVIEW' | 'STARTED_REVIEW' | 'RETURNED' | 'SENT_TO_ADMIN' | 'ADMIN_APPROVED' | 'COMPLETED' | 'TIMER_SESSION';
  fromState?: ReviewState;
  toState?: ReviewState;
  observation?: string;
  timestamp: string;
  durationSeconds?: number;
}

export interface Deadline {
  id: string;
  peca: string;
  responsavel: string;
  empresa: string;
  instituicao?: string;
  assunto: string;
  data: string;
  hora?: string;
  status: DeadlineStatus;
  createdAt: string;
  documentUrl?: string;
  userId?: string;
  officeId: string;
  sector: Sector;
  assignedTo?: string; // UID of the lawyer
  reviewState?: ReviewState;
  reviewLogs?: ReviewLogEntry[];
}

export enum AdminTaskCategory {
  MEETING = 'REUNIÃO',
  DISPATCH = 'DESPACHO COM JUIZ',
  EMAIL = 'ENVIAR E-MAIL',
  CALL = 'LIGAÇÃO',
  DOC_COLLECTION = 'COBRANÇA DE DOCUMENTOS',
  OTHER = 'OUTROS'
}

export type AdminTaskAlert = '24H' | '2H' | '1H' | 'ON_TIME';

export interface AdminTask {
  id: string;
  category: AdminTaskCategory | string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  status: DeadlineStatus;
  userId: string;
  officeId: string;
  sector: Sector;
  assignedTo?: string;
  createdAt: string;
  updatedAt?: string;
  alerts?: AdminTaskAlert[];
  isRecurring?: boolean;
  recurrenceType?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUALLY';
  recurrenceEndDate?: string;
}

export interface NotificationRule {
  id: string;
  deadlineType: string; // Corresponds to 'peca' or 'ALL'
  priority: 'ALTA' | 'MÉDIA' | 'BAIXA';
  leadTimeDays: number;
  channels: {
    email: boolean;
    push: boolean;
    inApp: boolean;
  };
}

export interface NotificationSettings {
  greenAlertDays: number;
  yellowAlertDays: number;
  enableBrowserNotifications: boolean;
  notificationFrequency: 'always' | 'daily' | 'hourly';
  quietMode: boolean;
  responsaveis: string[];
  pecas: string[];
  empresas: string[]; // Mantido para compatibilidade de nomes simples
  clients?: Client[]; // Novo campo para objetos complexos
  firebaseConfig?: any;
  rules: NotificationRule[];
  officeName?: string;
  officeLogo?: string;
  categoriasTarefas?: string[];
}

export interface ProcessMovement {
  dataHora: string;
  descricao: string;
  complementos?: string[];
}

export interface MonitoredProcess {
  id: string;
  cnj: string;
  clientName: string;
  clientId?: string;
  parties?: string[];
  classe?: string;
  assunto?: string;
  grau?: string;
  lastUpdate: string;
  movements: ProcessMovement[];
  status: string;
  court: string;
  officeId: string;
  sector: Sector;
  userId: string;
  createdAt: string;
  notes?: ProcessNote[];
}

export interface DocumentTemplate {
  id: string;
  name: string;
  content: string; // Markdown or plain text with placeholders like {{NOME}}
  type: 'CONTRATO' | 'PROCURACAO' | 'OUTRO';
  createdAt: string;
}

export enum FinanceTransactionType {
  RECEITA = 'RECEITA',
  DESPESA = 'DESPESA'
}

export enum FinanceCategory {
  HONORARIOS = 'HONORÁRIOS',
  CONSULTORIA = 'CONSULTORIA',
  SOCIOS = 'SÓCIOS',
  SALARIOS = 'SALÁRIOS',
  IMPOSTOS = 'IMPOSTOS',
  INFRAESTRUTURA = 'INFRAESTRUTURA',
  ALUGUEL = 'ALUGUEL',
  MATERIAL = 'MATERIAL',
  REEMBOLSO = 'REEMBOLSO',
  OUTROS = 'OUTROS'
}

export enum FinanceStatus {
  PAGO = 'PAGO',
  PENDENTE = 'PENDENTE'
}

export interface FinanceTransaction {
  id: string;
  type: FinanceTransactionType;
  category: FinanceCategory;
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
  clientId?: string;
  clientName?: string;
  status: FinanceStatus;
  userId: string;
  officeId: string;
  createdAt: string;
}

export interface RecurringExpense {
  id: string;
  description: string;
  category: FinanceCategory;
  amount: number;
  dueDay: number; // 1 to 31
  isVariable: boolean; // if true, can define a custom price on pay
  lastBillingMonth?: string; // e.g. "2026-05" (tracks if paid this month)
  userId: string;
  officeId: string;
  createdAt: string;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface DjenPublication {
  id: string;
  numeroProcesso: string;
  dataDisponibilizacao: string;
  dataPublicacao: string;
  dataPublicPublicacao?: string;
  tribunal: string;
  texto: string;
  tipoComunicacao: string;
  destinatarios?: any[];
  meio: string;
  officeId: string;
  searchOab: string;
  searchUfOab: string;
  createdAt: string;
  isRead?: boolean;
  isInTrash?: boolean;
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  FREE_TRIAL = 'FREE_TRIAL',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PENDING_CHOICE = 'PENDING_CHOICE',
  BLOCKED = 'BLOCKED',
  GRATIS = 'GRATIS'
}

export interface OfficeSubscription {
  officeId: string;
  officeName: string;
  ownerId: string;
  ownerEmail: string;
  status: SubscriptionStatus;
  validUntil: string; // ISO date string (YYYY-MM-DD or full ISO)
  planName: string; // e.g. 'Mensal', 'Cortesia', 'Anual', etc.
  createdAt: string;
  updatedAt: string;
}

export enum TimeLogStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface TimeLog {
  id: string;
  userId: string;
  userName: string;
  deadlineId?: string; // Optional - can be empty if manual entry
  processTitle: string; // Eg, client name or client process title
  peca: string; // Associated work or activity description
  activityType: string; // "Elaboração de Peça", "Pesquisa Jurídica", "Audiência", etc
  description?: string;
  durationSeconds: number;
  status: TimeLogStatus;
  rejectionReason?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  createdAt: string;
  date: string; // YYYY-MM-DD
  officeId: string;
}


