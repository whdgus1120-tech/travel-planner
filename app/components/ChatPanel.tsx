'use client';

import { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface Props {
  tripId: string;
  mySession: { name: string; color: string } | null;
  chatMessages: ChatMessage[];
  onDeleteMessage?: (id: string) => void;
  onClose?: () => void;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function ChatPanel({ tripId, mySession, chatMessages, onDeleteMessage, onClose }: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || !mySession) return;
    setSending(true);
    setInput('');

    try {
      await supabase.from('chat_messages').insert({
        trip_id: tripId,
        member_name: mySession.name,
        member_color: mySession.color,
        message: msg,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
          <span>💬</span> 채팅
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="채팅 닫기"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {chatMessages.length === 0 ? (
          <div className="text-center text-gray-300 py-8 text-sm">
            <div className="text-3xl mb-2">💬</div>
            <p>첫 번째 메시지를 남겨보세요!</p>
          </div>
        ) : (
          chatMessages.map((msg) => {
            const isMe = mySession?.name === msg.member_name;
            return (
              <div key={msg.id} className={`flex gap-1.5 group ${isMe ? 'flex-row-reverse' : ''}`}>
                {/* Delete button */}
                {onDeleteMessage && (
                  <button
                    onClick={() => onDeleteMessage(msg.id)}
                    className="opacity-0 group-hover:opacity-100 self-center text-gray-300 hover:text-red-400 p-1 rounded-lg transition-all flex-shrink-0"
                    title="메시지 삭제"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}

                {/* Avatar */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: msg.member_color }}
                >
                  {msg.member_name[0]}
                </div>

                <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                  {!isMe && (
                    <span className="text-xs text-gray-400 px-1">{msg.member_name}</span>
                  )}
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                      isMe
                        ? 'text-white rounded-tr-sm'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}
                    style={isMe ? { backgroundColor: mySession?.color } : {}}
                  >
                    {msg.message}
                  </div>
                  <span className="text-xs text-gray-300 px-1">{formatTime(msg.created_at)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-100 flex-shrink-0">
        {!mySession ? (
          <p className="text-xs text-gray-400 text-center py-1">채팅을 사용하려면 여행에 참가하세요</p>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지 입력..."
              disabled={sending}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="bg-blue-500 text-white px-3 py-2 rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
