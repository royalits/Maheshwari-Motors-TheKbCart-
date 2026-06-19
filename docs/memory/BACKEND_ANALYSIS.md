# Backend Architecture & Logic Documentation

This document describes how the Node.js backend works in detail, including structure, data models, API flow, stock logic, challan/bill rules, returns, subscription handling, and automation.

---

## 1) Tech stack and entry flow

- Runtime: Node.js + Express 5 + MongoDB (Mongoose)
- Auth: JWT + DB-backed session records
- File storage: AWS S3
- Jobs: `node-cron` (daily)

### Startup sequence

1. `backend/index.js` loads env and sets DNS.
2. DB connection starts via `src/config/database.js`.
3. Express app starts via `src/app.js`.
4. Routes mounted under `/api/v1`.
5. On listen, two cron jobs are started:
   - subscription expiry job
   - auto-bill job

### App middleware order

1. CORS (`env.CORS_ORIGIN` or `*`)
2. JSON body parser (10MB)
3. URL-encoded parser
4. API routers
5. 404 handler
6. global error handler

---

## 2) High-level backend structure

- `src/models`: MongoDB schemas
- `src/services`: business logic (primary logic layer)
- `src/controllers`: request/response mapping
- `src/routers`: endpoint grouping
- `src/middlewares`: auth + error handling
- `src/jobs`: cron flows
- `src/helpers`: sequence/counter utilities
- `src/utils`: shared helpers (`ApiError`, pagination, parsing)

Pattern used everywhere:

`Router -> Controller -> Service -> Model`

---

## 3) Authentication, roles and firm context

### Roles

- `admin`
- `firm` (with `firm_type = GST | NON_GST`)

### Login behavior

- `auth.service.js` first tries admin login, then firm login.
- On success, a JWT is issued and a `Session` record is created.

### Per-request auth

- `auth.middleware.js` validates `Bearer` token.
- Confirms token exists in `Session` collection.
- Loads active user and sets:
  - `req.user`
  - `req.role`
  - `req.firmType` (for firm login)
  - `req.isGst` (`1` for GST, `0` for NON_GST)

This `req.isGst` drives almost all transactional filtering and stock behavior.

---

## 4) Core domain model map

## 4.1 Auth models

- `User`
  - one user stores: admin creds + GST firm creds + NON_GST firm creds
  - includes company metadata and optional signature URL
- `Session`
  - token, role, firm type, device, IP, last active

## 4.2 Master models

- `Item`
  - pricing + GST fields + image + 3 stock fields:
    - `physical_stock`
    - `logical_stock`
    - `stock`
- `Contact`
  - `type`: `party | supplier | book`
  - holds running `balance`
- `Brand`, `Department`, `HSN`, `Label`, `Agent`, `Area`, `Transport`, `Bank`

## 4.3 Transaction models

- `Challan` (sale/purchase pre-billing document)
- `Bill` (final billed aggregate, references challans)
- `Return` (sale return / purchase return)
- `Transaction` (cash/bank ledger entry)
- `AutoBill` (rule config for cron conversion)

## 4.4 Infra/common models

- `Counter` (per-user auto-increment sequences)
- `Subscription` (plan, expiry, history)
- `Report` (artifact metadata)

---

## 5) Business-critical stock logic (MVP behavior)

Implemented in `src/services/inventory/stock.service.js`.

### GST flow (`is_gst = 1`)

- Sale challan: deduct from `physical_stock` and `stock`
- Purchase challan: add to `physical_stock` and `stock`
- Validation checks available `physical_stock` before sale deduction

### NON_GST flow (`is_gst = 0`)

- Sale challan: deduct from `logical_stock`
- Purchase challan: add to `logical_stock`
- Physical stock is not used for non-GST stock movement

This is exactly the project’s “physical vs logical stock” split.

---

## 6) Challan logic (sale/purchase)

Implemented in `transaction/challan.service.js`.

### Create sale challan

- Validates contact is `party`
- Requires/resolves label
- Validates all items belong to user
- Accepts item-line financial fields from frontend (`gross_amount`, `discount_amount`, `taxable_amount`, `gst_amount`, `amount`)
- For mixed item GST groups, it can create linked challans:
  - one GST challan
  - one NON_GST challan
  - both linked by `linked_challan_id`
- Deducts stock via `stockService.deductStock`

### Create purchase challan

- Validates contact is `supplier`
- Adds stock via `stockService.addStock`
- Updates item `is_gst` to supplier GST mode for involved items

### Challan deletion

- Sale challan: cannot delete if already converted to bill
- Sale delete restores stock
- Purchase delete removes added stock

---

## 7) Billing logic

Implemented in `transaction/bill.service.js`.

### Bill creation

