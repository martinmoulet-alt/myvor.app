import { supabase } from "@/lib/supabase";

export type ProductionType="impact"|"radar"|"builder"|"warzone";
export type AITrace={
  assisted_by_ai:true;
  system:"Myvor";
  generated_at:string;
  engine:string|null;
  model:string|null;
  human_review_status:"generated"|"reviewed"|"validated";
  validated_at:string|null;
  validated_by:string|null;
  notice:string;
};
export type Production={
  id:string;
  dossier_id:string;
  type:ProductionType;
  title:string;
  content:Record<string,unknown>;
  created_at:string;
};

function stringOrNull(value:unknown){const text=String(value??"").trim();return text||null;}
function enrichAITrace(content:Record<string,unknown>){
  const raw=content as any;
  const previous=(raw.ai_trace&&typeof raw.ai_trace==="object"?raw.ai_trace:{}) as Partial<AITrace>;
  const validatedAt=stringOrNull(raw?.audit?.validated_at||raw?.note?.quality?.validated_at||raw?.review?.validated_at||previous.validated_at);
  const validatedBy=stringOrNull(raw?.audit?.validated_by||raw?.note?.quality?.validated_by||raw?.review?.validated_by||previous.validated_by);
  const explicitStatus=String(raw?.review?.status||previous.human_review_status||"");
  const humanReviewStatus:AITrace["human_review_status"]=validatedAt||explicitStatus==="validated"?"validated":explicitStatus==="reviewed"?"reviewed":"generated";
  const trace:AITrace={
    assisted_by_ai:true,
    system:"Myvor",
    generated_at:stringOrNull(previous.generated_at)||new Date().toISOString(),
    engine:stringOrNull(raw.engine||raw.detail_engine||raw?.context_used?.engine||previous.engine),
    model:stringOrNull(raw.model||raw.detail_model||raw?.context_used?.model||previous.model),
    human_review_status:humanReviewStatus,
    validated_at:validatedAt,
    validated_by:validatedBy,
    notice:"Analyse assistée par IA — vérification humaine requise avant usage externe.",
  };
  return {...raw,ai_trace:trace} as Record<string,unknown>;
}

export async function saveProduction(input:{dossier_id:string;type:ProductionType;title:string;content:Record<string,unknown>}){
  if(!supabase)return {data:null as Production|null,error:new Error("Supabase n’est pas configuré.")};
  const payload={...input,content:enrichAITrace(input.content)};
  const {data,error}=await supabase.from("productions").insert(payload).select("id,dossier_id,type,title,content,created_at").single();
  return {data:data as Production|null,error};
}

export async function getProduction(id:string){
  if(!supabase)return {data:null as Production|null,error:new Error("Supabase n’est pas configuré.")};
  const {data,error}=await supabase.from("productions").select("id,dossier_id,type,title,content,created_at").eq("id",id).single();
  return {data:data as Production|null,error};
}

export async function updateProductionContent(id:string,content:Record<string,unknown>){
  if(!supabase)return {data:null as Production|null,error:new Error("Supabase n’est pas configuré.")};
  const {data,error}=await supabase.from("productions").update({content:enrichAITrace(content)}).eq("id",id).select("id,dossier_id,type,title,content,created_at").single();
  return {data:data as Production|null,error};
}

export async function listProductions(dossierId:string){
  if(!supabase)return {data:[] as Production[],error:new Error("Supabase n’est pas configuré.")};
  const {data,error}=await supabase.from("productions").select("id,dossier_id,type,title,content,created_at").eq("dossier_id",dossierId).order("created_at",{ascending:false});
  return {data:(data||[]) as Production[],error};
}
