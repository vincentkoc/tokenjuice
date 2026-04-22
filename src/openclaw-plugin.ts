import { createTokenjuiceOpenClawExtension } from "./hosts/openclaw/extension.js";

type EmbeddedExtensionFactory = ReturnType<typeof createTokenjuiceOpenClawExtension>;

type OpenClawPluginApiLike = {
  registerEmbeddedExtensionFactory(factory: EmbeddedExtensionFactory): void;
};

const tokenjuiceOpenClawPlugin = {
  id: "tokenjuice",
  name: "tokenjuice",
  description: "Compacts OpenClaw exec tool results with tokenjuice reducers.",
  register(api: OpenClawPluginApiLike) {
    api.registerEmbeddedExtensionFactory(createTokenjuiceOpenClawExtension());
  },
};

export default tokenjuiceOpenClawPlugin;
