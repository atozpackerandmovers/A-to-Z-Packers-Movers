"use strict";

const {MATERIAL_DEFINITIONS, MODULES, TIME_ZONE} = require("./constants");
const {
  asDate,
  finiteNumber,
  firstNumber,
  firstText,
  indiaDateFromTimestamp,
  isoTimestamp,
  normalizeKey,
  normalizeText,
  parseOperationalDate,
  recordTimestamp,
  severityRank,
  stableNameSort,
  utcDateFromTimestamp,
  warning
} = require("./utils");

function moduleRows(source, moduleName) {
  return Array.isArray(source?.[moduleName]) ? source[moduleName] : [];
}

function recordDate(record) {
  return parseOperationalDate(firstText(record, [
    "date", "attendance_date", "issue_date", "dispatch_date", "work_date", "shifting_date"
  ]));
}

function recordTimeMs(record) {
  return asDate(record?.updatedAt)?.getTime() || asDate(record?.createdAt)?.getTime() || finiteNumber(record?.updatedAtMs);
}

function recordName(record) {
  return firstText(record, [
    "employee_name", "staff_name", "indoor_staff_name", "driver_name", "worker_name", "name"
  ]);
}

function normalizeRole(role) {
  const normalized = normalizeKey(role);
  if (normalized.includes("driver")) return "Driver";
  if (normalized.includes("worker")) return "Worker";
  if (normalized.includes("indoor") || normalized.includes("office")) return "Office";
  return normalizeText(role) || "Unknown";
}

function roleFromMaster(moduleName, record) {
  if (moduleName === MODULES.DRIVER_MASTER) return "Driver";
  if (moduleName === MODULES.WORKER_MASTER) return "Worker";
  if (moduleName === MODULES.INDOOR_MASTER) return "Office";
  return normalizeRole(record?.role);
}

function masterStatus(record) {
  const status = normalizeKey(record?.status || "Active");
  if (status.includes("black")) return "Blacklisted";
  if (status.includes("inactive") || status.includes("suspend")) return "Inactive";
  return "Active";
}

function staffIdentity(record, role) {
  const masterId = normalizeText(record?.master_id || record?.masterId || record?.id);
  if (masterId) return `master:${masterId}`;
  return `name:${normalizeKey(recordName(record))}:${normalizeKey(role)}`;
}

function attendanceIdentity(record) {
  const masterId = normalizeText(record?.master_id || record?.masterId);
  if (masterId) return `master:${masterId}`;
  return `name:${normalizeKey(recordName(record))}:${normalizeKey(normalizeRole(record?.role))}`;
}

function buildStaff(source, reportDate, warnings) {
  const definitions = [
    [MODULES.DRIVER_MASTER, "driver_name"],
    [MODULES.WORKER_MASTER, "worker_name"],
    [MODULES.INDOOR_MASTER, "indoor_staff_name"]
  ];
  const byIdentity = new Map();

  definitions.forEach(([moduleName, preferredName]) => {
    moduleRows(source, moduleName).forEach((record) => {
      const role = roleFromMaster(moduleName, record);
      const name = normalizeText(record?.[preferredName]) || recordName(record);
      if (!name) {
        warnings.push(warning("error", "MISSING_EMPLOYEE_NAME", "Master record is missing an employee name.", {recordId: record.id || null, masterModule: moduleName}));
        return;
      }
      const identity = staffIdentity(record, role);
      const staff = {
        identity,
        masterId: normalizeText(record?.id || record?.master_id) || null,
        employeeName: name,
        role,
        designation: role === "Office" ? normalizeText(record?.designation) || null : null,
        masterModule: moduleName,
        masterStatus: masterStatus(record),
        joiningDate: parseOperationalDate(firstText(record, ["joining_date", "join_date", "date_of_joining", "doj"])) || null,
        inactiveDate: parseOperationalDate(firstText(record, ["inactive_date", "blacklist_date", "blacklisted_date"])) || null,
        raw: record
      };
      if (!staff.joiningDate) {
        warnings.push(warning("warning", "MISSING_JOINING_DATE", "Active-window calculation is limited because a master record has no joining date.", {employeeName: name, role}));
      }
      const prior = byIdentity.get(identity);
      if (!prior || recordTimeMs(record) >= recordTimeMs(prior.raw)) byIdentity.set(identity, staff);
    });
  });

  return [...byIdentity.values()].map((staff) => ({
    ...staff,
    activeOnReportDate: staff.masterStatus === "Active" && (!staff.joiningDate || staff.joiningDate <= reportDate)
  })).sort(stableNameSort);
}

