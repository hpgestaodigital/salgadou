import { readdir, readFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"

const ROOTS = ["app", "components", "lib"]
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"])
const violations = []

const checks = [
  { label: "supressão TypeScript @ts-ignore", pattern: /@ts-ignore/ },
  { label: "chave service role exposta ao navegador", pattern: /NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE/i },
  { label: "conflito de merge não resolvido", pattern: /^(<<<<<<<|=======|>>>>>>>)/m },
]

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collect(path))
    else if (EXTENSIONS.has(extname(entry.name))) files.push(path)
  }
  return files
}

for (const root of ROOTS) {
  for (const file of await collect(root)) {
    const source = await readFile(file, "utf8")
    for (const check of checks) {
      if (check.pattern.test(source)) {
        violations.push(`${relative(process.cwd(), file)}: ${check.label}`)
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Bloqueadores estáticos encontrados:\n" + violations.map((item) => `- ${item}`).join("\n"))
  process.exit(1)
}

console.info("Verificação estática concluída sem bloqueadores.")
