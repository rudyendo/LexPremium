/**
 * Suggests a professional action object for a legal deadline based on the type of document and company.
 * Fetches from the server-side API to keep the Gemini API key secure.
 */
export async function suggestActionObject(peca: string, empresa: string): Promise<string> {
  if (!peca || !empresa) return "";

  try {
    const response = await fetch("/api/gemini/suggest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ peca, empresa }),
    });

    if (!response.ok) {
      throw new Error("Falha na resposta do servidor");
    }

    const data = await response.json();
    return data.suggestion || "Protocolar manifestação técnica conforme prazo processual.";
  } catch (error) {
    console.error("Gemini Suggestion Error:", error);
    return "Protocolar manifestação técnica conforme prazo processual.";
  }
}
