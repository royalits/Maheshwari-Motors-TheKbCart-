import { useMemo, useEffect, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  FaBell,
  FaBuilding,
  FaChartBar,
  FaClipboardList,
  FaEnvelope,
  FaFileInvoice,
  FaKey,
  FaPhone,
  FaStore,
  FaUser,
} from 'react-icons/fa';
import api from '../../services/axiosInstance';
import useStore from '../../store';

const CREDENTIAL_FIELDS = [
  { key: 'gst_firm', label: 'GST Firm' },
  { key: 'nongst_firm', label: 'Non-GST Firm' },
  { key: 'sale_user', label: 'Sale User' },
  { key: 'account_user', label: 'Account User' },
  { key: 'client_user', label: 'Client User' },
];

const getCredentialForm = (user = {}) =>
  CREDENTIAL_FIELDS.reduce((acc, field) => {
    acc[field.key] = {
      username: user?.[field.key]?.username || '',
      password: '',
    };
    return acc;
  }, {});

const hasCredentialUsername = (user = {}, key) =>
  Boolean(String(user?.[key]?.username || '').trim());

const UserProfile = () => {
  const { setUser, showToast } = useStore();
  const [credentialForm, setCredentialForm] = useState(getCredentialForm());
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const signatureInputRef = useRef(null);
  const queries = useQueries({
    queries: [
      {
        queryKey: ['auth', 'me'],
        queryFn: async () => {
          const res = await api.get('/auth/me');
          return res?.data?.data || {};
        },
        staleTime: 0,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: ['challans', { page: 1, limit: 20 }],
        queryFn: () => api.get('/challans', { params: { page: 1, limit: 20 } }),
        staleTime: 2 * 60 * 1000,
      },
      {
        queryKey: ['bills', { page: 1, limit: 20 }],
        queryFn: () => api.get('/bills', { params: { page: 1, limit: 20 } }),
        staleTime: 2 * 60 * 1000,
      },
      {
        queryKey: ['items-low-stock', { page: 1, limit: 200 }],
        queryFn: () => api.get('/items/low-stock', { params: { page: 1, limit: 200 } }),
        staleTime: 2 * 60 * 1000,
      },
    ],
  });

  const loading = queries.some((q) => q.isLoading);
  const freshUserData = queries[0].data || {};
  const userData = freshUserData;

  // Sync fresh /auth/me data into store so useFirmBranding picks it up
  useEffect(() => {
    if (freshUserData && Object.keys(freshUserData).length > 0) {
      setUser(freshUserData);
    }
  }, [freshUserData]);

  const profileData = useMemo(() => {
    const isGstLogin = userData?.current_firm_type === 'GST';
    const isNonGstLogin = userData?.current_firm_type === 'NON_GST';
    const resolvedSignature = isGstLogin
      ? (userData?.gst_firm?.signature || userData?.signature || '')
      : isNonGstLogin
      ? (userData?.nongst_firm?.signature || userData?.signature || '')
      : (userData?.signature || '');

    return {
      name: userData?.name || '',
      email: userData?.email || '',
      phone: userData?.phone || '',
      type: userData?.type || '',
      role: userData?.current_role || userData?.role || '',
      current_firm_type: userData?.current_firm_type || '',
      current_firm_role: userData?.current_firm_role || '',
      is_active: Boolean(userData?.is_active),
      createdAt: userData?.createdAt || '',
      signature: resolvedSignature,
      admin: userData?.admin || {},
      gst_firm: userData?.gst_firm || {},
      nongst_firm: userData?.nongst_firm || {},
      sale_user: userData?.sale_user || {},
      account_user: userData?.account_user || {},
      client_user: userData?.client_user || {},
    };
  }, [userData]);

  const dashboardData = useMemo(() => {
    const challansRes = queries[1].data;
    const billsRes = queries[2].data;
    const lowStockRes = queries[3].data;

    const totalChallans = challansRes?.data?.data?.meta?.total || 0;
    const totalBills = billsRes?.data?.data?.meta?.total || 0;
    const lowStockPayload = lowStockRes?.data?.data;
    const lowStockCount = Array.isArray(lowStockPayload)
      ? lowStockPayload.length
      : (Array.isArray(lowStockPayload?.data) ? lowStockPayload.data.length : (lowStockPayload?.meta?.totalDocs || 0));

    return {
      todaysChallans: totalChallans,
      todaysBills: totalBills,
      lowStockAlerts: Number(lowStockCount || 0),
    };
  }, [queries]);

  const view = (value) => (value !== undefined && value !== null && String(value).trim() !== '' ? String(value) : 'N/A');
  const normalizedFirmType = String(profileData.current_firm_type || '').toUpperCase();
  const hasGstFirm = Boolean(profileData.gst_firm?.username || profileData.gst_firm?.name);
  const hasNonGstFirm = Boolean(profileData.nongst_firm?.username || profileData.nongst_firm?.name);
  const isGstLogin = normalizedFirmType === 'GST' || (!normalizedFirmType && hasGstFirm);
  const activeFirm = isGstLogin ? profileData.gst_firm : profileData.nongst_firm;
  const firmDisplayType = isGstLogin ? 'GST' : hasNonGstFirm ? 'Non-GST' : view(profileData.current_firm_type);
  const profileTitle = activeFirm?.name || profileData.name || 'Firm';

  const editableCredentialFields = useMemo(() => {
    const role = String(profileData.role || '').toLowerCase();
    const firmType = String(profileData.current_firm_type || '').toUpperCase();
    const firmRole = String(profileData.current_firm_role || '').toLowerCase();
    const isConfigured = (field) => hasCredentialUsername(userData, field.key);
    const isRoleCredential = (field) =>
      ['sale_user', 'account_user', 'client_user'].includes(field.key);
    const visibleIfConfigured = (field) =>
      !isRoleCredential(field) || isConfigured(field);

    if (role === 'admin') {
      return CREDENTIAL_FIELDS.filter(visibleIfConfigured);
    }
    if (role !== 'firm' || firmRole !== 'admin') return [];
    if (firmType === 'GST') {
      return CREDENTIAL_FIELDS.filter((field) =>
        ['gst_firm', 'sale_user', 'account_user', 'client_user'].includes(field.key) &&
        visibleIfConfigured(field),
      );
    }
    if (firmType === 'NON_GST') {
      return CREDENTIAL_FIELDS.filter((field) => field.key === 'nongst_firm');
    }
    return [];
  }, [
    profileData.role,
    profileData.current_firm_type,
    profileData.current_firm_role,
    userData,
  ]);

  useEffect(() => {
    if (userData && Object.keys(userData).length > 0) {
      setCredentialForm(getCredentialForm(userData));
    }
  }, [userData]);

  const updateCredentialDraft = (key, field, value) => {
    setCredentialForm((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [field]: value,
      },
    }));
  };

  const saveCredentials = async () => {
    // Check for duplicate usernames
    const allUsernames = new Map();
    const addUsername = (username, displayName) => {
      if (!username) return null;
      const norm = username.trim().toLowerCase();
      if (allUsernames.has(norm)) {
        return `Username '${username}' is already used for ${allUsernames.get(norm)}. Every role must have a unique username.`;
      }
      allUsernames.set(norm, displayName);
      return null;
    };

    let duplicateErr = null;
    const roles = ['gst_firm', 'nongst_firm', 'sale_user', 'account_user', 'client_user'];
    for (const roleKey of roles) {
      const isEditable = editableCredentialFields.some(f => f.key === roleKey);
      let username = userData?.[roleKey]?.username;
      if (isEditable) {
        const draft = credentialForm[roleKey] || {};
        username = draft.username !== undefined ? draft.username : username;
      }
      if (username) {
        duplicateErr = addUsername(username, roleKey.replace('_', ' ').toUpperCase());
        if (duplicateErr) break;
      }
    }

    if (duplicateErr) {
      showToast(duplicateErr, 'error');
      return;
    }

    const credentials = {};

    for (const field of editableCredentialFields) {
      const draft = credentialForm[field.key] || {};
      const username = String(draft.username || '').trim();
      const password = String(draft.password || '');
      const existingUsername = String(userData?.[field.key]?.username || '').trim();
      const isNewCredential = !existingUsername;

      if (username && username.length < 3) {
        showToast(`${field.label} username must be at least 3 characters`, 'error');
        return;
      }
      if (password && password.length < 6) {
        showToast(`${field.label} password must be at least 6 characters`, 'error');
        return;
      }
      if (password && !username && isNewCredential) {
        showToast(`${field.label} username is required`, 'error');
        return;
      }
      if (username && isNewCredential && !password) {
        showToast(`${field.label} password is required`, 'error');
        return;
      }

      const payload = {};
      if (username !== existingUsername) payload.username = username;
      if (password) payload.password = password;
      if (Object.keys(payload).length > 0) credentials[field.key] = payload;
    }

    if (Object.keys(credentials).length === 0) {
      showToast('No credential changes found', 'warning');
      return;
    }

    try {
      setCredentialsSaving(true);
      await api.put('/auth/credentials', { credentials });
      const fresh = await queries[0].refetch();
      if (fresh?.data) {
        setUser(fresh.data);
        setCredentialForm(getCredentialForm(fresh.data));
      } else {
        setCredentialForm((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([key, value]) => [
              key,
              { ...value, password: '' },
            ]),
          ),
        );
      }
      showToast('Credentials updated', 'success');
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to update credentials', 'error');
    } finally {
      setCredentialsSaving(false);
    }
  };

  const updateSignature = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Signature must be an image', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Signature image must be below 2 MB', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('signature', file);

    try {
      setSignatureSaving(true);
      const request = profileData.signature
        ? api.put('/auth/signature', formData)
        : api.post('/auth/signature', formData);
      await request;
      const fresh = await queries[0].refetch();
      if (fresh?.data) setUser(fresh.data);
      showToast('Signature updated', 'success');
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to update signature', 'error');
    } finally {
      setSignatureSaving(false);
    }
  };

  const renderInfoItem = (Icon, label, value, mono = false) => (
    <div className="flex gap-3">
      <Icon className="mt-1 text-slate-700" />
      <div>
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className={`text-sm font-semibold text-slate-950 ${mono ? 'font-mono' : ''}`}>
          {view(value)}
        </div>
      </div>
    </div>
  );

  const detailRows = [
    ['Firm Name', activeFirm?.name],
    ['Username', activeFirm?.username],
    ['Phone', activeFirm?.phone],
    ['Email', activeFirm?.email],
    ['Address', activeFirm?.address],
    ['City', activeFirm?.city],
    ['State', activeFirm?.state],
    ...(isGstLogin
      ? [
          ['Godown Address', activeFirm?.godown_address],
          ['GSTIN', activeFirm?.GSTIN],
          ['CIN', activeFirm?.CIN],
          ['Registration Number', activeFirm?.reg_number],
        ]
      : []),
  ];

  const credentialAccent = {
    gst_firm: 'bg-blue-100 text-blue-700',
    nongst_firm: 'bg-orange-100 text-orange-700',
    sale_user: 'bg-green-100 text-green-700',
    account_user: 'bg-purple-100 text-purple-700',
    client_user: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Firm Details</h1>
        <p className="text-sm text-slate-600">
          Manage your personal information and view activity
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,0.9fr)]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <FaStore className="text-3xl" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  {view(profileTitle)}
                </h2>
                <p className="text-sm font-medium text-slate-600">
                  {view(profileData.role)} - {view(firmDisplayType)}
                </p>
                <span className="mt-1 inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                  {profileData.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            <div className="space-y-6">
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-950">
                  <FaUser className="text-blue-600" />
                  Personal Information
                </h3>
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-4">
                      {renderInfoItem(FaUser, 'Name', profileData.name)}
                      {renderInfoItem(FaPhone, 'Phone', profileData.phone)}
                      {renderInfoItem(
                        FaUser,
                        'Username',
                        profileData.admin?.username ||
                          activeFirm?.username ||
                          profileData.gst_firm?.username ||
                          profileData.nongst_firm?.username,
                      )}
                    </div>
                    <div className="space-y-4">
                      {renderInfoItem(FaEnvelope, 'Email', profileData.email)}
                      <div className="flex gap-3">
                        <FaKey className="mt-1 text-slate-700" />
                        <div>
                          <div className="text-xs font-medium text-slate-500">
                            Signature
                          </div>
                          {profileData.signature ? (
                            <img
                              src={profileData.signature}
                              alt="Signature"
                              className="mt-1 h-20 max-w-xs rounded-md border border-slate-200 object-contain"
                            />
                          ) : (
                            <div className="text-sm font-semibold text-slate-950">
                              N/A
                            </div>
                          )}
                          <input
                            ref={signatureInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={updateSignature}
                          />
                          <button
                            type="button"
                            disabled={signatureSaving}
                            onClick={() => signatureInputRef.current?.click()}
                            className="mt-2 rounded-md border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {signatureSaving ? 'Updating...' : 'Edit Signature'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-950">
                  <FaBuilding className="text-blue-600" />
                  {isGstLogin ? 'GST Firm Details' : 'Non-GST Firm Details'}
                </h3>
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
                    {detailRows.map(([label, value]) => (
                      <div
                        key={label}
                        className="grid grid-cols-[140px_1fr] border-b border-slate-200 py-2 last:border-b-0 md:[&:nth-last-child(2)]:border-b-0"
                      >
                        <span className="text-sm font-medium text-slate-500">
                          {label}
                        </span>
                        <span className="text-sm font-semibold text-slate-950">
                          {view(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {editableCredentialFields.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
                      <FaKey className="text-blue-600" />
                      Credentials
                    </h3>
                    <button
                      type="button"
                      onClick={saveCredentials}
                      disabled={credentialsSaving}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {credentialsSaving ? 'Saving...' : 'Save Credentials'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {editableCredentialFields.map((field) => (
                      <div
                        key={field.key}
                        className="grid grid-cols-[44px_1fr] gap-3 rounded-lg border border-slate-200 p-4"
                      >
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${
                            credentialAccent[field.key] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          <FaUser />
                        </div>
                        <div>
                          <div className="mb-3 text-sm font-bold text-slate-950">
                            {field.label}
                          </div>
                          <div className="space-y-3">
                            <div className="grid grid-cols-[96px_1fr] items-center gap-3">
                              <label className="text-xs font-medium text-slate-700">
                                Username
                              </label>
                              <input
                                type="text"
                                value={credentialForm[field.key]?.username || ''}
                                onChange={(event) =>
                                  updateCredentialDraft(
                                    field.key,
                                    'username',
                                    event.target.value,
                                  )
                                }
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="grid grid-cols-[96px_1fr] items-center gap-3">
                              <label className="text-xs font-medium text-slate-700">
                                New Password
                              </label>
                              <input
                                type="password"
                                value={credentialForm[field.key]?.password || ''}
                                onChange={(event) =>
                                  updateCredentialDraft(
                                    field.key,
                                    'password',
                                    event.target.value,
                                  )
                                }
                                placeholder="Leave blank to keep current"
                                autoComplete="new-password"
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>

          <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-950">
              <FaChartBar className="text-blue-600" />
              Quick Stats
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                    <FaClipboardList />
                  </span>
                  <span className="font-semibold text-slate-950">Total Challans</span>
                </div>
                <span className="text-2xl font-bold text-blue-600">
                  {dashboardData?.todaysChallans || 0}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-700">
                    <FaFileInvoice />
                  </span>
                  <span className="font-semibold text-slate-950">Total Bills</span>
                </div>
                <span className="text-2xl font-bold text-green-600">
                  {dashboardData?.todaysBills || 0}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                    <FaBell />
                  </span>
                  <span className="font-semibold text-slate-950">
                    Total Low Stock Alerts
                  </span>
                </div>
                <span className="text-2xl font-bold text-amber-600">
                  {dashboardData?.lowStockAlerts || 0}
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
