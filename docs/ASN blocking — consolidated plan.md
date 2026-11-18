# ASN blocking — consolidated plan

Condensed from the guidance document, the organization proposal and the status document (state as of Nov 12, 2026; sections 1–3 updated Nov 17). Those three stay as the detailed record; this one is the working plan.

## 1. Goal and approach

Block scrapers from hosting/datacenter ASNs on the static blog (S3 + CloudFront), without hurting real readers or useful crawlers.

> **Revision Nov 16, 2026 — scope of the ASN job.** `blog-analytics` keeps its single purpose (daily analytics). The ASN job lives in its own SAM project (`asn-kvs-sync`, own stack, KVS owned by it) and its role is to **populate a CloudFront KeyValueStore with the full ASN list and each ASN's category** (`isp`, `hosting`, `business`, `education_research`, `government_admin`, none). It does **not** classify observed ASNs, propose block lists or decide anything. The blocking policy (what to do per category) is deferred and lives in the function, not in the job. Phases marked *deferred* below are kept for reference only and are superseded by this revision.

**Pipeline (decided):**

1. CloudFront standard logs (v2, w3c) carry the `asn` column.
2. A weekly job in a **new, separate SAM project** (not `blog-analytics`) syncs the **allowed ASNs (categories `isp` and `education_research`)** into a CloudFront **KeyValueStore (KVS)**: from `ipverse/as-metadata` (≈34.4k ASNs, not only observed ones); a missing key means block.
3. *Deferred:* the CloudFront Function reads the category with one `kvs.get(asn)` per request and applies the policy.
4. *Deferred:* `analyze-logs` shows the effect and a page of allowlist candidates.

**KVS content and size**

- Key = ASN number (string), value = category name (`isp` or `education_research`). Only these two categories are stored: 34,419 entries ≈ 0.5 MB of key + value bytes against the 5 MB store limit. A missing key means the function blocks (apart from whitelisted ASNs in the function code).
- No manual overrides in the store: the sync owns it and deletes keys not in the source. The whitelist of other ASNs lives in the function.
- Weekly sync = diff the source list against the store and send only changes (UpdateKeys is batched, max 50 operations per call, so the first load takes ~2,300 calls at ~105–130 keys/s, i.e. 15+ minutes, more than one 900 s run; later runs write a handful).

**Policy direction (deferred, not implemented, for later phases; Nov 17 decision: the function allows only `isp` and `education_research` ASNs plus a whitelist, everything else is blocked; risk: real readers on `business` networks):** `isp` allowed by default except Chinese ISPs (by country or ASN); `hosting` blocked by default; `business` and unknown to be decided; a short **user-agent whitelist** (Mastodon, Misskey, Feedly, Feedbin, Bingbot, Qwantbot, Applebot, Miniflux, Reeder, …, matched on the name token only, verified by ASN where the bot has published ranges); **`feed.xml` always allowed**; ASN allowlist for good hosted software. Fail open if the KVS read fails.

**Rules that govern the design:**

- Fail open: if the KVS read fails, let the request through.
- The allowlist wins over any category.
- Hosting-only verification by hand still applies to any ASN added to a manual block list (`AGENTS.md` of the function project).

**Decisions made:**

| Topic | Decision |
|---|---|
| Where the job lives | New SAM project, own stack and repo (`asn-kvs-sync`, created Nov 17); `blog-analytics` stays analytics-only. Rationale: external-list input unrelated to logs, deploy blast radius, KVS tied to the CloudFront Function, possible SigV4a dependency |
| Job responsibilities | `blog-analytics`: daily analytics only. `asn-kvs-sync`: weekly full ASN → category sync to the KVS. No classification, no proposals |
| Tooling | SAM / CloudFormation; the distribution itself is not imported |
| Blocking mechanism | KVS read by the existing function; WAF stays a fallback |
| Category source | `ipverse/as-metadata` `as.json` (live fetch; `quantcdn/asn-info` is a stale fork, see Phase K) |
| Policy and rollout | Deferred (see policy direction above) |

**Why a KVS:** `function.js` is ~8 KB against a hard 10 KB limit and `blockedAsnRegex` already holds ~60 ASNs. KVS limits: 5 MB, key ≤ 512 B, value ≤ 1 KB; 2M reads/month free, then $0.03/M. The function needs the `CloudFront-Viewer-ASN` header via an origin request policy (not the cache policy, so no effect on cache hits).

