"use strict";

const {MODULES} = require("./constants");

function createEmulatorFixtureRepository() {
  const source = Object.fromEntries(Object.values(MODULES).map((moduleName) => [moduleName, []]));
  source.driverMaster = [{
    id: "EMULATOR_DRIVER_1",
    module: "driverMaster",
    collection: "driverMaster",
    driver_name: "Emulator Driver",
    joining_date: "2026-01-01",
    status: "Active"
  }];
  source.attendance = [{
    id: "EMULATOR_ATTENDANCE_1",
    module: "attendance",
    collection: "attendance",
    master_id: "EMULATOR_DRIVER_1",
    employee_name: "Emulator Driver",
    role: "Driver",
    date: "2026-09-03",
    attendance_status: "Present",
    fooding_eligible: "Yes"
  }];
  source.staffSalaryMaster = [{
    id: "EMULATOR_SALARY_1",
    module: "staffSalaryMaster",
    collection: "staffSalaryMaster",
    master_id: "EMULATOR_DRIVER_1",
    employee_name: "Emulator Driver",
    role: "Driver",
    fooding_rate: 250,
    status: "Active"
  }];
  source.materialStock = [{
    id: "EMULATOR_STOCK_1",
    module: "materialStock",
    collection: "materialStock",
    item_name: "Cartons",
    unit_name: "Quantity",
    opening_stock: "10",
    purchase_qty: "2",
    used_qty: "0",
    reorder_level: "2"
  }];
  source.material = [{
    id: "EMULATOR_ISSUE_1",
    module: "material",
    collection: "material",
    date: "2026-09-03",
    cartons_qty: 1,
    job_id: "EMU-JOB-1",
    issued_by: "Emulator Admin"
  }];
  return {loadReportSource: async () => source};
}

module.exports = {createEmulatorFixtureRepository};
