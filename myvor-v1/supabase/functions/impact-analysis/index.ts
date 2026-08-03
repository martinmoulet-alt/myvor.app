const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ImpactDepth = "express" | "standard" | "deep";

const PROMPT_VERSION = "impact-prompt-v3.1";
const ENGINE_VERSION = "myvor-impact-authenticated-v3.1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function clip(value: unknown, max: number) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, max)
    .trim();
}

function cleanApiKey(raw: string) {
  const match = String(raw || "")
    .normalize("NFKC")
    .match(/sk-[A-Za-z0-9_-]+/);
  return match?.[0] || "";
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = payload?.output?.flatMap((item: any) => item?.content || []) || [];
  return chunks.map((chunk: any) => chunk?.text || "").join("");
}

function parseJson(raw: unknown) {
  const text = String(raw ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Try to recover the first complete JSON object below.
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function clampNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, Math.round(number)))
    : 0;
}

function cleanArray(value: any, maxItems: number, maxChars: number) {
  return Array.isArray(value)
    ? value
        .slice(0, maxItems)
        .map((item: any) =>
          typeof item === "string" ? clip(item, maxChars) : item,
        )
        .filter(Boolean)
    : [];
}

async function requireAuthenticatedQuota(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Session Myvor requise." }, 401);
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !anonKey) {
    return json(
      { error: "La sécurité Supabase de Myvor n’est pas configurée." },
      503,
    );
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!userResponse.ok) {
      return json({ error: "Session Myvor invalide ou expirée." }, 401);
    }
    const user = await userResponse.json().catch(() => null);
    if (!user?.id) {
      return json({ error: "Session Myvor invalide ou expirée." }, 401);
    }

    const quotaResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/consume_ai_quota`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_feature: "impact" }),
      },
    );
    if (!quotaResponse.ok) {
      return json({ error: "Impossible de vérifier le quota IA Myvor." }, 503);
    }
    const allowed = await quotaResponse.json().catch(() => false);
    if (allowed !== true) {
      return json(
        {
          error:
            "Trop de Notes d’impact générées en peu de temps. Réessaie dans quelques minutes.",
        },
        429,
      );
    }
    return null;
  } catch {
    return json({ error: "Impossible de vérifier la session Myvor." }, 503);
  }
}

function normalizeImpact(raw: any, depth: ImpactDepth) {
  const detail = {
    juridique: clampNumber(raw?.score_detail?.juridique, 0, 20),
    economique_operationnel: clampNumber(
      raw?.score_detail?.economique_operationnel,
      0,
      20,
    ),
    urgence: clampNumber(raw?.score_detail?.urgence, 0, 15),
    probabilite: clampNumber(raw?.score_detail?.probabilite, 0, 15),
    politique_reputation: clampNumber(
      raw?.score_detail?.politique_reputation,
      0,
      15,
    ),
    capacite_action: clampNumber(raw?.score_detail?.capacite_action, 0, 15),
  };
  const detailTotal = Object.values(detail).reduce(
    (sum, value) => sum + value,
    0,
  );
  const score = detailTotal > 0 ? detailTotal : clampNumber(raw?.score, 0, 100);

  const limits =
    depth === "express"
      ? { disp: 3, risks: 3, opps: 2, deadlines: 2, recs: 3, confirm: 5 }
      : depth === "deep"
        ? { disp: 5, risks: 5, opps: 4, deadlines: 4, recs: 6, confirm: 10 }
        : { disp: 6, risks: 5, opps: 4, deadlines: 4, recs: 6, confirm: 8 };

  const dispositions = Array.isArray(raw?.dispositions_concernees)
    ? raw.dispositions_concernees
        .slice(0, limits.disp)
        .map((item: any) => ({
          disposition: clip(item?.disposition, 650),
          impact_client: clip(item?.impact_client, 850),
          niveau: clip(item?.niveau, 80) || "moyen",
        }))
        .filter((item: any) => item.disposition || item.impact_client)
    : [];

  const risks = Array.isArray(raw?.risques)
    ? raw.risques
        .slice(0, limits.risks)
        .map((item: any) => ({
          titre: clip(item?.titre, 220),
          description: clip(item?.description, 700),
          niveau: clip(item?.niveau, 80) || "moyen",
        }))
        .filter((item: any) => item.titre || item.description)
    : [];

  const opportunities = Array.isArray(raw?.opportunites)
    ? raw.opportunites
        .slice(0, limits.opps)
        .map((item: any) => ({
          titre: clip(item?.titre, 220),
          description: clip(item?.description, 700),
        }))
        .filter((item: any) => item.titre || item.description)
    : [];

  const deadlines = Array.isArray(raw?.echeances)
    ? raw.echeances
        .slice(0, limits.deadlines)
        .map((item: any) => ({
          date: clip(item?.date, 160),
          evenement: clip(item?.evenement, 420),
          importance: clip(item?.importance, 420),
        }))
        .filter((item: any) => item.date || item.evenement)
    : [];

  const recommendations = Array.isArray(raw?.recommandations)
    ? raw.recommandations
        .slice(0, limits.recs)
        .map((item: any) => ({
          action: clip(item?.action, 520),
          raison: clip(item?.raison, 650),
          priorite: clip(item?.priorite, 80),
        }))
        .filter((item: any) => item.action)
    : [];

  const justifications = {
    juridique: clip(raw?.score_justifications?.juridique, 700),
    economique_operationnel: clip(
      raw?.score_justifications?.economique_operationnel,
      700,
    ),
    urgence: clip(raw?.score_justifications?.urgence, 700),
    probabilite: clip(raw?.score_justifications?.probabilite, 700),
    politique_reputation: clip(
      raw?.score_justifications?.politique_reputation,
      700,
    ),
    capacite_action: clip(raw?.score_justifications?.capacite_action, 700),
  };

  return {
    synthese: clip(raw?.synthese, depth === "deep" ? 2400 : 1700),
    score,
    justification_score: clip(raw?.justification_score, 1300),
    score_detail: detail,
    score_justifications: justifications,
    dispositions_concernees: dispositions,
    risques: risks,
    opportunites: opportunities,
    echeances: deadlines,
    recommandations: recommendations,
    informations_a_confirmer: cleanArray(
      raw?.informations_a_confirmer,
      limits.confirm,
      500,
    ).map((item: any) => clip(item, 500)),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Méthode non autorisée." }, 405);
  }

  const authError = await requireAuthenticatedQuota(req);
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const depth: ImpactDepth = ["express", "standard", "deep"].includes(
    String(body?.depth),
  )
    ? body.depth
    : "standard";

  const client = clip(body?.client, 300);
  const contexte = clip(body?.contexte, 3200);
  const objectif = clip(body?.objectif, 1800);
  const titre = clip(body?.titre, 600);
  const lienOfficiel = clip(body?.lien_officiel, 900);
  const texte = clip(
    body?.texte,
    depth === "express" ? 30000 : depth === "deep" ? 50000 : 44000,
  );

  if (!client || !objectif || !titre || !texte) {
    return json(
      { error: "Client, objectif, titre et corpus sont obligatoires." },
      400,
    );
  }

  const apiKey = cleanApiKey(Deno.env.get("OPENAI_API_KEY") || "");
  if (!apiKey) {
    return json(
      { error: "Le secret OPENAI_API_KEY n’est pas configuré dans Supabase." },
      503,
    );
  }

  const model = Deno.env.get("OPENAI_IMPACT_MODEL") || "gpt-4.1-mini";
  const depthRule =
    depth === "express"
      ? "Analyse express : priorise les signaux décisionnels et les actions immédiates."
      : depth === "deep"
        ? "Analyse approfondie : croise les sources, justifie chaque critère et explicite les incertitudes. Reste dense et évite les répétitions afin de respecter le délai de production."
        : "Analyse standard complète, concise et opérationnelle.";

  const prompt = [
    "Tu es le moteur de Note d’impact de Myvor, spécialisé en affaires publiques françaises et européennes.",
    depthRule,
    "Tu analyses UNIQUEMENT le corpus fourni. N’invente aucun fait, calendrier, position, disposition ou chiffre absent des sources.",
    "Si une information utile n’est pas vérifiable, place-la dans informations_a_confirmer.",
    "Le score mesure l’impact sur l’objectif précis du client, pas l’importance générale du texte.",
    "Barème proposé sur 100 : juridique 0-20 ; économique/opérationnel 0-20 ; urgence institutionnelle 0-15 ; probabilité d’évolution/adoption 0-15 ; politique/réputation 0-15 ; capacité d’action du client 0-15.",
    "Chaque sous-score doit être justifié séparément. Myvor appliquera ensuite sa grille déterministe et pourra plafonner les scores insuffisamment étayés.",
    "Pour chaque échéance, donne une date calendaire explicite avec année uniquement si elle figure réellement dans le corpus.",
    "Réponds uniquement en JSON valide avec cette structure exacte :",
    JSON.stringify({
      synthese: "string",
      score: 0,
      justification_score: "string",
      score_detail: {
        juridique: 0,
        economique_operationnel: 0,
        urgence: 0,
        probabilite: 0,
        politique_reputation: 0,
        capacite_action: 0,
      },
      score_justifications: {
        juridique: "string",
        economique_operationnel: "string",
        urgence: "string",
        probabilite: "string",
        politique_reputation: "string",
        capacite_action: "string",
      },
      dispositions_concernees: [
        { disposition: "string", impact_client: "string", niveau: "moyen" },
      ],
      risques: [{ titre: "string", description: "string", niveau: "moyen" }],
      opportunites: [{ titre: "string", description: "string" }],
      echeances: [
        { date: "string", evenement: "string", importance: "string" },
      ],
      recommandations: [
        { action: "string", raison: "string", priorite: "string" },
      ],
      informations_a_confirmer: ["string"],
    }),
    "CLIENT :",
    client,
    "OBJECTIF CLIENT :",
    objectif,
    "CONTEXTE DOSSIER :",
    contexte || "Non renseigné.",
    "TITRE / CORPUS :",
    titre,
    lienOfficiel ? `SOURCE OFFICIELLE PRINCIPALE : ${lienOfficiel}` : "",
    "CORPUS ANALYSÉ :",
    texte,
  ]
    .filter(Boolean)
    .join("\n\n");

  const timeoutMs = depth === "deep" ? 38000 : depth === "standard" ? 34000 : 28000;
  const maxOutputTokens =
    depth === "deep" ? 2600 : depth === "standard" ? 2100 : 1400;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

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
        max_output_tokens: maxOutputTokens,
        text: { format: { type: "json_object" } },
        store: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text();
      let message = raw;
      try {
        message = JSON.parse(raw)?.error?.message || raw;
      } catch {
        // Keep the raw response when OpenAI did not return JSON.
      }
      return json(
        {
          error: `OpenAI a refusé la Note d’impact (${response.status}) : ${String(
            message,
          ).slice(0, 280)}`,
        },
        502,
      );
    }

    const payload = await response.json();
    const parsed = parseJson(extractOutputText(payload));
    if (!parsed) {
      return json(
        { error: "La réponse IA de la Note d’impact n’était pas exploitable." },
        502,
      );
    }

    const impact = normalizeImpact(parsed, depth);
    if (!impact.synthese) {
      return json(
        { error: "La réponse IA de la Note d’impact est incomplète." },
        502,
      );
    }

    return json({
      impact,
      engine: ENGINE_VERSION,
      model,
      prompt_version: PROMPT_VERSION,
      depth,
      execution_ms: Date.now() - startedAt,
      latency_budget_ms: timeoutMs,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return json(
        {
          error: `La Note d’impact ${depth} a dépassé le budget d’analyse sécurisé de ${Math.round(
            timeoutMs / 1000,
          )} secondes.`,
        },
        504,
      );
    }
    return json(
      { error: `Erreur de Note d’impact : ${error?.message || "inconnue"}` },
      500,
    );
  } finally {
    clearTimeout(timer);
  }
});
