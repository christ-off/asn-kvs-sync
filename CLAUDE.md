# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AWS SAM application: a weekly Lambda that syncs the ASNs the traffic filter allows (categories `isp` and `education_research` from `ipverse/as-metadata` `as.json`, CC0; ~34.4k keys, ~0.5 MB) into a CloudFront KeyValueStore. The CloudFront Function in `../cloudfront-function-filter-traffic/` will read it with one `kvs.get(asn)` per request (deferred): a key present means allowed, a missing key means block. Whitelisted non-ISP ASNs belong in the function code, not in the store.

The job only populates the KVS. It does not read CloudFront logs, classify observed ASNs, propose block lists or decide what to do with an ASN. The only policy it encodes is which categories are stored (the allowed ones); the allowlist of other ASNs and the response live in the function.

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

- `src/source.mjs` fetches `as.json` (~70 MB) and keeps only the ASNs whose category is in `STORED_CATEGORIES` (`isp`, `education_research`); the value is the category name. Other known categories are dropped; unknown new upstream categories are logged.
- `src/diff.mjs` computes puts/deletes and the guardrail (abort if the source is empty or < 90% of the store's managed keys).
- `src/kvs.mjs` lists the store (50 per page, the maximum; the default of 10 is 5x slower) and applies changes in `UpdateKeys` batches of ≤ 50, chaining ETags (sequential). ~110 keys/s written, ~0.45 s per list call. This only works because the store is small: a 115k-key store took more than 15 min just to list and timed out (Nov 17). Do not widen `STORED_CATEGORIES` to everything without redesigning (snapshot in S3 + time-boxed runs).
- The sync owns the whole store: any key not in the source is deleted. No manual overrides in the store.
- **ESM bundle needs a `require` banner** (`Banner` in `template.yaml`): the SDK's CJS code calls `require("node:https")`, which fails at init with "Dynamic require … is not supported". To check a bundle, import it from a `.mjs` file in a Node 22 container (`node -e` has a global `require` and hides the bug).
