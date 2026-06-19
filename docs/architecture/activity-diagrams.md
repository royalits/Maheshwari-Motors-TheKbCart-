# Activity Diagrams

## Overview

This document contains detailed activity diagrams for all critical business workflows in the Maheshwari Motors inventory and billing management system.

---

## 1. User Onboarding Flow

```mermaid
flowchart TD
    A[Start: New User Registration] --> B[Admin registers main user]
    B --> C{Main user exists?}
    C -->|Yes| D[Reject: Only one main user allowed]
    C -->|No| E[Validate user data]
    E --> F{Data valid?}
    F -->|No| G[Show validation errors]
    G --> B
    F -->|Yes| H[Hash passwords]
    H --> I[Create user document]
    I --> J[Generate admin JWT token]
    J --> K[Create admin session]
    K --> L[Create book contacts]
    L --> M[CASHBOOK contact]
    L --> N[BANKBOOK contact]
    M --> O[Store in database]
    N --> O
    O --> P[Return token and user data]
    P --> Q[Store token in localStorage]
    Q --> R[Redirect to user master]
    R --> S[End: User onboarded]
    D --> T[End: Registration failed]
    
    style A fill:#e1f5ff
    style S fill:#c8e6c9
    style T fill:#ffcdd2
```

---

## 2. Firm Setup Workflow

```mermaid
flowchart TD
    A[Start: Firm Setup] --> B[User navigates to Firm Master]
    B --> C[Click Add Firm]
    C --> D[Fill GST firm details]
    D --> E[Enter firm name, address, GSTIN]
    E --> F[Add bank accounts]
    F --> G[Fill Non-GST firm details]
    G --> H[Enter firm name, address]
    H --> I[Add bank accounts]
    I --> J[Upload signature optional]
    J --> K{Validate all fields}
    K -->|Invalid| L[Show field errors]
    L --> D
    K -->|Valid| M[Submit form]
    M --> N[Backend validates data]
    N --> O{Validation passed?}
    O -->|No| P[Return validation errors]
    P --> L
    O -->|Yes| Q[Hash passwords]
    Q --> R[Create/Update user document]
    R --> S[Save bank accounts]
    S --> T[Upload signature to S3]
    T --> U[Return success]
    U --> V[Show success message]
    V --> W[Redirect to firm list]
    W --> X[End: Firm configured]
    
    style A fill:#e1f5ff
    style X fill:#c8e6c9
```

---

## 3. Item Creation and Management

```mermaid
flowchart TD
    A[Start: Add Item] --> B[Navigate to Item Master]
    B --> C[Click Add Item]
    C --> D[Fill item details]
    D --> E[Enter item name, rates]
    E --> F{Upload image?}
    F -->|Yes| G[Select image file]
    F -->|No| H[Continue without image]
    G --> H
    H --> I[Select brand optional]
    I --> J[Select department optional]
    J --> K[Select HSN code optional]
    K --> L{HSN selected?}
    L -->|Yes| M[Enter GST percentage]
    L -->|No| N[Skip GST]
    M --> O[Set initial stock]
    N --> O
    O --> P[Set threshold for alerts]
    P --> Q{Validate form}
    Q -->|Invalid| R[Show errors]
    R --> D
    Q -->|Valid| S[Submit form]
    S --> T[Backend validates]
    T --> U{Barcode provided?}
    U -->|No| V[Generate unique barcode]
    U -->|Yes| W[Validate barcode unique]
    W --> X{Barcode unique?}
    X -->|No| Y[Return error]
    Y --> R
    X -->|Yes| Z[Continue]
    V --> Z
    Z --> AA[Generate item_id]
    AA --> AB{Image uploaded?}
    AB -->|Yes| AC[Upload to S3]
    AB -->|No| AD[Skip upload]
    AC --> AE[Get next counter ID]
    AD --> AE
    AE --> AF[Create item document]
    AF --> AG[Update brand item_ids]
    AG --> AH[Return created item]
    AH --> AI[Show success message]
    AI --> AJ[Navigate to item list]
    AJ --> AK[End: Item created]
    
    style A fill:#e1f5ff
    style AK fill:#c8e6c9
```

