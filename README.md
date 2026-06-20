# FB Reply Manager

Semi-automated Facebook comment management with AI-powered responses (Claude) and multi-account support (up to 40 accounts).

## Features

- Multi-account Facebook management (up to 40 accounts per user)
- Account switcher in navbar for instant context switching
- AI-powered reply suggestions via Claude API
- Approve / Edit / Reject responses before publishing
- Per-account tone and custom rules configuration
- Comment sync from Facebook Graph API
- Stats dashboard: total / responded / pending
- JWT authentication + encrypted Facebook tokens

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| AI | Claude claude-sonnet-4-6 (Anthropic) |
| Auth | Facebook OAuth + JWT |
| Deploy | Railway + GitHub Actions |

## Project Structure

```
├── backend/          # Express API
│   ├── src/
│   │   ├── config/   # DB connection
│   │   ├── middleware/  # Auth, rate limiting
│   │   ├── models/   # SQL schema
│   │   ├── routes/   # API routes
│   │   ├── services/ # Facebook, Claude, Encryption
│   │   └── types/    # TypeScript types
│   └── .env.example
├── frontend/         # Next.js app
│   ├── src/
│   │   ├── app/      # Pages (login, register, dashboard, accounts)
│   │   ├── components/  # Navbar, CommentCard, ResponseModal
│   │   ├── lib/      # API client
│   │   └── types/    # Shared types
│   └── .env.example
└── .github/workflows/  # CI/CD
```

## Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL database
- Facebook App (developers.facebook.com)
- Anthropic API key

### 1. Clone & Install

```bash
git clone <your-repo>
cd fb-reply-manager

# Backend
cd backend && npm install
cp .env.example .env

# Frontend
cd ../frontend && npm install
cp .env.example .env.local
```

### 2. Configure Environment

**backend/.env:**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/fb_reply_manager
FACEBOOK_APP_ID=<your_app_id>
FACEBOOK_APP_SECRET=<your_app_secret>
CLAUDE_API_KEY=sk-ant-...
JWT_SECRET=<min_32_chars_random_string>
ENCRYPTION_KEY=<64_char_hex_string>
BACKEND_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
```

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**frontend/.env.local:**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 3. Database Setup

```bash
cd backend
npm run db:migrate
```

### 4. Facebook App Setup

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create a new app → Business type
3. Add Facebook Login product
4. Set Valid OAuth Redirect URIs: `http://localhost:3001/api/auth/facebook/callback`
5. Add permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content`
6. Copy App ID and App Secret to `.env`

### 5. Run

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

Open http://localhost:3000

## Railway Deployment

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### 2. Create Railway Project

1. Go to [railway.app](https://railway.app) → New Project
2. Deploy from GitHub repo
3. Add PostgreSQL service
4. Create two services: `backend` and `frontend`
5. Set root directory for each

### 3. Environment Variables in Railway

**Backend service:**
```
DATABASE_URL          (auto-injected from PostgreSQL service)
FACEBOOK_APP_ID
FACEBOOK_APP_SECRET
CLAUDE_API_KEY
JWT_SECRET
ENCRYPTION_KEY
BACKEND_URL           https://<your-backend>.railway.app
FRONTEND_URL          https://<your-frontend>.railway.app
NODE_ENV              production
```

**Frontend service:**
```
NEXT_PUBLIC_API_URL   https://<your-backend>.railway.app
```

### 4. Run Migrations

In Railway backend service shell:
```bash
npm run db:migrate
```

### 5. GitHub Actions Secret

Add `RAILWAY_TOKEN` to GitHub repository secrets (Settings → Secrets → Actions).

### 6. Update Facebook App

Add production callback URL:
`https://<your-backend>.railway.app/api/auth/facebook/callback`

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/facebook` | Get Facebook OAuth URL |
| GET | `/api/auth/facebook/callback` | Facebook OAuth callback |
| GET | `/api/accounts` | List user's accounts |
| DELETE | `/api/accounts/:id` | Disconnect account |
| GET | `/api/accounts/:id/settings` | Get account settings |
| PUT | `/api/accounts/:id/settings` | Update account settings |
| GET | `/api/accounts/:id/stats` | Get comment stats |
| GET | `/api/comments?accountId=` | List comments |
| POST | `/api/comments/sync/:accountId` | Sync from Facebook |
| POST | `/api/responses/generate` | Generate AI response |
| PUT | `/api/responses/:id` | Update response text |
| POST | `/api/responses/:id/publish` | Publish to Facebook |
| POST | `/api/responses/:id/reject` | Reject response |

## Security

- Passwords: bcrypt (cost factor 12)
- Facebook tokens: AES-256-GCM encryption at rest
- Auth: JWT Bearer tokens (7-day expiry)
- Rate limiting: 100 req/15min general, 10 req/15min auth
- CORS: restricted to frontend origin
- Helmet.js security headers
- User isolation: all queries scoped to authenticated user

## License

MIT
