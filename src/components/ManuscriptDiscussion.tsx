import React, { useState } from 'react';
import { Manuscript, DiscussionMessage, Role } from '../types';
import { MessagesSquare, Send, Paperclip, Trash2, User, FileText, CheckCircle2 } from 'lucide-react';
import { syncManuscriptDiscussionsToSupabase } from '../lib/supabase';

interface ManuscriptDiscussionProps {
  manuscript: Manuscript;
  onUpdateManuscript: (updated: Manuscript) => void;
  currentUser?: { name: string; email: string } | null;
  currentRole: Role;
  title?: string;
}

export default function ManuscriptDiscussion({
  manuscript,
  onUpdateManuscript,
  currentUser,
  currentRole,
  title = "Review Discussions"
}: ManuscriptDiscussionProps) {
  const [inputText, setInputText] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: string } | null>(null);
  const [triggerMention, setTriggerMention] = useState(false);

  const senderName = currentUser?.name || (
    currentRole === 'AUTHOR' ? 'Dr. Ada Lovelace' :
    currentRole === 'EDITOR' ? 'Dr. Alan Turing' :
    currentRole === 'REVIEWER' ? 'Prof. Grace Hopper' : 'System Controller'
  );
  const senderEmail = currentUser?.email || (
    currentRole === 'AUTHOR' ? 'ada@computing.org' :
    currentRole === 'EDITOR' ? 'turing@enigma.labs' :
    currentRole === 'REVIEWER' ? 'grace@cober.org' : 'system@jms-core.org'
  );

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !attachedFile) return;

    const newMessage: DiscussionMessage = {
      id: 'msg-' + Date.now(),
      senderName,
      senderEmail,
      senderRole: currentRole,
      text: inputText,
      timestamp: new Date().toISOString(),
      fileName: attachedFile?.name || null,
      fileSize: attachedFile?.size || null
    };

    const updatedDiscussions = [...(manuscript.discussions || []), newMessage];
    const updated: Manuscript = {
      ...manuscript,
      discussions: updatedDiscussions
    };

    onUpdateManuscript(updated);
    try {
      await syncManuscriptDiscussionsToSupabase(manuscript.id, updatedDiscussions);
    } catch (err) {
      console.warn("Could not sync discussion message directly to Supabase:", err);
    }
    setInputText('');
    setAttachedFile(null);
    setTriggerMention(false);
  };

  const simulateAttachFile = () => {
    const demoFiles = [
      { name: 'response_to_reviewers_v2.pdf', size: '1.2 MB' },
      { name: 'experimental_data_raw.csv', size: '4.8 MB' },
      { name: 'compiler_benchmarks_sheet.xlsx', size: '1.5 MB' },
      { name: 'methods_diagram_highres.png', size: '840 KB' }
    ];
    const chosen = demoFiles[Math.floor(Math.random() * demoFiles.length)];
    setAttachedFile(chosen);
  };

  const handleMentionSelect = (mentionType: string) => {
    setInputText(prev => prev + mentionType + ' ');
    setTriggerMention(false);
  };

  const getRoleBadgeClasses = (role: Role) => {
    switch (role) {
      case 'EDITOR':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'AUTHOR':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'REVIEWER':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'PUBLISHER':
        return 'bg-emerald-50 text-emerald-700 border-emerald-150';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div id="manuscript-discussion-board" className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm text-left">
      {/* Discussion Header */}
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-[#008751] rounded-lg">
            <MessagesSquare className="w-5 h-5" />
          </span>
          <div>
            <h3 className="font-sans font-bold text-sm">{title}</h3>
            <p className="text-[10px] text-gray-400 font-mono">Isolated double-blind message logs & file transmissions</p>
          </div>
        </div>
        <div className="text-[10px] bg-[#004d2e] text-[#aef4d5] px-2.5 py-1 rounded-md border border-[#006e42] font-mono uppercase">
          Authorized Scope Only
        </div>
      </div>

      <div className="flex flex-col h-[380px]">
        {/* Message List */}
        <div className="flex-grow p-5 space-y-4 overflow-y-auto bg-slate-50/20 max-h-[290px]">
          {manuscript.discussions && manuscript.discussions.length > 0 ? (
            manuscript.discussions.map((msg) => {
              // ANONYMITY SAFEGUARD check
              const displaySenderName = (manuscript.isDoubleBlind && msg.senderRole === 'REVIEWER' && currentRole === 'AUTHOR') 
                ? 'Anonymous Referee' 
                : ((manuscript.isDoubleBlind && msg.senderRole === 'AUTHOR' && currentRole === 'REVIEWER') ? 'Anonymous Author' : msg.senderName);

              return (
                <div key={msg.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-xs">{displaySenderName}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold uppercase ${getRoleBadgeClasses(msg.senderRole)}`}>
                      {msg.senderRole}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {isNaN(Date.parse(msg.timestamp)) 
                        ? msg.timestamp 
                        : new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="bg-white border rounded-2xl p-3 text-xs leading-relaxed max-w-xl text-slate-700 shadow-sm">
                    <p>{msg.text}</p>

                    {msg.fileName && (
                      <div className="mt-2.5 pt-2 border-t flex items-center justify-between text-[10px] bg-slate-100 p-2 rounded-lg text-slate-600">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-emerald-500" />
                          <strong>{msg.fileName}</strong> ({msg.fileSize})
                        </span>
                        <span className="text-emerald-700 font-mono text-[9px] uppercase font-bold shrink-0">Attached File Attachment</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 text-slate-400 font-sans">
              <MessagesSquare className="w-10 h-10 mx-auto text-gray-300 stroke-1 animate-pulse" />
              <p className="font-semibold text-xs mt-2 text-slate-500">No message transmissions recorded yet.</p>
              <p className="text-[10px] mt-1">Initiate a thread to communicate securely regarding adjustments.</p>
            </div>
          )}
        </div>

        {/* Quick Mentions compact bar inside messaging panel */}
        <div className="px-4 py-1.5 bg-slate-50 border-t flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] uppercase font-bold text-slate-400 mr-1">Quick Mentions:</span>
            <button
              type="button"
              onClick={() => handleMentionSelect('@Editor')}
              className="bg-white hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-medium transition-all cursor-pointer"
            >
              @Editor
            </button>
            <button
              type="button"
              onClick={() => handleMentionSelect('@Author')}
              className="bg-white hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-medium transition-all cursor-pointer"
            >
              @Author
            </button>
            <button
              type="button"
              onClick={() => handleMentionSelect('@Reviewer')}
              className="bg-white hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-medium transition-all cursor-pointer"
            >
              @Reviewer
            </button>
          </div>
          <div className="text-[10px] font-mono text-slate-400 hidden sm:block">
            Double-blind audited • Logged in as: {senderRoleBadge(currentRole)}
          </div>
        </div>

        {/* Form sending */}
        <form onSubmit={handleSendMessage} className="border-t p-3 bg-white flex items-center gap-2.5">
          <button
            type="button"
            onClick={simulateAttachFile}
            className={`p-2 rounded-xl border text-slate-500 hover:text-slate-800 transition-all cursor-pointer ${
              attachedFile ? 'bg-emerald-50 border-emerald-250 text-emerald-700' : 'bg-slate-50'
            }`}
            title="Attach simulation file"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <div className="flex-grow relative">
            <input
              type="text"
              placeholder="Write a message response... Use @Author or @Editor"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full text-xs outline-none bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:bg-white focus:border-emerald-500 transition-all text-slate-800"
            />
            {attachedFile && (
              <div className="absolute right-2 top-1.5 bg-emerald-100 text-emerald-800 border border-emerald-250 text-[9px] px-2 py-1 rounded-lg font-bold font-mono flex items-center gap-1">
                <span>{attachedFile.name}</span>
                <button type="button" onClick={() => setAttachedFile(null)} className="hover:text-red-650 text-red-500">
                  ×
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 px-4 rounded-xl font-bold flex items-center gap-1 text-xs transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function senderRoleBadge(role: Role) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}
