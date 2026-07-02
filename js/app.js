import { parseMeetingsCsv, parseRolesCsv, parseWorkCsv } from "./csv.js";
import { criticalPathWeeks } from "./scheduler.js";
import { generateScenarios, scenarioLabel, selectOptimalScenarios } from "./scenarios.js";
import { downloadCsv, renderResults, scenariosToCsv } from "./ui.js";
import { parseNumber } from "./utils.js";

const sampleWork = `id,name,estimate_days,skills,dependencies
CFG-CORE,Core product configuration,20,configuration,
CFG-WORKFLOW,Workflow configuration,18,configuration,
CFG-PORTAL,Portal configuration,16,configuration,
INT-API,API integration,24,integration,
INT-BATCH,Batch interfaces,14,integration,
INT-TOOL,Integration tool configuration,12,integration_tool,INT-API
MKT-TOOL,Marketing tool configuration,10,marketing_tool,CFG-CORE
DATA-MAP,Data mapping,12,data,
DATA-MIG,Data migration build,18,data,DATA-MAP
REPORTING,Reporting build,16,data,
SEC-ROLES,Security roles,8,security,CFG-CORE
INT-E2E,End-to-end integration,10,integration,"INT-TOOL;MKT-TOOL;CFG-CORE;DATA-MIG"
TEST-PREP,Test preparation,8,testing,"CFG-CORE;INT-API;DATA-MIG"
FIXES,Defect fixes and hardening,10,"testing;configuration","INT-E2E;TEST-PREP;SEC-ROLES;CFG-WORKFLOW;CFG-PORTAL;INT-BATCH;REPORTING"`;

const sampleRoles = `role,role_family,staffing,count,min_count,max_count,daily_rate,build_contribution_pct,skills,inherits
Project Manager,leadership,fixed,1,,,840,0,,
Technical Lead,leadership,fixed,1,,,1300,25,"configuration;integration;security",
General Developer,developer,variable,,1,3,1040,100,"configuration;data;testing",
Integration Developer,developer,variable,,0,2,1300,100,"integration;integration_tool",General Developer
General Consultant,consultant,variable,,0,1,1120,100,"configuration;data;testing",
Marketing Tool Consultant,consultant,variable,,0,1,1360,100,marketing_tool,General Consultant`;

const sampleMeetings = `meeting,phase,frequency,duration_hours,attendees
Daily stand-up,build,daily,0.25,All
Weekly demo,build,weekly,1.5,All
Planning and RAID,all,weekly,1,"Project Manager;Technical Lead"
Design authority,discovery,weekly,1.5,Technical Lead
SIT triage,sit,daily,0.5,All
UAT triage,uat,daily,0.5,All
Go-live checkpoint,go-live,daily,0.75,All`;

const state = {
  scenarios: [],
  tasks: [],
  roles: [],
  meetings: [],
  selectionMessage: ""
};

const el = (id) => document.getElementById(id);

function normalizeBudgetInput() {
  const input = el("maxBudget");
  const cleaned = input.value.replace(/[^0-9,.]/g, "");
  const [integerPart, ...decimalParts] = cleaned.split(".");
  const decimals = decimalParts.join("").slice(0, 2);
  input.value = integerPart + (decimalParts.length ? `.${decimals}` : "");
}

function loadInputs() {
  const tasks = parseWorkCsv(el("workCsv").value);
  const roles = parseRolesCsv(el("rolesCsv").value);
  const meetings = parseMeetingsCsv(el("meetingsCsv").value);
  Object.assign(state, { tasks, roles, meetings });
  return { tasks, roles, meetings };
}

