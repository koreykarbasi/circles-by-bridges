---
name: Autoscale heartbeat operating mode
description: The cost-driven choice to use Autoscale with a continuous workspace heartbeat rather than a Reserved VM.
---

Use Autoscale for production and run a continuous five-minute health check to keep the service warm while the workspace workflow is active. The heartbeat must log failures and retry rather than exiting on a transient response.

**Why:** A Reserved VM was considered too expensive for this app, while scheduled push delivery requires the server to be available at the recipient’s local delivery window.

**How to apply:** After each publish, confirm the health endpoint returns successfully from the heartbeat. Treat this as best-effort: a workspace workflow is not an independently hosted uptime monitor and may not run if the development workspace is asleep. Prefer a verified external monitor if reliable unattended delivery is required.