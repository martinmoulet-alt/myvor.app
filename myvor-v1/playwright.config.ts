import {defineConfig,devices} from "@playwright/test";

const externalBaseURL=process.env.E2E_BASE_URL;
const baseURL=externalBaseURL||"http://127.0.0.1:3000";

export default defineConfig({
  testDir:"./e2e",
  timeout:90_000,
  expect:{timeout:15_000},
  fullyParallel:false,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?[["line"],["html",{outputFolder:"playwright-report",open:"never"}]]:"list",
  webServer:externalBaseURL?undefined:{
    command:process.env.CI?"npm start -- -H 127.0.0.1":"npm run dev -- -H 127.0.0.1",
    url:baseURL,
    reuseExistingServer:!process.env.CI,
    timeout:120_000,
  },
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
