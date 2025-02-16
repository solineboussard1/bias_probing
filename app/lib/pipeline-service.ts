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

/**
 * New helper function that returns only individual demographic groups.
 * It always returns a baseline (empty array) plus one group per demographic attribute.
 */
function generateDemographicGroups(demographics: SelectedParams['demographics']): string[][] {
  const groups: string[][] = [];
  
  // Baseline group: no demographics
  groups.push([]);
  
  // For each demographic attribute, add one group per selected value
  if (demographics.genders && demographics.genders.length > 0) {
    demographics.genders.forEach(gender => groups.push([gender]));
  }
  if (demographics.ages && demographics.ages.length > 0) {
    demographics.ages.forEach(age => groups.push([age]));
  }
  if (demographics.ethnicities && demographics.ethnicities.length > 0) {
    demographics.ethnicities.forEach(ethnicity => groups.push([ethnicity]));
  }
  if (demographics.socioeconomic && demographics.socioeconomic.length > 0) {
    demographics.socioeconomic.forEach(socio => groups.push([socio]));
  }
  
  return groups;
}

export async function processBatch(
  prompts: string[], 
  params: SelectedParams, 
  // Using params.iterations to repeat each combination
  batchSize: number = params.iterations, 
  onProgress?: ProgressCallback
): Promise<BatchResults[]> {
  const results: BatchResults[] = [];
  let completedPrompts = 0;
  const MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB limit per response

  // Use the new demographic groups function instead of a full cross‑product
  const demographicGroups = generateDemographicGroups(params.demographics);
  
  // For each prompt template
  for (const promptTemplate of prompts) {
    // For each demographic group
    for (const demographics of demographicGroups) {
      const responses: string[] = [];
      
      // Build the prompt text including demographic info.
      let prompt = "";
      if (promptTemplate.includes("{demographic}")) {
        prompt = promptTemplate.replace(
          /\{([^}]+)\}/g,
          (_, placeholder) => {
            if (placeholder === 'demographic') {
              // Determine perspective from the template text.
              let perspective = "Hypothetical";
              if (promptTemplate.includes("I am")) {
                perspective = "First";
              } else if (promptTemplate.includes("My friend")) {
                perspective = "Third";
              }
              const demographicStr = demographics.join(' ');
              if (demographicStr) {
                if (perspective === "First") {
                  return `I am a ${demographicStr}.`;
                } else if (perspective === "Third") {
                  return `My friend is a ${demographicStr}.`;
                } else {
                  return `Someone is a ${demographicStr}.`;
                }
              }
              return "";
            }
            return placeholder;
          }
        );
      } else {
        // If no placeholder is found, prepend the demographic phrase.
        let perspective = "Hypothetical";
        if (promptTemplate.includes("I am")) {
          perspective = "First";
        } else if (promptTemplate.includes("My friend")) {
          perspective = "Third";
        }
        const demographicStr = demographics.join(' ');
        let demoPhrase = "";
        if (demographicStr) {
          if (perspective === "First") {
            demoPhrase = `I am a ${demographicStr}. `;
          } else if (perspective === "Third") {
            demoPhrase = `My friend is a ${demographicStr}. `;
          } else {
            demoPhrase = `Someone is a ${demographicStr}. `;
          }
        }
        prompt = demoPhrase + promptTemplate;
      }
      
      onProgress?.({
        type: 'prompt-execution',
        message: `Processing prompt ${completedPrompts + 1}/${prompts.length * demographicGroups.length}`,
        prompt: prompt.slice(0, 100) + (prompt.length > 100 ? '...' : ''),
        completedPrompts,
        totalPrompts: prompts.length * demographicGroups.length
      });
      
      // Repeat each prompt combination for the specified number of iterations
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
          console.error(`Iteration ${i} failed for prompt:`, prompt, error);
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
  const demographicGroups = generateDemographicGroups(params.demographics);

  onProgress?.({
    type: 'prompt-generation',
    message: `Generated ${promptTemplates.length} prompt templates with ${demographicGroups.length} demographic groups each`,
    totalPrompts: promptTemplates.length * demographicGroups.length
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
    details: `Analyzed ${promptTemplates.length} prompts with ${demographicGroups.length} demographic groups each`,
    timestamp: new Date().toISOString(),
    prompts: batchResults.map(br => ({
      text: br.prompt,
      responses: br.responses,
      metadata: br.metadata
    }))
  };

  return result;
}
