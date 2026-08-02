import { runProviderContractTests } from "@bayar-sdk/core/testing";
import { MockMidtransHttpClient } from "../__fixtures__/mock-client";
import {
	buildInvalidMidtransWebhook,
	buildMidtransWebhook,
	MOCK_MIDTRANS_SERVER_KEY,
} from "../__fixtures__/webhook";
import { MidtransProvider } from "../src/adapter";

const serverKey = MOCK_MIDTRANS_SERVER_KEY;
const validWebhook = await buildMidtransWebhook(
	"mock-order-valid",
	"paid",
	serverKey,
);
const invalidWebhook = await buildInvalidMidtransWebhook(serverKey);

runProviderContractTests(
	() =>
		new MidtransProvider({
			serverKey,
			httpClient: new MockMidtransHttpClient(),
		}),
	{
		webhook: {
			valid: validWebhook,
			invalid: invalidWebhook,
			build: (chargeId, status) =>
				buildMidtransWebhook(chargeId, status, serverKey),
		},
	},
);
