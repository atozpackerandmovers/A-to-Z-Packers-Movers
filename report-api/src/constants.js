"use strict";

const TIME_ZONE = "Asia/Kolkata";
const MAIN_COLLECTION = "azpExecutionRecords";
const MAX_RECORDS_PER_MODULE = 500;

const MODULES = Object.freeze({
  MATERIAL_STOCK: "materialStock",
  MATERIAL_ISSUE: "material",
  ATTENDANCE: "attendance",
  LEAVE_APPROVAL: "leaveApproval",
  DRIVER_MASTER: "driverMaster",
  WORKER_MASTER: "workerMaster",
  INDOOR_MASTER: "indoorStaffMaster",
  SALARY_SETTINGS: "salarySettings",
  STAFF_SALARY_MASTER: "staffSalaryMaster",
  ATTENDANCE_SETTINGS: "attendanceSettings",
  FOODING: "fooding",
  FOODING_CYCLE: "foodingCycle",
  JOBS: "jobs"
});

const MATERIAL_DEFINITIONS = Object.freeze([
  {name: "Lamination", unit: "%", aliases: ["lamination_percent", "lamination"]},
  {name: "Bubble Sheet", unit: "%", aliases: ["bubble_sheet_percent", "bubble_sheet"]},
  {name: "Fabric Sheet", unit: "%", aliases: ["fabric_sheet_percent", "fabric_sheet"]},
  {name: "Corrugated Sheet", unit: "%", aliases: ["corrugated_sheet_percent", "corrugated_sheet"]},
  {name: "Blue Foam", unit: "%", aliases: ["blue_foam_percent", "blue_foam"]},
  {name: "Stretch Film", unit: "%", aliases: ["stretch_film_percent", "stretch_film"]},
  {name: "Thermocol", unit: "Quantity", aliases: ["thermocol_qty", "thermocol"]},
  {name: "Cartons", unit: "Quantity", aliases: ["cartons_qty", "cartons"]},
  {name: "Cello Tape", unit: "Quantity", aliases: ["cello_tape_qty", "cello_tape"]},
  {name: "Rope", unit: "Quantity", aliases: ["rope_qty", "rope"]}
]);

const PRIVATE_KEY_PATTERN = /(phone|mobile|contact|address|password|credential|api.?key|service.?account|bank|aadhaar|aadhar|pan|latitude|longitude|gps)/i;

module.exports = {
  MAIN_COLLECTION,
  MATERIAL_DEFINITIONS,
  MAX_RECORDS_PER_MODULE,
  MODULES,
  PRIVATE_KEY_PATTERN,
  TIME_ZONE
};
