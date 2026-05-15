import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { JsonRpcProvider, Wallet, formatEther, parseEther } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const DEFAULT_RPC = "https://evmrpc-testnet.0g.ai";
const DEFAULT_QUERY = "Reply with one short sentence about TyrPay.";
const DEFAULT_PROVIDER_ADDRESS = "0x69Eb5a0BD7d0f4bF39eD5CE9Bd3376c61863aE08";
const DEFAULT_PATH = "/chat/completions";

const mode = process.argv[2] ?? "inspect";

main().catch((error) => {
  console.error("[0g-teetls-lab] failed");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});

async function main() {
  if (mode === "inspect") {
    await inspectSdkSurface();
    return;
  }

  if (mode === "live") {
    await inspectSdkSurface();
    await runLiveExperiment();
    return;
  }

  throw new Error(`Unsupported mode "${mode}". Use "inspect" or "live".`);
}

async function inspectSdkSurface() {
  const module = await import("@0gfoundation/0g-compute-ts-sdk");
  const provider = Object.create(null);
  const response = Object.create(null);
  const broker = Object.create(null);

  provider.package = "@0gfoundation/0g-compute-ts-sdk";
  provider.hasCreateBroker = typeof module.createZGComputeNetworkBroker === "function";
  provider.exportNames = Object.keys(module).sort();
  provider.defaultProviderAddress = DEFAULT_PROVIDER_ADDRESS;

  broker.getServiceMetadata = "providerAddress -> { endpoint, model }";
  broker.getRequestHeaders = "providerAddress, content? -> ServingRequestHeaders";
  broker.processResponse = "providerAddress, chatId?, content? -> boolean | null";

  response.expectedChatIdSources = [
    "response.headers['zg-res-key']",
    "response.body.id",
    "response.body.chatID"
  ];
  response.expectedUsageSources = [
    "response.body.usage",
    "response.body.x_groq?.usage",
    "custom provider-specific body path"
  ];
  response.expectedContentSources = [
    "response.body.choices[0].message.content",
    "response.body.choices[0].delta.content",
    "provider-specific response text field"
  ];

  console.log(JSON.stringify({
    mode: "inspect",
    sdk: provider,
    teeTlsFlow: broker,
    extractionHints: response
  }, null, 2));
}

