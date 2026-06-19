# RBAC Quick Reference Card

## Role Permissions Matrix

| Feature | Admin | Accountant | Salesman | Client |
|---------|-------|------------|----------|--------|
| **Items** |
| View Items | ✅ | ✅ | ❌ | ✅ (MRP only) |
| Create Item | ✅ | ✅ | ❌ | ❌ |
| Update Item | ✅ | ❌ | ❌ | ❌ |
| Delete Item | ✅ | ❌ | ❌ | ❌ |
| **Challans** |
| View Challans | ✅ | ✅ | ❌ | ❌ |
| Create Challan | ✅ | ✅ | ❌ | ❌ |
| Update Challan | ✅ | ❌ | ❌ | ❌ |
| Delete Challan | ✅ | ❌ | ❌ | ❌ |
| **Bills** |
| View Bills | ✅ | ✅ | ❌ | ✅ (Own only) |
| Create Bill | ✅ | ✅ | ❌ | ❌ |
| Update Bill | ✅ | ❌ | ❌ | ❌ |
| Delete Bill | ✅ | ❌ | ❌ | ❌ |
| Record Payment | ✅ | ✅ | ❌ | ❌ |
| **Contacts** |
| View Contacts | ✅ | ✅ | ❌ | ❌ |
| Create Contact | ✅ | ✅ | ❌ | ❌ |
| Update Contact | ✅ | ❌ | ❌ | ❌ |
| Delete Contact | ✅ | ❌ | ❌ | ❌ |
| **Reports** |
| Sales Report | ✅ | ✅ | ✅ | ❌ |
| Purchase Report | ✅ | ✅ | ✅ | ❌ |
| Outstanding | ✅ | ✅ | ✅ | ✅ (Own only) |
| Item Ledger | ✅ | ✅ | ✅ | ❌ |
| **Transactions** |
| Cash Receipt | ✅ | ✅ | ❌ | ❌ |
| Bank Receipt | ✅ | ✅ | ❌ | ❌ |
| Cash Payment | ✅ | ✅ | ❌ | ❌ |
| Bank Payment | ✅ | ✅ | ❌ | ❌ |
| **Master Data** |
| Brands | ✅ | ✅ | ❌ | ❌ |
| HSN Codes | ✅ | ✅ | ❌ | ❌ |
| Labels | ✅ | ✅ | ❌ | ❌ |
| Banks | ✅ | ✅ | ❌ | ❌ |
| Agents | ✅ | ✅ | ❌ | ❌ |
| Areas | ✅ | ✅ | ❌ | ❌ |
| Transport | ✅ | ✅ | ❌ | ❌ |

## Role Descriptions

### 👑 Admin (Business Owner)
**Full Access** - Can do everything
- Manage all master data
- Create, edit, delete all transactions
- View all reports
- Manage settings and configurations
- Manage sub-users (future)

### 💼 Accountant (Staff)
**Create & View Only** - Cannot edit or delete
- Add new items, contacts, transactions
- Record cash and bank payments
- View all reports and outstanding
- Cannot modify or delete existing records
- Cannot access settings

### 📊 Salesman (Sales Rep)
**View Reports Only** - Read-only access
- View outstanding reports
- View sales reports
- View purchase reports
- Cannot create, edit, or delete anything
- Cannot access master data

### 👤 Client (Customer)
**Own Data Only** - Limited view access
- View own outstanding only
- View own bills only
- Search items (MRP and images only)
- Cannot see purchase or dealer prices
- Cannot access any other data

## Quick Commands

### Create Accountant User
```javascript
db.users.updateOne(
  { _id: ObjectId("USER_ID") },
  {
    $set: {
      "gst_firm.username": "accountant_username",
      "gst_firm.password": "$2b$10$HASHED_PASSWORD",
      "gst_firm.role": "accountant",
      "gst_firm.contact_id": null
    }
  }
);
```

### Create Salesman User
```javascript
db.users.updateOne(
  { _id: ObjectId("USER_ID") },
  {
    $set: {
      "nongst_firm.username": "salesman_username",
      "nongst_firm.password": "$2b$10$HASHED_PASSWORD",
      "nongst_firm.role": "salesman",
      "nongst_firm.contact_id": null
    }
  }
);
```

