import { hashObject, type Bytes32 } from "@fulfillpay/sdk-core";

import { normalizeRequestEvidence, type ProviderProofContext } from "../core/index.js";

import type {
  ReclaimClientFactory,
  ReclaimClientFactoryInput,
  ReclaimClientLike,
  ReclaimProofContextBinding,
  ReclaimPrivateOptions,
  ReclaimPublicOptions,
  ReclaimProvenFetchInput
} from "./types.js";
import { RECLAIM_ZKTLS_PROVIDER } from "./types.js";

type ReclaimZkFetchModule = {
  ReclaimClient?: new (appId: string, appSecret: string, useTee?: boolean) => ReclaimClientLike;
  default?: new (appId: string, appSecret: string, useTee?: boolean) => ReclaimClientLike;
};

const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export async function defaultReclaimClientFactory(input: ReclaimClientFactoryInput): Promise<ReclaimClientLike> {
  const module = (await dynamicImport("@reclaimprotocol/zk-fetch")) as ReclaimZkFetchModule;
  const ReclaimClient = module.ReclaimClient ?? module.default;

  if (!ReclaimClient) {
    throw new TypeError("@reclaimprotocol/zk-fetch does not export ReclaimClient.");
  }

  return new ReclaimClient(input.appId, input.appSecret, input.useTee);
}

export async function createReclaimClient(input: {
  appId?: string;
  appSecret?: string;
  useTee: boolean;
  clientFactory?: ReclaimClientFactory;
}): Promise<ReclaimClientLike> {
  if (input.clientFactory) {
    return input.clientFactory({
      appId: input.appId ?? "",
      appSecret: input.appSecret ?? "",
      useTee: input.useTee
    });
  }

  if (!input.appId || !input.appSecret) {
    throw new TypeError("ReclaimZkTlsAdapter requires appId and appSecret unless clientFactory is provided.");
  }

  return defaultReclaimClientFactory({
    appId: input.appId,
    appSecret: input.appSecret,
    useTee: input.useTee
  });
}

export function buildReclaimUrl(input: ReclaimProvenFetchInput): string {
  const request = normalizeRequestEvidence(input.request);
  return `https://${request.host}${request.path}`;
}

export function buildReclaimPublicOptions(
  input: ReclaimProvenFetchInput,
  proofContext: ProviderProofContext
): ReclaimPublicOptions {
  const request = normalizeRequestEvidence(input.request);

  return {
    method: request.method,
    ...(request.headers ? { headers: request.headers } : {}),
    ...(request.body !== undefined ? { body: request.body } : {}),
    context: JSON.stringify(buildReclaimProofContextBinding(proofContext))
  };
}

export function buildReclaimPrivateOptions(input: ReclaimProvenFetchInput): ReclaimPrivateOptions | undefined {
  return input.privateOptions;
}

export function hashReclaimProofContext(proofContext: ProviderProofContext): Bytes32 {
  return hashObject(proofContext);
}

export function buildReclaimProofContextBinding(proofContext: ProviderProofContext): ReclaimProofContextBinding {
  return {
    protocol: "FulfillPay",
    version: 1,
    provider: RECLAIM_ZKTLS_PROVIDER,
    proofContextHash: hashReclaimProofContext(proofContext),
    proofContext
  };
}
