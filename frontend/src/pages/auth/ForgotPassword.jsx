import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FaArrowLeft, FaEnvelope } from "react-icons/fa6";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
        {!isSubmitted ? (
          <>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-neutral-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <FaEnvelope className="text-neutral-600" />
              </div>
              <h1 className="text-xl text-neutral-900 mb-2">Forgot Password?</h1>
              <p className="text-sm text-neutral-500">
                Enter your email address and we'll send you a link to reset your password.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-neutral-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-800"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-neutral-900 text-white py-2 rounded-md hover:bg-neutral-800"
              >
                Send Reset Link
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900"
              >
                <FaArrowLeft className="text-xs" />
                Back to Login
              </Link>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <FaEnvelope className="text-green-600" />
            </div>
            <h1 className="text-xl text-neutral-900 mb-2">Check Your Email</h1>
            <p className="text-sm text-neutral-500 mb-6">
              We've sent a password reset link to <strong>{email}</strong>
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900"
            >
              <FaArrowLeft className="text-xs" />
              Back to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;