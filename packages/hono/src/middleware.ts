import type { PaymentProvider, RefundRequest } from "@bayar-sdk/core";
import { isPaymentSDKError, PaymentSDKError } from "@bayar-sdk/core";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { chargeRequestSchema, refundRequestSchema } from "./schemas";

export interface PaymentRoutesOptions {
	providers: Record<string, PaymentProvider>;
	defaultProvider?: string;
}

interface ErrorBody {
	code: string;
	message: string;
	provider?: string;
	providerErrorCode?: string;
	retryable: boolean;
}

// Mapping PaymentErrorCode → HTTP status (ARCHITECTURE.md §12).
const HTTP_STATUS_BY_CODE: Record<string, ContentfulStatusCode> = {
	INVALID_REQUEST: 400,
	CAPTURE_NOT_SUPPORTED: 400,
	AUTH_FAILED: 401,
	WEBHOOK_SIGNATURE_INVALID: 401,
	CHARGE_NOT_FOUND: 404,
	DUPLICATE_IDEMPOTENCY_KEY: 409,
	REFUND_NOT_ALLOWED: 422,
	REFUND_EXCEEDS_CHARGE_AMOUNT: 422,
	INSUFFICIENT_BALANCE: 422,
	CHARGE_DECLINED: 422,
	PROVIDER_RATE_LIMITED: 429,
	PROVIDER_UNAVAILABLE: 502,
};

function errorResponse(
	c: Context,
	body: ErrorBody,
	status: ContentfulStatusCode,
): Response {
	return c.json({ error: body }, status);
}

function validationError(c: Context, message: string): Response {
	return errorResponse(
		c,
		{ code: "VALIDATION_ERROR", message, provider: "hono", retryable: false },
		400,
	);
}

async function readJson(c: Context): Promise<unknown | undefined> {
	try {
		return await c.req.json();
	} catch {
		return undefined;
	}
}

function missingIdempotencyKey(c: Context): boolean {
	const key = c.req.header("idempotency-key");
	return key === undefined || key.trim() === "";
}

function formatZodIssues(
	issues: Array<{ path: (string | number)[]; message: string }>,
): string {
	return issues
		.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
		.join("; ");
}

export function createPaymentRoutes(options: PaymentRoutesOptions): Hono {
	const { providers, defaultProvider } = options;

	function requireDefaultProvider(): PaymentProvider {
		if (defaultProvider === undefined) {
			throw new PaymentSDKError({
				code: "UNKNOWN",
				provider: "hono",
				message: "defaultProvider is not configured",
			});
		}
		const provider = providers[defaultProvider];
		if (!provider) {
			throw new PaymentSDKError({
				code: "UNKNOWN",
				provider: "hono",
				message: `defaultProvider '${defaultProvider}' is not present in providers`,
			});
		}
		return provider;
	}

	const app = new Hono();

	app.post("/charges", async (c) => {
		if (missingIdempotencyKey(c)) {
			return validationError(c, "Idempotency-Key header is required");
		}
		const payload = await readJson(c);
		if (payload === undefined) {
			return validationError(c, "Request body must be valid JSON");
		}
		const parsed = chargeRequestSchema.safeParse(payload);
		if (!parsed.success) {
			return validationError(c, formatZodIssues(parsed.error.issues));
		}
		const charge = await requireDefaultProvider().createCharge(parsed.data, {
			idempotencyKey: c.req.header("idempotency-key") as string,
		});
		return c.json(charge, 201);
	});

	app.get("/charges/:id", async (c) => {
		const charge = await requireDefaultProvider().getCharge(c.req.param("id"));
		return c.json(charge, 200);
	});

	app.post("/charges/:id/refund", async (c) => {
		if (missingIdempotencyKey(c)) {
			return validationError(c, "Idempotency-Key header is required");
		}
		const payload = await readJson(c);
		if (payload === undefined) {
			return validationError(c, "Request body must be valid JSON");
		}
		const parsed = refundRequestSchema
			.omit({ chargeId: true })
			.safeParse(payload);
		if (!parsed.success) {
			return validationError(c, formatZodIssues(parsed.error.issues));
		}
		const refundRequest: RefundRequest = {
			chargeId: c.req.param("id"),
			...parsed.data,
		};
		const refund = await requireDefaultProvider().refund(refundRequest, {
			idempotencyKey: c.req.header("idempotency-key") as string,
		});
		return c.json(refund, 200);
	});

	app.post("/webhooks/:provider", async (c) => {
		const provider = providers[c.req.param("provider")];
		if (!provider) {
			return errorResponse(
				c,
				{
					code: "VALIDATION_ERROR",
					message: `Unknown provider: ${c.req.param("provider")}`,
					provider: "hono",
					retryable: false,
				},
				404,
			);
		}
		const payload = await readJson(c);
		if (payload === undefined) {
			return validationError(c, "Request body must be valid JSON");
		}
		const event = await provider.parseWebhook(payload, c.req.raw.headers);
		return c.json(event, 200);
	});

	app.notFound((c) =>
		errorResponse(
			c,
			{ code: "NOT_FOUND", message: "Route not found", retryable: false },
			404,
		),
	);

	app.onError((err, c) => {
		if (isPaymentSDKError(err)) {
			return errorResponse(
				c,
				{
					code: err.code,
					message: err.message,
					provider: err.provider,
					providerErrorCode: err.providerErrorCode,
					retryable: err.retryable,
				},
				HTTP_STATUS_BY_CODE[err.code] ?? 500,
			);
		}
		return errorResponse(
			c,
			{
				code: "UNKNOWN",
				message: err instanceof Error ? err.message : "Unknown error",
				retryable: false,
			},
			500,
		);
	});

	return app;
}
