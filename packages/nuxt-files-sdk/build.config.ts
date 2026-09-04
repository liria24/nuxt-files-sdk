import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["src/module", "src/config", "src/nitro", "src/plugins"],
});
