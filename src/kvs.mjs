// Pure-JS SigV4a: the KeyValueStore data plane needs it and the Lambda runtime has no CRT.
import "@aws-sdk/signature-v4a";
import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  ListKeysCommand,
  UpdateKeysCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";
import { chunk } from "./diff.mjs";

export const MAX_OPS_PER_UPDATE = 50;

export function createClient() {
  return new CloudFrontKeyValueStoreClient({});
}

export async function listAll(client, kvsArn) {
  const items = new Map();
  let nextToken;
  do {
    const page = await client.send(new ListKeysCommand({ KvsARN: kvsArn, NextToken: nextToken }));
    for (const item of page.Items ?? []) items.set(item.Key, item.Value);
    nextToken = page.NextToken;
  } while (nextToken);
  return items;
}

/**
 * Apply puts then deletes in batches of at most 50 operations. Each update must
 * carry the ETag returned by the previous one, so the batches run sequentially.
 */
export async function applyChanges(client, kvsArn, { puts, deletes }) {
  const { ETag } = await client.send(new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }));
  let etag = ETag;
  const batches = [
    ...chunk(puts, MAX_OPS_PER_UPDATE).map((Puts) => ({ Puts })),
    ...chunk(deletes, MAX_OPS_PER_UPDATE).map((Deletes) => ({ Deletes })),
  ];
  for (const batch of batches) {
    const result = await client.send(new UpdateKeysCommand({ KvsARN: kvsArn, IfMatch: etag, ...batch }));
    etag = result.ETag;
  }
  return batches.length;
}
