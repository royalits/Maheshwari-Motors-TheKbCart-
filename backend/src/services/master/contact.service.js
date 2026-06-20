import mongoose from "mongoose";
import Contact from "../../models/master/contact.model.js";
import Challan from "../../models/transaction/challan.model.js";
import Bill from "../../models/transaction/bill.model.js";
import Label from "../../models/master/label.model.js";
import Bank from "../../models/master/bank.model.js";
import bankService from "./bank.service.js";
import { ApiError, Pagination, toNumber } from "../../utils/index.js";
import { convertQueryParamIds } from "../../utils/queryParamConverter.js";
import { getNextId } from "../../helpers/counter.js";

class ContactService {
  async _ensureSystemBookContacts(userId) {
    const systemBooks = ["CASHBOOK", "BANKBOOK"];

    for (const systemName of systemBooks) {
      const existing = await Contact.findOne({
        user_id: userId,
        type: "book",
        name: { $regex: new RegExp(`^${systemName}$`, "i") },
      })
        .select("_id name")
        .lean();

      if (existing) {
        if (existing.name !== systemName) {
          await Contact.updateOne({ _id: existing._id }, { name: systemName });
        }
        continue;
      }

      await Contact.create({
        id: await getNextId("Contact", userId),
        name: systemName,
        type: "book",
        user_id: userId,
      });
    }
  }

  _escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  _normalizeString(value) {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "";
  }

  _normalizeOptionalString(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") {
      throw ApiError.badRequest("Value must be a string");
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async _validateBankId(bankId, userId) {
    if (bankId === undefined) return undefined;
    if (bankId === null || bankId === "") return null;
    if (!mongoose.Types.ObjectId.isValid(bankId)) {
      throw ApiError.badRequest("Invalid bank_id");
    }
    const bank = await Bank.exists({ _id: bankId, user_id: userId });
    if (!bank) {
      throw ApiError.badRequest("Bank not found. Please select a valid bank.");
    }
    return bankId;
  }

  async _validateLabelIds(labelIds, userId) {
    if (labelIds === undefined) return undefined;
    if (labelIds === null) return [];

    if (!Array.isArray(labelIds)) {
      throw ApiError.badRequest("label_ids must be an array");
    }

    if (labelIds.length === 0) return [];

    const uniqueIds = [...new Set(labelIds.map(String))];

    for (const id of uniqueIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest(`Invalid label_id: ${id}`);
      }
    }

    const validCount = await Label.countDocuments({
      _id: { $in: uniqueIds },
      user_id: userId,
    });

    if (validCount !== uniqueIds.length) {
      throw ApiError.badRequest(
        "One or more labels are invalid or do not belong to you",
      );
    }

    return uniqueIds;
  }

  async _validateRelations(type, userId, data) {
    const { transport_id, area_id, agent_id } = data;

    if (type === "party" && transport_id) {
      const { default: Transport } =
        await import("../../models/master/transport.model.js");
      const transportExists = await Transport.exists({
        _id: transport_id,
        user_id: userId,
      });
      if (!transportExists) {
        throw ApiError.badRequest(
          "Transport not found. Please select a valid transport.",
        );
      }
    }

    if (type === "party" && area_id) {
      const { default: Area } =
        await import("../../models/master/area.model.js");
      const areaExists = await Area.exists({
        _id: area_id,
        user_id: userId,
      });
      if (!areaExists) {
        throw ApiError.badRequest(
          "Area not found. Please select a valid area.",
        );
      }
    }

    if (type === "party" && agent_id) {
      const { default: Agent } =
        await import("../../models/master/agent.model.js");
      const agentExists = await Agent.exists({
        _id: agent_id,
        user_id: userId,
      });
      if (!agentExists) {
        throw ApiError.badRequest(
          "Agent not found. Please select a valid agent.",
        );
      }
    }
  }