function normalizedAttendanceStatus(value) {
  const status = normalizeKey(value);
  if (status.includes("half")) return "Half Day";
  if (status.includes("absent")) return "Absent";
  if (status.includes("leave")) return "Leave";
  if (status.includes("present") || status.includes("restore")) return "Present";
  return "";
}

function approvedLeaveForDate(record, reportDate) {
  const approval = normalizeKey(record?.company_approval || record?.approval_status);
  if (approval.includes("reject") || approval === "pending" || approval.includes("need discussion")) return false;
  const from = parseOperationalDate(firstText(record, ["leave_from", "leave_from_date", "date"]));
  const to = parseOperationalDate(firstText(record, ["leave_to", "leave_to_date", "date"])) || from;
  return Boolean(from && to && reportDate >= from && reportDate <= to);
}

function attendanceRowsForDate(source, reportDate, warnings) {
  const attendance = moduleRows(source, MODULES.ATTENDANCE).filter((record) => {
    const raw = firstText(record, ["date", "attendance_date"]);
    const parsed = parseOperationalDate(raw);
    if (raw && !parsed) warnings.push(warning("warning", "INVALID_RECORD_DATE", "Attendance record contains an invalid date.", {recordId: record.id || null}));
    return parsed === reportDate;
  });
  const approvedLeave = moduleRows(source, MODULES.LEAVE_APPROVAL)
    .filter((record) => approvedLeaveForDate(record, reportDate))
    .map((record) => ({...record, attendance_status: "Leave", _leaveApprovalFallback: true}));
  return [...attendance, ...approvedLeave];
}

function attendanceOutput(staff, status, record) {
  return {
    employeeName: staff.employeeName,
    role: staff.role,
    attendanceStatus: status,
    attendanceTime: firstText(record, ["punch_in", "check_in", "attendance_time"]) || null,
    remark: null
  };
}

function resolveAttendance(source, staff, reportDate, warnings) {
  const rows = attendanceRowsForDate(source, reportDate, warnings);
  const byIdentity = new Map();
  rows.forEach((record) => {
    const identity = attendanceIdentity(record);
    if (!byIdentity.has(identity)) byIdentity.set(identity, []);
    byIdentity.get(identity).push(record);
  });

  const knownIdentities = new Set(staff.flatMap((person) => [
    person.identity,
    `name:${normalizeKey(person.employeeName)}:${normalizeKey(person.role)}`
  ]));
  rows.forEach((record) => {
    const identity = attendanceIdentity(record);
    if (!knownIdentities.has(identity)) {
      warnings.push(warning("warning", "UNKNOWN_EMPLOYEE", "Attendance exists for a person not found in an active staff master.", {
        employeeName: recordName(record) || "Unknown",
        role: normalizeRole(record?.role),
        recordId: record.id || null
      }));
    }
  });

  const lists = {present: [], absent: [], leave: [], notMarked: []};
  const selectedByIdentity = new Map();

  staff.forEach((person) => {
    const fallbackIdentity = `name:${normalizeKey(person.employeeName)}:${normalizeKey(person.role)}`;
    const matches = [...(byIdentity.get(person.identity) || []), ...(byIdentity.get(fallbackIdentity) || [])]
      .filter((record, index, array) => array.findIndex((item) => item.id === record.id && item._leaveApprovalFallback === record._leaveApprovalFallback) === index);
    const statuses = new Set(matches.map((record) => normalizedAttendanceStatus(record?.attendance_status || record?.status)).filter(Boolean));
    if (matches.length > 1) {
      warnings.push(warning("warning", "DUPLICATE_ATTENDANCE", "Multiple attendance records exist for one employee and date.", {employeeName: person.employeeName, date: reportDate, count: matches.length}));
    }
    if (statuses.size > 1) {
      warnings.push(warning("error", "CONFLICTING_ATTENDANCE", "Conflicting attendance statuses exist for one employee and date.", {employeeName: person.employeeName, date: reportDate, statuses: [...statuses].sort()}));
    }
    const selected = matches.sort((a, b) => recordTimeMs(b) - recordTimeMs(a))[0] || null;
    const status = selected ? normalizedAttendanceStatus(selected.attendance_status || selected.status) : "Not Marked";
    selectedByIdentity.set(person.identity, {record: selected, status});

    if (!person.activeOnReportDate && selected) {
      warnings.push(warning("warning", "INACTIVE_STAFF_ATTENDANCE", "Inactive or blacklisted staff has an attendance record requiring review.", {employeeName: person.employeeName, date: reportDate, masterStatus: person.masterStatus}));
    }
    if (!person.activeOnReportDate && !selected) return;
    const row = attendanceOutput(person, status, selected || {});
    if (status === "Present" || status === "Half Day") lists.present.push(row);
    else if (status === "Absent") lists.absent.push(row);
    else if (status === "Leave") lists.leave.push(row);
    else lists.notMarked.push(row);
  });

  Object.values(lists).forEach((list) => list.sort(stableNameSort));
  return {lists, rows, selectedByIdentity};
}

