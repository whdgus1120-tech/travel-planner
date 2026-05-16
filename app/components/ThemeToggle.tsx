'use client';

import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  if (!mounted) return <div className="w-[88px] h-8" />;

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggle}
      title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors select-none"
    >
      <span className="text-sm">{isDark ? '☀️' : '🌙'}</span>
      <span>{isDark ? '라이트' : '다크'}</span>
      {/* Toggle pill */}
      <div className="relative w-8 h-4 rounded-full transition-colors" style={{ backgroundColor: isDark ? '#3b82f6' : '#d1d5db' }}>
        <div
          className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200"
          style={{ left: isDark ? '17px' : '2px' }}
        />
      </div>
    </button>
  );
}
