import Counter from "../models/common/counter.model.js";

export async function getNextId(modelName, userId) {
  const counter = await Counter.findOneAndUpdate(
    { model_name: modelName, user_id: userId },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  return counter.seq;
}
