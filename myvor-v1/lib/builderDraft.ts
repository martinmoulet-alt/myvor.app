export type BuilderDraftDocument={title:string;subject:string;content:string;key_points:string[];sources:{title:string;url:string}[]};

export type BuilderDraft={
  version:1;
  saved_at:string;
  dossier_id:string;
  format:string;
  audience:string;
  tone:string;
  instruction:string;
  document:BuilderDraftDocument|null;
};

const PREFIX="myvor:builder:draft:";

function key(dossierId:string){return `${PREFIX}${dossierId}`;}

export function readBuilderDraft(dossierId:string):BuilderDraft|null{
  if(typeof window==="undefined"||!dossierId)return null;
  try{
    const raw=window.localStorage.getItem(key(dossierId));
    if(!raw)return null;
    const draft=JSON.parse(raw) as BuilderDraft;
    if(draft?.version!==1||draft.dossier_id!==dossierId)return null;
    return draft;
  }catch{return null;}
}

export function writeBuilderDraft(draft:BuilderDraft){
  if(typeof window==="undefined"||!draft.dossier_id)return false;
  try{window.localStorage.setItem(key(draft.dossier_id),JSON.stringify(draft));return true;}catch{return false;}
}

export function clearBuilderDraft(dossierId:string){
  if(typeof window==="undefined"||!dossierId)return;
  try{window.localStorage.removeItem(key(dossierId));}catch{}
}
