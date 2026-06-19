import { brandService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class BrandController {
  getBrands = asyncHandler(async (req, res) => {
    const result = await brandService.getBrands(req.user._id, req.query);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Brands fetched successfully"));
  });

  getBrandById = asyncHandler(async (req, res) => {
    const brand = await brandService.getBrandById(
      req.params.brandId,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, brand, "Brand fetched successfully"));
  });

  createBrand = asyncHandler(async (req, res) => {
    const data = req.body;
    const brand = await brandService.createBrand(
      {
        name: data.brand_name,
        discount1: data.discount1,
        discount2: data.discount2,
        hsn_id: data.hsn_id,
        item_ids: data.item_ids,
      },
      req.user._id,
    );
    res
      .status(201)
      .json(new ApiResponse(201, brand, "Brand created successfully"));
  });

  updateBrand = asyncHandler(async (req, res) => {
    const data = req.body;
    const updateData = {};
    if (data.brand_name !== undefined) updateData.name = data.brand_name;
    if (data.discount1 !== undefined) updateData.discount1 = data.discount1;
    if (data.discount2 !== undefined) updateData.discount2 = data.discount2;
    if (data.hsn_id !== undefined) updateData.hsn_id = data.hsn_id;
    if (data.item_ids !== undefined) updateData.item_ids = data.item_ids;

    const brand = await brandService.updateBrand(
      req.params.brandId,
      req.user._id,
      updateData,
    );
    res
      .status(200)
      .json(new ApiResponse(200, brand, "Brand updated successfully"));
  });

  deleteBrand = asyncHandler(async (req, res) => {
    await brandService.deleteBrand(req.params.brandId, req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, null, "Brand deleted successfully"));
  });

  updateDiscount = asyncHandler(async (req, res) => {
    const brand = await brandService.updateDiscount(
      req.params.brandId,
      req.user._id,
      req.body,
    );
    res
      .status(200)
      .json(new ApiResponse(200, brand, "Discount updated successfully"));
  });
}

const brandController = new BrandController();

export const getBrands = brandController.getBrands;
export const getBrandById = brandController.getBrandById;
export const createBrand = brandController.createBrand;
export const updateBrand = brandController.updateBrand;
export const deleteBrand = brandController.deleteBrand;
export const updateDiscount = brandController.updateDiscount;

export default brandController;