  async getContacts(userId, query, isGst) {
    await this._ensureSystemBookContacts(userId);

    // Convert query parameters with _id to ObjectIds to prevent CastError
    const convertedQuery = convertQueryParamIds(query);

    const filter = { user_id: userId };

    if (convertedQuery.type) {
      const includeBooks = !(
        convertedQuery.include_books === false ||
        convertedQuery.include_books === "false" ||
        convertedQuery.include_books === 0 ||
        convertedQuery.include_books === "0"
      );

      if (
        includeBooks &&
        (convertedQuery.type === "party" || convertedQuery.type === "supplier")
      ) {
        // Include user's party/supplier + user's system books
        filter.type = { $in: [convertedQuery.type, "book"] };
      } else {
        filter.type = convertedQuery.type;
      }
    }

    if (convertedQuery.search) {
      const escaped = this._escapeRegex(convertedQuery.search);
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { alias: { $regex: escaped, $options: "i" } },
      ];
    }

    const balanceField = isGst === 1 || isGst === true ? "gst_balance" : "nongst_balance";
    if (convertedQuery.balance_status === "due") filter[balanceField] = { $lt: 0 };
    if (convertedQuery.balance_status === "overpaid") filter[balanceField] = { $gt: 0 };

    const contacts = await Pagination.paginate(Contact, filter, {
      ...convertedQuery,
      sort: { createdAt: -1 },
      populate: [
        { path: "bank_id" },
        { path: "label_id", select: "name" },
        { path: "transport_id", select: "name city pincode phone gstin" },
        { path: "agent_id", select: "name city pincode phone" },
        { path: "area_id", select: "city state pincode phone whatsapp" },
      ],
    });

    contacts.data = contacts.data.map((c) => ({
      ...c,
      balance: isGst === 1 || isGst === true ? (c.gst_balance || 0) : (c.nongst_balance || 0),
    }));

