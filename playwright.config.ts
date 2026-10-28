import {defineConfig} from '@playwright/test';

// Smoke tests against a deployed site: E2E_BASE_URL=https://spmflow.vercel.app npm run test:e2e
export default defineConfig({
 testDir:'e2e',
 timeout:60_000,
 retries:1,
 use:{baseURL:process.env.E2E_BASE_URL||'http://localhost:4173',trace:'retain-on-failure'},
});
