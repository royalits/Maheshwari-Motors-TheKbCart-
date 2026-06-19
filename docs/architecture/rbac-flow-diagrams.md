# RBAC Flow Diagrams

## 1. Login Flow with Roles

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant AuthService
    participant UserModel
    participant SessionDB
    participant JWT

    Client->>API: POST /auth/login {username, password}
    API->>AuthService: login(username, password)
    
    alt Admin Login
        AuthService->>UserModel: findByAdminCredentials()
        UserModel-->>AuthService: user
        AuthService->>JWT: generateAdminToken()
        JWT-->>AuthService: token (role: admin)
    else Firm Login
        AuthService->>UserModel: findByFirmCredentials()
        UserModel-->>AuthService: {user, firmType, firmRole, contactId}
        AuthService->>JWT: generateFirmToken(firmType, firmRole, contactId)
        JWT-->>AuthService: token (role: firm, firm_role: accountant)
    end
    
    AuthService->>SessionDB: create({user_id, role, firm_role, contact_id})
    SessionDB-->>AuthService: session
    AuthService-->>API: {token, user, role, firm_role}
    API-->>Client: 200 OK {token, user_data}
```

## 2. Request Authorization Flow

```mermaid
sequenceDiagram
    participant Client
    participant AuthMiddleware
    participant PermissionMiddleware
    participant Controller
    participant Service
    participant Database

    Client->>AuthMiddleware: Request with JWT token
    AuthMiddleware->>AuthMiddleware: Verify JWT
    AuthMiddleware->>AuthMiddleware: Check session exists
    AuthMiddleware->>AuthMiddleware: Extract firmRole & contactId
    AuthMiddleware->>AuthMiddleware: Attach to req object
    
    AuthMiddleware->>PermissionMiddleware: next()
    
    alt Has Permission
        PermissionMiddleware->>PermissionMiddleware: Check PERMISSIONS[firmRole][action]
        PermissionMiddleware->>Controller: next()
        Controller->>Service: Execute business logic
        Service->>Database: Query data
        Database-->>Service: Results
        Service-->>Controller: Processed data
        Controller-->>Client: 200 OK {data}
    else No Permission
        PermissionMiddleware-->>Client: 403 Forbidden
    end
```

## 3. Role Permission Matrix

```mermaid
graph TD
    A[User Login] --> B{Role Type}
    
    B -->|Admin| C[Full Access]
    B -->|Accountant| D[Create + Read]
    B -->|Salesman| E[Read Reports Only]
    B -->|Client| F[Read Own Data Only]
    
    C --> C1[Create ✅]
    C --> C2[Read ✅]
    C --> C3[Update ✅]
    C --> C4[Delete ✅]
    
    D --> D1[Create ✅]
    D --> D2[Read ✅]
    D --> D3[Update ❌]
    D --> D4[Delete ❌]
    
    E --> E1[Create ❌]
    E --> E2[Read ✅ Reports]
    E --> E3[Update ❌]
    E --> E4[Delete ❌]
    
    F --> F1[Create ❌]
    F --> F2[Read ✅ Own Data]
    F --> F3[Update ❌]
    F --> F4[Delete ❌]
```

## 4. Client Data Filtering Flow

```mermaid
sequenceDiagram
    participant Client
    participant AuthMiddleware
    participant ClientFilter
    participant Controller
    participant Service
    participant Database

    Client->>AuthMiddleware: GET /bills (Client role)
    AuthMiddleware->>AuthMiddleware: Extract contactId from JWT
    AuthMiddleware->>ClientFilter: next() with req.contactId
    
    ClientFilter->>ClientFilter: Check if firmRole === "client"
    ClientFilter->>ClientFilter: Set req.clientFilter = {contact_id: contactId}
    ClientFilter->>Controller: next()
    
    Controller->>Controller: Merge req.query with req.clientFilter
    Controller->>Service: getBills(userId, isGst, {contact_id: contactId})
    Service->>Database: find({user_id, is_gst, contact_id})
    Database-->>Service: Bills for this contact only
    Service-->>Controller: Filtered bills
    Controller-->>Client: 200 OK {bills: [own bills only]}
```

## 5. Item View Filtering for Client

```mermaid
sequenceDiagram
    participant Client
    participant Controller
    participant Service
    participant Database

    Client->>Controller: GET /items (Client role)
    Controller->>Service: getItems(userId, query, isGst)
    Service->>Database: find({user_id, is_gst})
    Database-->>Service: All items with full details
    Service-->>Controller: Items array
    
    Controller->>Controller: Check if firmRole === "client"
    
    alt Client Role
        Controller->>Controller: Filter fields: {_id, name, brand, mrp, images, hsn}
        Controller-->>Client: 200 OK {items: [limited fields]}
    else Other Roles
        Controller-->>Client: 200 OK {items: [full details]}
    end
```

## 6. Permission Check Flow

```mermaid
flowchart TD
    A[Request Received] --> B{Check req.role}
    
    B -->|admin| C[Allow All Actions]
    B -->|firm| D{Check req.firmRole}
    
    D -->|admin| C
    D -->|accountant| E{Check Action}
    D -->|salesman| F{Check Action}
    D -->|client| G{Check Action}
    
    E -->|create| H[Allow ✅]
    E -->|read| H
    E -->|update| I[Deny ❌]
    E -->|delete| I
    
    F -->|read| J{Check Resource}
    F -->|create/update/delete| I
    
    J -->|reports| H
    J -->|other| I
    
    G -->|read| K{Check Ownership}
    G -->|create/update/delete| I
    
    K -->|own data| H
    K -->|other data| I
    
    H --> L[Execute Controller]
    I --> M[Return 403 Forbidden]
