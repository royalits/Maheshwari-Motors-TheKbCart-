# Frontend Architecture

## Overview

The frontend is built using **React 18** with **Vite** as the build tool. It follows a **component-based architecture** with centralized state management and API integration.

**Tech Stack:**
- Framework: React 18
- Build Tool: Vite
- Routing: React Router v6
- State Management: Zustand + React Query (TanStack Query)
- Styling: Tailwind CSS
- HTTP Client: Axios
- Icons: React Icons
- Form Handling: Custom hooks + React state

---

## Architecture Type

**Component-Based Architecture with Layered Structure**

The application follows a **5-layer architecture**:

1. **Pages Layer** - Route-level components
2. **Components Layer** - Reusable UI components
3. **Hooks Layer** - Custom React hooks for data fetching
4. **Services Layer** - API communication and utilities
5. **Store Layer** - Global state management

**Characteristics:**
- Component-based UI architecture
- Centralized state management (Zustand)
- Server state management (React Query)
- Custom hooks for data fetching
- Utility-first CSS (Tailwind)
- Type-safe API utilities

---

## Project Structure

```
frontend/src/
├── pages/              # Route-level page components
│   ├── auth/          # Authentication pages
│   ├── core/          # Core pages (Dashboard, Settings)
│   ├── inventory/     # Inventory management pages
│   ├── masters/       # Master data pages
│   ├── reports/       # Report pages
│   ├── setup/         # Setup and configuration pages
│   └── transactions/  # Transaction pages
├── components/        # Reusable components
│   ├── common/       # Common UI components
│   ├── layout/       # Layout components
│   └── ui/           # Form and UI components
├── hooks/            # Custom React hooks
├── services/         # API services and utilities
├── store/            # Zustand store
├── contexts/         # React contexts (legacy)
├── utils/            # Utility functions
├── assets/           # Static assets
├── App.jsx           # Main app component
└── main.jsx          # Entry point
```

---

## State Management

### 1. Global State (Zustand)

**File:** `store/index.js`

**Purpose:** Client-side global state management

**State Categories:**

#### Authentication State
```javascript
{
  user: null,              // Current user object
  isAuthenticated: false,  // Auth status
}
```

#### Firm Context
```javascript
{
  selectedFirm: null,      // Currently selected firm
  firms: [],               // Available firms (GST/Non-GST)
}
```

#### UI State
```javascript
{
  loading: false,          // Global loading state
  toast: null,             // Toast notification
  confirmDialog: null,     // Confirmation dialog
}
```

#### Master Data Cache
```javascript
{
  accounts: [],
  items: [],
  users: [],
  groups: [],
  units: [],
  hsn: [],
  agents: [],
  transporters: [],
  books: [],
}
```

#### Transaction Data
```javascript
{
  challans: [],
  bills: [],
  transactions: [],
}
```

**Key Actions:**
- `setUser(user)` - Set authenticated user
- `logout()` - Clear user and auth state
- `setFirm(firm)` - Select active firm
- `showToast(message, type)` - Show notification
- `showConfirm(message, onConfirm, onCancel)` - Show confirmation dialog
- `setLoading(loading)` - Set global loading state

### 2. Server State (React Query)

**Configuration:** `main.jsx`

**Settings:**
- `staleTime: 5 minutes` - Data considered fresh for 5 minutes
- `gcTime: 10 minutes` - Cache garbage collection after 10 minutes
- `refetchOnWindowFocus: false` - Don't refetch on window focus
- `retry: 1` - Retry failed requests once

**Query Keys:**
- `['items', params]` - Items list
- `['items', 'all']` - All items (paginated fetch)
- `['items-low-stock', params]` - Low stock items
- `['brands', params]` - Brands list
- `['contacts', params]` - Contacts list
- `['challans', params]` - Challans list
- `['bills', params]` - Bills list
- `['dashboard']` - Dashboard data
- `['auth', 'me']` - Current user profile

---

## Pages Structure

### 1. Authentication Module

