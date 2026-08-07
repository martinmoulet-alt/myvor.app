import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 18;

const MAX_CONTEXT_ITEMS = 24;

type Dossier = {
  id: string;
  client: string;
  title: string;
  objective: string;
  context?: string;
  key_deadlines?: string[];
};

type WatchItem = {
  id: string;
  title: string;
  nature: string;
  source_url?: string;
  urgency?: string;
};

type Actor = {
  id: string;
  name: string;
  role: string;
  orbit: 1 | 2 | 3;
  position: "favorable" | "inconnue" | "reserve" | "opposition";
  influence: number;
  why: string;
  window: string;
  action: string;
  certainty: "confirme" | "probable" | "a_confirmer";
  evidence: Record<string, unknown>;
  contact_email?: string;
  contact_phone?: string;
  contact_url?: string;
  contact_verified?: boolean;
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    actors: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          role: { type: "string" },
          orbit: { type: "integer", enum: [1, 2, 3] },
          influence: { type: "integer", minimum: 1, maximum: 5 },
          why: { type: "string" },
          window: { type: "string" },
          action: { type: "string" },
        },
        required: ["role", "orbit", "influence", "why", "window", "action"],
      },
    },
  },
  required: ["actors"],
};

function text(value: unknown, max = 1000) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, max)
    .trim();
}

function outputText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text.trim();
  return (payload?.output || [])
    .flatMap((item: any) => item?.content || [])
    .filter((part: any) => part?.type === "output_text")
    .map((part: any) => part?.text || "")
    .join("")
    .trim();
}

