# Organization Model

An organization may contain:

Organization
├── Locations
├── Departments
├── Programs
├── Users
├── Roles
├── Services
├── Policies
├── Agents
└── Integrations

This hierarchy supports behavioral-health organizations with multiple programs or physical locations without creating separate security boundaries for every department.

Where stronger isolation is required, a separate tenant should be used.
