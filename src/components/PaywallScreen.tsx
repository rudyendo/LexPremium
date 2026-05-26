import React, { useState } from "react";
import { UserProfile } from "../../types";
import { Icons } from "../../constants";

interface PaywallScreenProps {
  currentSubscription: any;
  userProfile: UserProfile | null;
  onSwitchOffice: (officeId: string) => void;
  onLogout: () => void;
}

export default function PaywallScreen({
  currentSubscription,
  userProfile,
  onSwitchOffice,
  onLogout,
}: PaywallScreenProps) {
  const [submitting, setSubmitting] = useState(false);

  const otherOffices = userProfile?.offices?.filter(o => o.id !== userProfile?.officeId) || [];
  
  const handleMercadoPagoCheckout = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!userProfile?.officeId) return;
    setSubmitting(true);
    
    try {
      // Ensure we only stringify plain strings to prevent any minified SyntheticEvent/FiberNode from leaking into JSON
      const safePayload = {
        payerEmail: String(userProfile.email || "contato@lexpremium.com.br"),
        planName: "Plano LexPremium Mensal",
        price: 99.00,
        officeId: String(userProfile.officeId)
      };

      const response = await fetch("/api/billing/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safePayload),
      });
      const data = await response.json();
      if (response.ok && data.init_point) {
        window.location.href = data.init_point;
      } else {
        alert(data.error || "Erro ao conectar com o provedor de pagamentos.");
        setSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao conectar com o provedor de pagamentos.");
      setSubmitting(false);
    }
  };

  const getBlockReason = () => {
    if (!currentSubscription) return "Verificação de faturamento pendente";
    switch (currentSubscription.status) {
      case "BLOCKED":
        return "Eixo Administrativo: O acesso a este escritório foi bloqueado por um administrador geral.";
      case "PENDING_PAYMENT":
        return "Aguardando confirmação do pagamento mensal da assinatura.";
      case "PENDING_CHOICE":
        return "Escolha um plano de assinatura ou inicie seu período de testes grátis de 30 dias.";
      default:
        return "O período de testes gratuito de 30 dias deste escritório expirou.";
    }
  };

  const handleStartTrial = async () => {
    if (!userProfile?.officeId) return;
    setSubmitting(true);
    
    try {
      const response = await fetch("/api/billing/start-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officeId: String(userProfile.officeId)
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || "Erro ao iniciar o período de testes.");
        setSubmitting(false);
      } else {
        // App.tsx uses onSnapshot, which will re-render automatically!
        setSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão ao iniciar o teste.");
      setSubmitting(false);
    }
  };

  return (
    <div id="paywall_screen_container" className="fixed inset-0 bg-[#F8FAFC] flex items-center justify-center p-4 z-[9999] overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl p-6 md:p-8 border border-slate-100 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header Alert area */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2 animate-bounce">
            <Icons.Lock className="w-8 h-8" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-red-500">
            Acesso Suspenso
          </p>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight leading-tight">
            Seu Escritório Precisa de uma Assinatura Ativa
          </h2>
          <p className="text-slate-500 text-xs md:text-sm font-medium max-w-md mx-auto">
            {getBlockReason()}
          </p>
        </div>

        {/* Current Office Details card */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Escritório Atual</p>
            <h4 className="text-sm font-black text-slate-700 mt-0.5">
              {currentSubscription?.officeName || userProfile?.offices?.find(o => o.id === userProfile.officeId)?.name || "Escritório LexPremium"}
            </h4>
          </div>
          <div className="bg-slate-200/60 text-slate-600 border border-slate-300 rounded-lg px-2.5 py-1 text-[9px] font-bold">
            Código: {userProfile?.officeId}
          </div>
        </div>

        {/* Billing Plan instructions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          
          {/* Trial Checkout */}
          {currentSubscription?.status === "PENDING_CHOICE" && (
            <div className="space-y-4 border border-emerald-200 rounded-2xl p-6 bg-emerald-50 flex flex-col items-center text-center col-span-1 md:col-span-1 h-full">
              <h3 className="text-sm font-black uppercase tracking-wider text-emerald-800 flex items-center justify-center gap-2">
                 Teste Grátis
              </h3>
              
              <p className="text-emerald-700 text-xs font-bold leading-relaxed max-w-sm mb-2 flex-grow">
                Você pode utilizar todas as funcionalidades por <span className="font-extrabold">30 dias gratuitamente</span> e sem compromisso.
              </p>

              <button
                onClick={handleStartTrial}
                disabled={submitting}
                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl font-black text-[11px] md:text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 justify-center w-full mt-auto"
              >
                {submitting ? "Processando..." : "Iniciar Mês de Teste"}
              </button>
            </div>
          )}

          {/* Mercado Pago Checkout */}
          <div className={`space-y-4 border border-slate-200 rounded-2xl p-6 bg-slate-50 flex flex-col items-center text-center ${currentSubscription?.status === "PENDING_CHOICE" ? "col-span-1 md:col-span-1" : "col-span-1 md:col-span-2"}`}>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center justify-center gap-2">
              <Icons.Finance className="w-5 h-5 text-[#009EE3]" /> Assinatura Mensal LexPremium
            </h3>
            
            <p className="text-slate-500 text-xs font-bold leading-relaxed max-w-lg mb-2 flex-grow">
              O plano mensal custa apenas <span className="text-slate-800 font-extrabold text-sm">R$ 99,00</span> por escritório. Libere gestão de processos, monitoramento DJEN ilimitado e controle de prazos.
            </p>

            <button
              onClick={handleMercadoPagoCheckout}
              disabled={submitting}
              className="px-6 py-3.5 bg-[#009EE3] hover:bg-[#0089C5] disabled:bg-slate-300 text-white rounded-xl font-black text-[11px] md:text-xs uppercase tracking-widest transition-all disabled:pointer-events-none shadow-lg shadow-[#009EE3]/20 flex items-center gap-2 justify-center w-full max-w-sm mt-auto"
            >
              {submitting ? (
                 <span className="animate-pulse flex items-center gap-2">Gerando Checkout Seguro...</span>
              ) : (
                 <>
                   Assinar com Mercado Pago
                   <Icons.ChevronRight className="w-4 h-4 ml-1" />
                 </>
              )}
            </button>
            
            {currentSubscription?.status !== "PENDING_CHOICE" && (
                <p className="text-[9px] font-bold text-slate-400 mt-2 flex items-center gap-1 justify-center">
                   <Icons.Lock className="w-3 h-3" /> Pagamento 100% processado e seguro pelo Mercado Pago
                </p>
            )}
          </div>
        </div>

        <div className="w-full">
           <p className="text-[10px] text-center font-bold text-slate-400 leading-relaxed border-t border-slate-100 pt-4 mt-2">
             Precisa de ajuda ou nota fiscal antecipada? Fale conosco: <a href="mailto:suporte@lexpremium.com.br" className="text-[#009EE3] font-extrabold border-b border-[#009EE3]/30">suporte@lexpremium.com.br</a>.
           </p>
        </div>

        {/* Change office / workspace switcher */}
        {otherOffices.length > 0 && (
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Você pertence a outros escritórios ativos? Mude abaixo:
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {otherOffices.map((office) => (
                <button
                  key={office.id}
                  onClick={() => onSwitchOffice(office.id)}
                  className="w-full p-2.5 bg-[#F8FAFC] border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 text-left transition-all flex items-center justify-between group"
                >
                  <div className="truncate pr-4">
                    <span className="font-black text-slate-700 text-xs block truncate">
                      {office.name}
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase">
                      Cargo: {office.role}
                    </span>
                  </div>
                  <span className="p-1 px-1.5 bg-white border border-slate-200 text-slate-500 rounded text-[9px] font-black uppercase group-hover:bg-blue-600 group-hover:text-white transition-colors flex items-center gap-1">
                    Mudar
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom footer area */}
        <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-xs">
          <span className="text-[10px] font-black text-slate-300 tracking-[0.15em] uppercase">
            LexPremium Billing Eng
          </span>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-slate-500 hover:text-red-600 font-black text-xs uppercase"
          >
            Sair da Conta <Icons.ArrowLeft className="w-4 h-4 scale-75" />
          </button>
        </div>

      </div>
    </div>
  );
}
