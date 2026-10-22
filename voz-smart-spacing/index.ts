import { defineExtension } from "voz";
import { join } from "node:path";

const helper = join(import.meta.dir, "char-before-cursor");

async function characterBeforeCursor(): Promise<string | undefined> {
  const child = Bun.spawn([helper], { stdout: "pipe", stderr: "ignore" });
  // beforeInsert shares a 300 ms budget with other extensions
  const timeout = setTimeout(() => child.kill(), 200);
  const output = await new Response(child.stdout).text();
  clearTimeout(timeout);
  return (await child.exited) === 0 ? output : undefined;
}

export default defineExtension((voz) => {
  voz.on("beforeInsert", async ({ text }) => {
    if (!text || /^[\s.,;:!?)\]}…]/.test(text)) return;
    const before = await characterBeforeCursor();
    if (before && !/[\s(\[{"„“'‘«/-]$/.test(before)) return { text: ` ${text}` };
  });
});
