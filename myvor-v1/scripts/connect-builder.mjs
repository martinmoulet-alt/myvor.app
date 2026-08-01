import fs from "node:fs";

const path = new URL("../app/page.tsx", import.meta.url);
let text = fs.readFileSync(path, "utf8");

const radarImport = 'import RadarModule from "./RadarModule";';
const builderImport = 'import BuilderModule from "./BuilderModule";';
const dashboardImport = 'import DashboardCorporate from "./DashboardCorporate";';

if (!text.includes(builderImport)) {
  text = text.replace(radarImport, `${radarImport}\n${builderImport}`);
}
if (!text.includes(dashboardImport)) {
  text = text.replace(builderImport, `${builderImport}\n${dashboardImport}`);
}

const oldBlock = `          : tab==="radar"
            ? <RadarModule dossiers={dossiers} watch={watch}/>
            : <ModulePlaceholder tab={tab} dossiers={dossiers} watch={watch}/>;`;

const newBlock = `          : tab==="radar"
            ? <RadarModule dossiers={dossiers} watch={watch}/>
            : tab==="builder"
              ? <BuilderModule dossiers={dossiers} watch={watch}/>
              : <ModulePlaceholder tab={tab} dossiers={dossiers} watch={watch}/>;`;

if (!text.includes('<BuilderModule dossiers={dossiers} watch={watch}/>')) {
  if (!text.includes(oldBlock)) {
    throw new Error("Note Builder insertion point not found in app/page.tsx");
  }
  text = text.replace(oldBlock, newBlock);
}

text = text.replace('? <Dashboard dossiers={dossiers} watch={watch} go={setTab}/>', '? <DashboardCorporate dossiers={dossiers} watch={watch} go={setTab}/>');

fs.writeFileSync(path, text);
console.log("Note Builder and corporate dashboard connected to Myvor.");
