# Database Design

## Overview

This document describes the MongoDB database schema for Maheshwari Motors - a stock management, billing, and purchase management system.

---

## Collections

### 1. User

**Collection Name:** `users`

**Purpose:** Stores user accounts with dual firm support (GST and Non-GST) and admin access.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `type`: String (required) - enum: ["main", "secondary"]
- `name`: String (required)
- `email`: String (optional)
- `phone`: String (optional)
- `gst_firm`: Object (required) - Embedded document
  - `username`: String (required)
  - `password`: String (required, hashed)
  - `name`: String (required)
  - `phone`: String (required)
  - `email`: String (optional)
  - `address`: String (required)
  - `godown_address`: String (optional)
  - `city`: String (required)
  - `state`: String (required)
  - `GSTIN`: String (optional)
  - `CIN`: String (optional)
  - `reg_number`: String (optional)
  - `bank_ids`: Array of ObjectId (ref: Bank)
- `nongst_firm`: Object (required) - Embedded document
  - Same structure as gst_firm
- `admin`: Object (optional) - Embedded document
  - `username`: String (required)
  - `password`: String (required, hashed)
- `signature`: String (optional)
- `is_active`: Boolean (default: true)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `gst_firm.username` (unique)
- `nongst_firm.username` (unique)
- `admin.username` (unique, partial)

**Relationships:**

- Has many: Session, Subscription, Counter, Agent, Area, Bank, Brand, Contact, Department, Hsn, Item, Label, Transport, Bill, Challan, Return, Transaction, AutoBill, Report

---

### 2. Session

**Collection Name:** `sessions`

**Purpose:** Manages user authentication sessions across devices.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `user_id`: ObjectId (required, indexed, ref: User)
- `role`: String (required) - enum: ["admin", "firm"]
- `firm_type`: String (optional) - enum: ["GST", "NON_GST"]
- `token`: String (required, unique)
- `device_name`: String (default: "Unknown Device")
- `device_type`: String - enum: ["android", "ios", "web", "desktop", "unknown"], default: "unknown"
- `ip_address`: String (default: "")
- `last_active`: Date (default: Date.now)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `user_id` (indexed)
- `user_id, createdAt` (compound)

**Relationships:**

- Belongs to: User

---

### 3. Subscription

**Collection Name:** `subscriptions`

**Purpose:** Tracks subscription plans and expiry for users.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `user_id`: ObjectId (required, unique, indexed, ref: User)
- `plan_type`: String - enum: ["demo", "paid"], default: "demo"
- `status`: String (indexed) - enum: ["active", "expired", "cancelled"], default: "active"
- `timeline`: Object (embedded)
  - `years`: Number (min: 0, default: 0)
  - `months`: Number (min: 0, default: 0)
  - `days`: Number (min: 0, default: 0)
- `amount`: Number (min: 0, default: 0)
- `start_date`: Date (required, default: Date.now)
- `expiry_date`: Date (required, indexed)
- `activated_by`: ObjectId (optional, ref: User)
- `activated_at`: Date (default: Date.now)
- `last_extended_at`: Date (optional)
- `notes`: String (default: "")
- `history`: Array of Objects (embedded)
  - `plan_type`: String (required) - enum: ["demo", "paid"]
  - `timeline`: Object (required)
  - `amount`: Number (min: 0, default: 0)
  - `start_date`: Date (required)
  - `expiry_date`: Date (required)
  - `activated_by`: ObjectId (optional, ref: User)
  - `activated_at`: Date (default: Date.now)
  - `notes`: String (default: "")
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `user_id` (unique, indexed)
- `status` (indexed)
- `expiry_date` (indexed)

**Relationships:**

- Belongs to: User
- Assumption: activated_by references User (admin who activated the subscription)

---

### 4. Counter

**Collection Name:** `counters`

**Purpose:** Auto-increment sequence generator for various models per user.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `model_name`: String (required)
- `user_id`: ObjectId (required, ref: User)
- `seq`: Number (default: 0)

**Indexes:**

- `model_name, user_id` (compound, unique)

**Relationships:**

- Belongs to: User

---

### 5. Report

**Collection Name:** `reports`

**Purpose:** Stores generated PDF reports with metadata.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `pdf_link`: String (required)
- `date_created`: Date (default: Date.now)
- `user_id`: ObjectId (optional, ref: User)
- `is_gst`: Number - enum: [0, 1]
- `report_type`: String - enum: ["challan", "bill", "inventory", "transaction", "other"]
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Relationships:**

