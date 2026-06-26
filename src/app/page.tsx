'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface StreamEvent {
  type: 'info' | 'progress' | 'content' | 'done' | 'error';
  message?: string;
  text?: string;
  error?: string;
  current?: number;
  total?: number;
  totalChunks?: number;
  success?: boolean;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const notesContentRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // No auto-scroll during streaming - keep progress bar visible

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      setError('仅支持 PDF 格式文件');
      return;
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('文件大小不能超过 50MB');
      return;
    }
    setFile(selectedFile);
    setError('');
    setNotes('');
    setProgress(0);
    setStatusMessage('');
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!file) {
      setError('请先选择 PDF 文件');
      return;
    }

    setIsProcessing(true);
    setIsStreaming(true);
    setError('');
    setNotes('');
    setProgress(0);
    setStatusMessage('正在上传并解析 PDF...');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
        signal: abortController.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '请求失败');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));

              switch (event.type) {
                case 'info':
                  setStatusMessage(event.message || '');
                  break;
                case 'progress':
                  if (event.total && event.current) {
                    const pct = Math.round((event.current / event.total) * 80);
                    setProgress(pct);
                  }
                  setStatusMessage(event.message || '');
                  break;
                case 'content':
                  if (event.text) {
                    setNotes(prev => prev + event.text);
                    setProgress(prev => Math.min(prev + 1, 95));
                  }
                  break;
                case 'done':
                  setProgress(100);
                  setStatusMessage(event.message || '笔记生成完成！');
                  setIsStreaming(false);
                  break;
                case 'error':
                  throw new Error(event.error || 'AI 处理失败');
              }
            } catch (parseError) {
              if (parseError instanceof Error && parseError.message !== 'AI 处理失败') {
                // Skip parse errors for incomplete lines
              } else {
                throw parseError;
              }
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatusMessage('已取消');
      } else {
        const msg = err instanceof Error ? err.message : '生成失败，请稍后重试';
        setError(msg);
        setStatusMessage('');
      }
      setIsStreaming(false);
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  }, [file]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsProcessing(false);
    setIsStreaming(false);
    setStatusMessage('已取消');
  }, []);

  const handleCopy = useCallback(async () => {
    if (!notes) return;
    // Strip markdown # symbols for cleaner plain text
    const cleanText = notes
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '');
    try {
      await navigator.clipboard.writeText(cleanText);
      setStatusMessage('已复制到剪贴板');
      setTimeout(() => setStatusMessage(''), 2000);
    } catch {
      // Fallback for environments where clipboard API is unavailable
      const textarea = document.createElement('textarea');
      textarea.value = cleanText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setStatusMessage('已复制到剪贴板');
        setTimeout(() => setStatusMessage(''), 2000);
      } catch {
        setStatusMessage('复制失败，请手动复制');
        setTimeout(() => setStatusMessage(''), 2000);
      }
      document.body.removeChild(textarea);
    }
  }, [notes]);

  const handleDownload = useCallback(async () => {
    if (!notes) return;

    try {
      const content = notesContentRef.current;
      if (!content) return;

      // Create hidden iframe for printing
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:none;z-index:99999;background:#fff;';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument;
      if (!doc) {
        document.body.removeChild(iframe);
        setStatusMessage('PDF 生成失败，请重试');
        setTimeout(() => setStatusMessage(''), 3000);
        return;
      }

      // Write content with full styles
      doc.open();
      doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>学习笔记</title>
<link rel="preconnect" href="https://fonts.googleapis.cn">
<link rel="preconnect" href="https://fonts.gstatic.cn" crossorigin>
<link href="https://fonts.googleapis.cn/css2?family=Noto+Sans+SC:wght@400;600&family=Noto+Serif+SC:wght@600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 20mm 18mm; }
  body {
    font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #3D3229; line-height: 2; font-size: 13px;
    margin: 0; padding: 20px 30px;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: "Noto Serif SC", "SimSun", serif;
    color: #4A6741; line-height: 1.4;
    page-break-after: avoid;
  }
  h1 {
    font-size: 22px; text-align: center;
    margin: 0 0 18px; padding-bottom: 12px;
    border-bottom: 2.5px solid #4A6741;
  }
  h2 {
    font-size: 17px; margin: 24px 0 10px;
    border-bottom: 1.5px solid #D4A853; padding-bottom: 6px;
  }
  h3 { font-size: 14px; margin: 16px 0 8px; color: #5A7A50; }
  p { margin: 6px 0; text-align: justify; }
  ul, ol { padding-left: 22px; margin: 8px 0; }
  li { margin: 4px 0; }
  strong, b { color: #4A6741; font-weight: 600; }
  blockquote {
    border-left: 3px solid #4A6741; padding: 8px 14px;
    margin: 12px 0; color: #6B5D4F; font-size: 12px;
    background: #FAF8F3; border-radius: 0 4px 4px 0;
  }
  code {
    background: #F5F1EB; padding: 1px 5px; border-radius: 3px;
    font-size: 11px; color: #4A6741;
  }
  pre {
    background: #F5F1EB; padding: 14px; border-radius: 6px;
    font-size: 11px; white-space: pre-wrap; word-break: break-all;
    margin: 10px 0; border: 1px solid #E8E0D4;
  }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  td, th {
    border: 1px solid #E8E0D4; padding: 8px 12px;
    text-align: left; font-size: 12px;
  }
  th { background: #F5F1EB; font-weight: 600; color: #4A6741; }
  tr:nth-child(even) { background: #FDFCFA; }
  hr { border: none; border-top: 1px solid #E8E0D4; margin: 16px 0; }
  table, pre, blockquote { page-break-inside: avoid; }

  .toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    background: #4A6741; color: #fff;
    padding: 12px 20px; display: flex; align-items: center; gap: 12px;
    font-family: "Noto Sans SC", sans-serif; font-size: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  .toolbar button {
    background: #fff; color: #4A6741; border: none;
    padding: 8px 20px; border-radius: 6px; cursor: pointer;
    font-weight: 600; font-size: 14px;
  }
  .toolbar button:hover { background: #f0f0f0; }
  .toolbar .tip { opacity: 0.85; font-size: 12px; }
  @media print {
    .toolbar { display: none !important; }
    body { padding: 0; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <button onclick="window.print()">💾 保存为 PDF</button>
  <button onclick="window.parent.document.body.removeChild(window.frameElement)">✕ 关闭</button>
  <span class="tip">提示：在打印对话框中选择"另存为 PDF"即可下载</span>
</div>
${content.innerHTML}
</body>
</html>`);
      doc.close();

      // Wait for fonts to load
      await doc.fonts.ready;
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error('[PDF Export] Error:', err);
      setStatusMessage('PDF 生成失败，请重试');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  }, [notes, file]);

  const handleReset = useCallback(() => {
    setFile(null);
    setNotes('');
    setError('');
    setProgress(0);
    setStatusMessage('');
    setIsProcessing(false);
    setIsStreaming(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="text-center pt-16 pb-10 px-5 relative">
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="text-3xl">🌿</span>
          <h1
            className="text-4xl font-bold tracking-wider"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--foreground)' }}
          >
            AI 笔记小搭档
          </h1>
        </div>
        <p className="text-base" style={{ color: 'var(--muted-foreground)' }}>
          上传教材 PDF，一键生成期末复习重点笔记
        </p>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-5 pb-20">
        {/* Upload Area */}
        {!isProcessing && !notes && (
          <section className="mb-8">
            <div
              className="bg-white rounded-xl shadow-lg overflow-hidden"
              style={{ border: '1px solid var(--border)' }}
            >
              <div
                ref={dropZoneRef}
                className={`drop-zone m-6 ${isDragging ? 'drag-over' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="text-center">
                  <div className="text-5xl mb-4 opacity-80">📄</div>
                  <h3
                    className="text-lg font-semibold mb-2"
                    style={{
                      fontFamily: 'var(--font-serif)',
                      color: 'var(--foreground)'
                    }}
                  >
                    {file ? file.name : '将 PDF 文件拖拽到此处'}
                  </h3>
                  {file ? (
                    <p style={{ color: 'var(--muted-foreground)' }}>
                      {formatFileSize(file.size)} · 点击下方按钮开始生成
                    </p>
                  ) : (
                    <p style={{ color: 'var(--muted-foreground)' }}>
                      支持拖拽或点击选择 PDF 文件（最大 50MB）
                    </p>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
              </div>

              {/* Action buttons */}
              {file && (
                <div className="flex gap-3 px-6 pb-6">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGenerate();
                    }}
                    className="flex-1 py-3 px-6 rounded-lg text-white font-medium transition-all duration-300 hover:opacity-90 hover:-translate-y-0.5"
                    style={{ background: 'var(--primary)' }}
                  >
                    🌿 开始生成笔记
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReset();
                    }}
                    className="py-3 px-4 rounded-lg font-medium transition-all duration-300 hover:opacity-80"
                    style={{
                      background: 'var(--secondary)',
                      color: 'var(--foreground)'
                    }}
                  >
                    移除
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Error Message */}
        {error && (
          <div
            className="mb-6 p-4 rounded-lg flex items-start gap-3"
            style={{
              background: 'rgba(198, 123, 107, 0.1)',
              border: '1px solid rgba(198, 123, 107, 0.3)'
            }}
          >
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-medium" style={{ color: 'var(--destructive)' }}>
                {error}
              </p>
              <button
                onClick={() => setError('')}
                className="text-sm mt-1 underline"
                style={{ color: 'var(--muted-foreground)' }}
              >
                关闭
              </button>
            </div>
          </div>
        )}

        {/* Processing State */}
        {isProcessing && (
          <section className="mb-8">
            <div
              className="bg-white rounded-xl shadow-lg p-8 text-center"
              style={{ border: '1px solid var(--border)' }}
            >
              <div className="text-4xl mb-4">🌱</div>
              <h3
                className="text-lg font-semibold mb-2"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                正在生成笔记
              </h3>
              <p
                className="text-sm mb-6"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {statusMessage || '准备中...'}
              </p>

              {/* Progress bar */}
              <div className="vine-progress mb-3">
                <div
                  className="vine-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--primary)' }}
              >
                {progress}%
              </p>

              {/* Cancel button */}
              <button
                onClick={handleCancel}
                className="mt-6 text-sm underline"
                style={{ color: 'var(--muted-foreground)' }}
              >
                取消生成
              </button>
            </div>
          </section>
        )}

        {/* Notes Result */}
        {notes && (
          <section className="mb-8">
            <div
              className="bg-white rounded-xl shadow-lg overflow-hidden"
              style={{ border: '1px solid var(--border)' }}
            >
              {/* Result header */}
              <div
                className="flex items-center justify-between px-6 py-4"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <span>📝</span>
                  <h3
                    className="font-semibold"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    生成的笔记
                  </h3>
                  {isStreaming && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: 'rgba(74, 103, 65, 0.1)',
                        color: 'var(--primary)'
                      }}
                    >
                      生成中...
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isStreaming && (
                    <>
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-all duration-200 hover:opacity-80"
                        style={{
                          background: 'var(--secondary)',
                          color: 'var(--foreground)'
                        }}
                      >
                        📋 复制
                      </button>
                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-all duration-200 hover:opacity-80"
                        style={{
                          background: 'var(--secondary)',
                          color: 'var(--foreground)'
                        }}
                      >
                        💾 下载 PDF
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Notes content */}
              <div className="px-6 py-6 max-h-[70vh] overflow-y-auto">
                <div
                  ref={notesContentRef}
                  className={`notes-content ${isStreaming ? 'streaming-cursor' : ''}`}
                >
                  <MarkdownRenderer content={notes} />
                </div>
                <div ref={notesEndRef} />
              </div>

              {/* Footer actions */}
              {!isStreaming && (
                <div
                  className="px-6 py-4 flex justify-between items-center"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <p
                    className="text-sm"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    {statusMessage || '笔记生成完成'}
                  </p>
                  <button
                    onClick={handleReset}
                    className="text-sm px-4 py-2 rounded-lg transition-all duration-200 hover:opacity-80"
                    style={{
                      background: 'var(--primary)',
                      color: 'white'
                    }}
                  >
                    处理新文件
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Tips Section */}
        {!isProcessing && !notes && !file && (
          <section className="mt-12">
            <div
              className="rounded-xl p-6"
              style={{
                background: 'rgba(212, 168, 83, 0.08)',
                border: '1px solid rgba(212, 168, 83, 0.2)'
              }}
            >
              <h3
                className="font-semibold mb-3 flex items-center gap-2"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                💡 使用小贴士
              </h3>
              <ul
                className="space-y-2 text-sm"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <li>• 上传文字版 PDF 效果最佳（非扫描件）</li>
                <li>• 支持中英文教材，自动生成中文笔记</li>
                <li>• 生成结果可一键复制或下载为 PDF 文件</li>
                <li>• 笔记会自动标注重点和考点，方便复习</li>
                <li>• 无需注册登录，无需配置 API Key，开箱即用</li>
              </ul>
            </div>
          </section>
        )}
      </main>

      {/* Toast */}
      {statusMessage && !isProcessing && notes && (
        <div className="toast show">{statusMessage}</div>
      )}
    </div>
  );
}

// Simple Markdown renderer component
function MarkdownRenderer({ content }: { content: string }) {
  const renderMarkdown = (text: string): string => {
    let html = text
      // Escape HTML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headers
    html = html.replace(/^####\s+(.*)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Code blocks
    html = html.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      '<pre><code class="language-$1">$2</code></pre>'
    );

    // Inline code
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');

    // Blockquotes
    html = html.replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr />');

    // Unordered lists
    html = html.replace(/^[-*]\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Star markers (replace "star" with actual star emoji)
    html = html.replace(/⭐/g, '<span style="color: var(--accent)">⭐</span>');

    // Paragraphs - wrap remaining text lines
    html = html.replace(/^(?!<[huplbhod]|<li|<hr|<pre|<block)(.+)$/gm, (match) => {
      if (match.trim() === '') return '';
      return `<p>${match}</p>`;
    });

    // Line breaks
    html = html.replace(/\n\n/g, '\n');

    return html;
  };

  return (
    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
  );
}