function materialQuantity(record, definition) {
  for (const key of definition.aliases) {
    const raw = record?.[key];
    if (raw === "" || raw === null || raw === undefined) continue;
    const quantity = Number(raw);
    if (Number.isFinite(quantity)) return quantity;
  }
  return 0;
}

function issueEntries(record) {
  const entries = MATERIAL_DEFINITIONS.map((definition) => ({
    definition,
    quantity: materialQuantity(record, definition)
  })).filter((entry) => entry.quantity !== 0);
  const genericName = firstText(record, ["material_name", "item_name"]);
  const genericQuantity = firstNumber(record, ["quantity", "qty", "issued_qty", "dispatch_qty"]);
  if (genericName && genericQuantity) entries.push({definition: {name: genericName, unit: firstText(record, ["unit", "unit_name"]) || "Quantity", aliases: []}, quantity: genericQuantity});
  return entries;
}

function addDateQualityWarnings(records, warnings) {
  records.forEach((record) => {
    const rawDate = firstText(record, ["date", "issue_date", "dispatch_date", "attendance_date"]);
    if (!rawDate) return;
    const parsed = parseOperationalDate(rawDate);
    if (!parsed) {
      warnings.push(warning("warning", "INVALID_RECORD_DATE", "Operational record contains an invalid date.", {recordId: record.id || null}));
      return;
    }
    const timestamp = recordTimestamp(record);
    const utcDate = utcDateFromTimestamp(timestamp);
    const indiaDate = indiaDateFromTimestamp(timestamp);
    if (utcDate && indiaDate && utcDate !== indiaDate && parsed === utcDate) {
      warnings.push(warning("warning", "UTC_INDIA_DATE_MISMATCH", "Record appears to use a UTC date that falls on a different India date.", {recordId: record.id || null, recordedDate: parsed, indiaDate}));
    }
  });
}

