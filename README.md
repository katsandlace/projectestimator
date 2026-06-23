Created using Cursor, June 2026

# Project Configuration Planner

Open `index.html` directly, or use the local URL below while the included test server is running:

`http://127.0.0.1:8765/`

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
role,role_family,staffing,count,min_count,max_count,weekly_cost,build_contribution_pct,skills,inherits
```

- Add every fixed or variable role type that might be used on the project.
- Set `staffing` to `fixed` and provide `count` for roles such as Project Manager and Technical Lead.
- Set `staffing` to `variable` and provide `min_count` and `max_count` for roles the planner should vary.
- Use `role_family` to group roles, for example `developer`, `consultant`, or `leadership`. Meeting attendees can name a family.
- Separate multiple `skills` with semicolons.
- Set `inherits` to another role name when a specialist also has that role's skills. An Integration Developer can inherit General Developer, for example.
- `weekly_cost` is per person. All selected roles are costed for the entire project.
- `build_contribution_pct` controls build capacity. Use `100` for a full-time builder and `0` for no build work.

Example:

```csv
role,role_family,staffing,count,min_count,max_count,weekly_cost,build_contribution_pct,skills,inherits
Project Manager,leadership,fixed,1,,,4200,0,,
General Developer,developer,variable,,1,4,5200,100,"configuration;testing",
Integration Developer,developer,variable,,0,2,6500,100,integration_tool,General Developer
General Consultant,consultant,variable,,0,3,5600,100,"configuration;testing",
Marketing Tool Consultant,consultant,variable,,0,2,6800,100,marketing_tool,General Consultant
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
