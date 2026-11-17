# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Planned AWS SAM application (not implemented yet): a daily Lambda that syncs the full public ASN → category list (≈121k ASNs, quantcdn `asn-info`; categories `isp`, `hosting`, `business`, `education_research`, `government_admin`, none) into a CloudFront KeyValueStore. The CloudFront Function in `../cloudfront-function-filter-traffic/` will read it with one `kvs.get(asn)` per request (deferred).

The job only populates the KVS. It does not read CloudFront logs, classify observed ASNs, propose block lists or decide any policy; the policy lives in the function.

Working plan: `../ASN blocking — consolidated plan.md` (Phases B, K and the KVS part of D are active; read it first). Do not assume anything the plan marks as not started exists.

## Boundaries

- Independent of `../blog-analytics/` (separate repo, stack, schedule, IAM role, no shared code). Do not touch the `daily-statistics` stack.
- The IAM role gets KVS write access only: no website-bucket, logs-bucket or invalidation rights.
- Keep production dependencies minimal; Node KVS writes may need `@aws-sdk/signature-v4-crt` (SigV4a), to be verified in Phase D.
- Same conventions as `blog-analytics`: Node 22, ESM, Vitest, `template.yaml`, `samconfig.toml` (region `eu-west-3` unless the KVS requires otherwise).