**Pages:**
- `Login.jsx` - User login (admin/firm)
- `ForgotPassword.jsx` - Password recovery (not implemented)

**Routes:**
- `/login` - Login page
- `/` - Redirects to `/login`

**Features:**
- JWT token-based authentication
- Dual login (Admin/Firm)
- Firm selection after login
- Token storage in localStorage
- Auto-redirect on auth failure

---

### 2. Core Module

**Pages:**
- `Dashboard.jsx` - Main dashboard with stats and recent activity
- `Settings.jsx` - Application settings
- `UserProfile.jsx` - User profile management
- `HelpSupportPage.jsx` - Help and support

**Routes:**
- `/dashboard` - Main dashboard
- `/settings` - Settings page
- `/user-profile` - User profile
- `/help-support` - Help page

**Dashboard Features:**
- Total challans count
- Total bills count
- Low stock alerts
- Recent challans list (last 5)
- Recent bills list (last 5)
- Quick navigation to detail pages

---

### 3. Inventory Module

**Pages:**
- `ItemMaster.jsx` - Item list and management
- `AddItem.jsx` - Add new item
- `ItemUpdate.jsx` - Update item details
- `ItemView.jsx` - View item details
- `StockAlertMaster.jsx` - Low stock alerts
- `CategoryMaster.jsx` - Category management (Brands)
- `ViewCategory.jsx` - View category details
- `LabelMaster.jsx` - Label/pricing management
- `DepartmentMaster.jsx` - Department management
- `AddSupplier.jsx` - Add supplier
- `ViewAllSupplier.jsx` - Supplier list

**Routes:**
- `/inventory/item-master` - Item list
- `/masters/item-master/add` - Add item
- `/inventory/item-update` - Update item
- `/inventory/item-view` - View item
- `/inventory/stock-alert-master` - Stock alerts
- `/inventory/category-master` - Categories
- `/inventory/label-master` - Labels
- `/inventory/department-master` - Departments

**Features:**
- Item CRUD operations
- Image upload for items
- Barcode generation
- Stock management (physical/logical)
- Low stock alerts
- Batch item updates
- Category/Brand associations
- Department categorization

---

### 4. Masters Module

**Pages:**
- `FirmMaster.jsx` - Firm management
- `UserMaster.jsx` - User management
- `AccountMaster.jsx` - Account management
- `PartyMaster.jsx` - Party/Customer management
- `BrandMaster.jsx` - Brand management
- `DiscountMaster.jsx` - Discount configuration
- `AgentMaster.jsx` - Sales agent management
- `TransportMaster.jsx` - Transport company management
- `HsnMaster.jsx` - HSN code management
- `AreaMaster.jsx` - Area/region management
- `BankMaster.jsx` - Bank account management
- `TransactionMaster.jsx` - Transaction management
- `ReturnMaster.jsx` - Return management

**Routes:**
- `/masters/firm-master` - Firm list
- `/masters/user-master` - User list
- `/masters/account-master` - Accounts
- `/masters/debitors-master` - Parties
- `/masters/brand-master` - Brands
- `/masters/discount-master` - Discounts
- `/masters/agent-master` - Agents
- `/masters/transport-master` - Transporters
- `/masters/hsn-master` - HSN codes
- `/masters/area-master` - Areas
- `/masters/bank-master` - Banks
- `/masters/transaction-master` - Transactions
- `/masters/return-master` - Returns

**Features:**
- CRUD operations for all master entities
- Search and filter
- Pagination
- Data validation
- Relationship management

---

### 5. Transaction Module

**Pages:**
- `ChallanList.jsx` - Challan list
- `ChallanForm.jsx` - Create/Edit challan
- `BillList.jsx` - Bill list
- `BillForm.jsx` - Create bill from challans
- `BillAutomation.jsx` - Auto bill generation rules
- `TransactionHistory.jsx` - Transaction history
- `OutStandings.jsx` - Outstanding amounts
- `OutstandingList.jsx` - Outstanding list

