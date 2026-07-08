import ExcelJS from "exceljs";
import { universalSchemas } from "./universalImportExport.schema.js";

export const buildUniversalImportTemplateWorkbook = () => {
  const workbook = new ExcelJS.Workbook();
  const instructionSheet = workbook.addWorksheet("Instructions");

  instructionSheet.columns = [
    { header: "sheet_name", key: "sheet_name", width: 28 },
    { header: "required_columns", key: "required_columns", width: 45 },
    { header: "optional_columns", key: "optional_columns", width: 80 },
    { header: "notes", key: "notes", width: 70 },
  ];

  for (const schema of universalSchemas()) {
    instructionSheet.addRow({
      sheet_name: schema.sheet,
      required_columns: schema.required.join(", ") || "None",
      optional_columns: schema.optional.join(", ") || "None",
      notes:
        "Leave sheet blank if unused. Import one sheet or many sheets. Internal IDs are not required.",
    });

    const sheet = workbook.addWorksheet(schema.sheet);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns = schema.columns.map((key) => ({
      header: key,
      key,
      width: Math.max(12, Math.min(30, key.length + 4)),
    }));

    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFECEFF4" },
      };
    });
  }

  const instructionHeader = instructionSheet.getRow(1);
  instructionHeader.font = { bold: true };
  instructionHeader.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFECEFF4" },
    };
  });

  return workbook;
};
