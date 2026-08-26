import mongoose from "mongoose";
import Bank, { ASSIGNMENT_TYPES } from "../../models/master/bank.model.js";
import Contact from "../../models/master/contact.model.js";
import User from "../../models/auth/user.model.js";
import { ApiError, Pagination } from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";

const BANK_POPULATE = [
  { path: "assigned_to", select: "name type phone", model: "Contact" },
];

class BankService {
  /**
   * Get banks with ownership-aware visibility.
   * - Firm users see: their firm's banks + all contact banks + unassigned banks
   * - Admin users see: all banks
   * - Optional query filters: assignment_type, assigned_to
   */
  async getBanks(userId, query = {}, firmType = null) {
    const filter = { user_id: userId };
    const andClauses = [];

    // Firm-type visibility: firm banks scoped via bank_ids, contact banks & unassigned visible to all
    if (firmType) {
      const user = await User.findById(userId)
        .select("gst_firm.bank_ids nongst_firm.bank_ids")
        .lean();
      const firmBankIds =
        firmType === "GST" ?
          user?.gst_firm?.bank_ids || []
        : user?.nongst_firm?.bank_ids || [];
      const otherFirmBankIds =
        firmType === "GST" ?
          user?.nongst_firm?.bank_ids || []
        : user?.gst_firm?.bank_ids || [];

      const orConditions = [
        { assignment_type: { $in: ["party", "supplier"] } },
        { assignment_type: { $in: [null, ""] } },
        { assignment_type: { $exists: false } },
      ];

      if (firmBankIds.length > 0) {
        orConditions.push({
          assignment_type: "firm",
          _id: { $in: firmBankIds },
        });
        if (otherFirmBankIds.length > 0) {
          orConditions.push({
            assignment_type: "firm",
            _id: { $nin: otherFirmBankIds },
          });
        }
      } else {
        const firmQuery = { assignment_type: "firm" };
        if (otherFirmBankIds.length > 0) {
          firmQuery._id = { $nin: otherFirmBankIds };
        }
        orConditions.push(firmQuery);
      }

      andClauses.push({ $or: orConditions });
    }

    // Optional assignment_type filter
    const rawAssignmentType = query.assignment_type || query.bank_type;
    if (rawAssignmentType) {
      if (!ASSIGNMENT_TYPES.includes(rawAssignmentType)) {
        throw ApiError.badRequest(
          `assignment_type must be one of: ${ASSIGNMENT_TYPES.join(", ")}`,
        );
      }
      andClauses.push({ assignment_type: rawAssignmentType });
    }

    // Filter by specific assigned_to
    if (query.assigned_to) {
      if (!mongoose.Types.ObjectId.isValid(query.assigned_to)) {
        throw ApiError.badRequest("Invalid assigned_to");
      }
      andClauses.push({ assigned_to: query.assigned_to });
    }

    // Search
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      andClauses.push({
        $or: [
          { bank_name: { $regex: escaped, $options: "i" } },
          { account_number: { $regex: escaped, $options: "i" } },
          { ifsc_code: { $regex: escaped, $options: "i" } },
        ],
      });
    }

    if (andClauses.length > 0) {
      filter.$and = andClauses;
    }