- Requires at least one unconverted sale challan for same contact and firm
- Calculates total from challans or accepts provided amount
- Optional `apply_balance` adjusts contact balance into bill
- Optional `delivered_amount` creates partial return style adjustment:
  - bill amount becomes delivered amount
  - remainder credited to contact balance
- Marks challans as `converted_to_bill = true` and sets `bill_id`

### Batch conversion

- Groups challans by `(is_gst, contact_id)`
- Creates one bill per group

### Payment settlement

- Supports explicit allocations or auto-allocation oldest-first
- Updates `payment_entries`, `paid_amount`, and `payment_status`
- Surplus can be moved into contact balance

### Return handling on bill

- Reduces bill amount
- creates payment entry with `settled_to = unsettled_balance`
- credits contact balance

### Payment status calculation

- If paid approx equals amount (`< 0.01` diff): `paid`
- If paid less than amount: `due`
- Else: `overpaid`

---

## 8) Returns logic

Implemented in `transaction/return.service.js`.

### Sale return

- Validates bill and ensures item return qty does not exceed bill qty minus previously returned qty
- Non-damaged returned items restore stock
- Reduces bill amount and increments bill return amount
- Credits contact balance

### Purchase return

- Validates purchase challan and quantity boundaries
- Removes stock for returned items
- Reduces purchase challan amount and recalculates payment status

### Damage tracking

- Return line has `is_damaged`
- Summary returns damaged/not-damaged counts and quantities

---

## 9) Financial transaction ledger logic

Implemented in `transaction/transaction.service.js`.

- Types: `bank_received`, `cash_received`, `bank_payment`, `cash_payment`
- Bank types require valid `bank_id`
- Supports listing/filtering by contact, bank, date, and logical “books”:
  - cash book
  - ac book
  - creditor
  - debitor

---

## 10) Reporting logic

Implemented mainly in `report/report.service.js`.

Major report families:

- purchase dashboard + purchase details
- sales dashboard + sales details
- collection report
- account ledger (party + cash/bank mode)
- gst dashboard + gst report

Most reports are built with Mongo aggregation and optional date/contact/item filters.

---

## 11) Subscription and automation jobs

## 11.1 Subscription

`subscription.service.js`:

- auto-create demo subscription (30 days) if missing
- set/extend paid/demo plans
- support extension from current expiry
- track previous plan states in `history`

`subscriptionExpiry.cron.js`:

- daily marks expired active subscriptions
- also checks expiring-today list

## 11.2 Auto bill

`autoBill.cron.js`:

- daily scans active automation rules
- for each rule, fetches unconverted sale challans for party
- if threshold met, creates bill from that batch
- skips mixed GST/NON_GST batches

---

## 12) Routing map (module level)

All routes mount under `/api/v1`.

- `/auth` - login/session/profile/signature
- `/admin` - secondary user + subscription admin operations
- `/items`, `/labels`, `/brands`, `/hsn`, `/contacts`, `/agents`, `/transports`, `/areas`, `/departments`, `/banks`
- `/challans`, `/bills`, `/returns`, `/transactions`, `/automation-rules`
- `/dashboard`
- `/reports`, `/item-ledger`, `/outstanding`
- `/setup`, `/backup`

Refer to files under `src/routers/**` for exact method/path-level definitions.

---

## 13) Important data relationships

- One user owns all records (`user_id` scoping is central tenant boundary)
- Bill references many challans (`challan_ids`)
- Return references either bill or purchase challan
- Contact balance is adjusted by:
  - bill apply balance
  - bill partial return / returns
  - overpayment settlement
- Item stock is mutated only through challan/return paths (and item updates)

---

## 14) Known implementation characteristics / caveats

- Most multi-document updates are not wrapped in Mongo transactions.
- Rate-limit env exists but middleware not currently applied.
- Non-GST stock deduction does not enforce “enough logical stock” check.
- Auto-bill mixed-firm challan groups are skipped.

These are not assumptions; they reflect current service behavior.

---

## 15) End-to-end flow summary

1. User logs in (admin or firm) -> JWT + session
2. Firm creates/updates master data (items/contacts/etc.)
3. User creates sale/purchase challans
4. Stock updates immediately per firm mode
5. Sale challans are converted into bill(s)
6. Payments and settlements update bill status and contact balance
7. Returns update stock, bill/challan totals, and contact balance
8. Reports aggregate challans, bills, transactions, and returns
9. Cron jobs handle subscription expiry and auto-billing

---

## 16) Suggested next documentation additions (optional)

If needed, the next layer can be added as separate docs:

- field-by-field API contract (request/response examples)
- error catalog by endpoint
- frontend-to-endpoint matrix
- DB index and query optimization notes
