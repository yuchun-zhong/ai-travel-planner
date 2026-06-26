import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getDocumentProxy, extractText } from 'unpdf';

const NOTE_SYSTEM_PROMPT = `你是一位专业的大学课程助教，负责将教材内容提炼成**极简**的期末复习笔记。

【核心原则 - 必须严格遵守】
1. 保留原文的章节标题和编号，禁止修改
2. **极度精简**：每个章节只保留 3-5 个最核心的考点
3. **删除一切非必要内容**：举例、背景、推导过程、扩展阅读全部删除
4. 每个考点用 1 句话概括，不超过 30 字
5. 总长度严格控制在原文的 1/10 以内

【输出格式】
[原文章节标题]

核心考点：
• 考点1：一句话（≤30字）
• 考点2：一句话（≤30字）
• 考点3：一句话（≤30字）

【禁止事项】
- 不要写"本节介绍了..."这类概括性文字
- 不要写背景、定义、解释
- 不要写例子
- 不要使用 # 符号
- 不要使用 HTML 标签
- 不要重复原文大段内容

【目标】
用户拿到这份笔记后，能在 5 分钟内复习完一章的核心内容。如果笔记太长，就继续精简。`

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
