"use client";

import {useEffect,useState} from "react";
import {CloudOff,Wifi} from "lucide-react";

export default function NetworkStatus(){
  const[online,setOnline]=useState(true);
  const[restored,setRestored]=useState(false);

  useEffect(()=>{
    setOnline(navigator.onLine);
    let timer:number|undefined;
    const onOnline=()=>{
      setOnline(true);
      setRestored(true);
      window.clearTimeout(timer);
      timer=window.setTimeout(()=>setRestored(false),2600);
    };
    const onOffline=()=>{setOnline(false);setRestored(false);};
    window.addEventListener("online",onOnline);
    window.addEventListener("offline",onOffline);
    return()=>{window.removeEventListener("online",onOnline);window.removeEventListener("offline",onOffline);window.clearTimeout(timer);};
  },[]);

  if(online&&!restored)return null;
  return <div className={`network-status ${online?"is-online":"is-offline"}`} role="status" aria-live="polite">
    {online?<Wifi size={16}/>:<CloudOff size={16}/>}<span>{online?"Connexion rétablie":"Hors connexion — les données affichées peuvent ne pas être à jour"}</span>
  </div>;
}
