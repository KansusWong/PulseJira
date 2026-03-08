import { createPMAgent } from '../agents/pm';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runTest() {
  console.log("Testing ProductManagerAgent (new architecture)...");

  try {
    const agent = createPMAgent();
    const mockSignal = "We need a dark mode toggle.";

    console.log("Running agent (runOnce)...");
    const result = await agent.runOnce(mockSignal, {
      signalId: "test-signal-123",
      logger: (msg: string) => console.log(msg),
    });

    console.log("Agent Result:", JSON.stringify(result, null, 2));
    console.log("Test Passed");
  } catch (error) {
    console.error("Test Failed:", error);
  }
}

runTest();
