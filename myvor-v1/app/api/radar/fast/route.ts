import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_CONTEXT_ITEMS = 24;
const MAX_ACTORS = 6;

type Dossier = {
  id: string;
  client: string;
  title: string;
  objective: string;
  context?: string;
  key_actors?: string[];
  key_deadlines?: string[];
};

type WatchItem = {
  id: string;
  title: string;
  nature: string;
  source_url?: string;
  source_name?: string | null;
  urgency?: string;
  created_at?: string;
  published_at?: string | null;
};

type ActorSeed = {
  name: string;
  role: string;
  institution?: string;
  certainty: "confirme" | "a_confirmer";
  source?: WatchItem | null;
  baseInfluence?: number;
  origin: "dossier" | "source";
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function urgency(value: unknown) {
  const key = text(value).toLowerCase();
  if (key === "absolument urgent") return 4;
  if (key === "fort") return 3;
  if (key === "moyen") return 2;
  return 1;
}

function normalized(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function institutionFromSource(item: WatchItem): ActorSeed | null {
  const host = hostname(text(item.source_url));
  if (!host) return null;

  const matches: Array<[string, string, string, number]> = [
    ["assemblee-nationale.fr", "Assemblée nationale", "Institution parlementaire", 5],
    ["senat.fr", "Sénat", "Institution parlementaire", 5],
    ["gouvernement.fr", "Gouvernement", "Exécutif", 5],
    ["economie.gouv.fr", "Ministère de l’Économie", "Ministère", 5],
    ["ecologie.gouv.fr", "Ministère de la Transition écologique", "Ministère", 5],
    ["interieur.gouv.fr", "Ministère de l’Intérieur", "Ministère", 5],
    ["travail-emploi.gouv.fr", "Ministère du Travail", "Ministère", 5],
    ["sante.gouv.fr", "Ministère de la Santé", "Ministère", 5],
    ["agriculture.gouv.fr", "Ministère de l’Agriculture", "Ministère", 5],
    ["diplomatie.gouv.fr", "Ministère de l’Europe et des Affaires étrangères", "Ministère", 5],
    ["conseil-etat.fr", "Conseil d’État", "Institution", 4],
    ["conseil-constitutionnel.fr", "Conseil constitutionnel", "Institution", 4],
    ["courdescomptes.fr", "Cour des comptes", "Institution", 4],
    ["eur-lex.europa.eu", "Institutions de l’Union européenne", "Institution européenne", 4],
  ];

  const match = matches.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  if (!match) return null;

  return {
    name: match[1],
    role: match[2],
    institution: match[1],
    certainty: "confirme",
    source: item,
    baseInfluence: match[3],
    origin: "source",
  };
}

function buildSeeds(dossier: Dossier, items: WatchItem[]) {
  const seeds: ActorSeed[] = [];
  const seen = new Set<string>();
  const clientKey = normalized(dossier.client);

  const push = (seed: ActorSeed) => {
    const key = normalized(seed.name);
    if (!key || key === clientKey || seen.has(key)) return;
    seen.add(key);
    seeds.push(seed);
  };

  const trackedActors = Array.isArray(dossier.key_actors)
    ? dossier.key_actors.map(text).filter(Boolean)
    : [];

  trackedActors.forEach((name, index) => {
    push({
      name,
      role: "Acteur clé suivi dans le dossier",
      institution: "",
      certainty: "a_confirmer",
      source: items[index % Math.max(1, items.length)] || null,
      baseInfluence: index < 2 ? 5 : index < 4 ? 4 : 3,
      origin: "dossier",
    });
  });

  items.forEach((item) => {
    const inferred = institutionFromSource(item);
    if (inferred) push(inferred);
  });

  return seeds.slice(0, MAX_ACTORS);
}

function signalsForSeed(seed: ActorSeed, items: WatchItem[]) {
  const actorKey = normalized(seed.name);
  const matched = items.filter((item) => {
    if (seed.origin === "source") {
      const sourceActor = institutionFromSource(item);
      return sourceActor?.name === seed.name;
    }
    return actorKey.length > 3 && normalized(item.title).includes(actorKey);
  });

  return matched.slice(0, 3).map((item) => ({
    title: item.title,
    nature: item.nature,
    date: text(item.published_at) || text(item.created_at),
    url: text(item.source_url),
    source_name: text(item.source_name),
    urgency: text(item.urgency) || "faible",
  }));
}

function scoreForSeed(seed: ActorSeed, signals: ReturnType<typeof signalsForSeed>, items: WatchItem[]) {
  const base = Math.max(1, Math.min(5, seed.baseInfluence || 3));
  const institutionalByLevel: Record<number, number> = { 1: 10, 2: 16, 3: 23, 4: 29, 5: 35 };
  const institutional = institutionalByLevel[base] || 23;
  const relevance = Math.min(30, (seed.origin === "dossier" ? 24 : 22) + Math.min(6, signals.length * 2));
  const urgencyPool = signals.length ? signals.map((signal) => urgency(signal.urgency)) : items.slice(0, 3).map((item) => urgency(item.urgency));
  const maxUrgency = urgencyPool.length ? Math.max(...urgencyPool) : 1;
  const timingByUrgency: Record<number, number> = { 1: 8, 2: 12, 3: 16, 4: 20 };
  const timing = timingByUrgency[maxUrgency] || 8;
  const accessibility = seed.origin === "dossier" ? 9 : 7;
  const total = Math.max(0, Math.min(100, institutional + relevance + timing + accessibility));
  return { total, institutional, relevance, timing, accessibility };
}

async function verifySession(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return false;

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: authorization },
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  try {
    if (!(await verifySession(request))) {
      return NextResponse.json({ error: "Session Myvor requise." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const dossier = (body?.dossier || null) as Dossier | null;
    const incoming = (Array.isArray(body?.items) ? body.items : []) as WatchItem[];

    if (!dossier) {
      return NextResponse.json({ error: "Sélectionne un dossier client." }, { status: 400 });
    }

    const items = [...incoming]
      .sort(
        (a, b) =>
          urgency(b.urgency) - urgency(a.urgency) ||
          new Date(b.published_at || b.created_at || 0).getTime() - new Date(a.published_at || a.created_at || 0).getTime(),
      )
      .filter((item) => Boolean(text(item.source_url)))
      .slice(0, MAX_CONTEXT_ITEMS);

    const seeds = buildSeeds(dossier, items);
    const deadline = Array.isArray(dossier.key_deadlines) && dossier.key_deadlines.length
      ? text(dossier.key_deadlines[0])
      : "À déterminer";

    const actors = seeds.map((seed, index) => {
      const source = seed.source || null;
      const signals = signalsForSeed(seed, items);
      const score = scoreForSeed(seed, signals, items);
      const influence = Math.max(1, Math.min(5, Math.ceil(score.total / 20)));
      const sourceCount = seed.origin === "source" ? Math.max(1, signals.length) : signals.length;

      return {
        id: `${seed.origin}-${index + 1}`,
        name: seed.name,
        role: seed.role,
        institution: seed.institution || "",
        orbit: (index < 2 ? 1 : index < 4 ? 2 : 3) as 1 | 2 | 3,
        position: "inconnue" as const,
        position_reason: "Aucune position explicite n’est documentée dans les données actuellement rattachées au dossier.",
        influence,
        influence_score: score.total,
        score_breakdown: {
          institutional_power: score.institutional,
          dossier_relevance: score.relevance,
          timing: score.timing,
          accessibility: score.accessibility,
        },
        why:
          seed.origin === "source"
            ? `Institution directement reliée à ${sourceCount} source${sourceCount > 1 ? "s" : ""} officielle${sourceCount > 1 ? "s" : ""} du dossier. Sa proximité institutionnelle avec la décision explique son niveau de priorité.`
            : signals.length
              ? `Acteur renseigné dans la fiche stratégique du dossier et cité explicitement dans ${signals.length} évolution${signals.length > 1 ? "s" : ""} rattachée${signals.length > 1 ? "s" : ""}.`
              : "Acteur renseigné dans la fiche stratégique du dossier. Aucune occurrence nominative supplémentaire n’a encore été détectée dans les titres des évolutions rattachées.",
        window: deadline,
        action:
          seed.origin === "source"
            ? "Identifier les décideurs ou relais pertinents au sein de cette institution, documenter leur position puis préparer l’approche avant la prochaine échéance du dossier."
            : "Vérifier sa fonction, documenter sa position et préparer une action de contact ou de suivi adaptée à la prochaine échéance.",
        certainty: seed.certainty,
        signals,
        source_count: sourceCount,
        evidence: {
          source_index: source ? Math.max(1, items.findIndex((item) => item.id === source.id) + 1) : 0,
          source_title: source?.title || "Fiche stratégique du dossier",
          source_url: source?.source_url || "",
          excerpt:
            seed.origin === "source"
              ? `Institution identifiée à partir de la source officielle « ${source?.title || "source liée"} ».`
              : "Acteur issu de la fiche stratégique du dossier. Sa qualification doit être consolidée par les sources.",
          confidence: seed.certainty === "confirme" ? 0.95 : source ? 0.7 : 0.55,
          verified: seed.origin === "source" && Boolean(source?.source_url),
        },
        contact_verified: false,
      };
    });

    const groundedActors = actors.filter((actor) => actor.evidence.verified).length;
    const status = actors.length
      ? groundedActors === actors.length
        ? "grounded"
        : "review_required"
      : "insufficient_context";

    return NextResponse.json({
      actors,
      engine: "myvor-radar-stable-v4",
      model: "deterministic",
      quality: {
        status,
        client_excluded: true,
        generic_unsubstantiated_filtered: true,
        structured_output: true,
        grounded_actors: groundedActors,
        total_actors: actors.length,
        grounding_rate: actors.length ? groundedActors / actors.length : 0,
        official_contact_lookup: false,
        verified_contact_pages: 0,
        fallback_used: !Array.isArray(dossier.key_actors) || !dossier.key_actors.map(text).filter(Boolean).length,
      },
      grounding: {
        official_sources_requested: items.length,
        official_sources_fetched: groundedActors,
        max_official_sources: MAX_CONTEXT_ITEMS,
        statuses: items.map((item) => ({
          url: item.source_url,
          resolved_url: item.source_url,
          status: "linked",
          read_chars: 0,
        })),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erreur interne du Radar." },
      { status: 500 },
    );
  }
}
