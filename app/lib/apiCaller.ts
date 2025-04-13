import OpenAI from 'openai';
import { InferenceClient } from '@huggingface/inference';
import Anthropic from '@anthropic-ai/sdk';
import { Mistral } from '@mistralai/mistralai';
import https from 'https';


const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface ModelSettings {
  provider: 'openai' | 'anthropic' | 'huggingface' | 'deepseek';
  modelName: string;
  endpoint: string;
}
function createAgent() {
  return new https.Agent({
    keepAlive: true,
    maxSockets: 10,
    timeout: 60000,
  });
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
    modelName: 'mistralai/Mistral-7B-Instruct-v0.2',
    endpoint: 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
  },
  'llama-3-8b': {
    provider: 'huggingface',
    modelName: 'meta-llama/Llama-3-8B-Instruct',
    endpoint: 'https://api-inference.huggingface.co/models/meta-llama/Llama-3-8B-Instruct',
  },
  'deepseek-chat': {  
    provider: 'deepseek',
    modelName: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions', 
  },
};

export type ModelKey = keyof typeof modelConfig;

export async function retrieveSingleCall(
  prompt: string,
  selectedModel: ModelKey,
  userApiKeys: Record<'openai' | 'anthropic' | 'huggingface' | 'deepseek', string>
): Promise<string> {  
  const config = modelConfig[selectedModel];
  const userApiKey = userApiKeys[config.provider];
  const maxRetries = 3;
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      // OpenAI & DeepSeek (OpenAI-compatible API)
      if (config.provider === 'openai' || config.provider === 'deepseek') {
        const openai = new OpenAI({
          apiKey: userApiKey,
          httpAgent: createAgent(),
          timeout: 60000,
        });

        const response = await openai.chat.completions.create({
          model: config.modelName,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 500,
        });

        if (!response.choices[0]?.message?.content) throw new Error('⚠️ No response from OpenAI.');
        
        return response.choices[0].message.content;
      }

      // Anthropic (Claude models)
      else if (config.provider === 'anthropic') {
        const anthropic = new Anthropic({ apiKey: userApiKey });

        const response = await anthropic.messages.create({
          model: config.modelName,
          system: 'You are a helpful assistant.',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500,
        });

        if (!response.content) throw new Error('No response from Anthropic.');

        let responseText: string;
        if (typeof response.content === 'string') responseText = response.content;
        else if (Array.isArray(response.content)) responseText = response.content.map(block => ('text' in block ? block.text : '')).join(' ').trim();
        else throw new Error('⚠️ Invalid response format from Anthropic.');

        return responseText;
      }

      // Hugging Face (Mistral & Llama models)
      else if (config.provider === 'huggingface') {
        if (selectedModel === 'mistral-7b') {
          const mistral = new Mistral({ apiKey: userApiKey });

          const response = await mistral.chat.complete({
            model: config.modelName,
            messages: [{ role: "user", content: prompt }],
          });

          if (!response?.choices?.[0]?.message?.content) throw new Error('⚠️ No response from Mistral client.');

          return response.choices[0].message.content as string;
        } 

        // Hugging Face InferenceClient (for Llama models)
        else {
          const hfClient = new InferenceClient(userApiKey);
          const result = await hfClient.textGeneration({
            model: config.modelName,
            inputs: prompt,
            parameters: { max_new_tokens: 500, return_full_text: false },
          });

          if (result && typeof result === 'object' && 'generated_text' in result) return result.generated_text;

          throw new Error('No response from Hugging Face Inference.');
        }
      }

      throw new Error(`Unsupported provider: ${config.provider}`);

    } catch (error: unknown) {
      if (error instanceof Error) {
        attempts++;
    
      } else {
        console.error(`Full error: ${JSON.stringify(error, null, 2)}`);
      }
    
      if (attempts >= maxRetries) throw new Error(` API request failed after ${maxRetries} attempts`);
    
      // Wait before retrying (Exponential Backoff)
      await delay(1000 * attempts);
    }
  }

  throw new Error(`Exhausted all retries for model ${selectedModel}`);
}
