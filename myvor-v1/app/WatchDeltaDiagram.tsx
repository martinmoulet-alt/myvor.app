"use client";

type WatchLike={
  id:string;
  title:string;
  nature?:string|null;
  published_at?:string|null;
  created_at?:string|null;
  change_type?:string|null;
  change_summary?:string|null;
  change_baseline_ids?:string[]|null;
};

type Meta={label:string;color:string;background:string;border:string};

const CHANGE_META:Record<string,Meta>={
  nouveau:{label:"Nouveau",color:"#0f7a55",background:"#e9f8f1",border:"#bfe9d6"},
  modification:{label:"Modification",color:"#8a5a00",background:"#fff5db",border:"#f0d58a"},
  precision:{label:"Précision",color:"#245fa7",background:"#edf5ff",border:"#c9ddfb"},
  application:{label:"Application",color:"#6a3ba8",background:"#f4edff",border:"#dac7f4"},
  abrogation:{label:"Abrogation",color:"#a62d34",background:"#fff0f1",border:"#f2c7ca"},
  aucun_changement:{label:"Aucun changement",color:"#5b6675",background:"#f2f4f7",border:"#d9dee5"},
  socle_initial:{label:"Socle initial",color:"#4d5968",background:"#eef1f5",border:"#d5dbe3"},
  indetermine:{label:"À préciser",color:"#5b6675",background:"#f2f4f7",border:"#d9dee5"},
};

function dateLabel(item:WatchLike){
  const raw=item.published_at||item.created_at;
  if(!raw)return "";
  const d=new Date(raw);
  return Number.isFinite(d.getTime())?d.toLocaleDateString("fr-FR"):"";
}

export default function WatchDeltaDiagram({item,watch}:{item:WatchLike;watch:WatchLike[]}){
  const type=String(item.change_type||"");
  const summary=String(item.change_summary||"").trim();
  if(!type||!summary)return null;

  const meta=CHANGE_META[type]||CHANGE_META.indetermine;
  const baselineIds=Array.isArray(item.change_baseline_ids)?item.change_baseline_ids:[];
  const baseline=baselineIds.map(id=>watch.find(candidate=>candidate.id===id)).filter(Boolean) as WatchLike[];
  const baselineTitle=baseline[0]?.title||"Textes antérieurs du dossier";
  const baselineDate=baseline[0]?dateLabel(baseline[0]):"";
  const initial=type==="socle_initial";

  return <div className="myvor-delta-diagram">
    <div className="myvor-delta-title-row">
      <strong>Ce qui change</strong>
      <span className="myvor-delta-badge" style={{color:meta.color,background:meta.background,borderColor:meta.border}}>{meta.label}</span>
    </div>
    {initial?<div className="myvor-delta-initial" style={{borderColor:meta.border,background:meta.background}}>
      <span className="myvor-delta-step">1</span>
      <div><b>Socle initial</b><p>{summary}</p></div>
    </div>:<div className="myvor-delta-flow">
      <div className="myvor-delta-node">
        <div className="myvor-delta-node-head"><span className="myvor-delta-step">1</span><b>Socle antérieur</b></div>
        <p>{baselineTitle}</p>
        {baselineDate&&<small>{baselineDate}</small>}
      </div>
      <span className="myvor-delta-arrow" aria-hidden="true">→</span>
      <div className="myvor-delta-node">
        <div className="myvor-delta-node-head"><span className="myvor-delta-step">2</span><b>Nouveau texte</b></div>
        <p>{item.title}</p>
        {dateLabel(item)&&<small>{dateLabel(item)}</small>}
      </div>
      <span className="myvor-delta-arrow" aria-hidden="true">→</span>
      <div className="myvor-delta-node myvor-delta-result" style={{borderColor:meta.border,background:meta.background}}>
        <div className="myvor-delta-node-head"><span className="myvor-delta-step">3</span><b>{meta.label}</b></div>
        <p>{summary}</p>
      </div>
    </div>}
    <style jsx>{`
      .myvor-delta-diagram{margin-top:11px;border:1px solid #dbe5f0;background:linear-gradient(180deg,#fbfdff,#f7faff);border-radius:12px;padding:12px}
      .myvor-delta-title-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .myvor-delta-title-row strong{font-size:12px;color:#18385e;letter-spacing:.01em}
      .myvor-delta-badge{display:inline-flex;align-items:center;padding:5px 8px;border:1px solid;border-radius:999px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}
      .myvor-delta-flow{display:grid;grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr) 24px minmax(0,1.15fr);align-items:stretch;gap:7px}
      .myvor-delta-node,.myvor-delta-initial{border:1px solid #dce6f0;background:white;border-radius:10px;padding:10px;min-width:0}
      .myvor-delta-node-head{display:flex;align-items:center;gap:7px;margin-bottom:6px;color:#17365f;font-size:11px}
      .myvor-delta-step{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:999px;background:#0d5dcc;color:white;font-size:10px;font-weight:900;flex:0 0 auto}
      .myvor-delta-node p,.myvor-delta-initial p{margin:0;color:#42566f;font-size:11px;line-height:1.45;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
      .myvor-delta-node small{display:block;margin-top:5px;color:#8290a3;font-size:9px}
      .myvor-delta-result p{color:#263e5d;font-weight:650}
      .myvor-delta-arrow{display:grid;place-items:center;color:#dca315;font-size:20px;font-weight:900}
      .myvor-delta-initial{display:flex;gap:9px;align-items:flex-start}
      .myvor-delta-initial b{display:block;color:#253b58;font-size:11px;margin-bottom:4px}
      @media(max-width:900px){.myvor-delta-flow{grid-template-columns:1fr}.myvor-delta-arrow{transform:rotate(90deg);height:18px}.myvor-delta-node p{-webkit-line-clamp:6}}
    `}</style>
  </div>;
}
