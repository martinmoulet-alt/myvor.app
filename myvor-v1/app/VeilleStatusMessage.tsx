"use client";

export default function VeilleStatusMessage({summary,technical}:{summary:string;technical?:string}){
  if(!summary&&!technical)return null;
  return <div style={{display:"grid",gap:8}}>
    {summary&&<div style={{padding:"12px 14px",borderRadius:12,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"inherit",lineHeight:1.45}}>{summary}</div>}
    {technical&&<details style={{padding:"10px 12px",borderRadius:10,background:"rgba(2,12,28,.22)",border:"1px solid rgba(255,255,255,.08)"}}>
      <summary style={{cursor:"pointer",fontWeight:750,fontSize:13}}>Détails techniques</summary>
      <p style={{margin:"9px 0 0",fontSize:12,lineHeight:1.5,opacity:.75,overflowWrap:"anywhere"}}>{technical}</p>
    </details>}
  </div>;
}
