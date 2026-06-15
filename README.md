# AI Dental Receptionist

A React-based AI receptionist widget for dental clinics with Supabase backend, WhatsApp/LINE/web channel support, Google Calendar integration, and automated follow-ups.

## 📋 Project Structure

```
.
├── src/                           # Frontend source
│   ├── main.jsx                  # React entry point
│   ├── App.jsx                   # Root component
│   ├── index.css                 # Global styles
│   ├── components/
│   │   └── ClinicReceptionist.jsx  # Main chat widget
│   └── lib/
│       ├── clinicData.js         # Supabase queries
│       └── supabaseClient.js     # Supabase init
│
├── supabase/
│   ├── migrations/               # Database schemas
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_google_calendar.sql
│   │   └── 004_channel_configs.sql
│   └── functions/                # Edge Functions
│
├── index.html                    # HTML entry
├── package.json                  # Dependencies
├── vite.config.js                # Vite config
├── vercel.json                   # Vercel config
├── tsconfig.json                 # TypeScript config
├── .env.example                  # Env template
├── .gitignore                    # Git ignore
└── README.md                     # Documentation
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env.local

# 3. Add your Supabase credentials to .env.local
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# 4. Run dev server
npm run dev

# 5. Open http://localhost:5173
```

### Build for Production

```bash
npm run build
npm run preview
```

## 🌐 Vercel Deployment

This project is configured for Vercel with the proper structure:

1. **Push to GitHub** (already done)
2. **Connect to Vercel**:
   - Go to https://vercel.com/new
   - Import your GitHub repo
   - Vercel auto-detects Vite configuration
3. **Add Environment Variables** in Vercel Dashboard:
   ```
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY
   GOOGLE_CLIENT_ID (optional)
   GOOGLE_CLIENT_SECRET (optional)
   WHATSAPP_APP_SECRET (optional)
   WHATSAPP_VERIFY_TOKEN (optional)
   ```
4. **Deploy** - Vercel automatically builds and deploys on push

## 📦 Key Dependencies

- **React** 18.3 - UI framework
- **Vite** 5.4 - Build tool (faster than CRA)
- **Supabase JS** 2.45 - Backend client
- **ESLint** - Code quality

## 🔧 Available Scripts

| Command | Purpose |
|---------|----------|
| `npm run dev` | Start dev server on port 5173 |
| `npm run build` | Build for production (creates `dist/`) |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint checks |

## 🛠️ Backend Setup (Supabase)

### 1. Create Supabase Project
- Go to https://supabase.com
- Create a new project
- Copy the project URL and anon key

### 2. Apply Migrations
In Supabase SQL Editor, run:
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_google_calendar.sql`
- `supabase/migrations/004_channel_configs.sql`

### 3. Configure Environment
Add to `.env.local`:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## ✨ Features

- ✅ AI-powered chat widget
- ✅ Multi-channel (Web, WhatsApp, LINE)
- ✅ Google Calendar integration
- ✅ Conversation persistence
- ✅ Human escalation
- ✅ Responsive design
- ✅ Dark mode support

## 📚 Architecture

### Frontend (React + Vite)
- Runs on Vercel
- Builds to `dist/` directory
- Communicates with Supabase

### Backend (Supabase)
- PostgreSQL database
- Authentication & RLS
- Edge Functions (optional)
- Real-time subscriptions

### External Integrations
- **Google Calendar** - Availability & booking
- **WhatsApp** - Channel webhook
- **LINE** - Channel webhook

## 🐛 Troubleshooting

### Build fails with "missing files"
- Ensure all files in `src/` and `supabase/` exist
- Run `npm install` to install dependencies

### Vercel deployment fails
- Check that `package.json` exists in root
- Check that `vite.config.js` exists
- Verify environment variables are set in Vercel Dashboard
- Check build logs in Vercel dashboard

### Blank page after deployment
- Verify `index.html` is in the root
- Verify `src/main.jsx` exists
- Check browser console for errors
- Check that Supabase environment variables are correct

## 📄 License

Made for Sakura Tech - Sakura Clinic PLUS pack