function runScenarios() {
  const { tasks, roles, meetings } = loadInputs();
  const fixedWeeks = parseNumber(el("discoveryWeeks").value) +
    parseNumber(el("sitWeeks").value) +
    parseNumber(el("uatWeeks").value) +
    parseNumber(el("goliveWeeks").value);
  const criticalWeeks = criticalPathWeeks(tasks);
  const generated = generateScenarios(tasks, roles, meetings, {
    fixedWeeks,
    weeklyHours: parseNumber(el("weeklyHours").value, 37.5),
    hoursPerDay: parseNumber(el("hoursPerDay").value, 7.5)
  });

  const maxBudget = el("maxBudget").value.trim() === "" ? null : parseNumber(el("maxBudget").value, 0);
  const maxProjectWeeks = el("maxProjectWeeks").value.trim() === "" ? null : parseNumber(el("maxProjectWeeks").value, 0);
  const preferredTeamSize = el("preferredTeamSize").value.trim() === ""
    ? null
    : Math.max(0, Math.floor(parseNumber(el("preferredTeamSize").value, 0)));
  const maxTeamSize = el("maxTeamSize").value.trim() === ""
    ? null
    : Math.max(0, Math.floor(parseNumber(el("maxTeamSize").value, 0)));
  const maxScenarios = Math.max(1, Math.min(500, Math.floor(parseNumber(el("maxScenarios").value, 20))));
  const noIdleTime = el("noIdleTime").checked;
  const withinLimits = generated.filter((scenario) =>
    (maxBudget === null || scenario.totalCost <= maxBudget) &&
    (maxProjectWeeks === null || scenario.totalWeeks <= maxProjectWeeks) &&
    (maxTeamSize === null || scenario.teamSize <= maxTeamSize) &&
    (!noIdleTime || scenario.utilization >= 0.68)
  );
  const feasible = withinLimits.filter((scenario) => !scenario.unscheduled.length);
  let scenarios = selectOptimalScenarios(feasible, maxScenarios, preferredTeamSize);

  if (scenarios.length) {
    const preferenceMessage = preferredTeamSize === null
      ? ""
      : ` Preferred team size ${preferredTeamSize} influenced selection.`;
    state.selectionMessage = `${scenarios.length} optimal scenario${scenarios.length === 1 ? "" : "s"} shown from ${generated.length} generated; ${feasible.length} met all constraints.${preferenceMessage}`;
  } else {
    scenarios = withinLimits
      .filter((scenario) => scenario.unscheduled.length)
      .sort((a, b) => a.unscheduled.length - b.unscheduled.length || a.totalCost - b.totalCost)
      .slice(0, maxScenarios);
    const smallestTeamSize = generated.length ? Math.min(...generated.map((scenario) => scenario.teamSize)) : null;
    if (scenarios.length) {
      state.selectionMessage = `No feasible scenarios met all constraints. Showing ${scenarios.length} closest staffing mixes for diagnosis.`;
    } else if (maxTeamSize !== null && smallestTeamSize !== null && smallestTeamSize > maxTeamSize) {
      state.selectionMessage = `No scenarios meet max team size ${maxTeamSize}. The smallest team generated from the fixed and minimum role counts is ${smallestTeamSize}.`;
    } else {
      state.selectionMessage = `No scenarios met the current budget, duration, team-size, and idle-time constraints.`;
    }
  }

  scenarios.sort((a, b) => a.teamSize - b.teamSize || a.totalCost - b.totalCost || a.totalWeeks - b.totalWeeks);
  scenarios.forEach((scenario, index) => {
    scenario.label = scenarioLabel(index);
  });

  state.scenarios = scenarios;
  renderResults({
    scenarios,
    tasks,
    selectionMessage: state.selectionMessage,
    criticalWeeks,
    currency: el("currency").value || "£"
  });
}

function readFileInto(inputId, textareaId) {
  const input = el(inputId);
  input.addEventListener("click", () => {
    input.value = "";
  });
  input.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    el(textareaId).value = await file.text();
    runScenarios();
  });
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    el(tab.dataset.tab).classList.add("active");
  });
});

el("loadSamples").addEventListener("click", () => {
  el("workCsv").value = sampleWork;
  el("rolesCsv").value = sampleRoles;
  el("meetingsCsv").value = sampleMeetings;
  runScenarios();
});

el("run").addEventListener("click", runScenarios);
el("exportCsv").addEventListener("click", () => {
  if (!state.scenarios.length) runScenarios();
  downloadCsv("project-scenarios.csv", scenariosToCsv(state.scenarios));
});

[
  "weeklyHours",
  "hoursPerDay",
  "currency",
  "discoveryWeeks",
  "sitWeeks",
  "uatWeeks",
  "goliveWeeks",
  "maxProjectWeeks",
  "preferredTeamSize",
  "maxTeamSize",
  "maxScenarios"
].forEach((id) => {
  el(id).addEventListener("input", runScenarios);
});

el("maxBudget").addEventListener("input", () => {
  normalizeBudgetInput();
  runScenarios();
});

el("noIdleTime").addEventListener("change", runScenarios);

["workCsv", "rolesCsv", "meetingsCsv"].forEach((id) => {
  el(id).addEventListener("input", runScenarios);
});

readFileInto("workFile", "workCsv");
readFileInto("rolesFile", "rolesCsv");
readFileInto("meetingsFile", "meetingsCsv");

el("workCsv").value = sampleWork;
el("rolesCsv").value = sampleRoles;
el("meetingsCsv").value = sampleMeetings;
runScenarios();
