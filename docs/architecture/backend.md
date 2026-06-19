# Backend Architecture

## Overview

The backend is built using **Node.js + Express.js** with **MongoDB** as the database. It follows a **layered modular monolithic architecture** with clear separation of concerns across routes, controllers, services, and models.

**Tech Stack:**
- Runtime: Node.js
- Framework: Express.js
- Database: MongoDB with Mongoose ODM
- Authentication: JWT (JSON Web Tokens)
- File Storage: AWS S3
- Task Scheduling: node-cron
- File Upload: Multer

---

## Architecture Type

**Layered Modular Monolith**

The application follows a **4-layer architecture**:

1. **Routes Layer** - HTTP endpoint definitions and middleware attachment
2. **Controller Layer** - Request/response handling and validation
3. **Service Layer** - Business logic and data manipulation
4. **Model Layer** - Database schema and data access

**Characteristics:**
- Single deployable unit (monolith)
- Organized into feature-based modules
- Clear separation of concerns
- Reusable service layer
- Centralized error handling
- Middleware-based authentication

---

## Project Structure

```
backend/
├── src/
│   ├── config/           # Configuration files
│   ├── controllers/      # Request handlers
│   ├── services/         # Business logic
│   ├── models/           # Database schemas
│   ├── routers/          # Route definitions
│   ├── middlewares/      # Express middlewares
│   ├── helpers/          # Utility helpers
│   ├── jobs/             # Cron jobs
│   ├── utils/            # Common utilities
│   └── app.js            # Express app setup
├── scripts/              # Database scripts
└── index.js              # Entry point
```

---

## Modules

### 1. Authentication Module

**Responsibilities:**
- User registration and login (Admin & Firm)
- JWT token generation and validation
- Session management across devices
- Password management
- Signature upload/update

**Key Files:**
- Routes: `routers/auth/auth.routes.js`, `routers/auth/admin.routes.js`
- Controllers: `controllers/auth/auth.controller.js`, `controllers/auth/admin.controller.js`
- Services: `services/auth/auth.service.js`, `services/auth/admin.service.js`
- Models: `models/auth/user.model.js`, `models/auth/session.model.js`

**Endpoints:**
- `POST /api/v1/auth/admin/register` - Register main user
- `POST /api/v1/auth/login` - Login (admin/firm)
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get profile
- `PUT /api/v1/auth/change-password` - Change password
- `GET /api/v1/auth/sessions` - Get all sessions
- `DELETE /api/v1/auth/sessions/:sessionId` - Revoke session
- `POST /api/v1/auth/signature` - Upload signature
- `PUT /api/v1/auth/signature` - Update signature

---

### 2. Master Data Module

**Responsibilities:**
- Manage core business entities (Items, Brands, Contacts, etc.)
- CRUD operations for master data
- Data validation and relationships
- File uploads (images)

**Sub-modules:**

#### 2.1 Item Management
**Key Files:**
- Routes: `routers/master/item.routes.js`
- Controllers: `controllers/master/item.controller.js`
- Services: `services/master/item.service.js`
- Models: `models/master/item.model.js`

**Features:**
- Item CRUD with image upload
- Stock management (physical/logical)
- Low stock alerts
- Batch updates
- Barcode generation and validation

#### 2.2 Brand Management
**Key Files:**
- Routes: `routers/master/brand.routes.js`
- Controllers: `controllers/master/brand.controller.js`
- Services: `services/master/brand.service.js`
- Models: `models/master/brand.model.js`

#### 2.3 Contact Management (Parties/Suppliers)
**Key Files:**
- Routes: `routers/master/contact.routes.js`
- Controllers: `controllers/master/contact.controller.js`
- Services: `services/master/contact.service.js`
- Models: `models/master/contact.model.js`

**Features:**
- Party, Supplier, and Book contact management
- Balance tracking
- Label assignments

#### 2.4 Other Master Entities
- **Agent**: Sales representatives
- **Area**: Geographic regions
- **Bank**: Bank account details
- **Department**: Item categorization
- **HSN**: Tax codes with GST rates
- **Label**: Pricing labels with discounts
- **Transport**: Logistics companies

---

### 3. Transaction Module

**Responsibilities:**
- Manage business transactions (Challans, Bills, Returns)
- Payment tracking
- Stock updates
- Transaction automation

**Sub-modules:**

#### 3.1 Challan Management
**Key Files:**
- Routes: `routers/transaction/challan.routes.js`
- Controllers: `controllers/transaction/challan.controller.js`
- Services: `services/transaction/challan.service.js`
- Models: `models/transaction/challan.model.js`

**Features:**
- Sale and purchase challans
- Item-wise calculations
- GST/Non-GST support
- Convert to bill