```

## 7. Database Schema Structure

```mermaid
erDiagram
    USER ||--o{ SESSION : has
    USER {
        ObjectId _id
        string type
        string name
        object gst_firm
        object nongst_firm
        object admin
    }
    
    GST_FIRM {
        string username
        string password
        string role
        ObjectId contact_id
        string name
        string phone
    }
    
    NONGST_FIRM {
        string username
        string password
        string role
        ObjectId contact_id
        string name
        string phone
    }
    
    SESSION {
        ObjectId _id
        ObjectId user_id
        string role
        string firm_type
        string firm_role
        ObjectId contact_id
        string token
    }
    
    CONTACT {
        ObjectId _id
        string name
        string type
        ObjectId user_id
    }
    
    USER ||--|| GST_FIRM : contains
    USER ||--|| NONGST_FIRM : contains
    GST_FIRM ||--o| CONTACT : references
    NONGST_FIRM ||--o| CONTACT : references
```

## 8. JWT Token Structure

```mermaid
graph LR
    A[JWT Token] --> B[Header]
    A --> C[Payload]
    A --> D[Signature]
    
    C --> C1[_id: user_id]
    C --> C2[role: firm]
    C --> C3[firm_type: GST]
    C --> C4[firm_role: accountant]
    C --> C5[contact_id: null]
    C --> C6[user_type: main]
    C --> C7[exp: timestamp]
    
    style C4 fill:#90EE90
    style C5 fill:#90EE90
```

## 9. Role-Based UI Rendering

```mermaid
flowchart TD
    A[Component Renders] --> B{usePermission Hook}
    
    B --> C{can create?}
    B --> D{can update?}
    B --> E{can delete?}
    B --> F{isRole?}
    
    C -->|true| G[Show Create Button]
    C -->|false| H[Hide Create Button]
    
    D -->|true| I[Show Edit Button]
    D -->|false| J[Hide Edit Button]
    
    E -->|true| K[Show Delete Button]
    E -->|false| L[Hide Delete Button]
    
    F -->|admin/accountant/salesman| M[Show Reports Section]
    F -->|client| N[Show Limited View]
```

## 10. Complete RBAC Architecture

```mermaid
graph TB
    subgraph "Frontend Layer"
        A[React Components]
        B[Permission Hooks]
        C[Permission Gates]
        D[Zustand Store]
    end
    
    subgraph "API Layer"
        E[Express Routes]
        F[Auth Middleware]
        G[Permission Middleware]
    end
    
    subgraph "Business Logic Layer"
        H[Controllers]
        I[Services]
    end
    
    subgraph "Data Layer"
        J[User Model]
        K[Session Model]
        L[MongoDB]
    end
    
    A --> B
    B --> D
    A --> C
    C --> D
    
    A --> E
    E --> F
    F --> G
    G --> H
    H --> I
    I --> J
    I --> K
    J --> L
    K --> L
    
    F -.->|JWT Token| D
    D -.->|firmRole, contactId| A
```

## 11. Migration Process Flow

```mermaid
flowchart TD
    A[Start Migration] --> B[Backup Database]
    B --> C[Run Migration Script]
    C --> D[Add role field to gst_firm]
    D --> E[Add role field to nongst_firm]
    E --> F[Add contact_id field to both]
    F --> G[Set default role = admin]
    G --> H[Update existing sessions]
    H --> I[Verify Migration]
    I --> J{All Users Updated?}
    
    J -->|Yes| K[Deploy Backend]
    J -->|No| L[Fix Issues]
    L --> C
    
    K --> M[Test Existing Logins]
    M --> N{Logins Work?}
    
    N -->|Yes| O[Create Test Role Users]
    N -->|No| P[Rollback]
    
    O --> Q[Test Each Role]
    Q --> R{All Roles Work?}
    
    R -->|Yes| S[Deploy Frontend]
    R -->|No| T[Fix Issues]
    T --> O
    
    S --> U[Migration Complete]
```

## 12. Error Handling Flow

```mermaid
sequenceDiagram
    participant Client
    participant Middleware
    participant ErrorHandler

    Client->>Middleware: Request with insufficient permissions
    
    alt No Token
        Middleware->>ErrorHandler: ApiError.unauthorized("No token")
        ErrorHandler-->>Client: 401 Unauthorized
    else Invalid Token
        Middleware->>ErrorHandler: ApiError.unauthorized("Invalid token")
        ErrorHandler-->>Client: 401 Unauthorized
    else No Permission
        Middleware->>ErrorHandler: ApiError.forbidden("No permission")
        ErrorHandler-->>Client: 403 Forbidden
    else Client Access Violation
        Middleware->>ErrorHandler: ApiError.forbidden("Own data only")
        ErrorHandler-->>Client: 403 Forbidden
    end
```

## Summary

These diagrams illustrate:

1. **Login Flow**: How roles are extracted and tokens generated
2. **Authorization Flow**: How permissions are checked on each request
3. **Permission Matrix**: Visual representation of role capabilities
4. **Client Filtering**: How client data is isolated
5. **Item Filtering**: How clients see limited item data
6. **Permission Checks**: Decision tree for access control
7. **Database Schema**: How roles are stored
8. **JWT Structure**: What's inside the token
9. **UI Rendering**: How frontend uses permissions
10. **Complete Architecture**: Full system overview
11. **Migration Process**: Step-by-step migration flow
12. **Error Handling**: How errors are processed

All flows are optimized for performance with zero additional database queries during authorization checks.