**Routes:**
- `/transactions/challan-list` - Challan list
- `/transactions/challans/create` - Create challan
- `/transactions/challans/edit/:id` - Edit challan
- `/transactions/bill-list` - Bill list
- `/transactions/bills/create` - Create bill
- `/transactions/bill-automation` - Automation rules
- `/transactions/transaction-history` - History
- `/transactions/outstandings` - Outstandings
- `/transactions/outstanding-list` - Outstanding list

**Features:**
- Sale and purchase challans
- Multi-item challan creation
- GST/Non-GST support
- Convert challans to bills
- Payment tracking
- Outstanding management
- Automated bill generation

---

### 6. Reports Module

**Pages:**
- `Reports.jsx` - Reports dashboard
- `GSTReport.jsx` - GST report
- `GSTReportDetails.jsx` - GST report details
- `PurchaseReport.jsx` - Purchase report
- `SalesReport.jsx` - Sales report
- `SalesReturnReport.jsx` - Sales return report
- `PurchaseReturnReport.jsx` - Purchase return report
- `ItemLedgerReport.jsx` - Item-wise ledger
- `PurchaseDateWiseReport.jsx` - Date-wise purchase
- `CollectionReport.jsx` - Collection report
- `ProfitLossReport.jsx` - Profit & loss report

**Routes:**
- `/reports` - Reports dashboard
- `/reports/gst-report` - GST report
- `/reports/purchase-report` - Purchase report
- `/reports/sales-report` - Sales report
- `/reports/item-ledger-report` - Item ledger
- `/reports/collection-report` - Collection report
- `/reports/profit-loss-report` - P&L report

**Features:**
- Date range filtering
- Export to PDF
- Print functionality
- Summary and detailed views
- GST calculations
- Party-wise reports
- Item-wise reports

---

### 7. Setup Module

**Pages:**
- `BackupRestore.jsx` - Backup and restore
- `FinancialYearClose.jsx` - Financial year closing
- `ChequePrintSetup.jsx` - Cheque print configuration

**Routes:**
- `/setup/backup-restore` - Backup/restore
- `/setup/financial-year-close` - Year close
- `/setup/cheque-print-setup` - Cheque setup

**Features:**
- Database backup
- Data export
- Financial year management
- Cheque printing configuration

---

## Component Hierarchy

### Layout Components

#### 1. Layout (`components/layout/Layout.jsx`)

**Purpose:** Main application layout wrapper

**Features:**
- Responsive sidebar toggle
- Mobile overlay
- Firm-based color theming (GST: dark blue, Non-GST: emerald)
- Header and sidebar integration

**Structure:**
```
Layout
├── Sidebar (fixed, toggleable)
├── Header (sticky top)
└── Main Content (Outlet)
```

#### 2. Header (`components/layout/Header.jsx`)

**Features:**
- Menu toggle button
- Firm selector dropdown
- User profile dropdown
- Notifications
- Logout button

#### 3. Sidebar (`components/layout/Sidebar.jsx`)

**Features:**
- Navigation menu
- Collapsible sections
- Active route highlighting
- Firm-based color scheme
- Mobile responsive

**Menu Structure:**
- Dashboard
- Masters (collapsible)
  - Firm, User, Account, Party, Brand, etc.
- Inventory (collapsible)
  - Items, Stock Alerts, Categories, Labels
- Transactions (collapsible)
  - Challans, Bills, Automation, Outstandings
- Reports (collapsible)
  - GST, Sales, Purchase, Item Ledger, etc.
- Setup (collapsible)
  - Backup, Financial Year, Cheque Setup

---

### Common Components

#### 1. DataTable (`components/common/DataTable.jsx`)

**Purpose:** Reusable data table with sorting, search, and pagination

**Props:**
- `columns` - Column definitions
- `data` - Table data
- `searchable` - Enable search (default: true)
- `sortable` - Enable sorting (default: true)
- `pagination` - Enable pagination (default: true)
- `pageSize` - Items per page (default: 10)
- `onRowClick` - Row click handler
- `actions` - Action buttons per row
- `density` - "normal" or "compact"

