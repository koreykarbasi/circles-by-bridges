---
name: GitHub automation access
description: A GitHub connection may not be able to publish repository automation from this workspace.
---

Do not treat a configured GitHub connection or a readable repository as proof that an Actions workflow can be published. Verify the write and the resulting workflow run before relying on it for an operational job.

**Why:** GitHub repository reads succeeded, while writes through the connector and the repository’s configured Git remote were rejected by an environment-level authentication/Cloudflare response.

Repository metadata and Actions-list requests can succeed while Contents API reads and writes receive a Cloudflare HTML 403 identifying replit.com. This is not evidence of expired GitHub credentials: the connection can still report healthy. Do not repeatedly reconnect for this response; distinguish proxy blocking from a GitHub permission error.

The GitHub data connector and the Git pane's source-control credential are separate. Reauthorizing the connector does not necessarily refresh the `GIT_ASKPASS` credential used by `git push`; an explicit “invalid username or token” from the remote requires reconnecting GitHub in Replit Connected Services.

**How to apply:** For any GitHub-backed monitor or automation, publish a tiny workflow and confirm its Actions run before declaring it active. Diagnose API and Git-remote credentials independently. If writes fail, use a separately configured external monitor or an always-running deployment rather than an unverified local workflow file.