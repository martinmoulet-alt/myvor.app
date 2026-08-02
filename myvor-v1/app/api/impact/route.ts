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

type ImpactDepth = "express" | "standard" | "deep";

type SourceExtraction = {
  url: string;
  content: string;
  status: "fetched" | "unavailable" | "unsupported";
};

const OFFICIAL_HOSTS = [
  "assemblee-nationale.fr",
  "www.assemblee-nationale.fr",
  "senat.fr",
  "www.senat.fr",
  "legifrance.gouv.fr",
  "www.legifrance.gouv.fr",
  "vie-publique.fr",
  "www.vie-publique.fr",
  "gouvernement.fr",
  "www.gouvernement.fr",
  "conseil-constitutionnel.fr",
  "www.conseil-constitutionnel.fr",
  "conseil-etat.fr",
  "www.conseil-etat.fr",
  "courdecassation.fr",
  "www.courdecassation.fr",
  "cnil.fr",
  "www.cnil.fr",
  "arcep.fr",
  "www.arcep.fr",
  "eur-lex.europa.eu",
];

const depthConfig:Record<ImpactDepth,{label:string;maxItems:number;maxUrls:number;sourceChars:number;instruction:string}>={
  express:{label:"Express",maxItems:3,maxUrls:2,sourceChars:18000,instruction:"NOTE EXPRESS. Va à l'essentiel. Synthèse courte. Maximum 3 risques, 2 opportunités, 1 à 2 échéances et 3 recommandations prioritaires. Ne développe que les dispositions ayant un impact direct et immédiat pour le client."},
  standard:{label:"Standard",maxItems:10,maxUrls:4,sourceChars:45000,instruction:"NOTE STANDARD. Produis une analyse complète pour le travail quotidien : synthèse exécutive, score argumenté, dispositions concernées, risques, opportunités, échéances et recommandations opérationnelles."},
  deep:{label:"Approfondie",maxItems:8,maxUrls:2,sourceChars:14000,instruction:"NOTE APPROFONDIE RAPIDE. Conserve une vraie valeur de conseil mais reste concise pour une génération sous la minute : synthèse 180 à 250 mots, justification séparée des six critères en 1 à 2 phrases chacun, maximum 4 dispositions, 4 risques, 3 opportunités, 3 échéances et 5 recommandations. Priorise les éléments directement utiles au client et n'invente rien."},
};

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n")
      .trim(),
  );
}

function isOfficialUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && OFFICIAL_HOSTS.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function fetchOfficialSource(rawUrl: string, maxChars:number): Promise<SourceExtraction> {
  if (!rawUrl || !isOfficialUrl(rawUrl)) {
    return { url: rawUrl, content: "", status: "unsupported" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(rawUrl, {
      headers: {
        "User-Agent": "Myvor/1.0 institutional-impact-analysis",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return { url: rawUrl, content: "", status: "unavailable" };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return { url: rawUrl, content: "", status: "unsupported" };
    }

    const raw = await response.text();
    const text = contentType.includes("text/html") ? htmlToText(raw) : raw.trim();
    return {
      url: rawUrl,
      content: text.slice(0, maxChars),
      status: text ? "fetched" : "unavailable",
    };
  } catch {
    return { url: rawUrl, content: "", status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

function mapImpactToNote(impact: any, dossier: Dossier, items: WatchItem[], depth:ImpactDepth) {
  let risks = Array.isArray(impact?.risques)
    ? impact.risques.map((risk: any) =>
        [asText(risk?.titre), asText(risk?.description)].filter(Boolean).join(" — "),
      ).filter(Boolean)
    : [];

  let opportunities = Array.isArray(impact?.opportunites)
    ? impact.opportunites.map((opportunity: any) =>
        [asText(opportunity?.titre), asText(opportunity?.description)].filter(Boolean).join(" — "),
      ).filter(Boolean)
    : [];

  let deadlines = Array.isArray(impact?.echeances)
    ? impact.echeances.map((deadline: any) =>
        [asText(deadline?.date), asText(deadline?.evenement), asText(deadline?.importance)]
          .filter(Boolean)
          .join(" — "),
      ).filter(Boolean)
    : [];

  let recommendations = Array.isArray(impact?.recommandations)
    ? impact.recommandations.map((recommendation: any) =>
        [asText(recommendation?.action), asText(recommendation?.raison)]
          .filter(Boolean)
          .join(" — "),
      ).filter(Boolean)
    : [];

  if(depth==="express"){
    risks=risks.slice(0,3);
    opportunities=opportunities.slice(0,2);
    deadlines=deadlines.slice(0,2);
    recommendations=recommendations.slice(0,3);
  }

  if(depth==="deep"){
    risks=risks.slice(0,4);
    opportunities=opportunities.slice(0,3);
    deadlines=deadlines.slice(0,3);
    recommendations=recommendations.slice(0,5);
  }

  const level = asText(impact?.niveau).replaceAll("_", " ") || "moyen";

  return {
    title: `Note d’impact ${depthConfig[depth].label.toLowerCase()} — ${dossier.title}`,
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
    score_justifications: impact?.score_justifications || null,
    dispositions_concernees: Array.isArray(impact?.dispositions_concernees)
      ? impact.dispositions_concernees.slice(0,depth==="deep"?4:impact.dispositions_concernees.length)
      : [],
    informations_a_confirmer: Array.isArray(impact?.informations_a_confirmer)
      ? impact.informations_a_confirmer
      : [],
    depth,
  };
}

async function readJsonResponse(response:Response){
  const raw=await response.text();
  try{return raw?JSON.parse(raw):null;}catch{return {error:`Réponse non JSON de impact-analysis (${response.status}).`,details:raw.slice(0,500)};}
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const dossier: Dossier | null = body?.dossier || null;
    const requestedDepth = asText(body?.depth) as ImpactDepth;
    const depth:ImpactDepth = requestedDepth in depthConfig ? requestedDepth : "standard";
    const config=depthConfig[depth];
    const items: WatchItem[] = Array.isArray(body?.items) ? body.items.slice(0, config.maxItems) : [];
    const wantsAsync=depth==="deep"&&body?.async===true;
    const productionId=asText(body?.production_id);

    if (!dossier) {
      return NextResponse.json({ error: "Sélectionne un dossier client." }, { status: 400 });
    }

    if (!items.length) {
      return NextResponse.json(
        { error: "Aucun élément de veille n’est rattaché à ce dossier." },
        { status: 400 },
      );
    }

    if(wantsAsync&&!productionId){
      return NextResponse.json({error:"production_id est obligatoire pour une Note approfondie en arrière-plan."},{status:400});
    }

    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const userAuthorization=request.headers.get("authorization")||"";

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "La connexion Supabase de Myvor n’est pas configurée." },
        { status: 503 },
      );
    }
    if(!userAuthorization.toLowerCase().startsWith("bearer ")){
      return NextResponse.json({error:"Session Myvor requise."},{status:401});
    }

    const uniqueUrls = [...new Set(items.map((item) => item.source_url || "").filter(Boolean))].slice(0, config.maxUrls);
    const extractions = await Promise.all(uniqueUrls.map(url=>fetchOfficialSource(url,config.sourceChars)));
    const extractionByUrl = new Map(extractions.map((source) => [source.url, source]));

    const sourceText = [
      `TYPE DE NOTE DEMANDÉE : ${config.label.toUpperCase()}`,
      `INSTRUCTION DE PROFONDEUR : ${config.instruction}`,
      "Cette instruction décrit le niveau de détail attendu. Elle ne doit jamais conduire à inventer des informations absentes des sources.",
      "",
      ...items.map((item, index) => {
        const extraction = item.source_url ? extractionByUrl.get(item.source_url) : undefined;
        const parts = [
          `SOURCE ${index + 1}`,
          `Titre : ${item.title}`,
          item.nature ? `Nature : ${item.nature}` : "",
          item.source_url ? `URL officielle : ${item.source_url}` : "",
          extraction?.status === "fetched"
            ? `CONTENU OFFICIEL RÉCUPÉRÉ :\n${extraction.content}`
            : `CONTENU OFFICIEL : non récupéré automatiquement (${extraction?.status || "aucune URL"}). Ne pas inventer le contenu du texte.`,
        ].filter(Boolean);
        return parts.join("\n");
      }),
    ].join("\n\n====================\n\n");

    const firstSourceUrl = items.find((item) => item.source_url)?.source_url || "";
    const fetchedCount = extractions.filter((source) => source.status === "fetched").length;
    const invokeBody={
      depth,
      client:dossier.client,
      contexte:dossier.context||"",
      objectif:dossier.objective,
      titre:items.length===1?items[0].title:`${dossier.title} — ${items.length} textes analysés`,
      lien_officiel:firstSourceUrl,
      texte:sourceText,
      async:wantsAsync,
      production_id:productionId||undefined,
      dossier_title:dossier.title,
      item_ids:items.map(item=>item.id),
      sources:items.map(item=>({title:item.title,url:item.source_url||""})),
    };

    if(wantsAsync){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),12000);
      try{
        const response=await fetch(`${supabaseUrl}/functions/v1/impact-analysis`,{
          method:"POST",
          headers:{Authorization:userAuthorization,apikey:supabaseAnonKey,"Content-Type":"application/json"},
          body:JSON.stringify(invokeBody),
          signal:controller.signal,
        });
        const payload=await readJsonResponse(response);
        if(!response.ok){
          return NextResponse.json({error:payload?.error||`La fonction impact-analysis a échoué (${response.status}).`},{status:response.status>=400&&response.status<600?response.status:502});
        }
        if(payload?.accepted!==true){
          return NextResponse.json({error:"La fonction impact-analysis n’a pas accepté le traitement en arrière-plan."},{status:502});
        }
        return NextResponse.json({
          accepted:true,
          production_id:productionId,
          engine:"supabase-impact-analysis-background",
          depth,
          grounding:{official_sources_requested:uniqueUrls.length,official_sources_fetched:fetchedCount,statuses:extractions.map(source=>({url:source.url,status:source.status}))},
        },{status:202});
      }catch(error:any){
        if(error?.name==="AbortError")return NextResponse.json({error:"Le lancement de la Note approfondie n’a pas répondu à temps."},{status:504});
        return NextResponse.json({error:error?.message||"Impossible de lancer la Note approfondie."},{status:502});
      }finally{clearTimeout(timer);}
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 44000);

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/impact-analysis`, {
        method: "POST",
        headers: {
          Authorization: userAuthorization,
          apikey: supabaseAnonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invokeBody),
        signal: controller.signal,
      });

      const payload = await readJsonResponse(response);

      if (!response.ok) {
        return NextResponse.json(
          { error: payload?.error || `La fonction impact-analysis a échoué (${response.status}).` },
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
        note: mapImpactToNote(impact, dossier, items, depth),
        engine: "supabase-impact-analysis",
        depth,
        grounding: {
          official_sources_requested: uniqueUrls.length,
          official_sources_fetched: fetchedCount,
          statuses: extractions.map((source) => ({ url: source.url, status: source.status })),
        },
      });
    } catch (error:any) {
      if (error?.name === "AbortError") {
        return NextResponse.json(
          { error: "L’analyse dépasse le temps de réponse disponible." },
          { status: 504 },
        );
      }
      return NextResponse.json(
        { error: error?.message || "Impossible de joindre la fonction impact-analysis." },
        { status: 502 },
      );
    } finally {
      clearTimeout(timer);
    }
  } catch (error:any) {
    return NextResponse.json(
      { error: "Erreur interne pendant la préparation de la Note d’impact.", details: error?.message || String(error) },
      { status: 500 },
    );
  }
}
