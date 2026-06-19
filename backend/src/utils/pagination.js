import env from "../config/env.js";

class Pagination {
  static getParams(query) {
    const raw = parseInt(query.limit);
    const all = raw === -1;
    const page = all ? 1 : Math.max(1, parseInt(query.page) || 1);
    const limit =
      all ? 0 : (
        Math.min(env.MAX_PAGE_SIZE, Math.max(1, raw || env.DEFAULT_PAGE_SIZE))
      );
    const skip = all ? 0 : (page - 1) * limit;

    return { page, limit, skip, all };
  }

  static createMeta(total, page, limit) {
    if (limit === 0) {
      return {
        total,
        page: 1,
        limit: total,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };
    }

    const totalPages = Math.ceil(total / limit);

    return {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  static async paginate(model, query = {}, options = {}) {
    const { page, limit, skip, all } = this.getParams(options);
    const sort = options.sort || { createdAt: -1 };
    const populate = options.populate || "";
    const select = options.select || "";

    let q = model.find(query).sort(sort).populate(populate);
    
    // Only apply select if it's not empty
    if (select && select.trim() !== "") {
      q = q.select(select);
    }
    
    if (!all) {
      q = q.skip(skip).limit(limit);
    }

    const [data, total] = await Promise.all([
      q.lean(),
      model.countDocuments(query),
    ]);

    return {
      data,
      meta: this.createMeta(total, page, limit),
    };
  }
}

export default Pagination;
