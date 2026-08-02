import { z } from "zod";

const paymentMethodSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("virtual_account"), bank: z.string().min(1) }),
	z.object({ type: z.literal("qris") }),
	z.object({ type: z.literal("ewallet"), channel: z.string().min(1) }),
	z.object({ type: z.literal("card"), token: z.string().min(1) }),
]);

export const chargeRequestSchema = z.object({
	amount: z.number().int().positive(),
	currency: z.string().length(3),
	paymentMethod: paymentMethodSchema,
	referenceId: z.string().min(1),
	customer: z
		.object({
			name: z.string().optional(),
			email: z.string().email().optional(),
			phone: z.string().optional(),
		})
		.optional(),
	description: z.string().optional(),
	metadata: z.record(z.string(), z.string()).optional(),
});

export const refundRequestSchema = z.object({
	chargeId: z.string().min(1),
	amount: z.number().int().positive().optional(),
	reason: z.string().optional(),
});

export type ChargeRequestInput = z.infer<typeof chargeRequestSchema>;
export type RefundRequestInput = z.infer<typeof refundRequestSchema>;
