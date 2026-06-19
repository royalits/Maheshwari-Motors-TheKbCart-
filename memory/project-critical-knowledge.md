# Maheshwari Motors - Critical Project Knowledge

**Project Type:** Full-Stack ERP
**Updated:** April 29, 2026

---

## 1. BUILD & TEST COMMANDS

### Flutter App (Mobile)
```bash
# From: app/
flutter pub get              # Install dependencies
flutter run -d <device-id>  # Run on device
flutter test                # Run tests
flutter build apk           # Build Android APK
flutter build ios           # Build iOS app
```
**Key:** Requires Flutter SDK 3.10.8+, runs on mobile/tablet browsers

### Node.js Backend
```bash
# From: backend/
npm install                    # Install dependencies
npm run dev                    # Start dev server (port 3000)
npm run start                  # Start production
npm run seed                   # Seed test data to MongoDB
npm run subscription:job       # Run subscription expiry cron job
npm run financial-year:close   # Trigger financial year close
```
**Key:** Node 20+, MongoDB required. Cron jobs start automatically with server.

### React Frontend (Web)
```bash
# From: frontend/
npm install                    # Install dependencies
npm run dev                    # Dev server (http://localhost:5173)
npm run build                  # Production build
npm run lint                   # Run ESLint
npm run preview               # Preview production build
npm run test                  # Run Vitest
```
**Key:** Vite-based, hot reload enabled. Build output to `dist/`

---

## 2. ARCHITECTURE OVERVIEW

### High-Level Design
```
┌─────────────────┐
│  Flutter App    │──┐
├─────────────────┤  │
│  React Web      │──┼──→ Express API (Node.js) ──→ MongoDB
├─────────────────┤  │                               ↓
│  Browsers       │──┘                            AWS S3
└─────────────────┘                             (Backups)
                     ↑                              ↑
                     │                              │
                 JWT Auth                    Background Jobs
                                          (Cron: Bills, Subs)
```

### 4-Tier Architecture
| Layer | Technology | Role |
|-------|-----------|------|
| **Presentation** | React 19 + Flutter | UI, User interactions, client state |
| **API** | Express.js | HTTP routing, validation, middleware |
| **Business Logic** | Node.js Services | Calculations, validations, workflows |
| **Data** | MongoDB + AWS S3 | Persistence, file storage |

### Key Patterns
- **Multi-Tenancy:** User-based isolation (filter all queries by `user_id`)
- **Dual Firm:** GST/Non-GST separation via `is_gst` field (0 or 1)
- **JWT Auth:** Stateless, stored in localStorage, validated per request
- **Server State:** React Query for API caching & auto-refetch
- **Cron Jobs:** Auto-billing daily, subscription expiry checks, financial year close
- **Repository Pattern:** Controllers → Services → Models

### Main Directories
```
backend/src/
├── controllers/    # Route handlers (auth/, master/, transaction/, etc.)
├── services/       # Business logic (bill calc, stock mgmt, auth flows)
├── models/         # MongoDB schemas
├── routers/        # Express route definitions
├── middlewares/    # Auth, CORS, error handling
├── jobs/           # Cron jobs (autoBill, subscriptionExpiry, FY close)
├── helpers/        # Utilities (calculations, validators)
├── config/         # Environment variables
├── utils/          # Common functions (asyncHandler, etc.)

frontend/src/
├── pages/          # Page components (auth, dashboard, setup, etc.)
├── components/     # Reusable components (UI, masters, transactions)
├── store/          # Zustand stores (auth, firm, UI state)
├── hooks/          # Custom React hooks (API calls, validation)
├── services/       # Axios instances, API clients
├── contexts/       # React context APIs
├── utils/          # Helpers, formatters
```

### Core Modules
1. **Authentication** - Login, JWT, sessions, multi-device tracking
2. **Masters** - Firms, parties, items, accounts, banks
3. **Transactions** - Bills, challans, payments, returns
4. **Inventory** - Stock tracking, item ledgers
5. **Reports** - GST, sales, purchase, ledgers
6. **Setup** - Firm config, user rights, financial year

---

## 3. NAMING CONVENTIONS & PATTERNS

### Backend Naming
- **Models:** PascalCase + `.model.js`
  Example: `User.model.js`, `Bill.model.js`
- **Controllers:** PascalCase + `.controller.js`
  Example: `AuthController.js`, `BillController.js`
- **Services:** PascalCase + `.service.js`
  Example: `AuthService.js`, `StockService.js`
- **Routes:** kebab-case + `.routes.js`
  Example: `auth.routes.js`, `bill-generation.routes.js`
- **Jobs/Cron:** camelCase + `.cron.js`
  Example: `autoBill.cron.js`, `subscriptionExpiry.cron.js`
- **Helper Functions:** camelCase
  Example: `calculateGST()`, `generateBillNumber()`

### Frontend Naming
- **Components:** PascalCase + `.jsx`
  Example: `FirmSetup.jsx`, `ChallanEntry.jsx`
- **Pages:** PascalCase + `.jsx`
  Example: `Dashboard.jsx`, `Login.jsx`
- **Hooks:** camelCase, `use` prefix
  Example: `useFetchItems()`, `useValidateForm()`
- **Stores:** camelCase + `Store.js` (Zustand)
  Example: `authStore.js`, `firmStore.js`
- **Types:** PascalCase + `.types.js` (if using interfaces)
- **Utils:** camelCase + `.js`
  Example: `dateFormatter.js`, `validators.js`

### Database Field Naming
- All fields: **snake_case**
  Example: `user_id`, `firm_name`, `bill_number`, `is_gst`
