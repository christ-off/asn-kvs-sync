# asn-kvs-sync

Daily AWS SAM job (Node 22 Lambda) that syncs the full ASN → category list into a CloudFront KeyValueStore read by [`cloudfront-function-filter-traffic`](../cloudfront-function-filter-traffic/).

**Status: scaffold only.** The stack (KeyValueStore, function, role, 04:00 UTC schedule) is defined, the handler is a placeholder. See `../ASN blocking — consolidated plan.md`.

```bash
npm install
npm test
sam build
sam deploy --no-execute-changeset   # review first
```
