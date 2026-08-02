const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Dossier = {
  client: string;
  title: string;
  objective: string;
  context?: string;
  watch_keywords?: string[];
  watch_priority_phrases?: string[];
  watch_excluded_keywords?: string[];
};

type WatchItem = {
  title: string;
  nature?: string;
  urgency?: string;
  source_url?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cleanApiKey(raw: string) {
  const match = String(raw || "").normalize("NFKC").match(/sk-[A-Za-z0-9_-]+/);
  return match?.[0] || "";
}

function clip(value: unknown, max: number) {
  return String(value ?? "").slice(0, max).trim();
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = payload?.output?.flatMap((item: any) => item?.content || []) || [];
  return chunks.map((chunk: any) => chunk?.text || "").join("");
}

function cleanList(value: any, max = 12) {
  return Array.isArray(value)
    ? value.map((x: any) => clip(x, 260)).filter(Boolean).slice(0, max)
    : [];
}

function parseJsonObject(raw: unknown) {
  let text = String(raw ?? "").trim();
  if (!text) return null;

  text = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {}

  const firstBrace = text.indexOf("{");
  if (firstBrace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = firstBrace; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(firstBrace, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
        } catch {}
        return null;
      }
    }
  }

  return null;
}

async function requireAuthenticatedQuota(req: Request, feature: string) {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Session Myvor requise." }, 401);
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !anonKey) {
    return json({ error: "La sécurité Supabase de Myvor n’est pas configurée." }, 503);
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!userResponse.ok) return json({ error: "Session Myvor invalide ou expirée." }, 401);
    const user = await userResponse.json().catch(() => null);
    if (!user?.id) return json({ error: "Session Myvor invalide ou expirée." }, 401);

    const quotaResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_feature: feature }),
    });
    if (!quotaResponse.ok) return json({ error: "Impossible de vérifier le quota IA Myvor." }, 503);
    const allowed = await quotaResponse.json().catch(() => false);
    if (allowed !== true) {
      return json({ error: "Trop de générations IA en peu de temps. Réessaie dans quelques minutes." }, 429);
    }
    return null;
  } catch {
    return json({ error: "Impossible de vérifier la session Myvor." }, 503);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const authError = await requireAuthenticatedQuota(req, "dossier-profile");
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const dossier: Dossier | null = body?.dossier || null;
  const items: WatchItem[] = Array.isArray(body?.items) ? body.items.slice(0, 20) : [];

  if (!dossier?.title || !dossier?.objective) {
    return json({ error: "Le dossier doit avoir au moins un titre et un objectif." }, 400);
  }

  const apiKey = cleanApiKey(Deno.env.get("OPENAI_API_KEY") || "");
  if (!apiKey) {
    return json({ error: "Le secret OPENAI_API_KEY n’est pas configuré dans Supabase." }, 503);
  }

  const prompt = [
    "Tu es Myvor, assistant expert en affaires publiques françaises et européennes.",
    "Ta mission est de pré-remplir la fiche stratégique d'un dossier client à partir UNIQUEMENT des informations fournies.",
    "Ne présente jamais comme certain un élément qui n'est pas établi par le dossier ou les titres de veille.",
    "Tu peux proposer des catégories métier raisonnables (secteur, thèmes, risques, opportunités, acteurs institutionnels probables), mais formule-les de manière générique et exploitable.",
    "N'invente aucun nom de personne, aucune échéance précise, aucun texte juridique précis ni aucune position politique non fournie.",
    "Les acteurs institutionnels peuvent être des institutions ou catégories d'acteurs pertinentes, jamais des personnes inventées.",
    "Les textes de référence doivent rester vides si aucun texte identifiable n'est fourni.",
    "Les échéances doivent rester vides si aucune échéance fiable n'est fournie.",
    "Réponds uniquement avec un objet JSON valide, sans markdown, sans commentaire avant ou après.",
    "Structure exacte :",
    JSON.stringify({
      sector: "string",
      activity: "string",
      strategic_issues: ["string"],
      risks_to_avoid: ["string"],
      opportunities: ["string"],
      client_position: "string",
      key_actors: ["string"],
      watch_topics: ["string"],
      watch_subtopics: ["string"],
      reference_texts: ["string"],
      key_deadlines: ["string"],
      internal_notes: "string",
    }),
    "DOSSIER :",
    JSON.stringify({
      client: clip(dossier.client, 300),
      title: clip(dossier.title, 300),
      objective: clip(dossier.objective, 1500),
      context: clip(dossier.context, 2500),
      watch_keywords: cleanList(dossier.watch_keywords, 30),
      watch_priority_phrases: cleanList(dossier.watch_priority_phrases, 20),
      watch_excluded_keywords: cleanList(dossier.watch_excluded_keywords, 20),
    }),
    "TEXTES DÉJÀ LIÉS (titres uniquement, ne pas inférer leur contenu intégral) :",
    JSON.stringify(
      items.map((item) => ({
        title: clip(item.title, 500),
        nature: clip(item.nature, 120),
        urgency: clip(item.urgency, 80),
        source_url: clip(item.source_url, 700),
      })),
    ),
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-5-mini",
        input: prompt,
        max_output_tokens: 2200,
        text: { format: { type: "json_object" } },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text();
      let message = raw;
      try {
        message = JSON.parse(raw)?.error?.message || raw;
      } catch {}
      return json(
        {
          error: `OpenAI a refusé la requête (${response.status}) : ${String(message).slice(0, 260)}`,
        },
        502,
      );
    }

    const payload = await response.json();
    const outputText = extractOutputText(payload);
    const profile = parseJsonObject(outputText);

    if (!profile) {
      return json(
        {
          error: "La réponse OpenAI n’était pas un JSON valide.",
          diagnostic: String(outputText || "").slice(0, 500),
        },
        502,
      );
    }

    return json({
      profile: {
        sector: clip(profile.sector, 180),
        activity: clip(profile.activity, 700),
        strategic_issues: cleanList(profile.strategic_issues),
        risks_to_avoid: cleanList(profile.risks_to_avoid),
        opportunities: cleanList(profile.opportunities),
        client_position: clip(profile.client_position, 1200),
        key_actors: cleanList(profile.key_actors),
        watch_topics: cleanList(profile.watch_topics),
        watch_subtopics: cleanList(profile.watch_subtopics),
        reference_texts: cleanList(profile.reference_texts),
        key_deadlines: cleanList(profile.key_deadlines),
        internal_notes: clip(profile.internal_notes, 1600),
      },
      engine: "myvor-dossier-profile-ai-v3-authenticated",
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return json({ error: "La génération a dépassé 40 secondes. Réessaie." }, 504);
    }
    return json({ error: `Erreur de génération : ${error?.message || "inconnue"}` }, 500);
  } finally {
    clearTimeout(timer);
  }
});