## 2. Current state

**Done**

- `asn` added to the log delivery (35 fields, verified in new files from Nov 11, 22:00 UTC). The delivery is in the `cloudfront-logging` stack (`us-east-1`, `infra/cloudfront-logging.yaml`); change logging only through that template.
- Logs bucket and policy in the `logs-bucket` stack (`eu-west-3`), retention 90 days (`LogRetentionDays`, pass it explicitly on deploy).
- `blog-analytics` still works with the extra column (manual invoke OK).
- No pre-April log objects remain, so the old-format concern is moot.
- `analyze-logs`: ASN column (Liquibase `025-add-asn`), `/asn` page with top ASN chart, `asn_info` names table. `asn_info.category` is still empty.
- First classification pass on ~20 h of data (1,952 requests, 196 ASNs); scripts removed Nov 17 (still in `blog-analytics` git history, commit `4e12a37`).

- Nov 17: `blog-analytics` rolled back to a single function (stack `daily-statistics`, redeployed). New project `asn-kvs-sync` (repo, stack in `eu-west-3`, KVS, weekly sync Lambda with its own role) deployed; first load of the KVS in progress (see Phase K).

**Done Nov 18:** the function change (reads the KVS, see the policy section below; implemented in `function.js`, tests updated, deploy workflow associates the KVS; live since Nov 18, run `44364157396`). **Not started:** the effect measurement.

**First-pass findings (too short to conclude, validates the method)**

- Sources: quantcdn (`metadata.category`) is the best signal; brianhama is a strict subset of it; X4BNet is IP ranges, so match on IP not ASN; PeeringDB is noisy, so use it as a veto against calling an ISP hosting, not as a positive signal.
- Block candidates: 138915 (Kaopu), 48090 (TECHOFF), 24940/16276/14061/212238 (Hetzner, OVH, DigitalOcean, Datacamp), 136907/55990/45090/132203 (Huawei, Tencent), 50300 (CustodianDC, check by hand).
- Never auto-block: allowlisted crawlers (714, 199064, 8075, 15169, 60653), Zscaler 62044, Cloudflare 13335, Hurricane Electric 6939, consumer ISPs, China Telecom/Unicom.
- 38 requests have no ASN (`-`); cause not investigated.

## 3. Implementation plan and validation

Each phase ends with a checkpoint; do not start the next until its validation passes.

**Active scope (Nov 17 revision): Phase B (new project), then Phase K (below), then the KVS creation and write permissions of Phase D. Phases A, C, E and the function part of D are deferred.**

### Phase K — Full ASN → category sync to the KVS (new)

