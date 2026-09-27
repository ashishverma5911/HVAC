# HVAC AI Receptionist (Stage 1 Prototype)

A purpose-built AI receptionist system engineered for small and independent US heating, ventilation, and air conditioning (HVAC) contractors.

The core product idea is an automated, 24/7 receptionist that answers inbound customer calls, understands reported HVAC issues, collects relevant information, and routes or escalates requests appropriately. It answers common business FAQs based on contractor configuration (such as service areas and business hours), captures verified caller information, qualifies leads, and records preferred appointment windows.

> [!IMPORTANT]
> **Operational Boundary & Non-Diagnosis Policy**:
> The AI receptionist is strictly designed for customer service intake, lead capture, and routing for human contractors and certified technicians. It **does NOT** perform professional HVAC diagnosis, repair decisions, safety determinations, or technical instructions. All inspection pricing, fees, and service policies displayed in the demo are fictional demonstration data configurable by each contractor.

---

## 1. Project Overview

Small HVAC contractors frequently miss inbound customer calls while working on roofs, inside attics, or driving between job sites. Voicemails frequently go unanswered, and frustrated homeowners immediately call the next contractor on Google.

**HVAC AI Receptionist** is being developed to ensure contractors never miss a customer inquiry, day or night. This repository contains the **Phase 1 (Project Foundation)** and **Phase 2 (Prototype UI)** implementation.

---

## 2. Current Functionality (Phase 1 & Phase 2)

- **Landing & Value Proposition Page**:
  - High-trust hero section tailored specifically for US HVAC contractors.
  - Zero hype, unsupported revenue claims, or fake testimonials.
  - 4 capability pillars: Answers Customer Questions, Captures Complete Leads, Handles After-Hours Inquiries, and Escalates When Human Help Is Needed.
  - Explanation of the 3-step call flow: Inbound Greeting &rarr; Issue Intake & Routing &rarr; Action & Dispatch.

- **Interactive AI Receptionist Live Simulator**:
  - Dedicated simulation console for fictional Dallas contractor **Summit HVAC**.
  - Visual status indicator: `AI Receptionist Ready`.
  - Start Conversation, End Conversation, Next Turn, and Fast-Forward controls.
  - Clear **Prototype Mode** banners and disclaimers explaining that voice and audio telephony are simulated in this stage.
  - Conversation Transcript Area with clear visual differentiation between AI receptionist responses, customer statements, and life-safety alerts.
  - **6 Realistic HVAC Scenario Presets**:
    1. *AC Not Cooling (High Urgency)*: Homeowner with 84°F indoor temp, notes reported symptoms, qualifies lead, and reserves afternoon technician slot.
    2. *Emergency Gas Smell / Escalation*: Natural gas odor triage, life-safety evacuation reminder to call 911 / Atmos Energy, immediate escalation to senior technician.
    3. *Inspection Pricing & Policy Inquiry*: Demonstrates answering customer pricing questions using fictional contractor-configured demo policies (e.g. standard diagnostic inspection pricing); transparent customer communication.
    4. *Seasonal Maintenance Request*: Routine 21-point spring tune-up for 2 exterior Carrier condensers.
    5. *Service Area Confirmation*: Inquires about Garland/Rowlett zip codes, confirms coverage territory, reserves technician service window.
    6. *After-Hours Emergency Triage*: 9:45 PM call with infant at home, priority 7:30 AM dispatch triage.
  - **Custom Caller Simulation**: Type any freeform customer inquiry into the console to test simulated receptionist responses.

- **Real-Time Customer Information Panel**:
  - Displays empty state (`Awaiting Customer Details`) until call begins.
  - Incrementally extracts:
    - Customer Name
    - Call-Back Phone Number
    - Physical Service Address
    - Service Type (AC Repair, Maintenance, Emergency Inspection, etc.)
    - Problem Description
    - Urgency Level (Normal, Urgent, Emergency)
    - Preferred Appointment Window

- **Lead Status Pipeline Stepper**:
  - Visual tracking: `New` &rarr; `Qualified` &rarr; `Appointment Requested` &rarr; `Transferred` &rarr; `Completed`.

- **Business Information Panel**:
  - Displays Summit HVAC company profile (Dallas, TX; Dallas, Plano, Irving, Garland service areas; Mon–Fri 8 AM–6 PM; 24/7 Emergency Service).

- **Contractor Dashboard Preview (`/dashboard`)**:
  - High-level KPIs: Calls Today (24), Leads (8), Appointments (4), Urgent Requests (2).
  - Searchable and filterable Recent Leads table with realistic contractor records (John Smith, Sarah Johnson, Robert Martinez, Karen Brooks, etc.).
  - Inspection detail modal showing call notes and reported issues recorded by the AI.

---

## 3. How to Run Locally

### Prerequisites
- Node.js `v20+` or `v24+` (tested on Node v24.21.0)
- `pnpm` (recommended), `npm`, or `yarn`

### Installation & Execution
```bash
# 1. Install dependencies
pnpm install

# 2. Type-check the project
pnpm tsc --noEmit

# 3. Build for production (optional check)
pnpm build

# 4. Start local development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to explore the landing page and simulator, or [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to view the contractor dashboard preview.

---

## 4. What is Intentionally NOT Implemented Yet

To maintain strict project boundaries for Phase 1 & 2, the following systems have **intentionally not been added**:
- ❌ Gemini Live / Gemini API integration
- ❌ Live WebRTC or browser audio microphone recording
- ❌ Twilio, Vapi, Retell, or real US phone number provisioning
- ❌ Supabase or production PostgreSQL database
- ❌ User authentication or multi-tenant accounts
- ❌ Stripe or billing/subscription payments
- ❌ Google Calendar or CRM integrations (ServiceTitan, Housecall Pro)
- ❌ Third-party analytics or paid tracking SDKs

All data in this prototype is handled using clean, local mock state and type-safe domain models.

---

## 5. Planned Next Development Stages

- **Phase 3 — AI Intelligence & Function Calling**:
  - Integrate Google Gemini Live API for dynamic conversational reasoning.
  - Implement tool/function calling for structured entity extraction:
    - `extract_customer_info(name, phone, address)`
    - `check_service_area(zip_code, city)`
    - `check_contractor_availability(date, time_window)`
    - `flag_safety_emergency(hazard_type, severity)`

- **Phase 4 — Voice & Telephony Hookup**:
  - Real-time speech-to-text (STT) and low-latency voice synthesis (TTS).
  - Telephony bridge (SIP / Twilio / Vapi) to route real US toll-free and local phone numbers directly to the receptionist.

- **Phase 5 — Database & Multi-Tenant Contractor SaaS**:
  - Persistent database for contractor profiles, business hours, service zones, and call records.
  - Secure authentication for contractor owners and office dispatchers.
  - Webhook dispatch into contractor CRMs (ServiceTitan, Jobber, Housecall Pro).

---

## 6. TODO & Roadmap

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
- [ ] **Stage 3**: Connect Gemini API for dynamic conversation flows.
- [ ] **Stage 3**: Implement tool calling for address validation and triage rules.
- [ ] **Stage 4**: Add real-time voice streaming and telephony webhook endpoints.
- [ ] **Stage 4**: SMS notifications for customer appointment confirmations.
- [ ] **Stage 5**: Multi-tenant database and contractor onboarding flow.
- [ ] **Stage 5**: Contractor CRM calendar synchronization.
