# Vercel Deployment Guide — AUC Clinic Inventory

This guide covers exactly how to deploy this app to Vercel with zero errors.
It resolves the "No Output Directory named 'public' found" error permanently.

---

## How the build works

The app lives at `artifacts/store-control/` inside a pnpm monorepo.
Vite outputs the production build to `artifacts/store-control/dist/`.
The `vercel.json` at the **repo root** tells Vercel where to find it.

```
repo root/
├── vercel.json                          ← Vercel reads this
├── pnpm-lock.yaml
├── package.json
└── artifacts/
    └── store-control/
        ├── vercel.json                  ← only used if Root Directory is set (see Step 2)
        ├── vite.config.ts
        └── dist/                        ← build output (index.html, sw.js, assets/)
```

---

## Step 1 — Import the repo into Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Import Git Repository"**
3. Select your GitHub/GitLab/Bitbucket repo

---

## Step 2 — Configure project settings (CRITICAL)

After selecting the repo, Vercel shows a configuration screen.
**Do not click Deploy yet.** Set these fields:

| Field | Value |
|---|---|
| **Framework Preset** | `Other` |
| **Root Directory** | *(leave empty — repo root)* |
| **Build Command** | `pnpm --filter @workspace/store-control run build` |
| **Output Directory** | `artifacts/store-control/dist` |
| **Install Command** | `pnpm install` |

> **Why Root Directory must be empty:** If you set Root Directory to
> `artifacts/store-control`, Vercel changes its working directory and
> all relative paths in `vercel.json` break. Leave it empty so Vercel
> uses the repo root, where our `vercel.json` is located.

Screenshot of what it should look like:
```
Framework Preset:  [ Other              ▼ ]
Root Directory:    [                      ]  ← EMPTY
Build Command:     [ pnpm --filter @workspace/store-control run build ]
Output Directory:  [ artifacts/store-control/dist ]
Install Command:   [ pnpm install         ]
```

---

## Step 3 — Add environment variables (for Supabase)

Still on the configuration screen, scroll to **Environment Variables** and add:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon public key |

> Without these the app runs in offline/local mode using IndexedDB.
> See `SUPABASE-VERCEL-GUIDE.md` for the full Supabase SQL schema setup.

---

## Step 4 — Deploy

Click **Deploy**. Vercel will:
1. Run `pnpm install` at the repo root (resolves all workspace packages)
2. Run `pnpm --filter @workspace/store-control run build`
3. Find the output at `artifacts/store-control/dist/`
4. Serve `index.html` for all routes (SPA routing via the rewrites in `vercel.json`)

Expected build log output:
```
✓ built in ~10s
PWA v1.3.0
mode      generateSW
precache  14 entries
files generated
  dist/sw.js
  dist/workbox-xxxx.js
```

---

## Troubleshooting

### "No Output Directory named 'public' found"

This error means Vercel could not find the build output. Check in order:

**1. Root Directory is not empty**
Go to: Vercel Dashboard → Your Project → Settings → General → Root Directory
Make sure the field is **completely empty** (not `artifacts/store-control` or `.`).

**2. Build Command is wrong**
Go to: Settings → General → Build & Development Settings
Build Command must be exactly:
```
pnpm --filter @workspace/store-control run build
```

**3. Output Directory is wrong**
Output Directory must be exactly:
```
artifacts/store-control/dist
```

**4. The settings in the dashboard override vercel.json**
Vercel dashboard settings take priority over `vercel.json`. If you ever
typed something in the dashboard fields, clear them (or set them to match
the table in Step 2).

---

### "Cannot find module '@workspace/...'"

The pnpm workspace packages are not being resolved. Make sure:
- Root Directory is **empty** (so `pnpm install` runs at repo root and links workspace packages)
- Install Command is `pnpm install` (not `npm install` or `yarn`)

---

### App loads but data is lost / shows empty

The app is running in **local mode** (IndexedDB). This is expected until
you add Supabase credentials. See `SUPABASE-VERCEL-GUIDE.md`.

---

### PWA install prompt doesn't appear

Make sure the deployment is on HTTPS (Vercel deployments always are).
The service worker (`sw.js`) requires HTTPS to register. It will appear
after the user visits the site once.

---

## Existing project — change settings

If you already deployed and need to fix the settings:

1. Vercel Dashboard → Your Project → **Settings** → **General**
2. Scroll to **Build & Development Settings**
3. Set the fields exactly as in Step 2
4. Go to **Git** tab → click **Redeploy** (or push a new commit)

---

## What each file does

| File | Purpose |
|---|---|
| `vercel.json` (repo root) | Tells Vercel how to build and serve the app |
| `artifacts/store-control/vercel.json` | Backup config (only used if Root Directory is wrongly set) |
| `artifacts/store-control/vite.config.ts` | Vite build — outputs to `artifacts/store-control/dist` |
| `artifacts/store-control/.env.example` | Template for environment variables |
| `SUPABASE-VERCEL-GUIDE.md` | Full Supabase setup with SQL schema |
