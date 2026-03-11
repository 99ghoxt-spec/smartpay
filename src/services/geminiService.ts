
import { GoogleGenAI, Type } from "@google/genai";

export interface ClassifiedTransaction {
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  _isFallback?: boolean;
  _isSmartFallback?: boolean;
}

const CATEGORIES = [
  "餐饮美食", "交通出行", "购物消费", "休闲娱乐", "医疗保健", 
  "生活日用", "住房缴费", "工资收入", "理财收益", "其他"
];

const APP_SECRET = "cxmyydsjjz";

export async function classifyTransaction(input: string, secret: string): Promise<ClassifiedTransaction | null> {
  // 1. 准备有效的 Key：优先使用用户提供的 Key，其次是环境变量
  const isUserProvidingKey = typeof secret === 'string' && secret.startsWith("AIzaSy");
  
  // 如果既不是正确的暗号，也不是有效的 API Key，则拒绝访问
  if (!isUserProvidingKey && secret !== APP_SECRET) {
    throw new Error('INVALID_SECRET');
  }

  const keys = [
    isUserProvidingKey ? secret : null,
    process.env.GEMINI_API_KEY,
    process.env.VITE_GEMINI_API_KEY,
    (import.meta as any).env?.VITE_GEMINI_API_KEY,
    (import.meta as any).env?.GEMINI_API_KEY,
    (window as any)._env_?.VITE_GEMINI_API_KEY,
  ].filter(Boolean).map(k => k?.trim()) as string[];

  console.log("Detected AI Keys count:", keys.length);
  if (keys.length === 0) {
    console.error("No API Key detected! Please check Cloudflare Environment Variables.");
  }

  if (!input) return null;

  // 尝试使用 AI 识别
  if (keys.length > 0) {
    for (const key of keys) {
      if (key.includes("your_api_key_here") || key.includes("TODO") || key.startsWith("MY_GEMIN")) continue;

      try {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: [{ parts: [{ text: `你是一个专业的记账助手。请解析以下支付或收入信息，提取金额、分类和简短描述。
          
          注意：
          1. “描述”字段必须是消费的主体（例如：买鞋子就是"鞋子"，在食堂吃饭就是"食堂"，在麦当劳吃饭就是"麦当劳"，买可乐就是“可乐”，打车就是“打车”）。
          2. “分类”必须从以下选项中选择: ${CATEGORIES.join(", ")}。
          3. “金额”必须是识别出的数字。
          
          输入信息: "${input}"
          
          请严格按照 JSON 格式返回，包含 "金额" (数字), "分类" (字符串), "描述" (字符串), "类型" (只能是 "income" 或 "expense") 字段。` }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                "金额": { type: Type.NUMBER },
                "分类": { type: Type.STRING },
                "描述": { type: Type.STRING },
                "类型": { type: Type.STRING, enum: ["income", "expense"] }
              },
              required: ["金额", "分类", "描述", "类型"]
            }
          }
        });

        if (response.text) {
          const result = JSON.parse(response.text);
          return {
            amount: result["金额"],
            category: result["分类"],
            description: result["描述"],
            type: result["类型"]
          } as ClassifiedTransaction;
        }
      } catch (error: any) {
        console.error("Gemini API Error Details:", error);
        if (error.message?.includes('Failed to fetch') || error.message?.includes('Load failed')) {
          throw new Error('NETWORK_ERROR');
        }
        console.warn("Gemini attempt failed:", error.message);
      }
    }
  }

  // 2. 极简兜底逻辑
  const amountMatch = input.match(/(\d+(\.\d+)?)/);
  const amount = amountMatch ? parseFloat(amountMatch[0]) : 0;
  
  return {
    amount,
    type: "expense",
    category: "其他",
    description: input.substring(0, 20),
    _isFallback: true
  };
}

export async function checkServerHealth(): Promise<any> {
  // Since we are moving to client-side, we can just return a mock success
  return { status: "ok", hasApiKey: !!process.env.GEMINI_API_KEY };
}
