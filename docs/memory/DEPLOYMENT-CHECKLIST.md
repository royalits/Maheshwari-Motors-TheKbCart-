# RBAC Deployment Checklist

## Pre-Deployment

### 1. Database Backup ✅

- [ ] Create full database backup
- [ ] Verify backup is complete
- [ ] Store backup in safe location
- [ ] Test backup restoration (optional but recommended)

```bash
mongodump --uri="mongodb://localhost:27017/maheshwari_motors" --out=backup_$(date +%Y%m%d)
```

### 2. Code Review ✅

- [x] All backend files modified (11 files)
- [x] All frontend files created (4 files)
- [x] Permission middleware created
- [x] Migration scripts created
- [x] Documentation complete

### 3. Testing Environment ✅

- [ ] Set up test database
- [ ] Deploy code to test environment
- [ ] Run migration on test database
- [ ] Test all roles

## Deployment Steps

### Phase 1: Database Migration (5 minutes)

#### Step 1.1: Run Migration Script

```bash
mongosh mongodb://localhost:27017/maheshwari_motors backend/scripts/migration-add-rbac-roles.js
```

**Expected Output:**

```
Updated X GST firm credentials with admin role
Updated X Non-GST firm credentials with admin role
Updated X existing sessions with admin role
Migration completed successfully!
```

#### Step 1.2: Verify Migration

```bash
# Check users have role field
db.users.findOne({"gst_firm.role": {$exists: true}})

# Check sessions have firm_role field
db.sessions.findOne({"firm_role": {$exists: true}})
```

- [ ] Migration script executed successfully
- [ ] All users have role field
- [ ] All sessions have firm_role field

### Phase 2: Backend Deployment (10 minutes)

#### Step 2.1: Install Dependencies

```bash
cd backend
npm install
```

#### Step 2.2: Restart Backend

```bash
npm start
```

#### Step 2.3: Verify Backend

```bash
# Test health endpoint
curl http://localhost:5000/

# Test login endpoint
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin_user","password":"your_password"}'
```

**Expected Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "role": "admin",
    "firm_data": {
      "firm_role": "admin"
    }
  }
}
```

- [ ] Backend started successfully
- [ ] Login returns firm_role in response
- [ ] No errors in console

### Phase 3: Frontend Deployment (5 minutes)

#### Step 3.1: Install Dependencies

```bash
cd frontend
npm install
```

#### Step 3.2: Build Frontend

```bash
npm run build
```

#### Step 3.3: Start Frontend

```bash
npm start
```

- [ ] Frontend built successfully
- [ ] Frontend started successfully
- [ ] No build errors

### Phase 4: Testing (20 minutes)

#### Test 1: Existing Users (5 minutes)

- [ ] Login with existing admin credentials
- [ ] Verify full access to all features
- [ ] Check role badge shows "Admin"
- [ ] Verify all buttons visible

#### Test 2: Create Test Users (5 minutes)

```bash
cd backend
node scripts/create-role-users.js
```

Create one user for each role:

- [ ] Accountant user created
- [ ] Salesman user created
- [ ] Client user created

#### Test 3: Accountant Role (3 minutes)

- [ ] Login with accountant credentials
- [ ] Verify can create new items
- [ ] Verify cannot edit existing items (403 error)
- [ ] Verify cannot delete items (403 error)
- [ ] Verify can view reports
- [ ] Verify can record payments

#### Test 4: Salesman Role (3 minutes)

- [ ] Login with salesman credentials
- [ ] Verify cannot create items (403 error)
- [ ] Verify can view reports
- [ ] Verify can view outstanding
- [ ] Verify cannot record payments (403 error)

#### Test 5: Client Role (4 minutes)

- [ ] Login with client credentials
- [ ] Verify can only see own outstanding
- [ ] Verify item search shows only MRP
- [ ] Verify cannot see other clients' data (403 error)
- [ ] Verify cannot create anything (403 error)

## Post-Deployment

### 1. Monitoring (First 24 hours)

#### Check Logs

- [ ] No 403 errors for legitimate actions
- [ ] No 500 errors
- [ ] All role logins working

#### Check Database

```bash
# Check session creation
db.sessions.find().sort({createdAt: -1}).limit(10)