function buildMaterials(source, reportDate, warnings) {
  const stockRows = moduleRows(source, MODULES.MATERIAL_STOCK);
  const issueRows = moduleRows(source, MODULES.MATERIAL_ISSUE);
  addDateQualityWarnings([...stockRows, ...issueRows], warnings);

  const knownNames = new Set(MATERIAL_DEFINITIONS.map((item) => normalizeKey(item.name)));
  const dynamicDefinitions = stockRows.map((record) => ({
    name: firstText(record, ["item_name", "material_name"]),
    unit: firstText(record, ["unit_name", "unit"]) || "Quantity",
    aliases: []
  })).filter((item) => item.name && !knownNames.has(normalizeKey(item.name)));
  const definitions = [...MATERIAL_DEFINITIONS, ...new Map(dynamicDefinitions.map((item) => [normalizeKey(item.name), item])).values()];

  const issueTotals = new Map();
  issueRows.forEach((record) => issueEntries(record).forEach(({definition, quantity}) => {
    const key = normalizeKey(definition.name);
    issueTotals.set(key, finiteNumber(issueTotals.get(key)) + quantity);
  }));

  const materialStock = definitions.map((definition) => {
    const rows = stockRows.filter((record) => normalizeKey(firstText(record, ["item_name", "material_name"])) === normalizeKey(definition.name));
    const openingStock = rows.reduce((sum, row) => sum + firstNumber(row, ["opening_stock", "opening_qty"]), 0);
    const totalReceived = rows.reduce((sum, row) => sum + firstNumber(row, ["purchase_qty", "received_qty", "added_stock"]), 0);
    const manualUsed = rows.reduce((sum, row) => sum + firstNumber(row, ["used_qty", "manual_used_qty"]), 0);
    const totalDispatched = finiteNumber(issueTotals.get(normalizeKey(definition.name)));
    const availableBalance = openingStock + totalReceived - manualUsed - totalDispatched;
    const minimumStockLevel = rows.reduce((maximum, row) => Math.max(maximum, firstNumber(row, ["reorder_level", "minimum_stock", "min_stock"])), 0) || null;
    const latest = rows.sort((a, b) => recordTimeMs(b) - recordTimeMs(a))[0];
    const lowStockWarning = minimumStockLevel !== null && availableBalance <= minimumStockLevel;
    const negativeStockWarning = availableBalance < 0;
    if (lowStockWarning) warnings.push(warning("warning", "LOW_STOCK", "Material is at or below its configured minimum stock level.", {materialName: definition.name, availableBalance, minimumStockLevel}));
    if (negativeStockWarning) warnings.push(warning("error", "NEGATIVE_STOCK", "Calculated material balance is negative.", {materialName: definition.name, availableBalance}));
    return {
      materialName: definition.name,
      unit: rows.map((row) => firstText(row, ["unit_name", "unit"])).find(Boolean) || definition.unit,
      openingStock,
      totalReceived,
      totalDispatched,
      availableBalance,
      minimumStockLevel,
      lowStockWarning,
      negativeStockWarning,
      lastUpdatedTime: isoTimestamp(latest?.updatedAt || latest?.createdAt)
    };
  }).filter((item) => item.openingStock || item.totalReceived || item.totalDispatched || item.minimumStockLevel !== null);

  const todayDispatch = [];
  issueRows.filter((record) => recordDate(record) === reportDate).forEach((record) => {
    const entries = issueEntries(record);
    if (!entries.length) warnings.push(warning("warning", "DISPATCH_WITHOUT_MATERIAL", "Material issue record has no material quantity.", {recordId: record.id || null, date: reportDate}));
    entries.forEach(({definition, quantity}) => {
      if (!definition.name) warnings.push(warning("warning", "DISPATCH_WITHOUT_MATERIAL", "Dispatch record is missing a material name.", {recordId: record.id || null}));
      if (!Number.isFinite(quantity) || quantity === 0) warnings.push(warning("warning", "DISPATCH_WITHOUT_QUANTITY", "Dispatch record is missing a usable quantity.", {recordId: record.id || null, materialName: definition.name || null}));
      todayDispatch.push({
        materialName: definition.name || null,
        quantity: Number.isFinite(quantity) ? quantity : null,
        unit: definition.unit || null,
        dispatchTime: isoTimestamp(recordTimestamp(record)),
        jobId: firstText(record, ["job_id", "planning_no"]) || null,
        vehicleNumber: firstText(record, ["vehicle_number", "vehicle_no"]) || null,
        driverOrReceiverName: firstText(record, ["driver_name", "received_by", "team_leader"]) || null,
        dispatcherName: firstText(record, ["issued_by", "dispatcher_name"]) || null,
        remarks: null
      });
    });
  });

  materialStock.sort(stableNameSort);
  todayDispatch.sort((a, b) => String(a.dispatchTime || "").localeCompare(String(b.dispatchTime || "")) || stableNameSort(a, b));
  return {materialStock, todayDispatch};
}

function jobDate(record) {
  return parseOperationalDate(firstText(record, ["work_date", "shifting_date", "work_start_date", "date"]));
}

