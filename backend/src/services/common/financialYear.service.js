import mongoose from "mongoose";
import FinancialYear from "../../models/common/financial_year.model.js";
import FinancialYearClose from "../../models/common/financial_year_close.model.js";
import Bill from "../../models/transaction/bill.model.js";
import Challan from "../../models/transaction/challan.model.js";
import Transaction from "../../models/transaction/transaction.model.js";
import Return from "../../models/transaction/return.model.js";
import Item from "../../models/master/item.model.js";
import { ApiError } from "../../utils/index.js";

const TRANSACTION_MODELS = [Bill, Challan, Transaction, Return];

class FinancialYearService {
  async _ensureCloseIndexIsolation() {
    try {
      const indexes = await FinancialYearClose.collection.indexes();
      const oldUniqueIndex = indexes.find(
        (index) =>
          index.name === "financial_year_start_1" &&
          index.unique === true &&
          Object.keys(index.key || {}).length === 1,
      );

      if (oldUniqueIndex) {
        await FinancialYearClose.collection.dropIndex(oldUniqueIndex.name);
      }
    } catch (error) {
      if (error?.codeName !== "IndexNotFound") throw error;
    }
  }

  _startDate(startYear) {
    return new Date(Date.UTC(Number(startYear), 3, 1, 0, 0, 0, 0));
  }

  _endDate(startYear) {
    return new Date(Date.UTC(Number(startYear) + 1, 2, 31, 23, 59, 59, 999));
  }

  _label(startYear) {
    return `${startYear}-${Number(startYear) + 1}`;
  }

  _dateOnlyUtc(year, monthIndex, day) {
    return Date.UTC(Number(year), Number(monthIndex), Number(day));
  }

  _businessDateOnlyUtc(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const indiaDate = new Date(safeDate.getTime() + 330 * 60 * 1000);
    return this._dateOnlyUtc(
      indiaDate.getUTCFullYear(),
      indiaDate.getUTCMonth(),
      indiaDate.getUTCDate(),
    );
  }

  _isoDateFromDateOnly(value) {
    return new Date(value).toISOString().slice(0, 10);
  }

  _formatDisplayDate(value) {
    const date = new Date(value);
    const pad = (num) => String(num).padStart(2, "0");
    return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
  }

  _closeAllowedFromDateOnly(financialYear) {
    return this._dateOnlyUtc(financialYear.end_year, 2, 1);
  }

  _assertCloseAllowed(financialYear, asOfDate = new Date()) {
    const today = this._businessDateOnlyUtc(asOfDate);
    const allowedFrom = this._closeAllowedFromDateOnly(financialYear);
    if (today < allowedFrom) {
      throw ApiError.badRequest(
        `Financial year ${financialYear.label} can be closed from ${this._formatDisplayDate(allowedFrom)} onwards`,
      );
    }
  }

  normalizeEntryDate(financialYear, value = null) {
    if (!financialYear) return value || new Date().toISOString().slice(0, 10);

    const start = this._dateOnlyUtc(financialYear.start_year, 3, 1);
    const end = this._dateOnlyUtc(financialYear.end_year, 2, 31);
    const requested = value ? this._businessDateOnlyUtc(value) : this._businessDateOnlyUtc();
    const clamped = Math.min(Math.max(requested, start), end);
    return this._isoDateFromDateOnly(clamped);
  }

  normalizeEntryPayloadDates(payload = {}, financialYear, { defaultDate = false } = {}) {
    if (!payload || typeof payload !== "object" || !financialYear) return payload;

    const nextPayload = { ...payload };
    if (defaultDate && !nextPayload.date) {
      nextPayload.date = this.normalizeEntryDate(financialYear);
    } else if (nextPayload.date) {
      nextPayload.date = this.normalizeEntryDate(financialYear, nextPayload.date);
    }

    for (const field of ["payment_date", "paymentDate"]) {
      if (nextPayload[field]) {
        nextPayload[field] = this.normalizeEntryDate(financialYear, nextPayload[field]);
      }
    }

    return nextPayload;
  }

  _startYearForDate(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return this._startYearForDate(new Date());
    return date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  }

  async _ensureYear(userId, startYear, status = "open") {
    const start = Number(startYear);
    const existing = await FinancialYear.findOne({
      user_id: userId,
      start_year: start,
    });

    if (existing) {
      if (status === "closed" && existing.status !== "closed") {
        existing.status = "closed";
        await existing.save();
      } else if (status === "open" && existing.status !== "open") {
        existing.status = "open";
        await existing.save();
      }
      return existing.toObject();
    }

    const update = {
      $setOnInsert: {
        user_id: userId,
        label: this._label(start),
        start_year: start,
        end_year: start + 1,
        start_date: this._startDate(start),
        end_date: this._endDate(start),
        status,
      },
    };

    return FinancialYear.findOneAndUpdate(
      { user_id: userId, start_year: start },
      update,
      { new: true, upsert: true },
    ).lean();
  }

  async ensureCurrentYear(userId, asOfDate = new Date()) {
    const businessDate = new Date(this._businessDateOnlyUtc(asOfDate));
    const startYear = this._startYearForDate(businessDate);
    return this._ensureYear(userId, startYear, "open");
  }

  async _collectDateBounds(userId) {
    const bounds = [];
    for (const Model of TRANSACTION_MODELS) {
      const [first, last] = await Promise.all([
        Model.findOne({ user_id: userId, date: { $ne: null } }).sort({ date: 1 }).select("date").lean(),
        Model.findOne({ user_id: userId, date: { $ne: null } }).sort({ date: -1 }).select("date").lean(),
      ]);
      if (first?.date) bounds.push(first.date);
      if (last?.date) bounds.push(last.date);
    }
    return bounds;
  }

