"use strict";

const MAIN_COLLECTION = "azpExecutionRecords";

// Every name below was observed in the supplied Execution/Quotation source files.
// Do not add aliases here without source or live-schema evidence.
const DATE_FIELDS = Object.freeze({
  quotationCreated: ["createdAt", "created_at", "createdAtText", "savedAt", "timestamp", "sortTime", "createdAtMs", "quotation_date", "quotationDate", "date"],
  quotationShifting: ["shifting_date", "shiftingDate", "moving_date", "movingDate"],
  jobOperation: ["work_start_date", "workStartDate", "work_date", "workDate", "shifting_date", "shiftingDate", "moving_date", "pickup_date"],
  attendance: ["date", "attendance_date"],
  operational: ["date", "issue_date", "dispatch_date", "payment_date", "invoice_date", "repair_date", "inspection_date", "due_date", "updatedAt", "createdAt", "updatedAtMs", "createdAtMs", "updated_at", "created_at"]
});

const DIRECT_COLLECTIONS = Object.freeze({
  quotation: [{collection: "quotations", dateFields: DATE_FIELDS.quotationCreated}],
  planning: [{collection: "planningSheets", dateFields: DATE_FIELDS.jobOperation}],
  jobs: [{collection: "planningSheets", dateFields: DATE_FIELDS.jobOperation}],
  complaint: [{collection: "complaints", dateFields: DATE_FIELDS.operational}],
  payment: [{collection: "salesBills", dateFields: ["created_at", "invoice_date", "payment_date"]}],
  agreement: [{collection: "agreements", dateFields: ["created_at", "updated_at", "agreement_date"]}],
  task: [
    {collection: "azpStaffTasks", dateFields: DATE_FIELDS.operational},
    {collection: "taskMaster", dateFields: DATE_FIELDS.operational},
    {collection: "staffTasks", dateFields: DATE_FIELDS.operational}
  ],
  vendor: [
    {collection: "vendors", dateFields: DATE_FIELDS.operational},
    {collection: "vendorContacts", dateFields: DATE_FIELDS.operational},
    {collection: "azpQuotationVendors", dateFields: DATE_FIELDS.operational}
  ],
  gps: [
    {collection: "azpGpsTripHistory", dateFields: DATE_FIELDS.operational},
    {collection: "azpGpsTripPoints", dateFields: DATE_FIELDS.operational}
  ]
});

const EXECUTION_MODULES = Object.freeze({
  jobs: ["jobs"],
  planning: ["jobs"],
  attendance: ["attendance", "leaveApproval"],
  fooding: ["fooding", "foodingCycle"],
  material: ["material", "materialStock", "fleetMaterialInventory"],
  payment: ["payments", "jobs", "profit"],
  vendor: ["vendors"],
  fuel: ["fuel", "fleetFuelMileage"],
  vehicle: ["vehicleMaster", "fleetVehicleMaster", "fleetDocumentExpiry", "fleetRepairHistory", "fleetServiceSchedule", "repairing", "documents"],
  gps: ["gpsProduction", "gpsTripControl", "eta"],
  task: ["taskManagement"],
  complaint: ["complaint"],
  feedback: ["feedback", "proofVerification"],
  salary: ["salaryFinalApproval", "payroll", "salarySettings", "staffSalaryMaster", "bonus", "extra", "uniform", "blackWhiteLevel"],
  staff: ["driverMaster", "workerMaster", "indoorStaffMaster"]
});

const COMMENT_FIELDS = Object.freeze(["comment", "comments", "note", "notes", "remark", "remarks", "followUpNote", "follow_up_note", "complaintNote", "complaint_note", "company_remark", "activity_log", "activityLog", "statusHistory"]);
const SENSITIVE_FIELD = /password|passcode|secret|token|api.?key|authorization|credential|private.?key/i;

module.exports = {COMMENT_FIELDS, DATE_FIELDS, DIRECT_COLLECTIONS, EXECUTION_MODULES, MAIN_COLLECTION, SENSITIVE_FIELD};
