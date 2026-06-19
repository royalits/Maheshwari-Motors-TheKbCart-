import api from '../../services/axiosInstance';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FaUser, FaSignOutAlt, FaEdit, FaSave, FaTimes } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '../../components/ui';
import useStore from '../../store';

const Settings = () => {
  const navigate = useNavigate();
  const setUser = useStore((s) => s.setUser);
  const showToast = useStore((s) => s.showToast);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const { data: authData, isLoading: loading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res?.data?.data || {};
    },
    staleTime: 5 * 60 * 1000,
  });

  const [profileOverrides, setProfileOverrides] = useState({});
  const profileData = useMemo(() => ({
    username: profileOverrides.username ?? authData?.username ?? authData?.name ?? '',
    email: profileOverrides.email ?? authData?.email ?? '',
  }), [authData, profileOverrides]);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // Ignore API logout failures and clear local session anyway.
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('userRole');
      localStorage.removeItem('firm_type');
      localStorage.removeItem('firm_role');
      setUser(null);
      showToast('Logged out successfully', 'success');
      navigate('/login');
    }
  };

  const handleSaveProfile = async () => {
    showToast('Profile update endpoint is not available in current API.', 'error');
    setIsEditingProfile(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your account and preferences</p>
      </div>

      <div className="bg-white p-6 rounded-lg border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FaUser className="text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">User Profile</h2>
          </div>
          {!isEditingProfile ? (
            <Button onClick={() => setIsEditingProfile(true)} className="flex items-center gap-2 text-sm" disabled={loading}>
              <FaEdit />
              Edit Profile
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button onClick={handleSaveProfile} className="flex items-center gap-2 text-sm">
                <FaSave />
                Save
              </Button>
              <Button variant="outline" onClick={() => { setProfileOverrides({}); setIsEditingProfile(false); }} className="flex items-center gap-2 text-sm">
                <FaTimes />
                Cancel
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            {isEditingProfile ? (
              <Input value={profileData.username} onChange={(value) => setProfileOverrides((prev) => ({ ...prev, username: value }))} />
            ) : (
              <p className="text-gray-900 py-2">{profileData.username || '-'}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            {isEditingProfile ? (
              <Input type="email" value={profileData.email} onChange={(value) => setProfileOverrides((prev) => ({ ...prev, email: value }))} />
            ) : (
              <p className="text-gray-900 py-2">{profileData.email || '-'}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Account</h2>
            <p className="text-sm text-gray-600">Sign out of your account</p>
          </div>
          <Button onClick={handleLogout} className="flex items-center gap-2 bg-red-600 hover:bg-red-700">
            <FaSignOutAlt />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