#### 3.2 Bill Management
**Key Files:**
- Routes: `routers/transaction/bill.routes.js`
- Controllers: `controllers/transaction/bill.controller.js`
- Services: `services/transaction/bill.service.js`
- Models: `models/transaction/bill.model.js`

**Features:**
- Bill generation from challans
- Payment tracking
- Multiple payment entries
- Payment status management

#### 3.3 Return Management
**Key Files:**
- Routes: `routers/transaction/return.routes.js`
- Controllers: `controllers/transaction/return.controller.js`
- Services: `services/transaction/return.service.js`
- Models: `models/transaction/return.model.js`

**Features:**
- Sale and purchase returns
- Damaged item tracking
- Stock adjustments

#### 3.4 Transaction Management
**Key Files:**
- Routes: `routers/transaction/transaction.routes.js`
- Controllers: `controllers/transaction/transaction.controller.js`
- Services: `services/transaction/transaction.service.js`
- Models: `models/transaction/transaction.model.js`

**Features:**
- Cash/Bank receipts and payments
- Contact balance updates

#### 3.5 Auto Bill
**Key Files:**
- Routes: `routers/transaction/autoBill.routes.js`
- Controllers: `controllers/transaction/autoBill.controller.js`
- Services: `services/transaction/autoBill.service.js`
- Models: `models/transaction/auto_bill.model.js`
- Jobs: `jobs/autoBill.cron.js`

**Features:**
- Automated bill generation rules
- Threshold-based automation
- Scheduled cron job execution

---

### 4. Dashboard Module

**Responsibilities:**
- Aggregate business metrics
- Real-time statistics
- Summary data for UI

**Key Files:**
- Routes: `routers/dashboard/dashboard.routes.js`
- Controllers: `controllers/dashboard/dashboard.controller.js`
- Services: `services/dashboard/dashboard.service.js`

**Features:**
- Sales/purchase summaries
- Outstanding amounts
- Stock alerts
- Recent transactions

---

### 5. Report Module

**Responsibilities:**
- Generate business reports
- Item ledger tracking
- Outstanding reports
- PDF generation and storage

**Key Files:**
- Routes: `routers/report/report.routes.js`, `routers/report/itemLedger.routes.js`, `routers/report/outstanding.routes.js`
- Controllers: `controllers/report/report.controller.js`, `controllers/report/itemLedger.controller.js`, `controllers/report/outstanding.controller.js`
- Services: `services/report/report.service.js`, `services/report/itemLedger.service.js`, `services/report/outstanding.service.js`
- Models: `models/common/report.model.js`

**Features:**
- Item-wise ledger
- Party-wise outstanding
- Custom date range reports
- PDF export to S3

---

### 6. Setup Module

**Responsibilities:**
- Initial system configuration
- Firm setup
- Default data creation

**Key Files:**
- Routes: `routers/setup.routes.js`
- Controllers: `controllers/setup/setup.controller.js`
- Services: `services/setup/setup.service.js`

---

### 7. Backup Module

**Responsibilities:**
- Database backup
- Data export
- Restore functionality

**Key Files:**
- Routes: `routers/backup.routes.js`
- Controllers: `controllers/backup/backup.controller.js`
- Services: `services/backup/backup.service.js`

---

### 8. Subscription Module

**Responsibilities:**
- Subscription management
- Expiry tracking
- Plan activation/extension

**Key Files:**
- Services: `services/subscription/subscription.service.js`
- Models: `models/common/subscription.model.js`
- Jobs: `jobs/subscriptionExpiry.cron.js`

**Features:**
- Demo and paid plans
- Automatic expiry detection
- Subscription history

---

### 9. Inventory Module

**Responsibilities:**
- Stock calculations
- Stock adjustments
- Inventory tracking

**Key Files:**
- Services: `services/inventory/stock.service.js`

**Features:**
- Physical and logical stock
- Stock updates from transactions
- Multi-firm stock isolation

---

### 10. Common Services

**Responsibilities:**
- Shared utilities across modules
- File storage
- External integrations

**Key Files:**
- Services: `services/common/s3.service.js`

**Features:**
- AWS S3 file upload/delete
- Image optimization
- Secure file URLs

---

## Request Flow

### Standard Request Flow

