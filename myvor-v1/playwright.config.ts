import {defineConfig,devices} from "@playwright/test";

const baseURL=process.env.E2E_BASE_URL||"https://myvor.app";

export default defineConfig({
  testDir:"./e2e",
  timeout:90_000,
  expect:{timeout:15_000},
  fullyParallel:false,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?[["line"],["html",{outputFolder:"playwright-report",open:"never"}]]:"list",
  use:{
    baseURL,
    trace:"retain-on-failure",
    screenshot:"only-on-failure",
    video:"retain-on-failure",
    actionTimeout:20_000,
    navigationTimeout:30_000,
  },
  projects:[
    {name:"desktop-chromium",use:{...devices["Desktop Chrome"]}},
    {name:"iphone",use:{...devices["iPhone 15 Pro"]}},
  ],
});
