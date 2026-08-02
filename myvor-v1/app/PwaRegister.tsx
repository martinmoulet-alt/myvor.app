"use client";

import { useEffect } from "react";

export default function PwaRegister(){
  useEffect(()=>{
    if(!("serviceWorker" in navigator))return;

    let refreshing=false;
    let registration:ServiceWorkerRegistration|null=null;

    const handleControllerChange=()=>{
      if(refreshing)return;
      refreshing=true;
      window.location.reload();
    };

    const checkForUpdate=()=>{
      if(document.visibilityState!=="visible")return;
      registration?.update().catch(()=>{});
    };

    navigator.serviceWorker.addEventListener("controllerchange",handleControllerChange);

    navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"})
      .then(reg=>{
        registration=reg;
        return reg.update().catch(()=>{});
      })
      .catch(()=>{});

    document.addEventListener("visibilitychange",checkForUpdate);
    window.addEventListener("pageshow",checkForUpdate);

    return()=>{
      navigator.serviceWorker.removeEventListener("controllerchange",handleControllerChange);
      document.removeEventListener("visibilitychange",checkForUpdate);
      window.removeEventListener("pageshow",checkForUpdate);
    };
  },[]);

  return null;
}
