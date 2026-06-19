# Flutter Rebuild Execution Plan (April 7, 2026)

## Scope
Source audited:
- Web app: `frontend`
- Flutter app: `app`
- Backend contracts: `backend`

Goal:
- Keep Flutter business behavior aligned with web and backend.
- Prefer web layout parity where web screens are already responsive and app-usable.
- Keep only minimal mobile adaptations required for tap targets, spacing, and overflow safety.
- Execute feature-by-feature with parity checks before closing each module.

## Current Parity Snapshot

### Auth and RBAC
- Web status: complete route protection + role gates (`admin`, `account`, `sales`, `client`).
- Flutter status before this iteration: partial.
- Main gaps found:
  - User model did not fully parse `current_role`, `current_firm_role`, `current_contact_id`.
  - Drawer navigation was not role-accurate.
  - Accessibility issue: global `TextScaler.noScaling`.
- Fixed in this iteration:
  - Added normalized role/permission policy aligned with backend aliases.
  - Extended user/firm parsing for firm role and contact metadata.
  - Applied role-aware drawer sections.
  - Replaced hard text-scaling disable with clamped adaptive scaling.

### Masters
- Party, agent, transport, area, bank, department, label, brand, discount: present in Flutter.
- Return master and transaction history: present.
- Gaps:
  - Firm master flow (web: `/masters/firm-master` + setup screens) not present in Flutter.
  - Category master/view-category (web inventory) not present in Flutter.
  - Web "item update" bulk flow is richer than Flutter equivalent.

### Transactions
- Challan and bill create/list flows exist in Flutter.
- Outstandings and outstanding list exist in Flutter.
- Major parity risk:
  - Web `BillForm.jsx` and `ChallanForm.jsx` are much richer (2.9k-3.7k lines each) than Flutter forms (about 400 lines each).
  - Expected missing depth includes edge validations, advanced linking flows, and some power-user operations.

### Reports
- Flutter has account ledger, item ledger, collection, outstanding list screens.
- Web has additional rich report modules with dedicated UX and detail screens.
- Major gap:
  - Multiple report routes in Flutter are routed to one generic report screen, while web uses distinct, specialized screens and filters.

### Setup and Admin
- Backup/restore, financial year close, cheque setup screens exist in Flutter.
- Admin exists but is simplified vs web `UserMaster` and `AdminPanel` capabilities.

## Recommended Target Architecture (Flutter)

Adopt feature-first modular layout while preserving current GetX runtime:

- `lib/app/core/`
  - design system, auth/permissions, networking, error mapping, responsive primitives
- `lib/app/features/<feature>/`
  - `data/` (dto, mappers, repository impl)
  - `domain/` (models, use-cases, contracts)
  - `presentation/` (controllers, screens, widgets)
- `lib/app/routes/`
  - typed route registry + central role access metadata

Principles:
- UI never calls raw API directly.
- Controllers orchestrate use-cases, not transport details.
- Shared widgets stay presentational and stateless when possible.
- One source of truth for role rules, filters, and route access.

## Execution Order (High to Low Risk)

1. Foundation
- Role guard middleware + route metadata parity with web protected routes.
- Responsive tokens, adaptive layout helpers, accessibility baseline.
- Shared empty/loading/error state standardization.

2. Transaction Core
- Rebuild Challan create/edit with full web parity checklist.
- Rebuild Bill create flow (including linked challan logic and validations).
- Validate stock, discount, GST, and payment status transitions end-to-end.

3. Transaction Operations
- Challan list and bill list advanced actions.
- Outstandings and settlement behavior parity.
- Transaction history and return workflows.

### Layout Strategy Update (Requested)
- Treat the existing responsive web layout as the baseline design system for Flutter screens.
- Reuse web information architecture (header, summary, filters, tables/actions) unless a platform constraint forces change.
- Avoid introducing alternate mobile-only flows when web layout already works cleanly on phone/tablet.

4. Reports
- Split generic report screen into dedicated report modules:
  - account ledger
  - purchase/sales
  - GST dashboard + details
  - purchase date-wise
  - profit/loss
  - collection
- Mobile-native chart/list/detail drill-down UX.

5. Masters and Setup Completion
- Add missing firm/category/view-category modules.
- Close all CRUD parity and validation gaps.

6. Admin Completion
- Align user/subscription/status/signature operations with web behavior.

## Screen Completion Definition (Must Pass Before Moving On)
- API parity confirmed (request payloads, filters, pagination, status updates).
- Role visibility and action permissions match web/backend.
- Loading, empty, error, and retry states implemented.
- No overflow on small phones, large phones, tablets, or landscape.
- Input validation and edge cases covered.
- Manual QA checklist signed for create, edit, delete, search, filter, and export/print flows.

## Files Updated in This Iteration
- `app/lib/app/core/auth/permission_policy.dart` (new)
- `app/lib/app/data/models/firm_model.dart`
- `app/lib/app/data/models/user_model.dart`
- `app/lib/app/presentation/controllers/auth/auth_controller.dart`
- `app/lib/app/presentation/shared/widgets/drawer/app_drawer.dart`
- `app/lib/main.dart`
