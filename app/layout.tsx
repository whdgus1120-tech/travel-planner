import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '트립플래너 - 함께 여행 계획하기',
  description: '여행 동반자와 함께 실시간으로 여행을 계획하세요',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 다크모드 플래시 방지: 렌더링 전에 동기적으로 클래스 적용 */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark');}catch(e){}` }} />
      </head>
      <body className="bg-gray-50 min-h-screen">
        {children}
        <footer className="fixed bottom-1 right-2 text-[10px] text-gray-300 z-10 pointer-events-none select-none">
          © 2025 ParkJongHyun. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
