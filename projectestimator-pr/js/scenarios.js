import { canDo, scheduleBuild, topSkillPressure } from "./scheduler.js";
import { roundUpToTenth } from "./utils.js";

export function roleConfigurations(roles, limit = 500) {
  const variableRoles = roles.filter((role) => role.staffing === "variable");
  const fixedRoles = roles.filter((role) => role.staffing !== "variable");
  const configurations = [];

  function build(index, selected) {
    if (configurations.length >= limit) return;
    if (index === variableRoles.length) {
      configurations.push([
        ...fixedRoles.map((role) => ({ ...role, count: role.count })),
        ...selected
      ]);
      return;
    }

    const role = variableRoles[index];
    for (let count = role.minCount; count <= role.maxCount; count += 1) {
      build(index + 1, [...selected, { ...role, count }]);
    }
  }

  build(0, []);
  return configurations;
}

export function scenarioLabel(index) {
  let label = "";
  let value = index + 1;
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function staffingMix(roles) {
  return roles.filter((role) => role.count > 0).map((role) => `${role.count} ${role.role}`).join("; ");
}

export function generateScenarios(tasks, roles, meetings, { fixedWeeks, weeklyHours, hoursPerDay }) {
  const topSkill = topSkillPressure(tasks);
  return roleConfigurations(roles).map((scenarioRoles, index) => {
    const scheduled = scheduleBuild(tasks, scenarioRoles, meetings, { weeklyHours, hoursPerDay });
    const buildWeeks = roundUpToTenth(scheduled.buildWeeks);
    const totalWeeks = roundUpToTenth(fixedWeeks + buildWeeks);
    const weeklyBurn = scenarioRoles.reduce((total, role) => total + role.count * role.weeklyCost, 0);
    const missingSkills = [...new Set(scheduled.unscheduled
      .filter((task) => !scheduled.resources.some((resource) => canDo(resource, task)))
      .flatMap((task) => task.skills))];

    return {
      label: scenarioLabel(index),
      teamSize: scenarioRoles.reduce((total, role) => total + role.count, 0),
      mix: staffingMix(scenarioRoles),
      buildWeeks,
      totalWeeks,
      weeklyBurn,
      totalCost: weeklyBurn * totalWeeks,
      utilization: scheduled.utilization,
      unscheduled: scheduled.unscheduled,
      missingSkills,
      topSkill
    };
  });
}

function dominates(a, b) {
  return a.totalCost <= b.totalCost && a.totalWeeks <= b.totalWeeks &&
    (a.totalCost < b.totalCost || a.totalWeeks < b.totalWeeks);
}

function paretoFronts(scenarios) {
  const remaining = [...scenarios];
  const fronts = [];
  while (remaining.length) {
    const front = remaining.filter((candidate) =>
      !remaining.some((other) => other !== candidate && dominates(other, candidate))
    );
    fronts.push(front);
    front.forEach((item) => remaining.splice(remaining.indexOf(item), 1));
  }
  return fronts;
}

function diverseSelection(front, count) {
  if (count >= front.length) return front;
  const costs = front.map((item) => item.totalCost);
  const weeks = front.map((item) => item.totalWeeks);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const minWeeks = Math.min(...weeks);
  const maxWeeks = Math.max(...weeks);
  const normalized = (value, min, max) => max === min ? 0 : (value - min) / (max - min);

  if (count === 1) {
    return [[...front].sort((a, b) =>
      (normalized(a.totalCost, minCost, maxCost) + normalized(a.totalWeeks, minWeeks, maxWeeks)) -
      (normalized(b.totalCost, minCost, maxCost) + normalized(b.totalWeeks, minWeeks, maxWeeks))
    )[0]];
  }

  const scored = front.map((item) => ({ item, distance: 0 }));
  [["totalCost", minCost, maxCost], ["totalWeeks", minWeeks, maxWeeks]].forEach(([key, min, max]) => {
    const ordered = [...scored].sort((a, b) => a.item[key] - b.item[key]);
    ordered[0].distance = Infinity;
    ordered[ordered.length - 1].distance = Infinity;
    if (max === min) return;
    for (let i = 1; i < ordered.length - 1; i += 1) {
      ordered[i].distance += (ordered[i + 1].item[key] - ordered[i - 1].item[key]) / (max - min);
    }
  });
  return scored.sort((a, b) => b.distance - a.distance).slice(0, count).map((entry) => entry.item);
}

export function selectOptimalScenarios(scenarios, maxCount, preferredTeamSize = null) {
  const selected = [];
  if (preferredTeamSize !== null && scenarios.length) {
    const closestDistance = Math.min(...scenarios.map((scenario) => Math.abs(scenario.teamSize - preferredTeamSize)));
    const closest = scenarios.filter((scenario) => Math.abs(scenario.teamSize - preferredTeamSize) === closestDistance);
    selected.push(...diverseSelection(closest, 1));
  }

  for (const front of paretoFronts(scenarios)) {
    const remaining = maxCount - selected.length;
    if (remaining <= 0) break;
    const unselected = front.filter((scenario) => !selected.includes(scenario));
    selected.push(...diverseSelection(unselected, remaining));
  }
  return selected;
}
