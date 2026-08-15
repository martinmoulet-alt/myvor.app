import {defineConfig,globalIgnores} from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const baseline={
  "@typescript-eslint/no-explicit-any":"off",
  "@typescript-eslint/no-require-imports":"off",
  "react-hooks/set-state-in-effect":"off",
  "react-hooks/purity":"off",
  "react-hooks/immutability":"off",
  "react-hooks/exhaustive-deps":"warn",
  "@next/next/no-html-link-for-pages":"warn",
};

function soften(configs){
  return configs.map(config=>{
    if(!config?.rules)return config;
    const rules={...config.rules};
    let changed=false;
    for(const[rule,value]of Object.entries(baseline)){
      if(Object.prototype.hasOwnProperty.call(rules,rule)){
        rules[rule]=value;
        changed=true;
      }
    }
    return changed?{...config,rules}:config;
  });
}

export default defineConfig([
  ...soften(nextVitals),
  ...soften(nextTs),
  {
    files:["supabase/functions/**/*.ts"],
    rules:{
      "prefer-const":"off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".test-dist/**",
    "next-env.d.ts",
  ]),
]);
