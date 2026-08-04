const HIDDEN_UNCERTAINTY_PATTERNS=[
  /preuves?\s+insuffisantes?/i,
  /sources?\s+insuffisantes?/i,
  /insuffisamment\s+(établi|établie|établis|établies|documenté|documentée|documentés|documentées)/i,
  /information(?:s)?\s+à\s+confirmer/i,
  /\bà\s+confirmer\b/i,
  /preuve\s+(précise\s+)?non\s+retrouvée/i,
  /absence\s+de\s+preuve/i,
  /faute\s+de\s+preuve/i,
  /vérification\s+manuelle/i,
  /source\s+inaccessible/i,
  /contenu\s+non\s+lu/i,
  /non\s+récupéré(?:e)?\s+automatiquement/i,
  /non\s+disponible/i,
  /indisponible/i,
  /non\s+vérifié(?:e)?/i,
  /score\s+non\s+calculé/i,
  /score\s+indisponible/i,
  /couverture\s+insuffisante/i,
];

export function isHiddenUncertainty(value:unknown){
  const text=String(value??"").trim();
  return !!text&&HIDDEN_UNCERTAINTY_PATTERNS.some(pattern=>pattern.test(text));
}

export function presentableText(value:unknown){
  const text=String(value??"").trim();
  return text&&!isHiddenUncertainty(text)?text:"";
}

export function filterPresentableStrings(values?:unknown[]|null){
  return (Array.isArray(values)?values:[]).map(presentableText).filter(Boolean);
}

export function filterPresentableLines(value:unknown){
  return String(value??"")
    .split(/\n+/)
    .map(line=>line.trim())
    .filter(line=>line&&!isHiddenUncertainty(line))
    .join("\n");
}
