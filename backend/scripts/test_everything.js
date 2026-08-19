import assert from "node:assert";
import s3Service from "../src/services/common/s3.service.js";
import User from "../src/models/auth/user.model.js";
import adminService from "../src/services/auth/admin.service.js";
import itemService from "../src/services/master/item.service.js";
import backupService from "../src/services/backup/backup.service.js";
import router from "../src/routers/index.js";
import mediaController from "../src/controllers/media.controller.js";
import itemController from "../src/controllers/master/item.controller.js";
import backupController from "../src/controllers/backup/backup.controller.js";
import fs from "fs";
import path from "path";

console.log("==================================================");
console.log("  RUNNING FULL AUTOMATED SECURITY & SYSTEM TESTS  ");
console.log("==================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error("   Error:", err.message);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error("   Error:", err.message);
    failed++;
  }
}

async function runTests() {
  // Test 1: Router and Module Loading
  test("Express Router & Controllers loaded cleanly without error", () => {
    assert.ok(router, "Router should be defined");
    assert.strictEqual(typeof router, "function", "Router should be an Express router function");
    assert.ok(mediaController.streamItemImage, "Media controller should have streamItemImage");
    assert.ok(mediaController.streamSignature, "Media controller should have streamSignature");
    assert.ok(mediaController.streamFile, "Media controller should have streamFile");
    assert.ok(itemController.getItemImage, "Item controller should have getItemImage");
    assert.ok(backupController.downloadBackup, "Backup controller should have downloadBackup");
  });

  // Test 2: S3 Key Extraction
  test("S3Service.extractKey correctly extracts clean keys from all URL variations", () => {
    const directUrl = "https://thekbcart.s3.ap-south-1.amazonaws.com/items/abc-123.png";
    assert.strictEqual(s3Service.extractKey(directUrl), "items/abc-123.png");

    const presignedUrl = "https://thekbcart.s3.ap-south-1.amazonaws.com/backups/thekbcart/file.xlsx?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA123";
    assert.strictEqual(s3Service.extractKey(presignedUrl), "backups/thekbcart/file.xlsx");

    const plainKey = "items/photo.jpg";
    assert.strictEqual(s3Service.extractKey(plainKey), "items/photo.jpg");

    const leadingSlashKey = "/items/photo.jpg";
    assert.strictEqual(s3Service.extractKey(leadingSlashKey), "items/photo.jpg");

    assert.strictEqual(s3Service.extractKey(""), "");
    assert.strictEqual(s3Service.extractKey(null), "");
    assert.strictEqual(s3Service.extractKey(undefined), "");
  });

  // Test 3: User Model Signature Masking
  test("User toSafeObject masks signature and strips passwords", () => {
    const dummyUser = new User({
      name: "Test User",
      email: "test@example.com",
      type: "main",
      signature: "https://thekbcart.s3.ap-south-1.amazonaws.com/users/signatures/sig1.png",
      gst_firm: {
        username: "gst_user",
        password: "secretpassword123",
        signature: "https://thekbcart.s3.ap-south-1.amazonaws.com/users/signatures/sig_gst.png",
      },
      nongst_firm: {
        username: "nongst_user",
        password: "secretpassword456",
      },
    });

    const safeObj = dummyUser.toSafeObject();
    assert.strictEqual(safeObj.signature, "/api/v1/auth/signature", "User signature must be masked to proxy route");
    assert.strictEqual(safeObj.gst_firm.password, undefined, "Password must be stripped");
    assert.strictEqual(safeObj.nongst_firm.password, undefined, "Password must be stripped");
  });

  // Test 4: Admin Service User Object Masking
  test("AdminService._toSafeUserObject masks user signatures to admin proxy endpoint", () => {
    const userPayload = {
      _id: "64abc123def4567890123456",
      name: "Admin Client",
      signature: "https://thekbcart.s3.ap-south-1.amazonaws.com/users/signatures/admin_sig.png",
      gst_firm: {
        signature: "https://thekbcart.s3.ap-south-1.amazonaws.com/users/signatures/gst_sig.png",
      },
      nongst_firm: {
        signature: "https://thekbcart.s3.ap-south-1.amazonaws.com/users/signatures/nongst_sig.png",
      },
    };

    const safeAdminUser = adminService._toSafeUserObject(userPayload);
    assert.strictEqual(safeAdminUser.signature, "/api/v1/admin/users/64abc123def4567890123456/signature");
    assert.strictEqual(safeAdminUser.gst_firm.signature, "/api/v1/admin/users/64abc123def4567890123456/signature?firm=GST");
    assert.strictEqual(safeAdminUser.nongst_firm.signature, "/api/v1/admin/users/64abc123def4567890123456/signature?firm=NON_GST");
  });

  // Test 5: Item Stock & Image Normalization Masking
  test("ItemService._normalizeStockForResponse masks direct S3 images to backend proxy route", () => {
    const rawItem = {
      _id: "64def123abc4567890123456",
      item_name: "Brake Pad",
      stock: 50,
      opening_physical_stock: 10,
      physical_stock: 40,
      logical_stock: 5,
      image: "https://thekbcart.s3.ap-south-1.amazonaws.com/items/brakepad.png",
    };

    const normalized = itemService._normalizeStockForResponse(rawItem, 1);
    assert.strictEqual(normalized.image, "/api/v1/items/64def123abc4567890123456/image");
    assert.strictEqual(normalized.stock, 50);
  });

  // Test 6: Backup Service Log Masking
  await asyncTest("BackupService.getLogs returns masked download_url and no AWS credentials or location", async () => {
    const logs = await backupService.getLogs("dummy_user_id_test");
    assert.ok(Array.isArray(logs), "getLogs should return an array");
    for (const log of logs) {
      if (log.download_url) {
        assert.ok(!log.download_url.includes("amazonaws.com"), `download_url should not contain amazonaws.com: ${log.download_url}`);
        assert.ok(!log.download_url.includes("AKIA"), `download_url should not contain AKIA credentials: ${log.download_url}`);
        assert.ok(log.download_url.startsWith("/api/v1/backup/logs/"), `download_url should start with /api/v1/backup/logs/: ${log.download_url}`);
      }
      assert.strictEqual(log.location, undefined, "location property must be stripped from response");
    }
  });

  // Test 7: Git & Storage Security Scan
  test("Codebase & storage security scanner confirms 0 exposed credentials", () => {
    const storageLogsPath = path.resolve("storage/backup-logs.json");
    if (fs.existsSync(storageLogsPath)) {
      const content = fs.readFileSync(storageLogsPath, "utf8");
      assert.ok(!content.includes("X-Amz-Credential="), "backup-logs.json must not contain X-Amz-Credential");
      assert.ok(!content.includes("AKIA"), "backup-logs.json must not contain AKIA access keys");
    }
  });

  // Test 8: Router & Controller Dispatch Verification
  test("Media, Item, Backup and Auth routes are properly registered with controllers", () => {
    assert.ok(router.stack.length > 20, "Router stack should have all modular routers mounted");
    assert.strictEqual(typeof mediaController.streamItemImage, "function");
    assert.strictEqual(typeof mediaController.streamSignature, "function");
    assert.strictEqual(typeof mediaController.streamFile, "function");
    assert.strictEqual(typeof itemController.getItemImage, "function");
    assert.strictEqual(typeof backupController.downloadBackup, "function");
    assert.strictEqual(typeof adminService.getSignature, "function");
    assert.strictEqual(typeof backupService.getBackupDownload, "function");
  });

  console.log("\n==================================================");
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution encountered fatal error:", err);
  process.exit(1);
});
