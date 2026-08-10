import {expect,test} from "@playwright/test";

test("Myvor charge sans erreur fatale et affiche un accès sécurisé",async({page})=>{
  const pageErrors:string[]=[];
  page.on("pageerror",error=>pageErrors.push(error.message));
  await page.goto("/");
  const securedEntry=page.getByRole("button",{name:/Se connecter/i}).or(page.getByRole("heading",{name:/Configuration requise/i}));
  await expect(securedEntry.first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Myvor");
  expect(pageErrors).toEqual([]);
});

test("la création de compte impose l’acceptation contractuelle",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Créer un compte",exact:true}).click();
  const create=page.getByRole("button",{name:/Créer mon espace/i});
  await expect(create).toBeDisabled();
  const checkbox=page.getByRole("checkbox");
  await expect(checkbox).toBeVisible();
  await checkbox.check();
  await expect(create).toBeEnabled();
});

test("les informations contractuelles et de confidentialité sont accessibles",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Confidentialité",exact:true}).first().click();
  await expect(page.getByRole("heading",{name:"Politique de confidentialité"})).toBeVisible();
  await expect(page.getByText("Version applicable :").first()).toBeVisible();
});

test("les routes métier refusent les appels non authentifiés",async({request})=>{
  const assign=await request.post("/api/veille/assign",{data:{items:[],dossiers:[]}});
  expect(assign.status()).toBe(401);
  const impact=await request.post("/api/impact",{data:{}});
  expect(impact.status()).toBe(401);
  const radar=await request.post("/api/radar/fast",{data:{}});
  expect(radar.status()).toBe(401);
});

test("la collecte institutionnelle reste strictement interne",async({request})=>{
  const response=await request.get("/api/veille/sources");
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({error:"Accès interne requis."});
});

test("une requête démesurée est rejetée avant traitement",async({request})=>{
  const payload="x".repeat(310_000);
  const response=await request.post("/api/veille/assign",{
    headers:{"Content-Type":"application/json"},
    data:{items:[{id:"x",title:payload}],dossiers:[{id:"d",title:"Dossier"}]},
  });
  expect(response.status()).toBe(413);
});

test("le health-check public reste minimal et opérationnel",async({request})=>{
  const response=await request.get("/api/health");
  expect(response.status()).toBe(200);
  const payload=await response.json();
  expect(payload).toMatchObject({status:"ok",service:"myvor"});
  expect(Object.keys(payload).sort()).toEqual(["checked_at","service","status"]);
});

test("une route inconnue affiche une sortie produit propre",async({page})=>{
  await page.goto("/page-inexistante-myvor");
  await expect(page.getByRole("heading",{name:"Cette page n’existe pas"})).toBeVisible();
  await expect(page.getByRole("link",{name:/Retour à Myvor/i})).toBeVisible();
});
