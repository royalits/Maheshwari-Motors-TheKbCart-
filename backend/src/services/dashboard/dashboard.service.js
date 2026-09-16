import mongoose from "mongoose";
import Item from "../../models/master/item.model.js";
import Contact from "../../models/master/contact.model.js";
import Brand from "../../models/master/brand.model.js";
import Department from "../../models/master/department.model.js";
import Hsn from "../../models/master/hsn.model.js";
import Label from "../../models/master/label.model.js";
import Bank from "../../models/master/bank.model.js";
import Agent from "../../models/master/agent.model.js";
import Area from "../../models/master/area.model.js";
import Transport from "../../models/master/transport.model.js";
import Challan from "../../models/transaction/challan.model.js";
import Bill from "../../models/transaction/bill.model.js";
import Transaction from "../../models/transaction/transaction.model.js";
import Return from "../../models/transaction/return.model.js";
import AutoBill from "../../models/transaction/auto_bill.model.js";
import Subscription from "../../models/common/subscription.model.js";

const sumDueExpression = {
  $let: {
    vars: {
      due: {
        $subtract: [
          "$amount",
          {
            $add: [
              { $ifNull: ["$paid_amount", 0] },
              { $ifNull: ["$settlement_discount", 0] },
            ],
          },
        ],
      },
    },
    in: { $cond: [{ $gt: ["$$due", 0] }, "$$due", 0] },
  },
};

class DashboardService {
  async getDashboard(userId, isGst = null, financialYearId = null, query = {}) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const financialYearObjectId =
      financialYearId ? new mongoose.Types.ObjectId(financialYearId) : null;
    const firmIsGst =
      Number(isGst) === 1 ? 1
      : Number(isGst) === 0 ? 0
      : null;
    const billFirmFilter =
      firmIsGst === null ?
        { user_id: userObjectId }
      : { user_id: userObjectId, is_gst: firmIsGst };
    if (financialYearId) billFirmFilter.financial_year_id = financialYearId;

