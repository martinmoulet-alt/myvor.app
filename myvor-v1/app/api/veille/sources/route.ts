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
    .replace(/<[^>]+>/g, "")
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
  if (t.includes("amendement")) return "Amendement";
  if (t.includes("proposition de loi")) return "Proposition de loi";
  if (t.includes("projet de loi")) return "Projet de loi";
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

export async function GET() {
  const settled = await Promise.allSettled(
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

  const items = settled
    .flatMap(result => (result.status === "fulfilled" ? result.value : []))
    .filter((item, index, all) => all.findIndex(other => other.source_url === item.source_url) === index)
    .slice(0, 30);

  const active_sources = settled
    .map((result, index) => (result.status === "fulfilled" ? SOURCES[index].name : null))
    .filter(Boolean);

  const unavailable_sources = settled
    .map((result, index) => (result.status === "rejected" ? SOURCES[index].name : null))
    .filter(Boolean);

  return NextResponse.json({
    synced_at: new Date().toISOString(),
    active_sources,
    unavailable_sources,
    items,
  });
}