    return contacts;
  }

  async getContactById(contactId, userId, isGst) {
    const contact = await Contact.findOne({
      _id: contactId,
      user_id: userId,
    }).populate([
      { path: "bank_id" },
      { path: "label_id", select: "name" },
      { path: "transport_id", select: "name city pincode phone gstin" },
      { path: "agent_id", select: "name city pincode phone" },
      { path: "area_id", select: "city state pincode phone whatsapp" },
    ]);
    if (!contact) throw ApiError.notFound("Contact not found");

    const contactObj = contact.toObject();
    contactObj.balance = isGst === 1 || isGst === true ? (contactObj.gst_balance || 0) : (contactObj.nongst_balance || 0);
    return contactObj;
  }

  async createContact(contactData, userId) {
    const {
      name,
      alias,
      type,
      phone,
      whatsapp_number,
      email,
      address,
      city,
      state,
      gstin,
      cin,
      reg_number,
      label_ids,
      label_id,
      transport_charge,
      is_gst,
      transport_id,
      agent_id,
      area_id,
      bank_name,
      ifsc_code,
      account_number,
      bank_branch,
      account_holder_name,
      upi_id,
    } = contactData;

    if (!name || typeof name !== "string" || !name.trim()) {
      throw ApiError.badRequest("Contact name is required");
    }

    if (!type || !["party", "supplier"].includes(type)) {
      throw ApiError.badRequest("Contact type must be 'party' or 'supplier'");
    }

    const escapedName = this._escapeRegex(name.trim());
    const duplicate = await Contact.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      type,
      user_id: userId,
    });
    if (duplicate) {
      throw ApiError.conflict(
        `${type === "party" ? "Party" : "Supplier"} with this name already exists`,
      );
    }

    await this._validateRelations(type, userId, {
      transport_id,
      area_id,
      agent_id,
    });

    let normalizedTransportCharge = 0;
    if (type === "party") {
      if (transport_charge === undefined || transport_charge === null) {
        throw ApiError.badRequest("transport_charge is required for party");
      }

      normalizedTransportCharge = Number(transport_charge);
      if (
        !Number.isFinite(normalizedTransportCharge) ||
        normalizedTransportCharge < 0
      ) {
        throw ApiError.badRequest(
          "transport_charge must be a non-negative number",
        );
      }
    } else if (transport_charge !== undefined && transport_charge !== null) {
      normalizedTransportCharge = Number(transport_charge);
      if (
        !Number.isFinite(normalizedTransportCharge) ||
        normalizedTransportCharge < 0
      ) {
        throw ApiError.badRequest(
          "transport_charge must be a non-negative number",
        );
      }
    }

    let normalizedLabelIds = [];
    if (type === "party") {
      normalizedLabelIds =
        (await this._validateLabelIds(label_ids, userId)) || [];
    }

    let normalizedLabelId = null;
    if (type === "supplier" && label_id) {
      if (!mongoose.Types.ObjectId.isValid(label_id)) {
        throw ApiError.badRequest("Invalid label_id");
      }
      const exists = await Label.exists({ _id: label_id, user_id: userId });
      if (!exists) throw ApiError.badRequest("Label not found");
      normalizedLabelId = label_id;
    }

    const normalizedAlias =
      alias === undefined ? undefined : this._normalizeOptionalString(alias);

    const contact = await Contact.create({
      id: await getNextId("Contact", userId),
      name: name.trim(),
      ...(normalizedAlias !== undefined ? { alias: normalizedAlias } : {}),
      type,
      phone,
      whatsapp_number,
      email,
      address,
      city,
      state,
      gstin,
      cin,
      reg_number,
      label_ids: normalizedLabelIds,
      label_id: normalizedLabelId,
      transport_charge: normalizedTransportCharge,
      ...(type === "party" ? { is_gst: Number(is_gst ?? 1) === 1 ? 1 : 0 } : {}),
      transport_id: type === "party" ? transport_id || null : undefined,
      agent_id: type === "party" ? agent_id || null : undefined,
      area_id: type === "party" ? area_id || null : undefined,
      user_id: userId,
    });

    // Auto-create bank if bank fields are provided
    if (bank_name && account_number) {
      const bank = await bankService.createBank(
        {
          bank_name,
          bank_branch,
          ifsc_code,
          account_number,
          account_holder: account_holder_name,
          upi_id,
          type, // maps to assignment_type inside createBank
          assigned_to: contact._id,
        },
        userId,
      );
      contact.bank_id = bank._id;
      await contact.save();
    }

    return contact.populate("bank_id");
  }

  async updateContact(contactId, userId, updateData) {
    const contact = await Contact.findOne({
      _id: contactId,
      user_id: userId,
    });
    if (!contact) throw ApiError.notFound("Contact not found");

    if (contact.type === "book") {
      throw ApiError.badRequest("Book contacts cannot be edited");
    }

    const {
      name,
      alias,
      phone,
      whatsapp_number,
      email,
      address,
      city,
      state,
      gstin,
      cin,
      reg_number,
      label_ids,
      label_id,
      bank_id,
      transport_charge,
      area,
      is_gst,
      transport_id,
      agent_id,
      area_id,
      bank_name,
      bank_branch,
      ifsc_code,
      account_number,
      account_holder_name,
      account_holder,
      upi_id,
    } = updateData;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        throw ApiError.badRequest("Contact name cannot be empty");
      }
      const escapedName = this._escapeRegex(name.trim());
      const duplicate = await Contact.findOne({
        name: { $regex: new RegExp(`^${escapedName}$`, "i") },
        type: contact.type,
        user_id: userId,
        _id: { $ne: contactId },
      });
      if (duplicate) {
        throw ApiError.conflict(
          `Another ${contact.type} with this name already exists`,
        );
      }
    }

    await this._validateRelations(contact.type, userId, {
      transport_id,
      area_id,
      agent_id,
    });

    let normalizedTransportCharge;
    if (transport_charge !== undefined) {
      normalizedTransportCharge = Number(transport_charge);
      if (
        !Number.isFinite(normalizedTransportCharge) ||
        normalizedTransportCharge < 0
      ) {
        throw ApiError.badRequest(
          "transport_charge must be a non-negative number",
        );
      }
    }

    if (
      contact.type === "party" &&
      contact.transport_charge === undefined &&
      normalizedTransportCharge === undefined
    ) {
      normalizedTransportCharge = 0;
    }

    const normalizedBankId = await this._validateBankId(bank_id, userId);
    const accountHolderInput =
      account_holder_name !== undefined ? account_holder_name : account_holder;
    const bankFieldsToUpdate = {};
    if (bank_name !== undefined) bankFieldsToUpdate.bank_name = bank_name;
    if (bank_branch !== undefined) bankFieldsToUpdate.bank_branch = bank_branch;
    if (ifsc_code !== undefined) bankFieldsToUpdate.ifsc_code = ifsc_code;
    if (account_number !== undefined)
      bankFieldsToUpdate.account_number = account_number;
    if (accountHolderInput !== undefined)
      bankFieldsToUpdate.account_holder = accountHolderInput;
    if (upi_id !== undefined) bankFieldsToUpdate.upi_id = upi_id;
    const hasBankDetailUpdates = Object.keys(bankFieldsToUpdate).length > 0;

    if (contact.type !== "party") {
      if (label_ids !== undefined) {
        throw ApiError.badRequest(
          "label_ids are supported only for party contacts",
        );
      }
    }

    let normalizedLabelIds;
    if (contact.type === "party") {
      normalizedLabelIds = await this._validateLabelIds(label_ids, userId);
    }

    let normalizedLabelId;
    if (contact.type === "supplier" && label_id !== undefined) {
      if (label_id === null || label_id === "") {
        normalizedLabelId = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(label_id)) {
          throw ApiError.badRequest("Invalid label_id");
        }
        const exists = await Label.exists({ _id: label_id, user_id: userId });
        if (!exists) throw ApiError.badRequest("Label not found");
        normalizedLabelId = label_id;
      }
    }

    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (alias !== undefined)
      fields.alias = this._normalizeOptionalString(alias);
    if (phone !== undefined) fields.phone = phone;
    if (whatsapp_number !== undefined) fields.whatsapp_number = whatsapp_number;
    if (email !== undefined) fields.email = email;
    if (address !== undefined) fields.address = address;
    if (city !== undefined) fields.city = city;
    if (state !== undefined) fields.state = state;
    if (gstin !== undefined) fields.gstin = gstin;
    if (cin !== undefined) fields.cin = cin;
    if (reg_number !== undefined) fields.reg_number = reg_number;
    if (normalizedBankId !== undefined) fields.bank_id = normalizedBankId;

    // Sync Bank ownership when contact's bank_id changes
    if (normalizedBankId !== undefined) {
      const oldBankId = contact.bank_id?.toString() || null;
      const newBankId = normalizedBankId?.toString() || null;

      if (oldBankId !== newBankId) {
        // Clear ownership on old bank if it was owned by this contact
        if (oldBankId) {
          await Bank.updateOne(
            {
              _id: oldBankId,
              assigned_to: contactId,
              assignment_type: contact.type,
            },
            { assignment_type: null, assigned_to: null },
          );
        }
        // Set ownership on new bank
        if (newBankId) {
          await Bank.updateOne(
            { _id: newBankId, user_id: userId },
            {
              assignment_type: contact.type,
              assigned_to: contactId,
            },
          );
        }
      }
    }

    // Update linked bank details (or create a new contact bank if missing).
    const targetBankId =
      normalizedBankId !== undefined ? normalizedBankId : contact.bank_id;
    if (hasBankDetailUpdates) {
      if (targetBankId) {
        await bankService.updateBank(targetBankId, userId, bankFieldsToUpdate);
      } else if (
        typeof bankFieldsToUpdate.bank_name === "string" &&
        bankFieldsToUpdate.bank_name.trim() &&
        typeof bankFieldsToUpdate.account_number === "string" &&
        bankFieldsToUpdate.account_number.trim()
      ) {
        const createdBank = await bankService.createBank(
          {
            ...bankFieldsToUpdate,
            type: contact.type,
            assigned_to: contactId,
          },
          userId,
        );
        fields.bank_id = createdBank._id;
      }
    }

    if (normalizedTransportCharge !== undefined) {
      fields.transport_charge = normalizedTransportCharge;
    }
    if (area !== undefined) fields.area = area;
    if (contact.type === "party" && is_gst !== undefined) {
      fields.is_gst = Number(is_gst) === 1 ? 1 : 0;
    }

    if (contact.type === "party") {
      if (normalizedLabelIds !== undefined) {
        fields.label_ids = normalizedLabelIds;
      }

      if (transport_id !== undefined) fields.transport_id = transport_id;
      if (agent_id !== undefined) fields.agent_id = agent_id;
      if (area_id !== undefined) fields.area_id = area_id;
    }

    if (contact.type === "supplier" && normalizedLabelId !== undefined) {
      fields.label_id = normalizedLabelId;
    }

    const updatePayload =
      contact.type === "supplier" ?
        { $set: fields, $unset: { is_gst: "" } }
      : fields;

    const updatedContact = await Contact.findByIdAndUpdate(
      contactId,
      updatePayload,
      {
        returnDocument: "after",
      },
    ).populate("bank_id");
    return updatedContact;
  }

  async getContactBalance(contactId, userId, isGst) {
    const balanceField = isGst === 1 || isGst === true ? "gst_balance" : "nongst_balance";
    const contact = await Contact.findOne({ _id: contactId, user_id: userId })
      .select(balanceField)
      .lean();

    if (!contact) throw ApiError.notFound("Contact not found");
    return contact[balanceField] || 0;
  }

  async updateBalance(contactId, userId, amount, operation, isGst) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      throw ApiError.badRequest("amount must be a positive number");
    }

    if (!["add", "subtract"].includes(operation)) {
      throw ApiError.badRequest("operation must be 'add' or 'subtract'");
    }

    const increment = operation === "add" ? value : -value;
    const balanceField = isGst === 1 || isGst === true ? "gst_balance" : "nongst_balance";

    const updated = await Contact.findOneAndUpdate(
      { _id: contactId, user_id: userId },
      { $inc: { [balanceField]: increment } },
      { returnDocument: "after" },
    )
      .select(`balance gst_balance nongst_balance`)
      .lean();

    if (!updated) throw ApiError.notFound("Contact not found");
    return updated[balanceField] || 0;
  }

  async deleteContact(contactId, userId) {
    const contact = await Contact.findOne({
      _id: contactId,
      user_id: userId,
    });
    if (!contact) throw ApiError.notFound("Contact not found");

    if (contact.type === "book") {
      throw ApiError.badRequest("Book contacts cannot be deleted");
    }

    const challanCount = await Challan.countDocuments({
      contact_id: contactId,
      user_id: userId,
    });
    if (challanCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete ${contact.type} involved in ${challanCount} challan(s). Remove all related challans first.`,
      );
    }

    const billCount = await Bill.countDocuments({
      contact_id: contactId,
      user_id: userId,
    });
    if (billCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete ${contact.type} involved in ${billCount} bill(s). Remove all related bills first.`,
      );
    }

    // Clear bank ownership for any banks owned by this contact
    await Bank.updateMany(
      { assigned_to: contactId, user_id: userId },
      { assignment_type: null, assigned_to: null },
    );

    await Contact.findByIdAndDelete(contactId);
  }
}

export default new ContactService();