  async backfillUserYears(userId) {
    await this._ensureCloseIndexIsolation();
    const dateBounds = await this._collectDateBounds(userId);
    const closeRows = await FinancialYearClose.find({ user_id: userId })
      .select("financial_year_start")
      .lean();
    const closedStarts = new Set(
      closeRows.map((row) => Number(row.financial_year_start)).filter(Boolean),
    );
    const years = new Set();

    for (const date of dateBounds) {
      years.add(this._startYearForDate(date));
    }

    for (const year of closedStarts) {
      years.add(year);
      years.add(year + 1);
    }

    if (years.size === 0) {
      years.add(this._startYearForDate(new Date()));
    }

    const sortedYears = [...years].sort((a, b) => a - b);
    const openStart =
      [...sortedYears].reverse().find((year) => !closedStarts.has(year)) ||
      sortedYears[sortedYears.length - 1];

    for (const year of sortedYears) {
      await this._ensureYear(
        userId,
        year,
        closedStarts.has(year) ? "closed"
        : year === openStart ? "open"
        : "closed",
      );
    }

    const allYears = await FinancialYear.find({ user_id: userId }).sort({ start_year: 1 }).lean();

    for (const fy of allYears) {
      for (const Model of TRANSACTION_MODELS) {
        await Model.updateMany(
          {
            user_id: userId,
            financial_year_id: { $exists: false },
            date: { $gte: fy.start_date, $lte: fy.end_date },
          },
          { $set: { financial_year_id: fy._id } },
        );
        await Model.updateMany(
          {
            user_id: userId,
            financial_year_id: null,
            date: { $gte: fy.start_date, $lte: fy.end_date },
          },
          { $set: { financial_year_id: fy._id } },
        );
      }
    }

    return this.getYears(userId, { skipBackfill: true });
  }

  async getYears(userId, options = {}) {
    if (!options.skipBackfill) {
      await this.backfillUserYears(userId);
    }

    const years = await FinancialYear.find({ user_id: userId })
      .sort({ start_year: -1 })
      .lean();

    if (years.length) return years;

    const current = await this._ensureYear(userId, this._startYearForDate(new Date()), "open");
    return [current];
  }

  async getDefaultYear(userId) {
    let year = await FinancialYear.findOne({ user_id: userId, status: "open" })
      .sort({ start_year: -1 })
      .lean();

    if (year) return year;

    const years = await this.getYears(userId);
    year = years.find((item) => item.status === "open") || years[0];
    if (!year) throw ApiError.badRequest("No financial year available");
    return year;
  }

  async assertCanCloseCurrentYear(userId, asOfDate = new Date()) {
    const currentYear = await this.getDefaultYear(userId);
    if (currentYear.status !== "closed") {
      this._assertCloseAllowed(currentYear, asOfDate);
    }
    return currentYear;
  }

  async resolveYear(userId, financialYearId) {
    if (financialYearId && mongoose.Types.ObjectId.isValid(String(financialYearId))) {
      const selected = await FinancialYear.findOne({
        _id: financialYearId,
        user_id: userId,
      }).lean();
      if (!selected) throw ApiError.badRequest("Invalid financial year");
      return selected;
    }

    return this.getDefaultYear(userId);
  }

  async closeCurrentYear(userId, { backupId = "" } = {}) {
    await this._ensureCloseIndexIsolation();
    const currentYear = await this.assertCanCloseCurrentYear(userId);

    if (currentYear.status === "closed") {
      return { skipped: true, reason: "already_closed", financial_year: currentYear };
    }

    const now = new Date();
    const itemUpdate = await Item.updateMany(
      { user_id: userId },
      [
        {
          $set: {
            _next_opening_physical_stock: {
              $add: [
                { $ifNull: ["$opening_physical_stock", 0] },
                { $ifNull: ["$physical_stock", 0] },
              ],
            },
            _next_opening_logical_stock: {
              $add: [
                { $ifNull: ["$opening_logical_stock", 0] },
                { $ifNull: ["$logical_stock", 0] },
              ],
            },
          },
        },
        {
          $set: {
            opening_physical_stock: {
              $max: ["$_next_opening_physical_stock", 0],
            },
            opening_logical_stock: {
              $max: ["$_next_opening_logical_stock", 0],
            },
            physical_stock: {
              $min: ["$_next_opening_physical_stock", 0],
            },
            logical_stock: {
              $min: ["$_next_opening_logical_stock", 0],
            },
          },
        },
        {
          $set: {
            stock: "$physical_stock",
          },
        },
        { $unset: ["_next_opening_physical_stock", "_next_opening_logical_stock"] },
      ],
      { updatePipeline: true },
    );

    const closed = await FinancialYear.findByIdAndUpdate(
      currentYear._id,
      {
        status: "closed",
        closed_at: now,
        close_backup_id: backupId || "",
      },
      { new: true },
    ).lean();

    await FinancialYearClose.updateOne(
      { user_id: userId, financial_year_start: currentYear.start_year },
      {
        $set: {
          user_id: userId,
          financial_year_start: currentYear.start_year,
          financial_year_end: currentYear.end_year,
          closed_at: now,
          matched_items: itemUpdate?.matchedCount || 0,
          modified_items: itemUpdate?.modifiedCount || 0,
        },
      },
      { upsert: true },
    );

    const next = await this._ensureYear(userId, currentYear.start_year + 1, "open");

    return {
      skipped: false,
      financial_year: closed,
      next_financial_year: next,
      matched_items: itemUpdate?.matchedCount || 0,
      modified_items: itemUpdate?.modifiedCount || 0,
    };
  }
}

const financialYearService = new FinancialYearService();

export default financialYearService;
