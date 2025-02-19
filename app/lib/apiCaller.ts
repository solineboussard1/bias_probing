import OpenAI from 'openai';
import fetch from 'node-fetch';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

interface ModelSettings {
  provider: 'openai' | 'anthropic' | 'huggingface';
  modelName: string;
  endpoint: string;
  apiKey: string;
}

// Define a configuration mapping for each model
const modelConfig: Record<string, ModelSettings> = {
  'gpt-4o': {
    provider: 'openai',
    modelName: 'gpt-4',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY || "",
  },
  'gpt-4o-mini': {
    provider: 'openai',
    modelName: 'gpt-3.5-turbo',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY || "",
  },
  'gpt-o1-preview': {
    provider: 'openai',
    modelName: 'gpt-3.5-turbo',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY || "",
  },
  'gpt-o1-mini': {
    provider: 'openai',
    modelName: 'gpt-o1-mini', // Adjust if needed
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY || "",
  },
  'claude-3-5-sonnet': {
    provider: 'anthropic',
    modelName: 'claude-3.5-sonnet',
    endpoint: 'https://api.anthropic.com/v1/complete',
    apiKey: process.env.ANTHROPIC_API_KEY || "",
  },
  'mistral-7b': {
    provider: 'huggingface',
    modelName: 'mistralai/Mistral-7B-Instruct',
    endpoint: 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct',
    apiKey: process.env.HUGGINGFACE_API_KEY || "",
  },
  'llama-3-8b': {
    provider: 'huggingface',
    modelName: 'meta-llama/Llama-3-8B',
    endpoint: 'https://api-inference.huggingface.co/models/meta-llama/Llama-3-8B',
    apiKey: process.env.HUGGINGFACE_API_KEY || "",
  },  
};

// Restrict allowed model keys:
export type ModelKey = keyof typeof modelConfig;

export async function retrieveSingleCall(prompt: string, selectedModel: ModelKey): Promise<string> {
  const config = modelConfig[selectedModel];
  if (!config) throw new Error(`Model ${selectedModel} is not configured.`);

  if (config.provider === 'openai') {
    // Call OpenAI's API using the OpenAI SDK
    const response = await openai.chat.completions.create({
      model: config.modelName,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });
    if (!response.choices[0]?.message?.content) {
      throw new Error("No response from OpenAI.");
    }
    return response.choices[0].message.content;

  } else if (config.provider === 'anthropic') {
    // Call Anthropic's API (ensure your endpoint and payload match their requirements)
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        prompt: prompt,
        model: config.modelName,
        max_tokens_to_sample: 500,
      }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Anthropic API error: ${errorData.error || response.statusText}`);
    }
    const data = await response.json();
    return data.completion || "No response from Anthropic.";

  } else if (config.provider === 'huggingface') {
    // Call Hugging Face's Inference API
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: prompt }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Hugging Face API error: ${errorData.error || response.statusText}`);
    }
    const data = await response.json();
    // Hugging Face's response is typically an array of outputs
    return data[0]?.generated_text || "No response from Hugging Face.";

  } else {
    throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
