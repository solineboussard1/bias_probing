import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { AnalysisResult } from '@/app/types/pipeline';

export async function POST(req: Request): Promise<Response> {
  try {
    console.log('Starting embeddings extraction...');
    const results: AnalysisResult[] = await req.json();
    
    // Extract all responses from the results
    const responses: { response: string; race: string }[] = [];
    results.forEach(result => {
      result.prompts.forEach(prompt => {
        prompt.responses.forEach(response => {
          const race = prompt.metadata.demographics.find(d => 
            ['Asian', 'Black', 'Hispanic', 'White'].includes(d)
          ) || 'Unknown';
          
          responses.push({ response, race });
        });
      });
    });

    console.log(`Processed ${responses.length} responses`);
    
    // Run Python script
    const pythonScript = path.join(process.cwd(), 'app', 'python', 'embeddings_extractor.py');
    console.log('Launching Python script:', pythonScript);
    
    const pythonResult = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const pythonProcess = spawn('python', [pythonScript]);
      let outputData = '';
      let errorData = '';

      pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        console.log('Python stdout:', chunk);
        outputData += chunk;
      });

      pythonProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        console.error('Python stderr:', chunk);
        errorData += chunk;
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${errorData}`));
          return;
        }

        try {
          // Find the last line that contains valid JSON
          const outputLines = outputData.trim().split('\n');
          const lastLine = outputLines[outputLines.length - 1];
          const result = JSON.parse(lastLine);
          
          if (result.error) {
            reject(new Error(result.error));
            return;
          }
          resolve(result);
        } catch (error) {
          console.error('Failed to parse Python output:', outputData);
          reject(new Error(`Failed to parse Python output: ${error}`));
        }
      });

      // Send the input data
      const inputJson = JSON.stringify(responses);
      console.log('Sending input to Python:', inputJson.slice(0, 200) + '...');
      pythonProcess.stdin.write(inputJson);
      pythonProcess.stdin.end();
    });

    return NextResponse.json(pythonResult);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Embeddings extraction failed:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 