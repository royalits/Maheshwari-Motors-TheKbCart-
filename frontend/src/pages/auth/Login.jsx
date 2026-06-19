import { useState } from 'react';
import { FaCircleExclamation, FaEye, FaEyeSlash } from 'react-icons/fa6';
import { useNavigate } from 'react-router-dom';
import useStore from '../../store';
import api from '../../services/axiosInstance';

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
      localStorage.setItem('firm_type', userData.firm_data?.firm_type);
      localStorage.setItem(
        'firm_role',
        userData?.current_firm_role || userData?.firm_data?.firm_role || '',
      );

      setUser(userData);
      showToast('Login successful', 'success');
      
      // Redirect based on role
      if (userData.role === 'admin') {
        navigate('/masters/user-master');
      } else {
        navigate('/dashboard');
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
    <main className="w-full bg-neutral-50 flex items-center justify-center min-h-screen">
      <div className="w-full max-w-md mx-auto p-4">
        <div className="bg-white border border-neutral-200 rounded-lg shadow-sm">
          <div className="p-6 border-b border-neutral-200">
            <div className="flex flex-col items-center text-center">
              <img
                src="/thekbcart_logo_full.png"
                alt="The KbCart"
                className="mb-5 h-24 w-72 object-contain sm:w-80"
              />
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
                  <FaCircleExclamation className="text-red-600 mt-0.5" />
                  <div>
                    <p className="text-red-600">{errors.general}</p>
                  </div>
                </div>
              )}

              {/* <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-neutral-800 border-neutral-300 rounded focus:ring-neutral-900"
                  />
                  <label className="ml-2 block text-sm text-neutral-700">Remember me</label>
                </div>
                <Link to="/forgot-password" className="text-sm text-neutral-600 hover:text-neutral-900">
                  Forgot password?
                </Link>
              </div> */}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-2 px-4 rounded-md shadow-sm text-sm text-white bg-neutral-900 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 disabled:opacity-60"
              >
                {isSubmitting ? 'Logging in...' : 'Log In'}
              </button>
            </form>
          </div>

          <div className="p-6 bg-neutral-50 border-t border-neutral-200 rounded-b-lg">
            <p className="text-xs text-center text-neutral-500">Copyright 2025.</p>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Login;
