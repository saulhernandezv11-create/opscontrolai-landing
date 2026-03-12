# OpsControl AI – WhatsApp Chatbot Platform

Plataforma SaaS de automatización de WhatsApp para PyMEs mexicanas.  
**Deployed 100% free** using Railway + MongoDB Atlas + Upstash Redis + Vercel.

---

## 🏗️ Architecture (Free Tier)

```
WhatsApp User
     │
     ▼
Meta Cloud API ──► Express.js on Railway (free tier)
                        │
                        ▼  (rate-limited with express-rate-limit)
                   Bull Queue ──► Redis on Upstash (free 10K cmds/day)
                        │
               ┌────────┼────────┐
               ▼        ▼        ▼
          MongoDB    OpenAI    Meta Cloud API
          Atlas M0  gpt-4o-    (send replies)
        (512MB free) mini
               │
               ▼
       Admin Dashboard → deployed on Vercel (free)
```

## 💰 Monthly Cost Breakdown

| Service | Free Tier | Cost |
|---------|-----------|------|
| Railway (compute) | 500 hrs/mo or $5 credit | **$0** |
| MongoDB Atlas M0 | 512 MB forever | **$0** |
| Upstash Redis | 10,000 cmds/day | **$0** |
| Vercel (admin UI) | Unlimited static | **$0** |
| Cloudflare R2 (media) | 10 GB/mo | **$0** |
| **OpenAI gpt-4o-mini** | Pay-per-use | ~$0.15/1M tokens |
| **Meta WhatsApp API** | Free for first 1000 conversations/mo | **$0** |
| **TOTAL** | | **~$0–$5/mo** |

## 📦 Repository Structure

```
/opscontrol-ai-whatsapp-platform
  /backend
    /src              ← New Express.js app (entry point)
      /routes         ← webhook.ts, tenants.ts, analytics.ts
      /workers        ← conversation-worker.ts, analytics-worker.ts
      server.ts       ← Express app bootstrap
      db.ts           ← Mongoose/MongoDB models
      queue.ts        ← Bull/Redis queue
    /functions        ← Original Azure Functions (kept for reference)
    /shared           ← Updated shared modules (no Azure SDKs)
    /models           ← TypeScript model interfaces (unchanged)
  /admin-dashboard    ← React 18 + Vite + Tailwind (deploy to Vercel)
  /infrastructure/azure-archive ← Old Bicep templates (archived)
  docker-compose.yml  ← Local development (MongoDB + Redis + Express)
  railway.json        ← Railway deployment config
  .env.example        ← All required environment variables
```

## 🚀 Quick Start (Local Dev with Docker)

### Prerequisites
- Docker Desktop
- Node.js 20 LTS

### 1. Clone & configure env vars

```bash
cp .env.example .env
# Fill in: OPENAI_API_KEY, META_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET, JWT_SECRET
```

### 2. Start everything

```bash
docker-compose up
```

This starts:
- **Backend** on http://localhost:3000
- **MongoDB** on localhost:27017
- **Redis** on localhost:6379
- **Admin Dashboard** on http://localhost:5173

### 3. Expose backend to Meta (for webhook)

```bash
npx ngrok http 3000
# Copy the ngrok URL → Meta Developer Console → Webhook URL:
# https://abc123.ngrok.io/webhooks/<your-tenantId>
```

---

## ☁️ Production Deployment (Free)

### Step 1: MongoDB Atlas (free M0)
1. Go to https://cloud.mongodb.com → Create free M0 cluster
2. Create database user + allow all IPs (`0.0.0.0/0`)
3. Copy connection string → set as `MONGODB_URI` in Railway

### Step 2: Upstash Redis (free)
1. Go to https://upstash.com → Create Redis database (free)
2. Copy `REDIS_URL` → set in Railway

### Step 3: Railway (free backend hosting)
1. Go to https://railway.app → New Project → Deploy from GitHub
2. Select this repo
3. Add all env vars from `.env.example`
4. Railway will auto-deploy on push to `main`
5. Copy Railway URL → set as `API_BASE_URL`

### Step 4: Vercel (free admin dashboard)
1. Go to https://vercel.com → New Project → Import from GitHub
2. Set root directory: `admin-dashboard`
3. Set `VITE_API_BASE_URL` = your Railway URL
4. Deploy → copy URL → set as `ADMIN_DASHBOARD_URL` in Railway

### Step 5: Configure Meta Webhook
1. Go to Meta Developer Console → WhatsApp → Configuration
2. Set Webhook URL: `https://your-backend.up.railway.app/webhooks/<tenantId>`
3. Set Verify Token: same as `META_WEBHOOK_VERIFY_TOKEN` in .env

---

## 🔐 Environment Variables

See [.env.example](.env.example) for all required variables.

Key variables:
| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `REDIS_URL` | Upstash Redis URL (rediss://...) |
| `OPENAI_API_KEY` | OpenAI API key (api.openai.com) |
| `OPENAI_MODEL` | Model name (default: gpt-4o-mini) |
| `META_WEBHOOK_VERIFY_TOKEN` | Random string for Meta webhook verification |
| `META_APP_SECRET` | Meta app secret for signature verification |
| `JWT_SECRET` | Secret for admin JWT signing |

---

## 📖 Documentation

- [Architecture](docs/architecture.md)
- [Deployment Guide](docs/deployment.md)
- [API Reference](docs/api-reference.md)

## 🧪 Tests

```bash
cd backend && npm test
```

## 💰 Pricing Tiers (MXN/mes)

| Tier | Conversaciones | Precio mensual |
|------|---------------|----------------|
| Básico | 1,000 | $1,200–1,800 |
| Profesional | 5,000 | $2,500–4,000 |
| Empresarial | Ilimitadas | $6,000–10,000 |

---

> **OpsControl AI** – Automatización inteligente para el negocio mexicano
