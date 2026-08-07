export default function Loading(){
  return <main className="myvor-route-loading" aria-busy="true" aria-label="Chargement de Myvor">
    <div className="myvor-loading-shell">
      <div className="myvor-loading-brand"><div className="myvor-loading-logo">M</div><div><strong>Myvor</strong><span>Anticipez l’impact.</span></div></div>
      <div className="myvor-loading-grid">
        <div className="myvor-skeleton myvor-skeleton-hero"/>
        <div className="myvor-loading-kpis">{Array.from({length:4}).map((_,i)=><div className="myvor-skeleton myvor-skeleton-kpi" key={i}/>)}</div>
        <div className="myvor-loading-panels">{Array.from({length:3}).map((_,i)=><div className="myvor-skeleton myvor-skeleton-panel" key={i}/>)}</div>
      </div>
    </div>
  </main>;
}
