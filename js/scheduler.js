import { parseNumber, splitList } from "./utils.js";

function normalizePhase(phase) {
  const clean = String(phase || "all").trim().toLowerCase();
  if (["go live", "golive", "go-live"].includes(clean)) return "go-live";
  return clean || "all";
}

function meetingHoursPerWeek(meetings, phase, roleName, roleFamily = "") {
  const targetRole = String(roleName || "").trim().toLowerCase();
  const targetFamily = String(roleFamily || "").trim().toLowerCase();
  return meetings.reduce((total, meeting) => {
    const phases = splitList(meeting.phase || "all").map(normalizePhase);
    if (!phases.includes("all") && !phases.includes(phase)) return total;

    const attendees = splitList(meeting.attendees || "all");
    const attends = attendees.includes("all") ||
      attendees.includes(targetFamily) || attendees.includes(`${targetFamily}s`) ||
      (["developer", "consultant"].includes(targetFamily) &&
        attendees.some((item) => ["consultant/developer", "consultants/devs", "delivery team"].includes(item))) ||
      attendees.includes(targetRole);
    if (!attends) return total;

    const duration = parseNumber(meeting.duration_hours, 0);
    const frequency = String(meeting.frequency || "weekly").trim().toLowerCase();
    const multiplier = frequency === "daily" ? 5 : frequency === "fortnightly" ? 0.5 : frequency === "monthly" ? 0.25 : 1;
    return total + duration * multiplier;
  }, 0);
}

function makeResources(roles, meetings, weeklyHours) {
  const resources = [];

  roles.forEach((role) => {
    if (role.buildContributionPct <= 0 || role.count <= 0) return;
    const meetingHours = meetingHoursPerWeek(meetings, "build", role.role, role.family);
    const weeklyAvailable = Math.max(0, weeklyHours - meetingHours) * (role.buildContributionPct / 100);
    for (let i = 0; i < role.count; i += 1) {
      resources.push({
        id: `${role.role}-${i + 1}`,
        name: role.role,
        skills: role.skills,
        dailyHours: Math.max(0.1, weeklyAvailable / 5),
        nextFree: 0,
        worked: 0,
        family: role.family
      });
    }
  });

  return resources;
}

export function canDo(resource, task) {
  if (!task.skills.length) return true;
  return task.skills.every((skill) => resource.skills.includes(skill));
}

function taskPriority(tasks) {
  const memo = new Map();
  function walk(task) {
    const key = task.id.toLowerCase();
    if (memo.has(key)) return memo.get(key);
    const children = tasks.filter((candidate) => candidate.dependencies.includes(key));
    const downstream = children.length ? Math.max(...children.map(walk)) : 0;
    const total = task.estimateDays + downstream;
    memo.set(key, total);
    return total;
  }
  tasks.forEach(walk);
  return memo;
}

export function scheduleBuild(tasks, roles, meetings, { weeklyHours = 37.5, hoursPerDay = 7.5 } = {}) {
  if (!tasks.length) {
    return { buildWeeks: 0, utilization: 0, resources: [], completed: new Map(), unscheduled: [] };
  }

  const resources = makeResources(roles, meetings, weeklyHours);
  const unscheduled = [...tasks];
  const completed = new Map();
  const priorities = taskPriority(tasks);
  let guard = 0;

  while (unscheduled.length && guard < 2000) {
    guard += 1;
    const ready = unscheduled
      .filter((task) => task.dependencies.every((dependency) => completed.has(dependency)))
      .sort((a, b) => (priorities.get(b.id.toLowerCase()) || 0) - (priorities.get(a.id.toLowerCase()) || 0));

    if (!ready.length) break;

    let best = null;
    ready.forEach((task) => {
      const dependencyDone = task.dependencies.length
        ? Math.max(...task.dependencies.map((dependency) => completed.get(dependency) || 0))
        : 0;
      resources.filter((resource) => canDo(resource, task)).forEach((resource) => {
        const start = Math.max(resource.nextFree, dependencyDone);
        if (!best || start < best.start || (start === best.start && resource.dailyHours > best.resource.dailyHours)) {
          best = { task, resource, start };
        }
      });
    });

    if (!best) break;
    const effortHours = best.task.estimateDays * hoursPerDay;
    const durationDays = effortHours / best.resource.dailyHours;
    const finish = best.start + durationDays;
    best.resource.nextFree = finish;
    best.resource.worked += effortHours;
    completed.set(best.task.id.toLowerCase(), finish);
    unscheduled.splice(unscheduled.indexOf(best.task), 1);
  }

  const buildDays = completed.size ? Math.max(...completed.values()) : 0;
  const totalCapacityHours = resources.reduce((total, resource) => total + resource.dailyHours * buildDays, 0);
  const workedHours = resources.reduce((total, resource) => total + resource.worked, 0);
  return {
    buildWeeks: buildDays / 5,
    utilization: totalCapacityHours ? workedHours / totalCapacityHours : 0,
    resources,
    completed,
    unscheduled
  };
}

export function criticalPathWeeks(tasks) {
  if (!tasks.length) return 0;
  const byId = new Map(tasks.map((task) => [task.id.toLowerCase(), task]));
  const memo = new Map();

  function walk(task) {
    const key = task.id.toLowerCase();
    if (memo.has(key)) return memo.get(key);
    const dependencyMax = task.dependencies
      .map((dependency) => byId.get(dependency))
      .filter(Boolean)
      .reduce((max, dependencyTask) => Math.max(max, walk(dependencyTask)), 0);
    const total = dependencyMax + task.estimateDays;
    memo.set(key, total);
    return total;
  }

  return Math.max(...tasks.map(walk)) / 5;
}

export function topSkillPressure(tasks) {
  const totals = new Map();
  let total = 0;
  tasks.forEach((task) => {
    total += task.estimateDays;
    const skills = task.skills.length ? task.skills : ["general"];
    skills.forEach((skill) => totals.set(skill, (totals.get(skill) || 0) + task.estimateDays / skills.length));
  });
  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length || !total) return null;
  return { skill: entries[0][0], share: entries[0][1] / total };
}