async function runLiveExperiment() {
  const rpcUrl = process.env.ZERO_G_EVM_RPC?.trim() || DEFAULT_RPC;
  const privateKey = firstDefined(
    process.env.ZERO_G_COMPUTE_PRIVATE_KEY,
    process.env.BUYER_PRIVATE_KEY,
    process.env.SELLER_PRIVATE_KEY
  );
  const providerAddress = process.env.ZERO_G_PROVIDER_ADDRESS?.trim() || DEFAULT_PROVIDER_ADDRESS;
  const query = process.env.ZERO_G_QUERY?.trim() || DEFAULT_QUERY;
  const requestPath = process.env.ZERO_G_OPENAI_PATH?.trim() || DEFAULT_PATH;
  const shouldBootstrapLedger = process.env.ZERO_G_BOOTSTRAP_LEDGER === "1";
  const shouldAcknowledgeProvider = process.env.ZERO_G_ACK_PROVIDER === "1";
  const providerTransferAmountOg = process.env.ZERO_G_TRANSFER_PROVIDER_OG?.trim() || null;

  if (!privateKey) {
    throw new Error("Missing ZERO_G_COMPUTE_PRIVATE_KEY, BUYER_PRIVATE_KEY, or SELLER_PRIVATE_KEY.");
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(normalizePrivateKey(privateKey), provider);
  const broker = await createZGComputeNetworkBroker(wallet);
  const network = await provider.getNetwork();
  const walletBalance = await provider.getBalance(wallet.address);
  const serviceMetadata = await broker.inference.getServiceMetadata(providerAddress);
  const endpoint = joinOpenAiPath(serviceMetadata.endpoint, requestPath);

  const ledgerState = await tryGetLedgerState(broker);
  if (shouldBootstrapLedger && !ledgerState.exists) {
    await broker.ledger.addLedger(3);
  }

  if (shouldAcknowledgeProvider) {
    await broker.inference.acknowledgeProviderSigner(providerAddress);
  }

  if (providerTransferAmountOg) {
    await broker.ledger.transferFund(
      providerAddress,
      "inference",
      parseEther(providerTransferAmountOg)
    );
  }

  const signerStatus = await tryCall(() => broker.inference.checkProviderSignerStatus(providerAddress));
  const headersResult = await tryCall(() => broker.inference.getRequestHeaders(providerAddress, query));

  let liveResponse = null;
  if (headersResult.ok) {
    const payload = {
      model: serviceMetadata.model,
      messages: [{ role: "user", content: query }]
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headersResult.value
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    const responseBody = parseJson(responseText);
    const usage = extractUsage(responseBody);
    const content = extractContent(responseBody);
    const responseModel = extractModel(responseBody);
    const chatId = extractChatId(response, responseBody);
    const processResponseResult = chatId
      ? await tryCall(() => broker.inference.processResponse(providerAddress, chatId, content ?? undefined))
      : { ok: true, value: null };

    liveResponse = {
      status: response.status,
      ok: response.ok,
      headerChatId: response.headers.get("zg-res-key"),
      chatId,
      modelFromResponse: responseModel,
      usage,
      contentPreview: content ? content.slice(0, 200) : null,
      processResponseResult: processResponseResult.ok ? processResponseResult.value : null,
      processResponseError: processResponseResult.ok ? null : processResponseResult.error,
      rawBody: responseBody ?? responseText
    };
  }

  const summary = {
    mode: "live",
    request: {
      providerAddress,
      query,
      endpoint,
      modelFromMetadata: serviceMetadata.model,
      authHeaderPresent: headersResult.ok
        ? typeof headersResult.value.Authorization === "string" && headersResult.value.Authorization.length > 0
        : false,
      requestHeaderKeys: headersResult.ok ? Object.keys(headersResult.value).sort() : [],
      requestHeadersError: headersResult.ok ? null : headersResult.error
    },
    wallet: {
      address: wallet.address,
      chainId: network.chainId.toString(),
      balanceOg: formatEther(walletBalance)
    },
    ledger: {
      exists: ledgerState.exists,
      info: ledgerState.info,
      error: ledgerState.error,
      bootstrapAttempted: shouldBootstrapLedger,
      providerTransferAmountOg
    },
    tee: {
      signerAcknowledged: signerStatus.ok ? signerStatus.value.isAcknowledged : null,
      teeSignerAddress: signerStatus.ok ? signerStatus.value.teeSignerAddress : null,
      signerStatusError: signerStatus.ok ? null : signerStatus.error,
      acknowledgeAttempted: shouldAcknowledgeProvider
    },
    response: liveResponse,
    verdict: {
      endpointAvailable: typeof serviceMetadata.endpoint === "string" && serviceMetadata.endpoint.length > 0,
      modelAvailable: typeof serviceMetadata.model === "string" && serviceMetadata.model.length > 0,
      usageAvailable: liveResponse?.usage !== null && liveResponse?.usage !== undefined
    },
    notes: [
      "0G metadata is readable without a successful billed request.",
      "usage depends on the provider's OpenAI-compatible response body.",
      "processResponse depends on obtaining a chatId and passing 0G billing preconditions."
    ]
  };

  console.log(JSON.stringify(summary, null, 2));
}

async function tryGetLedgerState(broker) {
  try {
    const ledger = await broker.ledger.getLedger();
    return {
      exists: true,
      info: serializeBigInts(ledger),
      error: null
    };
  } catch (error) {
    return {
      exists: false,
      info: null,
      error: toErrorMessage(error)
    };
  }
}

async function tryCall(fn) {
  try {
    return {
      ok: true,
      value: await fn()
    };
  } catch (error) {
    return {
      ok: false,
      error: toErrorMessage(error)
    };
  }
}

function extractUsage(body) {
  if (!body || typeof body !== "object") {
    return null;
  }

  if (isPlainObject(body.usage)) {
    return body.usage;
  }

  if (isPlainObject(body.x_groq) && isPlainObject(body.x_groq.usage)) {
    return body.x_groq.usage;
  }

  return null;
}

function extractModel(body) {
  if (!body || typeof body !== "object") {
    return null;
  }

  return typeof body.model === "string" ? body.model : null;
}

function extractChatId(response, body) {
  const headerChatId = response.headers.get("zg-res-key");
  if (headerChatId) {
    return headerChatId;
  }

  if (body && typeof body === "object") {
    if (typeof body.id === "string" && body.id.length > 0) {
      return body.id;
    }

    if (typeof body.chatID === "string" && body.chatID.length > 0) {
      return body.chatID;
    }
  }

  return null;
}

function extractContent(body) {
  if (!body || typeof body !== "object") {
    return null;
  }

  if (Array.isArray(body.choices) && body.choices.length > 0) {
    const first = body.choices[0];
    if (isPlainObject(first?.message)) {
      return normalizeContentValue(first.message.content);
    }
    if (isPlainObject(first?.delta)) {
      return normalizeContentValue(first.delta.content);
    }
  }

  if (typeof body.text === "string") {
    return body.text;
  }

  return null;
}

function normalizeContentValue(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (isPlainObject(item) && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("")
      .trim();
  }

  return null;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function joinOpenAiPath(endpoint, requestPath) {
  const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const suffix = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  return `${base}${suffix}`;
}

function firstDefined(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizePrivateKey(value) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function serializeBigInts(value) {
  return JSON.parse(JSON.stringify(value, (_key, current) => (
    typeof current === "bigint" ? current.toString() : current
  )));
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
