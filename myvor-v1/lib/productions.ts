import { supabase } from "@/lib/supabase";

export type ProductionType="impact"|"radar"|"builder";
export type Production={
  id:string;
  dossier_id:string;
  type:ProductionType;
  title:string;
  content:Record<string,unknown>;
  created_at:string;
};

export async function saveProduction(input:{dossier_id:string;type:ProductionType;title:string;content:Record<string,unknown>}){
  if(!supabase)return {error:new Error("Supabase n’est pas configuré.")};
  const {data,error}=await supabase.from("productions").insert(input).select("id,dossier_id,type,title,content,created_at").single();
  return {data:data as Production|null,error};
}

export async function listProductions(dossierId:string){
  if(!supabase)return {data:[] as Production[],error:new Error("Supabase n’est pas configuré.")};
  const {data,error}=await supabase.from("productions").select("id,dossier_id,type,title,content,created_at").eq("dossier_id",dossierId).order("created_at",{ascending:false});
  return {data:(data||[]) as Production[],error};
}
