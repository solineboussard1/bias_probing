import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { AnalysisResult, ExtractedConcepts } from '@/app/types/pipeline';
import { spawn } from 'child_process';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const RACE_CATEGORIES = ['Asian', 'Black', 'Hispanic', 'White', 'Native American'];

async function runConceptClustering(conceptFrequencies: Map<string, number>) {
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

    // Send concept frequency data to Python script
    const inputData = Array.from(conceptFrequencies.entries());
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

        // Calculate total responses first
        let totalResponses = 0;
        let processedResponses = 0;
        results.forEach(result => {
          result.prompts.forEach(prompt => {
            // Each response should be processed once for its specific race
            totalResponses += prompt.responses.length;
          });
        });

        console.log(`Starting extraction for ${totalResponses} total responses`);

        // Send initial progress
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'extraction_progress',
              message: 'Starting concept extraction',
              progress: { processed: 0, total: totalResponses }
            })}\n\n`
          )
        );

        // Track all concepts for clustering
        const allConcepts: string[] = [];
        const conceptsByRace = new Map<string, string[]>();

        // Process each result
        for (const result of results) {
          for (const prompt of result.prompts) {
            // Get the race from the prompt's metadata instead of result demographics
            const race = prompt.metadata.demographics.find(d => 
              RACE_CATEGORIES.includes(d)
            );

            if (!race) continue;

            for (const response of prompt.responses) {
              try {
                processedResponses++;
                
                // Send progress update
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'extraction_progress',
                      message: `Extracting concepts from response ${processedResponses}/${totalResponses}`,
                      progress: { processed: processedResponses, total: totalResponses }
                    })}\n\n`
                  )
                );

                // Extract concepts for this specific response
                const concepts = await extractConcepts(response);
                
                if (concepts.length > 0) {
                  allConcepts.push(...concepts);
                  
                  // Track concepts by race for clustering
                  if (!conceptsByRace.has(race)) {
                    conceptsByRace.set(race, []);
                  }
                  conceptsByRace.get(race)?.push(...concepts);

                  // Create and send ExtractedConcepts object
                  const extractedConcept: ExtractedConcepts = {
                    concepts,
                    race,
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
              } catch (error) {
                console.error('Error processing response:', error);
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'error',
                      error: error instanceof Error ? error.message : 'Unknown error',
                      progress: { processed: processedResponses, total: totalResponses }
                    })}\n\n`
                  )
                );
              }
            }
          }
        }

        // Perform clustering analysis
        // const uniqueConcepts = Array.from(new Set(allConcepts));
        const conceptFrequencies = new Map<string, number>();
        allConcepts.forEach(concept => {
          conceptFrequencies.set(concept, (conceptFrequencies.get(concept) || 0) + 1);
        });

        // After collecting all concepts, perform clustering
        try {
          const clusters = await runConceptClustering(conceptFrequencies);
          
          // Send clustering results
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'clusters',
                clusters
              })}\n\n`
            )
          );
        } catch (error) {
          console.error('Clustering error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: 'Clustering failed: ' + (error instanceof Error ? error.message : 'Unknown error')
              })}\n\n`
            )
          );
        }

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

// Helper function to extract concepts
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