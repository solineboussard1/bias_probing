import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { AnalysisResult, LDAResult } from '@/app/types/pipeline';

export async function POST(req: Request): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const results: AnalysisResult[] = await req.json();

        // Helper function for mapping a demographic string to its category.
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

        // Extract all responses from the results with demographics information.
        const responses: { 
          text: string; 
          demographics: { category: string; value: string }[]; 
        }[] = [];

        results.forEach(result => {
          result.prompts.forEach(prompt => {
            // Build demographics array for this prompt.
            let demographics: { category: string; value: string }[] = [];
            if (prompt.metadata.demographics && prompt.metadata.demographics.length > 0) {
              expectedCategories.forEach(category => {
                const matchingDemo = prompt.metadata.demographics.find(
                  demo => getDemographicCategory(demo) === category
                );
                demographics.push({
                  category,
                  value: matchingDemo || 'baseline'
                });
              });
            } else {
              demographics = expectedCategories.map(category => ({
                category,
                value: 'baseline'
              }));
            }

            prompt.responses.forEach(response => {
              responses.push({
                text: response,
                demographics
              });
            });
          });
        });

        // Send initial progress update.
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'extraction_progress',
              message: 'Starting LDA concept extraction',
              progress: { processed: 0, total: responses.length }
            })}\n\n`
          )
        );

        // Run Python script.
        const pythonScript = path.join(process.cwd(), 'app', 'python', 'lda_extractor.py');
        const pythonProcess = spawn('python', [pythonScript]);

        // Send the responses to the Python script.
        pythonProcess.stdin.write(JSON.stringify(responses));
        pythonProcess.stdin.end();

        let outputData = '';

        pythonProcess.stdout.on('data', (data) => {
          outputData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          console.error(`Python Error: ${data}`);
          // Only send actual errors, not debug info.
          if (data.toString().toLowerCase().includes('error')) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  error: data.toString()
                })}\n\n`
              )
            );
          }
        });

        pythonProcess.on('close', (code) => {
          if (code === 0) {
            try {
              const ldaResults = JSON.parse(outputData) as LDAResult;

              if (ldaResults.error) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'error',
                      error: ldaResults.error
                    })}\n\n`
                  )
                );
              } else {
                // Send the extracted topics and distributions.
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'lda_concepts',
                      topics: ldaResults.topics,
                      distributions: ldaResults.distributions,
                      demographicDistributions: ldaResults.demographicDistributions, 
                      progress: { processed: responses.length, total: responses.length }
                    })}\n\n`
                  )
                );
                  
                

              // Send completion message.
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'complete',
                    message: 'LDA concept extraction completed'
                  })}\n\n`
                )
              );
                }
            } catch {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'error',
                    error: 'Failed to parse Python output'
                  })}\n\n`
                )
              );
            }
          } else {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  error: `Python process exited with code ${code}`
                })}\n\n`
              )
            );
          }
          controller.close();
        });

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