- [x] Source chosen Nov 17: **live fetch of `ipverse/as-metadata` `as.json`** (raw GitHub, CC0). `quantcdn/asn-info` is a **stale fork** (last sync Mar 11, 2026); the upstream is `ipverse/as-metadata` (renamed from `asn-info`), updated daily. The CSV has no category, only `as.json` (~70 MB, 125,986 ASNs; categories: business 62,777, isp 27,349, hosting 11,979, education_research 7,070, government_admin 6,049, none 10,762). Store only ASNs with a category, with the category name as value (~1.5 MB of the 5 MB KVS limit). Fall back to the previous KVS content if the download fails. The 70 MB parse needs more Lambda memory than the current 512 MB (raise it, or stream-parse).
- [x] Schedule: **weekly** (Monday 04:00 UTC) instead of daily. The source changes daily but categories move slowly and the diff keeps writes near zero; monthly would also be acceptable for this blog.
- [x] Define the stored values (Nov 17: readable category names; only `isp` and `education_research` are stored, see the design-flaw item below; the `!` override convention was dropped) (so the sync never erases manual overrides).
- [x] Create the KVS in the SAM template; grant the ASN job write access only to this store (Nov 17: in `asn-kvs-sync/template.yaml`; `sam deploy --no-execute-changeset` in `eu-west-3` produced a valid changeset with the KVS, so the region works; deployed Nov 17: stack `asn-kvs-sync`, KVS `ac7b5fea-8939-43ff-9001-e6a8c626aa28`, READY, 0 items).
- [x] Implement the sync: list store keys, diff, apply in batches of ≤ 50 (and the payload limit), idempotent and re-runnable. (Nov 17, `asn-kvs-sync/src`; SigV4a solved with pure-JS `@aws-sdk/signature-v4a`, no CRT; dry run against real source and store: 115,224 entries, 2,305 batches, ~576 MB RSS; Lambda set to 2048 MB / 900 s. Not yet run against the real store.)
- [x] Deploy and first load (Nov 17): the first Lambda run failed at init (`Dynamic require of "node:https"`: ESM bundle needs a `createRequire` banner; fixed, nothing written). The next run timed out at 900 s with 102,450 of 115,224 keys written (89%, ~105–130 keys/s, 517 MB used); partial state is valid and the next run resumes. A further run to finish the load and measure the list phase is in progress.
- [x] **Design flaw found Nov 17 and resolved: listing the store was too slow.** The second run (store at 102,450 keys) timed out at 900 s during `ListKeys` and wrote nothing. Measured: `ListKeys` returns 10 items per call by default (max 50), ~315–445 ms per call, so a full list of 102k keys takes ~54 min at the default and ~15 min at 50 per call. **Decision Nov 17: the function will allow only ISPs (plus education_research, plus a whitelist of other ASNs in the function code), so the store holds only `isp` and `education_research` ASNs (≈34.4k keys, ≈0.5 MB); a missing key means block.** At that size listing takes ~6 min (at 50 per page, now set) and the first load ~5–8 min, so no snapshot or time-boxing is needed. The `!` override convention is dropped (the sync owns the whole store). The old KVS (102k keys) is replaced by a new one (`asn-allowed-categories`) via the template, since its ARN is not used anywhere yet. If the stored categories are ever widened, redo the sizing first.
- [x] Guardrails: abort without writing if the source has far fewer entries than the store (e.g. < 90%) or is empty; log counts of added/changed/removed.
- [x] **First load done Nov 17** into the new store `asn-allowed-categories` (`d5861644-d5f6-4a15-bcb3-1fc0635eef7e`): one run, 302 s, 515 MB, `{source: 34419, added: 34419, batches: 689}`; store 34,419 keys, 398,507 bytes. Spot-check: 3215 = `isp`; 24940 (hosting) and 60653 (business) not found, as intended. Note: replacing the KVS needed `sam deploy --no-disable-rollback` (`disable_rollback = true` in `samconfig.toml` rejects replacement updates; set to `false` afterwards, so a plain `sam deploy` works).
- [x] Second run (Nov 17): `{source: 34419, store: 34419, added: 0, changed: 0, removed: 0, batches: 0}`, **250 s** (almost all of it listing the store), 565 MB; store unchanged (34,419 keys). Margin to the 900 s timeout: 3.6x.
- [x] Schedule it via EventBridge: weekly (see above).

**Validation:**

- Unit tests: diff computation, batching, guardrail abort, overrides preserved.
- First load into the real store completes ; `describe-key-value-store` shows ≈34.4k keys and ≈0.5 MB.
- Spot-check by `get-key`: an ISP ASN (3215) is present; a hosting ASN (24940), a business ASN (60653) and an unknown ASN are not found.
- Second run the next week writes only the changes (near-zero in the normal case).
- IAM check: the sync role cannot write to the website bucket; the analytics role cannot write to the KVS. **Done Nov 17** (`aws iam simulate-principal-policy`): sync role: `s3:PutObject`/`s3:GetObject` on the website bucket, `s3:GetObject` on the logs bucket and `cloudfront:CreateInvalidation` are all implicitDeny; KVS List/Update/Put/Delete/Describe are allowed on the new store only. Analytics role: KVS `UpdateKeys`/`PutKey`/`DeleteKey` implicitDeny, `s3:PutObject` on the website bucket allowed.

### Phase A — Finish the offline classification (step 3) — *deferred*

- [ ] Wait for several full days of logs with `asn` (at least 5–7 days, covering a weekend).
- [ ] Re-run the ASN exploration on the full sample (scripts removed; recover from `blog-analytics` commit `4e12a37` if needed).
- [ ] Per candidate ASN, check hosting-only: user agents, client IPs, human-traffic share (the `analyze-logs` ASN detail page below helps).
- [ ] Investigate the requests with ASN `-` (IPv6 / unmapped?).
- [ ] Fill `asn_info.category` and add the ASN detail page in `analyze-logs`.

