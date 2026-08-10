import {NextResponse} from "next/server";

export const dynamic="force-dynamic";
export const revalidate=0;

export async function GET(){
  return NextResponse.json({status:"ok",service:"myvor",checked_at:new Date().toISOString()},{status:200,headers:{"Cache-Control":"no-store, max-age=0","X-Robots-Tag":"noindex, nofollow, noarchive"}});
}
