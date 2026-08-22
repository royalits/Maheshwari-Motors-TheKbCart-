import React, { useRef } from 'react';
import { SearchableSelect } from './index';
import { FaCalendarAlt } from 'react-icons/fa';
import {
  normalizeDisplayDateInput,
  toDisplayDate,
  toISODate,
} from '../../utils/dateHelpers';

export const FormField = ({ label, error, required, children, className = "" }) => (
  <div className={`space-y-1 ${className}`}>
    {label && (
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
    )}
    {children}
    {error && <p className="text-sm text-red-600">{error}</p>}
  </div>
);

export const Input = React.forwardRef(({ error, allowSpaces = true, allowZero = true, allowNegative = false, trimSpaces = true, ...props }, ref) => {
  const hiddenDateRef = useRef(null);

  if (props.type === 'date') {
    const isoValue = toISODate(props.value) || '';
    const displayValue = toDisplayDate(props.value) || props.value || '';

    const handleTextChange = (e) => {
      if (!props.onChange) return;
      const rawText = e.target.value;
      const normalized = normalizeDisplayDateInput(rawText);
      const iso = toISODate(normalized);
      props.onChange(iso || normalized, e);
    };

    const handlePickerChange = (e) => {
      if (!props.onChange) return;
      const iso = e.target.value;
      props.onChange(iso || '', e);
    };

    const openPickerSafely = () => {
      if (props.disabled) return;
      if (hiddenDateRef.current && typeof hiddenDateRef.current.showPicker === 'function') {
        try {
          hiddenDateRef.current.showPicker();
        } catch (err) {
          // Handled silently if browser restricts showPicker invocation
        }
      }
    };

    const handleFocus = (e) => {
      if (props.onFocus) props.onFocus(e);
      openPickerSafely();
    };

    const handleKeyDownInternal = (e) => {
      if (props.onKeyDown) props.onKeyDown(e);
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        openPickerSafely();
      }
    };

    const handleOpenPicker = (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      openPickerSafely();
    };

    return (
      <div className={`relative inline-flex items-center w-full ${props.disabled ? 'opacity-70 cursor-not-allowed' : ''}`}>
        <input
          {...props}
          ref={ref}
          type="text"
          value={displayValue}
          onChange={handleTextChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDownInternal}
          placeholder={props.placeholder || 'dd/mm/yyyy'}
          className={`w-full pl-3 pr-10 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-red-300' : 'border-gray-300'
          } ${props.className || ''}`}
        />
        <input
          ref={hiddenDateRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={isoValue}
          onChange={handlePickerChange}
          disabled={props.disabled}
          className="absolute right-0 top-0 w-8 h-full opacity-0 pointer-events-none"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={handleOpenPicker}
          disabled={props.disabled}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-blue-600 focus:outline-none transition-colors"
          title="Choose date"
        >
          <FaCalendarAlt className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const handleWheel = (e) => {
    if (props.type === 'number') {
      e.target.blur();
    }
  };

  const handleChange = (e) => {
    if (!props.onChange) return;
    const value = e.target.value;

    if (props.type !== 'number') {
      if (!allowSpaces) {
        e.target.value = value.replace(/\s/g, '');
      }
      props.onChange(value, e);
      return;
    }

    // number type
    if (value === '') { props.onChange(value, e); return; }
    const numValue = parseFloat(value);
    if (!allowZero && numValue === 0) return;
    if (!allowNegative && numValue < 0) e.target.value = Math.abs(numValue).toString();
    props.onChange(e.target.value, e);
  };
  
  return (
    <input
      {...props}
      ref={ref}
      onChange={handleChange}
      onWheel={handleWheel}
      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        error ? 'border-red-300' : 'border-gray-300'
      } ${props.className || ''}`}
    />
  );
});
Input.displayName = 'Input';

export const Select = ({ error, children, ...props }) => (
  <SearchableSelect
    {...props}
    children={children}
    buttonClassName={error ? 'border-red-300' : ''}
  />
);

export const Textarea = ({ error, ...props }) => (
  <textarea
    {...props}
    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      error ? 'border-red-300' : 'border-gray-300'
    } ${props.className || ''}`}
  />
);

export const Button = ({ 
  variant = 'primary', 
  size = 'md', 
  loading = false, 
  children, 
  className = '',
  ...props 
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
    outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500'
  };
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </button>
  );
};

export const Card = ({ title, children, className = '', headerActions }) => (
  <div className={`bg-white rounded-lg shadow border border-gray-200 ${className}`}>
    {title && (
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        {headerActions}
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

export const Table = ({ columns, data, onRowClick, className = '' }) => (
  <div className={`overflow-x-auto ${className}`}>
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          {columns.map((column, index) => (
            <th
              key={index}
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {data.map((row, rowIndex) => (
          <tr
            key={rowIndex}
            onClick={() => onRowClick?.(row)}
            className={onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}
          >
            {columns.map((column, colIndex) => (
              <td key={colIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {column.render ? column.render(row) : row[column.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className={`inline-block w-full ${sizes[size]} p-6 my-8 overflow-visible text-left align-middle transition-all transform bg-white shadow-xl rounded-lg`}>
          {title && (
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">{title}</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
};
