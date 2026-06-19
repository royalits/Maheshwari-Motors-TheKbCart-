# Maheshwari Motors — Flutter App Comprehensive Analysis

> **Generated from**: Full read of all 174 Dart files in `app/lib/`
> **Purpose**: Research-only deep-dive — no code was written or modified

---

## Table of Contents

1. [Complete Directory Tree](#1-complete-directory-tree)
2. [Per-File Analysis](#2-per-file-analysis)
   - [Entry Point](#21-entry-point)
   - [Core Layer](#22-core-layer)
   - [Routes](#23-routes)
   - [Data Layer — Services](#24-data-layer--services)
   - [Data Layer — Models](#25-data-layer--models)
   - [Controllers](#26-controllers)
   - [Screens](#27-screens)
   - [Screen Widgets](#28-screen-widgets)
   - [Shared Widgets](#29-shared-widgets)
3. [Architecture Analysis](#3-architecture-analysis)
4. [Screen Inventory — Flutter vs React Frontend](#4-screen-inventory--flutter-vs-react-frontend)
5. [Gaps Analysis](#5-gaps-analysis)

---

## 1. Complete Directory Tree

```
app/lib/
├── main.dart
└── app/
    ├── core/
    │   ├── bindings/
    │   │   └── initial_binding.dart
    │   ├── constants/
    │   │   ├── app_constants.dart
    │   │   └── app_spacing.dart
    │   ├── network/
    │   │   └── api_client.dart
    │   ├── theme/
    │   │   ├── app_colors.dart
    │   │   └── app_theme.dart
    │   └── utils/
    │       ├── formatters.dart
    │       └── validators.dart
    ├── data/
    │   ├── models/
    │   │   ├── agent_model.dart
    │   │   ├── area_model.dart
    │   │   ├── bank_model.dart
    │   │   ├── bill_model.dart
    │   │   ├── brand_model.dart
    │   │   ├── category_model.dart
    │   │   ├── challan_item_model.dart
    │   │   ├── challan_model.dart
    │   │   ├── department_model.dart
    │   │   ├── discount_model.dart
    │   │   ├── firm_data_model.dart
    │   │   ├── hsn_model.dart
    │   │   ├── item_model.dart
    │   │   ├── label_model.dart
    │   │   ├── party_model.dart
    │   │   ├── purchase_item_model.dart
    │   │   ├── purchase_model.dart
    │   │   ├── return_item_model.dart
    │   │   ├── return_model.dart
    │   │   ├── stock_alert_model.dart
    │   │   ├── supplier_model.dart
    │   │   ├── transaction_model.dart
    │   │   └── user_model.dart
    │   └── services/
    │       └── api_service.dart
    ├── presentation/
    │   ├── controllers/
    │   │   ├── account_master/
    │   │   │   └── account_master_controller.dart
    │   │   ├── agent_master/
    │   │   │   └── agent_master_controller.dart
    │   │   ├── area_master/
    │   │   │   └── area_master_controller.dart
    │   │   ├── auth/
    │   │   │   ├── auth_controller.dart
    │   │   │   ├── change_password_controller.dart
    │   │   │   └── login_controller.dart
    │   │   ├── bank_master/
    │   │   │   └── bank_master_controller.dart
    │   │   ├── bill/
    │   │   │   ├── bill_list_controller.dart
    │   │   │   └── generate_bill_controller.dart
    │   │   ├── brand_master/
    │   │   │   └── add_brand_controller.dart
    │   │   │   └── brand_master_controller.dart
    │   │   ├── category_master/
    │   │   │   ├── add_category_controller.dart
    │   │   │   ├── category_master_controller.dart
    │   │   │   └── view_category_controller.dart
    │   │   ├── challan/
    │   │   │   ├── challan_line_item.dart
    │   │   │   ├── challan_list_controller.dart
    │   │   │   └── create_challan_controller.dart
    │   │   ├── dashboard/
    │   │   │   └── dashboard_controller.dart
    │   │   ├── department_master/
    │   │   │   └── department_master_controller.dart
    │   │   ├── discount_master/
    │   │   │   └── discount_master_controller.dart
    │   │   ├── home/
    │   │   │   └── home_controller.dart
    │   │   ├── hsn_master/
    │   │   │   └── hsn_master_controller.dart
    │   │   ├── item_master/
    │   │   │   ├── add_item_controller.dart
    │   │   │   ├── item_master_controller.dart
    │   │   │   └── item_view_controller.dart
    │   │   ├── party/
    │   │   │   ├── add_party_controller.dart
    │   │   │   └── party_master_controller.dart
    │   │   ├── purchase/
    │   │   │   ├── add_purchase_controller.dart
    │   │   │   ├── purchase_line_item.dart
    │   │   │   └── purchase_master_controller.dart
    │   │   ├── report/
    │   │   │   └── report_controller.dart
    │   │   ├── return_master/
    │   │   │   └── return_master_controller.dart
    │   │   ├── sessions/
    │   │   │   └── active_sessions_controller.dart
    │   │   ├── stock_alert/
    │   │   │   └── stock_alert_controller.dart
    │   │   ├── supplier_master/
    │   │   │   ├── add_supplier_controller.dart
    │   │   │   ├── supplier_master_controller.dart
    │   │   │   └── view_supplier_controller.dart
    │   │   ├── transaction/
    │   │   │   └── transaction_history_controller.dart
    │   │   ├── transport_master/
    │   │   │   └── transport_master_controller.dart
    │   │   └── user_master/
    │   │       ├── add_user_controller.dart
    │   │       └── user_master_controller.dart
    │   ├── screens/
    │   │   ├── account_master/
    │   │   │   ├── account_master_screen.dart
    │   │   │   └── widgets/
    │   │   │       ├── account_transaction_card.dart
    │   │   │       └── transactions_tab.dart
    │   │   ├── admin_home/
    │   │   │   ├── admin_home_screen.dart
    │   │   │   └── widgets/
    │   │   │       └── admin_user_card.dart
    │   │   ├── agent_master/
    │   │   │   └── agent_master_screen.dart
    │   │   ├── area_master/
    │   │   │   └── area_master_screen.dart
    │   │   ├── auth/
    │   │   │   ├── change_password_screen.dart
    │   │   │   ├── login_screen.dart
    │   │   │   └── splash_screen.dart
    │   │   ├── bank_master/
    │   │   │   └── bank_master_screen.dart
    │   │   ├── bill/
    │   │   │   ├── bill_list_screen.dart
    │   │   │   ├── generate_bill_screen.dart
    │   │   │   └── widgets/
    │   │   │       ├── bill_card.dart
    │   │   │       ├── bill_summary_row.dart
    │   │   │       └── challan_tile.dart
    │   │   ├── brand_master/
    │   │   │   ├── add_brand_screen.dart
    │   │   │   ├── brand_master_screen.dart
    │   │   │   └── view_brand_screen.dart
    │   │   ├── category_master/
    │   │   │   ├── add_category_screen.dart
    │   │   │   ├── category_master_screen.dart
    │   │   │   └── view_category_screen.dart
    │   │   ├── challan/
    │   │   │   ├── challan_list_screen.dart
    │   │   │   ├── create_challan_screen.dart
    │   │   │   └── widgets/
    │   │   │       ├── challan_card.dart
    │   │   │       ├── challan_line_item_card.dart
    │   │   │       ├── loading_dropdown.dart
    │   │   │       ├── mini_field.dart
    │   │   │       ├── section_title.dart
    │   │   │       ├── summary_card.dart
    │   │   │       └── summary_row.dart
    │   │   ├── core/
    │   │   │   ├── settings_screen.dart
    │   │   │   └── user_profile_screen.dart
    │   │   ├── dashboard/
    │   │   │   ├── dashboard_screen.dart
    │   │   │   └── widgets/
    │   │   │       └── monthly_revenue_chart.dart
    │   │   ├── department_master/
    │   │   │   └── department_master_screen.dart
    │   │   ├── discount_master/
    │   │   │   └── discount_master_screen.dart
    │   │   ├── help/
    │   │   │   ├── help_support_screen.dart
    │   │   │   └── widgets/
    │   │   │       ├── contact_card.dart
    │   │   │       └── faq_item.dart
    │   │   ├── home/
    │   │   │   └── home_screen.dart
    │   │   ├── item_master/
    │   │   │   ├── add_item_screen.dart
    │   │   │   ├── item_master_screen.dart
    │   │   │   ├── item_view_screen.dart
    │   │   │   └── widgets/
    │   │   │       ├── item_card.dart
    │   │   │       └── mini_stat.dart
    │   │   ├── party/
    │   │   │   ├── add_party_screen.dart
    │   │   │   ├── party_master_screen.dart
    │   │   │   └── widgets/
    │   │   │       └── party_card.dart
    │   │   ├── purchase/
    │   │   │   ├── add_purchase_screen.dart
    │   │   │   ├── purchase_master_screen.dart
    │   │   │   └── widgets/
    │   │   │       ├── purchase_card.dart
    │   │   │       ├── purchase_line_item_card.dart
    │   │   │       ├── purchase_mini_field.dart
    │   │   │       └── purchase_section_title.dart
    │   │   ├── report/
    │   │   │   └── report_screen.dart
    │   │   ├── return_master/
    │   │   │   └── return_master_screen.dart
    │   │   ├── sessions/
    │   │   │   ├── active_sessions_screen.dart
    │   │   │   └── widgets/
    │   │   │       └── session_card.dart
    │   │   ├── stock_alert/
    │   │   │   ├── stock_alert_screen.dart
    │   │   │   └── widgets/
    │   │   │       ├── alert_card.dart
    │   │   │       ├── alert_summary_card.dart
    │   │   │       └── stock_info.dart
    │   │   ├── supplier_master/
    │   │   │   ├── add_supplier_screen.dart
    │   │   │   ├── supplier_master_screen.dart
    │   │   │   ├── view_supplier_screen.dart
    │   │   │   └── widgets/
    │   │   │       ├── supplier_detail_row.dart
    │   │   │       └── supplier_info_row.dart
    │   │   ├── transaction/
    │   │   │   ├── transaction_history_screen.dart
    │   │   │   └── widgets/
    │   │   │       └── transaction_card.dart
    │   │   └── user_master/
    │   │       ├── add_user_screen.dart
    │   │       ├── user_master_screen.dart
    │   │       └── widgets/
    │   │           └── user_card.dart
    │   └── shared/
    │       └── widgets/
    │           ├── common_widgets.dart          (barrel)
    │           ├── buttons/
    │           │   ├── action_icon.dart
    │           │   ├── app_bar_add_button.dart
    │           │   ├── app_button.dart
    │           │   └── app_popup_menu.dart
    │           ├── cards/
    │           │   ├── app_card.dart
    │           │   ├── info_chip.dart
    │           │   ├── initials_avatar.dart
    │           │   ├── stat_card.dart
    │           │   └── status_badge.dart
    │           ├── drawer/
    │           │   ├── app_drawer.dart
    │           │   ├── app_drawer_button.dart
    │           │   ├── drawer_item.dart
    │           │   ├── drawer_section_divider.dart
    │           │   └── drawer_section_header.dart
    │           ├── feedback/
    │           │   ├── app_snackbar.dart
    │           │   ├── empty_state.dart
    │           │   └── error_state.dart
    │           └── sheets/
    │               ├── delete_confirm_sheet.dart
    │               └── record_payment_sheet.dart
    └── routes/
        ├── app_pages.dart
        └── app_routes.dart
```

---

## 2. Per-File Analysis

### 2.1 Entry Point

#### `main.dart`

| Aspect            | Detail                                            |
| ----------------- | ------------------------------------------------- |
| **Widget**        | `GetMaterialApp` (root)                           |
| **Theme**         | `AppTheme.light` (Material 3)                     |
| **Binding**       | `InitialBinding`                                  |
| **Initial Route** | `AppRoutes.splash`                                |
| **Transition**    | `Transition.cupertino` (200 ms)                   |
| **Navigation**    | GetX named routing via `getPages: AppPages.pages` |

---

### 2.2 Core Layer

#### `core/network/api_client.dart` (~155 lines)

| Aspect           | Detail                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- |
| **Class**        | `ApiClient` — Dio wrapper singleton                                                     |
| **Interceptors** | Auth token injection from `FlutterSecureStorage`; 401 → clear token → redirect to login |
| **Methods**      | `get`, `post`, `put`, `patch`, `delete`, `multipartPost`, `multipartPut`                |
| **Static**       | `parseError(e)` — extracts human-readable message from Dio errors                       |
| **Token key**    | `AppConstants.tokenKey` (`'auth_token'`)                                                |

#### `core/bindings/initial_binding.dart`

| Aspect        | Detail                                                                          |
| ------------- | ------------------------------------------------------------------------------- |
| **Registers** | `ApiClient` (permanent), `ApiService` (permanent), `AuthController` (permanent) |
| **Pattern**   | GetX `Bindings` — called once at app start                                      |

#### `core/constants/app_constants.dart`

| Constant     | Value                                                                                |
| ------------ | ------------------------------------------------------------------------------------ |
| `baseUrl`    | `String.fromEnvironment('BASE_URL', defaultValue: 'http://65.2.143.94:5000/api/v1')` |
| `tokenKey`   | `'auth_token'`                                                                       |
| `pageSize`   | `20`                                                                                 |
| `apiTimeout` | `Duration(seconds: 30)`                                                              |

#### `core/constants/app_spacing.dart`

Design-system spacing tokens: `xs=4`, `sm=8`, `md=12`, `lg=16`, `xl=20`, `xxl=24`, `xxxl=32`. Provides `Gap` widgets, `Padding` presets, `BorderRadius` presets.

#### `core/theme/app_theme.dart` (~165 lines)

| Aspect          | Detail                                       |
| --------------- | -------------------------------------------- |
| **Seed color**  | `#4318FF` (accent)                           |
| **Background**  | `#FAFBFD`                                    |
| **Material 3**  | Yes                                          |
| **Font**        | Google Fonts Inter                           |
| **Input style** | Rounded (14px radius), filled with `#F4F7FE` |
| **AppBar**      | Flat, centered title, no elevation           |

#### `core/theme/app_colors.dart`

Semantic color constants: `accent`, `accentDark`, `accentLight`, `success/error/warning/info` + light variants, `textPrimary/Secondary`, `background`, `surface`, `border`, `inputBg`, `white`.

#### `core/utils/validators.dart`

| Validator          | Rule                      |
| ------------------ | ------------------------- |
| `required`         | non-empty                 |
| `email`            | `@` + `.` check           |
| `phone`            | exactly 10 digits         |
| `gstin`            | exactly 15 alphanumeric   |
| `password`         | min 6 chars               |
| `requiredEmail`    | required + email          |
| `optionalPassword` | null/empty OK, else min 6 |

#### `core/utils/formatters.dart`

| Formatter              | Output                                    |
| ---------------------- | ----------------------------------------- |
| `currency(num)`        | `₹1,23,456` (Indian grouping, 0 decimals) |
| `currencyDecimal(num)` | `₹1,23,456.00` (2 decimals)               |
| `dateShort(String)`    | `dd MMM yyyy`                             |
| `dateLong(String)`     | `dd MMMM yyyy`                            |
| `dateTime(String)`     | `dd MMM yyyy, hh:mm a`                    |
| `quantity(num)`        | `#,##0.##`                                |

---

### 2.3 Routes

#### `routes/app_routes.dart` (~75 named constants)

All route strings as static constants: `/splash`, `/login`, `/home`, `/admin-home`, `/dashboard`, `/item-master`, `/add-item`, `/edit-item`, `/item-view`, `/challan-list`, `/create-challan`, `/edit-challan`, `/bill-list`, `/generate-bill`, `/party-master`, `/add-party`, `/edit-party`, `/transaction-history`, `/transaction-master`, `/stock-alert-master`, `/user-master`, `/add-user`, `/edit-user`, `/change-password`, `/active-sessions`, `/user-profile`, `/report`, `/purchase-report`, `/sales-report`, `/gst-report`, `/sales-return-report`, `/purchase-return-report`, `/category-master`, `/add-category`, `/edit-category`, `/view-category`, `/brand-master`, `/add-brand`, `/edit-brand`, `/view-brand`, `/discount-master`, `/account-master`, `/supplier-master`, `/add-supplier`, `/edit-supplier`, `/view-supplier`, `/purchase-master`, `/add-purchase`, `/agent-master`, `/transport-master`, `/hsn-master`, `/area-master`, `/bank-master`, `/department-master`, `/return-master`, `/settings`, `/help-support`.

#### `routes/app_pages.dart` (~200 lines)

- Maps every route to a `GetPage` with screen widget + binding (controller registration via `Get.lazyPut`).
- Edit routes reuse Add screens (e.g., `/edit-item` → `AddItemScreen` with `AddItemController`).
- Report sub-routes all map to the same `ReportScreen` with different `arguments`.

---

### 2.4 Data Layer — Services

#### `data/services/api_service.dart` (1,136 lines)

Central API facade. All endpoints go through `ApiClient`. Key groups:

| Group                 | Endpoints                                                                                                                                                   | Notes                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Auth**              | `login`, `logout`, `getProfile`, `uploadSignature`, `changePassword`, `getSessions`, `revokeSession`, `revokeAllOtherSessions`                              | JWT-based; multipart for signature             |
| **Items**             | `getItems`, `getItem`, `createItem`, `updateItem`, `deleteItem`, `getLowStockItems`, `getStockAlertCount`                                                   | Multipart upload for image                     |
| **Contacts/Parties**  | `getParties`, `getContacts`, `createParty`, `updateParty`, `deleteParty`, `getSuppliersAsParties`                                                           | type='party' vs type='supplier'                |
| **Challans**          | `getChallans`, `getChallan`, `createChallan`, `updateChallan`, `deleteChallan`, `getUnconvertedChallans`, `getLastSoldChallanItems`, `recordChallanPayment` | Filters: type, paymentStatus, contactId, dates |
| **Bills**             | `getBills`, `getBill`, `createBill`, `deleteBill`, `recordPayment`, `recordBillReturn`                                                                      |                                                |
| **Returns**           | `getReturns`, `createReturn`, `getReturnsForBill`, `getReturnsForChallan`, `getReturnSummary`                                                               | sale_return / purchase_return                  |
| **Transactions**      | `getTransactions`, `createTransaction`, `getTransactionSummary`, `createSaleTransaction`, `createPurchaseTransaction`                                       |                                                |
| **Purchases**         | Stored as challans with `challan_type='purchase'`                                                                                                           | Uses challan endpoints                         |
| **Masters**           | Agents, Transports, Areas, HSN, Departments, Banks, Labels — full CRUD each                                                                                 |                                                |
| **Categories/Brands** | CRUD + `upsertDiscount`                                                                                                                                     | Discount = 4 fields per brand×category         |
| **Suppliers**         | CRUD via `/contacts?type=supplier`                                                                                                                          |                                                |
| **Users (admin)**     | CRUD + `deactivateUser`, `reactivateUser`                                                                                                                   |                                                |
| **Dashboard**         | `getFirmDashboard(period)`, `getAdminDashboard`                                                                                                             | period: today/monthly/yearly                   |
| **Reports**           | `getPurchaseReport`, `getSalesReport`, `getSalesReturnReport`, `getPurchaseReturnReport`, `getGstOverview`                                                  | GST overview composes multiple                 |
| **Helpers**           | `_fetchAllPages(path)` for auto-pagination; `_normalizeItemPayload` for multipart                                                                           |                                                |

---

### 2.5 Data Layer — Models

| Model                 | Key Fields                                                                                                                                                                         | Notable Computed                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **UserModel**         | id, name, email, phone, type, isAdmin, role, token, signature, firmData, isActive                                                                                                  | `isMain`, `isFirmLogin`, `isAdminLogin`, `firmType`               |
| **FirmDataModel**     | firmType, name, username, address, city, state, gstin, phone, bankName, accountNo, ifsc                                                                                            | `isGST` (firmType=='gst')                                         |
| **ItemModel**         | id, numericId, itemName, barcode, partNo, saleRate, purchaseRate, mrp, gstPercent, discountPercent, isGst, totalStock, threshold, image, categoryId/Name, brandId/Name, supplierId | `isLowStock`, `stockStatus` ('LOW'/'OK')                          |
| **PartyModel**        | id, name, type, phone, email, address, city, state, gstin, labelId, categoryId, transportId, agentId, balance                                                                      |                                                                   |
| **ChallanModel**      | id, challanNo, type (sale/purchase), date, contactId, partyName, isGst, items[], discount, gstAmount, amount, convertedToBill, paymentStatus, linkedChallanId, paidAmount          | `balanceAmount`                                                   |
| **ChallanItemModel**  | itemId, itemName, quantity, rate, disPercent, spDis, itemDiscount, gstPercent, grossAmount, discountAmount, taxableAmount, gstAmount, amount                                       |                                                                   |
| **BillModel**         | id, billNo, date, partyName, amount, paidAmount, returnAmount, paymentStatus, challanIds[]                                                                                         | `balanceAmount`                                                   |
| **TransactionModel**  | id, type, ledgerType (sale/purchase), contactName, partyName, supplierName, billId, purchaseId, amount, paymentMode, utr, createdAt                                                |                                                                   |
| **ReturnModel**       | id, returnNo, type (sale_return/purchase_return), contactId, billId, challanId, items[], totalAmount, note, date                                                                   |                                                                   |
| **ReturnItemModel**   | itemId, itemName, quantity, rate, gstPercent, discountPercent, amount, isDamaged, isGst                                                                                            |                                                                   |
| **PurchaseModel**     | Mapped from challan data: purchaseNo, date, supplierName, purchaseType, amount, paidAmount, paymentStatus, items[]                                                                 | `balanceAmount`                                                   |
| **PurchaseItemModel** | itemId, itemName, quantity, rate, amount                                                                                                                                           |                                                                   |
| **StockAlertModel**   | id, itemName, totalStock, threshold                                                                                                                                                | `deficit`                                                         |
| **CategoryModel**     | id, name, brandIds[]                                                                                                                                                               |                                                                   |
| **BrandModel**        | id, name, itemCount                                                                                                                                                                |                                                                   |
| **DiscountModel**     | brandId, brandName, fields[] (DiscountField: fieldName, value)                                                                                                                     | DiscountField names: d1_normal, d1_special, d2_normal, d2_special |
| **SupplierModel**     | id, name, phone, email, address, city, state, gstin                                                                                                                                |                                                                   |
| **AgentModel**        | id, name, partyId, address, city, pincode, phone, whatsapp                                                                                                                         |                                                                   |
| **TransportModel**    | id, name, address, city, pincode, phone, whatsapp, gstin                                                                                                                           |                                                                   |
| **AreaModel**         | id, city, state, pincode, phone, whatsapp, agentId, transportId, agentName, transportName                                                                                          |                                                                   |
| **HsnModel**          | id, hsnCode, gstRate, description, isActive                                                                                                                                        |                                                                   |
| **DepartmentModel**   | id, name                                                                                                                                                                           |                                                                   |
| **BankModel**         | id, bankName, branch, ifsc, accountNumber, accountHolderName, upi, isDefault                                                                                                       |                                                                   |
| **LabelModel**        | id, name, categoryId                                                                                                                                                               |                                                                   |

---

### 2.6 Controllers

#### Auth & Core

| Controller                   | File                                   | State                                                  | API Calls                             | Key Logic                                                                                                                                                    |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AuthController**           | `auth/auth_controller.dart`            | `user`, `isLoggedIn`, `isFirmLogin`, `firmData`        | `login`, `getProfile`, `logout`       | Permanent singleton. `checkAuth()` → `getProfile()` → navigate by role (admin→adminHome, firm→home). Token stored in SecureStorage.                          |
| **LoginController**          | `auth/login_controller.dart`           | `usernameCtrl`, `passwordCtrl`, `isLoading`, `obscure` | Delegates to `AuthController.login()` | Form validation, password visibility toggle                                                                                                                  |
| **ChangePasswordController** | `auth/change_password_controller.dart` | 3 password TextEditingControllers, 3 obscure toggles   | `changePassword`                      | Validates confirm matches new                                                                                                                                |
| **HomeController**           | `home/home_controller.dart`            | `scaffoldKey`                                          | None                                  | Just provides GlobalKey for drawer                                                                                                                           |
| **DashboardController**      | `dashboard/dashboard_controller.dart`  | `isLoading`, `errorMessage`, `period`, `dashboardData` | `getFirmDashboard`                    | Period filter (monthly/yearly). Exposes `totalChallans`, `totalBills`, `totalRevenue`, `pendingAmount`, `totalPurchases`, `purchaseAmount`, `monthlyRevenue` |

#### Item Management

| Controller               | State                                                                           | API Calls                                                                | Key Logic                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **ItemMasterController** | Items list + search + lowStockCount                                             | `getItems`, `deleteItem`, `getStockAlertCount`                           | Filtered list by search. Computes lowStockCount separately.                                                                         |
| **AddItemController**    | Full form state (~20 fields), dropdowns for category/brand/supplier, image file | `createItem`, `updateItem`, `getCategories`, `getBrands`, `getSuppliers` | isEdit mode from arguments. Image picker (gallery). Multipart upload. Category change reloads brands. GST toggle (SegmentedButton). |
| **ItemViewController**   | Items list + search                                                             | `getItems`                                                               | Read-only list with search                                                                                                          |

#### Challan & Bill

| Controller                               | State                                                                                                                                | API Calls                                                                                                                                    | Key Logic                                                                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ChallanListController**                | List + 5 filters (type, paymentStatus, contactId, fromDate, toDate) + search                                                         | `getChallans`, `deleteChallan`, `getParties`                                                                                                 | Complex filter composition. Only non-billed sale challans editable.                                                                                                                                                   |
| **CreateChallanController** (~320 lines) | Contact type/selection, label, lineItems (ChallanLineItem[]), banks, date, isGst, printFormat                                        | `createChallan`, `updateChallan`, `getParties`, `getItems`, `getCategories`, `getBrands`, `getBanks`, `getLabels`, `getDiscountsForCategory` | Discount resolution: loads brand discounts for selected label's category. Auto-applies d1/d2 normal/special based on GST type. Line items auto-calculate cascade: gross→discount→taxable→GST→amount.                  |
| **ChallanLineItem**                      | Per-line: item, pcs, rate, disPercent, spDis, itemDiscount, gstPercent, stock, remark, type                                          | N/A (data class)                                                                                                                             | `computeTotals()`: grossAmount = pcs×rate; discountAmount via cascading %; taxableAmount = gross-discount; gstAmount = taxable×gst%; amount = taxable+gst. `applyItemDefaults()`, `loadFromPayload()`, `toPayload()`. |
| **BillListController**                   | List + search + status filter (all/due/paid/partial)                                                                                 | `getBills`, `deleteBill`                                                                                                                     | Filtered by search + paymentStatus                                                                                                                                                                                    |
| **GenerateBillController** (~340 lines)  | Party/supplier, billNo, lineItems (ChallanLineItem[]), logistics (agent, transport, transportCharge, customerName, vehicleNo), banks | `createChallan` then `createBill`, loads parties/suppliers/items/brands/agents/transports                                                    | Creates bill by first POSTing a challan, then creating bill referencing it. "Apply last sold" loads previous challan item rates. Reuses ChallanLineItem.                                                              |

#### Transaction & Stock

| Controller                       | State                                 | API Calls                                  | Key Logic                                                             |
| -------------------------------- | ------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| **TransactionHistoryController** | List + summary + search + type filter | `getTransactions`, `getTransactionSummary` | Summary shows total count + amounts. Filtered by ledgerType + search. |
| **StockAlertController**         | alertItems list + search              | `getLowStockItems`                         | Filters by search on itemName                                         |

#### Purchase

| Controller                   | State                                                                | API Calls                                                                | Key Logic                                                               |
| ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **PurchaseMasterController** | List + search + type filter (all/GST/NON_GST)                        | `getChallans(type:'purchase')`, `deleteChallan`, `recordChallanPayment`  | Purchases = challans with challan_type=purchase. Maps to PurchaseModel. |
| **AddPurchaseController**    | supplier, purchaseType (GST/NON_GST), lineItems (PurchaseLineItem[]) | `createChallan` (with challan_type=purchase), `getSuppliers`, `getItems` | PurchaseLineItem is simpler: item+qty+rate. Total computed reactively.  |
| **PurchaseLineItem**         | item, quantityC, rateC                                               | N/A                                                                      | `amount` = qty × rate                                                   |

#### Master CRUD Controllers

| Controller                              | Model                    | Unique Features                                                                                                                                                                                                |
| --------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PartyMasterController**               | PartyModel               | List + search + delete                                                                                                                                                                                         |
| **AddPartyController**                  | PartyModel               | Form: name, phone, email, address, city, state, gstin                                                                                                                                                          |
| **CategoryMasterController**            | CategoryModel            | List + search + delete                                                                                                                                                                                         |
| **AddCategoryController**               | CategoryModel            | Form: name + brand multi-select (CheckboxListTile)                                                                                                                                                             |
| **ViewCategoryController**              | CategoryModel            | Read-only detail                                                                                                                                                                                               |
| **BrandMasterController**               | BrandModel               | List + search + delete                                                                                                                                                                                         |
| **AddBrandController**                  | BrandModel               | Form: name only                                                                                                                                                                                                |
| **SupplierMasterController**            | SupplierModel            | List + search + delete                                                                                                                                                                                         |
| **AddSupplierController**               | SupplierModel            | Form: name, phone, email, address, city, state, gstin                                                                                                                                                          |
| **ViewSupplierController**              | SupplierModel            | Read-only detail                                                                                                                                                                                               |
| **DiscountMasterController**            | DiscountModel            | Category sidebar → brand discount grid. 4 fields per brand (d1Normal/Special, d2Normal/Special). Batch save via upsertDiscount.                                                                                |
| **AccountMasterController**             | TransactionModel         | Transaction list + summary. Filters: search, type. Computes total_sale_amount, total_purchase_amount.                                                                                                          |
| **AgentMasterController**               | AgentModel               | CRUD. Also loads parties for party_id dropdown.                                                                                                                                                                |
| **TransportMasterController**           | TransportModel           | Simple CRUD                                                                                                                                                                                                    |
| **HsnMasterController**                 | HsnModel                 | CRUD: hsnCode, gstRate, description, isActive                                                                                                                                                                  |
| **AreaMasterController**                | AreaModel                | CRUD. Loads agents + transports for dropdowns                                                                                                                                                                  |
| **BankMasterController**                | BankModel                | CRUD with isDefault flag                                                                                                                                                                                       |
| **DepartmentMasterController**          | DepartmentModel          | Simple CRUD (name only)                                                                                                                                                                                        |
| **ReturnMasterController** (~250 lines) | ReturnModel              | Complex. Loads returns/contacts/bills/purchases/items. `loadReferenceItemsForBill/Challan` computes max returnable qty (original − already returned). `createReturn` with sale_return or purchase_return type. |
| **ReportController**                    | Dynamic                  | Report type from route arguments. Loads purchase/sales/gst/salesReturn/purchaseReturn reports in parallel. Exposes topSuppliers, topParties, topReturnCustomers, topReturnSuppliers.                           |
| **UserMasterController**                | UserModel                | List + search + delete + toggleActive (admin only)                                                                                                                                                             |
| **AddUserController**                   | UserModel                | Form: username, email, password (type='secondary')                                                                                                                                                             |
| **ActiveSessionsController**            | Map<String,dynamic> list | `getSessions`, `revokeSession`, `revokeAllOtherSessions`                                                                                                                                                       |

---

### 2.7 Screens

#### Auth & Navigation

| Screen                   | Type            | Key Widgets                                                                                                                       | Navigation                                          |
| ------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **SplashScreen**         | StatelessWidget | App icon, "Maheshwari Motors", "ERP System", loading spinner                                                                      | Auto → login or home (via AuthController.checkAuth) |
| **LoginScreen**          | StatelessWidget | AppTextField (username, password), visibility toggle, AppButton                                                                   | → home/adminHome on success                         |
| **HomeScreen**           | StatelessWidget | Delegates to DashboardScreen                                                                                                      | Drawer-based nav                                    |
| **AdminHomeScreen**      | StatelessWidget | Search + AdminUserCard list. Actions menu (change password, sessions, logout)                                                     | Drawer → admin features                             |
| **SettingsScreen**       | StatelessWidget | Account card (name/email/phone) + nav buttons (Profile, Change Password, Sessions) + Logout                                       | Nav to sub-screens                                  |
| **UserProfileScreen**    | StatefulWidget  | Profile info rows, signature display/upload (ImagePicker), Firm info card, Quick Stats card (challans/bills/stock alerts/revenue) | Standalone                                          |
| **ChangePasswordScreen** | StatelessWidget | 3 password fields with visibility toggles                                                                                         | Standalone                                          |
| **ActiveSessionsScreen** | StatelessWidget | SessionCard list, "Logout All Other Devices" menu action                                                                          | Revoke dialogs                                      |
| **HelpSupportScreen**    | StatelessWidget | Branded header card, ContactCard (email/phone with url_launcher), FaqItem (ExpansionTile)                                         | Static info                                         |

#### Dashboard

| Screen              | Key Widgets                                                                                | Data                                                       |
| ------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **DashboardScreen** | Drawer, ChoiceChips (monthly/yearly), 6 StatCards, MonthlyRevenueChart (fl_chart BarChart) | Firm name, GST badge, revenue metrics, last 6 months chart |

#### Inventory

| Screen                     | Type            | Key Widgets                                                                                                                                |
| -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **ItemMasterScreen**       | StatelessWidget | AppSearchBar + MiniStat (low stock/total) + ItemCard list with edit/delete                                                                 |
| **AddItemScreen**          | StatelessWidget | Image picker, 15+ form fields, category/brand/supplier dropdowns, GST SegmentedButton                                                      |
| **ItemViewScreen**         | StatelessWidget | Read-only list with CachedNetworkImage thumbnails                                                                                          |
| **CategoryMasterScreen**   | StatelessWidget | Search + AppCard list + edit/delete/view actions                                                                                           |
| **AddCategoryScreen**      | StatelessWidget | Name field + brand multi-select (CheckboxListTile)                                                                                         |
| **ViewCategoryScreen**     | StatelessWidget | Read-only: name + brand count                                                                                                              |
| **BrandMasterScreen**      | StatelessWidget | Search + AppCard list                                                                                                                      |
| **AddBrandScreen**         | StatelessWidget | Single "Brand Name" field                                                                                                                  |
| **ViewBrandScreen**        | StatelessWidget | Name + item count                                                                                                                          |
| **DiscountMasterScreen**   | StatelessWidget | Split view: category sidebar (140px) + brand discount grid. 4 TextFields per brand (D1 Normal/Special, D2 Normal/Special). Save in AppBar. |
| **SupplierMasterScreen**   | StatelessWidget | Search + AppCard with SupplierInfoRow                                                                                                      |
| **AddSupplierScreen**      | StatelessWidget | Form: name/phone/email/address/city/state/gstin                                                                                            |
| **ViewSupplierScreen**     | StatelessWidget | Read-only supplier details                                                                                                                 |
| **DepartmentMasterScreen** | StatefulWidget  | Search + numbered list. Get.dialog AlertDialog for create/edit (name only).                                                                |
| **StockAlertScreen**       | StatelessWidget | AlertSummaryCard + search + AlertCard list                                                                                                 |

#### Transactions

| Screen                             | Type            | Key Widgets                                                                                                                                                               |
| ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ChallanListScreen**              | StatelessWidget | Complex filter panel (type/payment/contact/dates) + search + ChallanCard list. Only non-billed sale challans editable.                                                    |
| **CreateChallanScreen**            | StatelessWidget | Header (contact type/selection, label, date, GST toggle) → Bank (from/to) → Item picker → ChallanLineItemCard list → ChallanSummaryCard (gross, discounts, GST, net)      |
| **BillListScreen**                 | StatelessWidget | Search + status filter chips + BillCard list. RecordPaymentSheet for unpaid.                                                                                              |
| **GenerateBillScreen**             | StatelessWidget | Like CreateChallan + Logistics section (agent, transport, charge, customer name, vehicle no) + bill number field + "Apply last sold"                                      |
| **PurchaseMasterScreen**           | StatelessWidget | Search + type filter chips + PurchaseCard list. RecordPaymentSheet for unpaid.                                                                                            |
| **AddPurchaseScreen**              | StatelessWidget | Supplier dropdown + purchase type chips + PurchaseLineItemCard list + total + Record button                                                                               |
| **TransactionHistoryScreen**       | StatelessWidget | Summary card + search + type filter chips + TransactionCard list                                                                                                          |
| **ReturnMasterScreen** (723 lines) | StatefulWidget  | Inline Get.dialog form: return type, date, bill/challan selection, reference items, line items with qty/rate/GST/discounts/damaged/isGst, note, total. Return cards list. |

#### Masters (Dialog-Based)

These use `StatefulWidget` + `Get.dialog(AlertDialog)` for create/edit instead of separate navigation screens:

| Screen                     | Form Fields                                                                   |
| -------------------------- | ----------------------------------------------------------------------------- |
| **AgentMasterScreen**      | name, party dropdown, address, city, pincode, phone, whatsapp                 |
| **TransportMasterScreen**  | name, address, city, pincode, phone, whatsapp, gstin                          |
| **HsnMasterScreen**        | HSN code, GST rate, description, isActive switch                              |
| **AreaMasterScreen**       | city, state, pincode, phone, whatsapp, agent dropdown, transport dropdown     |
| **BankMasterScreen**       | bank name, branch, IFSC, account number, holder name, UPI, isDefault checkbox |
| **DepartmentMasterScreen** | name only                                                                     |

#### Reports & Account

| Screen                       | Detail                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ReportScreen** (328 lines) | Dynamic sections by report type. \_ReportSection with stat cards + top lists. Types: Sales, Purchases, Sales Returns, Purchase Returns, GST Overview. |
| **AccountMasterScreen**      | Simple Scaffold delegating to TransactionsTab widget                                                                                                  |

#### Users (Admin)

| Screen               | Detail                                                            |
| -------------------- | ----------------------------------------------------------------- |
| **UserMasterScreen** | Search + UserCard list with edit/delete. Add user via navigation. |
| **AddUserScreen**    | Form: username, email, password (optional on edit)                |

---

### 2.8 Screen Widgets

| Widget                     | Location                 | Purpose                                                                                                                                                                     |
| -------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MonthlyRevenueChart**    | dashboard/widgets/       | fl_chart BarChart showing last 6 months revenue                                                                                                                             |
| **ChallanCard**            | challan/widgets/         | List card: challan#, GST/NON_GST badge, BILLED/OPEN status, party, date, item count, amount                                                                                 |
| **ChallanLineItemCard**    | challan/widgets/         | Per-line-item editor: item dropdown, remark, type toggle, stock (read-only), PCS, rate, dis%, sp dis, item disc, GST%, computed metrics (gross/discount/taxable/GST/amount) |
| **ChallanSummaryCard**     | challan/widgets/         | Totals: gross, after discounts+GST, GST, challan discount, final amount                                                                                                     |
| **ChallanSummaryRow**      | challan/widgets/         | Label-value row with optional bold + color                                                                                                                                  |
| **SectionTitle**           | challan/widgets/         | Simple styled text heading                                                                                                                                                  |
| **ChallanMiniField**       | challan/widgets/         | Compact labeled numeric text field                                                                                                                                          |
| **LoadingDropdown**        | challan/widgets/         | Placeholder with spinner while dropdown data loads                                                                                                                          |
| **BillCard**               | bill/widgets/            | List card: bill#, payment status badge, party, date, paid/balance amounts, total. Popup menu (record payment, delete)                                                       |
| **BillSummaryRow**         | bill/widgets/            | Same as ChallanSummaryRow (label-value pair)                                                                                                                                |
| **ChallanTile**            | bill/widgets/            | Selectable challan card for bill generation: checkbox + challan#, GST badge, items, date, amount, discount                                                                  |
| **ItemCard**               | item_master/widgets/     | List card: CachedNetworkImage thumbnail, name, sale rate, stock vs threshold, GST badge, stock status badge, edit/delete                                                    |
| **MiniStat**               | item_master/widgets/     | Small stat bar: label + value with color accent and left border                                                                                                             |
| **PartyCard**              | party/widgets/           | List card: InitialsAvatar, name, phone, balance (colored by +/-), edit/delete                                                                                               |
| **TransactionCard**        | transaction/widgets/     | List card: directional icon (sale↑/purchase↓), contact name, ledger type + payment mode, date/time, amount                                                                  |
| **AlertCard**              | stock_alert/widgets/     | Item name + stock status badge + StockInfo (total stock + threshold)                                                                                                        |
| **AlertSummaryCard**       | stock_alert/widgets/     | Full-width stat with left accent border: label + large value                                                                                                                |
| **StockInfo**              | stock_alert/widgets/     | Label + value column with color                                                                                                                                             |
| **PurchaseCard**           | purchase/widgets/        | Like BillCard but for purchases: purchase#, type badge, payment status, supplier, date, paid/balance, total                                                                 |
| **PurchaseLineItemCard**   | purchase/widgets/        | Per-line editor: item dropdown + qty/rate fields + computed amount                                                                                                          |
| **PurchaseSectionTitle**   | purchase/widgets/        | Styled text heading (same as SectionTitle)                                                                                                                                  |
| **PurchaseMiniField**      | purchase/widgets/        | Compact labeled numeric text field (same as ChallanMiniField)                                                                                                               |
| **SupplierInfoRow**        | supplier_master/widgets/ | Icon + text row for list cards                                                                                                                                              |
| **SupplierDetailRow**      | supplier_master/widgets/ | Icon + text row for detail views                                                                                                                                            |
| **SessionCard**            | sessions/widgets/        | Device icon (android/ios/web/desktop), device name, "This Device" badge, last active/login dates, revoke button                                                             |
| **UserCard**               | user_master/widgets/     | InitialsAvatar, name, email, type badge (MAIN/SECONDARY), edit/delete popup (hidden for main users)                                                                         |
| **AdminUserCard**          | admin_home/widgets/      | Like UserCard + active/inactive status + toggle active/deactivate action                                                                                                    |
| **AccountTransactionCard** | account_master/widgets/  | Sale/purchase icon + contact name + ledger type badge + payment mode + UTR + date + amount                                                                                  |
| **TransactionsTab**        | account_master/widgets/  | Full tab: summary (total/sales/purchases) + search bar + filter chips (all/sale/purchase) + AccountTransactionCard list                                                     |
| **ContactCard**            | help/widgets/            | Tappable card: icon + title + subtitle + chevron                                                                                                                            |
| **FaqItem**                | help/widgets/            | ExpansionTile: question (title) → answer (expanded content)                                                                                                                 |

---

### 2.9 Shared Widgets

#### Barrel Export: `common_widgets.dart`

Re-exports all 18 shared widgets from a single import.

#### Buttons (4)

| Widget              | Props                                                              | Behavior                                                                 |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **AppButton**       | text, onPressed, isLoading, isOutlined, color, width, height, icon | Full-width by default. Loading spinner. Outlined variant. Optional icon. |
| **AppBarAddButton** | onPressed                                                          | Rounded accent-colored "+" icon in AppBar actions                        |
| **ActionIcon**      | icon, color, onTap, size                                           | Small tinted-background icon button (for edit/delete)                    |
| **AppPopupMenu**    | onEdit, onDelete                                                   | Standard "⋮" menu with Edit + Delete options                             |

#### Cards (5)

| Widget             | Props                                           | Behavior                                                                        |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| **AppCard**        | child, padding, onTap, borderColor, borderWidth | White container with rounded corners + border. Tappable.                        |
| **StatCard**       | title, value, icon, color, onTap                | Dashboard stat card with left color border, icon in circle, title + large value |
| **StatusBadge**    | label, color, textColor                         | Compact colored pill. Factory constructors: `.gst()`, `.stock()`, `.payment()`  |
| **InfoChip**       | label, value, color                             | Small value+label column (used in payment sheets)                               |
| **InitialsAvatar** | name, radius, bgColor, textColor                | Circle/rounded-square with first letter of name                                 |

#### Inputs (3)

| Widget             | Props                                                                                   | Behavior                                              |
| ------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **AppTextField**   | label, hint, controller, obscureText, suffixes, validator, maxLines, enabled, onChanged | Labeled text form field with theme-consistent styling |
| **AppSearchBar**   | hint, onChanged, padding, controller                                                    | Rounded search field with search icon                 |
| **AppFilterChips** | options, selected, onSelected, padding                                                  | Horizontal scrollable FilterChip row                  |

#### Feedback (3)

| Widget          | Props                               | Behavior                                     |
| --------------- | ----------------------------------- | -------------------------------------------- |
| **AppSnackbar** | Static `success(msg)`, `error(msg)` | Top-positioned GetX raw snackbar (green/red) |
| **EmptyState**  | icon, title, subtitle               | Centered icon + text for empty lists         |
| **ErrorState**  | message, onRetry                    | Centered error icon + message + retry button |

#### Drawer (5)

| Widget                    | Props                               | Behavior                                                                                                                                                                                                                                 |
| ------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AppDrawer** (364 lines) | None                                | Full navigation drawer. Header with firm name. Sections: Dashboard, Masters (8 items), Inventory (8 items), Transactions (5 items), Reports (6 items), Account (3 items). Role-conditional (isFirm). Footer: "Maheshwari Motors v1.0.0". |
| **AppDrawerButton**       | None                                | Menu hamburger icon that opens Scaffold drawer                                                                                                                                                                                           |
| **DrawerItem**            | icon, label, onTap, isActive, color | Row: icon + label + active dot. Active state highlight.                                                                                                                                                                                  |
| **DrawerSectionHeader**   | title                               | Uppercased section label with letter spacing                                                                                                                                                                                             |
| **DrawerSectionDivider**  | None                                | Thin horizontal divider                                                                                                                                                                                                                  |

#### Sheets (2)

| Widget                             | Props                                                        | Behavior                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DeleteConfirmSheet**             | title, subtitle, onConfirm                                   | Bottom sheet: delete icon, title/subtitle, Cancel + Delete buttons                                                                                                                                                |
| **RecordPaymentSheet** (269 lines) | referenceId, referenceLabel, totalAmount, paidAmount, isSale | Bottom sheet modal: Total/Paid/Balance summary, amount field (pre-filled with balance), payment mode selector (cash/bank), UTR field (if bank), remarks, submit. Calls `recordPayment` or `recordChallanPayment`. |

---

## 3. Architecture Analysis

### 3.1 Pattern

**GetX MVC** with clear layer separation:

```
┌─────────────────────────────────────────────────┐
│                    main.dart                      │
│            GetMaterialApp + InitialBinding         │
└───────────────────┬─────────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌────────┐   ┌───────────┐   ┌──────────┐
│  Core  │   │   Routes   │   │   Data   │
│network │   │ app_routes │   │ models/  │
│bindings│   │ app_pages  │   │ services/│
│theme   │   │            │   │          │
│utils   │   └───────────┘   └────┬─────┘
└────────┘                        │
                                  ▼
                    ┌──────────────────────┐
                    │    Presentation       │
                    │  ┌────────────────┐   │
                    │  │  Controllers   │   │
                    │  │ (GetxController)│   │
                    │  └───────┬────────┘   │
                    │          │             │
                    │  ┌───────▼────────┐   │
                    │  │   Screens      │   │
                    │  │  (StatelessW / │   │
                    │  │   StatefulW)   │   │
                    │  └───────┬────────┘   │
                    │          │             │
                    │  ┌───────▼────────┐   │
                    │  │ Shared Widgets │   │
                    │  └────────────────┘   │
                    └──────────────────────┘
```

### 3.2 State Management

- **GetX Reactive**: `Rx<T>`, `RxList<T>`, `RxBool`, `RxString`, `RxInt`, `.obs` extension
- **Obx()** widgets for reactive rebuilds
- **Controllers** registered via `Get.put()` in screens or `Get.lazyPut()` in route bindings
- **Permanent singletons**: `ApiClient`, `ApiService`, `AuthController` (via InitialBinding)
- **No local state** in most screens (StatelessWidget + GetX controller)
- **Exception**: Dialog-based masters (Agent, Transport, HSN, Area, Bank, Department) + UserProfile + ReturnMaster use StatefulWidget for local form state

### 3.3 Navigation

- **GetX named routing**: `Get.toNamed()`, `Get.offNamed()`, `Get.offAllNamed()`
- **~75 routes** defined in `AppRoutes` as static string constants
- **Drawer-based** primary navigation with role-conditional sections
- **Result-based**: Add/Edit screens return `true` on success; list screens reload on return
- **Arguments**: Edit routes pass model instance; Report routes pass report type string

### 3.4 Network Layer

- **Single ApiService** (1136 lines) = all API calls
- **Single ApiClient** = Dio wrapper with interceptors
- **Auto-pagination**: `_fetchAllPages()` fetches all pages by following `currentPage < totalPages`
- **Auth flow**: Token stored in SecureStorage → injected in Dio interceptor → 401 clears + redirects
- **Error handling**: `ApiClient.parseError()` extracts message from DioException

### 3.5 Design System

- **Consistent theming** via AppTheme, AppColors, AppSpacing
- **18 shared widgets** cover all common UI patterns (buttons, cards, inputs, feedback, drawer, sheets)
- **Component composition**: Screen widgets compose shared widgets (e.g., ItemCard uses AppCard, StatusBadge, ActionIcon)
- **Material 3** with Google Fonts Inter

### 3.6 Code Quality Observations

- **No tests**: Only default `widget_test.dart` present
- **No dependency injection** beyond GetX bindings (no interfaces/abstractions for services)
- **No offline support**: All data fetched from API, no local caching or database
- **No pagination in UI**: `_fetchAllPages` loads ALL data at once (could be problematic with large datasets)
- **Hardcoded API URL** in constants (configurable via dart-define but defaults to IP address, not domain)
- **Some code duplication**: PurchaseMiniField ≡ ChallanMiniField, PurchaseSectionTitle ≡ SectionTitle, SupplierInfoRow ≡ SupplierDetailRow
- **Mixed screen patterns**: Most screens are StatelessWidget with GetX controller; dialog-based masters are StatefulWidget with local TextEditingControllers — inconsistent approach

---

## 4. Screen Inventory — Flutter vs React Frontend

| #   | Flutter Screen             | Route                                                                                                            | React Equivalent              | Parity |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------ |
| 1   | SplashScreen               | `/splash`                                                                                                        | N/A (web has instant load)    | N/A    |
| 2   | LoginScreen                | `/login`                                                                                                         | Login page                    | ✅     |
| 3   | HomeScreen/DashboardScreen | `/home`                                                                                                          | Dashboard                     | ✅     |
| 4   | AdminHomeScreen            | `/admin-home`                                                                                                    | Admin panel / User management | ✅     |
| 5   | ItemMasterScreen           | `/item-master`                                                                                                   | Item Master page              | ✅     |
| 6   | AddItemScreen              | `/add-item`, `/edit-item`                                                                                        | Add/Edit Item form            | ✅     |
| 7   | ItemViewScreen             | `/item-view`                                                                                                     | Item listing (read-only)      | ✅     |
| 8   | ChallanListScreen          | `/challan-list`                                                                                                  | Challan list                  | ✅     |
| 9   | CreateChallanScreen        | `/create-challan`, `/edit-challan`                                                                               | Create/Edit Challan           | ✅     |
| 10  | BillListScreen             | `/bill-list`                                                                                                     | Bill list                     | ✅     |
| 11  | GenerateBillScreen         | `/generate-bill`                                                                                                 | Generate Bill                 | ✅     |
| 12  | PartyMasterScreen          | `/party-master`                                                                                                  | Party Master                  | ✅     |
| 13  | AddPartyScreen             | `/add-party`, `/edit-party`                                                                                      | Add/Edit Party                | ✅     |
| 14  | TransactionHistoryScreen   | `/transaction-history`                                                                                           | Transaction History           | ✅     |
| 15  | StockAlertScreen           | `/stock-alert-master`                                                                                            | Stock Alert                   | ✅     |
| 16  | UserMasterScreen           | `/user-master`                                                                                                   | User Master (admin)           | ✅     |
| 17  | AddUserScreen              | `/add-user`, `/edit-user`                                                                                        | Add/Edit User                 | ✅     |
| 18  | ChangePasswordScreen       | `/change-password`                                                                                               | Change Password               | ✅     |
| 19  | ActiveSessionsScreen       | `/active-sessions`                                                                                               | Active Sessions               | ✅     |
| 20  | UserProfileScreen          | `/user-profile`                                                                                                  | User Profile                  | ✅     |
| 21  | ReportScreen               | `/report`, `/purchase-report`, `/sales-report`, `/gst-report`, `/sales-return-report`, `/purchase-return-report` | Reports pages                 | ✅     |
| 22  | CategoryMasterScreen       | `/category-master`                                                                                               | Category Master               | ✅     |
| 23  | AddCategoryScreen          | `/add-category`, `/edit-category`                                                                                | Add/Edit Category             | ✅     |
| 24  | ViewCategoryScreen         | `/view-category`                                                                                                 | View Category                 | ✅     |
| 25  | BrandMasterScreen          | `/brand-master`                                                                                                  | Brand Master                  | ✅     |
| 26  | AddBrandScreen             | `/add-brand`, `/edit-brand`                                                                                      | Add/Edit Brand                | ✅     |
| 27  | ViewBrandScreen            | `/view-brand`                                                                                                    | View Brand                    | ✅     |
| 28  | DiscountMasterScreen       | `/discount-master`                                                                                               | Discount Master               | ✅     |
| 29  | AccountMasterScreen        | `/account-master`                                                                                                | Account Master                | ✅     |
| 30  | SupplierMasterScreen       | `/supplier-master`                                                                                               | Supplier Master               | ✅     |
| 31  | AddSupplierScreen          | `/add-supplier`, `/edit-supplier`                                                                                | Add/Edit Supplier             | ✅     |
| 32  | ViewSupplierScreen         | `/view-supplier`                                                                                                 | View Supplier                 | ✅     |
| 33  | PurchaseMasterScreen       | `/purchase-master`                                                                                               | Purchase Master               | ✅     |
| 34  | AddPurchaseScreen          | `/add-purchase`                                                                                                  | Add Purchase                  | ✅     |
| 35  | AgentMasterScreen          | `/agent-master`                                                                                                  | Agent Master                  | ✅     |
| 36  | TransportMasterScreen      | `/transport-master`                                                                                              | Transport Master              | ✅     |
| 37  | HsnMasterScreen            | `/hsn-master`                                                                                                    | HSN Master                    | ✅     |
| 38  | AreaMasterScreen           | `/area-master`                                                                                                   | Area Master                   | ✅     |
| 39  | BankMasterScreen           | `/bank-master`                                                                                                   | Bank Master                   | ✅     |
| 40  | DepartmentMasterScreen     | `/department-master`                                                                                             | Department Master             | ✅     |
| 41  | ReturnMasterScreen         | `/return-master`                                                                                                 | Return Master                 | ✅     |
| 42  | SettingsScreen             | `/settings`                                                                                                      | Settings                      | ✅     |
| 43  | HelpSupportScreen          | `/help-support`                                                                                                  | Help & Support                | ✅     |

**Total Flutter Screens: 43** (with shared Add/Edit routes = ~34 unique screen files)

---

## 5. Gaps Analysis

### 5.1 Flutter Features NOT in React Frontend (potential Flutter-only)

| Feature                      | Detail                                                                     |
| ---------------------------- | -------------------------------------------------------------------------- |
| **Splash Screen**            | Native mobile splash with branding — web doesn't need this                 |
| **Image Picker**             | Item image upload via `image_picker` (gallery) — web may use file input    |
| **Signature Upload**         | Profile screen signature image upload — check if React implements          |
| **Device-specific sessions** | SessionCard shows device type icons (android/ios/web/desktop)              |
| **CachedNetworkImage**       | Item thumbnails with disk caching — web uses browser cache                 |
| **url_launcher**             | Help screen opens mailto: and tel: links — web handles natively            |
| **Secure Storage**           | Token in platform-encrypted storage — web likely uses cookies/localStorage |

### 5.2 Backend Features NOT Consumed by Flutter

Based on backend analysis (`BACKEND_ANALYSIS.md` and API service):

| Backend Feature                  | Gap Description                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Subscription management**      | Backend has subscription expiry cron job and management — Flutter has NO subscription UI                         |
| **Label CRUD**                   | Backend has full label endpoints — Flutter only reads labels (for discount resolution), no create/edit/delete UI |
| **Firm switching**               | Drawer FAQ mentions "Switch Firm" but no actual route or screen exists for firm switching                        |
| **Print/PDF generation**         | CreateChallanScreen has a "Print Format" dropdown (A4/thermal) but no actual print/PDF logic                     |
| **Bill editing**                 | Backend may support bill updates — Flutter only supports create + delete + record payment (no edit)              |
| **Purchase editing**             | No edit route for purchases — only create + delete                                                               |
| **Transaction editing/deletion** | No edit or delete actions on transactions                                                                        |
| **Bulk operations**              | No bulk select/delete/export on any list screen                                                                  |
| **Advanced reporting**           | Backend may support date ranges on reports — Flutter loads default period only                                   |

### 5.3 React Frontend Features NOT in Flutter

_(Based on frontend structure — requires deeper React read to confirm)_

| Potential React Feature           | Flutter Gap                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| **Responsive layouts**            | Flutter is mobile-first; no tablet/desktop responsive breakpoints                             |
| **Data tables**                   | React likely uses data tables with sort/pagination — Flutter uses simple ListView             |
| **Client-side pagination**        | Flutter loads ALL data via `_fetchAllPages` — no lazy loading or server-side pagination in UI |
| **Export (CSV/PDF)**              | React may have export functionality — Flutter has none                                        |
| **Date range filters on reports** | React may support — Flutter report screen has no date range picker                            |

### 5.4 Technical Debt / Quality Gaps

| Issue                    | Impact                                                     | Recommendation                                           |
| ------------------------ | ---------------------------------------------------------- | -------------------------------------------------------- |
| **No tests**             | Zero test coverage                                         | Add unit tests for controllers, widget tests for screens |
| **No error boundaries**  | Unhandled errors crash the app                             | Add global error handling via FlutterError.onError       |
| **Load-all pagination**  | `_fetchAllPages` downloads entire dataset                  | Implement infinite scroll with server pagination         |
| **No offline mode**      | App unusable without network                               | Add Hive/SQLite for local caching                        |
| **Hardcoded IP**         | Production URL is an IP address                            | Use domain name + environment configs                    |
| **No retry logic**       | Single request failure = user must manually retry          | Add Dio retry interceptor                                |
| **Duplicated widgets**   | PurchaseMiniField ≡ ChallanMiniField, etc.                 | Consolidate into shared widgets                          |
| **No analytics/logging** | No crash reporting or usage analytics                      | Add Firebase Crashlytics / Analytics                     |
| **No deep linking**      | No support for opening specific routes from external links | Add uni_links support                                    |
| **No localization**      | All strings hardcoded in English                           | Add flutter_localizations                                |

---

## Summary Statistics

| Metric                 | Count                    |
| ---------------------- | ------------------------ |
| Total Dart files       | ~174                     |
| Models                 | 24                       |
| Controllers            | ~41                      |
| Screens                | ~43 (34 unique files)    |
| Screen widgets         | 31                       |
| Shared widgets         | 23 (18 unique, 1 barrel) |
| API endpoints consumed | ~80+                     |
| Named routes           | ~75                      |
| External packages      | 10                       |
| Lines of code (est.)   | ~15,000–18,000           |
