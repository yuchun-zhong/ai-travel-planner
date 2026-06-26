import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getDocumentProxy, extractText } from 'unpdf';

const NOTE_SYSTEM_PROMPT = `你是一位专业的大学课程助教，擅长将教材内容提炼成精简的期末复习笔记。

请严格按照以下格式整理笔记，务必精简，不要照搬原文：
1. 使用中文输出，语言简洁准确
2. 先用一句话概括本节/本章的**核心主题**
3. 列出**关键概念**（3-5个最重要的术语，每个配1句简短解释）
4. 用简洁的要点列表归纳**核心知识点**，每个要点不超过2行
5. 重要定义、定理、公式用**加粗**标记
6. 用 star 标注考试高频考点（最多3个）
7. 结尾附上**速记卡片**（3条最关键的结论，每条一句话）

注意：
- 使用 Markdown 格式输出，不要使用 HTML 标签
- 内容要高度精简，只保留考试必考的核心内容
- 删除所有举例、背景介绍、扩展阅读等非必要内容
- 总长度控制在原文的 1/5 以内`;

function chunkText(text: string, chunkSize: number = 6000, overlap: number = 300): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    if (end < text.length) {
      const searchStart = Math.max(start, end - 300);
      const breakPoint = text.lastIndexOf('\n', searchStart + (end - searchStart));
      if (breakPoint > start) {
        end = breakPoint + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    start = end - overlap;
  }

  return chunks;
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(uint8Array);
  const result = await extractText(pdf, { mergePages: true });

  return result.text;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: '请选择PDF文件' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (file.type !== 'application/pdf') {
      return new Response(
        JSON.stringify({ success: false, error: '仅支持PDF格式文件' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (file.size > 50 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ success: false, error: '文件大小不能超过50MB' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Extract text from PDF
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let pdfText: string;
    try {
      pdfText = await extractTextFromPdf(buffer);
    } catch (pdfError) {
      const errMsg = pdfError instanceof Error ? pdfError.message : String(pdfError);
      console.error('[PDF Parse Error]', errMsg);
      return new Response(
        JSON.stringify({ success: false, error: `PDF解析失败: ${errMsg}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!pdfText || pdfText.trim().length < 50) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'PDF中未提取到足够的文字内容，可能是扫描件或图片PDF'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Chunk the text
    const chunks = chunkText(pdfText);
    const totalChunks = chunks.length;

    // Initialize LLM client
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // Create a ReadableStream for SSE
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial info
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'info',
                message: `PDF解析成功，共 ${totalChunks} 个文本段落，开始生成笔记...`,
                totalChunks
              })}\n\n`
            )
          );

          let allNotes = '';

          for (let i = 0; i < totalChunks; i++) {
            const chunk = chunks[i];

            // Send progress update
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'progress',
                  current: i + 1,
                  total: totalChunks,
                  message: `正在处理第 ${i + 1}/${totalChunks} 部分...`
                })}\n\n`
              )
            );

            const userPrompt = `以下是教材的第 ${i + 1}/${totalChunks} 部分内容，请整理成笔记：

${chunk}`;

            const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
              { role: 'system' as const, content: NOTE_SYSTEM_PROMPT },
              { role: 'user' as const, content: userPrompt }
            ];

            if (totalChunks === 1) {
              // Single chunk - stream directly
              const llmStream = client.stream(messages, {
                model: 'doubao-seed-2-0-mini-260215',
                temperature: 0.3
              });

              let chunkContent = '';
              for await (const llmChunk of llmStream) {
                if (llmChunk.content) {
                  const text = llmChunk.content.toString();
                  chunkContent += text;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: 'content',
                        text
                      })}\n\n`
                    )
                  );
                }
              }
              allNotes += chunkContent;
            } else {
              // Multiple chunks - use invoke for each, then combine
              const response = await client.invoke(messages, {
                model: 'doubao-seed-2-0-mini-260215',
                temperature: 0.3
              });

              const chunkNotes = response.content;
              allNotes += chunkNotes;

              // Stream this chunk's content
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'content',
                    text: chunkNotes
                  })}\n\n`
                )
              );

              if (i < totalChunks - 1) {
                allNotes += '\n\n---\n\n';
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'content',
                      text: '\n\n---\n\n'
                    })}\n\n`
                  )
                );
              }
            }
          }

          // Send completion
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
                success: true,
                message: '笔记生成完成！'
              })}\n\n`
            )
          );

          controller.close();
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'AI处理失败，请稍后重试';
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: errorMsg
              })}\n\n`
            )
          );
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '服务器内部错误';
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
