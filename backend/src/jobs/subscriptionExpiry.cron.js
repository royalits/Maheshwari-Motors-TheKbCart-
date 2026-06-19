import cron from "node-cron";
import subscriptionService from "../services/subscription/subscription.service.js";

export function startSubscriptionCron() {
  cron.schedule(
    "0 0 * * *",
    async () => {
      const tag = "[SubscriptionCron]";
      try {
        const now = new Date();
        const expired = await subscriptionService.markExpiredSubscriptions(now);
        const expiringToday = await subscriptionService.getExpiringToday(now);

        console.log(
          `${tag} Marked expired: ${expired.modified}, Expiring today: ${
            Array.isArray(expiringToday) ? expiringToday.length : 0
          }`,
        );
      } catch (error) {
        console.error(`${tag} Failed:`, error.message || error);
      }
    },
    {
      timezone: "Asia/Kolkata",
    },
  );
}
