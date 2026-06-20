import { contactService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class ContactController {
  getContacts = asyncHandler(async (req, res) => {
    const result = await contactService.getContacts(req.user._id, req.query, req.isGst);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Contacts fetched successfully"));
  });

  getParties = asyncHandler(async (req, res) => {
    const result = await contactService.getContacts(req.user._id, {
      ...req.query,
      type: "party",
      include_books: true,
    }, req.isGst);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Parties fetched successfully"));
  });

  getSuppliers = asyncHandler(async (req, res) => {
    const result = await contactService.getContacts(req.user._id, {
      ...req.query,
      type: "supplier",
      include_books: true,
    }, req.isGst);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Suppliers fetched successfully"));
  });

  getBooks = asyncHandler(async (req, res) => {
    const result = await contactService.getContacts(req.user._id, {
      ...req.query,
      type: "book",
    }, req.isGst);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Book contacts fetched successfully"));
  });

  getContactById = asyncHandler(async (req, res) => {
    const contact = await contactService.getContactById(
      req.params.contactId,
      req.user._id,
      req.isGst,
    );
    res
      .status(200)
      .json(new ApiResponse(200, contact, "Contact fetched successfully"));
  });

  createContact = asyncHandler(async (req, res) => {
    const contact = await contactService.createContact(req.body, req.user._id);
    res
      .status(201)
      .json(new ApiResponse(201, contact, "Contact created successfully"));
  });

  updateContact = asyncHandler(async (req, res) => {
    const contact = await contactService.updateContact(
      req.params.contactId,
      req.user._id,
      req.body,
    );
    res
      .status(200)
      .json(new ApiResponse(200, contact, "Contact updated successfully"));
  });

  deleteContact = asyncHandler(async (req, res) => {
    await contactService.deleteContact(req.params.contactId, req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, null, "Contact deleted successfully"));
  });

  getContactBalance = asyncHandler(async (req, res) => {
    const balance = await contactService.getContactBalance(
      req.params.contactId,
      req.user._id,
      req.isGst,
    );
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { balance },
          "Contact balance fetched successfully",
        ),
      );
  });

  updateContactBalance = asyncHandler(async (req, res) => {
    const { amount, operation } = req.body;
    const balance = await contactService.updateBalance(
      req.params.contactId,
      req.user._id,
      amount,
      operation,
      req.isGst,
    );
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { balance },
          "Contact balance updated successfully",
        ),
      );
  });

  getContactsWithDue = asyncHandler(async (req, res) => {
    const result = await contactService.getContacts(req.user._id, {
      ...req.query,
      balance_status: "due",
    }, req.isGst);
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "Contacts with due amount fetched successfully",
        ),
      );
  });

  getContactsWithOverpaid = asyncHandler(async (req, res) => {
    const result = await contactService.getContacts(req.user._id, {
      ...req.query,
      balance_status: "overpaid",
    }, req.isGst);
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "Contacts with overpaid amount fetched successfully",
        ),
      );
  });
}

const contactController = new ContactController();

export const getContacts = contactController.getContacts;
export const getParties = contactController.getParties;
export const getSuppliers = contactController.getSuppliers;
export const getBooks = contactController.getBooks;
export const getContactById = contactController.getContactById;
export const createContact = contactController.createContact;
export const updateContact = contactController.updateContact;
export const deleteContact = contactController.deleteContact;
export const getContactBalance = contactController.getContactBalance;
export const updateContactBalance = contactController.updateContactBalance;
export const getContactsWithDue = contactController.getContactsWithDue;
export const getContactsWithOverpaid =
  contactController.getContactsWithOverpaid;

export default contactController;
