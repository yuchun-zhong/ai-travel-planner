import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getDocumentProxy, extractText } from 'unpdf';

const NOTE_SYSTEM_PROMPT = `你是大学期末复习助教。任务：把教材压缩成**极简**背诵卡片。

【铁律 - 违反任何一条即为失败】
1. 原文标题一字不改保留
2. 每章只留 3 个必考点，每个考点**一行话**（≤25字）
3. 总字数 ≤ 原文的 1/15
4. 删除：定义、解释、举例、背景、推导、总结段

【格式 - 严格按此输出】
第一章 XXX

• 考点A：一句话
• 考点B：一句话
• 考点C：一句话

第二章 XXX

• 考点A：一句话
• 考点B：一句话
• 考点C：一句话

【禁止】
- 不写"本章介绍""本节内容"等废话
- 不用 # 符号
- 不用表格
- 不解释概念
- 不举例
- 不写背景

【检验标准】
用户拿到后能直接背诵，不需要再读原文。如果超过 3 页 A4 纸，就是太长。`

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
