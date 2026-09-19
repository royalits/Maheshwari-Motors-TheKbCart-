import { useState, useEffect } from 'react';
import { FaCircleExclamation, FaTriangleExclamation, FaEye, FaEyeSlash, FaPhone, FaBuilding } from 'react-icons/fa6';
import { useNavigate } from 'react-router-dom';
import useStore from '../../store';
import api from '../../services/axiosInstance';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const Login = () => {
  const navigate = useNavigate();
  const { setUser, showToast, setLoading } = useStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  const [expiryAlertData, setExpiryAlertData] = useState(null);
  const [pendingRedirect, setPendingRedirect] = useState(null);
  const [loginBranding, setLoginBranding] = useState(null);

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const res = await api.get('/auth/login-branding');
        if (res.data?.data) {
          setLoginBranding(res.data.data);
        }
      } catch (err) {
        console.warn('Could not load login branding', err);
      }
    };
    fetchBranding();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.username?.trim()) newErrors.username = 'Username is required';
    if (!formData.password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm() || isSubmitting) return;

    const enteredUsername = formData.username.trim();
    const isNonGstLogin = enteredUsername.endsWith('0');
    const username = isNonGstLogin ? enteredUsername.slice(0, -1).trim() : enteredUsername;
    const firmType = isNonGstLogin ? 'NON_GST' : 'GST';

    if (!username) {
      setErrors({ username: 'Username is required' });
      return;
    }

    setIsSubmitting(true);
    setLoading(true);
    try {
      const loginPayload = {
        password: formData.password,
        firm_type: firmType,
        device_name: 'Web',
        device_type: 'web'
      };

      let response;
      try {
        response = await api.post('/auth/login', {
          username,
          ...loginPayload
        });
      } catch (firstError) {
        const shouldRetryWithEnteredUsername =
          isNonGstLogin &&
          username !== enteredUsername &&
          firstError?.response?.data?.message === 'Invalid firm credentials';

        if (!shouldRetryWithEnteredUsername) {
          throw firstError;
        }

        response = await api.post('/auth/login', {
          username: enteredUsername,
          ...loginPayload
        });
      }

      const payload = response?.data?.data;
      const token = payload?.token;

      if (!token || typeof token !== 'string') {
        throw new Error('Invalid login response');
      }

      const { token: _, ...userData } = payload;
      localStorage.setItem('token', token);
      localStorage.setItem('userRole', userData?.role || '');
      localStorage.setItem(
        'firm_type',
        userData.firm_data?.firm_type || userData.current_firm_type || '',
      );
      localStorage.setItem(
        'firm_role',
        userData?.current_firm_role || userData?.firm_data?.firm_role || '',
      );
      localStorage.setItem(
        'credential_key',
        userData?.current_credential_key || userData?.credential_key || '',
      );

      setUser(userData);
      showToast('Login successful', 'success');

      const alert = userData?.subscription_expiry_alert;
      const targetPath = userData.role === 'admin' ? '/masters/user-master' : '/dashboard';

      if (alert?.is_expiring_soon) {
        setExpiryAlertData(alert);
        setPendingRedirect(targetPath);
      } else {
        navigate(targetPath);
      }
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        (error?.code === 'ECONNABORTED' ? 'Request timed out. Please try again.' : null) ||
        (error?.code === 'ERR_NETWORK' ? 'Network error. Check your connection.' : null) ||
        'Invalid credentials or server error.';

      showToast(msg, 'error');
      setErrors({ general: msg });
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  return (
    <main className="w-full bg-neutral-50 flex items-center justify-center min-h-screen relative">
      {/* Subscription Expiry Alert Modal on Login */}
      {expiryAlertData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-200">
            <div className="flex items-start gap-3 border-b border-neutral-100 pb-4 mb-4">
              <div
                className={`p-3 rounded-xl ${
                  expiryAlertData.days_remaining <= 3 || expiryAlertData.is_expired
                    ? 'bg-red-100 text-red-600 animate-pulse'
                    : 'bg-amber-100 text-amber-600'
                }`}
              >
                <FaTriangleExclamation className="text-2xl" />
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 text-lg">Subscription Expiry Warning</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`px-2.5 py-0.5 text-[11px] font-extrabold uppercase rounded-full ${
                      expiryAlertData.days_remaining <= 3 || expiryAlertData.is_expired
                        ? 'bg-red-600 text-white'
                        : 'bg-amber-600 text-white'
                    }`}
                  >
                    {expiryAlertData.is_expired
                      ? 'Subscription Expired'
                      : expiryAlertData.days_remaining === 1
                      ? 'Expires Tomorrow!'
                      : `${expiryAlertData.days_remaining} Days Remaining`}
                  </span>
                  <span className="text-[11px] font-bold text-neutral-500 uppercase">
                    ({expiryAlertData.plan_type} Plan)
                  </span>
                </div>
              </div>
            </div>

            <p className="text-sm text-neutral-700 leading-relaxed mb-6">
              {expiryAlertData.is_expired
                ? 'Emergency Alert: Your subscription plan has expired! Please renew immediately to prevent service lockout.'
                : `Emergency Alert: Your subscription plan will expire in ${expiryAlertData.days_remaining} day${
                    expiryAlertData.days_remaining === 1 ? '' : 's'
                  } on ${formatDate(expiryAlertData.expiry_date)}. Please renew your plan to ensure continuous access.`}
            </p>

            <button
              type="button"
              onClick={() => {
                const target = pendingRedirect || '/dashboard';
                setExpiryAlertData(null);
                setPendingRedirect(null);
                navigate(target);
              }}
              className="w-full py-2.5 px-4 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-xl text-sm transition shadow-sm"
            >
              Proceed to Dashboard
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-md mx-auto p-4">
        <div className="bg-white border border-neutral-200 rounded-lg shadow-sm">
          <div className="p-6 border-b border-neutral-200">
            <div className="flex flex-col items-center text-center">
              <img
                src="/thekbcart_logo_full.png"
                alt="The KbCart"
                className="mb-3 h-24 w-72 object-contain sm:w-80"
              />
              {loginBranding?.enabled !== false && loginBranding?.firm_name && (
                <div className="mb-2 inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-full shadow-xs">
                  <FaBuilding className="text-blue-600 text-xs" />
                  <span className="text-xs font-bold text-blue-900 tracking-wide uppercase">
                    {loginBranding.firm_name}
                  </span>
                </div>
              )}
              <p className="text-sm text-neutral-500 mt-1">Enter your credentials to login.</p>
            </div>
          </div>

          <div className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm text-neutral-700">Username</label>
                <input
                  name="username"
                  type="text"
                  required
                  placeholder="Enter username"
                  value={formData.username}
                  onChange={handleChange}
                  className={`mt-1 block w-full px-3 py-2 bg-white border rounded-md text-sm placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 focus:border-neutral-900 ${
                    errors.username ? 'border-red-300' : 'border-neutral-300'
                  }`}
                />
                {errors.username && <p className="mt-1 text-sm text-red-600">{errors.username}</p>}
              </div>

              <div>
                <label className="block text-sm text-neutral-700">Password</label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                    className={`mt-1 block w-full px-3 py-2 pr-10 bg-white border rounded-md text-sm placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 focus:border-neutral-900 ${
                      errors.password ? 'border-red-300' : 'border-neutral-300'
                    }`}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? (
                      <FaEyeSlash className="h-4 w-4 text-neutral-400" />
                    ) : (
                      <FaEye className="h-4 w-4 text-neutral-400" />
                    )}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
              </div>

              {errors.general && (
                <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md p-3 flex items-start gap-3">
                  <FaCircleExclamation className="text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-red-600 font-medium">{errors.general}</p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-2 px-4 rounded-md shadow-sm text-sm text-white bg-neutral-900 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 disabled:opacity-60"
              >
                {isSubmitting ? 'Logging in...' : 'Log In'}
              </button>
            </form>
          </div>

          <div className="p-4 bg-neutral-50 border-t border-neutral-200 rounded-b-lg text-center">
            {loginBranding?.enabled !== false && loginBranding?.phone && (
              <div className="flex flex-col items-center justify-center gap-1 mb-2">
                <span className="text-[11px] font-medium text-neutral-500">
                  {loginBranding.tagline || 'Support & Inquiries:'}
                </span>
                <a
                  href={`tel:${loginBranding.phone.replace(/[^0-9+]/g, '')}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition"
                >
                  <FaPhone className="text-[10px] text-blue-500" />
                  {loginBranding.phone}
                </a>
              </div>
            )}
            <p className="text-xs text-neutral-400">Copyright 2025.</p>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Login;
