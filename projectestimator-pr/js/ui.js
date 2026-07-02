const el = (id) => document.getElementById(id);

function formatMoney(value, currency) {
  return `${currency}${Math.round(value).toLocaleString("en-GB")}`;
}

function scenarioNotes(scenario, previous, criticalWeeks) {
  const notes = [];
  if (scenario.unscheduled.length) {
    notes.push(`<span class="pill bad">${scenario.missingSkills.length ? `Missing: ${scenario.missingSkills.join(", ")}` : "Blocked or circular dependency"}</span>`);
  }
  if (scenario.utilization < 0.68) notes.push('<span class="pill warn">Some idle time</span>');
  if (scenario.buildWeeks <= criticalWeeks * 1.18 && scenario.teamSize > 1) {
    notes.push('<span class="pill warn">Critical path dominates</span>');
  }
  if (previous && scenario.teamSize > previous.teamSize && previous.buildWeeks >= scenario.buildWeeks &&
      previous.buildWeeks - scenario.buildWeeks < 1) {
    notes.push('<span class="pill warn">Limited speed-up</span>');
  }
  if (scenario.topSkill && scenario.topSkill.share > 0.38) {
    notes.push(`<span class="pill warn">Skill bottleneck in ${scenario.topSkill.skill}</span>`);
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

export function renderResults({ scenarios, tasks, selectionMessage, criticalWeeks, currency }) {
  renderMetrics(scenarios, tasks, currency);
  el("scenarioSummary").textContent = selectionMessage || "";
  let previous = null;
  el("scenarioBody").innerHTML = scenarios.map((scenario) => {
    const notes = scenarioNotes(scenario, previous, criticalWeeks);
    previous = scenario;
    return `<tr>
      <td><strong>${scenario.label}</strong></td>
      <td class="num">${scenario.teamSize}</td>
      <td>${scenario.mix}</td>
      <td class="num">${scenario.buildWeeks}</td>
      <td class="num">${scenario.totalWeeks}</td>
      <td class="num">${formatMoney(scenario.weeklyBurn, currency)}</td>
      <td class="num">${formatMoney(scenario.totalCost, currency)}</td>
      <td>${notes}</td>
    </tr>`;
  }).join("");

  if (!scenarios.length) {
    el("scenarioBody").innerHTML = "";
    el("timeline").innerHTML = '<div class="empty">Adjust the constraints to see matching scenarios.</div>';
    return;
  }

  const maxWeeks = Math.max(...scenarios.map((scenario) => scenario.totalWeeks));
  el("timeline").innerHTML = scenarios.map((scenario) => `
    <div class="bar-row">
      <strong>Scenario ${scenario.label}</strong>
      <div class="bar-track" aria-label="Scenario ${scenario.label} duration">
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
