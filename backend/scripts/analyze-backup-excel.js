import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const analyzeBackupExcel = async () => {
  const filePath = path.join(__dirname, "../storage/backups/maheshwari_motors_backup_20260413_162900.xlsx");
  
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    console.log("\n📊 BACKUP EXCEL ANALYSIS\n");
    console.log(`File: ${filePath}`);
    console.log(`Total Sheets: ${workbook.worksheets.length}\n`);

    for (const worksheet of workbook.worksheets) {
      console.log(`\n═══════════════════════════════════════\n`);
      console.log(`📋 Sheet: "${worksheet.name}"`);
      console.log(`Total Rows: ${worksheet.actualRowCount}`);
      console.log(`Total Columns: ${worksheet.actualColumnCount}\n`);

      // Get headers
      const headerRow = worksheet.getRow(1);
      const headers = [];
      headerRow.eachCell((cell) => {
        headers.push(String(cell.value || "").trim());
      });

      console.log(`Headers (${headers.length}):`);
      headers.forEach((h, i) => {
        if (h) console.log(`  ${i + 1}. ${h}`);
      });

      // Sample first few data rows
      console.log(`\nSample Data (first 3 rows):`);
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        if (rowNumber > 4) return; // Show only 3 data rows

        const values = [];
        row.eachCell((cell) => {
          values.push(cell.value);
        });
        
        console.log(`\nRow ${rowNumber}:`);
        values.forEach((val, idx) => {
          if (headers[idx] && val !== null && val !== undefined) {
            console.log(`  ${headers[idx]}: ${val}`);
          }
        });
      });
    }

    console.log(`\n═══════════════════════════════════════\n`);
  } catch (err) {
    console.error("❌ Error reading backup Excel:", err.message);
    process.exit(1);
  }
};

analyzeBackupExcel();
