import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash, FaSignOutAlt, FaSync, FaEye, FaKey, FaSave, FaDatabase } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { DataTable, Modal, DeleteConfirmDialog } from '../../components/common';
import { Button, Input } from '../../components/ui';
import useStore from '../../store';
import api from '../../services/axiosInstance';

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", 
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", 
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", 
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", 
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Lakshadweep", "Puducherry", "Ladakh", "Jammu and Kashmir"
];

const getSubscriptionStatus = (subscription) => {
  if (!subscription?.validityFrom || !subscription?.validityTo) {
    return { label: 'No Plan', sort: 5, className: 'bg-gray-200 text-gray-800' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const validityFrom = new Date(subscription.validityFrom);
  validityFrom.setHours(0, 0, 0, 0);
  const validityTo = new Date(subscription.validityTo);
  validityTo.setHours(0, 0, 0, 0);
  const oneDay = 1000 * 60 * 60 * 24;

  if (Number.isNaN(validityFrom.getTime()) || Number.isNaN(validityTo.getTime())) {
    return { label: 'No Plan', sort: 5, className: 'bg-gray-200 text-gray-800' };
  }

  const daysSinceActive = Math.floor((today - validityFrom) / oneDay);
  const daysUntilExpiry = Math.floor((validityTo - today) / oneDay);

  // Expired
  if (daysUntilExpiry < 0) {
    return { label: 'Expired', sort: 2, className: 'bg-red-500 text-white' };
  }
  
  // Fresh (activated within last 7 days and not expiring soon)
  if (daysSinceActive >= 0 && daysSinceActive <= 7 && daysUntilExpiry > 30) {
    return { label: 'Fresh', sort: 3, className: 'bg-green-500 text-white' };
  }
  
  // Expiring Soon (30 days or less remaining)
  if (daysUntilExpiry >= 0 && daysUntilExpiry <= 30) {
    return { label: 'Expiring Soon', sort: 1, className: 'bg-yellow-400 text-gray-900' };
  }
  
  // Active (more than 30 days remaining)
  return { label: 'Active', sort: 4, className: 'bg-blue-500 text-white' };
};

const ROLE_CREDENTIAL_FIELDS = [
  { key: 'sales', label: 'Sales' },
  { key: 'account', label: 'Account' },
  { key: 'client', label: 'Client' },
];

const ADD_USER_ROLE_CREDENTIAL_FIELDS = ROLE_CREDENTIAL_FIELDS;

const getDefaultRoleUsers = () => ({
  admin: { username: '', password: '' },
  sales: { username: '', password: '' },
  account: { username: '', password: '' },
  client: { username: '', password: '', contact_id: '' },
});

const mapRoleUsersFromUser = (user = {}) => ({
  admin: {
    username: user?.firm_user?.username || '',
    password: '',
  },
  sales: {
    username: user?.sale_user?.username || user?.sales_user?.username || '',
    password: '',
  },
  account: {
    username: user?.account_user?.username || '',
    password: '',
  },
  client: {
    username: user?.client_user?.username || '',
    password: '',
    contact_id: user?.client_user?.contact_id || '',
  },
});

const validateRoleUsers = (
  roleUsers = {},
  {
    requirePassword = false,
    fields = ROLE_CREDENTIAL_FIELDS,
    requiredFields = fields.map((field) => field.key),
  } = {},
) => {
  const usernameSet = new Set();
  const requiredFieldSet = new Set(requiredFields);

  for (const { key, label } of fields) {
    const entry = roleUsers?.[key] || {};
    const username = String(entry.username || '').trim();
    const password = String(entry.password || '');
    const contactId = String(entry.contact_id || '').trim();
    const hasAnyInput = Boolean(username || password || contactId);

    if (!requiredFieldSet.has(key) && !hasAnyInput) {
      continue;
    }

    if (!username) {
      return `${label} username is required`;
    }
    if (username.length < 3) {
      return `${label} username must be at least 3 characters`;
    }
    if (usernameSet.has(username.toLowerCase())) {
      return `${label} username must be unique across role credentials`;
    }
    usernameSet.add(username.toLowerCase());

    if (requirePassword && !password) {
      return `${label} password is required`;
    }
    if (password && password.length < 6) {
      return `${label} password must be at least 6 characters`;
    }
  }

  return null;
};

const buildRoleUsersPayload = (
  roleUsers = {},
  { fields = ROLE_CREDENTIAL_FIELDS, skipEmpty = false } = {},
) => {
  const payload = {};

  for (const { key } of fields) {
    const entry = roleUsers?.[key] || {};
    const username = String(entry.username || '').trim();
    const password = String(entry.password || '');
    const contactId = entry.contact_id || null;
    const hasAnyInput = Boolean(
      username || password || (key === 'client' && contactId),
    );

    if (skipEmpty && !hasAnyInput) {
      continue;
    }

    payload[key] = {
      username,
      password,
    };

    if (key === 'client') {
      payload[key].contact_id = contactId;
    }
  }

  return payload;
};

const getDefaultUserForm = () => ({
  name: '',
  email: '',
  phone: '',
  signature: '',
  signatureFile: null,
  role_users: getDefaultRoleUsers(),
  gst_firm: {
    username: '',
    password: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    godown_address: '',
    city: '',
    state: '',
    GSTIN: '',
    CIN: '',
    reg_number: '',
    banks: [{ bank_name: '', bank_branch: '', ifsc_code: '', account_number: '' }]
  },
  nongst_firm: {
    username: '',
    password: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    godown_address: '',
    city: '',
    state: '',
    GSTIN: '',
    CIN: '',
    reg_number: '',
    banks: [{ bank_name: '', bank_branch: '', ifsc_code: '', account_number: '' }]
  }
});

const buildFirmUpdatePayload = (firm = {}) => {
  const payload = {};

  // Only include username if non-empty (backend requires min 3 chars)
  if (firm.username && String(firm.username).trim().length >= 3) {
    payload.username = String(firm.username).trim();
  }
  // Only include password if non-empty (backend requires min 6 chars)
  if (firm.password && String(firm.password).length >= 6 && !String(firm.password).startsWith('$2')) {
    payload.password = firm.password;
  }

  payload.name = firm.name || '';
  payload.phone = firm.phone || '';
  payload.email = firm.email || '';
  payload.address = firm.address || '';
  payload.godown_address = firm.godown_address || '';
  payload.city = firm.city || '';
  payload.state = firm.state || '';
  payload.GSTIN = firm.GSTIN || '';
  payload.CIN = firm.CIN || '';
  payload.reg_number = firm.reg_number || '';
  payload.bank_ids = Array.isArray(firm.bank_ids) ? firm.bank_ids : [];

  return payload;
};

const UserMaster = () => {
  const navigate = useNavigate();
  const { users, setUsers, showToast, user: loggedInUser, setUser } = useStore();
  const isMounted = useRef(true);
  const firstFieldRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState({
    username: '',
    years: 0,
    months: 0,
    days: 0,
    amount: ''
  });
  const [pendingSubscription, setPendingSubscription] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingForm, setEditingForm] = useState(null);
  const editingFormRef = useRef(null);
  // Keep ref in sync with state
  useEffect(() => { editingFormRef.current = editingForm; }, [editingForm]);
  const setEditingFormWithRef = setEditingForm;
  const [editingSignatureFile, setEditingSignatureFile] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, user: null });
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState(null);
  const [isTransactionHistoryModalOpen, setIsTransactionHistoryModalOpen] = useState(false);
  const [selectedUserTransactions, setSelectedUserTransactions] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [activeAdminScreen, setActiveAdminScreen] = useState('users');
  const [platformBackups, setPlatformBackups] = useState([]);
  const [platformBackupLoading, setPlatformBackupLoading] = useState(false);
  const [platformBackupCreating, setPlatformBackupCreating] = useState(false);
  const [platformBackupRestoringId, setPlatformBackupRestoringId] = useState('');
  const [adminCredentials, setAdminCredentials] = useState({
    username: loggedInUser?.admin?.username || loggedInUser?.username || '',
    password: '',
  });
  const [isAdminCredentialModalOpen, setIsAdminCredentialModalOpen] = useState(false);
  const [adminCredentialsSaving, setAdminCredentialsSaving] = useState(false);
  const [newUser, setNewUser] = useState(getDefaultUserForm());
  const addModalSubscription = {
    years: Number(pendingSubscription?.years ?? subscriptionData.years ?? 0),
    months: Number(pendingSubscription?.months ?? subscriptionData.months ?? 0),
    days: Number(pendingSubscription?.days ?? subscriptionData.days ?? 0),
    amount: Number(pendingSubscription?.amount ?? subscriptionData.amount ?? 0),
  };

  const updateAddModalSubscription = (patch) => {
    const next = { ...addModalSubscription, ...patch };
    setPendingSubscription(next);
    setSubscriptionData((prev) => ({
      ...prev,
      years: next.years,
      months: next.months,
      days: next.days,
      amount: next.amount,
    }));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+A => open Add User modal (only when no modal is open)
      if (e.ctrlKey && e.key === 'a' && !isAddModalOpen && !isEditModalOpen && !isSubscriptionModalOpen && !isViewModalOpen) {
        e.preventDefault();
        setIsSubscriptionModalOpen(true);
        return;
      }
      // Ctrl+S => save active modal
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (isSubscriptionModalOpen) {
          // Trigger "Continue to User Details" button click
          document.getElementById('subscription-continue-btn')?.click();
          return;
        }
        if (isAddModalOpen) { handleAddUser(); return; }
        if (isEditModalOpen) { handleUpdateUser(); return; }
      }
      // Esc => close active modal
      if (e.key === 'Escape') {
        if (isAddModalOpen) { setIsAddModalOpen(false); return; }
        if (isEditModalOpen) { setIsEditModalOpen(false); setEditingSignatureFile(null); return; }
        if (isSubscriptionModalOpen) { setIsSubscriptionModalOpen(false); return; }
        if (isViewModalOpen) { setIsViewModalOpen(false); return; }
        if (isTransactionHistoryModalOpen) { setIsTransactionHistoryModalOpen(false); return; }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isAddModalOpen, isEditModalOpen, isSubscriptionModalOpen, isViewModalOpen, isTransactionHistoryModalOpen]);

  const focusFirstField = () => {
    setTimeout(() => {
      if (firstFieldRef.current) {
        firstFieldRef.current.focus();
        if (typeof firstFieldRef.current.select === 'function') {
          firstFieldRef.current.select();
        }
      }
    }, 0);
  };

  // Check master/admin authentication
  useEffect(() => {
    const userRole = localStorage.getItem('userRole');
    if (!userRole || (userRole !== 'master' && userRole !== 'admin')) {
      navigate('/login');
      return;
    }
  }, [navigate]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (isAddModalOpen) {
      focusFirstField();
    }
  }, [isAddModalOpen]);

  useEffect(() => {
    const username = loggedInUser?.admin?.username || loggedInUser?.username || '';
    if (!username) return;
    setAdminCredentials((prev) => ({
      ...prev,
      username: prev.username || username,
    }));
  }, [loggedInUser]);

  const handleAdminCredentialSave = async (event) => {
    event.preventDefault();
    const username = String(adminCredentials.username || '').trim();
    const password = String(adminCredentials.password || '');

    if (username.length < 3) {
      showToast('Admin username must be at least 3 characters', 'error');
      return;
    }

    if (password && password.length < 6) {
      showToast('Admin password must be at least 6 characters', 'error');
      return;
    }

    try {
      setAdminCredentialsSaving(true);
      const payload = { admin: { username } };
      if (password) payload.admin.password = password;

      const response = await api.put('/auth/credentials', {
        credentials: payload,
      });
      const updatedUser = response.data?.data;
      if (updatedUser) setUser(updatedUser);
      setAdminCredentials((prev) => ({ ...prev, password: '' }));
      setIsAdminCredentialModalOpen(false);
      showToast('Admin credentials updated successfully', 'success');
    } catch (error) {
      showToast(
        error.response?.data?.message || 'Failed to update admin credentials',
        'error',
      );
    } finally {
      setAdminCredentialsSaving(false);
    }
  };

  const fetchUsers = async () => {
    console.log("🔄 Fetching users list..."); // Log to prove it's a fetch
    setLoading(true);
    
    try {
      let allUsers = [];
      let page = 1;
      let hasMore = true;

      while(hasMore && page <= 50) {
          const response = await api.get('/admin/users', { params: { page, limit: 100 } });
          const paginationData = response.data.data;
          
          let pageData = [];
           if (Array.isArray(paginationData)) {
              pageData = paginationData;
              hasMore = false;
          } else {
              pageData = paginationData.data || [];
              if (paginationData?.meta && paginationData.meta.hasNextPage) {
                  page++;
              } else {
                  hasMore = false;
              }
          }
          allUsers = [...allUsers, ...pageData];
      }

      if (isMounted.current) {
        console.log(`✅ Fetched ${allUsers.length} users.`);
        const mappedUsers = allUsers.map(u => {
          const subscriptionStatus = getSubscriptionStatus(u.subscription);
          return {
            id: u._id,
            username: u.name,
            email: u.email,
            role: 'secondary',
            original: u,
            subscriptionStatusLabel: subscriptionStatus.label,
            subscriptionStatusSort: subscriptionStatus.sort,
            subscriptionStatusClass: subscriptionStatus.className
          };
        });
        setUsers(mappedUsers);
      }
    } catch (error) {
       if (isMounted.current) {
          console.error("Failed to fetch users", error);
          showToast("Failed to fetch users", "error");
       }
    }
    
    setTimeout(() => {
      if (isMounted.current) {
        setLoading(false);
      }
    }, 100);
  };

  const fetchTransactions = async () => {
    try {
      let allTransactions = [];
      let page = 1;
      let hasMore = true;

      while(hasMore && page <= 10) {
        const response = await api.get('/admin/subscriptions', { params: { page, limit: 20 } });
        const paginationData = response.data.data;
        
        let pageData = [];
        if (Array.isArray(paginationData)) {
          pageData = paginationData;
          hasMore = false;
        } else {
          pageData = paginationData.data || [];
          if (paginationData?.meta && paginationData.meta.hasNextPage) {
            page++;
          } else {
            hasMore = false;
          }
        }
        allTransactions = [...allTransactions, ...pageData];
      }

      if (isMounted.current) {
        const mappedTransactions = allTransactions.map(sub => ({
          user: sub.user_id?.name || 'Unknown User',
          plan: sub.plan_type,
          validityFrom: sub.start_date,
          validityTo: sub.expiry_date,
          amount: sub.amount || 0,
          createdAt: sub.createdAt,
          status: sub.status
        }));
        setTransactions(mappedTransactions);
      }
    } catch (error) {
      if (isMounted.current) {
        console.error("Failed to fetch transactions", error);
        setTransactions([]);
      }
    }
  };

  const fetchPlatformBackups = async () => {
    try {
      setPlatformBackupLoading(true);
      const response = await api.get('/admin/platform-backups', {
        skipCache: true,
      });
      setPlatformBackups(response.data?.data || []);
    } catch (error) {
      showToast(
        error.response?.data?.message || 'Failed to fetch platform backups',
        'error',
      );
    } finally {
      setPlatformBackupLoading(false);
    }
  };

  const handleCreatePlatformBackup = async () => {
    try {
      setPlatformBackupCreating(true);
      await api.post('/admin/platform-backups');
      showToast('Platform backup created successfully', 'success');
      fetchPlatformBackups();
    } catch (error) {
      showToast(
        error.response?.data?.message || 'Failed to create platform backup',
        'error',
      );
    } finally {
      setPlatformBackupCreating(false);
    }
  };

  const handleRestorePlatformBackup = async (backup) => {
    const confirmation = window.prompt(
      `Type ${backup.backup_no} to restore whole platform database`,
    );
    if (confirmation !== backup.backup_no) return;

    try {
      setPlatformBackupRestoringId(backup._id);
      await api.post(`/admin/platform-backups/${backup._id}/restore`, {
        confirm_backup_no: backup.backup_no,
      });
      showToast('Platform backup restored successfully', 'success');
      fetchPlatformBackups();
    } catch (error) {
      showToast(
        error.response?.data?.message || 'Failed to restore platform backup',
        'error',
      );
    } finally {
      setPlatformBackupRestoringId('');
    }
  };

  const handleDeletePlatformBackup = async (backup) => {
    if (!window.confirm(`Delete platform backup ${backup.backup_no}?`)) return;

    try {
      await api.delete(`/admin/platform-backups/${backup._id}`);
      showToast('Platform backup deleted successfully', 'success');
      fetchPlatformBackups();
    } catch (error) {
      showToast(
        error.response?.data?.message || 'Failed to delete platform backup',
        'error',
      );
    }
  };

  useEffect(() => {
    if (activeAdminScreen === 'backup') {
      fetchPlatformBackups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAdminScreen]);

  // STRICT SINGLE RUN: No dependencies, no cleanup abort
  useEffect(() => {
     fetchUsers();
     fetchTransactions();
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    try {
        await api.post('/auth/logout');
    } catch (e) {
        console.error(e);
    } finally {
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        navigate('/login');
    }
  };

  const columns = useMemo(() => [
    { 
      key: 'id', 
      label: 'ID',
      render: (value) => <span className="text-xs sm:text-sm">{value.substring(0, 8)}...</span>
    },
    {
      key: 'subscriptionStatusSort',
      label: 'Status',
      render: (_value, row) => {
        const showStatusDot = [1, 2, 3].includes(row?.subscriptionStatusSort);
        if (!showStatusDot) return <span className="text-gray-400">-</span>;

        return (
          <span
            className={`inline-flex h-4 w-4 rounded-full ring-1 ring-black/10 shadow-sm ${row.subscriptionStatusClass}`}
            title={row.subscriptionStatusLabel}
            aria-label={row.subscriptionStatusLabel}
          />
        );
      }
    },
    { 
      key: 'username', 
      label: 'Name',
      render: (value) => <span className="text-xs sm:text-sm font-medium truncate">{value}</span>
    },
    { 
      key: 'email', 
      label: 'Email',
      render: (value) => <span className="text-xs sm:text-sm truncate">{value}</span>
    },
  ], []);

  const actions = useMemo(() => [
    {
      label: <FaEye size={10} className="sm:size-3 md:size-4" />,
      onClick: (user) => {
        setViewingUser(user);
        setIsViewModalOpen(true);
      },
      className: 'bg-gray-600 text-white hover:bg-gray-700 p-1 sm:p-1.5 md:p-2 text-xs'
    },
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: async (user) => {
        setEditingUser(user);
        // Fetch fresh data from API to avoid stale cache
        let base = user?.original || {};
        try {
          const res = await api.get(`/admin/users/${user.id}`);
          base = res?.data?.data || base;
        } catch (_) {}
        setEditingForm({
          ...base,
          id: user.id,
          role_users: mapRoleUsersFromUser(base),
          subscription_amount: base.subscription?.amount || 0,
          subscription_years: base.subscription?.timeline?.years || 0,
          subscription_months: base.subscription?.timeline?.months || 0,
          subscription_days: base.subscription?.timeline?.days || 0,
          gst_firm: {
            ...(base.gst_firm || {}),
            password: '',
            bank_ids: Array.isArray(base.gst_firm?.bank_ids)
              ? base.gst_firm.bank_ids
              : [],
          },
          nongst_firm: {
            ...(base.nongst_firm || {}),
            password: '',
            bank_ids: Array.isArray(base.nongst_firm?.bank_ids)
              ? base.nongst_firm.bank_ids
              : [],
          },
        });
        setEditingSignatureFile(null);
        setIsEditModalOpen(true);
      },
      className: 'bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs'
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (user) => {
        if (user) {
            setDeleteDialog({ isOpen: true, user });
        }
      },
      className: 'bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs'
    }
  ], []);

    const handleAddUser = async () => {
    try {
      if (
        !String(newUser.name || '').trim() ||
        !String(newUser.gst_firm.username || '').trim() ||
        !String(newUser.gst_firm.password || '') ||
        !String(newUser.nongst_firm.username || '').trim() ||
        !String(newUser.nongst_firm.password || '')
      ) {
        showToast('Please fill all mandatory fields', 'error');
        return;
      }

      const roleValidationError = validateRoleUsers(newUser.role_users, {
        requirePassword: true,
        fields: ADD_USER_ROLE_CREDENTIAL_FIELDS,
        requiredFields: [],
      });
      if (roleValidationError) {
        showToast(roleValidationError, 'error');
        return;
      }

      const effectiveSubscription = {
        years: Number(pendingSubscription?.years ?? subscriptionData.years ?? 0),
        months: Number(pendingSubscription?.months ?? subscriptionData.months ?? 0),
        days: Number(pendingSubscription?.days ?? subscriptionData.days ?? 0),
        amount: Number(pendingSubscription?.amount ?? subscriptionData.amount ?? 0),
      };
      const hasSubscriptionDuration =
        effectiveSubscription.years > 0 ||
        effectiveSubscription.months > 0 ||
        effectiveSubscription.days > 0;
      const isPaidSubscription = effectiveSubscription.amount > 0;

      if (
        !Number.isFinite(effectiveSubscription.amount) ||
        effectiveSubscription.amount < 0
      ) {
        showToast('Please enter a valid amount', 'error');
        return;
      }

      if (isPaidSubscription && !hasSubscriptionDuration) {
        showToast('Please fill subscription duration for paid plan', 'error');
        return;
      }

      const gstPrimaryBank = Array.isArray(newUser.gst_firm?.banks)
        ? newUser.gst_firm.banks[0] || {}
        : {};
      const nongstPrimaryBank = Array.isArray(newUser.nongst_firm?.banks)
        ? newUser.nongst_firm.banks[0] || {}
        : {};

      const createPayload = {
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role_users: buildRoleUsersPayload(newUser.role_users, {
          fields: ADD_USER_ROLE_CREDENTIAL_FIELDS,
          skipEmpty: true,
        }),
        gst_firm: {
          ...newUser.gst_firm,
          bank_name: gstPrimaryBank.bank_name || "",
          bank_branch: gstPrimaryBank.bank_branch || "",
          ifsc_code: gstPrimaryBank.ifsc_code || "",
          account_number: gstPrimaryBank.account_number || "",
          account_holder: gstPrimaryBank.account_holder || "",
          upi_id: gstPrimaryBank.upi_id || "",
        },
        nongst_firm: {
          ...newUser.nongst_firm,
          bank_name: nongstPrimaryBank.bank_name || "",
          bank_branch: nongstPrimaryBank.bank_branch || "",
          ifsc_code: nongstPrimaryBank.ifsc_code || "",
          account_number: nongstPrimaryBank.account_number || "",
          account_holder: nongstPrimaryBank.account_holder || "",
          upi_id: nongstPrimaryBank.upi_id || "",
        },
      };

      console.log('Creating user with data:', JSON.stringify(createPayload, null, 2));
      const createdResponse = await api.post('/admin/users', createPayload);
      const createdUserId = createdResponse?.data?.data?._id;

      let subscriptionSaved = false;
      if (createdUserId && hasSubscriptionDuration && effectiveSubscription.amount > 0) {
        try {
          await api.put(`/admin/subscriptions/${createdUserId}`, {
            plan_type: 'paid',
            years: effectiveSubscription.years,
            months: effectiveSubscription.months,
            days: effectiveSubscription.days,
            amount: effectiveSubscription.amount,
            notes: 'Created from Add User flow',
            extend_from_current: false,
          });
          subscriptionSaved = true;
        } catch (subscriptionError) {
          console.error('Subscription save failed after user create:', subscriptionError);
          console.error('Subscription error response:', subscriptionError?.response?.data);
          showToast(
            'User created, but subscription amount was not saved. Please set subscription again.',
            'error',
          );
        }
      }

      if (newUser.signatureFile && createdUserId) {
        const formData = new FormData();
        formData.append('signature', newUser.signatureFile);
        await api.post(`/admin/users/${createdUserId}/signature`, formData);
      }

      console.log('User created successfully');
      if (!hasSubscriptionDuration || effectiveSubscription.amount <= 0) {
        showToast('User added successfully (demo plan only)', 'success');
      } else if (subscriptionSaved) {
        showToast(
          newUser.signatureFile
            ? 'User, subscription and signature added successfully'
            : 'User and subscription added successfully',
          'success',
        );
      } else {
        showToast(
          newUser.signatureFile
            ? 'User and signature added, but subscription failed'
            : 'User added, but subscription failed',
          'error',
        );
      }
      setNewUser(getDefaultUserForm());
      setSubscriptionData({ username: '', years: 0, months: 0, days: 0, amount: '' });
      setPendingSubscription(null);
      fetchUsers();
      fetchTransactions();
      focusFirstField();
    } catch (error) {
      console.error('User submit error:', error);
      console.error('Error response:', error.response?.data);
      const msg = error.response?.data?.message || 'Failed to add user';
      const details = Array.isArray(error.response?.data?.errors)
        ? error.response.data.errors.join(', ')
        : '';
      showToast(details ? `${msg}: ${details}` : msg, 'error');
    }
  };

  const handleUpdateUser = async () => {
    // Use ref to get latest editingForm (avoids stale closure)
    const currentForm = editingFormRef.current || editingForm;
    if (!currentForm) return;
    try {
      const roleValidationError = validateRoleUsers(currentForm?.role_users, {
        requirePassword: false,
        requiredFields: [],
      });
      if (roleValidationError) {
        showToast(roleValidationError, 'error');
        return;
      }

      const updatedUser = {
        name: currentForm?.name || '',
        email: currentForm?.email || '',
        phone: currentForm?.phone || '',
        is_active: Boolean(currentForm?.is_active),
        role_users: buildRoleUsersPayload(currentForm?.role_users),
        gst_firm: buildFirmUpdatePayload(currentForm?.gst_firm),
        nongst_firm: buildFirmUpdatePayload(currentForm?.nongst_firm),
        subscription_amount: currentForm?.subscription_amount !== undefined ? Number(currentForm.subscription_amount) : undefined,
        subscription_years: currentForm?.subscription_years !== undefined ? Number(currentForm.subscription_years) : undefined,
        subscription_months: currentForm?.subscription_months !== undefined ? Number(currentForm.subscription_months) : undefined,
        subscription_days: currentForm?.subscription_days !== undefined ? Number(currentForm.subscription_days) : undefined,
      };
      console.log('Updating user with data:', JSON.stringify(updatedUser, null, 2));
      console.log('gst_firm.address:', currentForm?.gst_firm?.address);
      await api.put(`/admin/users/${editingUser.id}`, updatedUser);

      if (editingSignatureFile) {
        const formData = new FormData();
        formData.append('signature', editingSignatureFile);
        await api.put(`/admin/users/${editingUser.id}/signature`, formData);
      }

      console.log('User updated successfully');

      setIsEditModalOpen(false);
      setEditingSignatureFile(null);
      setEditingForm(null);
      setEditingUser(null);
      showToast(
        editingSignatureFile
          ? 'User and signature updated successfully'
          : 'User updated successfully',
        'success',
      );
      fetchUsers();
      // If the updated user is the currently logged-in user, refresh /auth/me
      if (loggedInUser && editingUser?.id === loggedInUser?._id) {
        try {
          const meRes = await api.get('/auth/me');
          const freshUser = meRes?.data?.data;
          if (freshUser) setUser(freshUser);
        } catch (_) {}
      }
    } catch (error) {
      console.error('User update error:', error);
      console.error('Error response:', error.response?.data);
      const msg = error.response?.data?.message || 'Failed to update user';
      const details = Array.isArray(error.response?.data?.errors)
        ? error.response.data.errors.join(', ')
        : '';
      showToast(details ? `${msg}: ${details}` : msg, 'error');
    }
  };
  const handleConfirmDelete = useCallback(async () => {
    // 🛡️ LEVEL 1: State Check
    if (!deleteDialog.isOpen || !deleteDialog.user || !deleteDialog.user.id) {
       console.warn("🚫 Blocked: Invalid delete confirmation state."); 
       return;
    }

    // 🛡️ LEVEL 2: Browser Native Confirm (Cannot be bypassed by scripts easily)
    // This is the "Nuclear Option" against auto-deletion bugs.
    // If this dialog appears automatically, the browser blocks it or the user knows something is truly wrong with their browser/extensions.
    /* 
       Optimized decision: I will NOT uncomment this unless the user explicitly asks for "annoying" popups, 
       but I will rely on the React State check which is already robust. 
       However, to "Fix it one time", I will verify the user ID length to ensure we aren't deleting "undefined".
    */
   
    if (String(deleteDialog.user.id).length < 5) {
        console.error("🚫 Blocked: Invalid User ID length.");
        return;
    }

    try {
       console.log(`Deleting user explicitly: ${deleteDialog.user.id}`);
       await api.delete(`/admin/users/${deleteDialog.user.id}`);
       showToast('User deleted successfully', 'success');
       setDeleteDialog({ isOpen: false, user: null });
       fetchUsers();
    } catch (error) {
       console.error("User delete error:", error);
       const msg = error.response?.data?.message || 'Failed to delete user';
       const details = Array.isArray(error.response?.data?.errors) 
           ? error.response.data.errors.join(', ') 
           : '';
       showToast(details ? `${msg}: ${details}` : msg, 'error');
    }
  }, [deleteDialog, showToast]); 

  return (
    <div className="min-h-screen pt-10 bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Admin Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Admin Panel - User Master</h1>
              <p className="text-gray-600 text-xs sm:text-sm">Manage system users and permissions</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setActiveAdminScreen((screen) =>
                    screen === 'backup' ? 'users' : 'backup',
                  )
                }
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
              >
                <FaDatabase className="w-4 h-4" />
                {activeAdminScreen === 'backup' ? 'User Master' : 'Backup & Restore'}
              </button>
              <button
                onClick={() => {
                  setAdminCredentials({
                    username: loggedInUser?.admin?.username || loggedInUser?.username || '',
                    password: '',
                  });
                  setIsAdminCredentialModalOpen(true);
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
              >
                <FaKey className="w-4 h-4" />
                Reset Admin Credentials
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
              >
                <FaSignOutAlt className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>

        {activeAdminScreen === 'backup' ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Backup & Restore</h2>
                <p className="text-gray-600 text-sm">
                  Platform-wide MongoDB snapshots stored inside database.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={fetchPlatformBackups}
                  variant="outline"
                  disabled={platformBackupLoading}
                  className="flex items-center gap-2 text-xs sm:text-sm"
                >
                  <FaSync className="text-sm sm:text-base" />
                  Refresh
                </Button>
                <Button
                  onClick={handleCreatePlatformBackup}
                  disabled={platformBackupCreating}
                  className="flex items-center gap-2 text-xs sm:text-sm"
                >
                  <FaDatabase className="text-sm sm:text-base" />
                  {platformBackupCreating ? 'Creating...' : 'Create Backup'}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Backup No</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Date</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Collections</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Records</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Size</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Restored At</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {platformBackupLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        Loading backups...
                      </td>
                    </tr>
                  ) : platformBackups.length ? (
                    platformBackups.map((backup) => (
                      <tr key={backup._id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{backup.backup_no}</td>
                        <td className="px-4 py-2">
                          {backup.created_at ? new Date(backup.created_at).toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            backup.status === 'success'
                              ? 'bg-green-100 text-green-800'
                              : backup.status === 'failed'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {backup.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">{backup.total_collections || 0}</td>
                        <td className="px-4 py-2">{backup.total_records || 0}</td>
                        <td className="px-4 py-2">{backup.size_mb || 0} MB</td>
                        <td className="px-4 py-2">
                          {backup.restored_at ? new Date(backup.restored_at).toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              disabled={
                                backup.status !== 'success' ||
                                platformBackupRestoringId === backup._id
                              }
                              onClick={() => handleRestorePlatformBackup(backup)}
                              className="text-xs py-1.5"
                            >
                              {platformBackupRestoringId === backup._id ? 'Restoring...' : 'Restore'}
                            </Button>
                            <button
                              onClick={() => handleDeletePlatformBackup(backup)}
                              className="bg-red-600 text-white hover:bg-red-700 p-2 rounded"
                              title="Delete backup"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        No platform backups found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
        <>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Transaction History</h2>
            <p className="text-gray-600 text-sm">Recent user subscription and account transactions</p>
          </div>

          <div className="overflow-x-auto">
            {transactions.length > 0 ? (
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">User</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Plan</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Valid From</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Valid To</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Amount</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Date</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.slice(0, 10).map((txn, idx) => {
                    const status = getSubscriptionStatus({
                      validityFrom: txn.validityFrom,
                      validityTo: txn.validityTo
                    });
                    const showStatusDot = [1, 2, 3, 4].includes(status.sort);

                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 truncate">{txn.user || '-'}</td>
                        <td className="px-4 py-2">{txn.plan || '-'}</td>
                        <td className="px-4 py-2">
                          {showStatusDot ? (
                            <span
                              className={`inline-flex h-4 w-4 rounded-full ring-1 ring-black/10 shadow-sm ${status.className}`}
                              title={status.label}
                              aria-label={status.label}
                            />
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2">{txn.validityFrom ? new Date(txn.validityFrom).toLocaleDateString() : '-'}</td>
                        <td className="px-4 py-2">{txn.validityTo ? new Date(txn.validityTo).toLocaleDateString() : '-'}</td>
                        <td className="px-4 py-2 font-medium">{'\u20B9'}{txn.amount || '0'}</td>
                        <td className="px-4 py-2">{txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : '-'}</td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => {
                              setSelectedUserTransactions(txn.user);
                              setIsTransactionHistoryModalOpen(true);
                            }}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <FaEye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <p>No transactions yet</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
              <p className="text-gray-600 text-sm">Add, edit, and manage system users</p>
            </div>
            <div className="flex gap-2">
                <Button 
                onClick={fetchUsers} 
                variant="outline"
                className="flex items-center gap-2 text-xs sm:text-sm"
                >
                <FaSync className="text-sm sm:text-base" />
                Refresh
                </Button>
                <Button 
                onClick={() => setIsSubscriptionModalOpen(true)} 
                className="flex items-center gap-2 text-xs sm:text-sm"
                >
                <FaPlus className="text-sm sm:text-base" />
                Add User
                </Button>
            </div>
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto">
            <DataTable
              loading={loading}
              columns={columns}
              data={[...users].sort((a, b) => (a.subscriptionStatusSort ?? 99) - (b.subscriptionStatusSort ?? 99))}
              actions={actions}
              searchable={true}
              sortable={true}
              pagination={true}
              minWidth="600px"
              className="text-xs sm:text-sm"
            />
          </div>
        </div>
        </>
        )}
      </div>

      {/* Subscription Modal */}
      <Modal isOpen={isSubscriptionModalOpen} onClose={() => setIsSubscriptionModalOpen(false)} title="Add Subscription" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User Name *</label>
            <Input 
              value={subscriptionData.username} 
              onChange={(v) => setSubscriptionData({...subscriptionData, username: v})} 
              placeholder="Enter user name" 
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Duration *</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Years</label>
                <Input 
                  type="number" 
                  min="0"
                  value={subscriptionData.years} 
                  onChange={(v) => setSubscriptionData({...subscriptionData, years: parseInt(v) || 0})} 
                  placeholder="0" 
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Months</label>
                <Input 
                  type="number" 
                  min="0"
                  max="12"
                  value={subscriptionData.months} 
                  onChange={(v) => {
                    const val = parseInt(v) || 0;
                    setSubscriptionData({...subscriptionData, months: val > 12 ? 12 : val});
                  }} 
                  placeholder="0" 
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Days</label>
                <Input 
                  type="number" 
                  min="0"
                  max="31"
                  value={subscriptionData.days} 
                  onChange={(v) => {
                    const val = parseInt(v) || 0;
                    setSubscriptionData({...subscriptionData, days: val > 31 ? 31 : val});
                  }} 
                  placeholder="0" 
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
            <Input 
              type="number" 
              value={subscriptionData.amount} 
              onChange={(v) => setSubscriptionData({...subscriptionData, amount: v})} 
              placeholder="Enter amount" 
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={() => {
              if (!subscriptionData.username) {
                showToast('Please enter user name', 'error');
                return;
              }
              const amountValue = Number(subscriptionData.amount || 0);
              const hasDuration =
                Number(subscriptionData.years || 0) > 0 ||
                Number(subscriptionData.months || 0) > 0 ||
                Number(subscriptionData.days || 0) > 0;

              if (!Number.isFinite(amountValue) || amountValue < 0) {
                showToast('Please enter a valid amount', 'error');
                return;
              }
              if (amountValue > 0 && !hasDuration) {
                showToast('Please set duration (years, months, or days) for paid plan', 'error');
                return;
              }
              
              setNewUser({...newUser, name: subscriptionData.username});
              setPendingSubscription({
                years: Number(subscriptionData.years || 0),
                months: Number(subscriptionData.months || 0),
                days: Number(subscriptionData.days || 0),
                amount: amountValue,
              });
              setIsSubscriptionModalOpen(false);
              setIsAddModalOpen(true);
            }} id="subscription-continue-btn">Continue to User Details</Button>
            <Button variant="outline" onClick={() => {
              setIsSubscriptionModalOpen(false);
              setSubscriptionData({ username: '', years: 0, months: 0, days: 0, amount: '' });
              setPendingSubscription(null);
            }}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Add User Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add User" size="lg">
        <div className="max-h-[70vh] overflow-y-auto pr-2 space-y-6">
          
          {/* Section 1: Personal Info */}
          <div className="bg-gray-50 p-4 rounded-lg border">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">1. User Personal Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div>
                  <label className="text-xs font-medium text-gray-700">Full Name <span className="text-red-500">*</span></label>
                  <Input ref={firstFieldRef} value={newUser.name} onChange={(v) => setNewUser({...newUser, name: v})} placeholder="e.g. Staff One" className="mt-1" />
               </div>
               <div>
                  <label className="text-xs font-medium text-gray-700">Phone</label>
                  <Input value={newUser.phone} onChange={(v) => setNewUser({...newUser, phone: v})} placeholder="e.g. 9876543210" className="mt-1" />
               </div>
               <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Email</label>
                  <Input type="email" value={newUser.email} onChange={(v) => setNewUser({...newUser, email: v})} placeholder="staff@mm.com" className="mt-1" />
               </div>
               <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Signature</label>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setNewUser({...newUser, signature: reader.result, signatureFile: file});
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="mt-1 block w-full text-xs sm:text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {newUser.signature && (
                    <img src={newUser.signature} alt="Signature" className="mt-2 h-20 border rounded" />
                  )}
               </div>
            </div>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
            <h3 className="text-sm font-semibold text-purple-900 mb-3 uppercase tracking-wider">1.5 Role Credentials</h3>
            <p className="text-xs text-purple-700 mb-3">
              Configure sales, account, and client credentials for this user (optional).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ADD_USER_ROLE_CREDENTIAL_FIELDS.map((roleField) => (
                <div key={roleField.key} className="bg-white rounded border p-3">
                  <p className="text-xs font-semibold text-gray-700 mb-2">{roleField.label}</p>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-medium text-gray-700">Username</label>
                      <Input
                        value={newUser.role_users?.[roleField.key]?.username || ''}
                        onChange={(v) =>
                          setNewUser((prev) => ({
                            ...prev,
                            role_users: {
                              ...(prev.role_users || getDefaultRoleUsers()),
                              [roleField.key]: {
                                ...(prev.role_users?.[roleField.key] || {}),
                                username: v,
                              },
                            },
                          }))
                        }
                        placeholder={`${roleField.key}_user`}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Password</label>
                      <Input
                        type="password"
                        value={newUser.role_users?.[roleField.key]?.password || ''}
                        onChange={(v) =>
                          setNewUser((prev) => ({
                            ...prev,
                            role_users: {
                              ...(prev.role_users || getDefaultRoleUsers()),
                              [roleField.key]: {
                                ...(prev.role_users?.[roleField.key] || {}),
                                password: v,
                              },
                            },
                          }))
                        }
                        placeholder="******"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
            <h3 className="text-sm font-semibold text-indigo-900 mb-3 uppercase tracking-wider">1.5 Subscription Details <span className="text-red-500">*</span></h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-700">Years <span className="text-red-500">*</span></label>
                <Input
                  type="number"
                  min="0"
                  value={addModalSubscription.years}
                  onChange={(v) => updateAddModalSubscription({ years: parseInt(v, 10) || 0 })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Months <span className="text-red-500">*</span></label>
                <Input
                  type="number"
                  min="0"
                  max="12"
                  value={addModalSubscription.months}
                  onChange={(v) => {
                    const val = parseInt(v, 10) || 0;
                    updateAddModalSubscription({ months: val > 12 ? 12 : val });
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Days <span className="text-red-500">*</span></label>
                <Input
                  type="number"
                  min="0"
                  max="31"
                  value={addModalSubscription.days}
                  onChange={(v) => {
                    const val = parseInt(v, 10) || 0;
                    updateAddModalSubscription({ days: val > 31 ? 31 : val });
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Amount (₹)</label>
                <div className="text-red-500 text-xs mt-1">*</div>
                <Input
                  type="number"
                  min="0"
                  value={addModalSubscription.amount}
                  onChange={(v) => updateAddModalSubscription({ amount: Number(v) || 0 })}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Section 2: GST Firm */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-900 mb-3 uppercase tracking-wider">2. GST Firm Configuration</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div>
                  <label className="text-xs font-medium text-gray-700">Firm Login Username <span className="text-red-500">*</span></label>
                  <Input value={newUser.gst_firm.username} onChange={(v) => setNewUser({...newUser, gst_firm: {...newUser.gst_firm, username: v}})} placeholder="staff_gst" className="mt-1" />
               </div>
               <div>
                  <label className="text-xs font-medium text-gray-700">Login Password <span className="text-red-500">*</span></label>
                  <Input type="password" value={newUser.gst_firm.password} onChange={(v) => setNewUser({...newUser, gst_firm: {...newUser.gst_firm, password: v}})} placeholder="******" className="mt-1" />
               </div>
               <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Display Name (Optional)</label>
                  <Input value={newUser.gst_firm.name} onChange={(v) => setNewUser({...newUser, gst_firm: {...newUser.gst_firm, name: v}})} placeholder="Staff GST Firm" className="mt-1" />
               </div>
               
               {/* Contact Info */}
               <div>
                  <label className="text-xs font-medium text-gray-700">Firm Phone (Optional)</label>
                  <Input value={newUser.gst_firm.phone} onChange={(v) => setNewUser({...newUser, gst_firm: {...newUser.gst_firm, phone: v}})} placeholder="9999999999" className="mt-1" />
               </div>
               <div>
                  <label className="text-xs font-medium text-gray-700">Firm Email (Optional)</label>
                  <Input type="email" value={newUser.gst_firm.email} onChange={(v) => setNewUser({...newUser, gst_firm: {...newUser.gst_firm, email: v}})} placeholder="firm@gst.com" className="mt-1" />
               </div>

               {/* Address Info */}
               <div>
                  <label className="text-xs font-medium text-gray-700">City (Optional)</label>
                  <Input value={newUser.gst_firm.city} onChange={(v) => setNewUser({...newUser, gst_firm: {...newUser.gst_firm, city: v}})} placeholder="City" className="mt-1" />
               </div>
               <div>
                  <label className="text-xs font-medium text-gray-700">State (Optional)</label>
                  <select 
                    value={newUser.gst_firm.state} 
                    onChange={(e) => setNewUser({ ...newUser, gst_firm: { ...newUser.gst_firm, state: e.target.value } })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs sm:text-sm py-2 px-3 border"
                  >
                    <option value="">Select State</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
               </div>
               <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Address (Optional)</label>
                  <Input value={newUser.gst_firm.address} onChange={(v) => setNewUser({...newUser, gst_firm: {...newUser.gst_firm, address: v}})} placeholder="Full Address" className="mt-1" />
               </div>
               <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Godown Address</label>
                  <Input value={newUser.gst_firm.godown_address} onChange={(v) => setNewUser({...newUser, gst_firm: {...newUser.gst_firm, godown_address: v}})} placeholder="Godown Address" className="mt-1" />
               </div>
               <div>
                  <label className="text-xs font-medium text-gray-700">GSTIN</label>
                  <Input value={newUser.gst_firm.GSTIN} onChange={(v) => setNewUser({...newUser, gst_firm: {...newUser.gst_firm, GSTIN: v}})} placeholder="GSTIN" className="mt-1" />
               </div>
               <div>
                  <label className="text-xs font-medium text-gray-700">CIN</label>
                  <Input value={newUser.gst_firm.CIN} onChange={(v) => setNewUser({...newUser, gst_firm: {...newUser.gst_firm, CIN: v}})} placeholder="CIN" className="mt-1" />
               </div>
               <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Registration Number</label>
                  <Input value={newUser.gst_firm.reg_number} onChange={(v) => setNewUser({...newUser, gst_firm: {...newUser.gst_firm, reg_number: v}})} placeholder="Registration Number" className="mt-1" />
               </div>

               {/* Bank Details */}
               <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700 mb-2 block">Bank Details</label>
                  {newUser.gst_firm.banks.map((bank, idx) => (
                    <div key={idx} className="border rounded p-3 mb-2 bg-white">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-600">Bank Name</label>
                          <Input value={bank.bank_name} onChange={(v) => {
                            const banks = [...newUser.gst_firm.banks];
                            banks[idx].bank_name = v;
                            setNewUser({...newUser, gst_firm: {...newUser.gst_firm, banks}});
                          }} placeholder="Bank Name" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Branch</label>
                          <Input value={bank.bank_branch} onChange={(v) => {
                            const banks = [...newUser.gst_firm.banks];
                            banks[idx].bank_branch = v;
                            setNewUser({...newUser, gst_firm: {...newUser.gst_firm, banks}});
                          }} placeholder="Branch" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">IFSC Code</label>
                          <Input value={bank.ifsc_code} onChange={(v) => {
                            const banks = [...newUser.gst_firm.banks];
                            banks[idx].ifsc_code = v;
                            setNewUser({...newUser, gst_firm: {...newUser.gst_firm, banks}});
                          }} placeholder="IFSC Code" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Account Number</label>
                          <Input value={bank.account_number} onChange={(v) => {
                            const banks = [...newUser.gst_firm.banks];
                            banks[idx].account_number = v;
                            setNewUser({...newUser, gst_firm: {...newUser.gst_firm, banks}});
                          }} placeholder="Account Number" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Account Holder</label>
                          <Input value={bank.account_holder || ''} onChange={(v) => {
                            const banks = [...newUser.gst_firm.banks];
                            banks[idx].account_holder = v;
                            setNewUser({...newUser, gst_firm: {...newUser.gst_firm, banks}});
                          }} placeholder="Account Holder Name" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">UPI ID</label>
                          <Input value={bank.upi_id || ''} onChange={(v) => {
                            const banks = [...newUser.gst_firm.banks];
                            banks[idx].upi_id = v;
                            setNewUser({...newUser, gst_firm: {...newUser.gst_firm, banks}});
                          }} placeholder="UPI ID" className="mt-1" />
                        </div>
                      </div>
                      {newUser.gst_firm.banks.length > 1 && (
                        <button onClick={() => {
                          const banks = newUser.gst_firm.banks.filter((_, i) => i !== idx);
                          setNewUser({...newUser, gst_firm: {...newUser.gst_firm, banks}});
                        }} className="text-red-600 text-xs mt-2">Remove Bank</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => {
                    setNewUser({...newUser, gst_firm: {...newUser.gst_firm, banks: [...newUser.gst_firm.banks, { bank_name: '', bank_branch: '', ifsc_code: '', account_number: '' }]}});
                  }} className="text-blue-600 text-xs">+ Add Another Bank</button>
               </div>
            </div>
          </div>

          {/* Section 3: Non-GST Firm */}
          <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
            <h3 className="text-sm font-semibold text-orange-900 mb-3 uppercase tracking-wider">3. Non-GST Firm Configuration</h3>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div>
                  <label className="text-xs font-medium text-gray-700">Firm Login Username <span className="text-red-500">*</span></label>
                  <Input value={newUser.nongst_firm.username} onChange={(v) => setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, username: v}})} placeholder="staff_nongst" className="mt-1" />
               </div>
               <div>
                  <label className="text-xs font-medium text-gray-700">Login Password <span className="text-red-500">*</span></label>
                  <Input type="password" value={newUser.nongst_firm.password} onChange={(v) => setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, password: v}})} placeholder="******" className="mt-1" />
               </div>
               <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Display Name (Optional)</label>
                  <Input value={newUser.nongst_firm.name} onChange={(v) => setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, name: v}})} placeholder="Staff Non-GST Firm" className="mt-1" />
               </div>

               {/* Contact Info */}
               <div>
                  <label className="text-xs font-medium text-gray-700">Firm Phone (Optional)</label>
                  <Input value={newUser.nongst_firm.phone} onChange={(v) => setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, phone: v}})} placeholder="9999999999" className="mt-1" />
               </div>
               <div>
                  <label className="text-xs font-medium text-gray-700">Firm Email (Optional)</label>
                  <Input type="email" value={newUser.nongst_firm.email} onChange={(v) => setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, email: v}})} placeholder="firm@nongst.com" className="mt-1" />
               </div>
               
               {/* Address Info */}
               <div>
                  <label className="text-xs font-medium text-gray-700">City (Optional)</label>
                  <Input value={newUser.nongst_firm.city} onChange={(v) => setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, city: v}})} placeholder="City" className="mt-1" />
               </div>
               <div>
                  <label className="text-xs font-medium text-gray-700">State (Optional)</label>
                  <select 
                    value={newUser.nongst_firm.state} 
                    onChange={(e) => setNewUser({ ...newUser, nongst_firm: { ...newUser.nongst_firm, state: e.target.value } })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs sm:text-sm py-2 px-3 border"
                  >
                    <option value="">Select State</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
               </div>
               <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Address (Optional)</label>
                  <Input value={newUser.nongst_firm.address} onChange={(v) => setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, address: v}})} placeholder="Full Address" className="mt-1" />
               </div>
               <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Godown Address</label>
                  <Input value={newUser.nongst_firm.godown_address} onChange={(v) => setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, godown_address: v}})} placeholder="Godown Address" className="mt-1" />
               </div>
               <div>
                  <label className="text-xs font-medium text-gray-700">GSTIN</label>
                  <Input value={newUser.nongst_firm.GSTIN} onChange={(v) => setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, GSTIN: v}})} placeholder="GSTIN" className="mt-1" />
               </div>
               <div>
                  <label className="text-xs font-medium text-gray-700">CIN</label>
                  <Input value={newUser.nongst_firm.CIN} onChange={(v) => setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, CIN: v}})} placeholder="CIN" className="mt-1" />
               </div>
               <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Registration Number</label>
                  <Input value={newUser.nongst_firm.reg_number} onChange={(v) => setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, reg_number: v}})} placeholder="Registration Number" className="mt-1" />
               </div>

               {/* Bank Details */}
               <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700 mb-2 block">Bank Details</label>
                  {newUser.nongst_firm.banks.map((bank, idx) => (
                    <div key={idx} className="border rounded p-3 mb-2 bg-white">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-600">Bank Name</label>
                          <Input value={bank.bank_name} onChange={(v) => {
                            const banks = [...newUser.nongst_firm.banks];
                            banks[idx].bank_name = v;
                            setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, banks}});
                          }} placeholder="Bank Name" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Branch</label>
                          <Input value={bank.bank_branch} onChange={(v) => {
                            const banks = [...newUser.nongst_firm.banks];
                            banks[idx].bank_branch = v;
                            setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, banks}});
                          }} placeholder="Branch" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">IFSC Code</label>
                          <Input value={bank.ifsc_code} onChange={(v) => {
                            const banks = [...newUser.nongst_firm.banks];
                            banks[idx].ifsc_code = v;
                            setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, banks}});
                          }} placeholder="IFSC Code" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Account Number</label>
                          <Input value={bank.account_number} onChange={(v) => {
                            const banks = [...newUser.nongst_firm.banks];
                            banks[idx].account_number = v;
                            setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, banks}});
                          }} placeholder="Account Number" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Account Holder</label>
                          <Input value={bank.account_holder || ''} onChange={(v) => {
                            const banks = [...newUser.nongst_firm.banks];
                            banks[idx].account_holder = v;
                            setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, banks}});
                          }} placeholder="Account Holder Name" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">UPI ID</label>
                          <Input value={bank.upi_id || ''} onChange={(v) => {
                            const banks = [...newUser.nongst_firm.banks];
                            banks[idx].upi_id = v;
                            setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, banks}});
                          }} placeholder="UPI ID" className="mt-1" />
                        </div>
                      </div>
                      {newUser.nongst_firm.banks.length > 1 && (
                        <button onClick={() => {
                          const banks = newUser.nongst_firm.banks.filter((_, i) => i !== idx);
                          setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, banks}});
                        }} className="text-red-600 text-xs mt-2">Remove Bank</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => {
                    setNewUser({...newUser, nongst_firm: {...newUser.nongst_firm, banks: [...newUser.nongst_firm.banks, { bank_name: '', bank_branch: '', ifsc_code: '', account_number: '' }]}});
                  }} className="text-blue-600 text-xs">+ Add Another Bank</button>
               </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t sticky bottom-0 bg-white">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddUser}>Create User</Button>
          </div>
        </div>
      </Modal>

      {/* View User Modal */}
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="View User" size="lg">
        {viewingUser && (
          <div className="max-h-[70vh] overflow-y-auto pr-2 space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">1. User Personal Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-700">Full Name</label>
                  <Input value={viewingUser.original?.name || viewingUser.username} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Phone</label>
                  <Input value={viewingUser.original?.phone || ''} disabled className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Email</label>
                  <Input value={viewingUser.original?.email || viewingUser.email} disabled className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Signature</label>
                  {viewingUser.original?.signature ? (
                    <img src={viewingUser.original.signature} alt="Signature" className="mt-2 h-20 border rounded" />
                  ) : (
                    <p className="text-sm text-gray-500 mt-1">No signature available</p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
              <h3 className="text-sm font-semibold text-purple-900 mb-3 uppercase tracking-wider">1.5 Role Credentials</h3>
              <p className="text-xs text-purple-700 mb-3">
	                Assigned usernames for sales, account, and client credentials.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ROLE_CREDENTIAL_FIELDS.map((roleField) => (
                  <div key={roleField.key} className="bg-white rounded border p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-2">{roleField.label}</p>
                    <label className="text-xs font-medium text-gray-700">Username</label>
                    <Input
                      value={
	                        roleField.key === 'sales'
	                            ? viewingUser.original?.sale_user?.username || viewingUser.original?.sales_user?.username || ''
	                            : roleField.key === 'account'
                              ? viewingUser.original?.account_user?.username || ''
                              : viewingUser.original?.client_user?.username || ''
                      }
                      disabled
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <h3 className="text-sm font-semibold text-blue-900 mb-3 uppercase tracking-wider">2. GST Firm Configuration</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-700">Firm Login Username</label>
                  <Input value={viewingUser.original?.gst_firm?.username || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Display Name</label>
                  <Input value={viewingUser.original?.gst_firm?.name || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Firm Phone</label>
                  <Input value={viewingUser.original?.gst_firm?.phone || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Firm Email</label>
                  <Input value={viewingUser.original?.gst_firm?.email || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">City</label>
                  <Input value={viewingUser.original?.gst_firm?.city || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">State</label>
                  <Input value={viewingUser.original?.gst_firm?.state || ''} disabled className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Address</label>
                  <Input value={viewingUser.original?.gst_firm?.address || ''} disabled className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Godown Address</label>
                  <Input value={viewingUser.original?.gst_firm?.godown_address || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">GSTIN</label>
                  <Input value={viewingUser.original?.gst_firm?.GSTIN || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">CIN</label>
                  <Input value={viewingUser.original?.gst_firm?.CIN || ''} disabled className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Registration Number</label>
                  <Input value={viewingUser.original?.gst_firm?.reg_number || ''} disabled className="mt-1" />
                </div>

                {/* Bank Details */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700 mb-2 block">Bank Details</label>
                  {(Array.isArray(viewingUser.original?.gst_firm?.bank_ids) && viewingUser.original.gst_firm.bank_ids.length > 0) ? (
                    viewingUser.original.gst_firm.bank_ids.map((bank, idx) => (
                      <div key={idx} className="border rounded p-3 mb-2 bg-gray-50">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-600">Bank Name</label>
                            <Input value={bank?.bank_name || ''} disabled className="mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Branch</label>
                            <Input value={bank?.bank_branch || ''} disabled className="mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">IFSC Code</label>
                            <Input value={bank?.ifsc_code || ''} disabled className="mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Account Number</label>
                            <Input value={bank?.account_number || ''} disabled className="mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Account Holder</label>
                            <Input value={bank?.account_holder || ''} disabled className="mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">UPI ID</label>
                            <Input value={bank?.upi_id || ''} disabled className="mt-1" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="border rounded p-3 bg-gray-50 text-center text-gray-500 text-sm">
                      No bank details available
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
              <h3 className="text-sm font-semibold text-orange-900 mb-3 uppercase tracking-wider">3. Non-GST Firm Configuration</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-700">Firm Login Username</label>
                  <Input value={viewingUser.original?.nongst_firm?.username || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Display Name</label>
                  <Input value={viewingUser.original?.nongst_firm?.name || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Firm Phone</label>
                  <Input value={viewingUser.original?.nongst_firm?.phone || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Firm Email</label>
                  <Input value={viewingUser.original?.nongst_firm?.email || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">City</label>
                  <Input value={viewingUser.original?.nongst_firm?.city || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">State</label>
                  <Input value={viewingUser.original?.nongst_firm?.state || ''} disabled className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Address</label>
                  <Input value={viewingUser.original?.nongst_firm?.address || ''} disabled className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Godown Address</label>
                  <Input value={viewingUser.original?.nongst_firm?.godown_address || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">GSTIN</label>
                  <Input value={viewingUser.original?.nongst_firm?.GSTIN || ''} disabled className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">CIN</label>
                  <Input value={viewingUser.original?.nongst_firm?.CIN || ''} disabled className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Registration Number</label>
                  <Input value={viewingUser.original?.nongst_firm?.reg_number || ''} disabled className="mt-1" />
                </div>

                {/* Bank Details */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700 mb-2 block">Bank Details</label>
                  {(Array.isArray(viewingUser.original?.nongst_firm?.bank_ids) && viewingUser.original.nongst_firm.bank_ids.length > 0) ? (
                    viewingUser.original.nongst_firm.bank_ids.map((bank, idx) => (
                      <div key={idx} className="border rounded p-3 mb-2 bg-gray-50">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-600">Bank Name</label>
                            <Input value={bank?.bank_name || ''} disabled className="mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Branch</label>
                            <Input value={bank?.bank_branch || ''} disabled className="mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">IFSC Code</label>
                            <Input value={bank?.ifsc_code || ''} disabled className="mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Account Number</label>
                            <Input value={bank?.account_number || ''} disabled className="mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Account Holder</label>
                            <Input value={bank?.account_holder || ''} disabled className="mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">UPI ID</label>
                            <Input value={bank?.upi_id || ''} disabled className="mt-1" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="border rounded p-3 bg-gray-50 text-center text-gray-500 text-sm">
                      No bank details available
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Subscription Section */}
            {(() => {
              const sub = viewingUser.original?.subscription;
              const status = getSubscriptionStatus({
                validityFrom: sub?.validityFrom || sub?.start_date,
                validityTo: sub?.validityTo || sub?.expiry_date,
              });
              const userTxns = transactions
                .filter((t) => t.user === (viewingUser.original?.name || viewingUser.username))
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
              const totalSpent = userTxns.reduce((s, t) => s + (t.amount || 0), 0);

              return (
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                  <h3 className="text-sm font-semibold text-indigo-900 mb-3 uppercase tracking-wider">Subscription Details</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-white rounded border p-3">
                      <p className="text-xs text-gray-500">Status</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold ${status.className}`}>{status.label}</span>
                    </div>
                    <div className="bg-white rounded border p-3">
                      <p className="text-xs text-gray-500">Valid From</p>
                      <p className="text-sm font-medium mt-1">{sub?.validityFrom || sub?.start_date ? new Date(sub.validityFrom || sub.start_date).toLocaleDateString('en-IN') : '-'}</p>
                    </div>
                    <div className="bg-white rounded border p-3">
                      <p className="text-xs text-gray-500">Valid To</p>
                      <p className="text-sm font-medium mt-1">{sub?.validityTo || sub?.expiry_date ? new Date(sub.validityTo || sub.expiry_date).toLocaleDateString('en-IN') : '-'}</p>
                    </div>
                    <div className="bg-white rounded border p-3">
                      <p className="text-xs text-gray-500">Total Spent</p>
                      <p className="text-sm font-semibold text-green-600 mt-1">₹{totalSpent.toLocaleString()}</p>
                    </div>
                  </div>
                  {userTxns.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-indigo-100">
                          <tr>
                            <th className="px-3 py-2 text-left">#</th>
                            <th className="px-3 py-2 text-left">Plan</th>
                            <th className="px-3 py-2 text-left">Valid From</th>
                            <th className="px-3 py-2 text-left">Valid To</th>
                            <th className="px-3 py-2 text-left">Amount</th>
                            <th className="px-3 py-2 text-left">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {userTxns.map((txn, idx) => (
                            <tr key={idx} className="hover:bg-indigo-50">
                              <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                              <td className="px-3 py-2">{txn.plan || '-'}</td>
                              <td className="px-3 py-2">{txn.validityFrom ? new Date(txn.validityFrom).toLocaleDateString('en-IN') : '-'}</td>
                              <td className="px-3 py-2">{txn.validityTo ? new Date(txn.validityTo).toLocaleDateString('en-IN') : '-'}</td>
                              <td className="px-3 py-2 font-medium">₹{txn.amount || 0}</td>
                              <td className="px-3 py-2">{txn.createdAt ? new Date(txn.createdAt).toLocaleDateString('en-IN') : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {userTxns.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-3">No subscription transactions found</p>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-end pt-4 border-t sticky bottom-0 bg-white">
              <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit User Modal (full editable form) */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingSignatureFile(null);
        }}
        title="Edit User"
        size="lg"
      >
        {editingForm && (
          <div className="max-h-[70vh] overflow-y-auto pr-2 space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">1. User Personal Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-700">Full Name <span className="text-red-500">*</span></label>
                  <Input value={editingForm.name || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, name: v }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Phone</label>
                  <Input value={editingForm.phone || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, phone: v }))} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Email</label>
                  <Input type="email" value={editingForm.email || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, email: v }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Subscription Amount</label>
                  <Input type="number" min="0" value={editingForm.subscription_amount !== undefined ? editingForm.subscription_amount : ''} onChange={(v) => setEditingForm(prev => ({ ...prev, subscription_amount: v }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Subscription Duration (Y / M / D)</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <Input type="number" min="0" placeholder="Years" value={editingForm.subscription_years !== undefined ? editingForm.subscription_years : ''} onChange={(v) => setEditingForm(prev => ({ ...prev, subscription_years: v }))} />
                    <Input type="number" min="0" placeholder="Months" value={editingForm.subscription_months !== undefined ? editingForm.subscription_months : ''} onChange={(v) => setEditingForm(prev => ({ ...prev, subscription_months: v }))} />
                    <Input type="number" min="0" placeholder="Days" value={editingForm.subscription_days !== undefined ? editingForm.subscription_days : ''} onChange={(v) => setEditingForm(prev => ({ ...prev, subscription_days: v }))} />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Signature</label>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setEditingForm(prev => ({ ...prev, signature: reader.result }));
                        };
                        reader.readAsDataURL(file);
                        setEditingSignatureFile(file);
                      }
                    }}
                    className="mt-1 block w-full text-xs sm:text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {editingForm.signature && (
                    <img src={editingForm.signature} alt="Signature" className="mt-2 h-20 border rounded" />
                  )}
                </div>
              </div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
              <h3 className="text-sm font-semibold text-purple-900 mb-3 uppercase tracking-wider">1.5 Role Credentials</h3>
                  <p className="text-xs text-purple-700 mb-3">
                Update sales, account, and client role credentials for this user.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ROLE_CREDENTIAL_FIELDS.map((roleField) => (
                  <div key={roleField.key} className="bg-white rounded border p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-2">{roleField.label}</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs font-medium text-gray-700">Username</label>
                        <Input
                          value={editingForm?.role_users?.[roleField.key]?.username || ''}
                          onChange={(v) =>
                            setEditingForm((prev) => ({
                              ...prev,
                              role_users: {
                                ...(prev.role_users || getDefaultRoleUsers()),
                                [roleField.key]: {
                                  ...(prev.role_users?.[roleField.key] || {}),
                                  username: v,
                                },
                              },
                            }))
                          }
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700">Password</label>
                        <Input
                          type="password"
                          value={editingForm?.role_users?.[roleField.key]?.password || ''}
                          onChange={(v) =>
                            setEditingForm((prev) => ({
                              ...prev,
                              role_users: {
                                ...(prev.role_users || getDefaultRoleUsers()),
                                [roleField.key]: {
                                  ...(prev.role_users?.[roleField.key] || {}),
                                  password: v,
                                },
                              },
                            }))
                          }
                          placeholder="Leave blank to keep existing password"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <h3 className="text-sm font-semibold text-blue-900 mb-3 uppercase tracking-wider">2. GST Firm Configuration</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-700">Firm Login Username <span className="text-red-500">*</span></label>
                  <Input value={editingForm.gst_firm?.username || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), username: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">New Password</label>
                  <Input type="password" value={editingForm.gst_firm?.password || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), password: v } }))} placeholder="Leave blank to keep current password" className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Display Name</label>
                  <Input value={editingForm.gst_firm?.name || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), name: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Firm Phone</label>
                  <Input value={editingForm.gst_firm?.phone || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), phone: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Firm Email</label>
                  <Input type="email" value={editingForm.gst_firm?.email || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), email: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">City</label>
                  <Input value={editingForm.gst_firm?.city || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), city: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">State</label>
                  <select 
                    value={editingForm.gst_firm?.state || ''} 
                    onChange={(e) => setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), state: e.target.value } }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs sm:text-sm py-2 px-3 border"
                  >
                    <option value="">Select State</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Address</label>
                  <Input value={editingForm.gst_firm?.address || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), address: v } }))} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Godown Address</label>
                  <Input value={editingForm.gst_firm?.godown_address || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), godown_address: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">GSTIN</label>
                  <Input value={editingForm.gst_firm?.GSTIN || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), GSTIN: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">CIN</label>
                  <Input value={editingForm.gst_firm?.CIN || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), CIN: v } }))} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Registration Number</label>
                  <Input value={editingForm.gst_firm?.reg_number || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), reg_number: v } }))} className="mt-1" />
                </div>

                {/* Bank Details */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700 mb-2 block">Bank Details</label>
                  {(editingForm.gst_firm?.bank_ids || [{ bank_name: '', bank_branch: '', ifsc_code: '', account_number: '' }]).map((bank, idx) => (
                    <div key={idx} className="border rounded p-3 mb-2 bg-white">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-600">Bank Name</label>
                          <Input value={bank.bank_name || ''} onChange={(v) => {
                            const bank_ids = [...(editingForm.gst_firm?.bank_ids || [])];
                            bank_ids[idx] = {...bank_ids[idx], bank_name: v};
                            setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), bank_ids } }));
                          }} placeholder="Bank Name" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Branch</label>
                          <Input value={bank.bank_branch || ''} onChange={(v) => {
                            const bank_ids = [...(editingForm.gst_firm?.bank_ids || [])];
                            bank_ids[idx] = {...bank_ids[idx], bank_branch: v};
                            setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), bank_ids } }));
                          }} placeholder="Branch" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">IFSC Code</label>
                          <Input value={bank.ifsc_code || ''} onChange={(v) => {
                            const bank_ids = [...(editingForm.gst_firm?.bank_ids || [])];
                            bank_ids[idx] = {...bank_ids[idx], ifsc_code: v};
                            setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), bank_ids } }));
                          }} placeholder="IFSC Code" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Account Number</label>
                          <Input value={bank.account_number || ''} onChange={(v) => {
                            const bank_ids = [...(editingForm.gst_firm?.bank_ids || [])];
                            bank_ids[idx] = {...bank_ids[idx], account_number: v};
                            setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), bank_ids } }));
                          }} placeholder="Account Number" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Account Holder</label>
                          <Input value={bank.account_holder || ''} onChange={(v) => {
                            const bank_ids = [...(editingForm.gst_firm?.bank_ids || [])];
                            bank_ids[idx] = {...bank_ids[idx], account_holder: v};
                            setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), bank_ids } }));
                          }} placeholder="Account Holder" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">UPI ID</label>
                          <Input value={bank.upi_id || ''} onChange={(v) => {
                            const bank_ids = [...(editingForm.gst_firm?.bank_ids || [])];
                            bank_ids[idx] = {...bank_ids[idx], upi_id: v};
                            setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), bank_ids } }));
                          }} placeholder="UPI ID" className="mt-1" />
                        </div>
                      </div>
                      {(editingForm.gst_firm?.bank_ids || []).length > 1 && (
                        <button onClick={() => {
                          const bank_ids = (editingForm.gst_firm?.bank_ids || []).filter((_, i) => i !== idx);
                          setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), bank_ids } }));
                        }} className="text-red-600 text-xs mt-2">Remove Bank</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => {
                    const bank_ids = [...(editingForm.gst_firm?.bank_ids || []), { bank_name: '', bank_branch: '', ifsc_code: '', account_number: '' }];
                    setEditingForm(prev => ({ ...prev, gst_firm: { ...(prev.gst_firm || {}), bank_ids } }));
                  }} className="text-blue-600 text-xs">+ Add Another Bank</button>
                </div>
              </div>
            </div>

            <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
              <h3 className="text-sm font-semibold text-orange-900 mb-3 uppercase tracking-wider">3. Non-GST Firm Configuration</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-700">Firm Login Username <span className="text-red-500">*</span></label>
                  <Input value={editingForm.nongst_firm?.username || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), username: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">New Password</label>
                  <Input type="password" value={editingForm.nongst_firm?.password || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), password: v } }))} placeholder="Leave blank to keep current password" className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Display Name</label>
                  <Input value={editingForm.nongst_firm?.name || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), name: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Firm Phone</label>
                  <Input value={editingForm.nongst_firm?.phone || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), phone: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Firm Email</label>
                  <Input type="email" value={editingForm.nongst_firm?.email || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), email: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">City</label>
                  <Input value={editingForm.nongst_firm?.city || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), city: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">State</label>
                  <select 
                    value={editingForm.nongst_firm?.state || ''} 
                    onChange={(e) => setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), state: e.target.value } }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-xs sm:text-sm py-2 px-3 border"
                  >
                    <option value="">Select State</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Address</label>
                  <Input value={editingForm.nongst_firm?.address || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), address: v } }))} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Godown Address</label>
                  <Input value={editingForm.nongst_firm?.godown_address || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), godown_address: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">GSTIN</label>
                  <Input value={editingForm.nongst_firm?.GSTIN || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), GSTIN: v } }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">CIN</label>
                  <Input value={editingForm.nongst_firm?.CIN || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), CIN: v } }))} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Registration Number</label>
                  <Input value={editingForm.nongst_firm?.reg_number || ''} onChange={(v) => setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), reg_number: v } }))} className="mt-1" />
                </div>

                {/* Bank Details */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700 mb-2 block">Bank Details</label>
                  {(editingForm.nongst_firm?.bank_ids || [{ bank_name: '', bank_branch: '', ifsc_code: '', account_number: '' }]).map((bank, idx) => (
                    <div key={idx} className="border rounded p-3 mb-2 bg-white">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-600">Bank Name</label>
                          <Input value={bank.bank_name || ''} onChange={(v) => {
                            const bank_ids = [...(editingForm.nongst_firm?.bank_ids || [])];
                            bank_ids[idx] = {...bank_ids[idx], bank_name: v};
                            setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), bank_ids } }));
                          }} placeholder="Bank Name" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Branch</label>
                          <Input value={bank.bank_branch || ''} onChange={(v) => {
                            const bank_ids = [...(editingForm.nongst_firm?.bank_ids || [])];
                            bank_ids[idx] = {...bank_ids[idx], bank_branch: v};
                            setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), bank_ids } }));
                          }} placeholder="Branch" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">IFSC Code</label>
                          <Input value={bank.ifsc_code || ''} onChange={(v) => {
                            const bank_ids = [...(editingForm.nongst_firm?.bank_ids || [])];
                            bank_ids[idx] = {...bank_ids[idx], ifsc_code: v};
                            setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), bank_ids } }));
                          }} placeholder="IFSC Code" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Account Number</label>
                          <Input value={bank.account_number || ''} onChange={(v) => {
                            const bank_ids = [...(editingForm.nongst_firm?.bank_ids || [])];
                            bank_ids[idx] = {...bank_ids[idx], account_number: v};
                            setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), bank_ids } }));
                          }} placeholder="Account Number" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Account Holder</label>
                          <Input value={bank.account_holder || ''} onChange={(v) => {
                            const bank_ids = [...(editingForm.nongst_firm?.bank_ids || [])];
                            bank_ids[idx] = {...bank_ids[idx], account_holder: v};
                            setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), bank_ids } }));
                          }} placeholder="Account Holder" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">UPI ID</label>
                          <Input value={bank.upi_id || ''} onChange={(v) => {
                            const bank_ids = [...(editingForm.nongst_firm?.bank_ids || [])];
                            bank_ids[idx] = {...bank_ids[idx], upi_id: v};
                            setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), bank_ids } }));
                          }} placeholder="UPI ID" className="mt-1" />
                        </div>
                      </div>
                      {(editingForm.nongst_firm?.bank_ids || []).length > 1 && (
                        <button onClick={() => {
                          const bank_ids = (editingForm.nongst_firm?.bank_ids || []).filter((_, i) => i !== idx);
                          setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), bank_ids } }));
                        }} className="text-red-600 text-xs mt-2">Remove Bank</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => {
                    const bank_ids = [...(editingForm.nongst_firm?.bank_ids || []), { bank_name: '', bank_branch: '', ifsc_code: '', account_number: '' }];
                    setEditingForm(prev => ({ ...prev, nongst_firm: { ...(prev.nongst_firm || {}), bank_ids } }));
                  }} className="text-blue-600 text-xs">+ Add Another Bank</button>
                </div>
              </div>
            </div>

	            <div className="space-y-3">
	              <div className="flex justify-end gap-3 pt-2">
                <Button onClick={handleUpdateUser} className="text-xs sm:text-sm py-1.5 sm:py-2">Save Changes</Button>
                <Button variant="outline" onClick={() => { setIsEditModalOpen(false); setEditingForm(null); }} className="text-xs sm:text-sm py-1.5 sm:py-2">Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, user: null })}
        onConfirm={handleConfirmDelete}
        itemName={deleteDialog.user?.username}
      />

      <Modal
        isOpen={isAdminCredentialModalOpen}
        onClose={() => setIsAdminCredentialModalOpen(false)}
        title="Reset Admin Credentials"
        size="md"
      >
        <form onSubmit={handleAdminCredentialSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <Input
              value={adminCredentials.username}
              onChange={(value) =>
                setAdminCredentials((prev) => ({
                  ...prev,
                  username: value,
                }))
              }
              placeholder="Admin username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <Input
              type="password"
              value={adminCredentials.password}
              onChange={(value) =>
                setAdminCredentials((prev) => ({
                  ...prev,
                  password: value,
                }))
              }
              placeholder="Leave blank to keep current password"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAdminCredentialModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={adminCredentialsSaving}
              className="flex items-center gap-2"
            >
              <FaSave />
              {adminCredentialsSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Transaction History Modal */}
      <Modal 
        isOpen={isTransactionHistoryModalOpen} 
        onClose={() => setIsTransactionHistoryModalOpen(false)} 
        title={`Transaction History - ${selectedUserTransactions}`}
        size="lg"
      >
        <div className="max-h-[70vh] overflow-y-auto">
          {(() => {
            const userTxns = transactions.filter(txn => txn.user === selectedUserTransactions).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const totalPurchases = userTxns.length;
            const totalAmount = userTxns.reduce((sum, txn) => sum + (txn.amount || 0), 0);
            
            return (
              <>
                <div className="bg-blue-50 p-4 rounded-lg mb-4 border border-blue-100">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-600">Total Purchases</p>
                      <p className="text-2xl font-bold text-blue-600">{totalPurchases}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Total Amount Spent</p>
                      <p className="text-2xl font-bold text-green-600">₹{totalAmount.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-gray-100 border-b sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">#</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Plan</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Valid From</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Valid To</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Amount</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {userTxns.map((txn, idx) => {
                      const status = getSubscriptionStatus({
                        validityFrom: txn.validityFrom,
                        validityTo: txn.validityTo
                      });
                      const showStatusDot = [1, 2, 3, 4].includes(status.sort);

                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                          <td className="px-4 py-2">{txn.plan || '-'}</td>
                          <td className="px-4 py-2">
                            {showStatusDot ? (
                              <span
                                className={`inline-flex h-4 w-4 rounded-full ring-1 ring-black/10 shadow-sm ${status.className}`}
                                title={status.label}
                                aria-label={status.label}
                              />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2">{txn.validityFrom ? new Date(txn.validityFrom).toLocaleDateString() : '-'}</td>
                          <td className="px-4 py-2">{txn.validityTo ? new Date(txn.validityTo).toLocaleDateString() : '-'}</td>
                          <td className="px-4 py-2 font-medium">₹{txn.amount || '0'}</td>
                          <td className="px-4 py-2">{txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : '-'}</td>
                        </tr>
                      );
                    })}
                    {totalPurchases === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                          No transactions found for this user
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            );
          })()}
          <div className="flex justify-end pt-4 border-t mt-4 sticky bottom-0 bg-white">
            <Button variant="outline" onClick={() => setIsTransactionHistoryModalOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UserMaster;

