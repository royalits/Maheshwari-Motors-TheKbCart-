import assert from "assert";
import { buildUniversalImportTemplateWorkbook } from "./src/services/setup/universalImportExport.workbook.js";
import {
  isInternalUniversalField,
  universalSchemas,
} from "./src/services/setup/universalImportExport.schema.js";

const workbook = buildUniversalImportTemplateWorkbook();

const sheetNames = workbook.worksheets.map((worksheet) => worksheet.name);
const schemaSheets = universalSchemas().map((schema) => schema.sheet);

assert(sheetNames.includes("Instructions"), "Instructions sheet is missing");
assert(sheetNames.includes("contacts"), "contacts sheet is missing");
assert(sheetNames.includes("Items"), "Items sheet is missing");
assert(sheetNames.length > 2, "template is still stock-only");

for (const schema of universalSchemas()) {
  const worksheet = workbook.getWorksheet(schema.sheet);
  assert(worksheet, `${schema.sheet} sheet is missing`);

  const headers = [];
  worksheet.getRow(1).eachCell((cell) => headers.push(String(cell.value || "")));
  assert.deepStrictEqual(headers, schema.columns, `${schema.sheet} headers mismatch`);

  for (const header of headers) {
    assert(!isInternalUniversalField(header), `${schema.sheet} exposes ${header}`);
  }
}

const instructionRows = [];
workbook.getWorksheet("Instructions").eachRow((row, rowNumber) => {
  if (rowNumber > 1) instructionRows.push(String(row.getCell(1).value || ""));
});
for (const sheetName of schemaSheets) {
  assert(instructionRows.includes(sheetName), `Instructions missing ${sheetName}`);
}

console.log("universal import/export template tests passed");
