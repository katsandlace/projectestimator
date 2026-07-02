import { parseNumber, splitList } from "./utils.js";

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" && !quoted) {
      row.push(cell);
      if (row.some((part) => part.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((part) => part.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).map((parts) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (parts[index] || "").trim();
    });
    return record;
  });
}

export function parseWorkCsv(text) {
  return parseCsv(text).map((row, index) => ({
    id: row.id || `TASK-${index + 1}`,
    name: row.name || row.item || row.id || `Task ${index + 1}`,
    estimateDays: parseNumber(row.estimate_days || row.days || row.estimate || row.effort_days, 0),
    skills: splitList(row.skills || row.skillset || row.skillsets || row.required_skills),
    dependencies: splitList(row.dependencies || row.depends_on || row.deps)
  })).filter((task) => task.estimateDays > 0);
}

export function parseRolesCsv(text) {
  const roles = parseCsv(text).map((row) => {
    const staffing = String(row.staffing || row.count_type || "fixed").trim().toLowerCase();
    const fixedCount = Math.max(0, Math.floor(parseNumber(row.count || row.fte, 1)));
    const minCount = staffing === "variable" ? Math.max(0, Math.floor(parseNumber(row.min_count, 0))) : fixedCount;
    const maxCount = staffing === "variable" ? Math.max(minCount, Math.floor(parseNumber(row.max_count, minCount))) : fixedCount;
    const dailyRate = parseNumber(row.daily_rate || row.day_rate || row.cost_per_day, 0);
    const legacyWeeklyCost = parseNumber(row.weekly_cost || row.weekly_rate || row.cost_per_week, 0);
    return {
      role: row.role || row.name || "Role",
      family: String(row.role_family || row.family || row.category || "").trim().toLowerCase(),
      staffing,
      count: fixedCount,
      minCount,
      maxCount,
      dailyRate: dailyRate || legacyWeeklyCost / 5,
      weeklyCost: dailyRate ? dailyRate * 5 : legacyWeeklyCost,
      buildContributionPct: Math.max(0, parseNumber(row.build_contribution_pct || row.build_capacity_pct || row.delivery_pct, 0)),
      ownSkills: splitList(row.skills || row.skillset || row.skillsets),
      inherits: String(row.inherits || row.inherits_from || "").trim()
    };
  });

  const rolesByName = new Map(roles.map((role) => [role.role.toLowerCase(), role]));
  function inheritedSkills(role, seen = new Set()) {
    const key = role.role.toLowerCase();
    if (seen.has(key)) return role.ownSkills;
    seen.add(key);
    const parent = rolesByName.get(role.inherits.toLowerCase());
    return [...new Set([...role.ownSkills, ...(parent ? inheritedSkills(parent, seen) : [])])];
  }

  roles.forEach((role) => {
    role.skills = inheritedSkills(role);
  });
  return roles;
}

export function parseMeetingsCsv(text) {
  return parseCsv(text).map((row) => ({
    meeting: row.meeting || row.name || "Meeting",
    phase: row.phase || "all",
    frequency: row.frequency || "weekly",
    duration_hours: row.duration_hours || row.hours || row.duration || 0,
    attendees: row.attendees || row.roles || "All"
  }));
}