function jobNames(record) {
  const direct = [record?.driver, record?.driver_name, record?.assigned_driver, record?.team_leader,
    record?.worker_1, record?.worker_2, record?.worker_3, record?.worker_4, record?.worker_5];
  const grouped = [record?.workers, record?.workers_name, record?.worker_names, record?.assigned_worker_names, record?.team_members]
    .flatMap((value) => normalizeText(value).split(/[,/|\n]+/));
  return [...direct, ...grouped].map(normalizeText).filter(Boolean);
}

function dutyStatus(staff, jobs, reportDate) {
  const matches = jobs.filter((job) => jobDate(job) === reportDate && jobNames(job).some((name) => normalizeKey(name) === normalizeKey(staff.employeeName)));
  if (!matches.length) return null;
  return [...new Set(matches.map((job) => firstText(job, ["status", "work_status"]) || "Assigned"))].join(", ");
}

function latestSetting(rows, person) {
  return rows.filter((row) => {
    const sameMaster = person.masterId && normalizeText(row?.master_id || row?.masterId) === person.masterId;
    const sameName = normalizeKey(recordName(row)) === normalizeKey(person.employeeName);
    const sameRole = !row?.role || normalizeRole(row.role) === person.role;
    return (sameMaster || sameName) && sameRole && !normalizeKey(row?.status).includes("inactive");
  }).sort((a, b) => recordTimeMs(b) - recordTimeMs(a))[0] || null;
}

function configuredRate(record, keys) {
  if (!record) return {found: false, key: null, value: null};
  for (const key of keys) {
    const raw = record?.[key];
    if (raw === "" || raw === null || raw === undefined) continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) return {found: true, key, value};
  }
  return {found: false, key: null, value: null};
}

function foodingRate(person, source) {
  let explicitZero = null;
  const master = latestSetting(moduleRows(source, MODULES.STAFF_SALARY_MASTER), person);
  const masterRate = configuredRate(master, ["fooding_rate", "fooding_amount"]);
  if (masterRate.found) {
    if (masterRate.value > 0) return {rate: masterRate.value, source: `staffSalaryMaster.${masterRate.key}`};
    explicitZero = {rate: 0, source: `staffSalaryMaster.${masterRate.key}`};
  }
  const settings = latestSetting(moduleRows(source, MODULES.SALARY_SETTINGS), person);
  const settingsRate = configuredRate(settings, ["fooding_amount", "fooding_rate"]);
  if (settingsRate.found) {
    if (settingsRate.value > 0) return {rate: settingsRate.value, source: `salarySettings.${settingsRate.key}`};
    explicitZero ||= {rate: 0, source: `salarySettings.${settingsRate.key}`};
  }
  const masterRecordRate = configuredRate(person.raw, ["fooding_rate", "fooding_amount"]);
  if (masterRecordRate.found) {
    if (masterRecordRate.value > 0) return {rate: masterRecordRate.value, source: `${person.masterModule}.${masterRecordRate.key}`};
    explicitZero ||= {rate: 0, source: `${person.masterModule}.${masterRecordRate.key}`};
  }
  return explicitZero || {rate: null, source: null};
}

function attendanceHalfDayRule(source) {
  const latest = moduleRows(source, MODULES.ATTENDANCE_SETTINGS).sort((a, b) => recordTimeMs(b) - recordTimeMs(a))[0];
  const configured = normalizeKey(latest?.half_day_fooding_eligible);
  if (configured === "yes" || configured === "no") {
    return {eligible: configured === "yes", source: "attendanceSettings.half_day_fooding_eligible"};
  }
  return {eligible: true, source: "production execution.html default"};
}

