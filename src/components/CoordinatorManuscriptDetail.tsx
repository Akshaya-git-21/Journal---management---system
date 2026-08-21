import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ManuscriptRow, EditorAssignmentRow, ReviewerAssignmentRow, StatusHistoryRow, SuggestedReviewerRow, ProfileRow, getProfilesByIds, getStatusHistory, getEditorAssignments, getReviewerAssignments, getSuggestedReviewers } from '../lib/workflow';
import { getManuscript, getContributors, getDiscussions, getRevisions } from '../lib/workflow';
import { ArrowLeft, Download, MoreVertical, Loader2 } from 'lucide-react';
import ManuscriptDetailHeader from './manuscript-detail/ManuscriptDetailHeader';
import WorkflowStatusTracker from './manuscript-detail/WorkflowStatusTracker';
import ManuscriptDetailTabs from './manuscript-detail/ManuscriptDetailTabs';

interface CoordinatorManuscriptDetailProps {
  manuscript: ManuscriptRow;
  showAllFiles?: boolean;
  onBack: () => void;
  onChanged: () => void;
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

export default function CoordinatorManuscriptDetail({ manuscript, showAllFiles = false, onBack, onChanged }: CoordinatorManuscriptDetailProps) {
  const [data, setData] = useState<ManuscriptDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'manuscript' | 'files' | 'evaluation' | 'review-board' | 'reviewers' | 'reviews' | 'decision' | 'timeline' | 'history' | 'notes'>('overview');
  const [error, setError] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      console.log('📋 Loading manuscript data for ID:', manuscript.id);

      if (!manuscript.id) {
        throw new Error('Invalid manuscript ID');
      }

      // Add timeout protection - if queries take more than 10 seconds, timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Data loading timeout - Supabase may be unresponsive')), 10000)
      );

      // Load required data first (these must succeed)
      console.log('⏳ Loading required data...');
      const requiredDataPromise = Promise.all([
        getStatusHistory(manuscript.id).then(r => { console.log('✓ statusHistory:', r.length, 'records'); return r; }).catch(e => { console.error('✗ statusHistory failed:', e); throw e; }),
        getEditorAssignments(manuscript.id).then(r => { console.log('✓ editorAssignments:', r.length, 'records'); return r; }).catch(e => { console.error('✗ editorAssignments failed:', e); throw e; }),
        getReviewerAssignments(manuscript.id).then(r => { console.log('✓ reviewerAssignments:', r.length, 'records'); return r; }).catch(e => { console.error('✗ reviewerAssignments failed:', e); throw e; }),
        getSuggestedReviewers(manuscript.id).then(r => { console.log('✓ suggestedReviewers:', r.length, 'records'); return r; }).catch(e => { console.error('✗ suggestedReviewers failed:', e); throw e; }),
        getContributors(manuscript.id).then(r => { console.log('✓ contributors:', r.length, 'records'); return r; }).catch(e => { console.error('✗ contributors failed:', e); throw e; })
      ]);

      const [statusHistory, editorAssignments, reviewerAssignments, suggestedReviewers, contributors] = await Promise.race([
        requiredDataPromise,
        timeoutPromise
      ]) as [any[], any[], any[], any[], any[]];

      console.log('✓ Required data loaded, building profile map...');

      const profileIds = [
        manuscript.author_id,
        manuscript.assigned_editor_id,
        ...editorAssignments.map(a => a.editor_id),
        ...reviewerAssignments.map(r => r.reviewer_id),
        ...statusHistory.map(h => h.actor_id).filter(Boolean)
      ].filter(Boolean) as string[];

      console.log('📌 Profile IDs to fetch:', profileIds.length, 'profiles');

      const profiles = await getProfilesByIds(profileIds);

      console.log('✓ Profiles loaded:', Object.keys(profiles).length, 'profiles in map');

      // Set required data immediately
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

      console.log('✓ Required data state set successfully');

      // Load optional data in background (doesn't block render)
      let discussions: any[] = [];
      let revisions: any[] = [];

      Promise.allSettled([
        getDiscussions(manuscript.id).then(r => { console.log('✓ discussions:', r.length, 'records'); discussions = r; }).catch(e => console.warn('⚠ discussions failed:', e)),
        getRevisions(manuscript.id).then(r => { console.log('✓ revisions:', r.length, 'records'); revisions = r; }).catch(e => console.warn('⚠ revisions failed:', e))
      ]).then(() => {
        console.log('✓ Optional data loaded, updating state');
        setData(prev => prev ? { ...prev, discussions, revisions } : null);
      }).catch(e => console.warn('⚠ Optional data load failed:', e));

    } catch (e: any) {
      console.error('❌ Error loading required manuscript data:', e);
      setError(e.message || 'Failed to load manuscript data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [manuscript.id]);

  // Realtime subscriptions for all related tables
  useEffect(() => {
    if (!manuscript.id) return;

    const unsubscribers: (() => void)[] = [];

    // Subscribe to editor assignments changes
    const editorChannel = supabase
      .channel(`manuscript:${manuscript.id}:editors`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'editor_assignments', filter: `manuscript_id=eq.${manuscript.id}` }, () => loadData())
      .subscribe();
    unsubscribers.push(() => editorChannel.unsubscribe());

    // Subscribe to reviewer assignments changes
    const reviewerChannel = supabase
      .channel(`manuscript:${manuscript.id}:reviewers`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviewer_assignments', filter: `manuscript_id=eq.${manuscript.id}` }, () => loadData())
      .subscribe();
    unsubscribers.push(() => reviewerChannel.unsubscribe());

    // Subscribe to status history
    const statusChannel = supabase
      .channel(`manuscript:${manuscript.id}:status`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_status_history', filter: `manuscript_id=eq.${manuscript.id}` }, () => loadData())
      .subscribe();
    unsubscribers.push(() => statusChannel.unsubscribe());

    // Subscribe to suggested reviewers
    const suggestedChannel = supabase
      .channel(`manuscript:${manuscript.id}:suggested`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manuscript_suggested_reviewers', filter: `manuscript_id=eq.${manuscript.id}` }, () => loadData())
      .subscribe();
    unsubscribers.push(() => suggestedChannel.unsubscribe());

    // Subscribe to manuscripts for status changes
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
      {/* Realtime indicator */}
      {isSubscribed && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 w-fit">
          <span className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse"></span>
          Live Updates Active
        </div>
      )}

      {/* Back button and header */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Manuscript Queue
      </button>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">
          {error}
        </div>
      )}

      {/* Manuscript header */}
      <ManuscriptDetailHeader manuscript={manuscript} onRefresh={loadData} />

      {/* Workflow status tracker */}
      <WorkflowStatusTracker
        manuscript={manuscript}
        editorAssignments={data.editorAssignments}
        reviewerAssignments={data.reviewerAssignments}
        statusHistory={data.statusHistory}
        revisions={data.revisions}
      />

      {/* Tabs */}
      <ManuscriptDetailTabs
        manuscript={manuscript}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        data={data}
        onDataChange={loadData}
        onWorkflowChange={onChanged}
        showAllFiles={showAllFiles}
      />
    </div>
  );
}
