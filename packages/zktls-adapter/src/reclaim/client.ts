import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

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
  ReclaimClient?: new (appId: string, appSecret: string, logs?: boolean) => ReclaimClientLike;
  default?: new (appId: string, appSecret: string, logs?: boolean) => ReclaimClientLike;
};

const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
const localRequire = createRequire(import.meta.url);
let reclaimTlsCompatibilityPromise: Promise<void> | null = null;

type ReclaimTlsModule = {
  asciiToUint8Array?: (value: string) => Uint8Array;
  crypto?: { randomBytes?: (length: number) => Uint8Array };
  setCryptoImplementation?: (implementation: object) => void;
  strToUint8Array?: (value: string) => Uint8Array;
  uint8ArrayToBinaryStr?: (value: Uint8Array) => string;
  uint8ArrayToStr?: (value: Uint8Array) => string;
};

export async function defaultReclaimClientFactory(input: ReclaimClientFactoryInput): Promise<ReclaimClientLike> {
  await ensureReclaimTlsCompatibility();
  const module = (await dynamicImport("@reclaimprotocol/zk-fetch")) as ReclaimZkFetchModule;
  const ReclaimClient = module.ReclaimClient ?? module.default;

  if (!ReclaimClient) {
    throw new TypeError("@reclaimprotocol/zk-fetch does not export ReclaimClient.");
  }

  return new ReclaimClient(input.appId, input.appSecret, input.logs);
}

export async function createReclaimClient(input: {
  appId?: string;
  appSecret?: string;
  logs?: boolean;
  clientFactory?: ReclaimClientFactory;
}): Promise<ReclaimClientLike> {
  if (input.clientFactory) {
    return input.clientFactory({
      appId: input.appId ?? "",
      appSecret: input.appSecret ?? "",
      logs: input.logs
    });
  }

  if (!input.appId || !input.appSecret) {
    throw new TypeError("ReclaimZkTlsAdapter requires appId and appSecret unless clientFactory is provided.");
  }

  return defaultReclaimClientFactory({
    appId: input.appId,
    appSecret: input.appSecret,
    logs: input.logs
  });
}

async function ensureReclaimTlsCompatibility(): Promise<void> {
  reclaimTlsCompatibilityPromise ??= (async () => {
    const zkFetchPackageJson = localRequire.resolve("@reclaimprotocol/zk-fetch/package.json");
    const zkFetchRequire = createRequire(zkFetchPackageJson);
    const packageJsonPaths = [zkFetchPackageJson, zkFetchRequire.resolve("@reclaimprotocol/attestor-core/package.json")];

    for (const packageJsonPath of packageJsonPaths) {
      await patchTlsModule(createRequire(packageJsonPath));
    }
  })();

  await reclaimTlsCompatibilityPromise;
}

async function patchTlsModule(pkgRequire: NodeRequire): Promise<void> {
  const tlsEntry = pkgRequire.resolve("@reclaimprotocol/tls");
  const loadedTlsModule = pkgRequire(tlsEntry) as ReclaimTlsModule;
  const aliasPatch: Partial<ReclaimTlsModule> = {};

  if (typeof loadedTlsModule.strToUint8Array !== "function" && typeof loadedTlsModule.asciiToUint8Array === "function") {
    aliasPatch.strToUint8Array = loadedTlsModule.asciiToUint8Array;
  }

  if (
    typeof loadedTlsModule.uint8ArrayToStr !== "function" &&
    typeof loadedTlsModule.uint8ArrayToBinaryStr === "function"
  ) {
    aliasPatch.uint8ArrayToStr = loadedTlsModule.uint8ArrayToBinaryStr;
  }

  const tlsModule =
    Object.keys(aliasPatch).length === 0
      ? loadedTlsModule
      : { ...loadedTlsModule, ...aliasPatch };

  if (tlsModule !== loadedTlsModule && pkgRequire.cache[tlsEntry]) {
    pkgRequire.cache[tlsEntry]!.exports = tlsModule;
  }

  if (typeof tlsModule.setCryptoImplementation === "function" && typeof tlsModule.crypto?.randomBytes !== "function") {
    const implementation = await loadTlsCryptoImplementation(pkgRequire);
    tlsModule.setCryptoImplementation(implementation);
  }
}

async function loadTlsCryptoImplementation(pkgRequire: NodeRequire): Promise<object> {
  try {
    const webcryptoModule = (await dynamicImport(
      pathToFileURL(pkgRequire.resolve("@reclaimprotocol/tls/webcrypto")).href
    )) as {
      webcryptoCrypto?: object;
    };
    if (webcryptoModule.webcryptoCrypto) {
      return webcryptoModule.webcryptoCrypto;
    }
  } catch {
    // Fall through to the pure JS implementation.
  }

  const pureJsModule = (await dynamicImport(
    pathToFileURL(pkgRequire.resolve("@reclaimprotocol/tls/purejs-crypto")).href
  )) as {
    pureJsCrypto?: object;
  };
  if (pureJsModule.pureJsCrypto) {
    return pureJsModule.pureJsCrypto;
  }

  throw new TypeError("Unable to initialize @reclaimprotocol/tls crypto implementation.");
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
    ...(request.body !== undefined ? { body: serializeReclaimBody(request.body, "request.body") } : {}),
    context: buildReclaimProofContextBinding(proofContext) as unknown as Record<string, unknown>,
    ...(input.useTee ? { useTee: true } : {})
  };
}

export function buildReclaimPrivateOptions(input: ReclaimProvenFetchInput): ReclaimPrivateOptions | undefined {
  if (!input.privateOptions) {
    return undefined;
  }

  return {
    ...input.privateOptions,
    ...(input.privateOptions.body !== undefined
      ? { body: serializeReclaimBody(input.privateOptions.body, "privateOptions.body") }
      : {})
  };
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

function serializeReclaimBody(value: unknown, fieldName: string): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new TypeError(`${fieldName} must be JSON-serializable for Reclaim zkFetch.`, {
      cause: error
    });
  }
}
