import OpenAI from 'openai';
import fetch from 'node-fetch';

interface ModelSettings {
  provider: 'openai' | 'anthropic' | 'huggingface';
  modelName: string;
  endpoint: string;
}

const modelConfig: Record<string, ModelSettings> = {
  'gpt-4o': {
    provider: 'openai',
    modelName: 'gpt-4',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
  'gpt-4o-mini': {
    provider: 'openai',
    modelName: 'gpt-3.5-turbo',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
  'gpt-o1-mini': {
    provider: 'openai',
    modelName: 'gpt-o1-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
  'claude-3-5-sonnet': {
    provider: 'anthropic',
    modelName: 'claude-3.5-sonnet',
    endpoint: 'https://api.anthropic.com/v1/complete',
  },
  'mistral-7b': {
    provider: 'huggingface',
    modelName: 'mistralai/Mistral-7B-Instruct',
    endpoint: 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct',
  },
  'llama-3-8b': {
    provider: 'huggingface',
    modelName: 'meta-llama/Llama-3-8B',
    endpoint: 'https://api-inference.huggingface.co/models/meta-llama/Llama-3-8B',
  },
};

export type ModelKey = keyof typeof modelConfig;

export async function retrieveSingleCall(
  prompt: string,
  selectedModel: ModelKey,
  userApiKeys: Record<'openai' | 'anthropic' | 'huggingface', string>
): Promise<string> {
  const config = modelConfig[selectedModel];
  if (!config) {
    throw new Error(`Model ${selectedModel} is not configured.`);
  }

  // Get the API key for the provider
  const userApiKey = userApiKeys[config.provider];
  if (!userApiKey) {
    throw new Error(`API key for provider ${config.provider} is missing.`);
  }

  if (config.provider === 'openai') {
    // Create a new OpenAI instance with the user-supplied API key.
    const openai = new OpenAI({
      apiKey: userApiKey,
    });
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
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userApiKey}`,
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
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: prompt }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Hugging Face API error: ${errorData.error || response.statusText}`);
    }
    const data = await response.json();
    return data[0]?.generated_text || "No response from Hugging Face.";
  } else {
    throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