```
Client Request
    ↓
Express App (app.js)
    ↓
CORS Middleware
    ↓
Body Parser Middleware
    ↓
Route Matcher (routers/index.js)
    ↓
Module Router (e.g., routers/master/item.routes.js)
    ↓
Authentication Middleware (middlewares/auth.middleware.js)
    ├─ Verify JWT Token
    ├─ Check Session
    ├─ Load User
    └─ Set req.user, req.role, req.isGst
    ↓
Route-specific Middleware (e.g., multer for file upload)
    ↓
Controller (e.g., controllers/master/item.controller.js)
    ├─ Extract request data
    ├─ Call service method
    └─ Wrap in asyncHandler
    ↓
Service (e.g., services/master/item.service.js)
    ├─ Business logic validation
    ├─ Data transformation
    ├─ Call helper functions
    ├─ Database operations via Models
    └─ Return processed data
    ↓
Model (e.g., models/master/item.model.js)
    ├─ Mongoose schema validation
    ├─ Database query execution
    ├─ Pre/post hooks
    └─ Return data
    ↓
Service (return to controller)
    ↓
Controller
    ├─ Format response using ApiResponse
    └─ Send HTTP response
    ↓
Client Response
```

### Error Handling Flow

```
Error Thrown (anywhere in chain)
    ↓
asyncHandler catches Promise rejection
    ↓
Pass to next(error)
    ↓
Error Middleware (middlewares/error.middleware.js)
    ├─ Identify error type
    ├─ Transform to ApiError
    ├─ Format error response
    └─ Send error response with status code
    ↓
Client receives error
```

---

## Middleware Stack

### 1. Authentication Middleware

**File:** `middlewares/auth.middleware.js`

**Functions:**
- `auth` - Verifies JWT token and loads user
- `requireAdmin` - Ensures admin role
- `requireFirm` - Ensures firm role

**Flow:**
1. Extract Bearer token from Authorization header
2. Verify JWT signature
3. Check session exists and is active
4. Load user from database
5. Attach user, role, firmType to request object
6. Update session last_active timestamp

### 2. Error Middleware

**File:** `middlewares/error.middleware.js`

**Functions:**
- `errorHandler` - Global error handler
- `notFoundHandler` - 404 handler

**Features:**
- Mongoose error transformation
- Duplicate key error handling
- Validation error formatting
- JWT error handling
- Stack trace in development mode

### 3. File Upload Middleware

**Library:** Multer

**Usage:**
- Memory storage for S3 upload
- File size limits (2MB for signatures, 5MB for items)
- MIME type validation
- Single/multiple file support

---

## Utilities

### 1. ApiError

**File:** `utils/ApiError.js`

**Purpose:** Standardized error class with HTTP status codes

**Methods:**
- `badRequest(message, errors)` - 400
- `unauthorized(message)` - 401
- `forbidden(message)` - 403
- `notFound(message)` - 404
- `conflict(message)` - 409
- `internal(message)` - 500

### 2. ApiResponse

**File:** `utils/ApiResponse.js`

**Purpose:** Standardized success response format

