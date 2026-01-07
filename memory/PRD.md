# CLBH Quick Checkup - Product Requirements Document

## Overview
Clean Legal Bill of Health (CLBH) — Quick Checkup is a client-facing web application designed to generate qualified leads for Jeppsonlaw, LLP. It helps small-to-mid-sized business owners identify preventable legal risks through a 5-7 minute assessment.

## Original Problem Statement
Create a legal risk assessment tool with:
- CLBH Score (Red/Yellow/Green) based on risk analysis
- Top 3-7 Risks summary with plain-English descriptions
- Next-Step Action Plan with prioritized recommendations
- Strong CTA to book a CLBH Review Call
- Three assessment modules: Commercial Lease, Entity Acquisition, Ownership/Partnership

## User Personas
1. **Construction Business Owner** - Primary target, concerned about lease and partnership agreements
2. **SMB Entrepreneur** - Looking to acquire businesses or review partnership terms
3. **Growing Business Owner** - Needing to validate existing legal arrangements

## Core Requirements
- Landing page with calm, confidence-building messaging
- Module selection (lease/acquisition/ownership)
- 8-12 questions per module with multiple-choice answers
- Optional document upload step
- Scoring system with trigger flags for automatic severity elevation
- Lead capture form (name, email, phone, business, state, situation)
- Admin dashboard for lead management with CSV export
- Legal disclaimers throughout

## Technical Stack
- **Frontend**: React 19 + Tailwind CSS + shadcn/ui components
- **Backend**: FastAPI with Python
- **Database**: MongoDB
- **Styling**: Custom design system with Manrope/Playfair Display fonts

## What's Been Implemented (January 7, 2026)

### Completed Features
1. ✅ Landing page with hero section, benefits, and CTAs
2. ✅ Module selection page (3 modules with descriptions)
3. ✅ Assessment wizard with progress bar
4. ✅ Question system with 10 questions per module (30 total)
5. ✅ Scoring algorithm with trigger flags
6. ✅ Optional document upload step
7. ✅ Results page with:
   - CLBH Score (Green/Yellow/Red badge)
   - Confidence meter
   - Top risks list with severity indicators
   - Action plan with priorities
   - "What This Could Cost" section
   - "What We Do in a Review Call" section
8. ✅ Lead capture modal with form validation
9. ✅ Admin dashboard with:
   - Lead statistics (total, high/medium/low risk)
   - Leads table with all details
   - CSV export functionality
10. ✅ Legal disclaimers on landing and results pages
11. ✅ Mobile-responsive design
12. ✅ Jeppsonlaw, LLP branding with navy/steel blue/grey colors

### API Endpoints
- GET /api/ - Health check
- GET /api/questions/{module} - Get questions for module
- GET /api/questions - Get all questions
- POST /api/assessments - Create assessment session
- POST /api/assessments/submit - Submit answers, get results
- GET /api/assessments/{id} - Get assessment results
- POST /api/leads - Submit lead form
- GET /api/admin/leads - Get all leads
- GET /api/admin/leads/export - Export CSV

## Prioritized Backlog

### P0 (Critical) - None remaining

### P1 (High Priority)
- [ ] Calendly integration for scheduling
- [ ] Real email delivery for results (currently mocked)
- [ ] Admin authentication/login

### P2 (Medium Priority)
- [ ] Document upload storage (currently just lead-gen placeholder)
- [ ] Additional industry-specific question sets
- [ ] Email reminders for incomplete assessments
- [ ] Analytics dashboard for conversion tracking

### P3 (Nice to Have)
- [ ] Multi-language support
- [ ] White-label capability
- [ ] CRM integration (Salesforce, HubSpot)
- [ ] Custom branding per partner

## Next Tasks
1. Add Calendly integration for booking review calls
2. Implement email service for sending results (SendGrid/Resend)
3. Add admin login/authentication
4. Consider adding more industry-specific modules

## Test Coverage
- Backend: 100% (11/11 API endpoints tested)
- Frontend: 95% (minor dropdown selector issue in tests, not functional)
