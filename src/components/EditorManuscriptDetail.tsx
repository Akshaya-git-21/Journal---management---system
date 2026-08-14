import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, StatusHistoryRow, SuggestedReviewerRow, ProfileRow, getProfilesByIds, getStatusHistory, getEditorAssignments, getReviewerAssignments, getSuggestedReviewers } from '../lib/workflow';
import { getManuscript, getContributors, getDiscussions, getRevisions } from '../lib/workflow';
import { ArrowLeft, Download, MoreVertical, Loader2 } from 'lucide-react';
import ManuscriptDetailHeader from './manuscript-detail/ManuscriptDetailHeader';
import WorkflowStatusTracker from './manuscript-detail/WorkflowStatusTracker';
import ManuscriptDetailTabs from './manuscript-detail/ManuscriptDetailTabs';

interface EditorManuscriptDetailProps {
  manuscript: ManuscriptRow;
  onBack: () => void;
  onChanged: () => void;
  currentUserId?: string;
}

interface ManuscriptDetailData {
  statusHistory: StatusHistoryRow[];
  editorAssignments: EditorAssignmentRow[];
  reviewerAssignments: ReviewerAssignmentRow[];
  suggestedReviewers: SuggestedReviewerRow[];
  profiles: Record<string, ProfileRow>;
  contributors: any[];
  discussions: any[];
  revisions: any[];
}

export default function EditorManuscriptDetail({ manuscript, onBack, onChanged, currentUserId }: EditorManuscriptDetailProps) {
  const [data, setData] = useState<ManuscriptDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'manuscript' | 'files' | 'evaluation' | 'review-board' | 'reviewers' | 'reviews' | 'decision' | 'timeline' | 'history' | 'notes'>('evaluation');
  const [error, setError] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      if (!manuscript.id) {
        throw new Error('Invalid manuscript ID');
      }

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Data loading timeout - Supabase may be unresponsive')), 10000)
      );

      const requiredDataPromise = Promise.all([
        getStatusHistory(manuscript.id),
        getEditorAssignments(manuscript.id),
        getReviewerAssignments(manuscript.id),
        getSuggestedReviewers(manuscript.id),
        getContributors(manuscript.id)
      ]);

      const [statusHistory, editorAssignments, reviewerAssignments, suggestedReviewers, contributors] = await Promise.race([
        requiredDataPromise,
        timeoutPromise
      ]) as [any[], any[], any[], any[], any[]];

      const profileIds = [
        manuscript.author_id,
        manuscript.assigned_editor_id,
        ...editorAssignments.map(a => a.editor_id),
        ...reviewerAssignments.map(r => r.reviewer_id),
        ...statusHistory.map(h => h.actor_id).filter(Boolean)
      ].filter(Boolean) as string[];

      const profiles = await getProfilesByIds(profileIds);

      setData({
        statusHistory,
        editorAssignments,
        reviewerAssignments,
        suggestedReviewers,
        profiles,
        contributors,
        discussions: [],
        revisions: []
      });

      let discussions: any[] = [];
      let revisions: any[] = [];

      Promise.allSettled([
        getDiscussions(manuscript.id).then(r => { discussions = r; }),
        getRevisions(manuscript.id).then(r => { revisions = r; })
      ]).then(() => {
        setData(prev => prev ? { ...prev, discussions, revisions } : null);
      });

    } catch (e: any) {
      setError(e.message || 'Failed to load manuscript data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [manuscript.id]);

  useEffect(() => {
    if (!manuscript.id) return;

    const unsubscribers: (() => void)[] = [];

    const editorChannel = supabase
      .channel(`manuscript:${manuscript.id}:editors`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'editor_assignments', filter: `manuscript_id=eq.${manuscript.id}` }, () => loadData())
      .subscribe();
    unsubscribers.push(() => editorChannel.unsubscribe());

    const reviewerChannel = supabase
      .channel(`manuscript:${manuscript.id}:reviewers`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviewer_assignments', filter: `manuscript_id=eq.${manuscript.id}` }, () => loadData())
      .subscribe();
    unsubscribers.push(() => reviewerChannel.unsubscribe());

    const statusChannel = supabase
      .channel(`manuscript:${manuscript.id}:status`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_status_history', filter: `manuscript_id=eq.${manuscript.id}` }, () => loadData())
      .subscribe();
    unsubscribers.push(() => statusChannel.unsubscribe());

    const suggestedChannel = supabase
      .channel(`manuscript:${manuscript.id}:suggested`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_suggested_reviewers', filter: `manuscript_id=eq.${manuscript.id}` }, () => loadData())
      .subscribe();
    unsubscribers.push(() => suggestedChannel.unsubscribe());

    const manuscriptChannel = supabase
      .channel(`manuscript:${manuscript.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'manuscripts', filter: `id=eq.${manuscript.id}` }, () => {
        loadData();
        onChanged();
      })
      .subscribe();
    unsubscribers.push(() => manuscriptChannel.unsubscribe());

    setIsSubscribed(true);

    return () => {
      unsubscribers.forEach(unsub => unsub());
      setIsSubscribed(false);
    };
  }, [manuscript.id, onChanged]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-2" />
          <p className="text-slate-600">Loading manuscript details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isSubscribed && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 w-fit">
          <span className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse"></span>
          Live Updates Active
        </div>
      )}

      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Assignments
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">
          {error}
        </div>
      )}

      <ManuscriptDetailHeader manuscript={manuscript} onRefresh={loadData} />

      <WorkflowStatusTracker
        manuscript={manuscript}
        editorAssignments={data.editorAssignments}
        reviewerAssignments={data.reviewerAssignments}
        statusHistory={data.statusHistory}
      />

      <ManuscriptDetailTabs
        manuscript={manuscript}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        data={data}
        onDataChange={loadData}
        onWorkflowChange={onChanged}
        currentUserId={currentUserId}
        isEditor={true}
      />
    </div>
  );
}
