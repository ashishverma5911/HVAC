# AERIS AI Receptionist (Powered by Google Gemini 3.8 Live & Flash)

A purpose-built AI receptionist system engineered for small and independent US heating, ventilation, and air conditioning (HVAC) contractors.

AERIS AI Receptionist is an automated, 24/7 receptionist product that answers inbound customer calls, understands reported HVAC issues, collects verified customer details, qualifies leads, schedules inspection windows, and routes or escalates requests appropriately. Under the hood, AERIS AI leverages Google's Gemini API (Gemini 3.8 Live for native bi-directional voice and Gemini 3.8 Flash for text chat and extraction). It operates under strict non-diagnosis and non-hallucination policies: it never fabricates prices or warranties, never provides hazardous technical repair advice, and immediately escalates life-safety emergencies.

> [!IMPORTANT]
> **Operational Boundary & Non-Diagnosis Policy**:
> The AI receptionist is strictly designed for customer service intake, lead capture, and routing for certified HVAC contractors. It **does NOT** perform professional HVAC diagnosis, repair decisions, safety determinations, or technical instructions. All pricing, availability, and policies are strictly dictated by contractor configuration.

---

## 1. Project Stages & Capabilities

- **Phase 1 (Foundation)**: Next.js App Router, TypeScript, Tailwind CSS, domain types.
- **Phase 2 (Prototype UI)**: Responsive contractor landing page, dispatch dashboard, and simulation panels.
- **Phase 3 (Gemini 3.8 Flash Chat)**: Multi-turn conversational intelligence, safety escalation, entity extraction, and intent classification.
- **Phase 4 (Agent Tools & Function Calling)**: Server-validated tool execution (`check_service_area`, `create_lead`, `get_available_slots`, `request_appointment`, `transfer_to_human`, `check_business_hours`), slot validation, and idempotency protection.
- **Phase 5 (Real-Time Browser Voice)**: Real-time two-way browser voice conversation using **Google Gemini 3.8 Live** (`gemini-3.8-live`), Web Audio API, ephemeral security tokens, and instant barge-in/interruption.
- **Phase 6 (Real US Telephone / Twilio Integration)**: Inbound telephone calls via Twilio Voice Media Streams, real-time 8kHz G.711 μ-law audio transcoding, multi-call concurrency, HMAC-SHA1 webhook security, and live telephony dashboard.
- **Phase 7 (Multi-Tenant Production Infrastructure & Lead Management)**:
  - Step 1: Multi-tenant schema with PostgreSQL RLS & `get_auth_business_id()`.
  - Step 2: Dynamic AERIS engine runtime refactor with tenant resolution and demo sandbox isolation.
  - Step 3: Contractor authentication, atomic onboarding, and route protection.
  - Step 4: Real database persistence, KPI querying, and idempotent tool ingestion.
  - Step 5: Contractor settings UI & business territory configuration.
  - Step 6: Daily lead management console, conversation history inspection, simplified AI tool event audit logs, deterministic pagination, and server-side filtering.

---

## 2. Phase 7: Conversation & Lead Management Architecture

### Lead Lifecycle
AERIS models the complete inbound customer journey using five explicit, server-validated statuses:
1. `new`: Raw customer inquiry initiated through inbound chat, browser voice, or telephony.
2. `qualified`: All required fields (customer name, phone, service address, service type, reported issue) collected and validated by `create_lead`.
3. `appointment_requested`: Customer selected an available inspection window via `request_appointment`.
4. `transferred`: Caller escalated to human dispatch via `transfer_to_human` due to emergencies, safety risks, or customer preference.
5. `completed`: Dispatcher/contractor resolved or serviced the customer ticket.

### Conversation & Audio Storage Policy
- **Zero Audio Storage**: AERIS persists **only** conversational text transcripts and structured extraction tokens. Audio bytes are never written to the database or stored on disk.
- **Explicit Database Linkage**: Leads and conversations are linked explicitly via `leads.conversation_id` and `conversations.lead_id` utilizing stable UUIDs.
- **AI Action Audit Timeline**: Simplified audit events are logged in `call_events` when tools execute (`check_service_area`, `create_lead`, `get_available_slots`, `request_appointment`, `transfer_to_human`), giving contractors an immediate, clean view of what AERIS evaluated.

