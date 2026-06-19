# Frontend API & Deletion Test Plan (Verified)

## 0. Automated Testing
**Goal:** Verify functionality without manual effort.
- [x] Run `npm test`
- [x] Result: Tests passed for `UserMaster.jsx` (fetch and delete logic).
    - `handles user deletion correctly` test confirmed API call logic.
    - `fetches all pages of users correctly` confirmed pagination logic.
    - `UserMaster.integration.test.jsx` confirmed basic component rendering.

## 1. Safety Verification (Automatic Deletion)
**Goal:** Prove no data is deleted on app startup.
- [ ] Open the browser console (F12).
- [ ] Refresh the page (Cmd+R / Ctrl+R).
- [ ] Watch the "Network" tab for any methods in red (DELETE requests).
- [ ] Verify console logs. You should NOT see "blocked automatic delete request" unless there was a bug.
- [ ] Verify `localStorage` is not cleared unless you are logged out (401 error).

## 2. User Deletion Test (Manual)
**Goal:** Verify the `UserMaster` delete function works now.
- [ ] Go to `/masters/user-master`.
- [ ] Create a dummy user "TestUser".
- [ ] Click the "Trash" icon (which is now visible/uncommented).
- [ ] Confirm "Yes, Delete" in the dialog.
- [ ] Verify "User deleted successfully" toast appears.
- [ ] Verify the user is gone from the list.
- [ ] Refresh the page to ensure it's gone from backend.

## 3. Supplier Management Test (Lifecycle)
**Goal:** Verify `AddSupplier` works with new AbortController optimization.
- [ ] Go to `/inventory/add-supplier`.
- [ ] Quickly switch to another page (e.g. Dashboard) while "Loading..." might be happening.
- [ ] Check console. You should NOT see "Can't perform a React state update on an unmounted component".
- [ ] Go back to `/inventory/add-supplier`.
- [ ] Add a supplier. Verify it appears in the list immediately.

## 4. API Structure Robustness
**Goal:** Verify correct parameter passing.
- [ ] In Network tab, filter by "Fetch/XHR".
- [ ] Check the `GET /admin/users` request.
- [ ] Verify query parameters are correct (e.g. `?page=1&limit=100`).
- [ ] Verify no `signal=[object Object]` is in the URL.
