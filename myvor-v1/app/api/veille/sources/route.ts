import { NextResponse } from "next/server";

type Source = {
  name: string;
  url: string;
  defaultNature: string;
};

type FeedItem = {
  title: string;
  nature: string;
  source_url: string;
  source_name: string;
  published_at?: string;
};

const SOURCES: Source[] = [
  {
    name: "Assemblée nationale",
    url: "http://www2.assemblee-nationale.fr/feeds/detail/documents-parlementaires",
    defaultNature: "Publication parlementaire",
  },
  {
    name: "Sénat — Textes",
    url: "https://www.senat.fr/rss/textes.rss",
    defaultNature: "Texte parlementaire",
  },
  {
    name: "Sénat — Rapports",
    url: "https://www.senat.fr/rss/rapports.rss",
    defaultNature: "Rapport",
  },
];

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function first(block: string, tags: string[]) {
  for (const tag of tags) {
    const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    if (match?.[1]) return decode(match[1]);
  }
  return "";
}

function linkFrom(block: string) {
  const simple = first(block, ["link"]);
  if (simple.startsWith("http")) return simple;
  const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];
  return href ? decode(href) : "";
}

function inferNature(title: string, fallback: string) {
  const t = title.toLowerCase();
  if (t.startsWith("loi ") || t.startsWith("loi n°")) return "Loi";
  if (t.includes("ordonnance")) return "Ordonnance";
  if (t.includes("amendement")) return "Amendement";
  if (t.includes("proposition de loi")) return "Proposition de loi";
  if (t.includes("projet de loi")) return "Projet de loi";
  if (t.startsWith("décret") || t.includes(" décret ")) return "Décret";
  if (t.startsWith("arrêté") || t.includes(" arrêté ")) return "Arrêté";
  if (t.startsWith("décision") || t.includes(" décision ")) return "Décision / jurisprudence";
  if (t.includes("rapport")) return "Rapport";
  if (t.includes("question")) return "Question parlementaire";
  if (t.includes("résolution")) return "Résolution";
  return fallback;
}

function parseFeed(xml: string, source: Source): FeedItem[] {
  const rssItems = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m => m[1]);
  const atomEntries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(m => m[1]);
  const blocks = rssItems.length ? rssItems : atomEntries;

  return blocks
    .map(block => {
      const title = first(block, ["title"]);
      const source_url = linkFrom(block);
      const published_at = first(block, ["pubDate", "published", "updated"]);
      return {
        title,
        nature: inferNature(title, source.defaultNature),
        source_url,
        source_name: source.name,
        published_at,
      };
    })
    .filter(item => item.title && item.source_url.startsWith("http"));
}

async function fetchLegifranceJorf(): Promise<FeedItem[]> {
  const response = await fetch("https://www.legifrance.gouv.fr/jorf/jo", {
    headers: {
      "User-Agent": "Myvor/1.0 (+https://myvor.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) throw new Error(`Légifrance — JORF: HTTP ${response.status}`);
  const html = await response.text();

  const issueDate = decode(
    html.match(/Journal officiel de la République française[^<]*du\s+([^<]+)/i)?.[1] || "",
  );

  const items: FeedItem[] = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']*\/jorf\/id\/JORFTEXT[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const href = match[1];
    const title = decode(match[2]);
    if (!title) continue;

    const nature = inferNature(title, "Texte réglementaire");
    const accepted = new Set([
      "Loi",
      "Ordonnance",
      "Décret",
      "Arrêté",
      "Décision / jurisprudence",
      "Rapport",
    ]);
    if (!accepted.has(nature)) continue;

    const source_url = href.startsWith("http")
      ? href
      : `https://www.legifrance.gouv.fr${href.startsWith("/") ? "" : "/"}${href}`;

    items.push({
      title,
      nature,
      source_url,
      source_name: "Légifrance — Journal officiel",
      published_at: issueDate,
    });
  }

  return items
    .filter((item, index, all) => all.findIndex(other => other.source_url === item.source_url) === index)
    .slice(0, 20);
}

export async function GET() {
  const feedSettled = await Promise.allSettled(
    SOURCES.map(async source => {
      const response = await fetch(source.url, {
        headers: { "User-Agent": "Myvor/1.0 (+https://myvor.app)" },
        next: { revalidate: 300 },
      });
      if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
      const xml = await response.text();
      return parseFeed(xml, source).slice(0, 12);
    }),
  );

  const legifranceSettled = await Promise.allSettled([fetchLegifranceJorf()]);

  const feedItems = feedSettled.flatMap(result =>
    result.status === "fulfilled" ? result.value : [],
  );
  const legifranceItems = legifranceSettled.flatMap(result =>
    result.status === "fulfilled" ? result.value : [],
  );

  const items = [...legifranceItems, ...feedItems]
    .filter((item, index, all) => all.findIndex(other => other.source_url === item.source_url) === index)
    .slice(0, 45);

  const active_sources = [
    ...feedSettled
      .map((result, index) => (result.status === "fulfilled" ? SOURCES[index].name : null))
      .filter(Boolean),
    ...(legifranceSettled[0]?.status === "fulfilled" ? ["Légifrance — Journal officiel"] : []),
  ];

  const unavailable_sources = [
    ...feedSettled
      .map((result, index) => (result.status === "rejected" ? SOURCES[index].name : null))
      .filter(Boolean),
    ...(legifranceSettled[0]?.status === "rejected" ? ["Légifrance — Journal officiel"] : []),
  ];

  return NextResponse.json({
    synced_at: new Date().toISOString(),
    active_sources,
    unavailable_sources,
    items,
  });
}