function buildFooding(source, staff, attendanceResolution, reportDate, warnings) {
  const jobs = moduleRows(source, MODULES.JOBS);
  const halfDayRule = attendanceHalfDayRule(source);
  const output = [];

  staff.forEach((person) => {
    if (!person.activeOnReportDate && !attendanceResolution.selectedByIdentity.get(person.identity)?.record) return;
    const resolved = attendanceResolution.selectedByIdentity.get(person.identity) || {record: null, status: "Not Marked"};
    const status = resolved.status;
    const {rate, source: rateSource} = foodingRate(person, source);
    const recordedFooding = normalizeKey(resolved.record?.fooding_eligible);
    const hasRecordedFooding = recordedFooding === "yes" || recordedFooding === "no";
    const officeApplicable = person.role === "Office" && rate > 0;
    const roleAllowed = person.role === "Driver" || person.role === "Worker" || officeApplicable;
    const attendanceRuleSource = hasRecordedFooding ? "attendance.fooding_eligible" :
      (status === "Half Day" ? halfDayRule.source : "production Present rule");
    const attendanceAllowed = hasRecordedFooding ? recordedFooding === "yes" :
      (status === "Present" || (status === "Half Day" && halfDayRule.eligible));
    const eligible = Boolean(roleAllowed && attendanceAllowed && rate > 0);
    let reason = "Attendance not marked";
    if (status === "Absent") reason = "Absent staff is not eligible";
    else if (status === "Leave") reason = "Staff on leave is not eligible";
    else if (!roleAllowed) reason = "Role is not eligible without a positive configured fooding rate";
    else if (status === "Half Day" && !attendanceAllowed) reason = `Half-day fooding is disabled by ${attendanceRuleSource}`;
    else if (attendanceAllowed && !(rate > 0)) reason = "Fooding rate is missing or zero in production settings";
    else if (eligible) reason = `Eligible from ${rateSource}; attendance from ${attendanceRuleSource}`;

    if (attendanceAllowed && !(rate > 0) && (person.role === "Driver" || person.role === "Worker")) {
      warnings.push(warning("warning", "MISSING_FOODING_RATE", "Eligible attendance exists but no fooding rate is configured.", {employeeName: person.employeeName, role: person.role}));
    }
    const recordedEligible = normalizeKey(resolved.record?.fooding_eligible) === "yes";
    if (recordedEligible && (status === "Absent" || status === "Leave")) {
      warnings.push(warning("error", "FOODING_FOR_ABSENT_STAFF", "Attendance record marks an absent/on-leave person as fooding eligible.", {employeeName: person.employeeName, date: reportDate, attendanceStatus: status}));
    }
    if (person.role === "Driver" || person.role === "Worker" || person.role === "Office") {
      output.push({
        employeeName: person.employeeName,
        role: person.role,
        attendanceStatus: status,
        dutyWorkStatus: dutyStatus(person, jobs, reportDate),
        foodingEligible: eligible ? "Yes" : "No",
        applicableFoodingRate: rate,
        calculatedFoodingAmount: eligible ? rate : 0,
        reason,
        missingRateWarning: Boolean(attendanceAllowed && !(rate > 0) && (person.role === "Driver" || person.role === "Worker"))
      });
    }
  });
  return output.sort(stableNameSort);
}

function buildDailyOperationsReport(source, reportDate, now = new Date()) {
  const warnings = [];
  const staff = buildStaff(source, reportDate, warnings);
  const attendanceResolution = resolveAttendance(source, staff, reportDate, warnings);
  const materials = buildMaterials(source, reportDate, warnings);
  const foodingEligibility = buildFooding(source, staff, attendanceResolution, reportDate, warnings);

  warnings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.code.localeCompare(b.code) || a.message.localeCompare(b.message));
  const activeStaff = staff.filter((person) => person.activeOnReportDate).length;
  const foodingTotal = foodingEligibility.reduce((sum, row) => sum + finiteNumber(row.calculatedFoodingAmount), 0);

  return {
    success: true,
    reportDate,
    timezone: TIME_ZONE,
    generatedAt: now.toISOString(),
    summary: {
      activeStaff,
      present: attendanceResolution.lists.present.length,
      absent: attendanceResolution.lists.absent.length,
      leave: attendanceResolution.lists.leave.length,
      attendanceNotMarked: attendanceResolution.lists.notMarked.length,
      foodingEligible: foodingEligibility.filter((row) => row.foodingEligible === "Yes").length,
      foodingTotal,
      materialsDispatched: materials.todayDispatch.length,
      lowStockItems: materials.materialStock.filter((item) => item.lowStockWarning).length,
      negativeStockItems: materials.materialStock.filter((item) => item.negativeStockWarning).length
    },
    materialStock: materials.materialStock,
    todayDispatch: materials.todayDispatch,
    attendance: attendanceResolution.lists,
    foodingEligibility,
    warnings
  };
}

module.exports = {
  buildDailyOperationsReport,
  normalizedAttendanceStatus,
  recordDate
};
