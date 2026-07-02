Created using Cursor, June 2026.

Sample data is not a reflection of anything other than the need for interesting variation within datasets when trying out the tool.

# Project Configuration Planner

The app uses native JavaScript modules, so run it through a local web server rather than opening `index.html` directly:

```sh
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765/`.

## Source structure

- `index.html` contains the page structure.
- `styles.css` contains the responsive layout and visual styling.
- `js/csv.js` parses the three CSV formats and resolves inherited skills.
- `js/scheduler.js` schedules build work against skills, dependencies, and meeting capacity.
- `js/scenarios.js` generates staffing combinations and selects optimal scenarios.
- `js/ui.js` renders results and exports scenario CSVs.
- `js/utils.js` contains shared value parsing and list helpers.
- `js/app.js` connects the controls, data, calculation modules, and UI.
- `package.json` declares the dependency-free browser source as ES modules for local checks.

## Technical work CSV

Required columns:

```csv
id,name,estimate_days,skills,dependencies
```

- Separate multiple skills or dependency IDs with semicolons.
- Dependency IDs are case-insensitive.
- Estimates are converted to hours using the app's **Hours/day for estimates** setting.

## Roles and skills CSV

Required columns:

```csv
role,role_family,staffing,count,min_count,max_count,daily_rate,build_contribution_pct,skills,inherits
```

- Add every fixed or variable role type that might be used on the project.
- Set `staffing` to `fixed` and provide `count` for roles such as Project Manager and Technical Lead.
- Set `staffing` to `variable` and provide `min_count` and `max_count` for roles the planner should vary.
- `min_count` is a hard minimum for that exact role; inherited skills do not reduce it. Use `0` when the role is optional because another role can cover its work.
- Use `role_family` to group roles, for example `developer`, `consultant`, or `leadership`. Meeting attendees can name a family.
- Separate multiple `skills` with semicolons.
- Set `inherits` to another role name when a specialist also has that role's skills. An Integration Developer can inherit General Developer, for example.
- `daily_rate` is the cost per person per day. Weekly burn uses five billable days per person.
- Existing CSVs using `weekly_cost`, `weekly_rate`, or `cost_per_week` remain supported for backwards compatibility.
- `build_contribution_pct` controls build capacity. Use `100` for a full-time builder and `0` for no build work.

Example:

```csv
role,role_family,staffing,count,min_count,max_count,daily_rate,build_contribution_pct,skills,inherits
Project Manager,leadership,fixed,1,,,840,0,,
General Developer,developer,variable,,1,4,1040,100,"configuration;testing",
Integration Developer,developer,variable,,0,2,1300,100,integration_tool,General Developer
General Consultant,consultant,variable,,0,3,1120,100,"configuration;testing",
Marketing Tool Consultant,consultant,variable,,0,2,1360,100,marketing_tool,General Consultant
```

## Standing meetings CSV

Required columns:

```csv
meeting,phase,frequency,duration_hours,attendees
```

- Supported phases: `discovery`, `build`, `sit`, `uat`, `go-live`, `all`.
- Supported frequencies: `daily`, `weekly`, `fortnightly`, `monthly`.
- Attendees may be `All`, a role name, a `role_family`, or `Consultant/Developer`.
- Separate multiple phases or attendees with semicolons.

## Calculation model

- The delivery shape is fixed: discovery, build, SIT, UAT, and go-live.
- Every selected fixed and variable role is costed full-time across all phases.
- The planner generates combinations across each variable role's minimum and maximum, up to 500 scenarios.
- Build work is scheduled against dependencies, skills, meeting overhead, and available people.
- Each work item is assigned to one resource at a time and is not split across multiple people.
- Total cost is weekly burn multiplied by total project weeks.
- The result is a planning comparison, not a day-level delivery commitment.

## Scenario limits and selection

- **Max budget** and **Max project weeks** filter out scenarios above those limits. Leave either field blank for no limit; `0` is treated as a real zero limit.
- **Preferred team size** is a soft preference. When the output count is limited, the planner includes the best feasible scenario at or nearest that size, then fills the remaining places from the cost-versus-duration Pareto fronts. Leave it blank for no preference.
- **Max team size** is a hard limit. Scenarios above it are excluded. If the fixed and minimum role counts already exceed the limit, the planner reports the smallest team those role settings can generate.
- **Do not allow idle time** excludes scenarios below 68% build utilization, matching the app's idle-time warning threshold.
- **Max output scenarios** limits the displayed table and exported CSV.
- Scenarios with missing skills or unresolved dependencies are excluded when feasible alternatives exist.
- Feasible options are ranked in Pareto fronts using total cost and total duration. When a front contains more options than the output limit allows, the planner keeps a diverse spread across the trade-off curve, including cost and speed extremes rather than several nearly identical options.