**Validation:**

- Every candidate satisfies the rule (a source says hosting, none says ISP) and has a written hosting-only note.
- No candidate appears in the allowlist or carries meaningful human traffic.
- A repeat-scanner is distinguishable from a one-time visit over the multi-day window.
- Output: a reviewed candidate list that becomes the reference test fixture for Phase C.

### Phase B — Create the ASN SAM project (step 4)

> Nov 17: the in-repo split of `blog-analytics` (commit `35dc62c`) was reverted (`87ca77c`); `blog-analytics` is back to a single function and needs a redeploy to drop `AsnJobFunction`.

- [x] Redeploy `blog-analytics` (stack `daily-statistics`) after the revert (Nov 17: `AnalyticsFunction` updated in place; `AsnJobFunction`, its role and log group deleted; nothing else changed).
- [x] Create the new SAM project `asn-kvs-sync` (repo created and checked out Nov 17; `CLAUDE.md`, SAM template with KVS + function + own role + 04:00 UTC schedule, sync handler and Vitest; deployed Nov 17): own repo, stack, schedule and IAM role (KVS write only, no website-bucket or log rights); no shared code with `blog-analytics`.
- [x] Leave the `daily-statistics` stack untouched (only the redeploy after the revert).

**Validation:**

- `blog-analytics`: `npm test` passes; the redeploy changeset showed only the removal of `AsnJobFunction`, its role and log group.
- `asn-kvs-sync`: `sam deploy --no-execute-changeset` showed only additions (no impact on `daily-statistics`).
- IAM check (planned, Phase K validation): the ASN role cannot write to the website bucket.

### Phase C — ASN job in dry-run mode (step 5) — *deferred, superseded by Phase K and the policy in the function*