async function verifySessionAndQuota(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { ok: false as const, status: 401, error: "Session Myvor requise." };
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) {
    return { ok: false as const, status: 503, error: "La sécurité Supabase de Myvor n’est pas configurée." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2200);
  try {
    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: authorization },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!userResponse.ok) {
      return { ok: false as const, status: 401, error: "Session Myvor invalide ou expirée." };
    }

    const quotaResponse = await fetch(`${url}/rest/v1/rpc/consume_ai_quota`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_feature: "radar-enrich" }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!quotaResponse.ok) {
      return { ok: false as const, status: 503, error: "Impossible de vérifier le quota IA du Radar." };
    }
    const allowed = await quotaResponse.json().catch(() => false);
    if (allowed !== true) {
      return { ok: false as const, status: 429, error: "Trop d’enrichissements Radar en peu de temps. Réessaie dans quelques minutes." };
    }

    return { ok: true as const };
  } catch {
    return { ok: false as const, status: 503, error: "Impossible de vérifier la session Myvor." };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const auth = await verifySessionAndQuota(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const dossier = (body?.dossier || null) as Dossier | null;
  const items = (Array.isArray(body?.items) ? body.items : []) as WatchItem[];
  const actors = (Array.isArray(body?.actors) ? body.actors : []).slice(0, 6) as Actor[];

  if (!dossier || !actors.length) {
    return NextResponse.json({ error: "Génère d’abord le Radar stable avant de l’enrichir." }, { status: 400 });
  }

  const apiKey = text(process.env.OPENAI_API_KEY, 300);
  if (!apiKey) {
    return NextResponse.json({ error: "Moteur d’enrichissement Radar non configuré." }, { status: 503 });
  }

  const actorInput = actors.map((actor) => ({
    name: text(actor.name, 180),
    current_role: text(actor.role, 260),
    current_orbit: actor.orbit,
    current_influence: actor.influence,
  }));
  const sourceInput = items.slice(0, MAX_CONTEXT_ITEMS).map((item) => ({
    title: text(item.title, 420),
    nature: text(item.nature, 120),
    urgency: text(item.urgency, 80),
    url: text(item.source_url, 700),
  }));

  const prompt = [
    "MYVOR — enrichissement stratégique du Radar d’influence.",
    "Tu enrichis UNIQUEMENT les acteurs déjà fournis. N’ajoute, ne supprime et ne renomme aucun acteur.",
    `Tu dois prendre en compte l’ensemble des ${sourceInput.length} évolutions de veille fournies pour construire une lecture transversale du dossier.`,
    "Tu n’as pas le contenu intégral des sources : les titres et URL sont seulement des repères. N’invente aucun fait, position politique, date précise, compétence formelle ou citation à partir d’un titre ou d’une URL.",
    "Ton travail porte sur la lecture stratégique : rôle générique, proximité décisionnelle (orbite), niveau d’influence estimé, raison de pertinence, fenêtre d’action prudente et action recommandée.",
    "Les recommandations doivent être opérationnelles pour un consultant en affaires publiques, mais toute information non établie doit rester formulée comme hypothèse ou point à vérifier.",
    "Ne déduis jamais une position favorable, réservée ou opposée : la position restera gérée séparément par Myvor.",
    "Réponds dans le même ordre que la liste ACTEURS et avec exactement le même nombre d’éléments.",
    `CLIENT: ${text(dossier.client, 240)}`,
    `DOSSIER: ${text(dossier.title, 320)}`,
    `OBJECTIF: ${text(dossier.objective, 1200)}`,
    `CONTEXTE: ${text(dossier.context, 1800) || "Non renseigné"}`,
    `ÉCHÉANCES FOURNIES: ${JSON.stringify((dossier.key_deadlines || []).slice(0, 5).map((value) => text(value, 220)))}`,
    `ACTEURS: ${JSON.stringify(actorInput)}`,
    `ÉVOLUTIONS DE VEILLE (${sourceInput.length}): ${JSON.stringify(sourceInput)}`,
  ].join("\n");

  const model = text(process.env.OPENAI_RADAR_ENRICH_MODEL || process.env.OPENAI_RADAR_MODEL || "gpt-4.1-mini", 120);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens: 1300,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "myvor_radar_enrichment_v2",
            strict: true,
            schema: OUTPUT_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text();
      let message = raw;
      try {
        message = JSON.parse(raw)?.error?.message || raw;
      } catch {}
      return NextResponse.json(
        { error: `Enrichissement IA indisponible (${response.status}) : ${String(message).slice(0, 240)}` },
        { status: 502 },
      );
    }

    const payload = await response.json();
    const rawOutput = outputText(payload);
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawOutput);
    } catch {}

    const enrichment = Array.isArray(parsed?.actors) ? parsed.actors : [];
    if (enrichment.length !== actors.length) {
      return NextResponse.json({ error: "L’enrichissement IA n’a pas renvoyé une cartographie cohérente." }, { status: 502 });
    }

    const enrichedActors = actors.map((actor, index) => {
      const item = enrichment[index] || {};
      return {
        ...actor,
        role: text(item.role, 260) || actor.role,
        orbit: [1, 2, 3].includes(Number(item.orbit)) ? Number(item.orbit) : actor.orbit,
        influence: Math.max(1, Math.min(5, Math.round(Number(item.influence) || actor.influence))),
        why: text(item.why, 650) || actor.why,
        window: text(item.window, 360) || actor.window,
        action: text(item.action, 520) || actor.action,
        position: actor.position,
        certainty: "a_confirmer",
      };
    });

    return NextResponse.json({
      actors: enrichedActors,
      enrichment: {
        status: "strategic_enrichment",
        grounded: false,
        source_content_read: false,
        actor_discovery: false,
        watch_items_used: sourceInput.length,
      },
      engine: "myvor-radar-enrichment-v2",
      model,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return NextResponse.json({ error: "L’enrichissement IA a dépassé le délai prévu. Le Radar stable reste disponible." }, { status: 504 });
    }
    return NextResponse.json({ error: error?.message || "Enrichissement Radar impossible." }, { status: 500 });
  } finally {
    clearTimeout(timer);
  }
}
