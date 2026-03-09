import { generateJSON } from '../lib/core/llm';
import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testConnection() {
  console.log("正在测试 LLM 连接...");
  console.log("API Key exists:", !!process.env.OPENAI_API_KEY);
  console.log("Base URL:", process.env.OPENAI_BASE_URL || "Default (OpenAI)");
  console.log("Model:", process.env.LLM_MODEL_NAME || "Default (gpt-4o)");

  try {
    const result = await generateJSON(
      "You are a helpful assistant.",
      "Hello! Respond with a simple JSON: {"status": "ok", "message": "Connection successful!"}",
      {
        model: "gpt-3.5-turbo" // 使用便宜的模型进行快速测试
      }
    );
    
    console.log("
连接成功! ✅");
    console.log("响应结果:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("
连接失败 ❌");
    console.error(error);
  }
}

testConnection();
