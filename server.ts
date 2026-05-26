import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Gemini API Initialization
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Route for Gemini Suggestions
  app.post("/api/gemini/suggest", async (req, res) => {
    const { peca, empresa } = req.body;
    if (!peca || !empresa) {
      return res.status(400).json({ error: "Parâmetros peca e empresa são obrigatórios." });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Como um consultor jurídico sênior, sugira um 'Objeto da Ação' ou 'Providência' conciso (máximo 150 caracteres) para um documento do tipo "${peca}" referente à empresa "${empresa}". O texto deve ser direto, formal e indicar a ação necessária. Retorne APENAS o texto da sugestão.`,
      });
      res.json({ suggestion: response.text?.trim() || "" });
    } catch (error: any) {
      console.error("Gemini Suggestion Error:", error);
      res.status(500).json({ error: "Erro ao gerar sugestão da IA." });
    }
  });

  // API Route for Datajud Process Search
  app.post("/api/datajud/search", async (req, res) => {
    const { cnj } = req.body;
    const apiKey = process.env.DATAJUD_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Chave da API Datajud não configurada no servidor." });
    }

    if (!cnj) {
      return res.status(400).json({ error: "Número CNJ é obrigatório." });
    }

    const cleanCnj = cnj.replace(/\D/g, "");
    
    if (cleanCnj.length !== 20) {
      return res.status(400).json({ error: "Número CNJ inválido. Deve possuir 20 dígitos." });
    }
    
    // CNJ Format: NNNNNNN-DD.YYYY.J.TR.OOOO
    // Unformatted (20 digits): NNNNNNN DD YYYY J TR OOOO
    // J index: 13, TR index: 14-15
    const j = cleanCnj.charAt(13);
    const tr = cleanCnj.substring(14, 16);
    const tribunalCode = `${j}.${tr}`;

    const tribunalMapping: Record<string, string> = {
      "8.26": "tjsp", "8.19": "tjrj", "8.13": "tjmg", "8.07": "tjdft", "8.16": "tjpr",
      "8.24": "tjsc", "8.21": "tjrs", "8.05": "tjba", "8.06": "tjce", "8.17": "tjpe",
      "8.18": "tjpi", "8.20": "tjrn", "8.15": "tjpb", "8.02": "tjal", "8.25": "tjse",
      "8.10": "tjma", "8.01": "tjac", "8.04": "tjam", "8.03": "tjap", "8.14": "tjpa",
      "8.22": "tjro", "8.23": "tjrr", "8.27": "tjto", "8.09": "tjgo", "8.11": "tjmt",
      "8.12": "tjms", "8.08": "tjes",
      "4.01": "trf1", "4.02": "trf2", "4.03": "trf3", "4.04": "trf4", "4.05": "trf5", "4.06": "trf6",
      "5.01": "trt1", "5.02": "trt2", "5.03": "trt3", "5.04": "trt4", "5.05": "trt5",
      "5.06": "trt6", "5.07": "trt7", "5.08": "trt8", "5.09": "trt9", "5.10": "trt10",
      "5.11": "trt11", "5.12": "trt12", "5.13": "trt13", "5.14": "trt14", "5.15": "trt15",
      "5.16": "trt16", "5.17": "trt17", "5.18": "trt18", "5.19": "trt19", "5.20": "trt20",
      "5.21": "trt21", "5.22": "trt22", "5.23": "trt23", "5.24": "trt24",
      "1.00": "stf", "3.00": "tse", "1.03": "stj", "5.00": "tst", "2.00": "stm",
      "1.01": "cnj", "1.02": "cjf", "1.04": "csjt"
    };

    const tribunalSuffix = tribunalMapping[tribunalCode];
    if (!tribunalSuffix) {
      return res.status(400).json({ 
        error: `Tribunal não identificado (J.${j} TR.${tr}). Verifique se o número CNJ está correto.` 
      });
    }
    
    try {
      // APIKey header format: APIKey [chave-publica]
      // Some tribunais are case sensitive to 'APIKey' (capital K)
      const authHeader = apiKey.startsWith("APIKey ") ? apiKey : `APIKey ${apiKey}`;
      const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${tribunalSuffix}/_search`;

      console.log(`[Datajud] Consulting ${tribunalSuffix.toUpperCase()} for CNJ: ${cleanCnj}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: {
            bool: {
              should: [
                { term: { "numeroProcesso.keyword": cleanCnj } },
                { match: { numeroProcesso: cleanCnj } },
                { match: { numeroProcesso: cnj } }
              ],
              minimum_should_match: 1
            }
          },
          size: 1
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Datajud] API Error (${response.status}):`, errorText);
        return res.status(response.status).json({ 
          error: "Erro na API Datajud", 
          status: response.status,
          tribunal: tribunalSuffix 
        });
      }

      const data = await response.json();
      const hitCount = data.hits?.total?.value || data.hits?.hits?.length || 0;
      
      // If no hits found, return breadcrumb info to help debugging
      if (hitCount === 0) {
        console.warn(`[Datajud] No hits found for ${cleanCnj} in ${tribunalSuffix}`);
      } else {
        console.log(`[Datajud] Found ${hitCount} results for ${cleanCnj} in ${tribunalSuffix}`);
      }

      res.json(data);
    } catch (error: any) {
      console.error("Datajud API Error:", error);
      res.status(500).json({ error: "Falha ao conectar com a API Datajud." });
    }
  });

  // API Route for ComunicaAPI PJe (DJEN) Search by OAB
  app.post("/api/v1/comunicacao", async (req, res) => {
    const { numeroOab, ufOab, dataInicio, dataFim } = req.body;

    if (!numeroOab || !ufOab) {
      return res.status(400).json({ error: "Parâmetros numeroOab e ufOab são obrigatórios." });
    }

    // Default dates if not provided (default last 60 days)
    const today = new Date();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(today.getDate() - 60);

    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const cleanOab = String(numeroOab).replace(/\D/g, "");
    const cleanUf = String(ufOab).toLowerCase();

    const queryDataInicio = dataInicio || formatDate(sixtyDaysAgo);
    const queryDataFim = dataFim || formatDate(today);

    const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=${cleanOab}&ufOab=${cleanUf}&dataDisponibilizacaoInicio=${queryDataInicio}&dataDisponibilizacaoFim=${queryDataFim}`;

    try {
      console.log(`[ComunicaAPI] Querying DJEN: ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ComunicaAPI] Error (${response.status}):`, errorText);
        
        let customMessage = "Erro na resposta do servidor do DJEN nacional.";
        if (response.status === 403) {
          customMessage = "O acesso aos servidores da API do DJEN nacional (comunicaapi.pje.jus.br) foi bloqueado pelo AWS WAF ou CloudFront do CNJ para este servidor de nuvem (HTTP 403 Recusado/Forbidden). Por segurança, o tribunal bloqueia requisições automatizadas vindas de datacenters.";
        }
        
        return res.status(response.status).json({
          error: customMessage,
          details: errorText.substring(0, 500),
          status: response.status
        });
      }

      const data = await response.json();
      return res.json(data);
    } catch (error: any) {
      console.error("[ComunicaAPI] API Connection Error:", error);
      return res.status(500).json({ 
        error: "Falha na conexão de rede com os servidores do DJEN nacional (comunicaapi.pje.jus.br).",
        details: error?.message || String(error)
      });
    }
  });

  // API Route for Free Trial Start
  app.post("/api/billing/start-trial", async (req, res) => {
    try {
      const { officeId } = req.body;
      if (!officeId) {
        return res.status(400).json({ error: "Office ID is required" });
      }

      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();
      
      const subRef = db.collection('subscriptions').doc(officeId);
      const docSnap = await subRef.get();
      
      if (!docSnap.exists) {
        return res.status(404).json({ error: "Assinatura não encontrada." });
      }
      
      const currentData = docSnap.data();
      if (currentData && currentData.status !== "PENDING_CHOICE") {
        return res.status(400).json({ error: "O período de testes só está disponível para novos usuários." });
      }

      const defaultExpiry = new Date();
      defaultExpiry.setDate(defaultExpiry.getDate() + 30); // 30 days trial

      await subRef.update({
        status: "FREE_TRIAL",
        validUntil: defaultExpiry.toISOString().split("T")[0],
        planName: "Fase de Testes (Trial)",
        updatedAt: new Date().toISOString()
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("Error starting trial:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route for Mercado Pago Subscriptions
  app.post("/api/billing/create-subscription", async (req, res) => {
    const { payerEmail, planName, price, officeId } = req.body;
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!accessToken) {
      return res.status(500).json({ error: "Chave do Mercado Pago não configurada no servidor." });
    }

    if (!payerEmail || !planName || !price) {
      return res.status(400).json({ error: "Dados inválidos para a assinatura." });
    }

    try {
      const response = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: `Assinatura LexPremium - ${planName}`,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: price,
            currency_id: "BRL",
          },
          back_url: req.headers.origin || "https://lexpremium.com.br", // Replace with real redirect if needed
          payer_email: payerEmail,
          status: "pending",
          external_reference: officeId, // Used to identify the subscription in webhooks
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Mercado Pago Error:", data);
        return res.status(response.status).json({ error: data.message || "Erro ao criar assinatura no Mercado Pago" });
      }

      res.json({ init_point: data.init_point, id: data.id });
    } catch (error: any) {
      console.error("Mercado Pago Connection Error:", error);
      res.status(500).json({ error: "Falha de comunicação com gateway de pagamento." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
