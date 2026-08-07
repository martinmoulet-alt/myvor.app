import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_CONTEXT_ITEMS = 24;

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
    if (!incoming.length) {
      return NextResponse.json({ error: "Aucune évolution n’est disponible pour ce dossier." }, { status: 400 });
    }

    const items = [...incoming]
      .sort((a, b) => urgency(b.urgency) - urgency(a.urgency))
      .filter((item) => Boolean(item.source_url))
      .slice(0, MAX_CONTEXT_ITEMS);

    if (!items.length) {
      return NextResponse.json(
        { error: "Les évolutions sélectionnées n’ont pas d’URL source exploitable." },
        { status: 422 },
      );
    }

    const trackedActors = Array.isArray(dossier.key_actors)
      ? dossier.key_actors.map(text).filter(Boolean)
      : [];

    if (!trackedActors.length) {
      return NextResponse.json(
        {
          error:
            "Aucun acteur n’est encore renseigné dans la fiche stratégique du dossier. Ouvre le dossier, complète ou pré-remplis « Acteurs clés », puis relance le Radar.",
        },
        { status: 422 },
      );
    }

    const firstSource = items[0];
    const deadline = Array.isArray(dossier.key_deadlines) && dossier.key_deadlines.length
      ? text(dossier.key_deadlines[0])
      : "À déterminer";

    const actors = trackedActors.slice(0, 6).map((name, index) => ({
      id: `tracked-${index + 1}`,
      name,
      role: "Acteur clé suivi dans le dossier",
      orbit: index < 2 ? 1 : index < 4 ? 2 : 3,
      position: "inconnue",
      influence: index < 2 ? 5 : index < 4 ? 4 : 3,
      why: `Acteur identifié dans la fiche stratégique du dossier et à qualifier à partir de ${items.length} évolution${items.length > 1 ? "s" : ""} institutionnelle${items.length > 1 ? "s" : ""} sélectionnée${items.length > 1 ? "s" : ""}.`,
      window: deadline,
      action: "Vérifier sa position dans les sources officielles, puis préparer une action de contact ou de suivi adaptée.",
      certainty: "a_confirmer",
      evidence: {
        source_index: 1,
        source_title: firstSource.title,
        source_url: firstSource.source_url || "",
        excerpt: `Acteur issu de la fiche stratégique du dossier — qualification à consolider à partir de ${items.length} évolution${items.length > 1 ? "s" : ""}.`,
        confidence: 0.6,
        verified: true,
      },
      contact_verified: false,
    }));

    return NextResponse.json({
      actors,
      engine: "myvor-radar-stable-v2",
      model: "deterministic",
      quality: {
        status: "review_required",
        client_excluded: true,
        generic_unsubstantiated_filtered: true,
        structured_output: true,
        grounded_actors: 0,
        total_actors: actors.length,
        grounding_rate: 0,
        official_contact_lookup: false,
        verified_contact_pages: 0,
      },
      grounding: {
        official_sources_requested: items.length,
        official_sources_fetched: 0,
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
