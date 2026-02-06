---
description: How to deploy AuditFlow frontend to Vercel
---

# Deploy AuditFlow to Vercel

The AuditFlow frontend has its own git repo inside `frontend/` folder with no remote configured.
To deploy changes to Vercel, you must use the Vercel CLI directly.

## Steps

1. Navigate to the frontend directory:
   ```
   cd d:\SARATH\Antigravity project\auditflow\frontend
   ```

2. Deploy to production using Vercel CLI:
   ```
   npx vercel --prod --yes
   ```

3. The deployment URL is: https://electrical-auditflow.vercel.app

## Important Notes

- Do NOT rely on git push to deploy - the frontend folder's git repo has no remote
- The parent `auditflow` repo does NOT track frontend files
- Always use `npx vercel --prod --yes` from the `frontend` folder for production deployments
- After deployment, users should hard refresh (Ctrl+Shift+R) to get the latest code
