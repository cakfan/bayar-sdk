import config from "../../tsup.config";

export default {
	...config,
	entry: {
		index: "src/index.ts",
		"testing/index": "testing/index.ts",
	},
	external: [...(config.external ?? []), "bun:test"],
};
