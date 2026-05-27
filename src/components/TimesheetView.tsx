import React, { useState, useMemo } from 'react';
import { TimeLog, TimeLogStatus, UserProfile, UserRole } from '../../types';
import { Icons } from '../../constants';

interface TimesheetViewProps {
  timeLogs: TimeLog[];
  activeTimers: any[];
  userProfile: UserProfile | null;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onEditDuration: (id: string, newMinutes: number) => void;
  onDelete: (id: string) => void;
  onStartManual: () => void;
  onRetroactiveEntry: () => void;
}

export const TimesheetView: React.FC<TimesheetViewProps> = ({
  timeLogs,
  activeTimers,
  userProfile,
  onApprove,
  onReject,
  onEditDuration,
  onDelete,
  onStartManual,
  onRetroactiveEntry
}) => {
  const [tab, setTab] = useState<"logs" | "pending" | "ranking">("logs");
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [logToReject, setLogToReject] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);

  const pendingApprovalLogs = useMemo(() => {
    return timeLogs.filter(t => t.status === TimeLogStatus.PENDING_APPROVAL);
  }, [timeLogs]);

  const approvalAllowed = userProfile?.role === UserRole.ADMIN || userProfile?.role === UserRole.COORDINATOR;

  const myLogs = useMemo(() => {
    if (approvalAllowed) return timeLogs; // admins see all
    return timeLogs.filter(t => t.userId === userProfile?.id);
  }, [timeLogs, approvalAllowed, userProfile]);

  const ranking = useMemo(() => {
    const stats: Record<string, { userId: string, userName: string, totalSeconds: number, processes: Set<string> }> = {};
    timeLogs.forEach(t => {
       if (t.status === TimeLogStatus.APPROVED || t.status === TimeLogStatus.PENDING_APPROVAL) {
         if (!stats[t.userId]) {
            stats[t.userId] = { userId: t.userId, userName: t.userName, totalSeconds: 0, processes: new Set() };
         }
         const secs = Number(t.durationSeconds) || 0;
         stats[t.userId].totalSeconds += secs;
         stats[t.userId].processes.add(t.processTitle);
       }
    });

    return Object.values(stats).sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [timeLogs]);

  const formatDuration = (seconds: number) => {
    const totalSecs = Math.max(0, Math.round(Number(seconds) || 0));
    if (totalSecs === 0) return "0s";
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    if (mins > 0) {
      if (secs > 0) return `${mins}m ${secs}s`;
      return `${mins}m`;
    }
    return `${secs}s`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 justify-between md:items-center">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
            <Icons.Clock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              Gestão de Tempo
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Timesheet e Ranking de Produtividade
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
           <button onClick={onStartManual} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-blue-700 transition">
             + Cronômetro Avulso
           </button>
           <button onClick={onRetroactiveEntry} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-200 transition">
             + Lançamento Retroativo
           </button>
        </div>
      </div>

      <div className="flex bg-slate-50 p-1.5 rounded-xl border border-slate-100 gap-1 w-full max-w-xl">
         <button onClick={() => setTab("logs")} className={`flex-1 py-2 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-lg transition-all ${tab === "logs" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-slate-200/50 hover:text-slate-600"}`}>
            Histórico de Registros
         </button>
         <button onClick={() => setTab("ranking")} className={`flex-1 py-2 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-lg transition-all ${tab === "ranking" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:bg-slate-200/50 hover:text-slate-600"}`}>
            Ranking de Horas
         </button>
      </div>

      {tab === "logs" && (
         <div className="bg-white border text-left border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                       <th className="p-4">Advogado</th>
                       <th className="p-4">Processo / Cliente</th>
                       <th className="p-4">Atividade</th>
                       <th className="p-4">Data</th>
                       <th className="p-4">Duração</th>
                       {userProfile?.role === UserRole.ADMIN && (
                          <th className="p-4 text-right">Ações</th>
                       )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {myLogs.length === 0 ? (
                       <tr><td colSpan={userProfile?.role === UserRole.ADMIN ? 6 : 5} className="text-center p-8 text-slate-400 font-bold uppercase text-xs">Nenhum registro encontrado</td></tr>
                    ) : (
                       [...myLogs].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(log => (
                          <tr key={log.id} className="hover:bg-slate-50/50 transition">
                             <td className="p-4 font-bold text-slate-800 text-sm">{log.userName}</td>
                             <td className="p-4 text-xs font-semibold text-slate-600">{log.processTitle}</td>
                             <td className="p-4 text-xs font-medium text-slate-500">{log.peca} ({log.activityType})</td>
                             <td className="p-4 text-xs font-mono text-slate-400">{log.date.split("-").reverse().join("/")}</td>
                             <td className="p-4 font-mono font-bold text-slate-800">{formatDuration(log.durationSeconds)}</td>
                             {userProfile?.role === UserRole.ADMIN && (
                                <td className="p-4 text-right">
                                   <button
                                     onClick={() => setDeletingLogId(log.id)}
                                     className="w-7 h-7 inline-flex items-center justify-center text-red-500 bg-red-50 hover:bg-red-600 hover:text-white rounded-lg transition-all"
                                     title="Excluir Registro"
                                   >
                                      <Icons.Trash className="w-3.5 h-3.5" />
                                   </button>
                                </td>
                             )}
                          </tr>
                       ))
                    )}
                  </tbody>
               </table>
            </div>
         </div>
      )}

      {tab === "pending" && approvalAllowed && (
         <div className="bg-white border text-left border-amber-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-amber-50/50 p-4 border-b border-amber-100">
              <h3 className="text-sm font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                <Icons.Activity className="w-4 h-4" /> Aprovações Pendentes
              </h3>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                       <th className="p-4">Advogado</th>
                       <th className="p-4">Cliente / Processo</th>
                       <th className="p-4">Tarefa</th>
                       <th className="p-4">Tempo Solicitado</th>
                       <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pendingApprovalLogs.length === 0 ? (
                       <tr><td colSpan={5} className="text-center p-8 text-slate-400 font-bold uppercase text-xs">Nenhuma aprovação pendente</td></tr>
                    ) : (
                       pendingApprovalLogs.map(log => (
                          <tr key={log.id} className="hover:bg-slate-50/50 transition">
                             <td className="p-4 font-bold text-slate-800 text-sm">{log.userName}</td>
                             <td className="p-4 text-xs font-semibold text-slate-600">{log.processTitle}</td>
                             <td className="p-4 text-xs font-medium text-slate-500">
                                {log.peca}
                                {log.description && <p className="text-[10px] text-slate-400 italic mt-1">{log.description}</p>}
                             </td>
                             <td className="p-4 font-mono font-bold text-slate-800 text-sm">
                               {formatDuration(log.durationSeconds)}
                             </td>
                             <td className="p-4 text-right flex items-center justify-end gap-2">
                                <button onClick={() => onApprove(log.id)} className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition">
                                  <Icons.Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => {
                                   setLogToReject(log.id);
                                   setRejectionModalOpen(true);
                                }} className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white transition">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                </button>
                             </td>
                          </tr>
                       ))
                    )}
                  </tbody>
               </table>
            </div>
         </div>
      )}

      {tab === "ranking" && (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ranking.map((r, i) => (
               <div key={r.userId} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col items-center text-center">
                 {i === 0 && <div className="absolute top-0 w-full h-1 bg-yellow-400"></div>}
                 {i === 1 && <div className="absolute top-0 w-full h-1 bg-slate-300"></div>}
                 {i === 2 && <div className="absolute top-0 w-full h-1 bg-amber-600"></div>}
                 <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-lg font-black text-slate-700 mb-3">
                   {r.userName.charAt(0).toUpperCase()}
                 </div>
                 <h3 className="font-bold text-slate-900">{r.userName}</h3>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 mb-4">
                   {r.processes.size} {r.processes.size === 1 ? "Processo Ativo" : "Processos Ativos"}
                 </p>
                 <div className="mt-auto pt-4 border-t border-slate-100 w-full">
                   <p className="font-mono text-2xl font-black text-blue-600">
                     {formatDuration(r.totalSeconds)}
                   </p>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aprovadas</p>
                 </div>
               </div>
            ))}
            {ranking.length === 0 && (
               <div className="col-span-full text-center p-12 border-2 border-dashed border-slate-100 rounded-2xl">
                 <Icons.Activity className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                 <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Sem dados consolidados</p>
               </div>
            )}
         </div>
      )}

      {/* Reject Modal */}
      {rejectionModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-300">
             <div className="p-6">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">Devolver Registro</h3>
                <p className="text-xs text-slate-500 font-medium mb-4">Informe o motivo da devolução para que o advogado possa corrigir.</p>
                <textarea 
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 min-h-[100px] text-sm focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all outline-none"
                  placeholder="Justificativa..."
                />
             </div>
             <div className="p-4 bg-slate-50 flex justify-end gap-3">
                <button onClick={() => { setRejectionModalOpen(false); setLogToReject(null); setRejectionReason(""); }} className="px-4 py-2 font-bold text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-200 rounded-xl transition">Cancelar</button>
                <button onClick={() => { logToReject && onReject(logToReject, rejectionReason); setRejectionModalOpen(false); setLogToReject(null); setRejectionReason(""); }} className="px-4 py-2 font-bold text-[10px] uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 rounded-xl transition shadow-lg shadow-red-600/20">Confirmar Devolução</button>
             </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingLogId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-300 text-center">
             <div className="p-6">
                 <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                     <Icons.Trash className="w-6 h-6 animate-bounce" />
                 </div>
                 <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">Excluir Registro</h3>
                 <p className="text-xs text-slate-500 font-medium leading-relaxed">Deseja realmente excluir este registro de tempo definitivamente? Esta ação não pode ser desfeita.</p>
             </div>
             <div className="p-4 bg-slate-50 flex justify-center gap-3">
                 <button onClick={() => setDeletingLogId(null)} className="px-4 py-2 font-bold text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-200 rounded-xl transition">Cancelar</button>
                 <button onClick={() => { if (deletingLogId) { onDelete(deletingLogId); setDeletingLogId(null); } }} className="px-4 py-2 font-bold text-[10px] uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 rounded-xl transition shadow-lg shadow-red-600/20">Confirmar Exclusão</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
