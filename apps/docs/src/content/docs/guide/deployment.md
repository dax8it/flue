---
title: Develop & Build
description: Develop a Flue application locally, build and run it, and continue to deployment.
lastReviewedAt: 2026-05-30
---

Use the Flue CLI to develop your application locally and build it for the environment where it will run. You can also invoke a finite workflow directly when it should run as a one-shot job.

This guide covers that lifecycle. For source files and discovery conventions, see [Project Layout](/docs/guide/project-layout/). For the routes your application exposes, see [Routing](/docs/guide/routing/).

## Develop

`flue dev` is the local development server for a Flue application. It builds the discovered agents, workflows, and optional `app.ts`, serves the application locally, and rebuilds as source files change.

After selecting your normal runtime target in `flue.config.ts`, start the development server:

```bash
pnpm exec flue dev
```

Use development mode to exercise the same routes and transports that callers will use. Agents and workflows are not public merely because they are built; see [Routing](/docs/guide/routing/) to expose them or add application-owned routes such as webhooks.

Keep local credentials and platform values in environment configuration rather than agent source. See [Configuration](/docs/reference/configuration/) to choose a runtime target, pass a one-time CLI override, or provide local environment values.

## Build

`flue build` creates the generated application output that you hand to a deployment environment. Run it before deployment to catch build-time errors and confirm that Flue discovers the agents and workflows you intend to include:

```bash
pnpm exec flue build
```

The build uses that configured target, or a one-time `--target` override, to produce deployable output in `dist/` by default. See [Configuration](/docs/reference/configuration/) to change the output directory.

A build packages the application for its runtime environment. It does not choose a model, add provider credentials, expose additional routes, or configure platform-owned bindings. Keep those concerns in your authored application modules, secrets configuration, and deployment-platform configuration.

## Run

Most Flue applications run as a server or Worker. Once running, callers reach agents, workflows, and application-owned ingress through the routes your application publishes. See [Routing](/docs/guide/routing/) for public application surfaces and [Workflows](/docs/guide/workflows/) for workflow invocation and run inspection.

A finite workflow can instead run directly as a one-shot Node job, without an HTTP route:

```bash
pnpm exec flue run summarize-ticket --payload '{"ticket":"Ticket details"}'
```

`flue run` builds and invokes one discovered workflow, which makes it appropriate for scripts and CI jobs. See the [`flue run` CLI reference](/docs/cli/run/) for command options.

## Deploy

Once the application builds and runs in the form you need, follow the [deployment ecosystem guides](/docs/ecosystem/) for your destination, including [Node.js](/docs/ecosystem/deploy/node/), [Cloudflare](/docs/ecosystem/deploy/cloudflare/), managed hosting, and CI workflow execution.

Treat deployment as more than uploading build output: provide secrets and platform bindings, verify application-owned routes such as health checks and webhook ingress, and test any state or workspace behavior that must survive beyond one local process. See [Agents](/docs/guide/building-agents/) and the [Data Persistence API](/docs/api/data-persistence-api/) for session continuity, [Sandboxes](/docs/guide/sandboxes/) for workspace behavior, and [Observability](/docs/guide/observability/) for operating an application after deployment.
