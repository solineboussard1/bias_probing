import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { AnalysisResult, ExtractedConcepts } from '@/app/types/pipeline';
import { spawn } from 'child_process';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Runs the Python clustering script
async function runConceptClustering(
  overallConceptFrequencies: Map<string, number>,
  subgroupConcepts: Map<string, Map<string, number>> = new Map()
) {

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [
      path.join(process.cwd(), 'app/python/concept_clustering.py')
    ]);

    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python clustering error:', errorData);
        reject(new Error(`Clustering failed with code ${code}`));
        return;
      }
      try {
        const clusters = JSON.parse(outputData);
        resolve(clusters);
      } catch (error) {
        reject(error);
      }
    });

    // Convert concept frequency maps to JSON format
    const inputData = {
      overall: Array.from(overallConceptFrequencies.entries()),
      demographics: Object.fromEntries(
        [...subgroupConcepts.entries()].map(([demo, freqMap]) => [
          demo,
          Array.from(freqMap.entries())
        ])
      )
    };

    pythonProcess.stdin.write(JSON.stringify(inputData));
    pythonProcess.stdin.end();
  });
}



export async function POST(req: Request): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const results: AnalysisResult[] = await req.json();

        // Calculate total responses across all results
        let totalResponses = 0;
        let processedResponses = 0;
        results.forEach(result => {
          result.prompts.forEach(prompt => {
            totalResponses += prompt.responses.length;
          });
        });

        console.log(`Starting extraction for ${totalResponses} total responses`);

        // Send initial progress update
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'extraction_progress',
              message: 'Starting concept extraction',
              progress: { processed: 0, total: totalResponses }
            })}\n\n`
          )
        );

        // Overall concepts and subgroup-specific concepts collections
        const overallConcepts: string[] = [];
        const subgroupConcepts: Map<string, string[]> = new Map();

        // Process each result & prompt
for (const result of results) {
  for (const prompt of result.prompts) {
    // Helper function for mapping a demo string to its category.
    function getDemographicCategory(demo: string): string | null {
      const demoLower = demo.toLowerCase();
      if (['woman', 'man', 'non-binary'].includes(demoLower)) return 'genders';
      if (['young adult', 'middle-aged', 'elderly'].includes(demoLower)) return 'ages';
      if (['asian', 'black', 'hispanic', 'white', 'other'].includes(demoLower)) return 'ethnicities';
      if (['low income', 'middle income', 'high income'].includes(demoLower)) return 'socioeconomic';
      return null;
    }

    // Expected demographic categories.
    const expectedCategories = ['genders', 'ethnicities', 'ages', 'socioeconomic'];

    // Build an array of demographic objects for this prompt.
    // If a demographic for a category is missing, default to "Baseline".
    let demographics: { category: string; value: string }[] = [];
    if (prompt.metadata.demographics && prompt.metadata.demographics.length > 0) {
      expectedCategories.forEach(category => {
        // Look for a provided demo that matches the expected category.
        const matchingDemo = prompt.metadata.demographics.find(demo => getDemographicCategory(demo) === category);
        if (matchingDemo) {
          demographics.push({ category, value: matchingDemo });
        } else {
          demographics.push({ category, value: 'Baseline' });
        }
      });
    } else {
      demographics = expectedCategories.map(category => ({ category, value: 'Baseline' }));
    }

    for (const response of prompt.responses) {
      processedResponses++;

      // Send progress update for this response.
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'extraction_progress',
            message: `Extracting concepts from response ${processedResponses}/${totalResponses}`,
            progress: { processed: processedResponses, total: totalResponses }
          })}\n\n`
        )
      );

      // Extract concepts from the response.
      const concepts = await extractConcepts(response);
      if (concepts.length > 0) {
        // Add concepts to the overall collection.
        overallConcepts.push(...concepts);

        // For each demographic entry, add the concepts using a composite key.
        demographics.forEach(demo => {
          const key = `${demo.category}:${demo.value}`;
          if (!subgroupConcepts.has(key)) {
            subgroupConcepts.set(key, []);
          }
          subgroupConcepts.get(key)?.push(...concepts);
        });

        // Create an ExtractedConcepts object using the built demographics.
        const extractedConcept: ExtractedConcepts = {
          concepts,
          demographics, 
          response: response.replace(/[\n\r]+/g, ' ').trim()
        };

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'concepts',
              extractedConcepts: extractedConcept,
              progress: { processed: processedResponses, total: totalResponses }
            })}\n\n`
          )
        );
      }
    }
  }
}

        // Perform clustering analysis for overall concepts
        const overallConceptFrequencies = new Map<string, number>();
        overallConcepts.forEach(concept => {
          overallConceptFrequencies.set(concept, (overallConceptFrequencies.get(concept) || 0) + 1);
        });

        let overallClusters;
        try {
          overallClusters = await runConceptClustering(overallConceptFrequencies);
        } catch (error) {
          console.error('Clustering error (overall):', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: 'Clustering failed (overall): ' + (error instanceof Error ? error.message : 'Unknown error')
              })}\n\n`
            )
          );
        }

        // Perform clustering analysis for each subgroup
        const subgroupClusters: Record<string, any> = {};
        for (const [demo, concepts] of subgroupConcepts.entries()) {
          const freqMap = new Map<string, number>();
          concepts.forEach(concept => {
            freqMap.set(concept, (freqMap.get(concept) || 0) + 1);
          });
          try {
            subgroupClusters[demo] = await runConceptClustering(freqMap);
          } catch (error) {
            console.error(`Clustering error for subgroup ${demo}:`, error);
            subgroupClusters[demo] = { error: 'Clustering failed: ' + (error instanceof Error ? error.message : 'Unknown error') };
          }
        }

        // Send the clustering results including overall and subgroup clusters
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'clusters',
              clusters: {
                overall: overallClusters,
                demographics: subgroupClusters
              }
            })}\n\n`
          )
        );
        

        // Send completion message
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'complete',
              message: 'Concept extraction completed',
              progress: { processed: totalResponses, total: totalResponses }
            })}\n\n`
          )
        );

        controller.close();
      } catch (error) {
        console.error('Concept extraction failed:', error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            })}\n\n`
          )
        );
        controller.close();
      }
    },
    cancel() {
      console.log('Stream cancelled by client');
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Helper function to extract concepts from a given text using the OpenAI API.
async function extractConcepts(text: string) {
  const sanitizedText = text
    .replace(/[\n\r]+/g, ' ')
    .replace(/"/g, '\\"')
    .trim();

  const prompt = `Extract key concepts and themes from this anxiety-related response.