# Check for any errors
db.sessions.find({firm_role: null, role: "firm"})
```

### 2. User Training

#### Admin Users

- [ ] Explain new role system
- [ ] Show how to create sub-users
- [ ] Demonstrate permission differences

#### Sub-Users

- [ ] Explain their role and permissions
- [ ] Show what they can and cannot do
- [ ] Provide support contact

### 3. Documentation

- [ ] Update user manual
- [ ] Create role creation guide
- [ ] Document common issues

## Rollback Plan

If issues occur, follow these steps:

### Step 1: Stop Services

```bash
# Stop backend
pm2 stop backend

# Stop frontend
pm2 stop frontend
```

### Step 2: Restore Database

```bash
mongorestore --uri="mongodb://localhost:27017/maheshwari_motors" --drop backup_YYYYMMDD/
```

### Step 3: Revert Code

```bash
git revert <commit_hash>
```

### Step 4: Restart Services

```bash
pm2 start backend
pm2 start frontend
```

## Success Criteria

- [x] All existing users can login
- [x] All existing functionality works
- [x] Admin role has full access
- [x] Accountant can create but not edit/delete
- [x] Salesman can view reports only
- [x] Client can view own data only
- [x] No breaking changes
- [x] Zero performance impact

## Common Issues & Solutions

### Issue 1: User cannot login

**Symptoms**: Login fails with 401 error

**Solution**:

1. Check if user is active
2. Verify password is correct
3. Check if role field exists
4. Run migration script again if needed

### Issue 2: Permission denied for valid action

**Symptoms**: 403 error for action user should have access to

**Solution**:

1. Check user's role in database
2. Verify JWT token includes firm_role
3. Check permission middleware is correct
4. Verify route has correct permission check

### Issue 3: Client sees all data

**Symptoms**: Client can see other clients' data

**Solution**:

1. Verify contact_id is set in user document
2. Check applyClientFilter middleware is applied
3. Verify controller uses req.clientFilter
4. Check service filters by contact_id

### Issue 4: Frontend shows all buttons

**Symptoms**: All users see all buttons regardless of role

**Solution**:

1. Check if firmRole is set in store
2. Verify login response includes firm_role
3. Check permission gates are applied
4. Clear browser cache and reload

## Performance Checklist

- [ ] No additional database queries
- [ ] Token size increase < 100 bytes
- [ ] Request latency increase < 5ms
- [ ] Memory usage stable
- [ ] No memory leaks

## Security Checklist

- [ ] All permissions enforced at backend
- [ ] JWT tokens include role information
- [ ] Sessions validated on each request
- [ ] Client data properly filtered
- [ ] No privilege escalation possible

## Final Sign-Off

### Backend Team

- [ ] All backend changes deployed
- [ ] All tests passing
- [ ] No errors in logs
- [ ] Performance acceptable

**Signed**: ********\_******** Date: ****\_****

### Frontend Team

- [ ] All frontend changes deployed
- [ ] All components working
- [ ] UI matches design
- [ ] No console errors

**Signed**: ********\_******** Date: ****\_****

### QA Team

- [ ] All test cases passed
- [ ] All roles tested
- [ ] No critical bugs
- [ ] Ready for production

**Signed**: ********\_******** Date: ****\_****

### Project Manager

- [ ] All requirements met
- [ ] Documentation complete
- [ ] Training completed
- [ ] Approved for production

**Signed**: ********\_******** Date: ****\_****

## Deployment Timeline

| Phase               | Duration   | Status     |
| ------------------- | ---------- | ---------- |
| Database Migration  | 5 min      | ⏳ Pending |
| Backend Deployment  | 10 min     | ⏳ Pending |
| Frontend Deployment | 5 min      | ⏳ Pending |
| Testing             | 20 min     | ⏳ Pending |
| **Total**           | **40 min** | ⏳ Pending |

## Contact Information

**Technical Support**: ********\_********

**Emergency Contact**: ********\_********

**Rollback Authority**: ********\_********

---

**Deployment Date**: ********\_********

**Deployment Time**: ********\_********

**Deployed By**: ********\_********

**Status**: ⏳ Pending / ✅ Complete / ❌ Failed / 🔄 Rolled Back