---

## 4. Challan Creation Workflow

```mermaid
flowchart TD
    A[Start: Create Challan] --> B{Challan Type}
    B -->|Sale| C[Select party customer]
    B -->|Purchase| D[Select supplier]
    C --> E[Select label for pricing]
    D --> F[Skip label]
    E --> G[Add items to challan]
    F --> G
    G --> H[Search and select item]
    H --> I[Enter quantity]
    I --> J{Check stock for sale}
    J -->|Insufficient| K[Show stock error]
    K --> H
    J -->|Sufficient| L[Calculate item amount]
    L --> M[Apply discounts]
    M --> N[Calculate GST]
    N --> O[Add item to list]
    O --> P{Add more items?}
    P -->|Yes| H
    P -->|No| Q[Calculate totals]
    Q --> R[Review challan]
    R --> S{Confirm?}
    S -->|No| T[Edit challan]
    T --> H
    S -->|Yes| U[Submit challan]
    U --> V[Backend validates]
    V --> W{Validation passed?}
    W -->|No| X[Return errors]
    X --> T
    W -->|Yes| Y[Generate challan number]
    Y --> Z[Create challan document]
    Z --> AA{Challan type?}
    AA -->|Sale| AB[Decrease stock]
    AA -->|Purchase| AC[Increase stock]
    AB --> AD[Save to database]
    AC --> AD
    AD --> AE[Return challan data]
    AE --> AF[Show success message]
    AF --> AG[Navigate to challan list]
    AG --> AH[End: Challan created]
    
    style A fill:#e1f5ff
    style AH fill:#c8e6c9
```

---

## 5. Bill Generation from Challans

```mermaid
flowchart TD
    A[Start: Convert to Bill] --> B[View challan list]
    B --> C[Filter sale challans]
    C --> D[Select challans]
    D --> E{Multiple challans?}
    E -->|No| F[Select at least one]
    F --> D
    E -->|Yes| G{Same party?}
    G -->|No| H[Show error: Different parties]
    H --> D
    G -->|Yes| I{Same GST type?}
    I -->|No| J[Show error: Mixed GST types]
    J --> D
    I -->|Yes| K{Already converted?}
    K -->|Yes| L[Show error: Already billed]
    L --> D
    K -->|No| M[Click Convert to Bill]
    M --> N[Backend validates challans]
    N --> O{Validation passed?}
    O -->|No| P[Return validation errors]
    P --> H
    O -->|Yes| Q[Calculate total amount]
    Q --> R[Generate bill number]
    R --> S[Create bill document]
    S --> T[Link challan IDs]
    T --> U[Update challans]
    U --> V[Set converted_to_bill = true]
    V --> W[Set bill_id reference]
    W --> X{Skip stock calculation?}
    X -->|No| Y[Adjust stock if needed]
    X -->|Yes| Z[Skip stock update]
    Y --> AA[Save bill to database]
    Z --> AA
    AA --> AB[Return bill data]
    AB --> AC[Show success message]
    AC --> AD[Navigate to bill list]
    AD --> AE[End: Bill created]
    
    style A fill:#e1f5ff
    style AE fill:#c8e6c9
```

---

## 6. Payment Recording Workflow

