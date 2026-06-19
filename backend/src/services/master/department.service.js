import departmentModel from "../../models/master/department.model.js";
import Item from "../../models/master/item.model.js";
import { ApiError, Pagination } from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";

class DepartmentService {
  async getDepartments(userId) {
    const filter = { user_id: userId };
    return await Pagination.paginate(departmentModel, filter, {
      sort: { createdAt: -1 },
    });
  }

  async createDepartment(data, userId) {
    const { name } = data;

    if (!name || typeof name !== "string" || !name.trim()) {
      throw ApiError.badRequest("Department name is required");
    }

    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const duplicate = await departmentModel.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      user_id: userId,
    });

    if (duplicate) {
      throw ApiError.conflict("Department with this name already exists");
    }

    const department = await departmentModel.create({
      id: await getNextId("Department", userId),
      name: name.trim(),
      user_id: userId,
    });

    return department;
  }

  async updateDepartment(departmentId, data, userId) {
    const department = await departmentModel.findOne({
      _id: departmentId,
      user_id: userId,
    });
    if (!department) {
      throw ApiError.notFound("Department not found");
    }

    const { name } = data;
    if (!name || typeof name !== "string" || !name.trim()) {
      throw ApiError.badRequest("Department name is required");
    }

    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const duplicate = await departmentModel.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      user_id: userId,
      _id: { $ne: departmentId },
    });
    if (duplicate) {
      throw ApiError.conflict(
        "Another department with this name already exists",
      );
    }

    department.name = name.trim();
    await department.save();
    return department;
  }

  async deleteDepartment(departmentId, userId) {
    const department = await departmentModel.findOne({
      _id: departmentId,
      user_id: userId,
    });
    if (!department) {
      throw ApiError.notFound("Department not found");
    }

    const linkedItemCount = await Item.countDocuments({
      dept_id: departmentId,
      user_id: userId,
    });
    if (linkedItemCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete department used in ${linkedItemCount} item(s). Remove department from items first.`,
      );
    }

    await departmentModel.findByIdAndDelete(departmentId);
  }
}

export default new DepartmentService();