### Appointment Status Semantics
- **Strict Invariant**: Appointments created by the AI receptionist are persisted and displayed strictly as **`requested`**.
- Status is **NEVER** marked as `confirmed`. A real contractor dispatcher or technician confirms bookings according to internal scheduling and technician availability.

### Server-Safe Search, Filtering & Pagination
- **Filtering**: Server-side filtering by `status`, `urgency`, `serviceType`, `city`, and case-insensitive search across customer names, phone numbers, and street addresses.
- **Deterministic Pagination**: Paginated via `page` and `limit` (max 50) using `created_at DESC` and `id DESC` as a stable tie-breaker to prevent phantom shifts.

### Tenant Isolation & Security Model
- **Zero Client Trust**: Browser-supplied `business_id` is never trusted or consulted.
- **Server Derivation**: Every lead, conversation, and appointment query derives the target contractor's `business_id` exclusively from `users.business_id` of the authenticated Supabase session.
- **Cross-Tenant Concealment**: Requests for records belonging to another contractor return `404 Not Found`, ensuring cross-tenant record existence is never disclosed.
- **Demo Isolation**: Anonymous visitors accessing the Summit HVAC demo interact exclusively with in-memory `mockStore` with zero database writes.

---

## 3. Phase 5: Real-Time Browser Voice Architecture

```
User Microphone
      ↓ (Float32 -> Int16 Linear PCM 16kHz via Web Audio)
Browser LiveVoiceManager
      ↓ (WebSocket / sendRealtimeInput)
Gemini Live API (gemini-3.8-live)
      ↓ (Inline 24kHz Linear PCM Audio + Transcripts + ToolCalls)
Browser Web Audio Playback Queue + Live Tool Dispatcher
      ├── Audio Playback (Speaker, with Barge-in discard on interruption)
      ├── Live Transcript Updates (Customer & Receptionist)
      └── Tool Execution (POST /api/receptionist/tools -> executeAgentTool)
            ↓ (sendToolResponse)
         Gemini continues speaking
```

### Security & Ephemeral Token Authentication
- **Zero API Key Leakage**: Browser-side code never receives, stores, or transmits `GEMINI_API_KEY`.
- **Ephemeral Token Endpoint**: `POST /api/receptionist/live-token` runs strictly server-side using the official `@google/genai` SDK (`v1alpha`).
- **Locked Constraints**:
  - Model: `gemini-3.8-live` (or `GEMINI_LIVE_MODEL`)
  - Modalities: `[Modality.AUDIO]`
  - Voice: `Aoede` (natural conversational voice)
  - System Instructions: Summit HVAC system prompt (safety rules, no fake pricing)
  - Tools: Whitelisted function declarations (`RECEPTIONIST_TOOLS`)
  - Transcriptions: Input & Output audio transcription enabled
- The server generates a single-use token (`auth_tokens/...`) that expires automatically.

### Web Audio Pipeline & Interruption (Barge-in)
- **Input Capture**: `navigator.mediaDevices.getUserMedia` captures microphone audio with echo cancellation, noise suppression, and auto gain control. Audio is converted to 16-bit mono Linear PCM downsampled to 16000Hz and streamed via WebSocket (`session.sendRealtimeInput`).
- **Native Audio Playback**: 24000Hz PCM chunks from Gemini Live are queued seamlessly in an `AudioContext` buffer queue.
- **Barge-In / Interruption**: When Gemini detects user speech while speaking, it issues `serverContent.interrupted`. The client immediately cancels all scheduled audio buffers, flushes the audio queue, and switches the UI state back to listening.

### Tool Execution during Voice
When Gemini Live calls an agent tool during a voice conversation:
1. `LiveVoiceManager` intercepts the `toolCall` message.
2. Dispatches the call to `POST /api/receptionist/tools`.
3. The server validates and executes `executeAgentTool` against local mock data.
4. The result is returned via `session.sendToolResponse({ functionResponses })` and local UI panels (Customer Info, Lead Status, Agent Actions) update in real time.
5. Gemini continues speaking naturally with the verified tool output.

---

## 3. Environment Variables

Create `.env.local` in the project root:

