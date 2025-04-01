import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { AnalysisResult, ExtractedConcepts } from '@/app/types/pipeline';
import { spawn } from 'child_process';
import path from 'path';

// Initialize the OpenAI client.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function runConceptClustering(
  allConceptFrequencies: Map<string, number>,
  subgroupConcepts: Map<string, string[]> = new Map()
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
      console.log("Python stderr:", errorData);
      if (code !== 0) {
        console.error('Python clustering error:', errorData);
        reject(new Error(`Clustering failed with code ${code}`));
        return;
      }
      try {
        const clusters = JSON.parse(outputData);
        console.log("Parsed clusters:", clusters);
        resolve(clusters);
      } catch (error) {
        reject(error);
      }
    });

    // Build frequency maps for subgroup concepts.
    const subgroupFreqMap = new Map<string, Map<string, number>>();
    for (const [demo, concepts] of subgroupConcepts.entries()) {
      const freqMap = new Map<string, number>();
      concepts.forEach(concept => {
        freqMap.set(concept, (freqMap.get(concept) || 0) + 1);
      });
      subgroupFreqMap.set(demo, freqMap);
    }

    const inputData = {
      all: Array.from(allConceptFrequencies.entries()),
      demographics: Object.fromEntries(
        [...subgroupFreqMap.entries()].map(([demo, freqMap]) => [
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

        let totalResponses = 0;
        let processedResponses = 0;
        results.forEach(result => {
          result.prompts.forEach(prompt => {
            totalResponses += prompt.responses.length;
          });
        });

        console.log(`Starting extraction for ${totalResponses} total responses`);

        // Collect every prompt's concepts into allConcepts.
        const allConcepts: string[] = [];
        const subgroupConcepts: Map<string, string[]> = new Map();

        for (const result of results) {
          for (const prompt of result.prompts) {
            function getDemographicCategory(demo: string): string | null {
              const demoLower = demo.toLowerCase();
              if (['woman', 'man', 'non-binary'].includes(demoLower)) return 'genders';
              if (['young adult', 'middle-aged', 'elderly'].includes(demoLower)) return 'ages';
              if (['asian', 'black', 'hispanic', 'white', 'other'].includes(demoLower)) return 'ethnicities';
              if (['low income', 'middle income', 'high income'].includes(demoLower)) return 'socioeconomic';
              return null;
            }

            let demographics: { category: string; value: string }[] = [];

            if (
              prompt.metadata.demographics &&
              prompt.metadata.demographics.length === 1 &&
              prompt.metadata.demographics[0].toLowerCase() === 'baseline'
            ) {
              demographics = [{ category: 'baseline', value: 'baseline' }];
            } else if (prompt.metadata.demographics && prompt.metadata.demographics.length > 0) {
              demographics = prompt.metadata.demographics.map(demo => {
                const demoLower = demo.toLowerCase();
                // Map non-baseline values normally; otherwise return baseline.
                if (demoLower === 'baseline') {
                  return { category: 'baseline', value: 'baseline' };
                }
                const category = getDemographicCategory(demo) || 'all';
                return { category, value: demo };
              });
            } else {
              demographics = [{ category: 'baseline', value: 'baseline' }];
            }

            for (const response of prompt.responses) {
              processedResponses++;

              // Send progress update.
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
                // Add every extracted concept to allConcepts.
                allConcepts.push(...concepts);

                // Add concepts to the appropriate subgroup.
                demographics.forEach(demo => {
                  const key = demo.category === 'baseline' ? 'baseline' : `${demo.category}:${demo.value}`;
                  if (!subgroupConcepts.has(key)) {
                    subgroupConcepts.set(key, []);
                  }
                  console.log(`Demographic Key: ${key}, Extracted Concepts:`, concepts);
                  subgroupConcepts.get(key)?.push(...concepts);
                });                

                // Send a progress update with the extracted concepts.
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

        // Compute frequencies from allConcepts.
        const allConceptFrequencies = new Map<string, number>();
        allConcepts.forEach(concept => {
          allConceptFrequencies.set(concept, (allConceptFrequencies.get(concept) || 0) + 1);
        });

        // Call runConceptClustering once with both overall and subgroup data.
        const clusters = await runConceptClustering(allConceptFrequencies, subgroupConcepts);

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'clusters',
              clusters: clusters
            })}\n\n`
          )
        );
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

    const content = completion.choices[0].message.content || '';
    const match = content.match(/\[(.*?)\]/);
    if (match) {
      const concepts = match[1]
        .split(',')
        .map(concept => concept.trim())
        .filter(concept => concept.length > 0 && concept !== '...');
      return concepts;
    }

    console.log("No concepts found in response");
    return [];
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
  }
}
