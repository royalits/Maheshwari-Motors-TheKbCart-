import departmentService from "../../services/master/department.service.js";
import { ApiResponse, asyncHandler } from "../../utils/index.js";

class DepartmentController {
  getDepartmants = asyncHandler(async (req, res) => {
    const result = await departmentService.getDepartments(req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Departments fetched successfully"));
  });

  createDepartment = asyncHandler(async (req, res) => {
    const result = await departmentService.createDepartment(
      req.body,
      req.user._id,
    );
    res
      .status(201)
      .json(new ApiResponse(201, result, "Department created successfully"));
  });

  updateDepartment = asyncHandler(async (req, res) => {
    const result = await departmentService.updateDepartment(
      req.params.departmentId,
      req.body,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Department updated successfully"));
  });

  deleteDepartment = asyncHandler(async (req, res) => {
    await departmentService.deleteDepartment(
      req.params.departmentId,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, null, "Department deleted successfully"));
  });
}

export default new DepartmentController();