```mermaid
flowchart TD
    A[Start: Record Payment] --> B[Open bill details]
    B --> C[View outstanding amount]
    C --> D[Click Add Payment]
    D --> E[Enter payment amount]
    E --> F{Payment type?}
    F -->|Cash| G[Select cash payment]
    F -->|Bank| H[Select bank account]
    G --> I[Enter reference optional]
    H --> I
    I --> J[Add note optional]
    J --> K{Settled to?}
    K -->|Bill| L[Apply to bill amount]
    K -->|Unsettled Balance| M[Add to contact balance]
    L --> N[Submit payment]
    M --> N
    N --> O[Backend validates]
    O --> P{Amount valid?}
    P -->|No| Q[Show error: Invalid amount]
    Q --> E
    P -->|Yes| R[Create payment entry]
    R --> S[Add to bill.payment_entries]
    S --> T[Calculate new paid_amount]
    T --> U{paid_amount >= bill.amount?}
    U -->|Yes| V[Set status = paid]
    U -->|No| W{paid_amount > bill.amount?}
    W -->|Yes| X[Set status = overpaid]
    W -->|No| Y[Set status = due]
    V --> Z[Update bill]
    X --> Z
    Y --> Z
    Z --> AA[Update contact balance]
    AA --> AB[balance -= payment_amount]
    AB --> AC[Save to database]
    AC --> AD[Return updated bill]
    AD --> AE[Show success message]
    AE --> AF[Refresh bill details]
    AF --> AG[End: Payment recorded]
    
    style A fill:#e1f5ff
    style AG fill:#c8e6c9
```

---

## 7. Stock Alert Monitoring

```mermaid
flowchart TD
    A[Start: Check Stock Alerts] --> B[Navigate to Stock Alerts]
    B --> C[System queries items]
    C --> D{Firm type?}
    D -->|GST| E[Calculate: stock = physical_stock]
    D -->|Non-GST| F[Calculate: stock = physical + logical]
    E --> G[Filter items]
    F --> G
    G --> H{Stock conditions}
    H -->|stock <= 0| I[Add to alert list]
    H -->|stock <= threshold| I
    H -->|stock > threshold| J[Skip item]
    I --> K[Sort by stock ASC]
    J --> L{More items?}
    K --> L
    L -->|Yes| C
    L -->|No| M[Display alert list]
    M --> N[Show item details]
    N --> O[Show current stock]
    O --> P[Show threshold]
    P --> Q{User action?}
    Q -->|Update Stock| R[Navigate to item update]
    Q -->|View Details| S[Open item details]
    Q -->|Ignore| T[Continue monitoring]
    R --> U[Update stock quantity]
    S --> U
    U --> V[Save changes]
    V --> W[Refresh alert list]
    T --> X[End: Monitoring active]
    W --> X
    
    style A fill:#e1f5ff
    style X fill:#c8e6c9
```

---

## 8. Auto Bill Generation (Automation)

```mermaid
flowchart TD
    A[Start: Cron Job Trigger] --> B[Daily at 00:00 IST]
    B --> C[Fetch active automation rules]
    C --> D{Rules found?}
    D -->|No| E[Log: No active rules]
    E --> F[End: Job complete]
    D -->|Yes| G[For each rule]
    G --> H{Rule enabled?}
    H -->|No| I[Skip rule]
    H -->|Yes| J[Get threshold value]
    J --> K{Valid threshold?}
    K -->|No| I
    K -->|Yes| L[Fetch party contact]
    L --> M{Contact found?}
    M -->|No| I
    M -->|Yes| N[Query eligible challans]
    N --> O[Filter: sale, not converted]
    O --> P[Sort by date ASC]
    P --> Q[Limit by threshold]
    Q --> R{Challan count >= threshold?}
    R -->|No| I
    R -->|Yes| S{All same GST type?}
    S -->|No| T[Log: Mixed GST types]
    T --> I
    S -->|Yes| U[Create bill]
    U --> V[Generate bill number]
    V --> W[Link challans]
    W --> X[Update challans]
    X --> Y[Set converted_to_bill = true]
    Y --> Z[Save bill]
    Z --> AA[Log: Bill created]
    AA --> AB{More rules?}
    I --> AB
    AB -->|Yes| G
    AB -->|No| AC[Log summary]
    AC --> AD[Bills created count]
    AD --> AE[Rules skipped count]
    AE --> F
    
    style A fill:#e1f5ff
    style F fill:#c8e6c9
```