- Belongs to: User

---

### 6. Agent

**Collection Name:** `agents`

**Purpose:** Manages sales agents/representatives.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `name`: String (required, trimmed)
- `address`: String (optional)
- `city`: String (optional)
- `pincode`: String (optional)
- `phone`: String (optional)
- `whatsapp`: String (optional)
- `user_id`: ObjectId (required, indexed, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `id, user_id` (compound)
- `name, user_id` (compound)
- `user_id` (indexed)

**Relationships:**

- Belongs to: User
- Has many: Area, Contact

---

### 7. Area

**Collection Name:** `areas`

**Purpose:** Manages geographical areas with agent and transport assignments.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `city`: String (required, trimmed)
- `state`: String (optional, trimmed)
- `pincode`: String (optional, trimmed)
- `phone`: String (optional)
- `whatsapp`: String (optional)
- `agent_id`: ObjectId (optional, ref: Agent)
- `transport_id`: ObjectId (optional, ref: Transport)
- `user_id`: ObjectId (required, indexed, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `id, user_id` (compound)
- `city, user_id` (compound)
- `user_id` (indexed)

**Relationships:**

- Belongs to: User, Agent, Transport
- Has many: Contact

---

### 8. Bank

**Collection Name:** `banks`

**Purpose:** Stores bank account details for firms, parties, and suppliers.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `bank_name`: String (required, trimmed)
- `bank_branch`: String (optional, trimmed, default: "")
- `ifsc_code`: String (optional, trimmed, default: "")
- `account_number`: String (required, trimmed)
- `account_holder`: String (optional, trimmed, default: "")
- `upi_id`: String (optional, trimmed, default: "")
- `assignment_type`: String (optional) - enum: ["firm", "party", "supplier"]
- `assigned_to`: ObjectId (optional)
- `is_default`: Boolean (default: false)
- `user_id`: ObjectId (required, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `id, user_id` (compound)
- `account_number, user_id` (compound)
- `assignment_type, user_id` (compound)
- `assigned_to, user_id` (compound)
- `is_default, user_id` (compound)

**Relationships:**

- Belongs to: User
- Assumption: assigned_to can reference Contact (when assignment_type is "party" or "supplier")
- Referenced by: Contact, Bill (payment_entries), Transaction, Challan (from_bank, to_bank)

---

### 9. Brand

**Collection Name:** `brands`

**Purpose:** Manages product brands with discount configurations.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `name`: String (required, trimmed)
- `discount1`: Object (embedded)
  - `normal`: Number (min: 0, default: 0)
  - `special`: Number (min: 0, default: 0)
- `discount2`: Object (embedded)
  - `normal`: Number (min: 0, default: 0)
  - `special`: Number (min: 0, default: 0)
- `item_ids`: Array of ObjectId (ref: Item)
- `hsn_id`: ObjectId (optional, ref: Hsn)
- `user_id`: ObjectId (required, indexed, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `name, user_id` (compound)
- `id, user_id` (compound)
- `user_id` (indexed)

**Relationships:**

- Belongs to: User, Hsn
- Has many: Item
- Referenced by: Label (brand_discounts)

---

### 10. Contact

**Collection Name:** `contacts`

**Purpose:** Manages parties, suppliers, and book contacts.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `name`: String (required)
- `alias`: String (optional, trimmed)
- `type`: String (required) - enum: ["party", "supplier", "book"]
- `phone`: String (optional)
- `whatsapp_number`: String (optional)
- `email`: String (optional)
- `address`: String (optional)
- `city`: String (optional)
- `state`: String (optional)
- `gstin`: String (optional)
- `cin`: String (optional)
- `reg_number`: String (optional)
- `label_ids`: Array of ObjectId (ref: Label)
- `bank_id`: ObjectId (optional, ref: Bank)
- `transport_charge`: Number (default: 0)
- `area`: String (optional)
- `is_gst`: Number - enum: [0, 1], default: 1
- `transport_id`: ObjectId (optional, ref: Transport)
- `agent_id`: ObjectId (optional, ref: Agent)
- `area_id`: ObjectId (optional, ref: Area)
- `balance`: Number (default: 0)
- `user_id`: ObjectId (required, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `id, user_id` (compound)
- `type, user_id` (compound)

**Relationships:**

- Belongs to: User, Bank, Transport, Agent, Area
- Has many: Label (many-to-many), Bill, Challan, Return, Transaction
- Assumption: balance is calculated from transactions, bills, and payments

---

### 11. Department

**Collection Name:** `departments`

**Purpose:** Categorizes items by department.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `name`: String (required, trimmed)
- `user_id`: ObjectId (required, indexed, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `id, user_id` (compound)
- `user_id` (indexed)

**Relationships:**

- Belongs to: User
- Has many: Item

---

### 12. Hsn

**Collection Name:** `hsns`

**Purpose:** Stores HSN (Harmonized System of Nomenclature) codes with GST rates.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `hsn_code`: String (required, trimmed)
- `description`: String (optional, trimmed)
- `gst_rate`: Number (required, min: 0)
- `is_active`: Boolean (default: true)
- `user_id`: ObjectId (required, indexed, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `id, user_id` (compound)
- `hsn_code, user_id` (compound)
- `user_id` (indexed)

**Relationships:**

- Belongs to: User
- Has many: Brand, Item

---

### 13. Item

**Collection Name:** `items`

**Purpose:** Manages inventory items/products.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `item_name`: String (required)
- `barcode`: String (optional, trimmed, unique sparse)
- `item_id`: String (optional, trimmed, unique sparse)
- `alias`: String (optional, trimmed)
- `description`: String (optional, trimmed)
- `sale_rate`: Number (required)
- `purchase_rate`: Number (default: 0)
- `mrp_rate`: Number (default: 0)
- `gst_percent`: Number (default: 0)
- `stock`: Number (default: 0)
- `physical_stock`: Number (default: 0, min: 0)
- `logical_stock`: Number (default: 0)
- `threshold`: Number (default: 0)
- `image`: String (optional)
- `is_gst`: Number - enum: [0, 1], default: 1
- `user_id`: ObjectId (required, ref: User)
- `brand_id`: ObjectId (optional, ref: Brand)
- `dept_id`: ObjectId (optional, ref: Department)
- `hsn_id`: ObjectId (optional, ref: Hsn)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `id, user_id` (compound)
- `barcode` (unique, sparse)
- `item_id` (unique, sparse)

**Relationships:**

- Belongs to: User, Brand, Department, Hsn
- Referenced by: Challan (items), Return (items), Label (brand_discounts.item_discounts)
- Assumption: stock is updated based on challan, bill, and return transactions

---

### 14. Label

**Collection Name:** `labels`

**Purpose:** Manages pricing labels with brand-specific and item-specific discounts.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `name`: String (required, trimmed)
- `description`: String (optional, trimmed, default: "")
- `is_active`: Boolean (default: true)
- `brand_discounts`: Array of Objects (embedded)
  - `brand_id`: ObjectId (required, ref: Brand)
  - `disc1`: Object (embedded)
    - `normal`: Number (min: 0, default: 0)
    - `special`: Number (min: 0, default: 0)
  - `disc2`: Object (embedded)
    - `normal`: Number (min: 0, default: 0)
    - `special`: Number (min: 0, default: 0)
  - `item_discounts`: Array of Objects (embedded)
    - `item_id`: ObjectId (required, ref: Item)
    - `discount`: Number (min: 0, default: 0)
- `user_id`: ObjectId (required, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `id, user_id` (compound)
- `name, user_id` (compound)
- `brand_discounts.brand_id, user_id` (compound)

**Relationships:**

- Belongs to: User
- References: Brand, Item (in brand_discounts)
- Referenced by: Contact (label_ids), Challan (label_id)

---

### 15. Transport

**Collection Name:** `transports`

**Purpose:** Manages transport/logistics companies.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `name`: String (required, trimmed)
- `address`: String (optional)
- `city`: String (optional)
- `pincode`: String (optional)
- `phone`: String (optional)
- `whatsapp`: String (optional)
- `gstin`: String (optional)
- `user_id`: ObjectId (required, indexed, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `id, user_id` (compound)
- `name, user_id` (compound)
- `user_id` (indexed)

**Relationships:**

- Belongs to: User
- Has many: Area, Contact, Bill, Challan

---

### 16. Challan

**Collection Name:** `challans`

**Purpose:** Manages sale and purchase challans (delivery notes).

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `challan_no`: String (required)
- `challan_type`: String (required) - enum: ["sale", "purchase"]
- `date`: Date (required, default: Date.now)
- `label_id`: ObjectId (optional, ref: Label, required for sale type)
- `print_option`: Number - enum: [1, 2], default: 2
- `contact_id`: ObjectId (required, ref: Contact)
- `from_bank`: Object (optional, embedded)
  - `bank_id`: ObjectId (optional)
  - `bank_name`: String (default: "")
  - `bank_branch`: String (default: "")
  - `ifsc_code`: String (default: "")
  - `account_number`: String (default: "")
  - `account_holder`: String (default: "")
- `to_bank`: Object (optional, embedded)
  - Same structure as from_bank
- `items`: Array of Objects (embedded)
  - `item_id`: ObjectId (required, ref: Item)
  - `quantity`: Number (default: 1)
  - `rate`: Number (required)
  - `discount`: Number (default: 0)
  - `special_discount`: Number (default: 0)
  - `gross_amount`: Number (required)
  - `discount_amount`: Number (default: 0)
  - `total_discount`: Number (default: 0)
  - `taxable_amount`: Number (required)
  - `gst_percent`: Number (default: 0)
  - `gst_amount`: Number (default: 0)
  - `amount`: Number (required)
  - `is_gst`: Number - enum: [0, 1], default: 1
- `gross_total`: Number (required)
- `sub_total`: Number (required)
- `discount`: Number (default: 0)
- `amount`: Number (required)
- `converted_to_bill`: Boolean (default: false)
- `bill_id`: ObjectId (optional, ref: Bill)
- `payment_status`: String - enum: ["due", "paid", "overpaid"], default: "due"
- `paid_amount`: Number (default: 0)
- `is_gst`: Number (required) - enum: [0, 1]
- `linked_challan_id`: ObjectId (optional, ref: Challan)
- `user_id`: ObjectId (required, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Virtual Fields:**

- `label_name`: String (computed from label_id)

**Indexes:**

- `challan_no, user_id, is_gst, challan_type` (compound, unique)
- `id, user_id` (compound)
- `challan_type, user_id, is_gst` (compound)

**Relationships:**

- Belongs to: User, Label, Contact, Bill
- References: Item (in items array), Challan (linked_challan_id)
- Referenced by: Bill (challan_ids), Return
- Assumption: from_bank and to_bank store bank details for payment tracking
- Assumption: linked_challan_id may link related challans (e.g., purchase to sale)

---

### 17. Bill

**Collection Name:** `bills`

**Purpose:** Manages sales bills/invoices.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `bill_no`: String (required)
- `date`: Date (required, default: Date.now)
- `contact_id`: ObjectId (required, ref: Contact)
- `transport_id`: ObjectId (optional, ref: Transport)
- `customer_name`: String (default: "")
- `vehicle_number`: String (default: "")
- `transport_charge`: Number (default: 0)
- `amount`: Number (required)
- `paid_amount`: Number (default: 0)
- `return_amount`: Number (default: 0)
- `payment_status`: String - enum: ["due", "paid", "overpaid"], default: "due"
- `payment_entries`: Array of Objects (embedded)
  - `amount`: Number (required, min: 0)
  - `payment_type`: String (required) - enum: ["bank_transaction_received_amount", "cash_payment_received_amount", "bank_transfer_payment_given", "cash_payment_given"]
  - `bank_id`: ObjectId (optional, ref: Bank)
  - `reference_no`: String (default: "")
  - `note`: String (default: "")
  - `settled_to`: String - enum: ["bill", "unsettled_balance"], default: "bill"
  - `date`: Date (default: Date.now)
- `challan_ids`: Array of ObjectId (ref: Challan)
- `skip_stock_calculation`: Boolean (default: false)
- `is_gst`: Number (required) - enum: [0, 1]
- `user_id`: ObjectId (required, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Virtual Fields:**

- `balance`: Number (computed as amount - paid_amount)

**Indexes:**

- `bill_no, user_id, is_gst` (compound, unique)

**Relationships:**

- Belongs to: User, Contact, Transport
- Has many: Challan (via challan_ids), Return
- References: Bank (in payment_entries)
- Assumption: payment_entries track all payments made against the bill

---

### 18. Return

**Collection Name:** `returns`

**Purpose:** Manages sale and purchase returns.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `return_no`: String (required)
- `return_type`: String (required) - enum: ["sale_return", "purchase_return"]
- `date`: Date (required, default: Date.now)
- `contact_id`: ObjectId (required, ref: Contact)
- `bill_id`: ObjectId (optional, ref: Bill)
- `challan_id`: ObjectId (optional, ref: Challan)
- `items`: Array of Objects (embedded)
  - `item_id`: ObjectId (required, ref: Item)
  - `quantity`: Number (required, min: 1)
  - `rate`: Number (required, min: 0)
  - `discount`: Number (min: 0, max: 100, default: 0)
  - `special_discount`: Number (min: 0, max: 100, default: 0)
  - `gst_percent`: Number (min: 0, default: 0)
  - `gst_amount`: Number (default: 0)
  - `taxable_amount`: Number (required)
  - `amount`: Number (required)
  - `is_damaged`: Boolean (default: false)
  - `is_gst`: Number - enum: [0, 1], default: 1
- `total_amount`: Number (required, min: 0)
- `note`: String (default: "")
- `is_gst`: Number (required) - enum: [0, 1]
- `user_id`: ObjectId (required, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `return_no, user_id, is_gst` (compound, unique)
- `bill_id, user_id` (compound)
- `challan_id, user_id` (compound)
- `contact_id, user_id` (compound)

**Relationships:**

- Belongs to: User, Contact, Bill, Challan
- References: Item (in items array)
- Assumption: is_damaged flag indicates if returned items should not be added back to stock

---

### 19. Transaction

**Collection Name:** `transactions`

**Purpose:** Manages cash and bank transactions (receipts and payments).

**Fields:**

- `_id`: ObjectId (Primary Key)
- `id`: Number (auto-generated per user)
- `transaction_no`: String (required)
- `type`: String (required) - enum: ["bank_received", "cash_received", "bank_payment", "cash_payment"]
- `date`: Date (required, default: Date.now)
- `contact_id`: ObjectId (optional, ref: Contact)
- `amount`: Number (required, min: 0)
- `bank_id`: ObjectId (optional, ref: Bank)
- `reference`: String (optional, trimmed, default: "")
- `remarks`: String (optional, trimmed, default: "")
- `is_gst`: Number (required) - enum: [0, 1]
- `user_id`: ObjectId (required, ref: User)
- `createdAt`: Date (auto)
- `updatedAt`: Date (auto)

**Indexes:**

- `transaction_no, user_id, is_gst` (compound, unique)
- `type, user_id, is_gst` (compound)
- `contact_id, user_id` (compound)
- `bank_id, user_id` (compound)
- `date, user_id` (compound, descending on date)

**Relationships:**

- Belongs to: User, Contact, Bank
- Assumption: Updates contact balance when created

---

### 20. AutoBill

**Collection Name:** `autobills`

**Purpose:** Configures automatic bill generation from challans.

**Fields:**

- `_id`: ObjectId (Primary Key)
- `party_id`: ObjectId (required)
- `from_date`: Date (required)
- `to_date`: Date (required)
- `threshold`: Number (required, min: 1, alias: "challans_per_day")
- `enabled`: Boolean (default: true, alias: "is_active")
- `user_id`: ObjectId (required, ref: User)

**Relationships:**

- Belongs to: User
- Assumption: party_id references Contact (type: "party")
- Assumption: threshold defines minimum challans required before auto-generating bill

---

## Entity Relationship Summary

### Core Entities

- **User**: Central entity, all other collections belong to a user
- **Session**: Authentication and device management
- **Subscription**: User subscription and billing

### Master Data

- **Agent**: Sales representatives
- **Area**: Geographic regions with agent/transport assignments
- **Bank**: Bank accounts for firms, parties, suppliers
- **Brand**: Product brands with discount structures
- **Contact**: Parties, suppliers, and book contacts
- **Department**: Item categorization
- **Hsn**: Tax codes with GST rates
- **Item**: Inventory products
- **Label**: Pricing labels with discounts
- **Transport**: Logistics companies

### Transactions

- **Challan**: Sale/purchase delivery notes
- **Bill**: Sales invoices (can be generated from challans)
- **Return**: Sale/purchase returns
- **Transaction**: Cash/bank receipts and payments
- **AutoBill**: Automation configuration for bill generation

### System

- **Counter**: Auto-increment sequences per user per model
- **Report**: Generated PDF reports

### Key Relationships

1. User → All collections (one-to-many)
2. Contact → Bill, Challan, Return, Transaction (one-to-many)
3. Item → Challan.items, Return.items (one-to-many)
4. Brand → Item, Label.brand_discounts (one-to-many)
5. Challan → Bill (many-to-one via challan_ids)
6. Bill/Challan → Return (one-to-many)
7. Label → Contact (many-to-many via label_ids)
8. Agent/Transport → Area, Contact (one-to-many)

### Data Isolation

All collections use `user_id` for multi-tenancy, ensuring data isolation between users. Most unique indexes include `user_id` to allow duplicate values across different users.
