require("tsx/cjs");

module.exports = function precompile_bundled_plugins(context) {
    const mod = require("../scripts/precompile-bundled-plugins.ts");
    return mod.default(context);
};