---

## 9. Subscription Expiry Check

```mermaid
flowchart TD
    A[Start: Cron Job Trigger] --> B[Daily at 00:00 IST]
    B --> C[Query active subscriptions]
    C --> D{Subscriptions found?}
    D -->|No| E[Log: No subscriptions]
    E --> F[End: Job complete]
    D -->|Yes| G[For each subscription]
    G --> H{expiry_date < today?}
    H -->|No| I[Check if expiring today]
    H -->|Yes| J[Mark as expired]
    J --> K[Update status = expired]
    K --> L[Fetch user]
    L --> M[Set user.is_active = false]
    M --> N[Save to database]
    N --> O[Log: Subscription expired]
    O --> P{More subscriptions?}
    I --> Q{expiry_date = today?}
    Q -->|Yes| R[Add to expiring list]
    Q -->|No| P
    R --> S[Populate user details]
    S --> T[Log: Expiring today]
    T --> P
    P -->|Yes| G
    P -->|No| U[Generate summary]
    U --> V[Count expired]
    V --> W[Count expiring today]
    W --> X[Log summary]
    X --> F
    
    style A fill:#e1f5ff
    style F fill:#c8e6c9
```

---

## 10. Report Generation Workflow

```mermaid
flowchart TD
    A[Start: Generate Report] --> B[Select report type]
    B --> C{Report Type}
    C -->|Sales| D[Set sales parameters]
    C -->|Purchase| E[Set purchase parameters]
    C -->|GST| F[Set GST parameters]
    C -->|Item Ledger| G[Set item parameters]
    D --> H[Select date range]
    E --> H
    F --> H
    G --> H
    H --> I[Select filters optional]
    I --> J[Click Generate]
    J --> K[Backend queries data]
    K --> L{Report Type}
    L -->|Sales| M[Query bills]
    L -->|Purchase| N[Query purchase challans]
    L -->|GST| O[Query GST transactions]
    L -->|Item Ledger| P[Query item movements]
    M --> Q[Calculate totals]
    N --> Q
    O --> Q
    P --> Q
    Q --> R[Group by categories]
    R --> S[Format report data]
    S --> T[Generate PDF]
    T --> U[Create PDF document]
    U --> V[Add headers, tables]
    V --> W[Add charts optional]
    W --> X[Upload to S3]
    X --> Y[Get PDF URL]
    Y --> Z[Save report metadata]
    Z --> AA[Store in database]
    AA --> AB[Return PDF link]
    AB --> AC[Open PDF in new tab]
    AC --> AD{User action?}
    AD -->|Download| AE[Download PDF]
    AD -->|Print| AF[Print PDF]
    AD -->|Close| AG[Close preview]
    AE --> AH[End: Report generated]
    AF --> AH
    AG --> AH
    
    style A fill:#e1f5ff
    style AH fill:#c8e6c9
```

---

## 11. Return Processing Workflow

```mermaid
flowchart TD
    A[Start: Process Return] --> B{Return Type}
    B -->|Sale Return| C[Select bill/challan]
    B -->|Purchase Return| D[Select purchase challan]
    C --> E[View items in bill]
    D --> E
    E --> F[Select items to return]
    F --> G[Enter return quantity]
    G --> H{Quantity valid?}
    H -->|No| I[Show error: Exceeds original]
    I --> G
    H -->|Yes| J[Enter return rate]
    J --> K{Item damaged?}
    K -->|Yes| L[Mark as damaged]
    K -->|No| M[Mark as good]
    L --> N[Calculate return amount]
    M --> N
    N --> O[Add note optional]
    O --> P{Add more items?}
    P -->|Yes| F
    P -->|No| Q[Calculate total return]
    Q --> R[Review return]
    R --> S{Confirm?}
    S -->|No| T[Edit return]
    T --> F
    S -->|Yes| U[Submit return]
    U --> V[Backend validates]
    V --> W{Validation passed?}
    W -->|No| X[Return errors]
    X --> T
    W -->|Yes| Y[Generate return number]
    Y --> Z[Create return document]
    Z --> AA{Return Type}
    AA -->|Sale Return| AB{Item damaged?}
    AA -->|Purchase Return| AC{Item damaged?}
    AB -->|No| AD[Increase stock]
    AB -->|Yes| AE[Don't update stock]
    AC -->|No| AF[Decrease stock]
    AC -->|Yes| AG[Don't update stock]
    AD --> AH[Update contact balance]
    AE --> AH
    AF --> AH
    AG --> AH
    AH --> AI[Save to database]
    AI --> AJ[Return success]
    AJ --> AK[Show success message]
    AK --> AL[Navigate to return list]
    AL --> AM[End: Return processed]
    
    style A fill:#e1f5ff
    style AM fill:#c8e6c9
```

