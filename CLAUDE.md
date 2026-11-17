# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AWS SAM application (sync implemented and unit-tested; not yet deployed or run against the real store): a weekly Lambda that syncs the full public ASN → category list (≈126k ASNs, 115k with a category, from `ipverse/as-metadata` `as.json`, CC0, formerly `asn-info`; categories `isp`, `hosting`, `business`, `education_research`, `government_admin`, none) into a CloudFront KeyValueStore. The CloudFront Function in `../cloudfront-function-filter-traffic/` will read it with one `kvs.get(asn)` per request (deferred).

The job only populates the KVS. It does not read CloudFront logs, classify observed ASNs, propose block lists or decide any policy; the policy lives in the function.

Working plan: `../ASN blocking — consolidated plan.md` (Phases B, K and the KVS part of D are active; read it first). Do not assume anything the plan marks as not started exists.

## Boundaries

- Independent of `../blog-analytics/` (separate repo, stack, schedule, IAM role, no shared code). Do not touch the `daily-statistics` stack.
- The IAM role gets KVS write access only: no website-bucket, logs-bucket or invalidation rights.
- KVS writes need SigV4a; verified Nov 17 that the pure-JS `@aws-sdk/signature-v4a` works (no CRT). `sam build` bundles with esbuild, which runs with `--omit=dev`, so `esbuild` and the KVS client are in `dependencies` (the bundle contains everything; nothing is installed at runtime).
- Same conventions as `blog-analytics`: Node 22, ESM, Vitest, `template.yaml`, `samconfig.toml` (region `eu-west-3` unless the KVS requires otherwise).

## Commands

```bash
npm test
sam validate --lint
sam build
sam deploy --no-execute-changeset   # review the changeset before deploying
```

## Sync design

- `src/source.mjs` fetches `ipverse/as-metadata` `as.json` (~70 MB) and stores the category name as the value (`isp`, `hosting`, `business`, `education_research`, `government_admin`; ~1.5 MB of the 5 MB limit). ASNs without a category are not stored; unknown new categories are logged, not stored.
- `src/diff.mjs` computes puts/deletes and the guardrail (abort if the source is empty or < 90% of the store's managed keys).
- `src/kvs.mjs` lists the store and applies changes in `UpdateKeys` batches of ≤ 50, chaining ETags (sequential). The first load is ~2,300 batches, hence `Timeout: 900` and `MemorySize: 2048`.
- **Manual overrides:** a store value starting with `!` (e.g. `!hosting`) is never updated or deleted by the sync. The CloudFront Function must strip the `!` when it reads the store (deferred function work).
- **ESM bundle needs a `require` banner** (`Banner` in `template.yaml`): the SDK's CJS code calls `require("node:https")`, which fails at init with "Dynamic require … is not supported". To check a bundle, import it from a `.mjs` file in a Node 22 container (`node -e` has a global `require` and hides the bug).
