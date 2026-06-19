import "dotenv/config";
import { connectDB, disconnectDB } from "../src/config/database.js";
import subscriptionService from "../src/services/subscription/subscription.service.js";

class SubscriptionExpiryJob {
  async run() {
    await connectDB();

    try {
      const expired = await subscriptionService.markExpiredSubscriptions(
        new Date(),
      );
      const expiringToday = await subscriptionService.getExpiringToday(
        new Date(),
      );

        "[SubscriptionJob] Expiring today:",
        Array.isArray(expiringToday) ? expiringToday.length : 0,
      );
    } finally {
      await disconnectDB();
    }
  }
}

const job = new SubscriptionExpiryJob();
job
  .run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[SubscriptionJob] Failed:", error);
    process.exit(1);
  });