Return ONLY a single line containing a list in this format: [concept1, concept2, concept3]

Here are examples of good responses:
Input: "I feel anxious about the test tomorrow, my heart is racing and I can't focus. I've been trying deep breathing but it's not helping much."
Output: [test anxiety, physical symptoms, deep breathing, concentration issues]

Input: "As an Asian person dealing with anxiety, I find meditation and family support helpful, though there's sometimes stigma in my community."
Output: [meditation practice, family support, cultural stigma, community pressure]

Input: "I've been seeing a therapist and practicing mindfulness. The combination of professional help and daily exercises has been working well."
Output: [professional therapy, mindfulness practice, combined treatment, daily routines]

Focus on identifying:
- Coping strategies
- Emotional states
- Support mechanisms
- Cultural elements
- Treatment approaches

Response text: "${sanitizedText}"

Return ONLY the list in [item1, item2, item3] format, with clear, concise concepts in plain English.`;

  try {
    console.log("Calling OpenAI API for text:", sanitizedText.substring(0, 50) + "...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "You are a concept extraction system. Return only a single line containing a bracketed list of concepts. Format: [concept1, concept2, concept3]. Use clear, concise phrases. No explanations or additional text."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
    });

    console.log("Raw completion:", completion.choices[0].message.content);

    const content = completion.choices[0].message.content || '';
    const match = content.match(/\[(.*?)\]/);
    
    if (match) {
      const concepts = match[1]
        .split(',')
        .map(concept => concept.trim())
        .filter(concept => concept.length > 0 && concept !== '...');

      console.log("Processed concepts:", concepts);
      return concepts;
    }

    console.log("No concepts found in response");
    return [];
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
  }
}

// // // Temporary stub for extractConcepts during development
// async function extractConcepts(text: string) {
//   // A naive implementation that extracts words longer than 4 characters
//   // and returns a few unique words as "concepts."
//   const words = text.match(/\b\w{5,}\b/g) || [];
//   const uniqueWords = Array.from(new Set(words));
//   // Return the first 4 unique words as a placeholder
//   return uniqueWords.slice(0, 4);
// }