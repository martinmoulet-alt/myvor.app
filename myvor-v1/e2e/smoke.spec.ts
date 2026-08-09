import {expect,test} from "@playwright/test";

test("Myvor charge sans erreur fatale et affiche un accès sécurisé",async({page})=>{
  const pageErrors:string[]=[];
  page.on("pageerror",error=>pageErrors.push(error.message));

  await page.goto("/");

  await expect(page.getByText("Myvor",{exact:true}).first()).toBeVisible();
  const securedEntry=page.getByRole("button",{name:/Se connecter/i}).or(page.getByRole("heading",{name:/Configuration requise/i}));
  await expect(securedEntry.first()).toBeVisible();
  expect(pageErrors).toEqual([]);
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
