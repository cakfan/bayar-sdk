import config from "../../tsup.config";

export default {
	...config,
	entry: {
		index: "src/index.ts",
	},
	external: [...(config.external ?? []), "hono", "zod"],
};
