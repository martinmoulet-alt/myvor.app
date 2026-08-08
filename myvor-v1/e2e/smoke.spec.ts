import {expect,test} from "@playwright/test";

test("Myvor charge sans erreur fatale et affiche l’accès professionnel",async({page})=>{
  const pageErrors:string[]=[];
  page.on("pageerror",error=>pageErrors.push(error.message));

  await page.goto("/");

  await expect(page.getByText("Myvor",{exact:true}).first()).toBeVisible();
  await expect(page.getByRole("heading",{name:/Bienvenue sur Myvor|Anticipez l’impact/i}).first()).toBeVisible();
  await expect(page.getByRole("button",{name:/Se connecter/i})).toBeVisible();
  expect(pageErrors).toEqual([]);
});
