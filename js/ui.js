const el = (id) => document.getElementById(id);
let detailContext = null;
let detailEventsBound = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function displaySkill(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (word.length <= 3 || /\d/.test(word)) return word.toUpperCase();
      return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(" ");
}

function displaySkills(values) {
  return values.map(displaySkill).join(", ");
}

function formatMoney(value, currency) {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${currency}${Math.abs(rounded).toLocaleString("en-GB")}`;
}

function formatNumber(value, digits = 1) {
  return Number(value || 0).toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function buildWeekRange(assignment) {
  const start = assignment.startDay / 5 + 1;
  const finish = Math.max(start, assignment.finishDay / 5);
  return {
    start: formatNumber(start),
    finish: formatNumber(finish)
  };
}

function hasLimitedSpeedUp(scenario) {
  const previous = scenario.previousComparison;
  return previous && previous.buildWeeks >= scenario.buildWeeks &&
    previous.buildWeeks - scenario.buildWeeks < 1;
}

function scenarioNotes(scenario, criticalWeeks) {
  const notes = [];
  if (scenario.unscheduled.length) {
    const label = scenario.missingSkills.length
      ? `Missing: ${displaySkills(scenario.missingSkills)}`
      : "Blocked or circular dependency";
    notes.push(`<button type="button" class="pill bad detail-flag" data-diagnostic="blocked">${escapeHtml(label)}</button>`);
  }
  if (scenario.utilization < 0.68) {
    notes.push('<button type="button" class="pill warn detail-flag" data-diagnostic="idle">Some idle time</button>');
  }
  if (criticalWeeks > 0 && scenario.buildWeeks <= criticalWeeks * 1.18 && scenario.teamSize > 1) {
    notes.push('<button type="button" class="pill warn detail-flag" data-diagnostic="critical">Critical path dominates</button>');
  }
  if (hasLimitedSpeedUp(scenario)) {
    notes.push('<button type="button" class="pill warn detail-flag" data-diagnostic="speed">Limited speed-up</button>');
  }
  if (scenario.skillDiagnostic && scenario.skillDiagnostic.share > 0.38) {
    notes.push(`<button type="button" class="pill warn detail-flag" data-diagnostic="skill">Skill bottleneck in ${escapeHtml(displaySkill(scenario.skillDiagnostic.skill))}</button>`);
  }
  if (!notes.length) notes.push('<span class="pill">Balanced option</span>');
  return notes.join(" ");
}

function renderMetrics(scenarios, tasks, currency) {
  const viable = scenarios.filter((item) => !item.unscheduled.length);
  const bestCost = viable.reduce((best, item) => !best || item.totalCost < best.totalCost ? item : best, null);
  const fastest = viable.reduce((best, item) => !best || item.totalWeeks < best.totalWeeks ? item : best, null);
  const workDays = tasks.reduce((total, task) => total + task.estimateDays, 0);
  el("metrics").innerHTML = `
    <div class="metric"><span>Work items</span><strong>${tasks.length}</strong></div>
    <div class="metric"><span>Total build effort</span><strong>${workDays.toLocaleString("en-GB")} days</strong></div>
    <div class="metric"><span>Lowest cost</span><strong>${bestCost ? `${bestCost.label} · ${formatMoney(bestCost.totalCost, currency)}` : "n/a"}</strong></div>
    <div class="metric"><span>Fastest</span><strong>${fastest ? `${fastest.label} · ${fastest.totalWeeks} wks` : "n/a"}</strong></div>
  `;
}

function diagnosticItem(key, title, summary, evidence = "") {
  return `
    <article class="diagnostic-item" data-diagnostic-item="${key}">
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(summary)}</p>
      </div>
      ${evidence ? `<p class="diagnostic-evidence">${escapeHtml(evidence)}</p>` : ""}
    </article>
  `;
}

function renderDiagnostics(scenario, context, focusKey = "") {
  const items = [];
  if (scenario.unscheduled.length) {
    const taskNames = scenario.unscheduled.map((task) => task.id).join(", ");
    const missing = scenario.missingSkills.length
      ? `No allocated person covers: ${displaySkills(scenario.missingSkills)}.`
      : "The remaining work has unresolved or circular dependencies.";
    items.push(diagnosticItem(
      "blocked",
      scenario.missingSkills.length ? "Missing skill coverage" : "Blocked work",
      missing,
      `Affected stories: ${taskNames}.`
    ));
  }

  if (scenario.utilization < 0.68) {
    const idleResources = [...scenario.resources]
      .filter((resource) => resource.idleDays > 0.1)
      .sort((a, b) => b.idleDays - a.idleDays)
      .slice(0, 3)
      .map((resource) => `${resource.id}: ${formatPercent(resource.utilization)} utilised, ${formatNumber(resource.idleDays)} available days unused`)
      .join("; ");
    items.push(diagnosticItem(
      "idle",
      "Idle build capacity",
      `Overall build utilisation is ${formatPercent(scenario.utilization)}, below the 68% warning threshold.`,
      idleResources || "No build-capable resource detail is available."
    ));
  }

  if (context.criticalPath.weeks > 0 &&
      scenario.buildWeeks <= context.criticalPath.weeks * 1.18 &&
      scenario.teamSize > 1) {
    items.push(diagnosticItem(
      "critical",
      "Dependency path limits delivery",
      `The ${formatNumber(context.criticalPath.weeks)}-week dependency path is close to the ${formatNumber(scenario.buildWeeks)}-week scheduled build.`,
      `Path: ${context.criticalPath.taskIds.join(" -> ")}.`
    ));
  }

  if (hasLimitedSpeedUp(scenario)) {
    const previous = scenario.previousComparison;
    const savedWeeks = previous.totalWeeks - scenario.totalWeeks;
    const extraCost = scenario.totalCost - previous.totalCost;
    const addedPeople = scenario.teamSize - previous.teamSize;
    items.push(diagnosticItem(
      "speed",
      "Additional headcount gives limited speed-up",
      `Compared with scenario ${previous.label}, this team adds ${addedPeople} ${addedPeople === 1 ? "person" : "people"} and saves ${formatNumber(savedWeeks)} project weeks.`,
      `Total cost changes by ${formatMoney(extraCost, context.currency)}.`
    ));
  }

  if (scenario.skillDiagnostic && scenario.skillDiagnostic.share > 0.38) {
    const diagnostic = scenario.skillDiagnostic;
    items.push(diagnosticItem(
      "skill",
      `${displaySkill(diagnostic.skill)} work is concentrated`,
      `${formatNumber(diagnostic.demandDays)} days across ${diagnostic.storyCount} stories require this skill, representing ${formatPercent(diagnostic.share)} of build effort.`,
      `${diagnostic.eligiblePeople} allocated people can cover it; assigned stories wait ${formatNumber(diagnostic.queueWaitDays)} cumulative working days after their dependencies are ready.`
    ));
  }

  if (!items.length) {
    items.push(diagnosticItem(
      "balanced",
      "No material warning",
      "This scenario clears the current skill, utilisation, dependency and speed-up warning thresholds."
    ));
  }

  el("diagnostics").innerHTML = `
    <div class="diagnostic-list">${items.join("")}</div>
    <div class="selection-reason">
      <h3>Why this scenario was selected</h3>
      <p>${escapeHtml(scenario.selectionReasons.join(". "))}.</p>
    </div>
  `;

  if (focusKey) {
    const target = el("diagnostics").querySelector?.(`[data-diagnostic-item="${focusKey}"]`);
    target?.classList.add("focused");
  }
}

function renderPhaseStrip(scenario, context) {
  const phases = [
    ["Discovery", context.phaseWeeks.discovery],
    ["Build", scenario.buildWeeks],
    ["SIT", context.phaseWeeks.sit],
    ["UAT", context.phaseWeeks.uat],
    ["Go-live", context.phaseWeeks.goLive]
  ].filter(([, weeks]) => weeks > 0);
  return `
    <div class="phase-strip" aria-label="Project phases">
      ${phases.map(([name, weeks]) => `
        <div class="phase-segment" style="flex-grow:${weeks}">
          <strong>${escapeHtml(name)}</strong>
          <span>${formatNumber(weeks)} wks</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderTimeline(scenario, context) {
  const buildWeeks = Math.max(1, Math.ceil(scenario.buildWeeks));
  const buildDays = Math.max(1, scenario.buildWeeks * 5);
  const canvasWidth = Math.max(720, buildWeeks * 56);
  const markers = Array.from({ length: buildWeeks }, (_, index) => `
    <span style="left:${index / buildWeeks * 100}%">W${index + 1}</span>
  `).join("");
  const lanes = scenario.resources.map((resource) => {
    const assignments = scenario.assignments
      .filter((assignment) => assignment.resourceId === resource.id)
      .sort((a, b) => a.startDay - b.startDay);
    return `
      <div class="resource-lane-row">
        <div class="resource-lane-label">
          <strong>${escapeHtml(resource.id)}</strong>
          <span>${formatPercent(resource.utilization)} utilised</span>
        </div>
        <div class="resource-lane" style="background-size:${100 / buildWeeks}% 100%">
          ${assignments.map((assignment) => {
            const left = assignment.startDay / buildDays * 100;
            const width = Math.max(0.8, (assignment.finishDay - assignment.startDay) / buildDays * 100);
            const inherited = assignment.inheritedSkillsUsed.length ? " inherited" : "";
            const weekRange = buildWeekRange(assignment);
            return `
              <span
                class="task-block${inherited}"
                style="left:${left}%;width:${width}%"
                title="${escapeHtml(`${assignment.taskId}: ${assignment.taskName}. ${resource.id}. Week ${weekRange.start} to ${weekRange.finish}.`)}"
              >${escapeHtml(assignment.taskId)}</span>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");

  el("timelineDetail").innerHTML = `
    ${renderPhaseStrip(scenario, context)}
    <div class="detail-section-head">
      <div>
        <h3>Build assignments</h3>
        <p>Week-based schedule by allocated role instance.</p>
      </div>
    </div>
    <div class="assignment-timeline">
      <div class="timeline-canvas" style="width:${canvasWidth + 180}px">
        <div class="timeline-scale-row">
          <div></div>
          <div class="timeline-scale">${markers}</div>
        </div>
        ${lanes || '<div class="empty">No build assignments are available for this scenario.</div>'}
      </div>
    </div>
  `;
}

function renderStories(scenario) {
  const assignmentRows = [...scenario.assignments]
    .sort((a, b) => a.startDay - b.startDay)
    .map((assignment) => {
      const weeks = buildWeekRange(assignment);
      const inherited = assignment.inheritedSkillsUsed.length
        ? `<span class="inline-note">via inherited ${escapeHtml(displaySkills(assignment.inheritedSkillsUsed))}</span>`
        : "";
      return `
        <tr>
          <td><strong>${escapeHtml(assignment.taskId)}</strong><br><span class="small">${escapeHtml(assignment.taskName)}</span></td>
          <td>${escapeHtml(assignment.resourceId)} ${inherited}</td>
          <td class="num">${weeks.start}</td>
          <td class="num">${weeks.finish}</td>
          <td class="num">${formatNumber(assignment.effortDays)}</td>
          <td>${escapeHtml(assignment.skills.length ? displaySkills(assignment.skills) : "General")}</td>
          <td>${escapeHtml(assignment.dependencies.join(", ") || "None")}</td>
        </tr>
      `;
    });
  const unscheduledRows = scenario.unscheduled.map((task) => `
    <tr class="unscheduled-row">
      <td><strong>${escapeHtml(task.id)}</strong><br><span class="small">${escapeHtml(task.name)}</span></td>
      <td>Unscheduled</td>
      <td class="num">-</td>
      <td class="num">-</td>
      <td class="num">${formatNumber(task.estimateDays)}</td>
      <td>${escapeHtml(task.skills.length ? displaySkills(task.skills) : "General")}</td>
      <td>${escapeHtml(task.dependencies.join(", ") || "None")}</td>
    </tr>
  `);

  el("storiesDetail").innerHTML = `
    <div class="detail-table-wrap">
      <table class="detail-table">
        <thead>
          <tr>
            <th>Story</th>
            <th>Assigned to</th>
            <th class="num">Start week</th>
            <th class="num">Finish week</th>
            <th class="num">Effort days</th>
            <th>Skills</th>
            <th>Dependencies</th>
          </tr>
        </thead>
        <tbody>${[...assignmentRows, ...unscheduledRows].join("")}</tbody>
      </table>
    </div>
  `;
}

function renderTeam(scenario, context) {
  el("teamDetail").innerHTML = `
    <div class="detail-table-wrap">
      <table class="detail-table">
        <thead>
          <tr>
            <th>Role</th>
            <th class="num">Count</th>
            <th>Skills covered</th>
            <th class="num">Stories</th>
            <th class="num">Productive days</th>
            <th class="num">Utilisation</th>
            <th class="num">Unused days</th>
            <th class="num">Weekly cost</th>
          </tr>
        </thead>
        <tbody>
          ${scenario.team.map((role) => `
            <tr>
              <td><strong>${escapeHtml(role.role)}</strong></td>
              <td class="num">${role.count}</td>
              <td>${escapeHtml(role.skills.length ? displaySkills(role.skills) : "None")}</td>
              <td class="num">${role.assignedStories}</td>
              <td class="num">${formatNumber(role.productiveDays)}</td>
              <td class="num">${role.utilization === null ? "n/a" : formatPercent(role.utilization)}</td>
              <td class="num">${role.utilization === null ? "n/a" : formatNumber(role.idleDays)}</td>
              <td class="num">${formatMoney(role.weeklyCost, context.currency)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function switchDetailTab(tabId) {
  document.querySelectorAll(".detail-tab").forEach((tab) => {
    const active = tab.dataset.detailTab === tabId;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".detail-pane").forEach((pane) => {
    pane.classList.toggle("active", pane.id === tabId);
  });
}

function openScenarioDetail(index, focusDiagnostic = "") {
  if (!detailContext) return;
  const scenario = detailContext.scenarios[index];
  if (!scenario) return;

  el("detailTitle").textContent = `Scenario ${scenario.label}: ${scenario.teamSize} people, ${scenario.totalWeeks} weeks`;
  el("detailSummary").textContent = `${scenario.selectionReasons.join(". ")}. Total cost ${formatMoney(scenario.totalCost, detailContext.currency)}.`;
  renderDiagnostics(scenario, detailContext, focusDiagnostic);
  renderTimeline(scenario, detailContext);
  renderStories(scenario);
  renderTeam(scenario, detailContext);
  el("scenarioDetail").hidden = false;
  switchDetailTab(focusDiagnostic ? "diagnostics" : "timelineDetail");
  el("scenarioDetail").scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function bindDetailEvents() {
  if (detailEventsBound) return;
  detailEventsBound = true;

  el("scenarioBody").addEventListener("click", (event) => {
    const row = event.target.closest?.("[data-scenario-index]");
    if (!row) return;
    const flag = event.target.closest?.("[data-diagnostic]");
    openScenarioDetail(Number(row.dataset.scenarioIndex), flag?.dataset.diagnostic || "");
  });
  el("scenarioBody").addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    const row = event.target.closest?.("[data-scenario-index]");
    if (!row) return;
    event.preventDefault();
    openScenarioDetail(Number(row.dataset.scenarioIndex));
  });
  document.querySelectorAll(".detail-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchDetailTab(tab.dataset.detailTab));
  });
  el("closeDetail").addEventListener("click", () => {
    el("scenarioDetail").hidden = true;
  });
}

export function renderResults(context) {
  detailContext = context;
  const { scenarios, tasks, selectionMessage, criticalPath, currency } = context;
  renderMetrics(scenarios, tasks, currency);
  el("scenarioSummary").textContent = selectionMessage || "";
  el("scenarioDetail").hidden = true;
  el("scenarioBody").innerHTML = scenarios.map((scenario, index) => `
    <tr class="scenario-row" data-scenario-index="${index}" tabindex="0">
      <td><button type="button" class="scenario-link" title="View scenario ${escapeHtml(scenario.label)} details">${escapeHtml(scenario.label)}</button></td>
      <td class="num">${scenario.teamSize}</td>
      <td>${escapeHtml(scenario.mix)}</td>
      <td class="num">${scenario.buildWeeks}</td>
      <td class="num">${scenario.totalWeeks}</td>
      <td class="num">${formatMoney(scenario.weeklyBurn, currency)}</td>
      <td class="num">${formatMoney(scenario.totalCost, currency)}</td>
      <td>${scenarioNotes(scenario, criticalPath.weeks)}</td>
    </tr>
  `).join("");

  bindDetailEvents();
  if (!scenarios.length) {
    el("scenarioBody").innerHTML = "";
    el("timeline").innerHTML = '<div class="empty">Adjust the constraints to see matching scenarios.</div>';
    return;
  }

  const maxWeeks = Math.max(...scenarios.map((scenario) => scenario.totalWeeks));
  el("timeline").innerHTML = scenarios.map((scenario) => `
    <div class="bar-row">
      <strong>Scenario ${escapeHtml(scenario.label)}</strong>
      <div class="bar-track" aria-label="Scenario ${escapeHtml(scenario.label)} duration">
        <div class="bar-fill" style="width:${Math.max(2, scenario.totalWeeks / maxWeeks * 100)}%"></div>
      </div>
      <span class="small">${scenario.totalWeeks} wks</span>
    </div>
  `).join("");
}

export function scenariosToCsv(scenarios) {
  const rows = [["Scenario", "Team size", "Staffing mix", "Build weeks", "Total project weeks", "Weekly burn", "Total cost"]];
  scenarios.forEach((scenario) => {
    rows.push([scenario.label, scenario.teamSize, scenario.mix, scenario.buildWeeks, scenario.totalWeeks, scenario.weeklyBurn, Math.round(scenario.totalCost)]);
  });
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
