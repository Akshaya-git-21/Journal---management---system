import React, { useState, useEffect, useRef } from 'react';
import { DiscussionRow, postDiscussionMessage } from '../lib/workflow';
import { Send, Loader2 } from 'lucide-react';

interface DiscussionsTabProps {
  manuscriptId: string;
  discussions: DiscussionRow[];
  currentUserId?: string;
  profiles: Record<string, { name: string; email?: string }>;
  onMessageSent?: () => void;
}

export default function DiscussionsTab({
  manuscriptId,
  discussions,
  currentUserId,
  profiles,
  onMessageSent
}: DiscussionsTabProps) {
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [discussions]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !currentUserId) return;

    setIsSending(true);
    setError('');

    try {
      await postDiscussionMessage(manuscriptId, currentUserId, messageText.trim());
      setMessageText('');
      onMessageSent?.();
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col h-[600px]">
      <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">Discussion Thread</h3>

      {/* Messages Display */}
      <div className="flex-grow overflow-y-auto space-y-3 mb-4 bg-slate-50 rounded-lg p-4">
        {discussions && discussions.length > 0 ? (
          <>
            {discussions.map((msg) => {
              const senderProfile = profiles[msg.sender_id];
              const senderName = senderProfile?.name || 'Unknown User';
              const isCurrentUser = msg.sender_id === currentUserId;

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`flex-1 ${
                      isCurrentUser
                        ? 'bg-emerald-100 text-slate-900 rounded-lg rounded-tr-none'
                        : 'bg-white border border-slate-200 text-slate-900 rounded-lg rounded-tl-none'
                    } p-3`}
                  >
                    <p className="text-xs font-semibold text-slate-700 mb-1">{senderName}</p>
                    <p className="text-sm leading-relaxed">{msg.message}</p>
                    {msg.file_name && (
                      <p className="text-xs text-slate-600 mt-2 border-t border-current pt-2">
                        📎 {msg.file_name} ({msg.file_size})
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500">
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        )}
      </div>

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="border-t pt-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-2 mb-3">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type your message..."
            disabled={isSending}
            className="flex-grow px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={isSending || !messageText.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
