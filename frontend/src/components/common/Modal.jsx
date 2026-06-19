import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';

const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  showCloseButton = true 
}) => {
  const contentRef = useRef(null);
  const isAddModal = useMemo(
    () => typeof title === 'string' && /^\s*add\b/i.test(title),
    [title]
  );

  const isNumericField = useCallback((target) => {
    if (!(target instanceof HTMLInputElement)) return false;

    const type = String(target.type || '').toLowerCase();
    const inputMode = String(target.inputMode || '').toLowerCase();
    const pattern = String(target.pattern || '');
    const name = String(target.name || '').toLowerCase();

    // Some fields include "number" in the name but are alphanumeric by business rules.
    if (name === 'reg_number') return false;

    if (type === 'number' || type === 'tel') return true;
    if (inputMode === 'numeric' || inputMode === 'decimal') return true;
    if (/^\^?\d\+\$?$/.test(pattern) || pattern === '[0-9]*') return true;
    return /(^|_)(phone|mobile|whatsapp|pincode|pin|account_number|qty|quantity|stock|amount|years?|months?|days?)(_|$)/.test(name);
  }, []);

  const sanitizeNumericValue = useCallback((target) => {
    if (!isNumericField(target)) return;
    const getMaxDigits = (digits) => (digits.startsWith('0') ? 11 : 10);

    const type = String(target.type || '').toLowerCase();
    const inputMode = String(target.inputMode || '').toLowerCase();
    const allowDecimal = type === 'number' && inputMode !== 'numeric';

    if (allowDecimal) {
      const raw = String(target.value || '').replace(/[^0-9.]/g, '');
      const dotIndex = raw.indexOf('.');
      let intPart = raw;
      let fracPart = '';

      if (dotIndex >= 0) {
        intPart = raw.slice(0, dotIndex);
        fracPart = raw.slice(dotIndex + 1).replace(/\./g, '');
      }

      const maxDigits = getMaxDigits(intPart || raw.replace(/\D/g, ''));
      intPart = intPart.slice(0, maxDigits);
      const remainingDigits = Math.max(0, maxDigits - intPart.length);
      fracPart = fracPart.slice(0, remainingDigits);
      const cleaned = dotIndex >= 0 ? `${intPart}.${fracPart}` : intPart;

      if (cleaned !== target.value) target.value = cleaned;
      return;
    }

    const digits = String(target.value || '').replace(/\D/g, '');
    const maxDigits = getMaxDigits(digits);
    const cleaned = digits.slice(0, maxDigits);
    if (cleaned !== target.value) target.value = cleaned;
  }, [isNumericField]);

  const handleInputCapture = useCallback((event) => {
    if (!isAddModal) return;
    sanitizeNumericValue(event.target);
  }, [isAddModal, sanitizeNumericValue]);

  const handleKeyDownCapture = useCallback((event) => {
    if (!isAddModal) return;
    const target = event.target;
    if (!isNumericField(target)) return;

    if (['e', 'E', '+', '-'].includes(event.key)) {
      event.preventDefault();
    }
  }, [isAddModal, isNumericField]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isAddModal || !contentRef.current) return;

    const labels = contentRef.current.querySelectorAll('label');
    labels.forEach((label) => {
      if (label.querySelector('.required-asterisk')) return;

      const textNodes = Array.from(label.childNodes).filter(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('*')
      );

      textNodes.forEach((node) => {
        const text = node.textContent || '';
        if (!text.includes('*')) return;

        const parts = text.split('*');
        const fragment = document.createDocumentFragment();

        parts.forEach((part, index) => {
          if (part) fragment.appendChild(document.createTextNode(part));

          if (index < parts.length - 1) {
            const star = document.createElement('span');
            star.className = 'text-red-500 required-asterisk';
            star.textContent = '*';
            fragment.appendChild(star);
          }
        });

        node.parentNode?.replaceChild(fragment, node);
      });
    });
  }, [isAddModal, isOpen, title]);

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    '6xl': 'max-w-7xl',
    full: 'max-w-full mx-4',
  };

  if (!isOpen) return null;

  return (
    <div className="fixed -inset-5 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal */}
        <div
          ref={contentRef}
          onInputCapture={handleInputCapture}
          onKeyDownCapture={handleKeyDownCapture}
          className={`relative z-10 inline-block w-full ${sizeClasses[size]} p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg`}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between mb-4">
              {title && (
                <h3 className="text-lg font-medium text-gray-900">
                  {title}
                </h3>
              )}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <FaTimes />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
