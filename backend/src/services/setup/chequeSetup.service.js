import ChequeSetup from "../../models/setup/chequeSetup.model.js";

const DEFAULT_FIELDS = [
  { key: "ac_pay", label: "A/C Payee", top: 12, left: 8, enabled: true },
  { key: "date", label: "Date", top: 12, left: 480, enabled: true },
  { key: "ac_name", label: "Pay To", top: 55, left: 75, enabled: true },
  { key: "amount_word", label: "Amount (Words)", top: 95, left: 75, enabled: true },
  { key: "amount", label: "Amount", top: 55, left: 490, enabled: true },
  { key: "narration", label: "Narration", top: 135, left: 75, enabled: true },
  { key: "firm_name", label: "Firm Name", top: 155, left: 430, enabled: true },
  { key: "signature", label: "Signature", top: 178, left: 430, enabled: false },
];

class ChequeSetupService {
  async getByBank(bankId, userId) {
    const setup = await ChequeSetup.findOne({ bank_id: bankId, user_id: userId });
    if (!setup) {
      return { bank_id: bankId, disp_caption: "", cheque_width: 760, cheque_height: 250, fields: DEFAULT_FIELDS };
    }
    return setup;
  }

  async getAllSetups(userId) {
    return ChequeSetup.find({ user_id: userId }).populate("bank_id", "bank_name account_number");
  }

  async upsert(bankId, userId, data) {
    return ChequeSetup.findOneAndUpdate(
      { bank_id: bankId, user_id: userId },
      { ...data, bank_id: bankId, user_id: userId },
      { upsert: true, new: true, runValidators: true },
    );
  }

  async deleteByBank(bankId, userId) {
    return ChequeSetup.findOneAndDelete({ bank_id: bankId, user_id: userId });
  }
}

export default new ChequeSetupService();
