import { MockPaymentProvider } from "../__fixtures__/mock-provider";
import {
	buildInvalidMockWebhook,
	buildMockWebhook,
} from "../__fixtures__/webhook-fixtures";
import { runProviderContractTests } from "../testing";

runProviderContractTests(() => new MockPaymentProvider(), {
	webhook: {
		valid: buildMockWebhook("mock-charge-valid", "paid"),
		invalid: buildInvalidMockWebhook(),
		build: buildMockWebhook,
	},
});