```env
# Google Gemini API Key (Required for conversation & voice)
GEMINI_API_KEY=your_gemini_api_key_here

# Gemini Live Model ID (Default: gemini-3.8-live)
GEMINI_LIVE_MODEL=gemini-3.8-live

# Gemini Chat Model ID (Default: gemini-3.8-flash)
GEMINI_MODEL=gemini-3.8-flash
```

---

## 4. How to Run Locally

### Prerequisites
- Node.js `v20+` or `v24+` (tested on Node v24.21.0)
- `pnpm` (recommended), `npm`, or `yarn`
- A browser supporting Web Audio and `getUserMedia` (Chrome, Edge, Firefox, Safari)

### Installation & Execution
```bash
# 1. Install dependencies
pnpm install

# 2. Run automated test suites
pnpm dlx tsx tests/phase5_voice_suite.ts
pnpm dlx tsx tests/phase4_regression_suite.ts

# 3. Type-check the project
pnpm tsc --noEmit

# 4. Build for production
pnpm build

# 5. Start local development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 5. How to Use Browser Voice

1. Navigate to the **Interactive AI Receptionist Simulator** on the home page.
2. Select the **Real-Time Voice (Gemini 3.8 Live)** tab.
3. Click **Start Voice Conversation**.
4. Allow browser microphone access when prompted.
5. Speak naturally into your microphone (e.g., *"Hi, my AC isn't cooling. I'm at 456 Oak Street in Plano."*).
6. Listen to Gemini 3.8 Live speak back to you with natural audio.
7. Test interrupting: speak while Gemini is talking &mdash; speech stops instantly.
8. Click **Mute Mic** or **End Voice Call** at any time to release microphone hardware tracks.

*(You can also switch to the **Text Chat & Presets** tab at any time to test the simulator via typed inputs or pre-configured scenarios).*

---

## 6. How to Run Phase 6 Telephony Bridge

### Dual-Endpoint Architecture:
1. **Next.js Web / API Server** (Port `3000`): Serves the web UI and handles the inbound Twilio Voice Webhook (`POST /api/telephony/twilio/voice`).
2. **Telephony Bridge Server** (Port `8080`): Handles bi-directional Twilio Media Streams (`wss://.../api/telephony/twilio-stream`) connected to Gemini 3.8 Live.

### Local Development with Separate Tunnels:
To expose both services locally to Twilio without requiring a reverse proxy:

1. **Expose Next.js Webhook (Port 3000)**:
   ```bash
   ngrok http 3000
   # e.g. https://app-tunnel.ngrok-free.app
   ```
2. **Expose Telephony WebSocket Server (Port 8080)**:
   ```bash
   ngrok http 8080
   # e.g. https://ws-tunnel.ngrok-free.app
   ```
3. **Configure `.env.local`**:
   ```env
   PUBLIC_HTTP_BASE_URL="https://app-tunnel.ngrok-free.app"
   PUBLIC_WS_BASE_URL="https://ws-tunnel.ngrok-free.app"
   TELEPHONY_PORT=8080
   TWILIO_AUTH_TOKEN="your_twilio_auth_token"
   ```
4. **Start Both Servers**:
   ```bash
   # Terminal 1: Next.js dev server
   npm run dev

   # Terminal 2: Standalone Telephony WebSocket server
   npm run telephony
   ```
5. **Configure Twilio Console**:
   - In Twilio Console > Phone Numbers > Active Numbers > Voice:
   - Set Webhook: `POST https://app-tunnel.ngrok-free.app/api/telephony/twilio/voice`
   - When called, the webhook responds with TwiML directing caller audio to `wss://ws-tunnel.ngrok-free.app/api/telephony/twilio-stream`.

---

---

## 7. Phase 7 Pilot Readiness & Production Hardening

### Pilot Test Configuration ("ABC Cooling & Heating")
A documented pilot configuration is provided for local and staging verification:
- **Contractor Name**: `ABC Cooling & Heating`
- **Territory**: `Plano`, `Richardson`, Texas
- **Services Offered**: `AC Repair & Diagnostic`, `HVAC Maintenance`, `Heating & Furnace Repair`, `Emergency Service`
- **Operating Hours**: Monday–Friday 8:00 AM – 6:00 PM; Saturday–Sunday Closed
- **Emergency Service**: Enabled (24/7 on-call dispatch for severe heating/cooling failures during freezing/extreme heat)
- **Transfer Line**: `(972) 555-0199`
- **Seed Script**: Run `pnpm tsx scripts/seed_pilot_account.ts` to provision or synchronize the pilot account in Supabase.

