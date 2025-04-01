import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { AnalysisResult, LDAResult } from '@/app/types/pipeline';

export async function POST(req: Request): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        console.log('Starting LDA concept extraction...');
        const results: AnalysisResult[] = await req.json();

        function getDemographicCategory(demo: string): string | null {
          const demoLower = demo.toLowerCase();
          if (['woman', 'man', 'non-binary'].includes(demoLower)) return 'genders';
          if (['young adult', 'middle-aged', 'elderly'].includes(demoLower)) return 'ages';
          if (['asian', 'black', 'hispanic', 'white', 'other'].includes(demoLower)) return 'ethnicities';
          if (['low income', 'middle income', 'high income'].includes(demoLower)) return 'socioeconomic';
          return null;
        }

        const responses = results.flatMap(result =>
          result.prompts.flatMap(prompt => {
            let demographics: { category: string; value: string }[] = [];
            if (prompt.metadata.demographics && prompt.metadata.demographics.length > 0) {
              if (
                prompt.metadata.demographics.length === 1 &&
                prompt.metadata.demographics[0].toLowerCase() === 'baseline'
              ) {
                demographics = [{ category: 'baseline', value: 'baseline' }];
              } else {
                demographics = prompt.metadata.demographics.map(demo => {
                  const demoLower = demo.toLowerCase();
                  if (demoLower === 'baseline') {
                    return { category: 'baseline', value: 'baseline' };
                  }
                  const category = getDemographicCategory(demo) || 'all';
                  return { category, value: demo };
                });
              }
            } else {
              demographics = [{ category: 'baseline', value: 'baseline' }];
            }

            return prompt.responses.map(response => ({
              text: response,
              demographics
            }));
          })
        );

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

        pythonProcess.stdin.write(JSON.stringify(responses));
        pythonProcess.stdin.end();

        let outputData = '';

        pythonProcess.stdout.on('data', (data) => {
          outputData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          console.error(`Python Error: ${data}`);
          if (data.toString().toLowerCase().includes('error')) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'error', error: data.toString() })}\n\n`
              )
            );
          }
        });

        pythonProcess.on('close', (code) => {
          if (code === 0) {
            try {
              const ldaResults: LDAResult = JSON.parse(outputData);
              if (ldaResults.error) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'error', error: ldaResults.error })}\n\n`
                  )
                );
              } else {
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

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'complete', message: 'LDA concept extraction completed' })}\n\n`
                  )
                );
              }
            } catch {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'error', message: 'Failed to parse Python output' })}\n\n`
                )
              );
            }
          } else {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'error',
                  message: 'Python process exited with non-zero code'
                })
              )
            );
          }
          controller.close();
        });

      } catch (error) {
        console.error('Concept extraction failed:', error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' })}\n\n`
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
