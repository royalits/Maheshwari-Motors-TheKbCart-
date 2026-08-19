import { itemService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class ItemController {
  getItems = asyncHandler(async (req, res) => {
    const result = await itemService.getItems(
      req.user._id,
      req.query,
      req.isGst,
    );

    // Client role: Return only MRP and images
    if (req.role === "firm" && req.firmRole === "client") {
      const clientItems = result.data.map((item) => ({
        _id: item._id,
        id: item.id,
        item_name: item.item_name,
        brand_id: item.brand_id,
        mrp_rate: item.mrp_rate,
        image: item.image,
        hsn_id: item.hsn_id,
        barcode: item.barcode,
      }));
      return res.status(200).json(
        new ApiResponse(
          200,
          { data: clientItems, meta: result.meta },
          "Items fetched successfully",
        ),
      );
    }

    res
      .status(200)
      .json(new ApiResponse(200, result, "Items fetched successfully"));
  });

  getItemById = asyncHandler(async (req, res) => {
    const item = await itemService.getItemById(
      req.params.itemId,
      req.user._id,
      req.isGst,
    );

    // Client role: Return only MRP and images
    if (req.role === "firm" && req.firmRole === "client") {
      const clientItem = {
        _id: item._id,
        id: item.id,
        name: item.name,
        brand: item.brand,
        mrp: item.mrp,
        image: item.image,
        hsn: item.hsn,
        barcode: item.barcode,
      };
      return res
        .status(200)
        .json(new ApiResponse(200, clientItem, "Item fetched successfully"));
    }

    res
      .status(200)
      .json(new ApiResponse(200, item, "Item fetched successfully"));
  });

  getItemImage = asyncHandler(async (req, res, next) => {
    const { stream, contentType, contentLength } =
      await itemService.getItemImageStream(req.params.itemId);

    res.setHeader("Content-Type", contentType);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    res.setHeader(
      "Cache-Control",
      "public, max-age=86400, stale-while-revalidate=3600",
    );
    stream.on("error", (err) => {
      if (!res.headersSent) next(err);
    });
    stream.pipe(res);
  });

  createItem = asyncHandler(async (req, res) => {
    const item = await itemService.createItem(
      req.body,
      req.user._id,
      req.file,
      req.isGst,
    );
    res
      .status(201)
      .json(new ApiResponse(201, item, "Item created successfully"));
  });

  importItems = asyncHandler(async (req, res) => {
    const result = await itemService.importItems(
      req.file,
      req.user._id,
      req.isGst,
    );
    const status = result.totalFailed > 0 ? 207 : 201;
    res
      .status(status)
      .json(
        new ApiResponse(
          status,
          result,
          result.totalFailed > 0 ?
            "Items imported with skipped rows"
          : "Items imported successfully",
        ),
      );
  });

  exportItems = asyncHandler(async (req, res) => {
    const buffer = await itemService.exportItems(
      req.user._id,
      req.query,
      req.isGst,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="items-export.xlsx"',
    );
    res.status(200).send(buffer);
  });

  updateItem = asyncHandler(async (req, res) => {
    const item = await itemService.updateItem(
      req.params.itemId,
      req.user._id,
      req.body,
      req.file,
      req.isGst,
    );
    res
      .status(200)
      .json(new ApiResponse(200, item, "Item updated successfully"));
  });

  deleteItem = asyncHandler(async (req, res) => {
    await itemService.deleteItem(req.params.itemId, req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, null, "Item deleted successfully"));
  });

  getLowStockItems = asyncHandler(async (req, res) => {
    const items = await itemService.getLowStockItems(
      req.user._id,
      req.query,
      req.isGst,
    );
    res
      .status(200)
      .json(
        new ApiResponse(200, items, "Low stock items fetched successfully"),
      );
  });

  updateStock = asyncHandler(async (req, res) => {
    const item = await itemService.updateStock(
      req.params.itemId,
      req.user._id,
      req.body,
      req.isGst,
    );
    res
      .status(200)
      .json(new ApiResponse(200, item, "Stock updated successfully"));
  });

  batchUpdateItems = asyncHandler(async (req, res) => {
    const result = await itemService.batchUpdateItems(
      req.body.updates,
      req.user._id,
      req.isGst,
    );
    const status = result.totalFailed > 0 && result.totalUpdated > 0 ? 207 : 200;
    res
      .status(status)
      .json(new ApiResponse(status, result, "Batch update completed"));
  });

  checkBarcodeUnique = asyncHandler(async (req, res) => {
    const result = await itemService.checkBarcodeUnique(req.body.barcode);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Barcode check completed"));
  });
}

const itemController = new ItemController();

export const getItems = itemController.getItems;
export const getItemById = itemController.getItemById;
export const getItemImage = itemController.getItemImage;
export const createItem = itemController.createItem;
export const importItems = itemController.importItems;
export const exportItems = itemController.exportItems;
export const updateItem = itemController.updateItem;
export const deleteItem = itemController.deleteItem;
export const getLowStockItems = itemController.getLowStockItems;
export const updateStock = itemController.updateStock;
export const batchUpdateItems = itemController.batchUpdateItems;
export const checkBarcodeUnique = itemController.checkBarcodeUnique;

export default itemController;