---

## 12. Transaction Recording Workflow

```mermaid
flowchart TD
    A[Start: Record Transaction] --> B{Transaction Type}
    B -->|Receipt| C[Select receipt type]
    B -->|Payment| D[Select payment type]
    C --> E{Receipt Method}
    E -->|Cash| F[Cash received]
    E -->|Bank| G[Bank transfer received]
    D --> H{Payment Method}
    H -->|Cash| I[Cash payment]
    H -->|Bank| J[Bank transfer payment]
    F --> K[Select contact optional]
    G --> L[Select bank account]
    I --> K
    J --> L
    L --> K
    K --> M[Enter amount]
    M --> N[Enter reference number]
    N --> O[Add remarks optional]
    O --> P[Select date]
    P --> Q{Validate form}
    Q -->|Invalid| R[Show errors]
    R --> M
    Q -->|Valid| S[Submit transaction]
    S --> T[Backend validates]
    T --> U{Validation passed?}
    U -->|No| V[Return errors]
    V --> R
    U -->|Yes| W[Generate transaction number]
    W --> X[Create transaction document]
    X --> Y{Contact selected?}
    Y -->|Yes| Z[Update contact balance]
    Y -->|No| AA[Skip balance update]
    Z --> AB{Transaction Type}
    AB -->|Receipt| AC[balance -= amount]
    AB -->|Payment| AD[balance += amount]
    AC --> AE[Save to database]
    AD --> AE
    AA --> AE
    AE --> AF[Return transaction data]
    AF --> AG[Show success message]
    AG --> AH[Navigate to transaction list]
    AH --> AI[End: Transaction recorded]
    
    style A fill:#e1f5ff
    style AI fill:#c8e6c9
```

---

## 13. Batch Item Update Workflow

```mermaid
flowchart TD
    A[Start: Batch Update] --> B[Navigate to Item Master]
    B --> C[Select multiple items]
    C --> D{Items selected?}
    D -->|No| E[Show error: Select items]
    E --> C
    D -->|Yes| F[Click Batch Update]
    F --> G[Show batch edit form]
    G --> H{Update Type}
    H -->|Price| I[Enter new prices]
    H -->|Stock| J[Enter new stock]
    H -->|Discount| K[Enter new discount]
    H -->|Multiple| L[Update multiple fields]
    I --> M[Apply to all selected]
    J --> M
    K --> M
    L --> M
    M --> N{Validate changes}
    N -->|Invalid| O[Show validation errors]
    O --> G
    N -->|Valid| P[Submit batch update]
    P --> Q[Backend processes]
    Q --> R[For each item]
    R --> S{Item exists?}
    S -->|No| T[Add to errors]
    S -->|Yes| U[Validate changes]
    U --> V{Changes valid?}
    V -->|No| T
    V -->|Yes| W[Update item]
    W --> X[Add to results]
    X --> Y{More items?}
    T --> Y
    Y -->|Yes| R
    Y -->|No| Z[Build response]
    Z --> AA{Any errors?}
    AA -->|Yes| AB[Return 207 Partial Success]
    AA -->|No| AC[Return 200 Success]
    AB --> AD[Show results summary]
    AC --> AD
    AD --> AE[Display updated count]
    AE --> AF[Display failed count]
    AF --> AG[Show error details]
    AG --> AH[Refresh item list]
    AH --> AI[End: Batch update complete]
    
    style A fill:#e1f5ff
    style AI fill:#c8e6c9
```

