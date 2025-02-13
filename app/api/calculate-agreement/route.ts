import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { join } from 'path';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: Request): Promise<Response> {
  const publicDir = path.join(process.cwd(), 'public');
  const csvPath = path.join(publicDir, 'merged_analysis.csv');
  
  try {
    const data = await req.json();
    
    console.log('Current working directory:', process.cwd());
    console.log('Public directory path:', publicDir);
    console.log('CSV path:', csvPath);
    
    // Ensure public directory exists
    try {
      await fs.access(publicDir);
      console.log('Public directory exists');
    } catch {
      console.log('Creating public directory...');
      await fs.mkdir(publicDir, { recursive: true });
    }
    
    // Log CSV content length
    console.log('CSV content length:', data.mergedCsv.length);
    
    // Write CSV file with explicit encoding
    try {
      await fs.writeFile(csvPath, data.mergedCsv, {
        encoding: 'utf-8',
        flag: 'w'
      });
      console.log('CSV file written successfully');
      
      // Verify file exists
      const stats = await fs.stat(csvPath);
      console.log('CSV file size:', stats.size);
    } catch (writeError) {
      console.error('Error writing CSV file:', writeError);
      throw writeError;
    }
    
    const pythonResult = await new Promise<Response>((resolve) => {
      console.log('Spawning Python process...');
      const pythonProcess = spawn('python', [
        join(process.cwd(), 'new_agreement_score.py')
      ]);

      let result = '';
      let error = '';

      pythonProcess.stdout.on('data', (data) => {
        result += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        const errorStr = data.toString();
        console.error('Python stderr:', errorStr);
        error += errorStr;
      });

      pythonProcess.on('close', async (code) => {
        console.log('Python process exited with code:', code);
        
        // Clean up the CSV file
        try {
          await fs.unlink(csvPath);
          console.log('CSV file cleaned up successfully');
        } catch (e) {
          console.error('Failed to clean up CSV file:', e);
        }

        if (code !== 0) {
          console.error('Python error:', error);
          resolve(NextResponse.json(
            { error: `Python process exited with code ${code}: ${error}` },
            { status: 500 }
          ));
          return;
        }

        try {
          const parsedResult = JSON.parse(result);
          resolve(NextResponse.json(parsedResult));
        } catch (e) {
          console.error('Failed to parse Python output:', e);
          resolve(NextResponse.json(
            { error: `Failed to parse Python output: ${e}` },
            { status: 500 }
          ));
        }
      });

      pythonProcess.on('error', (err) => {
        console.error('Python process error:', err);
        resolve(NextResponse.json(
          { error: `Failed to start Python process: ${err.message}` },
          { status: 500 }
        ));
      });
    });

    return pythonResult;

  } catch (error) {
    console.error('Error in calculate-agreement route:', error);
    // Clean up file if it exists
    try {
      await fs.unlink(csvPath);
    } catch {
      // Ignore cleanup errors
    }
    return NextResponse.json(
      { 
        error: 'Failed to calculate agreement scores', 
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
} 