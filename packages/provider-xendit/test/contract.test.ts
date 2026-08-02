import { runProviderContractTests } from "@bayar-sdk/core/testing";
import { MockXenditHttpClient } from "../__fixtures__/mock-client";
import {
	buildInvalidXenditWebhook,
	buildXenditWebhook,
	MOCK_XENDIT_CALLBACK_TOKEN,
	MOCK_XENDIT_SECRET_KEY,
} from "../__fixtures__/webhook";
import { XenditProvider } from "../src/adapter";

const secretKey = MOCK_XENDIT_SECRET_KEY;
const callbackToken = MOCK_XENDIT_CALLBACK_TOKEN;
const validWebhook = buildXenditWebhook("mock-pr-valid", "paid", callbackToken);
const invalidWebhook = buildInvalidXenditWebhook(callbackToken);

runProviderContractTests(
	() =>
		new XenditProvider({
			secretKey,
			callbackToken,
			httpClient: new MockXenditHttpClient(),
		}),
	{
		webhook: {
			valid: validWebhook,
			invalid: invalidWebhook,
			build: (chargeId, status) =>
				buildXenditWebhook(chargeId, status, callbackToken),
		},
	},
);