---

## 14. Outstanding Calculation Workflow

```mermaid
flowchart TD
    A[Start: Calculate Outstanding] --> B[Navigate to Outstandings]
    B --> C[System queries unpaid bills]
    C --> D{Firm type?}
    D -->|GST| E[Filter is_gst = 1]
    D -->|Non-GST| F[Filter is_gst = 0]
    E --> G[Query bills]
    F --> G
    G --> H[Filter payment_status != paid]
    H --> I[Group by contact_id]
    I --> J[For each contact]
    J --> K[Sum bill amounts]
    K --> L[Sum paid amounts]
    L --> M[Calculate balance]
    M --> N[balance = amount - paid_amount]
    N --> O[Fetch contact details]
    O --> P[Add to outstanding list]
    P --> Q{More contacts?}
    Q -->|Yes| J
    Q -->|No| R[Sort by balance DESC]
    R --> S[Calculate total outstanding]
    S --> T[Display outstanding report]
    T --> U{User action?}
    U -->|View Details| V[Show contact bills]
    U -->|Record Payment| W[Navigate to payment]
    U -->|Export| X[Generate PDF report]
    V --> Y[End: Outstanding viewed]
    W --> Y
    X --> Y
    
    style A fill:#e1f5ff
    style Y fill:#c8e6c9
```

---

## 15. Firm Context Switching

```mermaid
flowchart TD
    A[Start: Switch Firm] --> B[User clicks firm dropdown]
    B --> C[Display available firms]
    C --> D{Firms available?}
    D -->|No| E[Show error: No firms]
    E --> F[End: Cannot switch]
    D -->|Yes| G[Show GST firm]
    G --> H[Show Non-GST firm]
    H --> I[User selects firm]
    I --> J{Same as current?}
    J -->|Yes| K[No action needed]
    K --> L[End: No change]
    J -->|No| M[Update Zustand store]
    M --> N[setFirm selectedFirm]
    N --> O[Update firm_type]
    O --> P{Firm Type}
    P -->|GST| Q[Set isGst = 1]
    P -->|Non-GST| R[Set isGst = 0]
    Q --> S[Update UI theme]
    R --> S
    S --> T[Invalidate React Query cache]
    T --> U[Clear all cached data]
    U --> V[Components re-render]
    V --> W[Fetch firm-specific data]
    W --> X[API includes firm context]
    X --> Y[Backend filters by is_gst]
    Y --> Z[Return firm data]
    Z --> AA[Update UI]
    AA --> AB[Show firm-specific content]
    AB --> AC[End: Firm switched]
    
    style A fill:#e1f5ff
    style AC fill:#c8e6c9
    style F fill:#ffcdd2
```

---

## 16. Session Expiry Handling

```mermaid
flowchart TD
    A[Start: API Request] --> B[User performs action]
    B --> C[Frontend sends request]
    C --> D[Add JWT token from localStorage]
    D --> E[Backend receives request]
    E --> F[Auth middleware validates]
    F --> G{Token present?}
    G -->|No| H[Return 401 Unauthorized]
    G -->|Yes| I[Verify JWT signature]
    I --> J{Valid signature?}
    J -->|No| H
    J -->|Yes| K[Query session by token]
    K --> L{Session exists?}
    L -->|No| H
    L -->|Yes| M[Check session expiry]
    M --> N{Session expired?}
    N -->|Yes| H
    N -->|No| O[Load user from database]
    O --> P{User active?}
    P -->|No| H
    P -->|Yes| Q[Update last_active]
    Q --> R[Continue to controller]
    R --> S[Process request]
    S --> T[Return response]
    T --> U[End: Request successful]
    H --> V[Frontend receives 401]
    V --> W[Remove token from localStorage]
    W --> X[Clear Zustand store]
    X --> Y[Redirect to /login]
    Y --> Z[Show login page]
    Z --> AA[End: Session expired]
    
    style A fill:#e1f5ff
    style U fill:#c8e6c9
    style AA fill:#ffcdd2
```