- [ ] Implement classification (quantcdn, brianhama, PeeringDB veto, X4BNet by IP) in `src/asn-job/`.
- [ ] Apply the block rule and the allowlist; also consume the static `blockedAsnRegex` so already-blocked ASNs are not proposed again.
- [ ] Write the proposed list to S3 (separate prefix, not the website bucket's public content), with per-ASN evidence (counts, sources, reasons).
- [ ] Schedule it daily via EventBridge; no KVS access yet.

**Validation:**

- Unit tests with the Phase A fixture: allowlisted ASNs never appear; an ISP-flagged ASN never appears; known candidates do.
- Run against real logs for several days; a human reviews each proposed list and flags false positives. Target: zero false positives in the reviewed window.
- Confirm the output is not publicly readable.

### Phase D — KVS and function (step 6) — *KVS creation and write path are active (see Phase K); the function change is done and live since Nov 18*

- [x] Verify whether Node KVS writes need `@aws-sdk/signature-v4-crt` (SigV4a). If yes, accept the end of "no production dependencies" or isolate it in the ASN function only. (Nov 17: pure-JS `@aws-sdk/signature-v4a` works, no CRT.)
- [x] Create the KVS in the SAM template; expose its ARN. (Nov 17: output `KeyValueStoreArn`.)
- [x] Add the origin request policy with `CloudFront-Viewer-ASN` on the behaviour (manual change to the existing distribution; record it in the docs). (Verified Nov 18: custom policy `Viewer-ASN` is attached to the only behaviour; setup steps are in the function README, `asn-header-setup`.)
- [x] Decide the merge rules: allowlist wins over everything; manual regex and KVS list are both block layers; document the order in the function README (keep `// rationale: README.md#anchor` comments in sync). (Nov 18: see the function policy section below; the function README has the order.)
- [x] Decide the response code for KVS matches (the function returns 404 today; the guidance says 403). (Nov 18: plain `404` everywhere.)
- [x] Update `function.js` within ES5.1 + the CloudFront allowlist (no `?.`, `??`, destructuring, `Map`/`Set`, …) and under 10 KB; fail open on KVS errors. (Nov 18: 7.4 KB, 52 tests.)
- [x] Pass the KVS ARN to the project's GitHub Action and associate it with the function. (Nov 18: secret `CLOUDFRONT_KVS_ARN`, `KeyValueStoreAssociations` in `deploy.yml`; deployed, live function has the association.)
- [x] ~~Release 1, log-only mode~~ skipped: a viewer-request function cannot write logs and CloudFront standard logs do not carry a custom request header, so there is no way to observe would-be blocks. Instead: `aws cloudfront test-function` on the DEVELOPMENT stage (16/16 cases OK, Nov 18), then enforced directly (Nov 18, run `44364157396`).

**Validation:**

- Vitest covers: allowlisted ASN passes, KVS hit blocks, KVS miss passes, KVS error fails open, manual regex still works.
- Size check on `function.js` (< 10 KB) and a CloudFront `test-function` run with sample events before publishing.
- KVS write test with 1–2 harmless keys, then read back via `cloudfront-keyvaluestore describe/get-key`.
- Log-only phase: for several days, compare would-be blocks with the reviewed list; no allowlisted crawler or known reader affected (check Googlebot/Bingbot verification by UA + reverse DNS).
- After enforcing: watch `analyze-logs` for blocked requests turning into Filtered/Error; roll back by removing the keys (or setting the function back to the previous version).

### Phase E — Measure and iterate (step 7) — *deferred*

- [ ] Before/after comparison for a blocked ASN (e.g. AS138915): its traffic becomes Filtered/Error in `analyze-logs`.
- [ ] Review weekly for the first month; add expiry (`lastSeen`, ~30 days) and consider behaviour scoring (D) once the list-based approach is stable.
- [ ] Switch from reviewed proposals to automatic writes only after a clean period and with a safety cap (e.g. max N new ASNs per day, alert above it).

**Validation:**

- Request volume from blocked ASNs drops to ~0 as hits; no rise in complaints or in blocked human traffic (human-traffic share per ASN).
- Search-engine crawls continue (Googlebot/Bingbot requests unchanged).

### Housekeeping

- [x] Push the unpushed commits in `blog-analytics` and `analyze-logs`. (Nov 18, with the RTK removal.)
- [ ] Decide where the workspace-level documents live: their own repo in `blog-filtering/`, or only these files in the parent repo `/Users/christophe/Workspaces`. Then commit them (including this file).
- [x] Update the workspace `CLAUDE.md` (logs now contain the ASN; the function now reads the KVS, Nov 18).
- [ ] Optionally record the origin request policy and distribution changes somewhere, since the distribution is outside IaC.

### Function policy — decided Nov 18, 2026 (replaces the "deferred" policy direction in section 1)

Order of checks in `function.js` (diagram and rules in `cloudfront-function-filter-traffic/README.md`, section "What the function does"): cheap URI/UA checks first, then pass-through steps that skip the lookup, then the ASN blocklist, then a single `kvs.exists(asn)` as the last step.

1. No user agent, undecodable URI → `404`.
2. Security scan (traversal, dotfile, php/wp/env URIs, bad Chrome UA) → `404`.
3. Bad-UA regex (`blockedBotRegex`) → `404`.
4. `.json`/`.js` not allowlisted, cover without referer → `404` (before any "pass", so whitelisted ASNs cannot bypass them).
5. ASN in the function whitelist → pass. Hosted-software / feed-reader UA whitelist → pass.
6. ASN in the function blocklist (`blockedAsnRegex` kept) → `404`.
7. No ASN header → pass (fail open).
8. KV: key present → pass; missing → `404`; KV error → pass (fail open).

**Google is excluded on purpose:** blocking Google (indexing, FeedFetcher, image fetcher) is a voluntary decision to exclude Google tools. Googlebot-family UAs stay in `blockedBotRegex` and AS15169 goes on the function's ASN blocklist. This supersedes the "never block verified Googlebot/Bingbot ASNs" risk note in section 4 as far as Google is concerned (Bingbot is still allowed).

Simplifications decided the same day:

- Remove the `/backup.zip` allowlist and the fake responses (deny-all `robots.txt`, empty Atom feed). Every block is a plain `404`.
- Feeds (`/feed.xml`, `/rss.xml`) are ordinary requests: no ASN exemption, no `feedfetcher-google` exception. Feed readers hosted outside the KV rely on the UA whitelist; the analysis of `logs.db` (Nov 11–18) and the token list are in the function README ("Feed readers under the new sequence").
- Bad-UA regex kept: it saves KV reads and catches scrapers on ISP ASNs. Size is not an issue: `function.js` ends around 8 KB of 10 KB. If it ever is, the bad-UA step is the one to drop.

Implementation checklist (Phase D; all done and live Nov 18; remaining: watch `analyze-logs` for blocked real readers, which is Phase E): (KV categories of the feed-reader ASNs checked Nov 18: see the function README) ASN whitelist decided Nov 18: 60653 (Feedly, used only by Feedly, KV category `business`), 199064 (Qwant), 714 (Apple); 8075 is not whitelisted; 15169 (Google) is added to the function's ASN blocklist; implement in `function.js` (ES5.1 + allowlist, `async` handler, `exists` in `try/catch`); update tests (mock the `cloudfront` module) and the README anchors; associate the KVS with the function in the GitHub Action; add the `CloudFront-Viewer-ASN` origin request policy if missing; release 1 log-only, release 2 enforce.

## 4. Open points and risks

| Item | Status |
|---|---|
| WAF ASN-match: max ASNs per rule, Free-plan eligibility | Unverified; only matters if falling back to option B |
| KVS write needs SigV4a dependency? | Resolved Nov 17: yes; pure-JS `@aws-sdk/signature-v4a` works from Node, no CRT |
| KVS bulk-write mechanics (UpdateKeys 50 ops per call and payload limit; import-from-S3 only at store creation?; update rate limits) | Partly resolved Nov 17: 50 ops per `UpdateKeys` with chained ETags works; throughput ~105–130 keys/s, so the first load needs more than one 900 s run; rate limits not hit |
| ASN category source: licence, update cadence, behaviour when the download fails | Resolved Nov 17: `ipverse/as-metadata`, CC0, updated daily; a failed download aborts before any write |
| Policy per category (`business`, unknown, browsers on hosting, Chinese ISPs), UA whitelist, `feed.xml` exemption | Deferred; direction recorded in section 1 |
| Merge rules (manual regex / allowlist / KVS) | Resolved Nov 18: whitelist and hosted-software UA first, then manual blocklist, then KVS (missing = block); see the function policy section |
| Response code for KVS matches | Resolved Nov 18: `404` |
| Requests with no ASN | Function fails open (Nov 18); cause still not investigated (Phase A) |
| Sample size | One day cannot tell scanners from one-time visits (Phase A) |

**Risks to keep in mind**

- *False positives:* iCloud Private Relay (Akamai/Cloudflare ASNs) and corporate VPNs (Zscaler) are real readers. Consider a 403/404 page with a contact link rather than silent rejection.
- *Search ranking:* Google is excluded on purpose (Nov 18 decision: Googlebot, FeedFetcher, image fetcher and AS15169 are blocked, so the blog is not indexed by Google). Bingbot stays allowed by UA token (`bingbot/`); AS8075 (Microsoft) is blocklisted and never whitelisted by ASN because it hosts other tools we do not want.
- *Silent drift:* the distribution is not in IaC, so log fields and policies can change outside the templates; keep the drift checks (`IN_SYNC`) on the two stacks.
- *Cost:* expected ≈ $0 (KVS reads within the free tier, few KVS writes batched weekly).

## 5. Reference

- Distribution `E1Z5N5X273TPT1`; SAM stack `daily-statistics` in `eu-west-3`; the CloudWatch Logs delivery API lives in `us-east-1` (delivery `8T56FbbIZZfqU6sj`).
- Logs bucket `post-tenebras-lire-access-logs`, prefix `AWSLogs/<account>/CloudFront/`, w3c format, 90-day retention.
- Classification sources: [X4BNet/lists_vpn](https://github.com/X4BNet/lists_vpn), [brianhama/bad-asn-list](https://github.com/brianhama/bad-asn-list), [PeeringDB](https://docs.peeringdb.com/blog/network_type_what_why_how/), [quantcdn/asn-info](https://gh.r-mj.com/quantcdn/asn-info).
- AWS: [CloudFront headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-cloudfront-headers.html), [KeyValueStore](https://aws.amazon.com/blogs/aws/introducing-amazon-cloudfront-keyvaluestore-a-low-latency-datastore-for-cloudfront-functions), [WAF ASN match](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-asn-match.html), [flat-rate plans](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html).

## 6. ASN to always block

Some ASN are described as ISP. But the incoming traffic prooves that they are an hosting platform
They should be always blocked

AS4134 	China Telecom 	isp 	
AS4837 	CHINA UNICOM China169 Backbone 	isp 	

AS396982 - Google LLC - hosting
AS15169 - Google LLC - hosting