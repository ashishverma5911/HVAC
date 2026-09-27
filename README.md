# HVAC AI Receptionist (Stage 3 — Gemini AI Conversation Engine)

A purpose-built AI receptionist system engineered for small and independent US heating, ventilation, and air conditioning (HVAC) contractors.

The core product idea is an automated, 24/7 receptionist that answers inbound customer calls, understands reported HVAC issues, collects relevant information, and routes or escalates requests appropriately. It answers common business FAQs based on contractor configuration (such as service areas and business hours), captures verified caller information, qualifies leads, and records preferred appointment windows.

> [!IMPORTANT]
> **Operational Boundary & Non-Diagnosis Policy**:
> The AI receptionist is strictly designed for customer service intake, lead capture, and routing for human contractors and certified technicians. It **does NOT** perform professional HVAC diagnosis, repair decisions, safety determinations, or technical instructions. All inspection pricing, fees, and service policies displayed in the demo are fictional demonstration data configurable by each contractor.

---

## 1. Project Overview

Small HVAC contractors frequently miss inbound customer calls while working on roofs, inside attics, or driving between job sites. Voicemails frequently go unanswered, and frustrated homeowners immediately call the next contractor on Google.

**HVAC AI Receptionist** is being developed to ensure contractors never miss a customer inquiry, day or night. This repository contains the **Phase 1 (Project Foundation)**, **Phase 2 (Prototype UI)**, and **Phase 3 (Gemini 3.8 Flash AI Conversation Engine)** implementation.

---

## 2. Current Functionality (Phase 1, Phase 2 & Phase 3)

- **Gemini 3.8 Flash Conversation Engine (Phase 3)**:
  - Powered live by Google's official `@google/genai` SDK.
  - Server-side API endpoint `POST /api/receptionist/chat` ensures zero client-side credential exposure.
  - Multi-turn conversation memory preserving context across queries.
  - Strict system instruction tailored for **Summit HVAC** (Dallas, TX).
  - Safety protocol: immediately detects natural gas odors, smoke, or fire hazards, triggers life-safety evacuation instructions, and escalates for emergency dispatch.
  - Structured entity extraction automatically updates the Customer Information Panel.
  - Intent classification (`AC_COOLING_FAILURE`, `HEATING_FAILURE`, `MAINTENANCE`, `INSTALLATION`, `PRICING`, `APPOINTMENT`, `SERVICE_AREA`, `EMERGENCY`, `GENERAL_QUESTION`, `UNKNOWN`).

- **Landing & Value Proposition Page**:
  - High-trust hero section tailored specifically for US HVAC contractors.
  - Zero hype, unsupported revenue claims, or fake testimonials.
  - 4 capability pillars: Answers Customer Questions, Captures Complete Leads, Handles After-Hours Inquiries, and Escalates When Human Help Is Needed.
  - Explanation of the 3-step call flow: Inbound Greeting &rarr; Issue Intake & Routing &rarr; Action & Dispatch.

- **Interactive AI Receptionist Live Simulator**:
  - Dedicated simulation console for fictional Dallas contractor **Summit HVAC**.
  - Visual status indicator: `Gemini 3.8 Flash Active`.
  - Start Conversation and End Conversation controls.
  - Clear **Prototype Mode** banners explaining that audio voice telephony will follow in Phase 4.
  - Conversation Transcript Area with real-time thinking indicator and clear visual differentiation between AI responses, customer messages, and life-safety alerts.
  - **Quick-Start Preset Inquiries**: Clicking any scenario sends its opening question directly to Gemini 3.8 Flash.
  - **Freeform Input**: Type any realistic homeowner inquiry into the console.

- **Real-Time Customer Information Panel**:
  - Displays empty state (`Awaiting Customer Details`) until call begins.
  - Dynamically populated by Gemini entity extraction:
    - Customer Name
    - Call-Back Phone Number
    - Physical Service Address
    - Service Type (AC Repair, Maintenance, Emergency Inspection, etc.)
    - Problem Description
    - Urgency Level (Normal, Urgent, Emergency)
    - Preferred Appointment Window

- **Lead Status Pipeline Stepper**:
  - Computed in application logic: `New` &rarr; `Qualified` &rarr; `Appointment Requested` &rarr; `Transferred` &rarr; `Completed`.

- **Business Information Panel**:
  - Displays Summit HVAC company profile (Dallas, TX; Dallas, Plano, Irving, Garland service areas; Mon–Fri 8 AM–6 PM; 24/7 Emergency Service).