**Features:**
- Client-side search
- Client-side sorting
- Client-side pagination
- Custom cell rendering
- Row actions
- Responsive design

#### 2. StatsCard (`components/common/StatsCard.jsx`)

**Purpose:** Dashboard statistics card

**Props:**
- `title` - Card title
- `value` - Stat value
- `subtitle` - Subtitle text
- `icon` - Icon component
- `color` - Color theme
- `onClick` - Click handler

#### 3. Modal (`components/common/Modal.jsx`)

**Purpose:** Reusable modal dialog

**Features:**
- Backdrop overlay
- Close on backdrop click
- Custom header and footer
- Responsive sizing

#### 4. ConfirmationDialog (`components/common/ConfirmationDialog.jsx`)

**Purpose:** Confirmation dialog for destructive actions

**Features:**
- Customizable message
- Confirm/Cancel buttons
- Async action support

#### 5. DeleteConfirmDialog (`components/common/DeleteConfirmDialog.jsx`)

**Purpose:** Specialized delete confirmation

#### 6. Toggle (`components/common/Toggle.jsx`)

**Purpose:** Toggle switch component

---

### UI Components

#### FormComponents (`components/ui/FormComponents.jsx`)

**Components:**
- `Input` - Text input with label
- `Select` - Dropdown select
- `Textarea` - Multi-line text input
- `Checkbox` - Checkbox input
- `Radio` - Radio button
- `DatePicker` - Date input
- `FileUpload` - File upload input

**Features:**
- Consistent styling
- Error state handling
- Label and helper text
- Validation support

---

### Global Components

#### GlobalComponents (`components/GlobalComponents.jsx`)

**Components:**
- `Toast` - Notification toast
- `ConfirmDialog` - Global confirmation dialog
- `LoadingOverlay` - Full-screen loading indicator

**Integration:**
- Connected to Zustand store
- Rendered in `App.jsx`
- Accessible from any component via store actions

---

### Specialized Components

#### 1. ProtectedRoute (`components/ProtectedRoute.jsx`)

**Purpose:** Route guard for authenticated routes

**Features:**
- Check authentication status
- Redirect to login if not authenticated
- Support for nested routes

#### 2. CompanySelector (`components/CompanySelector.jsx`)

**Purpose:** Firm selection dropdown

**Features:**
- Switch between GST/Non-GST firms
- Display firm details
- Update global state

#### 3. FirmSetup (`components/FirmSetup.jsx`)

**Purpose:** Firm creation/edit form

**Features:**
- Multi-step form
- Validation
- Bank account management
- Image upload

#### 4. PDFPreview (`components/PDFPreview.jsx`)

**Purpose:** PDF preview and print

**Features:**
- Render PDF in iframe
- Print functionality
- Download option

#### 5. BillScan (`components/BillScan.jsx`)

**Purpose:** Bill scanning and OCR (if implemented)

---

## API Integration

### Axios Instance (`services/axiosInstance.js`)

**Configuration:**
- Base URL: `${VITE_API_URL}/api/v1`
- Timeout: 20 seconds
- Content-Type: application/json

**Request Interceptor:**
1. Get token from localStorage
2. Check if route requires authentication
3. Attach `Authorization: Bearer <token>` header
4. Reject if token missing for protected routes

**Response Interceptor:**
1. Return response on success
2. On 401 error:
   - Remove token from localStorage
   - Redirect to `/login`
   - Prevent multiple redirects

**Auth Optional Paths:**
- `/auth/login`
- `/auth/admin/register`
- `/health`

---

### API Utilities (`services/apiUtils.js`)

**Helper Functions:**

#### Data Extraction
- `getResponseData(response)` - Extract data from response
- `getResponseList(response)` - Extract array from response
- `getResponseMeta(response)` - Extract pagination metadata

#### Normalization
- `normalizeItem(item)` - Normalize item object
- `normalizeBrand(brand)` - Normalize brand object
- `normalizeContact(contact)` - Normalize contact object
- `normalizeChallan(challan)` - Normalize challan object
- `normalizeBill(bill)` - Normalize bill object

