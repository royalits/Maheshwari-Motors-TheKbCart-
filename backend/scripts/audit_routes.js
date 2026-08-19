import assert from "node:assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routersDir = path.resolve(__dirname, "../src/routers");

console.log("==================================================");
console.log("  DEEP AUDIT: ROUTE HANDLERS & CONTROLLER BINDINGS ");
console.log("==================================================\n");

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith(".js")) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

const routeFiles = getAllFiles(routersDir);
let totalRoutesChecked = 0;
let errorsFound = 0;

for (const filePath of routeFiles) {
  const relPath = path.relative(routersDir, filePath);
  try {
    const fileUrl = new URL(`file:///${filePath.replace(/\\/g, "/")}`);
    const module = await import(fileUrl.href);
    const router = module.default;

    if (!router || !router.stack) {
      console.log(`ℹ️ [SKIP] ${relPath} (Not a standard router export)`);
      continue;
    }

    let routeCountInFile = 0;
    router.stack.forEach((layer) => {
      if (layer.route) {
        routeCountInFile++;
        totalRoutesChecked++;
        const methods = Object.keys(layer.route.methods).join(",").toUpperCase();
        const routePath = layer.route.path;
        
        // Verify handlers in layer.route.stack
        layer.route.stack.forEach((handlerLayer) => {
          if (typeof handlerLayer.handle !== "function") {
            console.error(`❌ [ERROR] ${relPath} -> ${methods} ${routePath} has an undefined handler!`);
            errorsFound++;
          }
        });
      }
    });

    console.log(`✅ [OK] ${relPath} (${routeCountInFile} routes verified)`);
  } catch (err) {
    console.error(`❌ [FAIL] Could not import ${relPath}:`, err.message);
    errorsFound++;
  }
}

console.log("\n==================================================");
console.log(`  TOTAL ROUTES VERIFIED: ${totalRoutesChecked}`);
console.log(`  TOTAL ERRORS FOUND: ${errorsFound}`);
console.log("==================================================\n");

if (errorsFound > 0) {
  process.exit(1);
}
