import { useState, useEffect } from 'react';
import {
  FaDatabase,
  FaDownload,
  FaEdit,
  FaKey,
  FaPlus,
  FaRedo,
  FaSave,
  FaTrash,
  FaToggleOff,
  FaToggleOn,
  FaUsers,
  FaStore,
  FaPhone,
} from 'react-icons/fa';
import api from '../../services/axiosInstance';
import useStore from '../../store';

const AdminPanel = () => {
  const { showToast } = useStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeScreen, setActiveScreen] = useState('users');
  const [backups, setBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);
  const [restoreId, setRestoreId] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const [adminCredentials, setAdminCredentials] = useState({ username: '', password: '' });
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [brandingData, setBrandingData] = useState({
    enabled: true,
    firm_name: '',
    phone: '',
    tagline: '',
  });
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (activeScreen === 'backup') {
      fetchBackups();
    } else if (activeScreen === 'branding') {
      fetchBranding();
    }
  }, [activeScreen]);

  const fetchBranding = async () => {
    try {
      setBrandingLoading(true);
      const res = await api.get('/admin/login-branding');
      const data = res.data?.data || {};
      setBrandingData({
        enabled: data.enabled !== false,
        firm_name: data.firm_name || '',
        phone: data.phone || '',
        tagline: data.tagline || '',
      });
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to fetch login branding', 'error');
    } finally {
      setBrandingLoading(false);
    }
  };

  const handleBrandingSave = async (e) => {
    e?.preventDefault?.();
    const phoneInput = String(brandingData.phone || '').trim();
    if (phoneInput) {
      const digits = phoneInput.replace(/\D/g, '');
      if (
        digits.length < 10 ||
        digits.length > 15 ||
        !/^[+]?[\d\s-]{10,20}$/.test(phoneInput)
      ) {
        showToast(
          'Please enter a valid phone number (10 to 15 digits)',
          'error',
        );
        return;
      }
    }

    try {
      setBrandingSaving(true);
      await api.put('/admin/login-branding', {
        ...brandingData,
        phone: phoneInput,
        firm_name: String(brandingData.firm_name || '').trim(),
        tagline: String(brandingData.tagline || '').trim(),
      });
      showToast('Login branding settings saved successfully', 'success');
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to save branding settings', 'error');
    } finally {
      setBrandingSaving(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const [usersResponse, profileResponse] = await Promise.all([
        api.get('/admin/users'),
        api.get('/auth/me'),
      ]);
      setUsers(usersResponse.data.data?.data || usersResponse.data.data || []);
      const profile = profileResponse.data.data || {};
      setAdminCredentials((prev) => ({
        ...prev,
        username: profile.admin?.username || profile.username || '',
      }));
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to fetch users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminCredentialSave = async (event) => {
    event.preventDefault();
    const username = adminCredentials.username.trim();
    if (username.length < 3) {
      showToast('Admin username must be at least 3 characters', 'error');
      return;
    }

    try {
      setCredentialsSaving(true);
      const payload = { admin: { username } };
      if (adminCredentials.password) {
        payload.admin.password = adminCredentials.password;
      }
      await api.put('/auth/credentials', { credentials: payload });
      setAdminCredentials((prev) => ({ ...prev, password: '' }));
      showToast('Admin credentials updated successfully', 'success');
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to update admin credentials', 'error');
    } finally {
      setCredentialsSaving(false);
    }
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    try {
      const endpoint = currentStatus
        ? `/admin/users/${userId}/deactivate`
        : `/admin/users/${userId}/reactivate`;
      await api.post(endpoint);
      showToast(`User ${currentStatus ? 'deactivated' : 'reactivated'} successfully`, 'success');
      fetchUsers();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to update user status', 'error');
    }
  };

  const fetchBackups = async () => {
    try {
      setBackupLoading(true);
      const response = await api.get('/admin/platform-backups', {
        skipCache: true,
      });
      setBackups(response.data.data || []);
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to fetch backups', 'error');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setBackupCreating(true);
      await api.post('/admin/platform-backups');
      showToast('Platform backup created successfully', 'success');
      fetchBackups();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to create backup', 'error');
    } finally {
      setBackupCreating(false);
    }
  };

  const handleRestoreBackup = async (backup) => {
    const confirmBackupNo = window.prompt(
      `Type ${backup.backup_no} to restore this platform backup`,
    );
    if (confirmBackupNo !== backup.backup_no) {
      return;
    }

    try {
      setRestoreId(backup._id);
      await api.post(`/admin/platform-backups/${backup._id}/restore`, {
        confirm_backup_no: backup.backup_no,
      });
      showToast('Platform backup restored successfully', 'success');
      fetchBackups();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to restore backup', 'error');
    } finally {
      setRestoreId('');
    }
  };

  const handleDownloadBackup = async (backup) => {
    try {
      setDownloadingId(backup._id);
      const response = await api.get(`/admin/platform-backups/${backup._id}/download`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${backup.backup_no}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to download backup', 'error');
    } finally {
      setDownloadingId('');
    }
  };

  const handleDeleteBackup = async (backup) => {
    if (!window.confirm(`Delete backup ${backup.backup_no}?`)) {
      return;
    }

    try {
      await api.delete(`/admin/platform-backups/${backup._id}`);
      showToast('Platform backup deleted successfully', 'success');
      fetchBackups();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to delete backup', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-neutral-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Admin Panel</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage users and system settings</p>
        </div>
        {activeScreen === 'users' ? (
          <button className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-md hover:bg-neutral-800">
            <FaPlus />
            Add User
          </button>
        ) : (
          <button
            onClick={handleCreateBackup}
            disabled={backupCreating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
          >
            <FaDatabase />
            {backupCreating ? 'Creating...' : 'Create Backup'}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setActiveScreen('users')}
          className={`px-4 py-2 rounded-md border text-sm ${
            activeScreen === 'users'
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-white text-neutral-700 border-neutral-200'
          }`}
        >
          User Management
        </button>
        <button
          onClick={() => setActiveScreen('backup')}
          className={`px-4 py-2 rounded-md border text-sm ${
            activeScreen === 'backup'
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-white text-neutral-700 border-neutral-200'
          }`}
        >
          Backup & Restore
        </button>
        <button
          onClick={() => setActiveScreen('branding')}
          className={`px-4 py-2 rounded-md border text-sm ${
            activeScreen === 'branding'
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-white text-neutral-700 border-neutral-200'
          }`}
        >
          Login Branding
        </button>
      </div>

      {activeScreen === 'users' && (
        <>
          <form
            onSubmit={handleAdminCredentialSave}
            className="bg-white border border-neutral-200 rounded-lg shadow-sm mb-6"
          >
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-neutral-900 flex items-center gap-2">
            <FaKey />
            Admin Credentials
          </h2>
          <button
            type="submit"
            disabled={credentialsSaving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
          >
            <FaSave />
            {credentialsSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          <label className="text-sm text-neutral-700">
            Username
            <input
              type="text"
              value={adminCredentials.username}
              onChange={(event) =>
                setAdminCredentials((prev) => ({
                  ...prev,
                  username: event.target.value,
                }))
              }
              className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-md"
              autoComplete="username"
            />
          </label>
          <label className="text-sm text-neutral-700">
            New Password
            <input
              type="password"
              value={adminCredentials.password}
              onChange={(event) =>
                setAdminCredentials((prev) => ({
                  ...prev,
                  password: event.target.value,
                }))
              }
              placeholder="Leave blank to keep current password"
              className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-md"
              autoComplete="new-password"
            />
          </label>
        </div>
          </form>

          <div className="bg-white border border-neutral-200 rounded-lg shadow-sm">
        <div className="p-4 border-b border-neutral-200">
          <h2 className="text-lg font-medium text-neutral-900 flex items-center gap-2">
            <FaUsers />
            Users ({users.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {users.map((user) => (
                <tr key={user._id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm text-neutral-900">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{user.email || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      user.type === 'main' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {user.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => toggleUserStatus(user._id, user.is_active)}
                      className="flex items-center gap-1"
                    >
                      {user.is_active ? (
                        <>
                          <FaToggleOn className="text-green-600 text-xl" />
                          <span className="text-green-600 text-xs">Active</span>
                        </>
                      ) : (
                        <>
                          <FaToggleOff className="text-neutral-400 text-xl" />
                          <span className="text-neutral-400 text-xs">Inactive</span>
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <button className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded">
                        <FaEdit />
                      </button>
                      {user.type !== 'main' && (
                        <button className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded">
                          <FaTrash />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          </div>
        </>
      )}

      {activeScreen === 'backup' && (
        <div className="bg-white border border-neutral-200 rounded-lg shadow-sm">
          <div className="p-4 border-b border-neutral-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-neutral-900 flex items-center gap-2">
                <FaDatabase />
                Backup & Restore
              </h2>
              <p className="text-sm text-neutral-500 mt-1">
                Platform-wide database snapshots stored inside database.
              </p>
            </div>
            <button
              onClick={fetchBackups}
              disabled={backupLoading}
              className="flex items-center gap-2 px-4 py-2 border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-60"
            >
              <FaRedo />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Backup No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Collections</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Records</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Size</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Restored At</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {backupLoading ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-sm text-neutral-500">
                      Loading backups...
                    </td>
                  </tr>
                ) : backups.length ? (
                  backups.map((backup) => (
                    <tr key={backup._id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                        {backup.backup_no}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {backup.created_at ? new Date(backup.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          backup.status === 'success'
                            ? 'bg-green-100 text-green-800'
                            : backup.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : backup.status === 'restoring'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {backup.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {backup.total_collections}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {backup.total_records}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {backup.size_mb || 0} MB
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {backup.restored_at ? new Date(backup.restored_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRestoreBackup(backup)}
                            disabled={backup.status !== 'success' || restoreId === backup._id}
                            className="px-3 py-2 text-blue-700 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50"
                          >
                            {restoreId === backup._id ? 'Restoring...' : 'Restore'}
                          </button>
                          <button
                            onClick={() => handleDownloadBackup(backup)}
                            disabled={backup.status !== 'success' || downloadingId === backup._id}
                            title="Download backup as JSON"
                            className="p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded disabled:opacity-50"
                          >
                            {downloadingId === backup._id
                              ? <span className="text-xs">...</span>
                              : <FaDownload />}
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(backup)}
                            className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-sm text-neutral-500">
                      No platform backups found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeScreen === 'branding' && (
        <form
          onSubmit={handleBrandingSave}
          className="bg-white border border-neutral-200 rounded-lg shadow-sm max-w-2xl"
        >
          <div className="p-4 border-b border-neutral-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-neutral-900 flex items-center gap-2">
                <FaStore />
                Login Screen Branding
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Customize Firm Name & Support Contact displayed on the login page
              </p>
            </div>
            <button
              type="submit"
              disabled={brandingSaving || brandingLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60 text-sm font-medium"
            >
              <FaSave />
              {brandingSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between p-3.5 bg-neutral-50 border border-neutral-200 rounded-lg">
              <div>
                <p className="text-sm font-semibold text-neutral-900">Show on Login Screen</p>
                <p className="text-xs text-neutral-500">Enable or disable branding on the public login page</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={brandingData.enabled}
                  onChange={(e) =>
                    setBrandingData((prev) => ({
                      ...prev,
                      enabled: e.target.checked,
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Firm / Business Name
              </label>
              <input
                type="text"
                value={brandingData.firm_name}
                onChange={(e) =>
                  setBrandingData((prev) => ({
                    ...prev,
                    firm_name: e.target.value,
                  }))
                }
                placeholder="e.g. Maheshwari Motors"
                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Contact / Support Mobile Number
              </label>
              <input
                type="text"
                value={brandingData.phone}
                onChange={(e) =>
                  setBrandingData((prev) => ({
                    ...prev,
                    phone: e.target.value,
                  }))
                }
                placeholder="e.g. +91 98765 43210"
                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Support Tagline (Optional)
              </label>
              <input
                type="text"
                value={brandingData.tagline}
                onChange={(e) =>
                  setBrandingData((prev) => ({
                    ...prev,
                    tagline: e.target.value,
                  }))
                }
                placeholder="e.g. For login assistance or inquiries:"
                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </form>
      )}
    </div>
  );
};

export default AdminPanel;