- Boolean fields: `is_` or `has_` prefix
  Example: `is_gst`, `is_active`, `has_discount`
- Amount fields: Numeric, no currency suffix
  Example: `amount`, `total_amount`, `tax_amount`

### API Endpoint Pattern
```
/api/v1/[module]/[resource]/[action]

Examples:
POST   /api/v1/auth/login
GET    /api/v1/masters/items
POST   /api/v1/transactions/bills
GET    /api/v1/reports/gst
DELETE /api/v1/auth/sessions/:id
```

### Error Handling Pattern
- All async handlers wrapped with `asyncHandler()`
- Errors thrown with meaningful messages
- HTTP status codes: 400 (bad req), 401 (auth), 403 (forbidden), 404 (not found), 500 (server)
- Response format: `{ status, message, data, error }`

---

## 4. COMMON DEV ENVIRONMENT ISSUES & SETUP

### Prerequisites
- **Node.js:** v20+ (Check: `node --version`)
- **Flutter:** 3.10.8+ (Check: `flutter --version`)
- **MongoDB:** Local or Atlas connection (Check: `.env` file)
- **AWS S3:** Access keys configured (for file backups)

### Required Environment Variables (.env in backend/)
```
MODE=development
PORT=3000
MONGODB_URI=mongodb+srv://[user]:[pass]@cluster.mongodb.net/maheshwari
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=maheshwari-motors-backups
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| MongoDB Connection Fails | Missing `.env` or wrong URI | Verify `MONGODB_URI` in `.env`, check MongoDB Atlas IP whitelist |
| CORS Errors | Frontend/backend mismatch | Update `CORS_ORIGIN` in backend `.env` to include frontend URL |
| JWT Not Found | Token not stored after login | Check localStorage, verify `setToken()` is called in login response |
| Firm Not Loading | Multi-firm selector issue | Verify `is_gst` value (0 or 1) in database, seed data with `npm run seed` |
| Cron Jobs Not Running | Missing job initialization | Ensure jobs start in `app.js`: `startAutoBillCron()`, `startSubscriptionCron()` |
| S3 Upload Fails | Credentials/permissions | Verify AWS access keys, check S3 bucket policy, ensure region matches |
| React Query Cache Issues | Stale data | Invalidate with `queryClient.invalidateQueries()`, check cache keys |
| Port Already in Use | Another app on port 3000 | Kill process: `lsof -i :3000` (Mac/Linux) or `netstat -ano | findstr :3000` (Windows) |

### First-Time Setup
```bash
# 1. Backend
cd backend
npm install
# Create .env with variables above
npm run seed  # Populate MongoDB with test data
npm run dev

# 2. Frontend
cd frontend
npm install
npm run dev  # Runs on localhost:5173

# 3. Flutter
cd app
flutter pub get
flutter run -d chrome  # Run in web browser for testing
```

### Test Credentials (After Seeding)
```
Admin:       admin_user / Admin@1234
Firm Admin:  firm_user / Firm@1234
Salesman:    sales_user / Sale@1234
Accountant:  account_user / Account@1234
```

---

## 5. ESSENTIAL DOCUMENTATION FILES

### Quick Reference Links
| File | Purpose | Location |
|------|---------|----------|
| [Architecture Overview](../docs/architecture/overview.md) | System design, tech stack, patterns | Master reference |
| [Module Breakdown](../docs/architecture/modules.md) | Each module's responsibility, APIs | Features mapping |
| [Data Flow](../docs/architecture/data-flow.md) | Request/response flows, auth sequence | Debugging flows |
| [Database Schema](../docs/architecture/database.md) | MongoDB collection structure | Data modeling |
| [RBAC Implementation](../docs/architecture/rbac-implementation.md) | Role-based access control | Permission system |
| [Backend Architecture](../docs/architecture/backend.md) | Express structure, middleware | Backend specifics |
| [Frontend Architecture](../docs/architecture/frontend.md) | React structure, state mgmt | Frontend specifics |
| [Auth System (Fixed)](AUTH-SYSTEM-FIXED.md) | Login credentials, auth flows | Testing/troubleshooting |
| [Implementation Complete](../docs/architecture/IMPLEMENTATION-COMPLETE.md) | Feature checklist | Status tracking |
| [Stock Calculation](memory/stock-calculation-implementation.md) | Inventory logic | Stock management |

### Key Readme Files
- [Frontend README](frontend/README.md) - Features, tech stack
- [Backend Package.json](backend/package.json) - Dependencies, scripts
- [Flutter App README](app/README.md) - Mobile app setup
- [Root README](readme.md) - Project overview

### Commands to Explore
```bash
# View all architecture docs
ls docs/architecture/

# Check all backend routes
grep -r "router\." backend/src/routers/

# Find all service methods
grep -r "export.*class" backend/src/services/

# View cron job schedules
grep -r "schedule\|cron" backend/src/jobs/
```

---

## Quick Facts

- **App Name:** Maheshwari Motors
- **Purpose:** Automotive inventory & billing ERP
- **Users:** Multi-tenant (business isolation by `user_id`)
- **Firms:** Dual (GST and Non-GST in single account)
- **Frontend Deployment:** Vercel (https://maheshwari-motors-efuh.vercel.app)
- **Backend Port:** 3000
- **Frontend Port (Dev):** 5173
- **API Version:** v1
- **Auth Method:** JWT (7-day expiry default)
- **Session Tracking:** Multi-device sessions supported
- **Background Jobs:** Auto-billing (daily), subscription expiry, financial year close
- **File Storage:** AWS S3 (signatures, backups, reports)

