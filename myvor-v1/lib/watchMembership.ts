export type WatchMembership={dossier_id?:string|null;dossier_ids?:string[]|null};

export function dossierIds(item:WatchMembership|null|undefined){
  if(!item)return[];
  const values=Array.isArray(item.dossier_ids)?item.dossier_ids.map(String).filter(Boolean):[];
  if(item.dossier_id&&!values.includes(item.dossier_id))values.push(item.dossier_id);
  return [...new Set(values)];
}

export function belongsToDossier(item:WatchMembership|null|undefined,dossierId:string){
  return Boolean(dossierId)&&dossierIds(item).includes(dossierId);
}

export function isLinkedWatch(item:WatchMembership|null|undefined){
  return dossierIds(item).length>0;
}

export function primaryDossierId(item:WatchMembership|null|undefined,preferred?:string){
  const ids=dossierIds(item);
  if(preferred&&ids.includes(preferred))return preferred;
  return ids[0]||item?.dossier_id||null;
}

export function addDossierMembership<T extends WatchMembership>(item:T,dossierId:string):T{
  if(!dossierId)return item;
  const ids=[...new Set([...dossierIds(item),dossierId])];
  return {...item,dossier_ids:ids,dossier_id:item.dossier_id||dossierId};
}
