import { NextRequest, NextResponse } from 'next/server';
import { runAnalysisPipeline } from '@/app/lib/pipeline-service';
import { SelectedParams } from '@/app/types/pipeline';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // Expecting that the body includes both SelectedParams and a userApiKeys mapping.
    const params = await request.json() as SelectedParams & {
      userApiKeys: Record<'openai' | 'anthropic' | 'huggingface', string>
    };
    
    // Validate required fields
    if (!params.model || !params.primaryIssues || params.primaryIssues.length === 0) {
      throw new Error('Missing required parameters: model and primaryIssues');
    }
    if (!params.iterations || params.iterations < 1) {
      throw new Error('Invalid iterations value: must be at least 1');
    }

    // Create your TransformStream for server-sent events
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Start the response stream with the proper headers
    const response = new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    // Run analysis pipeline passing the userApiKeys along with other params
    runAnalysisPipeline(params, params.userApiKeys, async (update: any) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));
    }).then(async (result) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'complete', result })}\n\n`));
      await writer.close();
    }).catch(async (error) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`));
      await writer.close();
    });

    return response;
  } catch (error) {
    console.log('Analysis pipeline error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}