**Structure:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Success message",
  "data": { ... }
}
```

### 3. asyncHandler

**File:** `utils/asyncHandler.js`

**Purpose:** Wraps async route handlers to catch errors

**Usage:**
```javascript
asyncHandler(async (req, res) => {
  // async code
})
```

### 4. Pagination

**File:** `utils/pagination.js`

**Purpose:** Standardized pagination for list endpoints

**Features:**
- Page and limit parameters
- Total count
- Metadata (totalPages, currentPage, etc.)

### 5. Validation

**File:** `utils/validate.js`

**Purpose:** Request body validation

**Features:**
- Schema-based validation
- Type checking
- Required field validation
- Partial validation support

---

## Helpers

### 1. Counter Helper

**File:** `helpers/counter.js`

**Purpose:** Auto-increment ID generation per user per model

**Function:**
- `getNextId(modelName, userId)` - Returns next sequential ID

### 2. Identifier Generator

**File:** `helpers/identifierGenerator.js`

**Purpose:** Generate unique identifiers

**Functions:**
- `generateUniqueBarcode()` - 10-character alphanumeric barcode
- `generateUniqueItemId(userId)` - Sequential item ID
- `isValidBarcodeFormat(barcode)` - Barcode validation

---

## Cron Jobs

### 1. Subscription Expiry Job

**File:** `jobs/subscriptionExpiry.cron.js`

**Schedule:** Daily at 00:00 (Asia/Kolkata timezone)

**Tasks:**
- Mark expired subscriptions
- Identify subscriptions expiring today
- Log results

### 2. Auto Bill Job

**File:** `jobs/autoBill.cron.js`

**Schedule:** Daily at 00:00 (Asia/Kolkata timezone)

**Tasks:**
- Check active automation rules
- Count eligible challans per party
- Generate bills when threshold is met
- Handle GST/Non-GST separation
- Log results and errors

---

## Configuration

### 1. Database Config

**File:** `config/database.js`

**Purpose:** MongoDB connection setup

**Features:**
- Connection pooling
- Retry logic
- Error handling

### 2. Environment Config

**File:** `config/env.js`

**Purpose:** Environment variable management

**Variables:**
- `PORT` - Server port
- `MONGODB_URI` - Database connection string
- `JWT_SECRET` - JWT signing key
- `JWT_EXPIRES_IN` - Token expiration
- `CORS_ORIGIN` - Allowed origins
- `AWS_*` - S3 credentials
- `MODE` - development/production

### 3. S3 Config

**File:** `config/s3.js`

**Purpose:** AWS S3 client configuration

**Features:**
- Bucket configuration
- Region setup
- Credentials management

---

## Data Flow Patterns

### 1. Multi-Tenancy

**Pattern:** User-based data isolation

**Implementation:**
- All models have `user_id` field
- All queries filter by `user_id`
- Middleware attaches `req.user._id`
- Services use `userId` parameter

### 2. Dual Firm Support

**Pattern:** GST and Non-GST firm separation

**Implementation:**
- User model has `gst_firm` and `nongst_firm` sub-documents
- Session stores `firm_type`
- Middleware sets `req.isGst` (0 or 1)
- Transactions tagged with `is_gst` field
- Stock calculations differ by firm type

### 3. Session Management

**Pattern:** Multi-device session tracking

**Implementation:**
- JWT tokens stored in Session collection
- Each login creates new session
- Sessions track device info and IP
- Logout deletes session
- Token verification checks session existence

### 4. Stock Management

**Pattern:** Physical and logical stock separation

**Implementation:**
- `physical_stock` - Actual inventory
- `logical_stock` - Adjustments/reserves
- `stock` - Visible stock (calculated)
- GST firm: stock = physical_stock
- Non-GST firm: stock = physical_stock + logical_stock

### 5. Transaction Linking

**Pattern:** Challan → Bill → Return chain

**Implementation:**
- Challans can be converted to bills
- Bills reference challan IDs
- Returns reference bill or challan
- Stock updates propagate through chain

---

## Security Features

### 1. Authentication
- JWT-based stateless authentication
- Session validation on each request
- Token expiration
- Password hashing with bcrypt

### 2. Authorization
- Role-based access (admin/firm)
- Firm-type based access (GST/Non-GST)
- User-based data isolation

### 3. Input Validation
- Request body validation
- Type checking
- SQL injection prevention (Mongoose)
- XSS prevention (sanitization)

### 4. Error Handling
- No sensitive data in error messages
- Stack traces only in development
- Consistent error format

---

## Performance Optimizations

### 1. Database
- Compound indexes on frequently queried fields
- Lean queries for read-only operations
- Selective field projection
- Aggregation pipelines for complex queries

### 2. Caching
- Session last_active update is fire-and-forget
- Populated references cached in memory

### 3. File Handling
- Memory storage for immediate S3 upload
- File size limits
- Image compression (handled by S3 service)

---

## API Versioning

**Current Version:** v1

**Base Path:** `/api/v1`

**Strategy:** URL-based versioning

**Future:** New versions will use `/api/v2`, etc.

---

## Deployment Considerations

### 1. Environment Variables
- All sensitive data in environment variables
- `.env` file for local development
- Environment-specific configurations

### 2. Database
- MongoDB Atlas for production
- Connection pooling enabled
- Automatic reconnection

### 3. File Storage
- AWS S3 for production
- Separate buckets per environment
- CDN integration ready

### 4. Logging
- Console logging for development
- Structured logging for production
- Error tracking integration ready

### 5. Monitoring
- Health check endpoint at `/`
- Uptime tracking
- Cron job execution logs

---

## Testing Strategy

### Current State
- Manual testing via Postman
- Postman collection available: `mm.postman_collection.json`
- Environment file: `mm.postman_environment.json`

### Recommended
- Unit tests for services
- Integration tests for API endpoints
- E2E tests for critical flows
- Load testing for performance

---

## Future Enhancements

### 1. Scalability
- Microservices migration for high-load modules
- Redis caching layer
- Message queue for async operations
- Database sharding

### 2. Features
- Real-time notifications (WebSocket)
- Advanced analytics
- Multi-language support
- Mobile app API optimization

### 3. DevOps
- CI/CD pipeline
- Automated testing
- Container orchestration (Kubernetes)
- Blue-green deployment

---

## Summary

The backend follows a **clean, layered architecture** with:
- ✅ Clear separation of concerns
- ✅ Modular organization by feature
- ✅ Reusable service layer
- ✅ Centralized error handling
- ✅ JWT-based authentication
- ✅ Multi-tenancy support
- ✅ Dual firm (GST/Non-GST) support
- ✅ Automated background jobs
- ✅ File storage integration
- ✅ Comprehensive validation

This architecture provides a solid foundation for a scalable, maintainable inventory and billing management system.
