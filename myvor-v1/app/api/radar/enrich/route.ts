import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Session Myvor requise." }, { status: 401 });
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) {
    return NextResponse.json({ error: "Le moteur Supabase du Radar n’est pas configuré." }, { status: 503 });
  }

  const body = await request.text();

  try {
    const response = await fetch(`${url}/functions/v1/radar-enrich`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: authorization,
        "Content-Type": "application/json;charset=UTF-8",
      },
      body,
      cache: "no-store",
    });

    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = { error: raw || `Radar Supabase indisponible (${response.status}).` };
    }

    return NextResponse.json(payload, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Connexion au Radar Supabase impossible : ${error?.message || "erreur réseau"}.` },
      { status: 502 },
    );
  }
}
