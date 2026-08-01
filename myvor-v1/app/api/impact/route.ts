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

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function mapImpactToNote(impact: any, dossier: Dossier, items: WatchItem[]) {
  const risks = Array.isArray(impact?.risques)
    ? impact.risques.map((risk: any) =>
        [asText(risk?.titre), asText(risk?.description)].filter(Boolean).join(" — "),
      ).filter(Boolean)
    : [];

  const opportunities = Array.isArray(impact?.opportunites)
    ? impact.opportunites.map((opportunity: any) =>
        [asText(opportunity?.titre), asText(opportunity?.description)].filter(Boolean).join(" — "),
      ).filter(Boolean)
    : [];

  const deadlines = Array.isArray(impact?.echeances)
    ? impact.echeances.map((deadline: any) =>
        [asText(deadline?.date), asText(deadline?.evenement), asText(deadline?.importance)]
          .filter(Boolean)
          .join(" — "),
      ).filter(Boolean)
    : [];

  const recommendations = Array.isArray(impact?.recommandations)
    ? impact.recommandations.map((recommendation: any) =>
        [asText(recommendation?.action), asText(recommendation?.raison)]
          .filter(Boolean)
          .join(" — "),
      ).filter(Boolean)
    : [];

  const level = asText(impact?.niveau).replaceAll("_", " ") || "moyen";

  return {
    title: `Note d’impact — ${dossier.title}`,
    executive_summary: asText(impact?.synthese),
    score: Number(impact?.score) || 0,
    level,
    rationale: asText(impact?.justification_score),
    risks,
    opportunities,
    deadlines,
    recommendations,
    sources_used: items.map((item) => ({
      title: item.title,
      url: item.source_url || "",
    })),
    score_detail: impact?.score_detail || null,
    dispositions_concernees: Array.isArray(impact?.dispositions_concernees)
      ? impact.dispositions_concernees
      : [],
    informations_a_confirmer: Array.isArray(impact?.informations_a_confirmer)
      ? impact.informations_a_confirmer
      : [],
  };
}

export async function POST(request: Request) {
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

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "La connexion Supabase de Myvor n’est pas configurée." },
      { status: 503 },
    );
  }

  const sourceText = items
    .map((item, index) => {
      const parts = [
        `${index + 1}. ${item.title}`,
        item.nature ? `Nature : ${item.nature}` : "",
        item.urgency ? `Niveau signalé dans la veille : ${item.urgency}` : "",
        item.source_url ? `Source officielle : ${item.source_url}` : "",
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n\n");

  const firstSourceUrl = items.find((item) => item.source_url)?.source_url || "";

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/impact-analysis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client: dossier.client,
        contexte: dossier.context || "",
        objectif: dossier.objective,
        titre: items.length === 1 ? items[0].title : `${dossier.title} — ${items.length} textes analysés`,
        lien_officiel: firstSourceUrl,
        texte: sourceText,
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload?.error ||
            `La fonction impact-analysis a échoué (${response.status}).`,
        },
        { status: response.status >= 400 && response.status < 600 ? response.status : 502 },
      );
    }

    const impact = payload?.impact;
    if (!impact || typeof impact?.score !== "number") {
      return NextResponse.json(
        { error: "La fonction impact-analysis n’a pas retourné une Note d’impact exploitable." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      note: mapImpactToNote(impact, dossier, items),
      engine: "supabase-impact-analysis",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Impossible de joindre la fonction impact-analysis." },
      { status: 502 },
    );
  }
}
