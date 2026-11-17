// Stryker buildCommand for issue #62 mutation testing.
// Babel, which Stryker uses to instrument the file, drops parameter decorators
// on parameters that have a default value, so every `@MedusaContext() context:
// Context = {}` loses its decorator and @EmitEvents fails at runtime. This puts
// them back before building dist/, which the module tests load.
const fs = require("fs")
const { execSync } = require("child_process")

const file = "src/services/inventory-module.ts"
const pattern = /(?<!@MedusaContext\(\) )\bcontext: Context = \{\}/g

const source = fs.readFileSync(file, "utf8")
const restored = (source.match(pattern) ?? []).length
fs.writeFileSync(
  file,
  source.replace(pattern, "@MedusaContext() context: Context = {}")
)
console.log(`stryker-build: restored ${restored} @MedusaContext() decorators`)

execSync("yarn build", { stdio: "inherit" })
