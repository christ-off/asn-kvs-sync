# asn-kvs-sync

Weekly AWS SAM job (Node 22 Lambda, Monday 04:00 UTC) that syncs the full ASN → category list from [`ipverse/as-metadata`](https://github.com/ipverse/as-metadata) (`as.json`, CC0) into a CloudFront KeyValueStore read by [`cloudfront-function-filter-traffic`](../cloudfront-function-filter-traffic/).

Only the ASNs the filter allows are stored (`isp` and `education_research`, ~34.4k keys): each key is an ASN (`3215`), each value its category. A missing key means the function blocks. The store is fully managed by the sync (keys not in the source are deleted).

See `../ASN blocking — consolidated plan.md` for the plan and `CLAUDE.md` for the design.

## Build and deploy

```bash
npm install
npm test
sam build
sam deploy --no-execute-changeset   # review the changeset first
sam deploy
```

## Run it manually

The first run loads about 34.4k keys in ~690 batches of 50 (about 5–8 min): use `--cli-read-timeout 0`.

```bash
STACK=asn-kvs-sync
FUNCTION=$(sam list stack-outputs --stack-name $STACK --region eu-west-3 --output json | jq -r '.[] | select(.OutputKey=="FunctionName") | .OutputValue')

aws lambda invoke \
  --region eu-west-3 \
  --cli-read-timeout 0 \
  --function-name "$FUNCTION" \
  /tmp/asn-kvs-sync-out.json && cat /tmp/asn-kvs-sync-out.json
```

The result is the summary `{ source, store, added, changed, removed, batches }`. A second run right after should report `added`, `changed` and `removed` all at 0. If the run fails (download error, or the guardrail aborting because the source has fewer than 90% of the store's keys), nothing is written and the previous content stays.

Follow the logs:

```bash
aws logs tail "/aws/lambda/$FUNCTION" --region eu-west-3 --since 15m --follow
```

## Check the store

```bash
KVS=$(sam list stack-outputs --stack-name $STACK --region eu-west-3 --output json | jq -r '.[] | select(.OutputKey=="KeyValueStoreArn") | .OutputValue')

aws cloudfront-keyvaluestore describe-key-value-store --kvs-arn "$KVS"   # ItemCount ≈ 34.4k, size ≈ 0.5 MB (limit 5 MB)
aws cloudfront-keyvaluestore get-key --kvs-arn "$KVS" --key 3215    # isp
aws cloudfront-keyvaluestore get-key --kvs-arn "$KVS" --key 24940   # ResourceNotFound: hosting is not stored (= blocked)
```
