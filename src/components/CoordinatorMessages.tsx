import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, Search } from 'lucide-react';

interface CoordinatorMessage {
  id: string;
  manuscriptId: string;
  authorName: string;
  authorEmail: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  manuscriptTitle: string;
}

interface CoordinatorMessagesProps {
  coordinatorName?: string;
  onSendReply?: (manuscriptId: string, message: string) => void;
}

export default function CoordinatorMessages({ coordinatorName = 'Coordinator', onSendReply }: CoordinatorMessagesProps) {
  const [messages, setMessages] = useState<CoordinatorMessage[]>([
    {
      id: '1',
      manuscriptId: 'jms-2026-01166',
      authorName: 'Alex G',
      authorEmail: 'alex@gmail.com',
      message: 'Hi, I wanted to check on the status of my submission. Could you provide an update?',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      isRead: false,
      manuscriptTitle: 'Quality Assessment and Grading Classification Method'
    },
    {
      id: '2',
      manuscriptId: 'jms-2026-01167',
      authorName: 'Jane Smith',
      authorEmail: 'jane@example.com',
      message: 'I have a question about the revision feedback provided.',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      isRead: true,
      manuscriptTitle: 'Advanced Machine Learning Applications'
    }
  ]);

  const [selectedMessage, setSelectedMessage] = useState<CoordinatorMessage | null>(null);
  const [replyText, setReplyText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedMessage]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedMessage) return;

    try {
      if (onSendReply) {
        onSendReply(selectedMessage.manuscriptId, replyText);
      }

      // Mark as read
      setMessages(messages.map(m =>
        m.id === selectedMessage.id ? { ...m, isRead: true } : m
      ));

      // Add reply message
      const replyMessage: CoordinatorMessage = {
        id: 'reply-' + Date.now(),
        manuscriptId: selectedMessage.manuscriptId,
        authorName: coordinatorName,
        authorEmail: 'coordinator@journal.org',
        message: replyText,
        timestamp: new Date().toISOString(),
        isRead: true,
        manuscriptTitle: selectedMessage.manuscriptTitle
      };

      setMessages([...messages, replyMessage]);
      setReplyText('');
    } catch (error) {
      console.error('Error sending reply:', error);
    }
  };

  const filteredMessages = messages.filter(msg =>
    msg.authorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    msg.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
    msg.manuscriptTitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const unreadCount = messages.filter(m => !m.isRead).length;

  return (
    <div className="w-full h-full flex flex-col gap-4 p-4 bg-[#f8fcf9]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#008751] text-white flex items-center justify-center font-bold">
            M
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
            <p className="text-sm text-slate-600">
              {unreadCount > 0 ? (
                <span className="text-[#008751] font-semibold">{unreadCount} unread message{unreadCount > 1 ? 's' : ''}</span>
              ) : (
                'All messages read'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Messages List */}
        <div className="w-1/3 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Search */}
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-sm outline-none flex-grow text-slate-800"
              />
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            {filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 p-4">
                <MessageSquare className="w-8 h-8 mb-2 text-slate-300" />
                <p className="text-sm">No messages</p>
              </div>
            ) : (
              filteredMessages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => setSelectedMessage(msg)}
                  className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition ${
                    selectedMessage?.id === msg.id ? 'bg-emerald-50 border-l-4 border-l-[#008751]' : ''
                  } ${!msg.isRead ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-slate-900 text-sm">{msg.authorName}</h4>
                      {!msg.isRead && (
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(msg.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mb-1 truncate">{msg.manuscriptTitle}</p>
                  <p className="text-sm text-slate-700 line-clamp-2">{msg.message}</p>
                </button>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Message Detail */}
        <div className="w-2/3 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
          {selectedMessage ? (
            <>
              {/* Message Header */}
              <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-[#008751] to-[#047857] text-white">
                <h3 className="font-bold text-lg">{selectedMessage.authorName}</h3>
                <p className="text-sm text-emerald-100">{selectedMessage.authorEmail}</p>
                <p className="text-xs text-emerald-200 mt-1">📋 {selectedMessage.manuscriptTitle}</p>
              </div>

              {/* Messages Thread */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f8fcf9]">
                <div className="flex flex-col max-w-[80%] rounded-xl px-4 py-3 bg-white text-slate-900 border border-slate-200">
                  <p className="text-sm leading-relaxed">{selectedMessage.message}</p>
                  <span className="text-xs text-slate-500 mt-2">
                    {new Date(selectedMessage.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Reply Input */}
              <div className="p-4 border-t border-slate-200 bg-white">
                <div className="flex gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply..."
                    rows={3}
                    className="flex-grow bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#008751] text-slate-800 resize-none"
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim()}
                    className="bg-[#008751] hover:bg-[#007043] disabled:bg-slate-300 text-white px-4 py-2 rounded-lg transition flex items-center gap-1 font-semibold text-sm h-fit"
                  >
                    <Send className="w-4 h-4" />
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="text-lg font-medium">Select a message to reply</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
