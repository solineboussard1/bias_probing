// apiCaller.ts
import OpenAI from 'openai';
import fetch from 'node-fetch';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// Define a configuration mapping for each model
const modelConfig = {
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
    modelName: 'gpt-o1-mini',
    endpoint: process.env.FREE_MODEL_ENDPOINT || 'https://api.free-model.com/v1/complete',
    apiKey: process.env.FREE_MODEL_API_KEY || "",
  },
  'claude-3-5-sonnet': {
    provider: 'anthropic',
    modelName: 'claude-3.5-sonnet',
    endpoint: 'https://api.anthropic.com/v1/complete',
    apiKey: process.env.ANTHROPIC_API_KEY || "",
  },
};

// Restrict allowed model keys:
export type ModelKey = keyof typeof modelConfig;

export async function retrieveSingleCall(prompt: string, selectedModel: ModelKey): Promise<string> {
  const config = modelConfig[selectedModel];
  if (!config) {
    throw new Error(`Model ${selectedModel} is not configured.`);
  }
  
  if (config.provider === 'openai') {
    // Call OpenAI's API using the openai client library
    const response = await openai.chat.completions.create({
      model: config.modelName,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });
    if (!response.choices[0].message.content) {
      throw new Error('No content available');
    }
    return response.choices[0].message.content;
    
  } else if (config.provider === 'anthropic') {
    // Build headers for the Anthropic API call
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers['x-api-key'] = config.apiKey;
    }
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers, // This header object is guaranteed to have string values
      body: JSON.stringify({
        prompt: prompt,
        model: config.modelName,
      })
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Anthropic API error: ${errorData.error || response.statusText}`);
    }
    const data = await response.json();
    return data.completion;
    
  } else {
    throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