    return Pagination.paginate(Bank, filter, {
      ...query,
      sort: { is_default: -1, assignment_type: 1, createdAt: -1 },
      populate: BANK_POPULATE,
    });
  }

  async getBankById(bankId, userId) {
    const bank = await Bank.findOne({ _id: bankId, user_id: userId })
      .populate(BANK_POPULATE)
      .lean();
    if (!bank) throw ApiError.notFound("Bank not found");
    return bank;
  }

  async createBank(bankData, userId, firmType = null) {
    const {
      bank_name,
      bank_branch,
      type, // frontend sends type → maps to assignment_type
      assignment_type: rawAssignmentType,
      assigned_to = null,
      ifsc_code,
      account_number,
      account_holder,
      upi_id,
      is_default,
      default_bank,
    } = bankData;

    // type takes precedence over assignment_type; default "firm"
    const assignment_type = type || rawAssignmentType || "firm";

    if (!bank_name || typeof bank_name !== "string" || !bank_name.trim()) {
      throw ApiError.badRequest("Bank name is required");
    }
    if (
      !account_number ||
      typeof account_number !== "string" ||
      !account_number.trim()
    ) {
      throw ApiError.badRequest("Account number is required");
    }

    const duplicate = await Bank.findOne({
      account_number: account_number.trim(),
      user_id: userId,
    }).lean();
    if (duplicate) {
      throw ApiError.conflict("A bank with this account number already exists");
    }

    // Validate ownership
    let validatedAssignedTo = null;
    let validatedAssignmentType = assignment_type || null;
    const isDefaultBank =
      is_default === true ||
      default_bank === true ||
      Number(is_default) === 1 ||
      Number(default_bank) === 1;

    if (validatedAssignmentType) {
      if (!ASSIGNMENT_TYPES.includes(validatedAssignmentType)) {
        throw ApiError.badRequest(
          `assignment_type must be one of: ${ASSIGNMENT_TYPES.join(", ")}`,
        );
      }

      if (validatedAssignmentType === "firm") {
        if (!firmType) {
          throw ApiError.badRequest(
            "Firm login required to assign bank to firm",
          );
        }
      } else {
        // party or supplier
        if (!assigned_to) {
          throw ApiError.badRequest(
            `assigned_to is required for ${validatedAssignmentType} bank`,
          );
        }
        if (!mongoose.Types.ObjectId.isValid(assigned_to)) {
          throw ApiError.badRequest("Invalid assigned_to");
        }
        const contact = await Contact.findOne({
          _id: assigned_to,
          user_id: userId,
          type: validatedAssignmentType,
        });
        if (!contact) {
          throw ApiError.notFound(
            `${validatedAssignmentType} contact not found`,
          );
        }
        validatedAssignedTo = assigned_to;
      }
    }

    const bank = await Bank.create({
      id: await getNextId("Bank", userId),
      bank_name: bank_name.trim(),
      bank_branch: bank_branch?.trim() || "",
      ifsc_code: ifsc_code?.trim() || "",
      account_number: account_number.trim(),
      account_holder: account_holder?.trim() || "",
      upi_id: upi_id?.trim() || "",
      assignment_type: validatedAssignmentType,
      assigned_to: validatedAssignedTo,
      is_default: isDefaultBank,
      user_id: userId,
    });

    if (isDefaultBank) {
      await Bank.updateMany(
        { _id: { $ne: bank._id }, user_id: userId, is_default: true },
        { is_default: false },
      );
    }

    // Auto-sync: set Contact.bank_id if contact has none
    if (validatedAssignedTo) {
      await Contact.updateOne(
        { _id: validatedAssignedTo, bank_id: null },
        { bank_id: bank._id },
      );
    }

    // Auto-sync: push to firm's bank_ids
    if (validatedAssignmentType === "firm") {
      const firmPath =
        firmType === "GST" ? "gst_firm.bank_ids" : "nongst_firm.bank_ids";
      await User.updateOne(
        { _id: userId },
        { $addToSet: { [firmPath]: bank._id } },
      );
    }

    return bank.populate(BANK_POPULATE);
  }

  async updateBank(bankId, userId, updateData, firmType = null) {
    const bank = await Bank.findOne({ _id: bankId, user_id: userId });
    if (!bank) throw ApiError.notFound("Bank not found");

    const {
      bank_name,
      bank_branch,
      ifsc_code,
      account_number,
      account_holder,
      upi_id,
      assignment_type,
      assigned_to,
      is_default,
      default_bank,
    } = updateData;

    if (bank_name !== undefined) {
      if (typeof bank_name !== "string" || !bank_name.trim()) {
        throw ApiError.badRequest("Bank name cannot be empty");
      }
    }

    if (account_number !== undefined) {
      if (typeof account_number !== "string" || !account_number.trim()) {
        throw ApiError.badRequest("Account number cannot be empty");
      }
      const duplicate = await Bank.findOne({
        account_number: account_number.trim(),
        user_id: userId,
        _id: { $ne: bankId },
      }).lean();
      if (duplicate) {
        throw ApiError.conflict(
          "Another bank with this account number already exists",
        );
      }
    }

    const fields = {};
    if (bank_name !== undefined) fields.bank_name = bank_name.trim();
    if (bank_branch !== undefined) fields.bank_branch = bank_branch.trim();
    if (ifsc_code !== undefined) fields.ifsc_code = ifsc_code.trim();
    if (account_number !== undefined)
      fields.account_number = account_number.trim();
    if (account_holder !== undefined)
      fields.account_holder = account_holder.trim();
    if (upi_id !== undefined) fields.upi_id = upi_id.trim();

    if (is_default !== undefined || default_bank !== undefined) {
      fields.is_default =
        is_default === true ||
        default_bank === true ||
        Number(is_default) === 1 ||
        Number(default_bank) === 1;
    }

    // Handle ownership change
    if (assignment_type !== undefined) {
      const newAssignmentType = assignment_type || null;

      if (newAssignmentType && !ASSIGNMENT_TYPES.includes(newAssignmentType)) {
        throw ApiError.badRequest(
          `assignment_type must be one of: ${ASSIGNMENT_TYPES.join(", ")}`,
        );
      }

      // Clean up old ownership refs
      if (bank.assignment_type === "firm") {
        await User.updateOne(
          { _id: userId },
          {
            $pull: {
              "gst_firm.bank_ids": bankId,
              "nongst_firm.bank_ids": bankId,
            },
          },
        );
      }
      if (
        (bank.assignment_type === "party" ||
          bank.assignment_type === "supplier") &&
        bank.assigned_to
      ) {
        await Contact.updateOne(
          { _id: bank.assigned_to, bank_id: bankId },
          { bank_id: null },
        );
      }

      fields.assignment_type = newAssignmentType;
      fields.assigned_to = null;

      if (newAssignmentType === "firm") {
        if (!firmType) {
          throw ApiError.badRequest(
            "Firm login required to assign bank to firm",
          );
        }

        // Sync: push to firm's bank_ids
        const firmPath =
          firmType === "GST" ? "gst_firm.bank_ids" : "nongst_firm.bank_ids";
        await User.updateOne(
          { _id: userId },
          { $addToSet: { [firmPath]: bankId } },
        );
      } else if (
        newAssignmentType === "party" ||
        newAssignmentType === "supplier"
      ) {
        if (!assigned_to) {
          throw ApiError.badRequest(
            `assigned_to is required for ${newAssignmentType} bank`,
          );
        }
        if (!mongoose.Types.ObjectId.isValid(assigned_to)) {
          throw ApiError.badRequest("Invalid assigned_to");
        }
        const targetContact = await Contact.findOne({
          _id: assigned_to,
          user_id: userId,
          type: newAssignmentType,
        });
        if (!targetContact) {
          throw ApiError.notFound(`${newAssignmentType} contact not found`);
        }
        fields.assigned_to = assigned_to;

        // Sync: set Contact.bank_id if contact has none
        await Contact.updateOne(
          { _id: assigned_to, bank_id: null },
          { bank_id: bankId },
        );
      }
    }

    const updated = await Bank.findByIdAndUpdate(bankId, fields, {
      returnDocument: "after",
    })
      .populate(BANK_POPULATE)
      .lean();

    if (updated?.is_default) {
      await Bank.updateMany(
        { _id: { $ne: updated._id }, user_id: userId, is_default: true },
        { is_default: false },
      );
    }

    return updated;
  }

  async deleteBank(bankId, userId) {
    const bank = await Bank.findOne({ _id: bankId, user_id: userId });
    if (!bank) throw ApiError.notFound("Bank not found");

    // Clean up ownership refs before deleting
    if (bank.assignment_type === "firm") {
      await User.updateOne(
        { _id: userId },
        {
          $pull: {
            "gst_firm.bank_ids": bankId,
            "nongst_firm.bank_ids": bankId,
          },
        },
      );
    }
    if (
      (bank.assignment_type === "party" ||
        bank.assignment_type === "supplier") &&
      bank.assigned_to
    ) {
      await Contact.updateOne(
        { _id: bank.assigned_to, bank_id: bankId },
        { bank_id: null },
      );
    }

    await Bank.findByIdAndDelete(bankId);
  }

  async getBankSnapshot(bankId, userId) {
    if (!bankId) return null;
    if (!mongoose.Types.ObjectId.isValid(bankId)) {
      throw ApiError.badRequest("Invalid bank ID");
    }
    const bank = await Bank.findOne({ _id: bankId, user_id: userId }).lean();
    if (!bank) throw ApiError.badRequest("Bank not found");
    return {
      bank_id: bank._id,
      bank_name: bank.bank_name,
      bank_branch: bank.bank_branch || "",
      ifsc_code: bank.ifsc_code || "",
      account_number: bank.account_number || "",
      account_holder: bank.account_holder || "",
    };
  }
}

export default new BankService();