### Create Client User
```javascript
// First get contact_id
const contact = db.contacts.findOne({ name: "Client Name", user_id: ObjectId("USER_ID") });

// Then create client login
db.users.updateOne(
  { _id: ObjectId("USER_ID") },
  {
    $set: {
      "gst_firm.username": "client_username",
      "gst_firm.password": "$2b$10$HASHED_PASSWORD",
      "gst_firm.role": "client",
      "gst_firm.contact_id": contact._id
    }
  }
);
```

## API Response Examples

### Admin Login Response
```json
{
  "role": "firm",
  "firm_data": {
    "firm_type": "GST",
    "firm_role": "admin",
    "contact_id": null
  }
}
```

### Accountant Login Response
```json
{
  "role": "firm",
  "firm_data": {
    "firm_type": "GST",
    "firm_role": "accountant",
    "contact_id": null
  }
}
```

### Client Login Response
```json
{
  "role": "firm",
  "firm_data": {
    "firm_type": "GST",
    "firm_role": "client",
    "contact_id": "69c252bd028366323418c2eb"
  }
}
```

## Error Responses

### 403 Forbidden - No Permission
```json
{
  "statusCode": 403,
  "success": false,
  "message": "accountant role does not have update permission"
}
```

### 403 Forbidden - Client Access Violation
```json
{
  "statusCode": 403,
  "success": false,
  "message": "You can only view your own outstanding"
}
```

## Frontend Permission Checks

### Check Permission
```javascript
const { can } = usePermission();

if (can("create")) {
  // Show create button
}

if (can("update")) {
  // Show edit button
}

if (can("delete")) {
  // Show delete button
}
```

### Check Role
```javascript
const { isRole } = usePermission();

if (isRole("admin", "accountant")) {
  // Show payment section
}

if (isRole("salesman")) {
  // Show reports only
}

if (isRole("client")) {
  // Show limited view
}
```

### Permission Gates
```jsx
<PermissionGate action="create">
  <CreateButton />
</PermissionGate>

<PermissionGate action="update">
  <EditButton />
</PermissionGate>

<PermissionGate action="delete">
  <DeleteButton />
</PermissionGate>

<RoleGate roles={["admin", "accountant", "salesman"]}>
  <ReportsSection />
</RoleGate>
```

## Common Use Cases

### Use Case 1: Accountant Adding New Bill
```
✅ Can create new bill
✅ Can add items to bill
✅ Can record payment
❌ Cannot edit existing bill
❌ Cannot delete bill
```

### Use Case 2: Salesman Checking Outstanding
```
✅ Can view outstanding list
✅ Can view customer details
✅ Can view payment history
❌ Cannot create new transactions
❌ Cannot record payments
```

### Use Case 3: Client Viewing Bills
```
✅ Can view own bills only
✅ Can view own outstanding
✅ Can search items (MRP only)
❌ Cannot see other clients' data
❌ Cannot see purchase prices
```

## Troubleshooting

### Issue: User cannot login
**Check:**
1. Username is correct
2. Password is correct
3. User is active (`is_active: true`)
4. Role field exists in firm credentials

### Issue: Permission denied error
**Check:**
1. User has correct role assigned
2. Role has permission for the action
3. JWT token is valid and not expired
4. Session exists in database

### Issue: Client sees all data
**Check:**
1. `contact_id` is set correctly
2. `applyClientFilter` middleware is applied
3. Controller uses `req.clientFilter`
4. Service filters by contact_id

## Migration Checklist

- [ ] Backup database
- [ ] Run migration script
- [ ] Verify all users have role field
- [ ] Test admin login
- [ ] Test firm login
- [ ] Create test accountant user
- [ ] Create test salesman user
- [ ] Create test client user
- [ ] Test all permissions
- [ ] Deploy backend
- [ ] Deploy frontend
- [ ] Update documentation

## Support

For detailed documentation, see:
- `docs/architecture/rbac-implementation-guide.md`
- `docs/architecture/rbac-summary.md`
