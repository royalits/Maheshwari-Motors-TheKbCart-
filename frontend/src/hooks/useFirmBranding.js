import { useMemo } from 'react';
import useStore from '../store';

const normalizeFirmKey = (value) =>
  String(value || '').trim().toUpperCase().replace(/[-\s]/g, '_');

const isDefaultFirmName = (value) =>
  String(value || '').trim().toLowerCase() === 'the kbcart';

/**
 * Returns resolved firm branding data based on the currently selected firm.
 * Priority: gst_firm / nongst_firm from /auth/me (user object in store)
 * Falls back to selectedFirm, then user identity.
 */
export const useFirmBranding = () => {
  const { user, selectedFirm } = useStore();

  return useMemo(() => {
    // selectedFirm.type can be 'GST'/'NON_GST' string OR 0/1 number (from FirmMaster)
    const rawType =
      selectedFirm?.firm_type ||
      selectedFirm?.type ||
      user?.current_firm_type ||
      user?.firm_data?.firm_type;

    const key = normalizeFirmKey(rawType);
    const numericType = Number(selectedFirm?.type ?? selectedFirm?.firm_type ?? '');

    const isGst =
      key === 'GST' ||
      numericType === 1;

    const isNonGst =
      key === 'NON_GST' || key === 'NONGST' ||
      numericType === 0;

    const profileFirm =
      isGst ? (user?.gst_firm || null)
      : isNonGst ? (user?.nongst_firm || null)
      : user?.gst_firm || user?.nongst_firm || null;

    const firmData = user?.firm_data || {};

    const pick = (...values) => {
      for (const v of values) {
        if (v === null || v === undefined) continue;
        const s = typeof v === 'string' ? v.trim() : String(v);
        if (isDefaultFirmName(s)) continue;
        if (s) return s;
      }
      return '';
    };

    const bankRef =
      profileFirm?.bank_ids?.[0] ||
      profileFirm?.banks?.[0] ||
      firmData?.bank_ids?.[0] ||
      {};

    return {
      name: pick(
        profileFirm?.name,
        firmData?.name,
        selectedFirm?.name,
        firmData?.username,
        firmData?.credential_key,
        user?.username,
        user?.name,
        user?.email,
        'Firm',
      ),
      address: pick(
        profileFirm?.address, profileFirm?.godown_address,
        firmData?.address, firmData?.godown_address,
        selectedFirm?.address,
      ),
      phone: pick(
        profileFirm?.phone, profileFirm?.mobile,
        firmData?.phone, firmData?.mobile,
        selectedFirm?.phone, selectedFirm?.mobile,
      ),
      email: pick(profileFirm?.email, firmData?.email, selectedFirm?.email),
      gstin: pick(
        profileFirm?.GSTIN, profileFirm?.gstin,
        firmData?.GSTIN, firmData?.gstin,
        selectedFirm?.GSTIN, selectedFirm?.gstin,
      ),
      city: pick(profileFirm?.city, firmData?.city, selectedFirm?.city),
      bank_name: pick(
        bankRef?.bank_name, bankRef?.name,
        profileFirm?.bank_name, firmData?.bank_name, selectedFirm?.bank_name,
      ),
      account_number: pick(
        bankRef?.account_number,
        profileFirm?.account_number, firmData?.account_number, selectedFirm?.account_number,
      ),
      ifsc_code: pick(
        bankRef?.ifsc_code,
        profileFirm?.ifsc_code, firmData?.ifsc_code, selectedFirm?.ifsc_code,
      ),
      bank_branch: pick(
        bankRef?.bank_branch,
        profileFirm?.bank_branch, firmData?.bank_branch, selectedFirm?.bank_branch,
      ),
    };
  }, [user, selectedFirm]);
};

export default useFirmBranding;
