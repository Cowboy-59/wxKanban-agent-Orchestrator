import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdownHelp } from "../cli/help-inventory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const commandsDir = path.join(projectRoot, "_wxAI/commands");
const outputPath = path.join(commandsDir, "help.md");

async function main(): Promise<void> {
	const files = await fs.readdir(commandsDir);
	const scriptFiles = files
		.filter((file) => file.endsWith(".md"))
		.sort((left, right) => left.localeCompare(right));

	const content = `${renderMarkdownHelp(scriptFiles).trimEnd()}\n`;
	await fs.writeFile(outputPath, content, "utf-8");
	console.log(`Generated ${path.relative(projectRoot, outputPath)} from CLI registries.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});