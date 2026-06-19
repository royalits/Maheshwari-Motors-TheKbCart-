import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaBuilding, FaArrowLeft } from 'react-icons/fa6';
import useStore from '../store';

import { FormField, Input, Select, Textarea, Button, Card } from '../components/ui/FormComponents';

const FirmSetup = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { showToast, setLoading, firms, addFirm, updateFirm } = useStore();
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    // shortName: '',
    type: 'GST',
    address: '',
    city: '',
    pincode: '',
    state: '',
    // phone: '',
    mobile: '',
    email: '',
    fax: '',
    signature: '',
    gstin: '',
    cin: '',
    registrationNo: '',
    // tinCst: '',
    // ecc: '',
    // range: '',
    // division: '',
    pan: '',
    rule: '',
    godownAddress: '',
    bankName: '',
    bankAccount: '',
    ifscCode: ''
  });
  const [errors, setErrors] = useState({});
  const isEdit = !!id;

  useEffect(() => {
    if (isEdit) {
      loadFirm();
    }
  }, [id]);

  const loadFirm = async () => {
    setLoading(true);
    try {
      // In a real app, this would be an API call
      // For now, find the firm from the store
      const firm = firms.find(f => f.id === parseInt(id));
      if (firm) {
        setFormData(firm);
      } else {
        showToast('Firm not found', 'error');
        navigate('/masters/firm-master');
      }
    } catch (error) {
      showToast('Failed to load firm details', 'error');
      navigate('/masters/firm-master');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    // Required fields
    if (!formData.name.trim()) newErrors.name = 'Firm name is required';
    if (!formData.type) newErrors.type = 'Company type is required';
    
    // Email validation
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    // Mobile validation
    if (formData.mobile && !/^[6-9]\d{9}$/.test(formData.mobile)) {
      newErrors.mobile = 'Please enter a valid 10-digit mobile number';
    }
    
    // Pincode validation
    if (formData.pincode && !/^\d{6}$/.test(formData.pincode)) {
      newErrors.pincode = 'Please enter a valid 6-digit pincode';
    }
    
    // PAN validation
    if (formData.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.pan)) {
      newErrors.pan = 'Please enter a valid PAN (e.g., ABCDE1234F)';
    }
    
    // GSTIN validation (if GST type)
    if (formData.type === '0' && formData.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(formData.gstin)) {
      newErrors.gstin = 'Please enter a valid 15-digit GSTIN';
    }
    
    // IFSC validation
    if (formData.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifscCode)) {
      newErrors.ifscCode = 'Please enter a valid IFSC code (e.g., SBIN0001234)';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      if (isEdit) {
        updateFirm(parseInt(id), formData);
        showToast('Firm updated successfully', 'success');
      } else {
        const newFirm = {
          ...formData,
          id: firms.length + 1
        };
        addFirm(newFirm);
        setShowSuccessPopup(true);
        setTimeout(() => {
          setShowSuccessPopup(false);
          navigate('/masters/firm-master');
        }, 2000);
        return;
      }
      navigate('/masters/firm-master');
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to save firm', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <Button
          variant="outline"
          onClick={() => navigate('/masters/firm-master')}
          className="flex items-center gap-2"
        >
          <FaArrowLeft />
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl text-neutral-900">
            {isEdit ? 'Edit Firm' : 'Add Firm'}
          </h1>
          <p className="text-xs md:text-sm text-neutral-500">
            {isEdit ? 'Update firm information' : 'Create a new firm entity (Maa Auto, Motors, or Surat)'}
          </p>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Firm Name" error={errors.name} required>
              <Input
                
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Maa Auto, Motors, Surat"
                error={errors.name}
              />
            </FormField>

            {/* <FormField label="Short Name" error={errors.shortName} required>
              <Input
                name="shortName"
                value={formData.shortName}
                onChange={handleChange}
                placeholder="Short name"
                error={errors.shortName}
              />
            </FormField> */}

            <FormField label="Email" error={errors.email}>
              <Input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Email address"
                error={errors.email}
              />
            </FormField>

            <FormField label="Company Type" error={errors.type} required>
              <Select
                name="type"
                value={formData.type}
                onChange={handleChange}
                error={errors.type}
              >
                <option value="0">GST Registered</option>
                <option value="1">Non-GST</option>
              </Select>
            </FormField>

            <FormField label="Address" className="md:col-span-3" required>
              <Textarea
              required
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Complete address"
                rows={3}
              />
            </FormField>

            <FormField label="City">
              <Select name="city" value={formData.city} onChange={handleChange}>
                <option value="">Select City</option>
                <option value="Surat">Surat</option>
                <option value="Mumbai">Mumbai</option>
                <option value="Ahmedabad">Ahmedabad</option>
              </Select>
            </FormField>

            <FormField label="Pincode" error={errors.pincode} required>
              <Input
              required
                name="pincode"
                value={formData.pincode}
                onChange={handleChange}
                placeholder="6 digit pincode"
                maxLength={6}
                error={errors.pincode}
              />
            </FormField>

            <FormField label="State">
              <Select name="state" value={formData.state} onChange={handleChange}>
                <option value="">Select State</option>
                <option value="Gujarat">Gujarat</option>
                <option value="Maharashtra">Maharashtra</option>
              </Select>
            </FormField>

            {/* <FormField label="Phone No">
              <Input
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Phone number"
              />
            </FormField> */}

            <FormField label="Phone No" required>
              <Input
              required
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                placeholder="10 digit mobile number"
                maxLength={10}
                error={errors.mobile}
              />
            </FormField>

           

            <FormField label="Fax No">
              <Input
                name="fax"
                value={formData.fax}
                onChange={handleChange}
                placeholder="Fax number"
              />
            </FormField>

            <FormField label="Signature" className="md:col-span-1">
              <Input
                name="signature"
                value={formData.signature}
                onChange={handleChange}
                placeholder="Authorized signature"
              />
            </FormField>
          </div>

          {/* Other Details Section */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Other Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField label="GSTIN" error={errors.gstin} required>
                  <Input
                  required
                    name="gstin"
                    value={formData.gstin}
                    onChange={handleChange}
                    placeholder="15 digit GSTIN"
                    maxLength={15}
                    error={errors.gstin}
                  />
                </FormField>

                {/* Additional optional fields kept commented out for future use */}

             
              {/* <FormField label="Rule">
                <Input
                  name="rule"
                  value={formData.rule}
                  onChange={handleChange}
                  placeholder="Rule"
                />
              </FormField> */}

              <FormField label="Godown Add." className="md:col-span-3">
                <Textarea
                  name="godownAddress"
                  value={formData.godownAddress}
                  onChange={handleChange}
                  placeholder="Godown address"
                  rows={2}
                />
              </FormField>

              <FormField label="Bank Name" required>
                <Input
                required
                  name="bankName"
                  value={formData.bankName}
                  onChange={handleChange}
                  placeholder="Bank name"
                />
              </FormField>

              <FormField label="Bank Ac No." required>
                <Input
                required
                  name="bankAccount"
                  value={formData.bankAccount}
                  onChange={handleChange}
                  placeholder="Bank account number"
                />
              </FormField>

              <FormField label="IFSCode" error={errors.ifscCode} required>
                <Input
                required
                  name="ifscCode"
                  value={formData.ifscCode}
                  onChange={handleChange}
                  placeholder="IFSC code (e.g., SBIN0001234)"
                  error={errors.ifscCode}
                />
              </FormField>

               <FormField label="Pan No" error={errors.pan} required>
                <Input
                required
                  name="pan"
                  value={formData.pan}
                  onChange={handleChange}
                  placeholder="PAN (e.g., ABCDE1234F)"
                  maxLength={10}
                  error={errors.pan}
                />
              </FormField>

            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button type="submit" className="flex items-center gap-2">
              {/* <FaSave /> */}
              {isEdit ? 'Update Firm' : 'Save Firm'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/masters/firm-master')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>

      {showSuccessPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-sm mx-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Success!</h3>
                <p className="text-sm text-gray-600">Firm added successfully</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FirmSetup;