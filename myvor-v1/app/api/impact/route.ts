import { NextResponse } from "next/server";

type Dossier = {
  id: string;
  client: string;
  title: string;
  objective: string;
  context?: string;
};

type WatchItem = {
  id: string;
  title: string;
  nature: string;
  urgency?: string;
  source_url?: string;
};

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = payload?.output?.flatMap((item: any) => item?.content || []) || [];
  return chunks.map((chunk: any) => chunk?.text || "").join("");
}

function cleanApiKey(raw: string) {
  return raw
    .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
    .replace(/^Bearer\s+/i, "")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export async function POST(request: Request) {
  const apiKey = cleanApiKey(process.env.OPENAI_API_KEY || "");
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY est absente dans Netlify." },
      { status: 503 },
    );
  }
  if (!apiKey.startsWith("sk-")) {
    return NextResponse.json(
      { error: "La clé OpenAI enregistrée dans Netlify n’a pas un format valide." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const dossier: Dossier | null = body?.dossier || null;
  const items: WatchItem[] = Array.isArray(body?.items) ? body.items.slice(0, 30) : [];

  if (!dossier) {
    return NextResponse.json({ error: "Sélectionne un dossier client." }, { status: 400 });
  }
  if (!items.length) {
    return NextResponse.json(
      { error: "Aucun élément de veille n’est rattaché à ce dossier." },
      { status: 400 },
    );
  }

  const prompt = [
    "Tu es l’analyste senior de Myvor, plateforme d’intelligence pour les affaires publiques.",
    "Produis une Note d’impact directement exploitable par un cabinet d’affaires publiques.",
    "Reste factuel, prudent et opérationnel. Ne présente jamais une hypothèse comme un fait.",
    "Le score doit mesurer l’impact du corpus sur l’objectif précis du client.",
    "Utilise cette échelle : faible = vert, moyen = orange, fort = rouge, absolument urgent = bordeaux.",
    "Réponds uniquement en JSON valide selon cette structure exacte :",
    JSON.stringify({
      title: "string",
      executive_summary: "string",
      score: 0,
      level: "faible | moyen | fort | absolument urgent",
      rationale: "string",
      risks: ["string"],
      opportunities: ["string"],
      deadlines: ["string"],
      recommendations: ["string"],
      sources_used: [{ title: "string", url: "string" }],
    }),
    "Dossier client :",
    JSON.stringify(dossier),
    "Éléments de veille :",
    JSON.stringify(items),
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        input: prompt,
        text: { format: { type: "json_object" } },
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      let message = raw;
      try {
        message = JSON.parse(raw)?.error?.message || raw;
      } catch {}
      return NextResponse.json(
        { error: `OpenAI a refusé la requête (${response.status}) : ${message.slice(0, 260)}` },
        { status: 502 },
      );
    }

    const payload = await response.json();
    const text = extractOutputText(payload);
    const note = JSON.parse(text || "{}");
    return NextResponse.json({ note });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "La génération de la note a échoué." },
      { status: 500 },
    );
  }
}