#### Utilities
- `getEntityId(value)` - Extract ID from object or string
- `toNumber(value, fallback)` - Safe number conversion

**Purpose:**
- Consistent data structure across components
- Handle API response variations
- Type-safe data access
- Reduce null/undefined errors

---

## Custom Hooks

### 1. useItems (`hooks/useItems.js`)

**Hooks:**
- `useAllItems(options)` - Fetch all items (paginated)
- `useItems(params, options)` - Fetch items with filters
- `useLowStockItems(params, options)` - Fetch low stock items
- `useBatchUpdateItems()` - Batch update mutation
- `useUpdateItem()` - Update single item mutation
- `useInvalidateItems()` - Invalidate items cache

**Features:**
- React Query integration
- Automatic pagination
- Cache invalidation
- Optimistic updates

### 2. useMasters (`hooks/useMasters.js`)

**Hooks:**
- `useAllBrands(options)` - Fetch all brands
- `useBrands(params, options)` - Fetch brands with filters
- `useHsns(params, options)` - Fetch HSN codes
- `useDepartments(options)` - Fetch departments
- `useAgents(params, options)` - Fetch agents
- `useTransports(params, options)` - Fetch transporters
- `useAreas(params, options)` - Fetch areas
- `useBanks(params, options)` - Fetch banks
- `useContacts(params, options)` - Fetch contacts
- `useLabels(params, options)` - Fetch labels

**Features:**
- Consistent API across all masters
- Pagination support
- Long stale time (10 minutes)
- Automatic refetch on mutation

### 3. useDashboard (`hooks/useDashboard.js`)

**Hooks:**
- `useDashboard(options)` - Fetch dashboard data
- `useFirmDashboard(options)` - Fetch firm-specific dashboard
- `useAuthMe(options)` - Fetch current user profile

**Features:**
- Short stale time (2 minutes)
- Auto-refresh on window focus
- Error handling

---

## Data Flow Patterns

### 1. Authentication Flow

```
User enters credentials
    ↓
POST /api/v1/auth/login
    ↓
Receive token + user data
    ↓
Store token in localStorage
    ↓
Set user in Zustand store
    ↓
Extract firms from user profile
    ↓
Set default firm
    ↓
Redirect to /dashboard
```

### 2. Data Fetching Flow

```
Component mounts
    ↓
Custom hook (useItems, useBrands, etc.)
    ↓
React Query checks cache
    ↓
If stale or missing:
    ↓
Axios request with auth token
    ↓
API response
    ↓
Normalize data (apiUtils)
    ↓
Update React Query cache
    ↓
Component re-renders with data
```

### 3. Mutation Flow

```
User submits form
    ↓
Mutation hook (useMutation)
    ↓
Axios POST/PUT/DELETE request
    ↓
API response
    ↓
On success:
    ├─ Invalidate related queries
    ├─ Show success toast
    └─ Navigate or update UI
    ↓
On error:
    ├─ Show error toast
    └─ Keep form data
```

### 4. Firm Selection Flow

```
User clicks firm dropdown
    ↓
Select different firm
    ↓
Update selectedFirm in Zustand
    ↓
Components using selectedFirm re-render
    ↓
API requests include firm context
    ↓
Backend filters data by firm type
```

---

## Routing Strategy

### Route Protection

**Public Routes:**
- `/login`
- `/` (redirects to login)

**Protected Routes:**
- All other routes require authentication
- Wrapped in `<ProtectedRoute>` component
- Auto-redirect to `/login` if not authenticated

### Route Structure

```
/
├── /login (public)
├── /dashboard (protected)
├── /masters/* (protected)
│   ├── /firm-master
│   ├── /user-master
│   ├── /account-master
│   └── ...
├── /inventory/* (protected)
│   ├── /item-master
│   ├── /stock-alert-master
│   └── ...
├── /transactions/* (protected)
│   ├── /challan-list
│   ├── /bill-list
│   └── ...
├── /reports/* (protected)
│   ├── /gst-report
│   ├── /sales-report
│   └── ...
└── /setup/* (protected)
    ├── /backup-restore
    └── ...
```

