import { CATEGORIES } from "../types";

export interface ClassifiedTransaction {
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  _isFallback?: boolean;
}

// 阿里云百炼 API 配置
const DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

// 优先级模型列表
const QWEN_MODELS = [
  "qwen2.5-32b-instruct", // 对应用户说的 qwen3-32b (目前最新为 2.5)
  "qwen-max",
  "qwen2.5-7b-instruct",  // 对应用户说的 qwen3-8b
  "qwen-plus"
];

const APP_SECRET = "cxmyydsjjz";

export async function classifyTransaction(input: string, secret: string): Promise<ClassifiedTransaction | null> {
  if (!input) return null;

  const isUserProvidingKey = typeof secret === 'string' && secret.startsWith("sk-");
  
  // 如果既不是正确的暗号，也不是有效的 API Key，则拒绝访问
  if (!isUserProvidingKey && secret !== APP_SECRET) {
    throw new Error('INVALID_SECRET');
  }

  // 获取 API Key
  const keys = [
    isUserProvidingKey ? secret : null,
    (import.meta as any).env?.VITE_DASHSCOPE_API_KEY,
    (window as any)._env_?.VITE_DASHSCOPE_API_KEY,
  ].filter(Boolean).map(k => k?.trim()) as string[];

  console.log("--- Qwen Recognition Start ---");
  console.log("Detected DashScope Keys count:", keys.length);

  if (keys.length === 0) {
    console.error("No DashScope API Key detected!");
    // 如果没有 Key，直接进入兜底
  } else {
    const apiKey = keys[0];

    // 遍历模型进行尝试
    for (const modelName of QWEN_MODELS) {
      try {
        console.log(`Trying model: ${modelName}...`);
        
        const response = await fetch(DASHSCOPE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              {
                role: "system",
                content: `你是一个专业的记账助手。请解析用户输入的支付或收入信息，提取金额、分类和简短描述。
                
                注意：
                1. “描述”字段必须是消费的主体（例如：买鞋子就是"鞋子"，在食堂吃饭就是"食堂"，在麦当劳吃饭就是"麦当劳"，买可乐就是“可乐”，打车就是“打车”）。
                2. “分类”必须从以下选项中选择: ${CATEGORIES.join(", ")}。
                3. “金额”必须是识别出的数字。
                4. “类型”只能是 "income" 或 "expense"。
                
                请严格返回 JSON 格式，例如: {"金额": 50, "分类": "餐饮美食", "描述": "麦当劳", "类型": "expense"}`
              },
              {
                role: "user",
                content: input
              }
            ],
            response_format: { type: "json_object" }
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          // 如果是限额错误 (429)，则尝试下一个模型
          if (response.status === 429 || errorData.error?.code === "DataLimitControl") {
            console.warn(`Model ${modelName} rate limited, trying next...`);
            continue;
          }
          throw new Error(errorData.error?.message || "API_ERROR");
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        const result = JSON.parse(content);

        return {
          amount: result["金额"] || 0,
          category: result["分类"] || "其他",
          description: result["描述"] || input.slice(0, 20),
          type: result["类型"] || "expense"
        };

      } catch (error: any) {
        console.error(`Error with model ${modelName}:`, error.message);
        if (error.message === 'Failed to fetch') {
          throw new Error('NETWORK_ERROR');
        }
        // 如果是最后一个模型也失败了，或者不是限额错误，则抛出
        if (modelName === QWEN_MODELS[QWEN_MODELS.length - 1]) {
          break;
        }
        continue; 
      }
    }
  }

  // 所有模型都失败后的兜底逻辑
  console.warn("AI classification failed, using fallback logic");
  const amountMatch = input.match(/(\d+(\.\d+)?)/);
  return {
    amount: amountMatch ? parseFloat(amountMatch[0]) : 0,
    category: "其他",
    description: input.slice(0, 20),
    type: "expense",
    _isFallback: true
  };
}
