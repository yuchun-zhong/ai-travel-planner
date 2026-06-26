import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Note Buddy - 期末笔记小搭档',
  description:
    '上传教材 PDF，一键生成结构化复习笔记。专为大学生打造的 AI 笔记整理助手。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
