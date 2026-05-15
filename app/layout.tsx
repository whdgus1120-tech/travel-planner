import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '트립플래너 - 함께 여행 계획하기',
  description: '여행 동반자와 함께 실시간으로 여행을 계획하세요',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
