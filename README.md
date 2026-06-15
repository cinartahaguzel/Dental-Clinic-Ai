# AI Dental Receptionist

🚀 **Professional React + Vite + Supabase Application**

## 📁 Project Structure (CLEAN)

```
Dental-Clinic-Ai/
├── src/                              ✨ Frontend Source
│   ├── main.jsx                      • React app entry
│   ├── App.jsx                       • Root component
│   ├── index.css                     • Global styles
│   ├── components/
│   │   └── ClinicReceptionist.jsx    • Main chat widget
│   └── lib/
│       ├── clinicData.js             • Supabase queries
│       └── supabaseClient.js         • Supabase config
│
├── supabase/                         📊 Backend
│   ├── migrations/                   • Database schemas
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_google_calendar.sql
│   │   └── 004_channel_configs.sql
│   └── functions/                    • Edge Functions (optional)
│
├── 📄 Root Config Files
│   ├── index.html                    • HTML entry point
│   ├── package.json                  • Dependencies
│   ├── vite.config.js                • Build config
│   ├── vercel.json                   • Vercel deployment
│   ├── tsconfig.json                 • TypeScript config
│   ├── .gitignore                    • Git rules
│   ├── .env.example                  • Environment template
│   └── README.md                     • This file
```

## 🚀 Quick Start

### 1. Local Development
```bash
npm install
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
npm run dev
# Visit http://localhost:5173
```

### 2. Build
```bash
npm run build
npm run preview
```

## 🌐 Vercel Deployment

### Setup
1. Push this repo to GitHub ✅
2. Go to https://vercel.com/new
3. Import your repo
4. Add environment variables:
   ```
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY
   ```
5. Deploy!

### Build Settings (Auto-detected)
- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

## 🔑 Environment Variables

Create `.env.local`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
GOOGLE_CLIENT_ID=optional
GOOGLE_CLIENT_SECRET=optional
```

## 📦 Dependencies

| Package | Version | Purpose |
|---------|---------|----------|
| React | 18.3.1 | UI Framework |
| Vite | 5.4.0 | Build tool (⚡ fast) |
| Supabase JS | 2.45.0 | Backend client |
| ESLint | 8.57.0 | Code quality |

## 🎯 Available Commands

```bash
npm run dev      # Start dev server (hot reload)
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Check code quality
```

## ✨ Features

- ✅ AI-powered receptionist chat
- ✅ Multi-channel (Web, WhatsApp, LINE)
- ✅ Google Calendar integration
- ✅ Supabase backend
- ✅ Real-time conversations
- ✅ Responsive design
- ✅ Dark mode support

## 🔗 Supabase Setup

### Create Project
1. Go to https://supabase.com
2. New project
3. Copy URL + Anon Key

### Apply Migrations
In Supabase SQL Editor, run files from `supabase/migrations/` in order:
1. `001_initial_schema.sql` - Create tables
2. `002_google_calendar.sql` - Calendar config
3. `004_channel_configs.sql` - Channel settings

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| "Cannot find src/" | Files must be in `src/` folder |
| Blank page after build | Check index.html exists + VITE_ env vars |
| Vercel build fails | Check `npm run build` works locally first |
| "Module not found" | Run `npm install` |

## 📚 File Reference

### Frontend Entry
- `src/main.jsx` → Renders App into `<div id="root">`
- `src/App.jsx` → Main component, renders ClinicReceptionist
- `index.html` → HTML wrapper with script tag pointing to src/main.jsx

### Chat Widget
- `src/components/ClinicReceptionist.jsx` → Main UI component
- `src/lib/clinicData.js` → Supabase queries
- `src/lib/supabaseClient.js` → Client initialization

### Database
- `supabase/migrations/001_initial_schema.sql` → Clinics, conversations tables
- `supabase/migrations/002_google_calendar.sql` → Calendar token storage
- `supabase/migrations/004_channel_configs.sql` → WhatsApp/LINE config

## 💡 Next Steps

1. ✅ Set up Supabase project
2. ✅ Apply database migrations
3. ✅ Add environment variables
4. ✅ Run locally: `npm run dev`
5. ✅ Deploy to Vercel

---

**Made for Sakura Tech** - Sakura Clinic PLUS pack ($1490/month)
