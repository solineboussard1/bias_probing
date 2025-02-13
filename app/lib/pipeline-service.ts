import { retrieveSingleCall } from './openai';
import { AnalysisResult, SelectedParams, ProgressCallback } from '../types/pipeline';
import { generatePrompts } from './pipeline';

export type BatchResults = {
  prompt: string;
  responses: string[];
  metadata: {
    perspective: string;
    demographics: string[];
    context: string;
    questionType: string;
  };
};

// Helper function to generate all demographic combinations
function generateDemographicCombinations(demographics: SelectedParams['demographics']) {
  const { genders, ages, ethnicities, socioeconomic } = demographics;
  
  const combinations: string[][] = [];
  
  // Generate all possible combinations
  for (const gender of genders) {
    for (const age of ages) {
      for (const ethnicity of ethnicities) {
        for (const social of socioeconomic) {
          combinations.push([gender, age, ethnicity, social]);
        }
      }
    }
  }
  
  return combinations;
}

export async function processBatch(
  prompts: string[], 
  params: SelectedParams, 
  batchSize: number = 3,
  onProgress?: ProgressCallback
): Promise<BatchResults[]> {
  const results: BatchResults[] = [];
  let completedPrompts = 0;
  const MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB limit per response

  // Generate all demographic combinations
  const demographicCombinations = generateDemographicCombinations(params.demographics);
  
  // For each prompt template
  for (const promptTemplate of prompts) {
    // For each demographic combination
    for (const demographics of demographicCombinations) {
      const responses: string[] = [];
      
      // Create a prompt with the specific demographic combination
      const prompt = promptTemplate.replace(
        /\{([^}]+)\}/g, 
        (_, placeholder) => {
          if (placeholder.includes('demographic')) {
            return demographics.join(' ');
          }
          return placeholder;
        }
      );
      
      onProgress?.({
        type: 'prompt-execution',
        message: `Processing prompt ${completedPrompts + 1}/${prompts.length * demographicCombinations.length}`,
        prompt: prompt.slice(0, 100) + (prompt.length > 100 ? '...' : ''),
        completedPrompts,
        totalPrompts: prompts.length * demographicCombinations.length
      });
      
      for (let i = 0; i < batchSize; i++) {
        try {
          const response = await retrieveSingleCall(prompt, params.model);
          if (response && response.length < MAX_RESPONSE_SIZE) {
            const sanitizedResponse = response
              .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '')
              .trim();
            responses.push(sanitizedResponse);
          } else {
            console.warn('Response exceeded size limit or was empty');
            responses.push('Response too large or empty');
          }
        } catch (error) {
          console.error(`Batch ${i} failed for prompt:`, prompt, error);
          responses.push('Failed to get response');
        }
      }

      completedPrompts++;

      // Create metadata for this specific combination
      const safeMetadata = {
        perspective: prompt.includes("I am") ? "First" : 
                    prompt.includes("My friend") ? "Third" : "Hypothetical",
        demographics: demographics.map(d => d.slice(0, 100)),
        context: params.context.slice(0, 1000),
        questionType: params.questionTypes.find(qt => prompt.includes(qt)) || "Unknown"
      };

      results.push({
        prompt: prompt.slice(0, 1000),
        responses,
        metadata: safeMetadata
      });
    }
  }

  return results;
}

export async function runAnalysisPipeline(
  params: SelectedParams,
  onProgress?: ProgressCallback
): Promise<AnalysisResult> {
  onProgress?.({
    type: 'prompt-generation',
    message: 'Generating prompts...'
  });
  
  const promptTemplates = generatePrompts(params);
  const demographicCombinations = generateDemographicCombinations(params.demographics);

  onProgress?.({
    type: 'prompt-generation',
    message: `Generated ${promptTemplates.length} prompt templates with ${demographicCombinations.length} demographic combinations each`,
    totalPrompts: promptTemplates.length * demographicCombinations.length
  });
  
  const batchResults = await processBatch(promptTemplates, params, params.iterations, onProgress);
  
  const result: AnalysisResult = {
    id: crypto.randomUUID(),
    modelName: params.model,
    concept: params.primaryIssues.join(', '),
    demographics: [
      ...params.demographics.genders,
      ...params.demographics.ages,
      ...params.demographics.ethnicities,
      ...params.demographics.socioeconomic
    ],
    context: params.context,
    details: `Analyzed ${promptTemplates.length} prompts with ${demographicCombinations.length} demographic combinations each`,
    timestamp: new Date().toISOString(),
    prompts: batchResults.map(br => ({
      text: br.prompt,
      responses: br.responses,
      metadata: br.metadata
    }))
  };

  return result;
} 