---

## 17. Data Backup Workflow

```mermaid
flowchart TD
    A[Start: Backup Data] --> B[Navigate to Backup & Restore]
    B --> C[Click Create Backup]
    C --> D[Select backup scope]
    D --> E{Backup Type}
    E -->|Full| F[Backup all collections]
    E -->|Selective| G[Select collections]
    F --> H[Backend processes]
    G --> H
    H --> I[Query user data]
    I --> J[Export to JSON/Excel]
    J --> K{Include files?}
    K -->|Yes| L[Fetch S3 file URLs]
    K -->|No| M[Skip files]
    L --> N[Create backup archive]
    M --> N
    N --> O[Compress data]
    O --> P[Upload to S3]
    P --> Q[Generate download link]
    Q --> R[Save backup metadata]
    R --> S[Return backup info]
    S --> T[Show success message]
    T --> U[Display download link]
    U --> V{User action?}
    V -->|Download| W[Download backup file]
    V -->|Schedule| X[Set auto-backup]
    V -->|Close| Y[End: Backup complete]
    W --> Y
    X --> Y
    
    style A fill:#e1f5ff
    style Y fill:#c8e6c9
```

---

## 18. Error Recovery Workflow

```mermaid
flowchart TD
    A[Start: Error Occurs] --> B{Error Type}
    B -->|Network Error| C[Show connection error]
    B -->|401 Unauthorized| D[Session expired]
    B -->|400 Bad Request| E[Validation error]
    B -->|404 Not Found| F[Resource not found]
    B -->|500 Server Error| G[Server error]
    
    C --> H[Check internet connection]
    H --> I{Connected?}
    I -->|No| J[Show offline message]
    I -->|Yes| K[Retry request]
    K --> L{Success?}
    L -->|Yes| M[Continue operation]
    L -->|No| N[Show retry button]
    
    D --> O[Clear authentication]
    O --> P[Remove token]
    P --> Q[Redirect to login]
    
    E --> R[Parse validation errors]
    R --> S[Display field errors]
    S --> T[User corrects input]
    T --> U[Retry submission]
    
    F --> V[Show not found message]
    V --> W[Navigate back]
    
    G --> X[Log error details]
    X --> Y[Show generic error]
    Y --> Z[Offer retry option]
    
    J --> AA[End: Offline]
    N --> AA
    Q --> AB[End: Re-authenticate]
    U --> AC[End: Retry]
    W --> AC
    Z --> AC
    M --> AD[End: Recovered]
    
    style A fill:#ffcdd2
    style AD fill:#c8e6c9
    style AA fill:#fff9c4
    style AB fill:#fff9c4
    style AC fill:#fff9c4
```

---

## Summary

These activity diagrams illustrate:

✅ **User onboarding** - Registration and firm setup
✅ **Core business workflows** - Item, challan, bill, payment processing
✅ **Automation logic** - Auto-billing and subscription checks
✅ **Stock management** - Alerts and updates
✅ **Reporting** - Report generation and export
✅ **Transaction processing** - Returns and transactions
✅ **Batch operations** - Bulk item updates
✅ **Outstanding management** - Balance calculations
✅ **Firm switching** - Context changes
✅ **Session management** - Expiry handling
✅ **Data backup** - Backup and restore
✅ **Error recovery** - Comprehensive error handling

All workflows demonstrate complete business processes from start to finish with decision points, validations, and error handling.
