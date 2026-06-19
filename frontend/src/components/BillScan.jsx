import React, { useEffect, useState, useRef } from 'react';
import { FaCamera, FaTimes, FaSpinner, FaCheckCircle, FaTrash, FaPlus, FaFileImage } from 'react-icons/fa';
import useStore from '../store';
import { normalizeItemScanValue } from '../utils/itemScan';

const BillScan = ({ onScanComplete, onClose, initialStep = 'upload' }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extractedData, setExtractedData] = useState({
    billNo: '',
    date: '',
    party: '',
    amount: '',
    gstin: '',
    phone: '',
    items: []
  });
  const [step, setStep] = useState(initialStep);
  const [debugText, setDebugText] = useState('');
  const [scannerValue, setScannerValue] = useState('');
  const [scannedQrValues, setScannedQrValues] = useState([]);
  
  const cameraInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const scannerInputRef = useRef(null);
  const scannerValueRef = useRef('');
  const scanBufferRef = useRef('');
  const autoSubmitTimerRef = useRef(null);
  const lastProcessedScanRef = useRef({ value: '', time: 0 });
  const { showToast } = useStore();

  const clearAutoSubmitTimer = () => {
    if (autoSubmitTimerRef.current) {
      window.clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
  };

  const syncScannerValue = (value) => {
    scannerValueRef.current = value;
    scanBufferRef.current = value;
    setScannerValue(value);
  };

  useEffect(() => {
    setStep(initialStep);
    syncScannerValue('');
    setScannedQrValues([]);
    lastProcessedScanRef.current = { value: '', time: 0 };
  }, [initialStep]);

  useEffect(() => {
    if (step !== 'scanner') return;

    const timer = window.setTimeout(() => {
      scannerInputRef.current?.focus();
      scannerInputRef.current?.select?.();
    }, 80);

    return () => window.clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (step !== 'scanner') return;

    const scheduleAutoSubmit = (value) => {
      clearAutoSubmitTimer();
      autoSubmitTimerRef.current = window.setTimeout(() => {
        const nextValue = normalizeItemScanValue(value);
        if (nextValue.length >= 4) {
          handleScannerSubmit(nextValue);
        }
      }, 180);
    };

    const handleGlobalKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'Enter') {
        const nextValue = normalizeItemScanValue(
          scanBufferRef.current || scannerValueRef.current,
        );
        if (!nextValue) return;
        event.preventDefault();
        handleScannerSubmit(nextValue);
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        const nextValue = scanBufferRef.current.slice(0, -1);
        syncScannerValue(nextValue);
        if (nextValue) scheduleAutoSubmit(nextValue);
        return;
      }

      if (event.key.length !== 1) return;

      event.preventDefault();
      const nextValue = `${scanBufferRef.current}${event.key}`;
      syncScannerValue(nextValue);
      scheduleAutoSubmit(nextValue);
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      clearAutoSubmitTimer();
    };
  }, [step]);

  // TODO: Replace with your AI service (Google Vision, AWS Textract, etc.)
  const processImageWithAI = async (imageFile) => {
    try {
      setProgress(50);
      
      // Example: Using Google Cloud Vision API
      // const formData = new FormData();
      // formData.append('file', imageFile);
      // const response = await axios.post('/api/ocr/extract', formData);
      // return response.data.text;
      
      // For now, return empty - implement with your AI service
      showToast('Please configure AI service (Google Vision, AWS Textract, etc.)', 'info');
      return '';
    } catch (error) {
      console.error('AI Processing Error:', error);
      throw error;
    }
  };

  const extractPDFText = async (pdfFile) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const pdfData = new Uint8Array(e.target.result);
          const text = new TextDecoder().decode(pdfData);
          
          let extractedText = '';
          const matches = text.match(/BT[\s\S]*?ET/g) || [];
          
          for (const match of matches) {
            const strings = match.match(/\((.*?)\)/g) || [];
            for (const str of strings) {
              extractedText += str.replace(/[()]/g, '') + ' ';
            }
          }
          
          if (!extractedText.trim()) {
            extractedText = text
              .replace(/[^\x20-\x7E\n]/g, ' ')
              .split('\n')
              .filter(line => line.trim().length > 0)
              .join('\n');
          }
          
          resolve(extractedText);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read PDF'));
      reader.readAsArrayBuffer(pdfFile);
    });
  };

  const extractItems = (text) => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const items = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.length < 5) continue;
      if (/^[\d\s.,]+$/.test(line)) continue;
      if (/^(bill|invoice|receipt|date|amount|total|phone|gstin|items?|sr\.?no|particulars|description|subtotal|tax|gst|hsn|notes?|terms?|signature|company|address|thank|regards)$/i.test(line)) continue;
      
      // Pattern 1: "Item Name 2 500"
      let match = line.match(/^([A-Za-z\s&.,\-()]+?)\s+(\d+(?:\.\d{2})?)\s+(\d+(?:\.\d{2})?)$/);
      if (match) {
        const name = match[1].trim();
        const qty = parseFloat(match[2]);
        const price = parseFloat(match[3]);
        
        if (name.length >= 2 && name.length <= 100 && !/^\d+/.test(name) && price > 0 && qty > 0) {
          items.push({
            name: name,
            quantity: qty,
            price: price,
            total: qty * price
          });
          continue;
        }
      }
      
      // Pattern 2: "Item Name x2 @500"
      match = line.match(/^([A-Za-z\s&.,\-()]+?)\s+x(\d+)\s*@\s*(\d+(?:\.\d{2})?)$/i);
      if (match) {
        const name = match[1].trim();
        const qty = parseFloat(match[2]);
        const price = parseFloat(match[3]);
        
        if (name.length >= 2 && name.length <= 100 && !/^\d+/.test(name) && price > 0 && qty > 0) {
          items.push({
            name: name,
            quantity: qty,
            price: price,
            total: qty * price
          });
          continue;
        }
      }
      
      // Pattern 3: "Item Name 2@500"
      match = line.match(/^([A-Za-z\s&.,\-()]+?)\s+(\d+)@(\d+(?:\.\d{2})?)$/i);
      if (match) {
        const name = match[1].trim();
        const qty = parseFloat(match[2]);
        const price = parseFloat(match[3]);
        
        if (name.length >= 2 && name.length <= 100 && !/^\d+/.test(name) && price > 0 && qty > 0) {
          items.push({
            name: name,
            quantity: qty,
            price: price,
            total: qty * price
          });
          continue;
        }
      }
      
      // Pattern 4: "Item Name | 2 | 500"
      match = line.match(/^([A-Za-z\s&.,\-()]+?)\s*\|\s*(\d+(?:\.\d{2})?)\s*\|\s*(\d+(?:\.\d{2})?)$/);
      if (match) {
        const name = match[1].trim();
        const qty = parseFloat(match[2]);
        const price = parseFloat(match[3]);
        
        if (name.length >= 2 && name.length <= 100 && !/^\d+/.test(name) && price > 0 && qty > 0) {
          items.push({
            name: name,
            quantity: qty,
            price: price,
            total: qty * price
          });
          continue;
        }
      }
      
      // Pattern 5: "1 Item Name 2 500"
      match = line.match(/^\d+\s+([A-Za-z\s&.,\-()]+?)\s+(\d+(?:\.\d{2})?)\s+(\d+(?:\.\d{2})?)$/);
      if (match) {
        const name = match[1].trim();
        const qty = parseFloat(match[2]);
        const price = parseFloat(match[3]);
        
        if (name.length >= 2 && name.length <= 100 && !/^\d+/.test(name) && price > 0 && qty > 0) {
          items.push({
            name: name,
            quantity: qty,
            price: price,
            total: qty * price
          });
          continue;
        }
      }
      
      // Pattern 6: "Item Name 2 500.00"
      match = line.match(/^([A-Za-z\s&.,\-()]+?)\s+(\d+)\s+(\d+\.\d{2})$/);
      if (match) {
        const name = match[1].trim();
        const qty = parseFloat(match[2]);
        const price = parseFloat(match[3]);
        
        if (name.length >= 2 && name.length <= 100 && !/^\d+/.test(name) && price > 0 && qty > 0) {
          items.push({
            name: name,
            quantity: qty,
            price: price,
            total: qty * price
          });
          continue;
        }
      }
    }
    
    return items;
  };

  const parseExtractedText = (text) => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const data = {
      billNo: '',
      date: '',
      party: '',
      amount: '',
      gstin: '',
      phone: '',
      items: []
    };

    // Bill Number
    const billPatterns = [
      /bill\s*(?:no|number|#|:)?\s*([A-Z0-9\/-]{2,})/i,
      /invoice\s*(?:no|number|#|:)?\s*([A-Z0-9\/-]{2,})/i,
      /receipt\s*(?:no|number|#|:)?\s*([A-Z0-9\/-]{2,})/i,
      /(?:^|\s)([A-Z]{1,3}[0-9]{2,})(?:\s|$)/,
      /^([A-Z0-9\/-]{3,20})$/
    ];
    
    for (const pattern of billPatterns) {
      for (const line of lines) {
        const match = line.match(pattern);
        if (match && !data.billNo) {
          const billNo = match[1].trim();
          if (billNo.length >= 2 && billNo.length <= 50 && !/^(date|party|amount|total|phone|gstin|items?|sr\.?no)$/i.test(billNo)) {
            data.billNo = billNo;
            break;
          }
        }
      }
      if (data.billNo) break;
    }

    // Date
    for (const line of lines) {
      const match = line.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
      if (match && !data.date) {
        const dateStr = match[1];
        const parts = dateStr.split(/[\/\-\.]/);
        if (parts.length === 3) {
          let [day, month, year] = parts;
          if (day.length === 4) [year, month, day] = [day, month, day];
          if (year.length === 2) year = '20' + year;
          data.date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        break;
      }
    }

    // Party Name
    for (const line of lines) {
      if (line.length >= 3 && line.length <= 100 && 
          /^[A-Za-z]/.test(line) && 
          !/^\d+/.test(line) && 
          !/^[A-Z0-9\/-]+$/.test(line) &&
          !/^(bill|invoice|receipt|date|amount|total|phone|gstin|items?|sr\.?no|particulars|description)$/i.test(line)) {
        data.party = line;
        break;
      }
    }

    // Amount
    for (const line of lines) {
      const match = line.match(/(?:total|amount|grand\s*total|payable|sum)\s*(?::|=)?\s*₹?\s*([0-9,]+(?:\.\d{2})?)/i) ||
                    line.match(/₹\s*([0-9,]+(?:\.\d{2})?)/);
      if (match && !data.amount) {
        data.amount = match[1].replace(/,/g, '');
        break;
      }
    }

    // GSTIN
    for (const line of lines) {
      const match = line.match(/([0-9A-Z]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})/i);
      if (match) {
        data.gstin = match[1];
        break;
      }
    }

    // Phone
    for (const line of lines) {
      const match = line.match(/(\d{10})/);
      if (match) {
        data.phone = match[1];
        break;
      }
    }

    // Items
    data.items = extractItems(text);

    return data;
  };

  const handleFileUpload = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      let extractedText = '';

      if (type === 'pdf') {
        if (file.type !== 'application/pdf') {
          showToast('Please select a PDF file', 'error');
          setIsProcessing(false);
          return;
        }
        setProgress(30);
        extractedText = await extractPDFText(file);
        setProgress(70);
      } else {
        // Handle various image formats
        const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
        if (!validImageTypes.includes(file.type)) {
          showToast('Please select a valid image file (PNG, JPG, JPEG, GIF, BMP, WebP)', 'error');
          setIsProcessing(false);
          return;
        }
        
        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          showToast('File size too large. Please select a file smaller than 10MB', 'error');
          setIsProcessing(false);
          return;
        }
        
        setProgress(20);
        extractedText = await processImageWithAI(file);
      }

      setProgress(90);
      setDebugText(extractedText);
      const parsed = parseExtractedText(extractedText);
      setExtractedData(parsed);
      setStep('form');
      setProgress(100);
      showToast('Data extracted successfully!', 'success');
    } catch (error) {
      console.error('Error:', error);
      showToast('Failed to process file. Please enter manually.', 'error');
      setStep('form');
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleInputChange = (field, value) => {
    setExtractedData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddItem = () => {
    setExtractedData(prev => ({
      ...prev,
      items: [...prev.items, { name: '', quantity: 1, price: 0, total: 0 }]
    }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...extractedData.items];
    if (field === 'name') {
      newItems[index][field] = value;
    } else {
      newItems[index][field] = parseFloat(value) || 0;
    }
    if (field === 'quantity' || field === 'price') {
      newItems[index].total = newItems[index].quantity * newItems[index].price;
    }
    setExtractedData(prev => ({ ...prev, items: newItems }));
  };

  const handleRemoveItem = (index) => {
    setExtractedData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = () => {
    if (!extractedData.billNo || !extractedData.party) {
      showToast('Bill No and Party Name are required', 'error');
      return;
    }

    const dataToSubmit = {
      ...extractedData,
      amount: parseFloat(extractedData.amount) || 0,
    };

    onScanComplete(dataToSubmit);
  };

  const handleScannerSubmit = (valueOverride) => {
    const rawValue = normalizeItemScanValue(
      valueOverride ?? scannerValueRef.current ?? scannerValue,
    );
    if (!rawValue) {
      showToast('Please scan an item QR code first', 'error');
      return;
    }

    const now = Date.now();
    if (
      lastProcessedScanRef.current.value === rawValue &&
      now - lastProcessedScanRef.current.time < 250
    ) {
      return;
    }

    lastProcessedScanRef.current = { value: rawValue, time: now };
    clearAutoSubmitTimer();
    setScannedQrValues((prev) => [...prev, rawValue]);
    syncScannerValue('');
    window.setTimeout(() => {
      scannerInputRef.current?.focus();
    }, 20);
  };

  const handleContinueWithScans = () => {
    if (scannedQrValues.length === 0) {
      showToast('Please scan at least one item QR code', 'error');
      return;
    }

    onScanComplete({
      scanType: 'item-qr-bulk',
      scannedValues: scannedQrValues,
      source: 'hardware-scanner',
    });
  };

  const handleReset = () => {
    setExtractedData({
      billNo: '',
      date: '',
      party: '',
      amount: '',
      gstin: '',
      phone: '',
      items: []
    });
    setDebugText('');
    syncScannerValue('');
    setScannedQrValues([]);
    setStep('upload');
    lastProcessedScanRef.current = { value: '', time: 0 };
    clearAutoSubmitTimer();
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (pdfInputRef.current) pdfInputRef.current.value = '';
    if (scannerInputRef.current) scannerInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full shadow-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-semibold text-gray-900">Bill Scanner</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <FaTimes size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Upload Step */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-gray-600 text-center mb-6">Choose your preferred method to scan or enter bill data</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Scanner */}
                <button
                  onClick={() => {
                    syncScannerValue('');
                    setStep('scanner');
                  }}
                  className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition text-center group"
                >
                  <FaPlus className="text-3xl text-blue-600 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                  <p className="text-sm font-medium text-gray-900 mb-1">QR / Gun</p>
                  <p className="text-xs text-gray-500">USB or Bluetooth scanner</p>
                </button>

                {/* Camera */}
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="p-6 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition text-center group"
                >
                  <FaCamera className="text-3xl text-green-600 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                  <p className="text-sm font-medium text-gray-900 mb-1">Camera</p>
                  <p className="text-xs text-gray-500">Use device camera</p>
                  <input 
                    ref={cameraInputRef} 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    onChange={(e) => handleFileUpload(e, 'image')}
                    className="hidden" 
                  />
                </button>

                {/* Media Upload */}
                <button
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*,.pdf';
                    input.multiple = false;
                    input.onchange = (e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const type = file.type.startsWith('image/') ? 'image' : 'pdf';
                        handleFileUpload(e, type);
                      }
                    };
                    input.click();
                  }}
                  className="p-6 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition text-center group"
                >
                  <FaFileImage className="text-3xl text-purple-600 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                  <p className="text-sm font-medium text-gray-900 mb-1">Media</p>
                  <p className="text-xs text-gray-500">PNG, JPG, PDF</p>
                </button>

                {/* Manual Entry */}
                <button
                  onClick={() => {
                    setExtractedData({
                      billNo: '',
                      date: '',
                      party: '',
                      amount: '',
                      gstin: '',
                      phone: '',
                      items: []
                    });
                    setStep('form');
                  }}
                  className="p-6 border-2 border-gray-200 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition text-center group"
                >
                  <FaCheckCircle className="text-3xl text-orange-600 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                  <p className="text-sm font-medium text-gray-900 mb-1">Manual</p>
                  <p className="text-xs text-gray-500">Enter manually</p>
                </button>
              </div>
              
              {/* Additional Info */}
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Supported Formats:</h4>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>• <strong>Images:</strong> PNG, JPG, JPEG, GIF, BMP, WebP (max 10MB)</li>
                  <li>• <strong>Documents:</strong> PDF files</li>
                  <li>• <strong>Scanner:</strong> Direct camera capture with OCR</li>
                  <li>• <strong>Manual:</strong> Enter all details manually</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'scanner' && !isProcessing && (
            <div className="space-y-5">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h3 className="text-lg font-semibold text-gray-900">Scan Item QR</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Scanner gun connect karke is box me cursor rakhiye. Scan ke baad item bill form me add karne ke liye yahi value use hogi.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Scanner Input
                </label>
                <input
                  ref={scannerInputRef}
                  type="text"
                  value={scannerValue}
                  onChange={(e) => syncScannerValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleScannerSubmit();
                    }
                  }}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Scan item QR code here"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Expected QR format: <span className="font-mono">MM_ITEM:&lt;item-id&gt;</span>
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">
                      Scanned Items
                    </h4>
                    <p className="text-xs text-gray-500">
                      {scannedQrValues.length} item scan{scannedQrValues.length === 1 ? '' : 's'} queued for billing
                    </p>
                  </div>
                  {scannedQrValues.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setScannedQrValues([]);
                        syncScannerValue('');
                        scannerInputRef.current?.focus();
                      }}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {scannedQrValues.length > 0 ? (
                  <div className="mt-3 max-h-40 overflow-y-auto space-y-2">
                    {scannedQrValues.map((value, index) => (
                      <div
                        key={`${value}-${index}`}
                        className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700"
                      >
                        <span className="font-medium text-gray-900">#{index + 1}</span>{' '}
                        <span className="font-mono">{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-gray-500">
                    Scanner gun se QR scan karte hi items yahan add hote jayenge.
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2 border-t">
                <button
                  onClick={handleReset}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
                >
                  Back
                </button>
                <button
                  onClick={handleContinueWithScans}
                  disabled={scannedQrValues.length === 0}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Processing */}
          {isProcessing && (
            <div className="text-center py-8">
              <FaSpinner className="text-3xl text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600 mb-4">Processing...</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-500 mt-2">{progress}%</p>
            </div>
          )}

          {/* Form */}
          {step === 'form' && !isProcessing && (
            <div className="space-y-6">
              {/* Bill Details */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Bill Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bill No *</label>
                    <input
                      type="text"
                      value={extractedData.billNo}
                      onChange={(e) => handleInputChange('billNo', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Bill number"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={extractedData.date}
                      onChange={(e) => handleInputChange('date', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Party Name *</label>
                    <input
                      type="text"
                      value={extractedData.party}
                      onChange={(e) => handleInputChange('party', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Party name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                    <input
                      type="number"
                      value={extractedData.amount}
                      onChange={(e) => handleInputChange('amount', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Amount"
                      step="0.01"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={extractedData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Phone"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                    <input
                      type="text"
                      value={extractedData.gstin}
                      onChange={(e) => handleInputChange('gstin', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="GSTIN"
                    />
                  </div>
                </div>
              </div>

              {/* Items Section */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Items ({extractedData.items.length})</h3>
                  <button
                    onClick={handleAddItem}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition flex items-center gap-1"
                  >
                    <FaPlus size={14} /> Add Item
                  </button>
                </div>

                {extractedData.items.length > 0 ? (
                  <div className="space-y-3">
                    {extractedData.items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-end bg-gray-50 p-3 rounded-lg">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                          className="col-span-5 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          placeholder="Item name"
                        />
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                          className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          placeholder="Qty"
                          min="1"
                        />
                        <input
                          type="number"
                          value={item.price}
                          onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                          className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          placeholder="Price"
                          step="0.01"
                        />
                        <div className="col-span-2 px-3 py-2 bg-white rounded-lg text-sm font-medium text-gray-900 border border-gray-300">
                          ₹{item.total.toFixed(2)}
                        </div>
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="col-span-1 p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          <FaTrash size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm bg-gray-50 p-4 rounded-lg">No items extracted. Click "Add Item" to add manually.</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={handleReset}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2"
                >
                  <FaCheckCircle size={16} />
                  Submit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillScan;
