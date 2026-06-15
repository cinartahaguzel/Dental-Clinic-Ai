# AI dental clinic receptionist

An AI receptionist for dental clinics. Patients chat via a web widget,
WhatsApp, or LINE; the AI answers questions from the clinic's knowledge
base, checks real appointment availability against Google Calendar, books
appointment requests, and escalates emergencies to staff. Includes
automated follow-up reminders.

## Stack

- **Frontend**: React + Vite, deployed to Vercel
- **Backend**: Supabase (Postgres, Auth, Edge Functions, pg_cron)
- **AI**: Anthropic API (Claude), called from Edge Functions with tool use
- **Channels**: Web widget, WhatsApp (Meta Cloud API), LINE (Messaging API)
- **Calendar**: Google Calendar (OAuth2, freebusy + event sync)

## Folder structure

```
.
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
├── .env.example
├── .eslintrc.cjs
├── .gitignore
├── src/
│   ├── main.jsx                  # React entry point
│   ├── App.jsx                   # Top-level app
│   ├── index.css                 # Global styles + CSS variables (light/dark)
│   ├── components/
│   │   └── ClinicReceptionist.jsx  # Chat widget UI
│   └── lib/
│       ├── supabaseClient.js     # Supabase client init
│       └── clinicData.js         # Frontend data helpers
└── supabase/
    ├── migrations/
    │   ├── 001_init.sql                  # Core schema: clinics, patients,
    │   │                                  # conversations, appointments
    │   ├── 002_google_calendar.sql       # Google Calendar token storage
    │   ├── 003_scheduling_config.sql     # Slot duration / booking horizon
    │   ├── 004_channel_configs.sql       # WhatsApp / LINE credentials
    │   └── 005_followups.sql             # Follow-up automation + pg_cron
    └── functions/
        ├── _shared/
        │   ├── googleCalendar.ts   # Calendar API helpers (auth, freebusy, events)
        │   ├── whatsapp.ts         # WhatsApp Cloud API helpers
        │   ├── line.ts             # LINE Messaging API helpers
        │   ├── notify.ts           # Proactive message routing
        │   └── conversations.ts    # Shared conversation lookup/create
        ├── conversation-engine/    # Core AI engine (Claude + tool use)
        ├── check-availability/     # Computes open appointment slots
        ├── calendar-sync/          # Syncs appointment <-> Google Calendar event
        ├── google-oauth-callback/  # Google OAuth connect flow
        ├── whatsapp-webhook/       # WhatsApp inbound message handler
        ├── line-webhook/           # LINE inbound message handler
        ├── process-followups/      # Scheduled reminders (pg_cron target)
        ├── GOOGLE_CALENDAR_SETUP.md
        ├── CONVERSATION_ENGINE_SETUP.md
        ├── WHATSAPP_SETUP.md
        ├── LINE_SETUP.md
        └── FOLLOWUPS_SETUP.md
```

---

## 1. Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic API key](https://console.anthropic.com)
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`)
- (Optional, for full functionality) A Meta developer account for WhatsApp,
  a LINE developer account, and a Google Cloud project for Calendar

---

## 2. Local installation

```bash
git clone <your-repo-url>
cd <repo-name>
npm install
cp .env.example .env
```

Edit `.env`:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

(Both values are in Supabase dashboard → Project Settings → API.)

Run the dev server:

```bash
npm run dev
```

The app runs at `http://localhost:5173`. At this point the chat widget will
load but won't respond until the backend is set up (next section).

---

## 3. Supabase backend setup

### 3.1 Link the project and run migrations

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

This applies all five migrations in `supabase/migrations/`, creating:
`clinic_settings`, `patients`, `conversations`, `appointments`,
`clinic_google_tokens`, `channel_configs`, `follow_ups`, plus seed data for
the default clinic (slug `bright-smile`).

If you're not using the CLI, you can instead run each file in order via the
Supabase SQL editor.

### 3.2 Set Edge Function secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxx
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to
Edge Functions — no need to set them manually.

### 3.3 Deploy Edge Functions

```bash
supabase functions deploy conversation-engine
supabase functions deploy check-availability
supabase functions deploy calendar-sync
```

These three are required for the web widget to work end-to-end.

### 3.4 Optional integrations

Each of the following is independent — set up only what you need. Full
instructions are in the linked files:

| Feature | Guide |
|---|---|
| Google Calendar sync & availability | `supabase/functions/GOOGLE_CALENDAR_SETUP.md` |
| WhatsApp channel | `supabase/functions/WHATSAPP_SETUP.md` |
| LINE channel | `supabase/functions/LINE_SETUP.md` |
| Automated reminders | `supabase/functions/FOLLOWUPS_SETUP.md` |

Tool-use behaviors in `conversation-engine` (availability checking,
booking, escalation) degrade gracefully if Google Calendar isn't connected
— bookings are still saved to the database, just not synced to a calendar.

---

## 4. Customizing the clinic

All clinic info — hours, services, pricing, policies, staff, contact info —
lives in the `clinic_settings` table (`hours` and `knowledge_base` JSONB
columns), seeded by `001_init.sql`. Update it via the SQL editor:

```sql
update clinic_settings
set knowledge_base = jsonb_set(knowledge_base, '{services}', '"Updated services text..."')
where slug = 'bright-smile';
```

A dedicated admin dashboard for editing this (and managing leads,
appointments, and conversations) is a planned next step — not yet included
in this bundle.

---

## 5. Deploying the frontend (GitHub + Vercel)

### 5.1 Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: AI dental receptionist"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### 5.2 Import into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo.
2. Vercel auto-detects Vite via `vercel.json` (framework: `vite`, build
   command `npm run build`, output directory `dist`).
3. Add environment variables under Project Settings → Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.

Every push to `main` redeploys automatically. Preview deployments are
created for pull requests.

### 5.3 Post-deploy checklist

- Open the deployed URL — the chat widget should load and greet the patient
- Send a message asking about hours/services — should answer from the KB
- Ask "what's available this week for a cleaning?" — should call
  `check_availability` and return real slots
- If WhatsApp/LINE are configured, message the clinic's number/bot and
  confirm the reply comes back through the same `conversation-engine`

---

## Architecture notes

- **Multi-channel, single brain**: web widget, WhatsApp, and LINE all call
  the same `conversation-engine` Edge Function, so AI behavior, tool use,
  and conversation history are consistent across channels.
- **Tool use**: Claude calls `check_availability`, `collect_patient_info`,
  `book_appointment`, and `escalate_to_human` as structured tools rather
  than free-form text, which is what makes bookings and availability checks
  reliable.
- **Security**: WhatsApp/LINE/Google tokens live in tables with no RLS
  policies — only the Edge Functions' service-role key can access them.
  The frontend only has the anon key and can read `clinic_settings` and
  manage its own `conversations`/`patients`/`appointments` rows.
- **Follow-ups**: `pg_cron` triggers `process-followups` every 15 minutes to
  send reminders and re-engagement nudges via the patient's original
  channel.

## What's not included yet

- Admin dashboard (inbox, leads pipeline, KB editor, calendar connect UI)
- Lead scoring
- Multi-tenant clinic switching in the frontend (currently single-clinic via
  `CLINIC_SLUG` in `src/lib/supabaseClient.js`)