    const challanYearFilter =
      financialYearId ? { financial_year_id: financialYearId } : {};
    const billYearMatch =
      financialYearObjectId ? { financial_year_id: financialYearObjectId } : {};
    const firmYearFilter =
      firmIsGst === null ?
        { user_id: userObjectId, ...challanYearFilter }
      : { user_id: userObjectId, is_gst: firmIsGst, ...challanYearFilter };
    const firmYearMatch = {
      user_id: userObjectId,
      ...(firmIsGst === null ? {} : { is_gst: firmIsGst }),
      ...billYearMatch,
    };
    const [
      itemCount,
      gstItemCount,
      nongstItemCount,
      brandCount,
      departmentCount,
      hsnCount,
      labelCount,
      bankCount,
      agentCount,
      areaCount,
      transportCount,
      partyCount,
      supplierCount,
      bookCount,
      saleChallanCount,
      purchaseChallanCount,
      totalChallanCount,
      convertedChallanCount,
      unconvertedChallanCount,
      gstChallanCount,
      nongstChallanCount,
      gstBillCount,
      nongstBillCount,
      currentFirmBillCount,
      dueBillCount,
      settledBillCount,
      overpaidBillCount,
      lowStockCount,
      zeroStockCount,
      negativeStockCount,
      gstRevenue,
      nongstRevenue,
      totalRevenue,
      pendingPayments,
      billSummary,
      stockValue,
      gstMovement,
      transactionCount,
      transactionSummary,
      returnCount,
      saleReturnCount,
      purchaseReturnCount,
      autoBillCount,
      activeAutoBillCount,
    ] = await Promise.all([
      Item.countDocuments({ user_id: userObjectId }),
      Item.countDocuments({ user_id: userObjectId, is_gst: 1 }),
      Item.countDocuments({ user_id: userObjectId, is_gst: 0 }),
      Brand.countDocuments({ user_id: userObjectId }),
      Department.countDocuments({ user_id: userObjectId }),
      Hsn.countDocuments({ user_id: userObjectId }),
      Label.countDocuments({ user_id: userObjectId }),
      Bank.countDocuments({ user_id: userObjectId }),
      Agent.countDocuments({ user_id: userObjectId }),
      Area.countDocuments({ user_id: userObjectId }),
      Transport.countDocuments({ user_id: userObjectId }),
      Contact.countDocuments({ user_id: userObjectId, type: "party" }),
      Contact.countDocuments({ user_id: userObjectId, type: "supplier" }),
      Contact.countDocuments({ user_id: userObjectId, type: "book" }),
      Challan.countDocuments({ ...firmYearFilter, challan_type: "sale" }),
      Challan.countDocuments({ ...firmYearFilter, challan_type: "purchase" }),
      Challan.countDocuments(firmYearFilter),
      Challan.countDocuments({ ...firmYearFilter, converted_to_bill: true }),
      Challan.countDocuments({ ...firmYearFilter, converted_to_bill: false }),
      Challan.countDocuments({ user_id: userObjectId, is_gst: 1, ...challanYearFilter }),
      Challan.countDocuments({ user_id: userObjectId, is_gst: 0, ...challanYearFilter }),
      Bill.countDocuments({ user_id: userObjectId, is_gst: 1, ...challanYearFilter }),
      Bill.countDocuments({ user_id: userObjectId, is_gst: 0, ...challanYearFilter }),
      Bill.countDocuments(billFirmFilter),
      Bill.countDocuments({ ...billFirmFilter, payment_status: "due" }),
      Bill.countDocuments({ ...billFirmFilter, payment_status: "paid" }),
      Bill.countDocuments({ ...billFirmFilter, payment_status: "overpaid" }),
      Item.aggregate([
        { $match: { user_id: userObjectId, threshold: { $gt: 0 } } },
        {
          $addFields: {
            current_stock: {
              $ifNull: ["$physical_stock", { $ifNull: ["$stock", 0] }],
            },
          },
        },
        { $match: { $expr: { $lte: ["$current_stock", "$threshold"] } } },
        { $count: "count" },
      ]),
      Item.aggregate([
        { $match: { user_id: userObjectId } },
        {
          $addFields: {
            current_stock: {
              $ifNull: ["$physical_stock", { $ifNull: ["$stock", 0] }],
            },
          },
        },
        { $match: { current_stock: 0 } },
        { $count: "count" },
      ]),
      Item.aggregate([
        { $match: { user_id: userObjectId } },
        {
          $addFields: {
            current_stock: {
              $ifNull: ["$physical_stock", { $ifNull: ["$stock", 0] }],
            },
          },
        },
        { $match: { current_stock: { $lt: 0 } } },
        { $count: "count" },
      ]),
      Bill.aggregate([
        { $match: { user_id: userObjectId, is_gst: 1, ...billYearMatch } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Bill.aggregate([
        { $match: { user_id: userObjectId, is_gst: 0, ...billYearMatch } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Bill.aggregate([
        { $match: { user_id: userObjectId, contact_type: "party", ...billYearMatch } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Bill.aggregate([
        {
          $match: {
            ...firmYearMatch,
            contact_type: "party",
            payment_status: { $ne: "paid" },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: sumDueExpression },
          },
        },
      ]),
      Bill.aggregate([
        { $match: firmYearMatch },
        {
          $group: {
            _id: null,
            total_amount: { $sum: "$amount" },
            total_paid: { $sum: { $ifNull: ["$paid_amount", 0] } },
            total_discount: {
              $sum: { $ifNull: ["$settlement_discount", 0] },
            },
            total_due: { $sum: sumDueExpression },
          },
        },
      ]),
      Item.aggregate([
        { $match: { user_id: userObjectId } },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $multiply: [
                  {
                    $add: [
                      { $ifNull: ["$physical_stock", 0] },
                      { $ifNull: ["$opening_physical_stock", 0] },
                    ],
                  },
                  { $ifNull: ["$purchase_rate", 0] },
                ],
              },
            },
          },
        },
      ]),
      Challan.aggregate([
        { $match: { user_id: userObjectId, is_gst: 1, ...billYearMatch } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$challan_type",
            total: { $sum: { $ifNull: ["$items.gst_amount", 0] } },
          },
        },
      ]),
      Transaction.countDocuments(firmYearFilter),
      Transaction.aggregate([
        { $match: firmYearMatch },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
          },
        },
      ]),
      Return.countDocuments(firmYearFilter),
      Return.countDocuments({ ...firmYearFilter, return_type: "sale_return" }),
      Return.countDocuments({
        ...firmYearFilter,
        return_type: "purchase_return",
      }),
      AutoBill.countDocuments({ user_id: userObjectId }),
      AutoBill.countDocuments({ user_id: userObjectId, enabled: true }),
    ]);

    const recentChallans = await Challan.find({
      user_id: userObjectId,
      ...challanYearFilter,
    })
      .sort({ converted_to_bill: 1, createdAt: -1 })
      .limit(5)
      .populate("contact_id", "name type")
      .lean();

    const recentBills = await Bill.find(billFirmFilter)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("contact_id", "name type")
      .lean();

    const now = new Date();
    const overdueBillsRaw = await Bill.find({
      ...billFirmFilter,
      contact_type: { $ne: "supplier" },
      payment_status: "due",
    })
      .populate("contact_id", "name phone whatsapp_number type due_days")
      .sort({ date: 1, createdAt: 1 })
      .lean();

    const overdueReminders = [];
    for (const bill of overdueBillsRaw) {
      const contact = bill.contact_id || {};
      // Skip if contact is explicitly a supplier
      if (contact.type === "supplier") continue;

      const billDate = bill.date ? new Date(bill.date) : new Date(bill.createdAt);
      const partyDueDays = Number(contact.due_days || 0);
      // Derive effective due date dynamically from bill date + party credit (due_days)
      const effectiveDueDate = new Date(
        billDate.getTime() + partyDueDays * 24 * 60 * 60 * 1000
      );

      if (effectiveDueDate < now) {
        const diffMs = now.getTime() - effectiveDueDate.getTime();
        const overdueDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const dueAmount = Math.max(
          0,
          Number(bill.amount || 0) -
            Number(bill.paid_amount || 0) -
            Number(bill.return_amount || 0) -
            Number(bill.settlement_discount || 0),
        );

        if (dueAmount > 0) {
          overdueReminders.push({
            bill_id: bill._id,
            bill_no: bill.bill_no,
            date: bill.date,
            due_date: effectiveDueDate,
            overdue_days: overdueDays,
            amount: bill.amount,
            paid_amount: bill.paid_amount || 0,
            due_amount: dueAmount,
            contact_name: contact.name || bill.customer_name || "Unknown Party",
            contact_phone: contact.phone || "",
            contact_whatsapp: contact.whatsapp_number || contact.phone || "",
            contact_id: contact._id || bill.contact_id,
            is_gst: bill.is_gst,
          });
        }
      }
    }
    overdueReminders.sort((a, b) => b.overdue_days - a.overdue_days);

    // Newly Purchased Items (This Month Inflow)
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const recentPurchaseChallans = await Challan.find({
      user_id: userObjectId,
      challan_type: "purchase",
      date: { $gte: currentMonthStart },
      ...challanYearFilter,
    })
      .populate("contact_id", "name")
      .populate("items.item_id", "item_name barcode item_id purchase_rate sale_rate")
      .lean();

    const newlyPurchasedMap = new Map();
    for (const ch of recentPurchaseChallans) {
      for (const line of ch.items || []) {
        if (!line.item_id) continue;
        const itemIdStr = String(line.item_id._id || line.item_id);
        const qty = Number(line.quantity || 0);
        const rate = Number(line.rate || line.item_id.purchase_rate || 0);
        const amt = Number(line.amount || qty * rate);

        if (!newlyPurchasedMap.has(itemIdStr)) {
          newlyPurchasedMap.set(itemIdStr, {
            item_id: itemIdStr,
            item_name: line.item_id.item_name || "Unknown Item",
            barcode: line.item_id.barcode || line.item_id.item_id || "",
            purchase_date: ch.date,
            supplier_name: ch.contact_id?.name || "Unknown Supplier",
            total_quantity: 0,
            purchase_rate: rate,
            total_amount: 0,
          });
        }
        const existing = newlyPurchasedMap.get(itemIdStr);
        existing.total_quantity += qty;
        existing.total_amount += amt;
        if (new Date(ch.date) > new Date(existing.purchase_date)) {
          existing.purchase_date = ch.date;
          existing.supplier_name = ch.contact_id?.name || existing.supplier_name;
        }
      }
    }
    const newlyPurchasedItems = Array.from(newlyPurchasedMap.values());

    // Slow-Moving / Dead Stock Analytics
    const slowMovingMonths = Math.max(1, Number(query.slow_moving_months || 6));
    const cutoffDate = new Date(now.getTime() - slowMovingMonths * 30 * 24 * 60 * 60 * 1000);

    const itemsWithStock = await Item.find({
      user_id: userObjectId,
      $or: [
        { physical_stock: { $gt: 0 } },
        { stock: { $gt: 0 } },
        { logical_stock: { $gt: 0 } },
      ],
    }).lean();

    const stockItemIds = itemsWithStock.map((i) => i._id);

    const saleChallanAgg = await Challan.aggregate([
      {
        $match: {
          user_id: userObjectId,
          challan_type: "sale",
          "items.item_id": { $in: stockItemIds },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.item_id": { $in: stockItemIds } } },
      {
        $group: {
          _id: "$items.item_id",
          lastSaleDate: { $max: "$date" },
        },
      },
    ]);

    const saleBillAgg = await Bill.aggregate([
      {
        $match: {
          user_id: userObjectId,
          contact_type: "party",
          "auto_bill_items.item_id": { $in: stockItemIds },
        },
      },
      { $unwind: "$auto_bill_items" },
      { $match: { "auto_bill_items.item_id": { $in: stockItemIds } } },
      {
        $group: {
          _id: "$auto_bill_items.item_id",
          lastSaleDate: { $max: "$date" },
        },
      },
    ]);

    const lastSaleDateMap = new Map();
    saleChallanAgg.forEach((row) => {
      if (row._id && row.lastSaleDate) {
        lastSaleDateMap.set(String(row._id), new Date(row.lastSaleDate));
      }
    });
    saleBillAgg.forEach((row) => {
      if (row._id && row.lastSaleDate) {
        const d = new Date(row.lastSaleDate);
        const existing = lastSaleDateMap.get(String(row._id));
        if (!existing || d > existing) {
          lastSaleDateMap.set(String(row._id), d);
        }
      }
    });

    const slowMovingItems = [];
    let totalSlowMovingCapital = 0;

    for (const item of itemsWithStock) {
      const itemIdStr = String(item._id);
      const lastSaleDate = lastSaleDateMap.get(itemIdStr) || null;

      if (!lastSaleDate || lastSaleDate < cutoffDate) {
        const currentStock = Number(item.physical_stock ?? item.stock ?? item.logical_stock ?? 0);
        const purchaseRate = Number(item.purchase_rate || 0);
        const capitalValue = currentStock * purchaseRate;

        let daysUnsold = null;
        if (lastSaleDate) {
          const diffMs = now.getTime() - lastSaleDate.getTime();
          daysUnsold = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }

        totalSlowMovingCapital += capitalValue;

        slowMovingItems.push({
          item_id: item._id,
          item_name: item.item_name,
          barcode: item.barcode || item.item_id || "",
          current_stock: currentStock,
          purchase_rate: purchaseRate,
          capital_value: capitalValue,
          last_sale_date: lastSaleDate,
          days_unsold: daysUnsold,
        });
      }
    }
    slowMovingItems.sort((a, b) => b.capital_value - a.capital_value);

    const gstMovementMap = new Map(
      gstMovement.map((row) => [String(row._id || "").toLowerCase(), row.total || 0]),
    );
    const transactionMap = new Map(
      transactionSummary.map((row) => [
        String(row._id || "").toLowerCase(),
        { count: row.count || 0, amount: row.amount || 0 },
      ]),
    );
    const transactionTotals = {
      bank_received: transactionMap.get("bank_received") || { count: 0, amount: 0 },
      cash_received: transactionMap.get("cash_received") || { count: 0, amount: 0 },
      bank_payment: transactionMap.get("bank_payment") || { count: 0, amount: 0 },
      cash_payment: transactionMap.get("cash_payment") || { count: 0, amount: 0 },
    };
    const totalReceived =
      transactionTotals.bank_received.amount +
      transactionTotals.cash_received.amount;
    const totalPayment =
      transactionTotals.bank_payment.amount +
      transactionTotals.cash_payment.amount;
    const billSummaryRow = billSummary[0] || {};
    const lowStockItems = lowStockCount[0]?.count || 0;
    const zeroStockItems = zeroStockCount[0]?.count || 0;
    const negativeStockItems = negativeStockCount[0]?.count || 0;

    return {
      counts: {
        items: itemCount,
        total_items: itemCount,
        gst_items: gstItemCount,
        nongst_items: nongstItemCount,
        brands: brandCount,
        departments: departmentCount,
        hsn_codes: hsnCount,
        labels: labelCount,
        banks: bankCount,
        agents: agentCount,
        areas: areaCount,
        transports: transportCount,
        parties: partyCount,
        suppliers: supplierCount,
        books: bookCount,
        contacts: partyCount + supplierCount,
        total_contacts: partyCount + supplierCount,
        total_challans: totalChallanCount,
        sale_challans: saleChallanCount,
        purchase_challans: purchaseChallanCount,
        converted_challans: convertedChallanCount,
        unconverted_challans: unconvertedChallanCount,
        gst_challans: gstChallanCount,
        nongst_challans: nongstChallanCount,
        total_bills: currentFirmBillCount,
        gst_bills: gstBillCount,
        nongst_bills: nongstBillCount,
        unsettled_bills: dueBillCount,
        paid_bills: settledBillCount,
        settled_bills: settledBillCount + overpaidBillCount,
        overpaid_bills: overpaidBillCount,
        low_stock_items: lowStockItems,
        zero_stock_items: zeroStockItems,
        negative_stock_items: negativeStockItems,
        transactions: transactionCount,
        returns: returnCount,
        sale_returns: saleReturnCount,
        purchase_returns: purchaseReturnCount,
        auto_bills: autoBillCount,
        active_auto_bills: activeAutoBillCount,
      },
      metrics: {
        inventory: {
          total_items: itemCount,
          gst_items: gstItemCount,
          nongst_items: nongstItemCount,
          low_stock_items: lowStockItems,
          zero_stock_items: zeroStockItems,
          negative_stock_items: negativeStockItems,
          stock_value: stockValue[0]?.total || 0,
        },
        masters: {
          parties: partyCount,
          suppliers: supplierCount,
          brands: brandCount,
          departments: departmentCount,
          hsn_codes: hsnCount,
          labels: labelCount,
          banks: bankCount,
          agents: agentCount,
          areas: areaCount,
          transports: transportCount,
        },
        challans: {
          total: totalChallanCount,
          sale: saleChallanCount,
          purchase: purchaseChallanCount,
          converted: convertedChallanCount,
          unconverted: unconvertedChallanCount,
          gst: gstChallanCount,
          nongst: nongstChallanCount,
        },
        bills: {
          total: currentFirmBillCount,
          gst: gstBillCount,
          nongst: nongstBillCount,
          unsettled: dueBillCount,
          paid: settledBillCount,
          settled: settledBillCount + overpaidBillCount,
          overpaid: overpaidBillCount,
          total_amount: billSummaryRow.total_amount || 0,
          total_paid: billSummaryRow.total_paid || 0,
          total_discount: billSummaryRow.total_discount || 0,
          total_due: billSummaryRow.total_due || 0,
        },
        transactions: {
          total: transactionCount,
          received_amount: totalReceived,
          payment_amount: totalPayment,
          net_amount: totalReceived - totalPayment,
          by_type: transactionTotals,
        },
        returns: {
          total: returnCount,
          sale: saleReturnCount,
          purchase: purchaseReturnCount,
        },
        automation: {
          auto_bills: autoBillCount,
          active_auto_bills: activeAutoBillCount,
        },
      },
      revenue: {
        gst: gstRevenue[0]?.total || 0,
        nongst: nongstRevenue[0]?.total || 0,
      },
      total_revenue: totalRevenue[0]?.total || 0,
      pending_payments: pendingPayments[0]?.total || 0,
      stock_value: stockValue[0]?.total || 0,
      gst_collected: gstMovementMap.get("sale") || 0,
      gst_paid: gstMovementMap.get("purchase") || 0,
      recent_challans: recentChallans,
      recent_bills: recentBills,
      overdue_reminders: overdueReminders,
      overdue_summary: {
        total_overdue_count: overdueReminders.length,
        total_overdue_amount: overdueReminders.reduce((sum, r) => sum + r.due_amount, 0),
      },
      newly_purchased_items: newlyPurchasedItems,
      newly_purchased_summary: {
        total_items: newlyPurchasedItems.length,
        total_investment: newlyPurchasedItems.reduce((sum, i) => sum + i.total_amount, 0),
      },
      slow_moving_stock: slowMovingItems,
      slow_moving_summary: {
        slow_moving_months: slowMovingMonths,
        total_slow_moving_count: slowMovingItems.length,
        total_slow_moving_capital: totalSlowMovingCapital,
      },
      subscription_expiry_alert: await (async () => {
        const userSub = await Subscription.findOne({ user_id: userObjectId })
          .sort({ expiry_date: -1, createdAt: -1 })
          .lean();
        if (!userSub) return null;

        const expiryDate = new Date(userSub.expiry_date);
        const diffMs = expiryDate.getTime() - now.getTime();
        const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        const isExpired = diffMs <= 0 || userSub.status === "expired";
        const isExpiringSoon = daysRemaining <= 7 || isExpired;

        return {
          is_expiring_soon: isExpiringSoon,
          days_remaining: daysRemaining,
          expiry_date: userSub.expiry_date,
          plan_type: userSub.plan_type || "demo",
          status: userSub.status || "active",
          is_expired: isExpired,
        };
      })(),
    };
  }

  async getFirmDashboard(userId, isGst, period, query = {}) {
    const filter = { user_id: userId, is_gst: isGst };
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const financialYearObjectId =
      query.financial_year_id ?
        new mongoose.Types.ObjectId(query.financial_year_id)
      : null;
    if (query.financial_year_id) filter.financial_year_id = query.financial_year_id;

    const now = new Date();
    let startDate;
    if (period === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "yearly") {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const periodFilter = { ...filter, createdAt: { $gte: startDate } };
    const aggPeriodFilter = {
      user_id: userObjectId,
      is_gst: isGst,
      createdAt: { $gte: startDate },
      ...(financialYearObjectId
        ? { financial_year_id: financialYearObjectId }
        : {}),
    };
    const purchasePeriodFilter = {
      user_id: userId,
      challan_type: "purchase",
      createdAt: { $gte: startDate },
      ...(query.financial_year_id
        ? { financial_year_id: query.financial_year_id }
        : {}),
    };
    const aggPurchasePeriodFilter = {
      user_id: userObjectId,
      challan_type: "purchase",
      createdAt: { $gte: startDate },
      ...(financialYearObjectId
        ? { financial_year_id: financialYearObjectId }
        : {}),
    };

    const [
      challanCount,
      billCount,
      revenue,
      pendingAmount,
      purchaseCount,
      purchaseAmount,
    ] = await Promise.all([
      Challan.countDocuments({ ...periodFilter, challan_type: "sale" }),
      Bill.countDocuments(periodFilter),
      Bill.aggregate([
        { $match: aggPeriodFilter },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Bill.aggregate([
        {
          $match: {
            ...aggPeriodFilter,
            payment_status: { $ne: "paid" },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $subtract: ["$amount", "$paid_amount"] } },
          },
        },
      ]),
      Challan.countDocuments(purchasePeriodFilter),
      Challan.aggregate([
        { $match: aggPurchasePeriodFilter },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const monthlyRevenue = await Bill.aggregate([
      {
        $match: {
          user_id: userObjectId,
          is_gst: isGst,
          createdAt: { $gte: startDate },
          ...(financialYearObjectId
            ? { financial_year_id: financialYearObjectId }
            : {}),
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      period: period || "monthly",
      sale_challans: challanCount,
      purchase_challans: purchaseCount,
      bills: billCount,
      total_revenue: revenue[0]?.total || 0,
      pending_amount: pendingAmount[0]?.total || 0,
      purchase_amount: purchaseAmount[0]?.total || 0,
      monthly_revenue: monthlyRevenue,
    };
  }
}

export default new DashboardService();
