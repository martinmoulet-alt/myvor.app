import Link from "next/link";
import {ArrowLeft,Compass} from "lucide-react";

export default function NotFound(){
  return <main className="myvor-not-found">
    <section className="myvor-not-found-card">
      <div className="myvor-not-found-icon"><Compass size={25}/></div>
      <div className="myvor-not-found-kicker">Myvor · 404</div>
      <h1>Cette page n’existe pas</h1>
      <p>L’adresse demandée n’est pas disponible. Revenez au cockpit Myvor pour reprendre votre travail.</p>
      <Link href="/"><ArrowLeft size={17}/>Retour à Myvor</Link>
    </section>
    <style>{`
      .myvor-not-found{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 0%,#0b3158 0,#07162c 42%,#031126 100%);color:#edf4fb;font-family:Arial,sans-serif}.myvor-not-found-card{width:min(520px,100%);border:1px solid rgba(255,255,255,.13);border-radius:22px;background:rgba(5,24,46,.9);box-shadow:0 28px 80px rgba(0,0,0,.34);padding:34px}.myvor-not-found-icon{width:52px;height:52px;border-radius:15px;border:1px solid rgba(224,183,70,.38);background:rgba(224,183,70,.08);color:#e0b746;display:grid;place-items:center;margin-bottom:16px}.myvor-not-found-kicker{color:#e0b746;font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.myvor-not-found h1{font-size:30px;margin:7px 0 9px;letter-spacing:-.03em}.myvor-not-found p{color:#9fb2c5;line-height:1.55;margin:0 0 20px}.myvor-not-found a{min-height:42px;border-radius:11px;background:#e0b746;color:#07162c;text-decoration:none;font-weight:900;display:inline-flex;align-items:center;gap:7px;padding:0 15px}@media(max-width:600px){.myvor-not-found{padding:12px}.myvor-not-found-card{padding:25px 20px}.myvor-not-found h1{font-size:25px}}
    `}</style>
  </main>;
}
