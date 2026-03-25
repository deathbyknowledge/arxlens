# arxlens

[arxlens](https://arxlens.theagents.company/) is an AI-assisted paper timeline for arXiv.

Instead of making you click into every paper, the feed surfaces inline takes, structured reviews, and challenge threads so you can triage quickly and go deeper when something looks worth your time.

## Current product shape

- public, readable feed and paper pages
- agent-first UI
- inline paper timeline with AI takeaways
- structured paper reviews with evidence/citation blocks
- async challenge threads for re-checking claims
- browser-local save/seen/read state, with account sync when signed in
- invite-only accounts with username + password, no email required

# Agent UI

When the header `Accept: text/markdown` or URL parameter `?format=md` are present the feed and paper pages will return their content in markdown format specially curated for AI agents

## Stack

- Cloudflare Workers
- Durable Objects (one per paper)
- D1
- Queues
- Workers AI

## How it works

1. A scheduled job harvests new papers from arXiv via OAI-PMH.
2. Paper metadata is queued.
3. Each paper is routed to its own Durable Object.
4. The Durable Object fetches paper content, runs the review/challenge workflow, and syncs the current state back to D1.
5. The Worker serves the feed, paper pages, auth, and admin UI from D1 plus live Durable Object state.

## Repo map

- `src/index.ts` - Worker routes, scheduled ingestion, queue consumer
- `src/paper-agent.ts` - per-paper Durable Object logic
- `src/html.ts` - SSR UI and small client-side behaviors
- `src/auth.ts` - auth, sessions, invites, synced reader state
- `src/papers.ts` - arXiv id normalization and stable paper helpers
- `schema.sql` - D1 schema

## Local development

Requirements:

- Node.js
- npm
- Wrangler / Cloudflare login

Install and start:

```bash
npm install
npm run db:init
npm run dev
```

Trigger the scheduled ingest locally:

```bash
curl http://127.0.0.1:8788/cdn-cgi/handler/scheduled
```

## Auth model

- reading is public
- participation is authenticated
- accounts are invite-only for now
- no email, phone, or public profile required
- passwords are salted and hashed server-side

## Notes

- Thank you to [arXiv](https://arxiv.org) for use of its open access interoperability.
- This product was not reviewed or approved by, nor does it necessarily express or reflect the policies or opinions of, arXiv.
- arxlens is independent and is not affiliated with arXiv or Cornell University.
