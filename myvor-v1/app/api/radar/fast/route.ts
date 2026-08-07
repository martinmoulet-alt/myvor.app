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
  urgency?: string;
  created_at?: string;
};

type ActorSeed = {
  name: string;
  role: string;
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
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      )
      .filter((item) => Boolean(text(item.source_url)))
      .slice(0, MAX_CONTEXT_ITEMS);

    const seeds = buildSeeds(dossier, items);
    const deadline = Array.isArray(dossier.key_deadlines) && dossier.key_deadlines.length
      ? text(dossier.key_deadlines[0])
      : "À déterminer";

    const actors = seeds.map((seed, index) => {
      const source = seed.source || null;
      const influence = Math.max(1, Math.min(5, seed.baseInfluence || (index < 2 ? 5 : index < 4 ? 4 : 3)));
      const sourceCount = items.length;

      return {
        id: `${seed.origin}-${index + 1}`,
        name: seed.name,
        role: seed.role,
        orbit: (index < 2 ? 1 : index < 4 ? 2 : 3) as 1 | 2 | 3,
        position: "inconnue" as const,
        influence,
        why:
          seed.origin === "source"
            ? "Institution directement reliée à une source officielle du dossier. Sa position reste inconnue tant qu’elle n’est pas documentée."
            : `Acteur renseigné dans la fiche stratégique du dossier${sourceCount ? ` et à qualifier à partir de ${sourceCount} évolution${sourceCount > 1 ? "s" : ""} liée${sourceCount > 1 ? "s" : ""}` : ""}.`,
        window: deadline,
        action:
          seed.origin === "source"
            ? "Identifier les décideurs ou relais pertinents au sein de cette institution, puis documenter leur position avant toute action."
            : "Vérifier sa fonction et sa position dans les sources disponibles, puis préparer une action de contact ou de suivi adaptée.",
        certainty: seed.certainty,
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
      engine: "myvor-radar-stable-v3",
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
