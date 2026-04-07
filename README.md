# Mother Roots

Monorepo with:
- `Lab_backend/` (Node.js + Express + PostgreSQL)
- `lab-frontend/` (React + Vite)

## Prerequisites

- Node.js + npm
- PostgreSQL database

Windows PowerShell note: if `npm` fails due to script execution policy, use `npm.cmd` instead.

## Setup

1) Install dependencies

```bash
npm run install:all
```

2) Backend environment

- Copy `Lab_backend/.env.example` → `Lab_backend/.env`
- Fill in DB + JWT + email settings.

Important:
- Do not commit `Lab_backend/.env` (secrets). This repo ignores `.env` files via `.gitignore`.

3) Database

- Create your database and user (values must match `DB_*` in `Lab_backend/.env`)
- Run SQL migrations from `Lab_backend/sql/` as needed.

## Run (development)

Start backend + frontend together:

```bash
npm run dev
```

Or separately:

```bash
npm run backend
npm run frontend
```

Frontend:
- Vite dev server runs on `http://localhost:5173`

Backend:
- API base is `http://localhost:3000/api`
- Backend port can be changed with `PORT` in `Lab_backend/.env`

## Build (frontend)

```bash
npm run build
npm run preview
```

## Lint (frontend)

```bash
npm run lint
```

## Email troubleshooting

### Gmail SMTP

If you see `535-5.7.8 BadCredentials`:
- `SMTP_USER` must be the full email (example: `your@gmail.com`)
- `SMTP_PASS` must be a Google **App Password** (requires 2-Step Verification)
- `EMAIL_FROM` should match `SMTP_USER`

### Resend

If you use Resend:
- `EMAIL_PROVIDER=resend`
- `EMAIL_FROM` must be a verified sender/domain in Resend
- Your network must allow outbound HTTPS to `api.resend.com`

## Deploy (Option A: Render + Vercel + Neon)

### 1) Database (Neon)

- Create a Neon Postgres project and copy the connection string.
- Set it as `DATABASE_URL` in your backend environment.

### 2) Backend (Render)

Create a Render **Web Service** from this repo with:
- **Root directory:** `Lab_backend`
- **Build command:** `npm install`
- **Start command:** `npm start`

Set Render environment variables:
- `NODE_ENV=production`
- `FORCE_HTTPS=true`
- `PORT=3000` (Render will still inject `PORT`; your app also reads it)
- `DATABASE_URL=...` (from Neon)
- `JWT_ACCESS_SECRET=...` (generate a strong secret)
- `CORS_ORIGIN=https://YOUR-VERCEL-DOMAIN` (comma-separated if multiple)
- `APP_ORIGIN=https://YOUR-VERCEL-DOMAIN`

Email (optional):
- **Resend:** `EMAIL_PROVIDER=resend`, `EMAIL_FROM=...`, `RESEND_API_KEY=...`
- **Gmail SMTP:** `EMAIL_PROVIDER=gmail`, `EMAIL_FROM=...`, `SMTP_*` (requires App Passwords)

### 3) Frontend (Vercel)

Create a Vercel project from `lab-frontend/`.

Recommended for auth cookies: proxy API through Vercel so requests are same-origin.
- Add a Vercel **Rewrite**: `/api/(.*)` → `https://YOUR-RENDER-DOMAIN/api/$1`
- Set frontend env var: `VITE_API_BASE_URL=/api`

Then redeploy.

## HTTPS

- Enable HTTPS/TLS at the hosting layer for your frontend and backend domains.
- Keep production `APP_ORIGIN` and `CORS_ORIGIN` values on `https://...` URLs only.
- Set `FORCE_HTTPS=true` in production if you want backend requests auto-redirected from HTTP to HTTPS.
- Production auth cookies are already configured as `Secure` in the backend auth config.
