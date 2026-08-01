import fs from "node:fs";

const path = new URL("../app/page.tsx", import.meta.url);
let text = fs.readFileSync(path, "utf8");

const radarImport = 'import RadarModule from "./RadarModule";';
const builderImport = 'import BuilderModule from "./BuilderModule";';
const dashboardImport = 'import DashboardCorporate from "./DashboardCorporate";';
const dossiersImport = 'import DossiersCorporate from "./DossiersCorporate";';
const veilleImport = 'import VeilleCorporate from "./VeilleCorporate";';

if (!text.includes(builderImport)) text = text.replace(radarImport, `${radarImport}\n${builderImport}`);
if (!text.includes(dashboardImport)) text = text.replace(builderImport, `${builderImport}\n${dashboardImport}`);
if (!text.includes(dossiersImport)) text = text.replace(dashboardImport, `${dashboardImport}\n${dossiersImport}`);
if (!text.includes(veilleImport)) text = text.replace(dossiersImport, `${dossiersImport}\n${veilleImport}`);

const oldBlock = `          : tab==="radar"
            ? <RadarModule dossiers={dossiers} watch={watch}/>
            : <ModulePlaceholder tab={tab} dossiers={dossiers} watch={watch}/>;`;
const newBlock = `          : tab==="radar"
            ? <RadarModule dossiers={dossiers} watch={watch}/>
            : tab==="builder"
              ? <BuilderModule dossiers={dossiers} watch={watch}/>
              : <ModulePlaceholder tab={tab} dossiers={dossiers} watch={watch}/>;`;

if (!text.includes('<BuilderModule dossiers={dossiers} watch={watch}/>')) {
  if (!text.includes(oldBlock)) throw new Error("Note Builder insertion point not found in app/page.tsx");
  text = text.replace(oldBlock, newBlock);
}

text = text.replace('? <Dashboard dossiers={dossiers} watch={watch} go={setTab}/>', '? <DashboardCorporate dossiers={dossiers} watch={watch} go={setTab}/>');
text = text.replace('? <Dossiers items={dossiers} add={()=>setModal("dossier")} search={findRelevantForDossier} searching={searchingDossier} messages={dossierMessages}/>', '? <DossiersCorporate items={dossiers} watch={watch} add={()=>setModal("dossier")} search={findRelevantForDossier} searching={searchingDossier} messages={dossierMessages}/>');
text = text.replace('? <Veille items={watch} dossiers={dossiers} add={()=>setModal("watch")} sync={syncSources} syncing={syncing} syncMessage={syncMessage} link={linkWatchToDossier}/>', '? <VeilleCorporate items={watch} dossiers={dossiers} add={()=>setModal("watch")} sync={syncSources} syncing={syncing} syncMessage={syncMessage} link={linkWatchToDossier}/>');

// Safari can throw “The string did not match the expected pattern” on some relative fetch calls.
// Build absolute same-origin URLs for the two page-level API requests.
text = text.replace('fetch("/api/veille/assign",{', 'fetch(new URL("/api/veille/assign", window.location.origin).toString(),{');
text = text.replace('fetch("/api/veille/sources",{', 'fetch(new URL("/api/veille/sources", window.location.origin).toString(),{');

fs.writeFileSync(path, text);
console.log("Corporate modules connected; same-origin API URLs normalized for Safari.");
