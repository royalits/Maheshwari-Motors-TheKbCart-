import React from 'react';

const Toggle = ({ 
  checked, 
  onChange, 
  label, 
  disabled = false,
  size = 'md'
}) => {
  const sizeClasses = {
    sm: 'w-8 h-4',
    md: 'w-10 h-5',
    lg: 'w-12 h-6'
  };

  const thumbSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4', 
    lg: 'w-5 h-5'
  };

  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only"
        />
        <div className={`
          ${sizeClasses[size]} 
          ${checked ? 'bg-blue-600' : 'bg-gray-300'} 
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          rounded-full transition-colors duration-200 ease-in-out
        `}>
          <div className={`
            ${thumbSizeClasses[size]}
            ${checked ? 'translate-x-5' : 'translate-x-0.5'}
            ${size === 'sm' ? (checked ? 'translate-x-4' : 'translate-x-0.5') : ''}
            ${size === 'lg' ? (checked ? 'translate-x-6' : 'translate-x-0.5') : ''}
            bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out
            absolute top-0.5
          `} />
        </div>
      </div>
      {label && (
        <span className={`text-sm ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>
          {label}
        </span>
      )}
    </label>
  );
};

export default Toggle;