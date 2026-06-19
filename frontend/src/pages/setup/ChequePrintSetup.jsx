import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input } from "../../components/ui";
import api from "../../services/axiosInstance";
import { getResponseList } from "../../services/apiUtils";
import useStore from "../../store";

const DEFAULT_FIELDS = [
  { key: "ac_pay",      label: "A/C Payee",      top: 28,  left: 60,  enabled: true },
  { key: "date",        label: "Date",            top: 24,  left: 580, enabled: true },
  { key: "ac_name",     label: "Pay To",          top: 68,  left: 100, enabled: true },
  { key: "amount_word", label: "Amount (Words)",  top: 108, left: 120, enabled: true },
  { key: "amount",      label: "Amount",          top: 148, left: 580, enabled: true },
  { key: "narration",   label: "Narration",       top: 195, left: 200, enabled: true },
  { key: "firm_name",   label: "Firm Name",       top: 230, left: 500, enabled: true },
  { key: "signature",   label: "Signature",       top: 255, left: 500, enabled: true },
];

const EMPTY_BANK = { bank_name: "", account_number: "", bank_branch: "", ifsc_code: "" };

export default function ChequePrintSetup() {
  const showToast  = useStore((s) => s.showToast);
  const selectedFirm = useStore((s) => s.selectedFirm);
  const user       = useStore((s) => s.user);

  const rawFirmName = selectedFirm?.name || user?.firm_data?.name || "Firm Name";
  const firmName = rawFirmName.replace(/\s*(GST|NON[_\s-]?GST|NON GST)\s*$/i, "").trim();
  const today    = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  const previewDate = dd + " " + mm + " " + yyyy;

  // Preview data — plain labels like real cheque
  const PREVIEW = {
    ac_pay:      "A/C PAYEES",
    date:        previewDate,
    ac_name:     firmName,
    amount_word: "Forty Six Thousand Eight Hundred Eighty Only.",
    amount:      "46880.00",
    narration:   "B.No.,3968,4024,4067,4101",
    firm_name:   firmName,
    signature:   "",
  };

  const [banks, setBanks]               = useState([]);
  const [selectedBankId, setSelectedBankId] = useState(null);
  const [dispCaption, setDispCaption]   = useState("");
  const [chequeWidth, setChequeWidth]   = useState(760);
  const [chequeHeight, setChequeHeight] = useState(320);
  const [fields, setFields]             = useState(DEFAULT_FIELDS);
  const [saving, setSaving]             = useState(false);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [bankSearch, setBankSearch]     = useState("");
  const [savedSetups, setSavedSetups]   = useState({});
  const [showAddBank, setShowAddBank]   = useState(false);
  const [bankForm, setBankForm]         = useState(EMPTY_BANK);
  const [addingBank, setAddingBank]     = useState(false);
  const [selectedMasterBankId, setSelectedMasterBankId] = useState("");

  const printRef = useRef(null);

  const loadBanks = () =>
    api.get("/banks").then((res) => { const l = getResponseList(res); setBanks(l); return l; });

  useEffect(() => {
    loadBanks().then((l) => { if (l.length > 0) setSelectedBankId(l[0]._id); });
  }, []);

  useEffect(() => {
    api.get("/setup/cheque-setup").then((res) => {
      const map = {};
      getResponseList(res).forEach((s) => { map[s.bank_id?._id || s.bank_id] = s; });
      setSavedSetups(map);
    });
  }, []);

  useEffect(() => {
    if (!selectedBankId) return;
    if (savedSetups[selectedBankId]) {
      const d = savedSetups[selectedBankId];
      setDispCaption(d.disp_caption || "");
      setChequeWidth(d.cheque_width || 760);
      setChequeHeight(d.cheque_height || 320);
      setFields(d.fields?.length ? d.fields : DEFAULT_FIELDS);
      return;
    }
    setLoadingSetup(true);
    api.get(`/setup/cheque-setup/${selectedBankId}`)
      .then((res) => {
        const d = res.data?.data;
        if (d) {
          setDispCaption(d.disp_caption || "");
          setChequeWidth(d.cheque_width || 760);
          setChequeHeight(d.cheque_height || 320);
          setFields(d.fields?.length ? d.fields : DEFAULT_FIELDS);
        } else {
          setFields(DEFAULT_FIELDS);
        }
      })
      .catch(() => setFields(DEFAULT_FIELDS))
      .finally(() => setLoadingSetup(false));
  }, [selectedBankId]); // eslint-disable-line

  const updateField = useCallback((key, upd) =>
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...upd } : f))), []);

  const handleSave = async () => {
    if (!selectedBankId) return;
    setSaving(true);
    try {
      await api.put(`/setup/cheque-setup/${selectedBankId}`, {
        disp_caption: dispCaption, cheque_width: chequeWidth, cheque_height: chequeHeight, fields,
      });
      setSavedSetups((p) => ({ ...p, [selectedBankId]: { disp_caption: dispCaption, cheque_width: chequeWidth, cheque_height: chequeHeight, fields } }));
      showToast?.("Setup saved", "success");
    } catch {
      showToast?.("Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    setFields(DEFAULT_FIELDS);
    if (!selectedBankId) return;
    setSaving(true);
    try {
      await api.put(`/setup/cheque-setup/${selectedBankId}`, {
        disp_caption: dispCaption, cheque_width: chequeWidth, cheque_height: chequeHeight, fields: DEFAULT_FIELDS,
      });
      setSavedSetups((p) => ({ ...p, [selectedBankId]: { disp_caption: dispCaption, cheque_width: chequeWidth, cheque_height: chequeHeight, fields: DEFAULT_FIELDS } }));
      showToast?.("Reset & saved", "success");
    } catch {
      showToast?.("Reset locally, save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddBank = async () => {
    if (selectedMasterBankId) {
      // Existing bank selected — just add to sidebar
      setSelectedBankId(selectedMasterBankId);
      setShowAddBank(false);
      setSelectedMasterBankId("");
      setBankForm(EMPTY_BANK);
      return;
    }
    // Manual add
    if (!bankForm.bank_name.trim() || !bankForm.account_number.trim()) {
      showToast?.("Bank name & account number required", "error");
      return;
    }
    setAddingBank(true);
    try {
      const res = await api.post("/banks", bankForm);
      const newBank = res.data?.data;
      await loadBanks();
      setShowAddBank(false);
      setBankForm(EMPTY_BANK);
      if (newBank?._id) setSelectedBankId(newBank._id);
      showToast?.("Bank added", "success");
    } catch {
      showToast?.("Failed to add bank", "error");
    } finally {
      setAddingBank(false);
    }
  };

  const handlePrint = async () => {
    if (!printRef.current) return;
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");
    const el = printRef.current;
    const prevBorder = el.style.border;
    const prevShadow = el.style.boxShadow;
    el.style.border = "none";
    el.style.boxShadow = "none";
    const canvas = await html2canvas(el, {
      scale: 3, useCORS: true, backgroundColor: "#ffffff", logging: false,
      width: chequeWidth, height: chequeHeight,
    });
    el.style.border = prevBorder;
    el.style.boxShadow = prevShadow;
    const imgData = canvas.toDataURL("image/png");
    // A4 portrait: 210 x 297 mm
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const a4W = 210;
    // cheque width = full A4 width with small margin
    const margin = 10;
    const chequeWmm = a4W - margin * 2;
    const chequeHmm = chequeWmm * (chequeHeight / chequeWidth);
    // place at top center
    const x = margin;
    const y = margin;
    pdf.addImage(imgData, "PNG", x, y, chequeWmm, chequeHmm);
    const selectedBank = banks.find((b) => b._id === selectedBankId);
    pdf.save((selectedBank?.bank_name || "cheque") + "-cheque.pdf");
  };

  const selectedBank = banks.find((b) => b._id === selectedBankId);
  const filteredBanks = banks.filter((b) =>
    b.bank_name?.toLowerCase().includes(bankSearch.toLowerCase()));

  // Field styles for preview — exactly like image
  const getFieldStyle = (f) => {
    const base = { position: "absolute", top: f.top, left: f.left, whiteSpace: "nowrap", fontFamily: "Times New Roman, serif" };
    switch (f.key) {
      case "ac_pay":      return { ...base, fontSize: 13, fontWeight: 400, letterSpacing: 1 };
      case "date":        return { ...base, fontFamily: "'Courier New', monospace", fontSize: 14, fontWeight: 700, letterSpacing: 8 };
      case "ac_name":     return { ...base, fontSize: 15, fontWeight: 700 };
      case "amount_word": return { ...base, fontSize: 13, fontWeight: 400 };
      case "amount":      return { ...base, fontFamily: "'Courier New', monospace", fontSize: 15, fontWeight: 700 };
      case "narration":   return { ...base, fontSize: 11, color: "#333" };
      case "firm_name":   return { ...base, fontSize: 12, fontWeight: 600 };
      case "signature":   return { ...base, fontSize: 10, color: "#555", borderTop: "1px solid #555", paddingTop: 3, minWidth: 120, display: "inline-block", textAlign: "center" };
      default:            return { ...base, fontSize: 12 };
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-full mx-auto space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cheque Print Setup</h1>
            <p className="text-gray-500 text-sm">Configure cheque layout per bank</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!selectedBankId}>🖨 Print</Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={!selectedBankId}>Save Setup</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

          {/* Bank list */}
          <div className="bg-white rounded-lg border shadow-sm lg:col-span-1 flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Banks</p>
              <button type="button" onClick={() => setShowAddBank(true)}
                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 flex items-center gap-1">
                <span className="text-base leading-none">+</span> Add
              </button>
            </div>
            <div className="p-2">
              <Input placeholder="Search bank..." value={bankSearch} onChange={setBankSearch} className="text-sm" />
            </div>
            <div className="flex-1 overflow-y-auto divide-y max-h-[520px]">
              {filteredBanks.length === 0 && <p className="text-xs text-gray-400 px-4 py-4 text-center">No banks found</p>}
              {filteredBanks.map((bank) => (
                <button key={bank._id} type="button" onClick={() => setSelectedBankId(bank._id)}
                  className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between gap-2 ${
                    selectedBankId === bank._id ? "bg-blue-50 text-blue-700 font-semibold border-l-2 border-blue-600" : "hover:bg-gray-50 text-gray-800"
                  }`}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{bank.bank_name}</p>
                    {bank.account_number && <p className="text-xs text-gray-400 truncate">A/c: {bank.account_number}</p>}
                  </div>
                  {savedSetups[bank._id] && <span className="shrink-0 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Config + Preview */}
          <div className="lg:col-span-3 space-y-4">
            {!selectedBankId ? (
              <div className="bg-white rounded-lg border shadow-sm p-12 text-center text-gray-400">
                <p className="text-4xl mb-2">🏦</p>
                <p>Select a bank to configure its cheque layout</p>
              </div>
            ) : loadingSetup ? (
              <div className="bg-white rounded-lg border shadow-sm p-12 text-center text-gray-400">Loading...</div>
            ) : (
              <>
                {/* Settings */}
                <div className="bg-white rounded-lg border shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span>🏦</span>
                    <p className="text-sm font-semibold text-gray-800">{selectedBank?.bank_name}</p>
                    {selectedBank?.account_number && <span className="text-xs text-gray-400">· A/c {selectedBank.account_number}</span>}
                    {selectedBank?.ifsc_code && <span className="text-xs text-gray-400">· {selectedBank.ifsc_code}</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Display Caption</label>
                      <Input value={dispCaption} onChange={setDispCaption} placeholder="e.g. prime" className="text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Cheque Width (px)</label>
                      <Input type="number" value={chequeWidth} onChange={(v) => setChequeWidth(Number(v) || 760)} onWheel={(e) => e.target.blur()} className="text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Cheque Height (px)</label>
                      <Input type="number" value={chequeHeight} onChange={(v) => setChequeHeight(Number(v) || 320)} onWheel={(e) => e.target.blur()} className="text-sm" />
                    </div>
                  </div>
                </div>

                {/* Fields table */}
                <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Field Positions</p>
                    <button type="button" onClick={handleResetToDefault} className="text-xs text-blue-600 hover:underline">
                      Reset to Default
                    </button>
                  </div>
                  <div className="grid grid-cols-4 px-4 py-2 bg-gray-100 text-xs font-semibold text-gray-600 border-b">
                    <span>Field</span><span>Print</span><span>Top (px)</span><span>Left (px)</span>
                  </div>
                  <div className="divide-y">
                    {fields.map((field) => (
                      <div key={field.key} className="grid grid-cols-4 gap-2 items-center px-4 py-2">
                        <span className="text-sm font-medium text-gray-800">{field.label}</span>
                        <input type="checkbox" checked={field.enabled}
                          onChange={(e) => updateField(field.key, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-blue-600" />
                        <Input type="number" value={field.top}
                          onChange={(v) => updateField(field.key, { top: Number(v) || 0 })} onWheel={(e) => e.target.blur()} className="text-sm" />
                        <Input type="number" value={field.left}
                          onChange={(v) => updateField(field.key, { left: Number(v) || 0 })} onWheel={(e) => e.target.blur()} className="text-sm" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cheque Preview — plain white like real cheque */}
                <div className="bg-white rounded-lg border shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Preview</p>
                    <span className="text-xs text-gray-400">Sample data for position reference</span>
                  </div>
                  <div className="overflow-x-auto pb-2">
                    <div
                      ref={printRef}
                      style={{
                        position: "relative",
                        width: chequeWidth,
                        height: chequeHeight,
                        minWidth: chequeWidth,
                        background: "#fff",
                        border: "1px solid #d1d5db",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                      }}
                    >
                      {fields.filter((f) => f.enabled).map((f) => (
                        <div key={f.key} style={getFieldStyle(f)}>
                          {f.key === "signature" ? "\u00A0" : (PREVIEW[f.key] || f.label)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add Bank Modal */}
      {showAddBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
              <h2 className="text-base font-semibold text-gray-900">Add Bank</h2>
              <button type="button" onClick={() => { setShowAddBank(false); setBankForm(EMPTY_BANK); setSelectedMasterBankId(""); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Dropdown from Bank Master */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Select from Bank Master</label>
                <select
                  value={selectedMasterBankId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedMasterBankId(id);
                    if (id) {
                      const b = banks.find((x) => x._id === id);
                      if (b) setBankForm({
                        bank_name: b.bank_name || "",
                        account_number: b.account_number || "",
                        bank_branch: b.bank_branch || "",
                        ifsc_code: b.ifsc_code || "",
                      });
                    } else {
                      setBankForm(EMPTY_BANK);
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select existing bank (optional) --</option>
                  {banks.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.bank_name}{b.account_number ? ` — ${b.account_number}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Select to auto-fill fields, or fill manually below.</p>
              </div>

              <div className="border-t pt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Bank Name <span className="text-red-500">*</span></label>
                  <Input value={bankForm.bank_name} onChange={(v) => { setBankForm((p) => ({ ...p, bank_name: v })); setSelectedMasterBankId(""); }} placeholder="e.g. HDFC Bank" className="text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Account Number <span className="text-red-500">*</span></label>
                  <Input value={bankForm.account_number} onChange={(v) => { setBankForm((p) => ({ ...p, account_number: v })); setSelectedMasterBankId(""); }} placeholder="e.g. 001234567890" className="text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Branch</label>
                  <Input value={bankForm.bank_branch} onChange={(v) => { setBankForm((p) => ({ ...p, bank_branch: v })); setSelectedMasterBankId(""); }} placeholder="e.g. Connaught Place" className="text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">IFSC Code</label>
                  <Input value={bankForm.ifsc_code} onChange={(v) => { setBankForm((p) => ({ ...p, ifsc_code: v.toUpperCase() })); setSelectedMasterBankId(""); }} placeholder="e.g. HDFC0001234" className="text-sm" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50">
              <Button variant="outline" size="sm" onClick={() => { setShowAddBank(false); setBankForm(EMPTY_BANK); setSelectedMasterBankId(""); }}>Cancel</Button>
              <Button size="sm" onClick={handleAddBank} loading={addingBank}>
                {selectedMasterBankId ? "Select Bank" : "Add Bank"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
