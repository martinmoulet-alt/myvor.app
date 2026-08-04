export function normalizeRadarText(value:unknown){
  return String(value??"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/\u00a0/g," ")
    .replace(/[“”«»]/g,'"')
    .replace(/[’‘]/g,"'")
    .replace(/\s+/g," ")
    .trim()
    .toLowerCase();
}

export function evidenceExcerptIsGrounded(content:unknown,excerpt:unknown){
  const source=normalizeRadarText(content);
  const proof=normalizeRadarText(excerpt);
  if(proof.length<18||!source)return false;
  return source.includes(proof);
}

export function normalizedPhoneDigits(value:unknown){
  return String(value??"").replace(/\D/g,"");
}

export function contactEmailAppears(pageText:unknown,email:unknown){
  const source=String(pageText??"").toLowerCase();
  const candidate=String(email??"").trim().toLowerCase();
  if(!candidate||!candidate.includes("@"))return false;
  return source.includes(candidate);
}

export function contactPhoneAppears(pageText:unknown,phone:unknown){
  const sourceDigits=normalizedPhoneDigits(pageText);
  const candidateDigits=normalizedPhoneDigits(phone);
  if(candidateDigits.length<8||!sourceDigits)return false;
  return sourceDigits.includes(candidateDigits);
}

export function verifyOfficialContactValues(pageText:unknown,email:unknown,phone:unknown){
  const emailValue=String(email??"").trim();
  const phoneValue=String(phone??"").trim();
  return{
    email:contactEmailAppears(pageText,emailValue)?emailValue:"",
    phone:contactPhoneAppears(pageText,phoneValue)?phoneValue:"",
  };
}
