import {expect,test,type Page} from "@playwright/test";

const email=process.env.E2E_EMAIL||"";
const password=process.env.E2E_PASSWORD||"";

async function signIn(page:Page){
  test.skip(!email||!password,"E2E_EMAIL et E2E_PASSWORD sont requis pour le parcours authentifié.");
  await page.goto("/");
  const emailField=page.locator('input[type="email"], input[name="email"]').first();
  const passwordField=page.locator('input[type="password"], input[name="password"]').first();
  await expect(emailField).toBeVisible();
  await emailField.fill(email);
  await passwordField.fill(password);
  await page.getByRole("button",{name:/se connecter|connexion/i}).click();
  await expect(page.getByText("Tableau de bord",{exact:true}).first()).toBeVisible({timeout:30_000});
}

async function openModule(page:Page,name:RegExp,heading:RegExp){
  const desktop=page.getByRole("button",{name}).first();
  if(await desktop.isVisible().catch(()=>false)){
    await desktop.click();
  }else{
    await page.getByRole("button",{name:/ouvrir le menu myvor/i}).click();
    await page.getByRole("button",{name}).last().click();
  }
  await expect(page.getByRole("heading",{name:heading}).first()).toBeVisible();
}

test("la page publique démarre sans erreur fatale",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  const response=await page.goto("/",{waitUntil:"domcontentloaded"});
  expect(response?.status()||200).toBeLessThan(500);
  await expect(page.locator("body")).toContainText(/Myvor|Chargement de Myvor|connexion/i);
  expect(errors).toEqual([]);
});

test("le parcours client authentifié ouvre tous les modules critiques",async({page})=>{
  await signIn(page);

  await openModule(page,/dossiers clients/i,/dossiers/i);
  await openModule(page,/veille/i,/veille/i);
  await expect(page.getByRole("button",{name:/actualiser/i})).toBeVisible();
  await openModule(page,/score d’urgence/i,/score d’urgence/i);
  await openModule(page,/radar & war zone/i,/radar d’influence/i);
  await openModule(page,/note builder/i,/note builder/i);

  await page.getByRole("button",{name:/se déconnecter/i}).click();
  await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({timeout:20_000});
});

test("le parcours d’écriture crée un dossier de test lorsque les écritures sont autorisées",async({page})=>{
  test.skip(process.env.E2E_ALLOW_WRITES!=="true","Définir E2E_ALLOW_WRITES=true pour le test de création.");
  await signIn(page);
  await openModule(page,/dossiers clients/i,/dossiers/i);
  await page.getByRole("button",{name:/ajouter|nouveau dossier/i}).first().click();

  const suffix=new Date().toISOString().replace(/[:.]/g,"-");
  const title=`Smoke test ${suffix}`;
  const dialog=page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  const textInputs=dialog.locator("input");
  await textInputs.nth(0).fill("Client test automatisé");
  await textInputs.nth(1).fill(title);
  const textareas=dialog.locator("textarea");
  if(await textareas.count()){
    await textareas.nth(0).fill("Vérifier le parcours client Myvor sans utiliser de données réelles.");
    if(await textareas.count()>1)await textareas.nth(1).fill("Dossier créé par le smoke test Playwright.");
  }
  await dialog.getByRole("button",{name:/créer|enregistrer|ajouter/i}).click();
  await expect(page.getByText(title,{exact:false}).first()).toBeVisible({timeout:20_000});
});