### Required Environment Variables & Vercel Deployment Checklist
Ensure the following variables are configured in `.env.local` or your Vercel Project Settings:

| Variable | Environment | Required | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Server Only | Yes | Google AI Studio key for Gemini 3.8 Live & Flash |
| `GEMINI_LIVE_MODEL` | Server Only | Optional | Live audio model identifier (defaults to `gemini-3.8-live`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public (Client & Server) | Yes | HTTPS project URL for Supabase instance |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (Client & Server) | Yes | Supabase client anon public key for auth sessions |
| `SUPABASE_SERVICE_ROLE_KEY` | Server Only | Yes | Supabase admin secret for tenant-scoped database queries |
| `NODE_ENV` | System | Auto | Set to `production` in Vercel |

> [!CAUTION]
> **Zero Client Secret Exposure**:
> `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must **never** be prefixed with `NEXT_PUBLIC_` or imported into client components. The build will fail or trigger security alerts if leaked.

### Health Check & System Probe
- **Endpoint**: `GET /api/health`
- **Purpose**: Low-overhead liveness and readiness probe for uptime monitors (Vercel, BetterStack, Pingdom).
- **Security**: Reports subsystem status (`healthy` / `degraded`, `configured` / `missing`) **without ever exposing secret keys or credential hashes**.

### Customer Data Privacy & PII Scrubbing
- **Zero Audio Storage**: Audio streams are processed exclusively in-memory and streamed via WebSockets. No raw audio recordings or audio files are ever written to disk or the database.
- **Operational Log Scrubbing**: Server diagnostics and tool logs automatically mask customer phone numbers (e.g. `(972) ***-**99`), street addresses (e.g. `*** Legacy Dr, Plano`), and customer names (e.g. `J*** D***`).
- **Data Stored**:
  - `leads`: Customer name, contact phone, service street/city, service type, reported issue summary, urgency, status.
  - `appointments`: Requested date/slot window, status (`requested`), dispatcher notes.
  - `conversations`: Transcript messages (text only), channel (`web_voice` / `web_chat`), duration.
  - `call_events`: Audit timeline events of tool executions (`check_service_area`, `create_lead`, etc.).

### Public Demo Abuse Protection
- The public landing page demo (`Summit HVAC`) operates 100% in-memory with **zero database writes**.
- An in-memory session limiter enforces:
  - Max 30 conversation turns / tool actions per demo session.
  - Max 6 live audio token requests per session.
  - Automatic memory cleanup every 15 minutes.
- Authenticated contractors are completely exempt from demo rate limits.

### Troubleshooting & Diagnostics
1. **"AI voice service is temporarily unavailable"**:
   - Verify `GEMINI_API_KEY` is configured and valid in your server environment.
   - Run `curl http://localhost:3000/api/health` to inspect Gemini service status.
2. **Microphone Access Denied**:
   - Ensure your browser has granted microphone permissions. Click the lock/settings icon in the browser address bar to allow audio input.
3. **Missing Business Profile (HTTP 403)**:
   - Authenticated users without a completed contractor profile are prevented from accessing `/dashboard`, `/leads`, or `/settings` and redirected to `/onboarding`.
4. **Appointment Status Invariant**:
   - By architectural design, all AI-scheduled appointments remain strictly in `requested` status until human dispatcher confirmation.

---

## 8. What is Intentionally Deferred (Future Roadmap)

To maintain focus and pilot safety, the following remain deferred:
- ❌ Stripe or Dodo billing / paid subscription tiers
- ❌ Automatic outbound telemarketing or cold calling
- ❌ Automated bulk SMS promotional campaigns
- ❌ External third-party CRM sync (ServiceTitan, Salesforce)
- ❌ Third-party calendar integrations (Google Calendar, Outlook)
- ❌ Raw audio recording retention or voice analytics

