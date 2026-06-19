import React, { useState, useRef } from 'react';
import { FaPrint, FaDownload, FaTimes } from 'react-icons/fa';
import useStore from '../store';
import { formatCurrency, formatDate } from '../utils';

const PrintPreview = ({ 
  isOpen, 
  onClose, 
  documentType = 'challan',
  documentData,
  className = ""
}) => {
  const selectedFirm = useStore((s) => s.selectedFirm);
  const user = useStore((s) => s.user);
  const printRef = useRef(null);
  
  const [printSettings, setPrintSettings] = useState({
    format: 'A4', // A4, A5, Thermal
    showBarcode: true,
    showItemName: true,
    firmFormat: 'default', // default, letterhead, minimal
    partyFormat: 'default' // default, detailed, minimal
  });

  if (!isOpen || !documentData) return null;

  const normalizeFirmType = (value) =>
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[-\s]/g, "_");

  const pickFirstFilled = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined) continue;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
        continue;
      }
      return value;
    }
    return "";
  };

  const activeType = normalizeFirmType(
    selectedFirm?.type ||
      selectedFirm?.firm_type ||
      user?.current_firm_type ||
      user?.firm_data?.firm_type,
  );
  const activeFirm =
    activeType === "NON_GST" ? user?.nongst_firm
    : activeType === "GST" ? user?.gst_firm
    : user?.gst_firm || user?.nongst_firm || {};
  const firmData = user?.firm_data || {};
  const resolvedFirm = {
    name: pickFirstFilled(activeFirm?.name, firmData?.name, selectedFirm?.name),
    address: pickFirstFilled(
      activeFirm?.address,
      firmData?.address,
      selectedFirm?.address,
      activeFirm?.godown_address,
      firmData?.godown_address,
      selectedFirm?.godown_address,
    ),
    city: pickFirstFilled(activeFirm?.city, firmData?.city, selectedFirm?.city),
    state: pickFirstFilled(activeFirm?.state, firmData?.state, selectedFirm?.state),
    phone: pickFirstFilled(
      activeFirm?.phone,
      firmData?.phone,
      selectedFirm?.phone,
      activeFirm?.mobile,
      firmData?.mobile,
      selectedFirm?.mobile,
      activeFirm?.mobile_number,
      firmData?.mobile_number,
      selectedFirm?.mobile_number,
    ),
    email: pickFirstFilled(activeFirm?.email, firmData?.email, selectedFirm?.email),
    gstin: pickFirstFilled(
      activeFirm?.GSTIN,
      activeFirm?.gstin,
      firmData?.GSTIN,
      firmData?.gstin,
      selectedFirm?.GSTIN,
      selectedFirm?.gstin,
    ),
  };

  const handlePrint = () => {
    if (printRef.current) {
      const printContent = printRef.current.innerHTML;
      const printWindow = window.open('', '_blank');
      
      printWindow.document.write(`
        <html>
          <head>
            <title>${documentType.toUpperCase()} - ${documentData.number}</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                margin: 0; 
                padding: 20px;
                font-size: ${printSettings.format === 'Thermal' ? '12px' : '14px'};
              }
              .print-header { 
                text-align: center; 
                border-bottom: 2px solid #000; 
                padding-bottom: 10px; 
                margin-bottom: 20px; 
              }
              .print-table { 
                width: 100%; 
                border-collapse: collapse; 
                margin: 10px 0; 
              }
              .print-table th, .print-table td { 
                border: 1px solid #ddd; 
                padding: 8px; 
                text-align: left; 
              }
              .print-table th { 
                background-color: #f2f2f2; 
                font-weight: bold; 
              }
              .print-footer { 
                margin-top: 30px; 
                border-top: 1px solid #ddd; 
                padding-top: 10px; 
              }
              .barcode { 
                font-family: 'Courier New', monospace; 
                font-size: 10px; 
              }
              .no-print { 
                display: none; 
              }
              @media print {
                body { margin: 0; }
                .no-print { display: none !important; }
              }
            </style>
          </head>
          <body>
            ${printContent}
          </body>
        </html>
      `);
      
      printWindow.document.close();
      printWindow.print();
      printWindow.close();
    }
  };

  const handleDownloadPDF = () => {
    // Mock PDF generation - in real app, use libraries like jsPDF or html2pdf
    const element = printRef.current;
    if (element) {
      // This would typically use html2pdf or similar library
      console.log('PDF generation would happen here');
      // For now, just show a message
      alert('PDF download functionality would be implemented with html2pdf library');
    }
  };

  const renderFirmHeader = () => {
    if (printSettings.firmFormat === 'minimal') {
      return (
        <div className="text-center mb-4">
          <h2 className="text-lg font-bold">{resolvedFirm.name}</h2>
        </div>
      );
    }

    return (
      <div className="print-header">
        <h1 className="text-2xl font-bold mb-2">{resolvedFirm.name}</h1>
        <div className="text-sm">
          {resolvedFirm.address && <p>{resolvedFirm.address}</p>}
          {(resolvedFirm.city || resolvedFirm.state) && (
            <p>{[resolvedFirm.city, resolvedFirm.state].filter(Boolean).join(', ')}</p>
          )}
          {(resolvedFirm.phone || resolvedFirm.email) && (
            <p>
              {resolvedFirm.phone ? `Phone: ${resolvedFirm.phone}` : ''}
              {resolvedFirm.phone && resolvedFirm.email ? ' | ' : ''}
              {resolvedFirm.email ? `Email: ${resolvedFirm.email}` : ''}
            </p>
          )}
          {resolvedFirm.gstin && (
            <p><strong>GSTIN:</strong> {resolvedFirm.gstin}</p>
          )}
        </div>
      </div>
    );
  };

  const renderDocumentHeader = () => (
    <div className="flex justify-between items-start mb-6">
      <div>
        <h3 className="text-lg font-bold mb-2">
          {documentType.toUpperCase()} #{documentData.number}
        </h3>
        <p><strong>Date:</strong> {formatDate(documentData.date)}</p>
        <p><strong>Status:</strong> {documentData.status}</p>
      </div>
      
      <div className="text-right">
        {printSettings.showBarcode && (
          <div className="barcode mb-2">
            <div className="text-xs">||||| |||| | |||| |||||</div>
            <div className="text-xs">{documentData.number}</div>
          </div>
        )}
      </div>
    </div>
  );

  const renderPartyDetails = () => {
    if (printSettings.partyFormat === 'minimal') {
      return (
        <div className="mb-4">
          <p><strong>To:</strong> {documentData.party?.name}</p>
        </div>
      );
    }

    return (
      <div className="mb-6 p-4 border rounded">
        <h4 className="font-bold mb-2">Bill To:</h4>
        <p><strong>{documentData.party?.name}</strong></p>
        <p>Address Line 1</p>
        <p>Address Line 2</p>
        <p>City - 123456</p>
        {documentData.party?.gstNo && (
          <p><strong>GSTIN:</strong> {documentData.party.gstNo}</p>
        )}
        <p><strong>Phone:</strong> +91 98765 43210</p>
      </div>
    );
  };

  const renderItemsTable = () => (
    <table className="print-table">
      <thead>
        <tr>
          <th>S.No</th>
          {printSettings.showItemName && <th>Item Name</th>}
          {printSettings.showBarcode && <th>Barcode</th>}
          <th>Qty</th>
          <th>Unit</th>
          <th>Rate</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        {documentData.items?.map((item, index) => (
          <tr key={index}>
            <td>{index + 1}</td>
            {printSettings.showItemName && <td>{item.name}</td>}
            {printSettings.showBarcode && (
              <td className="barcode">{item.barcode || '-'}</td>
            )}
            <td>{item.quantity}</td>
            <td>{item.unit}</td>
            <td>{formatCurrency(item.rate)}</td>
            <td>{formatCurrency(item.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderTotals = () => (
    <div className="print-footer">
      <div className="flex justify-end">
        <div className="w-64">
          <div className="flex justify-between py-1">
            <span>Subtotal:</span>
            <span>{formatCurrency(documentData.subtotal || 0)}</span>
          </div>
          
          {documentData.gstDetails && (
            <>
              <div className="flex justify-between py-1">
                <span>CGST (9%):</span>
                <span>{formatCurrency(documentData.gstDetails.cgst)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>SGST (9%):</span>
                <span>{formatCurrency(documentData.gstDetails.sgst)}</span>
              </div>
            </>
          )}
          
          <div className="flex justify-between py-2 border-t-2 border-black font-bold text-lg">
            <span>Total:</span>
            <span>{formatCurrency(documentData.total || documentData.subtotal || 0)}</span>
          </div>
        </div>
      </div>
      
      <div className="mt-6 text-sm">
        <p><strong>Terms & Conditions:</strong></p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Payment due within 30 days</li>
          <li>Goods once sold will not be taken back</li>
          <li>Subject to local jurisdiction</li>
        </ul>
      </div>
      
      <div className="mt-8 flex justify-between">
        <div>
          <p className="border-t border-black pt-2 mt-8">Customer Signature</p>
        </div>
        <div>
          <p className="border-t border-black pt-2 mt-8">Authorized Signature</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className={`bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden ${className}`}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-lg font-medium">
              Print Preview - {documentType.toUpperCase()}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <FaTimes />
            </button>
          </div>

          {/* Settings */}
          <div className="p-4 border-b bg-gray-50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Format</label>
                <select
                  value={printSettings.format}
                  onChange={(e) => setPrintSettings(prev => ({ ...prev, format: e.target.value }))}
                  className="w-full text-sm border rounded px-2 py-1"
                >
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                  <option value="Thermal">Thermal</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Firm Format</label>
                <select
                  value={printSettings.firmFormat}
                  onChange={(e) => setPrintSettings(prev => ({ ...prev, firmFormat: e.target.value }))}
                  className="w-full text-sm border rounded px-2 py-1"
                >
                  <option value="default">Default</option>
                  <option value="letterhead">Letterhead</option>
                  <option value="minimal">Minimal</option>
                </select>
              </div>
              
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={printSettings.showBarcode}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, showBarcode: e.target.checked }))}
                  />
                  Show Barcode
                </label>
              </div>
              
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={printSettings.showItemName}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, showItemName: e.target.checked }))}
                  />
                  Show Item Names
                </label>
              </div>
            </div>
          </div>

          {/* Preview Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-white" style={{ maxHeight: '60vh' }}>
            <div 
              ref={printRef}
              className={`mx-auto bg-white ${
                printSettings.format === 'A4' ? 'max-w-2xl' : 
                printSettings.format === 'A5' ? 'max-w-lg' : 'max-w-sm'
              }`}
            >
              {renderFirmHeader()}
              {renderDocumentHeader()}
              {renderPartyDetails()}
              {renderItemsTable()}
              {renderTotals()}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Close
            </button>
            
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <FaDownload className="text-xs" />
              Download PDF
            </button>
            
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              <FaPrint className="text-xs" />
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintPreview;
