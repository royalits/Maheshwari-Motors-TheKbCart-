// Formatting utilities
export const formatCurrency = (amount, currency = '₹') => {
  return `${currency}${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
};

export const formatDate = (date, format = 'dd/mm/yyyy') => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  switch (format) {
    case 'dd/mm/yyyy': return `${day}/${month}/${year}`;
    case 'yyyy-mm-dd': return `${year}-${month}-${day}`;
    case 'dd-mmm-yyyy': return `${day}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}-${year}`;
    default: return d.toLocaleDateString();
  }
};

// Validation utilities
export const validators = {
  required: (value) => !value ? 'This field is required' : '',
  email: (value) => !/\S+@\S+\.\S+/.test(value) ? 'Invalid email address' : '',
  phone: (value) => !/^\d{10}$/.test(value) ? 'Invalid phone number' : '',
  gst: (value) => !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(value) ? 'Invalid GST number' : '',
  pan: (value) => !/^[A-Z]{5}\d{4}[A-Z]{1}$/.test(value) ? 'Invalid PAN number' : '',
  positive: (value) => Number(value) <= 0 ? 'Must be positive' : '',
  minLength: (min) => (value) => value.length < min ? `Minimum ${min} characters required` : ''
};

// Business logic utilities
export const calculateGST = (amount, rate = 18) => {
  const gstAmount = (amount * rate) / 100;
  return {
    baseAmount: amount,
    gstAmount,
    totalAmount: amount + gstAmount,
    cgst: gstAmount / 2,
    sgst: gstAmount / 2
  };
};

export const generateInvoiceNumber = (firmCode, series, number) => {
  return `${firmCode}/${series}/${String(number).padStart(4, '0')}`;
};

// Data processing utilities
export const groupBy = (array, key) => {
  return array.reduce((groups, item) => {
    const group = item[key];
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {});
};

export const sortBy = (array, key, direction = 'asc') => {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    
    if (direction === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });
};

export const filterBy = (array, filters) => {
  return array.filter(item => {
    return Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      return String(item[key]).toLowerCase().includes(String(value).toLowerCase());
    });
  });
};

// Print utilities
export const printDocument = (elementId, title = 'Document') => {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .no-print { display: none; }
        </style>
      </head>
      <body>
        ${element.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
  printWindow.close();
};