### Legacy Route Redirects

- `/firm-setup` → `/masters/firm-master`
- `/item-master` → `/inventory/item-master`
- `/challan-list` → `/transactions/challan-list`
- `/add-item` → `/masters/item-master/add`

---

## Styling Strategy

### Tailwind CSS

**Configuration:** `tailwind.config.js`

**Custom Theme:**
- Primary: Blue shades
- Secondary: Emerald shades
- Accent: Purple shades
- Neutral: Gray shades

**Utility Classes:**
- Responsive breakpoints: `sm:`, `md:`, `lg:`, `xl:`
- Spacing: `p-4`, `m-2`, `gap-4`
- Colors: `bg-blue-600`, `text-gray-900`
- Typography: `text-sm`, `font-medium`
- Layout: `flex`, `grid`, `space-y-4`

### Component Styling Patterns

**Card Pattern:**
```jsx
<div className="bg-white rounded-lg border p-4">
  {/* Content */}
</div>
```

**Button Pattern:**
```jsx
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
  Click Me
</button>
```

**Form Pattern:**
```jsx
<input className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
```

---

## Performance Optimizations

### 1. Code Splitting

- Route-based code splitting via React Router
- Lazy loading of pages
- Dynamic imports for heavy components

### 2. React Query Caching

- Stale time: 5-10 minutes for master data
- Garbage collection: 10 minutes
- Automatic cache invalidation on mutations
- Background refetching

### 3. Memoization

- `useMemo` for expensive calculations
- `useCallback` for event handlers
- React.memo for pure components

### 4. Pagination

- Client-side pagination for small datasets
- Server-side pagination for large datasets
- Infinite scroll (not implemented)

### 5. Image Optimization

- Lazy loading images
- Responsive images
- Image compression on upload

---

## Error Handling

### 1. API Errors

**Axios Interceptor:**
- 401: Auto-logout and redirect
- 400: Show validation errors
- 500: Show generic error message

**React Query:**
- `onError` callback in mutations
- Error state in queries
- Retry logic (1 retry)

### 2. Form Validation

- Client-side validation before submit
- Server-side validation errors displayed
- Field-level error messages

### 3. Global Error Boundary

- Catch React errors
- Display fallback UI
- Log errors to console

---

## Testing Strategy

### Current State

**Test Files:**
- `tests/UserMaster.integration.test.jsx`
- `pages/masters/__tests__/UserMaster.test.jsx`

**Setup:**
- `setupTests.js` - Test configuration
- Jest + React Testing Library

### Recommended

- Unit tests for utilities
- Component tests for common components
- Integration tests for pages
- E2E tests for critical flows

---

## Build and Deployment

### Development

```bash
npm run dev
```

**Features:**
- Hot module replacement
- Fast refresh
- Source maps

### Production Build

```bash
npm run build
```

**Output:**
- Minified JavaScript
- CSS extraction
- Asset optimization
- Tree shaking

### Environment Variables

**File:** `.env`

**Variables:**
- `VITE_API_URL` - Backend API URL

---

## Future Enhancements

### 1. Features

- Real-time updates (WebSocket)
- Offline support (PWA)
- Advanced search and filters
- Bulk operations
- Export to Excel
- Print templates

### 2. Performance

- Virtual scrolling for large lists
- Image lazy loading
- Service worker caching
- CDN integration

### 3. Developer Experience

- TypeScript migration
- Storybook for components
- E2E testing with Playwright
- CI/CD pipeline

---

## Summary

The frontend follows a **modern React architecture** with:
- ✅ Component-based UI structure
- ✅ Centralized state management (Zustand)
- ✅ Server state management (React Query)
- ✅ Custom hooks for data fetching
- ✅ Utility-first CSS (Tailwind)
- ✅ Type-safe API utilities
- ✅ Route-based code splitting
- ✅ Responsive design
- ✅ Error handling and validation
- ✅ Performance optimizations

This architecture provides a scalable, maintainable foundation for a complex inventory and billing management system.