- **Contractor Dashboard Preview (`/dashboard`)**:
  - High-level KPIs: Calls Today (24), Leads (8), Appointments (4), Urgent Requests (2).
  - Searchable and filterable Recent Leads table with realistic contractor records (John Smith, Sarah Johnson, Robert Martinez, Karen Brooks, etc.).
  - Inspection detail modal showing call notes and reported issues recorded by the AI.

---

## 3. Environment Variables

Create `.env.local` in the project root:
```env
# Google Gemini API Key (Required for live conversation)
GEMINI_API_KEY=your_gemini_api_key_here

# Gemini Model ID (Configurable; defaults to gemini-3.8-flash)
GEMINI_MODEL=gemini-3.8-flash
```

A template is provided in `.env.example`.

---

## 4. How to Run Locally

### Prerequisites
- Node.js `v20+` or `v24+` (tested on Node v24.21.0)
- `pnpm` (recommended), `npm`, or `yarn`

### Installation & Execution
```bash
# 1. Install dependencies
pnpm install

# 2. Type-check the project
pnpm tsc --noEmit

# 3. Build for production
pnpm build

# 4. Start local development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to interact with the Gemini AI receptionist, or [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to view the contractor dashboard preview.

---

## 5. What is Intentionally NOT Implemented Yet

To maintain strict project boundaries for Phase 3, the following systems have **intentionally not been added**:
- ❌ Live WebRTC / browser audio streaming microphone (UI mock provided; real voice in Phase 4)
- ❌ Twilio, Vapi, Retell, or real US phone number provisioning
- ❌ Supabase or production PostgreSQL database
- ❌ User authentication or multi-tenant accounts
- ❌ Stripe or billing/subscription payments
- ❌ Google Calendar or CRM integrations (ServiceTitan, Housecall Pro)
- ❌ Third-party analytics or paid tracking SDKs

---

## 6. Planned Next Development Stages

- **Phase 4 — Voice & Telephony Hookup**:
  - Real-time speech-to-text (STT) and low-latency voice synthesis (TTS).
  - Telephony bridge (SIP / Twilio / Vapi) to route real US toll-free and local phone numbers directly to the receptionist.

- **Phase 5 — Database & Multi-Tenant Contractor SaaS**:
  - Persistent database for contractor profiles, business hours, service zones, and call records.
  - Secure authentication for contractor owners and office dispatchers.
  - Webhook dispatch into contractor CRMs (ServiceTitan, Jobber, Housecall Pro).

---

## 7. TODO & Roadmap

- [x] **Stage 1**: Project foundation with Next.js App Router, TypeScript, and Tailwind CSS.
- [x] **Stage 1**: Decoupled domain types (`CustomerInfo`, `LeadStatus`, `BusinessProfile`, `ConversationMessage`).
- [x] **Stage 2**: Responsive landing page with contractor-focused headline, subheadline, and CTAs.
- [x] **Stage 2**: Trust section with 4 pillars and workflow explanation.
- [x] **Stage 2**: Interactive AI Receptionist simulator for Summit HVAC.
- [x] **Stage 2**: 6 realistic HVAC scenarios (AC not cooling, gas emergency, pricing, tune-up, service area, after-hours).
- [x] **Stage 2**: Customer Information Panel with empty state and real-time extraction simulation.
- [x] **Stage 2**: Lead status stepper (`New` &rarr; `Qualified` &rarr; `Appointment Requested` &rarr; `Transferred` &rarr; `Completed`).
- [x] **Stage 2**: Summit HVAC business details panel.
- [x] **Stage 2**: Contractor Dashboard preview route (`/dashboard`) with KPI metrics and recent leads table.
- [x] **Stage 3**: Official Google GenAI SDK (`@google/genai`) integration.
- [x] **Stage 3**: Configure Gemini 3.8 Flash (`gemini-3.8-flash`) as the default model.
- [x] **Stage 3**: Server-side API route `POST /api/receptionist/chat`.
- [x] **Stage 3**: Summit HVAC system instruction with non-diagnosis and safety escalation.
- [x] **Stage 3**: Real-time customer data extraction & intent classification.
- [x] **Stage 3**: Context-aware multi-turn conversation memory.
- [ ] **Stage 4**: Add real-time voice streaming and telephony webhook endpoints.
- [ ] **Stage 4**: SMS notifications for customer appointment confirmations.
- [ ] **Stage 5**: Multi-tenant database and contractor onboarding flow.
- [ ] **Stage 5**: Contractor CRM calendar synchronization.
