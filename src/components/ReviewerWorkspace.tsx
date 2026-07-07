import React, { useState, useEffect } from 'react';
import { Manuscript, ReviewerRecommendation, ReviewStatus } from '../types';
import { AVAILABLE_REVIEWERS } from '../initialData';
import ManuscriptDiscussion from './ManuscriptDiscussion';
import {
  FileText,
  ShieldCheck,
  CheckSquare,
  MessageSquare,
  BookOpen,
  AlertCircle,
  Sparkles,
  Send,
  Sliders,
  Award,
  BellRing,
  HelpCircle,
  CheckCircle2,
  Trash2,
  XCircle,
  Compass,
  FileSpreadsheet,
  Download,
  CheckCircle,
  ArrowRight
} from 'lucide-react';

interface ReviewerWorkspaceProps {
  manuscripts: Manuscript[];
  onUpdateManuscript: (manuscript: Manuscript) => void;
  currentUser?: { name: string; email: string } | null;
}

export default function ReviewerWorkspace({
  manuscripts,
  onUpdateManuscript,
  currentUser
}: ReviewerWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<string>('ACTION_REQUIRED');
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Defaults to Dr. Tim Berners-Lee or custom logged-in user, can switch simulated personas
  const [simulatedReviewerEmail, setSimulatedReviewerEmail] = useState<string>("timbl@w3.org");

  const reviewerEmail = currentUser?.email || simulatedReviewerEmail;
  const reviewerObj = AVAILABLE_REVIEWERS.find(r => r.email === reviewerEmail) || AVAILABLE_REVIEWERS.find(r => r.id === 'rev2') || AVAILABLE_REVIEWERS[1];
  const reviewerId = reviewerObj.id;
  const reviewerName = reviewerObj.name;

  // Filter papers where current reviewer has an invitation or assignment
  const assignedPapers = manuscripts.filter((m) =>
    m.reviewers.some((r) => r.email === reviewerEmail || r.id === reviewerId)
  );

  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);

  useEffect(() => {
    const papers = manuscripts.filter((m) =>
      m.reviewers.some((r) => r.email === reviewerEmail || r.id === reviewerId)
    );
    if (papers.length > 0) {
      if (!selectedPaperId || !papers.some(p => p.id === selectedPaperId)) {
        setSelectedPaperId(papers[0].id);
      }
    } else {
      setSelectedPaperId(null);
    }
  }, [reviewerEmail, manuscripts, selectedPaperId, reviewerId]);

  const activePaper = manuscripts.find((m) => m.id === selectedPaperId);
  const activeAssignment = activePaper?.reviewers.find(
    (r) => r.email === reviewerEmail || r.id === reviewerId
  );

  // Core review submission inputs
  const [recommendation, setRecommendation] = useState<ReviewerRecommendation>('ACCEPT');
  const [commentsToAuthor, setCommentsToAuthor] = useState('');
  const [commentsToEditor, setCommentsToEditor] = useState('');
  const [expandedDiscussionId, setExpandedDiscussionId] = useState<string | null>(null);

  // Detailed Evaluation Scores given by Reviewer (initiated as null so they must be manually filled or set N/A)
  const [scientificMerit, setScientificMerit] = useState<number | null>(null);
  const [noveltyInnovation, setNoveltyInnovation] = useState<number | null>(null);
  const [methodologyQuality, setMethodologyQuality] = useState<number | null>(null);
  const [literatureAdequacy, setLiteratureAdequacy] = useState<number | null>(null); // Literature Review
  const [ethicalCompliance, setEthicalCompliance] = useState<number | null>(null); // Ethical Standards
  const [dataReliability, setDataReliability] = useState<number | null>(null); // Validity of Results
  const [writingQuality, setWritingQuality] = useState<number | null>(null); // Clarity & Presentation
  const [overallRecommendationScore, setOverallRecommendationScore] = useState<number | null>(null); // Overall Recommendation Score
  const [strengths, setStrengths] = useState<string>('');
  const [weaknesses, setWeaknesses] = useState<string>('');
  const [mandatoryRevisions, setMandatoryRevisions] = useState<string>('');
  const [expertiseArea, setExpertiseArea] = useState<string>('Distributed Protocols & Systems Engineering');

  const [showEvaluationWorkspace, setShowEvaluationWorkspace] = useState(false);
  const [naStates, setNaStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeAssignment) {
      setRecommendation(activeAssignment.recommendation || 'ACCEPT');
      setCommentsToAuthor(activeAssignment.commentsToAuthor || '');
      setCommentsToEditor(activeAssignment.commentsToEditor || '');
      
      const ev = activeAssignment.evaluation;
      if (ev) {
        setExpertiseArea(ev.expertiseArea || 'Distributed Protocols & Systems Engineering');
        setScientificMerit(ev.scientificMerit || null);
        setNoveltyInnovation(ev.noveltyInnovation || null);
        setMethodologyQuality(ev.methodologyQuality || null);
        setDataReliability(ev.dataReliability || null);
        setLiteratureAdequacy(ev.literatureAdequacy || null);
        setWritingQuality(ev.writingQuality || null);
        setEthicalCompliance(ev.ethicalCompliance || null);
        setOverallRecommendationScore(ev.overallRecommendationScore || null);
        setStrengths(ev.strengths || '');
        setWeaknesses(ev.weaknesses || '');
        setMandatoryRevisions(ev.mandatoryRevisions || '');

        setNaStates({
          scientificMerit: !ev.scientificMerit,
          noveltyInnovation: !ev.noveltyInnovation,
          methodologyQuality: !ev.methodologyQuality,
          dataReliability: !ev.dataReliability,
          literatureAdequacy: !ev.literatureAdequacy,
          writingQuality: !ev.writingQuality,
          ethicalCompliance: !ev.ethicalCompliance,
          overallRecommendationScore: !ev.overallRecommendationScore,
        });
      } else {
        setExpertiseArea('Distributed Protocols & Systems Engineering');
        setScientificMerit(null);
        setNoveltyInnovation(null);
        setMethodologyQuality(null);
        setDataReliability(null);
        setLiteratureAdequacy(null);
        setWritingQuality(null);
        setEthicalCompliance(null);
        setOverallRecommendationScore(null);
        setStrengths('');
        setWeaknesses('');
        setMandatoryRevisions('');
        setNaStates({});
      }
    }
  }, [selectedPaperId]);

  // Badge calculations
  const countActionRequired = assignedPapers.filter((m) => {
    const r = m.reviewers.find(x => x.email === reviewerEmail || x.id === reviewerId);
    return r && (r.status === 'INVITED' || r.status === 'ACCEPTED');
  }).length;

  const countAll = assignedPapers.length;

  const countCompleted = assignedPapers.filter((m) => {
    const r = m.reviewers.find(x => x.email === reviewerEmail || x.id === reviewerId);
    return r && r.status === 'SUBMITTED';
  }).length;

  const countDeclined = assignedPapers.filter((m) => {
    const r = m.reviewers.find(x => x.email === reviewerEmail || x.id === reviewerId);
    return r && r.status === 'DECLINED';
  }).length;

  const countPublished = assignedPapers.filter((m) => m.status === 'PUBLISHED').length;
  
  const countArchived = assignedPapers.filter((m) => m.status === 'PUBLISHED' || m.status === 'REJECTED').length;
  
  const handleDeclineInvitation = (paperId: string) => {
    const paperObj = manuscripts.find(m => m.id === paperId);
    if (!paperObj) return;

    const updatedReviewers = paperObj.reviewers.map(r => {
      if (r.email === reviewerEmail || r.id === reviewerId) {
        return { ...r, status: 'DECLINED' as const };
      }
      return r;
    });

    onUpdateManuscript({
      ...paperObj,
      reviewers: updatedReviewers
    });
    setFeedbackMsg("Invitation declined successfully.");
  };

  const handleAcceptMutation = (paperId: string) => {
    const paperObj = manuscripts.find(m => m.id === paperId);
    if (!paperObj) return;

    const updatedReviewers = paperObj.reviewers.map(r => {
      if (r.email === reviewerEmail || r.id === reviewerId) {
        return { ...r, status: 'ACCEPTED' as const };
      }
      return r;
    });

    onUpdateManuscript({
      ...paperObj,
      reviewers: updatedReviewers
    });
    setFeedbackMsg("Invitation accepted. The main text is available for evaluation.");
  };

  const handleFormSubmission = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePaper) return;

    const unselected = [];
    if (scientificMerit === null && !naStates.scientificMerit) unselected.push("1. Scientific Merit");
    if (noveltyInnovation === null && !naStates.noveltyInnovation) unselected.push("2. Novelty & Innovation");
    if (methodologyQuality === null && !naStates.methodologyQuality) unselected.push("3. Methodology Quality");
    if (dataReliability === null && !naStates.dataReliability) unselected.push("4. Validity of Results");
    if (literatureAdequacy === null && !naStates.literatureAdequacy) unselected.push("5. Literature Review");
    if (writingQuality === null && !naStates.writingQuality) unselected.push("6. Clarity & Presentation");
    if (ethicalCompliance === null && !naStates.ethicalCompliance) unselected.push("7. Ethical Standards");
    if (overallRecommendationScore === null && !naStates.overallRecommendationScore) unselected.push("8. Overall Recommendation Score");

    if (unselected.length > 0) {
      alert(`All evaluation ratings must be entered manually. Please score or select 'Not Applicable' for:\n- ${unselected.join('\n- ')}`);
      return;
    }

    if (!commentsToAuthor.trim()) {
      alert("Please enter manual Comments to Authors.");
      return;
    }
    if (!strengths.trim()) {
      alert("Please enter manual Strengths of Manuscript.");
      return;
    }
    if (!weaknesses.trim()) {
      alert("Please enter manual Weaknesses of Manuscript.");
      return;
    }
    if (!mandatoryRevisions.trim()) {
      alert("Please enter manual Mandatory Revisions details.");
      return;
    }

    const updatedReviewers = activePaper.reviewers.map(r => {
      if (r.email === reviewerEmail || r.id === reviewerId) {
        return {
          ...r,
          status: 'SUBMITTED' as const,
          recommendation,
          commentsToAuthor,
          commentsToEditor,
          completedAt: new Date().toISOString().split('T')[0],
          evaluation: {
            expertiseArea,
            scientificMerit: (scientificMerit === null ? 0 : scientificMerit),
            noveltyInnovation: (noveltyInnovation === null ? 0 : noveltyInnovation),
            methodologyQuality: (methodologyQuality === null ? 0 : methodologyQuality),
            literatureAdequacy: (literatureAdequacy === null ? 0 : literatureAdequacy),
            ethicalCompliance: (ethicalCompliance === null ? 0 : ethicalCompliance),
            dataReliability: (dataReliability === null ? 0 : dataReliability),
            writingQuality: (writingQuality === null ? 0 : writingQuality),
            overallRecommendationScore: (overallRecommendationScore === null ? 0 : overallRecommendationScore),
            strengths,
            weaknesses,
            mandatoryRevisions
          }
        };
      }
      return r;
    });

    const isAwaitingDecision = updatedReviewers.filter(r => r.status === 'SUBMITTED').length >= 1;

    const updated: Manuscript = {
      ...activePaper,
      reviewers: updatedReviewers,
      status: isAwaitingDecision ? 'AWAITING_DECISION' : activePaper.status
    };

    onUpdateManuscript(updated);
    setCommentsToAuthor('');
    setCommentsToEditor('');
    setStrengths('');
    setWeaknesses('');
    setMandatoryRevisions('');
    setFeedbackMsg("Consensus report submitted. Synthesized metrics updated on Editor dashboard.");
    setShowEvaluationWorkspace(false);
  };

  const handleSaveDraft = () => {
    if (!activePaper) return;

    const updatedReviewers = activePaper.reviewers.map(r => {
      if (r.email === reviewerEmail || r.id === reviewerId) {
        return {
          ...r,
          // Stay as ACCEPTED (draft mode)
          status: 'ACCEPTED' as const,
          recommendation,
          commentsToAuthor,
          commentsToEditor,
          evaluation: {
            expertiseArea,
            scientificMerit: (scientificMerit === null ? 0 : scientificMerit),
            noveltyInnovation: (noveltyInnovation === null ? 0 : noveltyInnovation),
            methodologyQuality: (methodologyQuality === null ? 0 : methodologyQuality),
            literatureAdequacy: (literatureAdequacy === null ? 0 : literatureAdequacy),
            ethicalCompliance: (ethicalCompliance === null ? 0 : ethicalCompliance),
            dataReliability: (dataReliability === null ? 0 : dataReliability),
            writingQuality: (writingQuality === null ? 0 : writingQuality),
            overallRecommendationScore: (overallRecommendationScore === null ? 0 : overallRecommendationScore),
            strengths,
            weaknesses,
            mandatoryRevisions
          }
        };
      }
      return r;
    });

    onUpdateManuscript({
      ...activePaper,
      reviewers: updatedReviewers
    });

    setFeedbackMsg("Draft evaluation successfully saved.");
    setShowEvaluationWorkspace(false);
  };

  const handleNaToggle = (key: string) => {
    setNaStates(prev => {
      const isCurrentlyNa = !prev[key];
      if (isCurrentlyNa) {
        switch(key) {
          case 'scientificMerit': setScientificMerit(null); break;
          case 'noveltyInnovation': setNoveltyInnovation(null); break;
          case 'methodologyQuality': setMethodologyQuality(null); break;
          case 'dataReliability': setDataReliability(null); break;
          case 'literatureAdequacy': setLiteratureAdequacy(null); break;
          case 'writingQuality': setWritingQuality(null); break;
          case 'ethicalCompliance': setEthicalCompliance(null); break;
          case 'overallRecommendationScore': setOverallRecommendationScore(null); break;
        }
      }
      return { ...prev, [key]: isCurrentlyNa };
    });
  };

  const handleScoreClick = (key: string, value: number) => {
    switch(key) {
      case 'scientificMerit': setScientificMerit(value); break;
      case 'noveltyInnovation': setNoveltyInnovation(value); break;
      case 'methodologyQuality': setMethodologyQuality(value); break;
      case 'dataReliability': setDataReliability(value); break;
      case 'literatureAdequacy': setLiteratureAdequacy(value); break;
      case 'writingQuality': setWritingQuality(value); break;
      case 'ethicalCompliance': setEthicalCompliance(value); break;
      case 'overallRecommendationScore': setOverallRecommendationScore(value); break;
    }
    setNaStates(prev => ({ ...prev, [key]: false }));
  };

  // Shared dynamic styles
  const isTabActive = (tab: string) => activeTab === tab;
  const tabBtnClass = (tab: string) => 
    `w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs transition-all duration-150 cursor-pointer text-left font-semibold ${
      isTabActive(tab) 
        ? 'bg-[#008751] text-white shadow-[0_4px_12px_rgba(0,135,81,0.15)] font-bold' 
        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-100'
    }`;

  const navSectionHeaderClass = "block text-[9px] font-mono uppercase tracking-widest text-slate-400 font-extrabold mb-2.5 mt-5 px-4 select-none";

  return (
    <div id="reviewer-console-container" className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      
      {feedbackMsg && (
        <div id="feedback-success-indicator" className="bg-[#f0fdf4] border border-[#bbf7d0]/80 text-[#165b33] p-4 shadow-xs rounded-xl mb-6 text-xs flex items-center justify-between font-semibold animate-fade-in">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#008751] stroke-[2.2]" />
            <span>{feedbackMsg}</span>
          </div>
          <button 
            onClick={() => setFeedbackMsg('')} 
            className="font-mono text-[10px] font-black uppercase tracking-wider text-[#008751] hover:text-[#007043] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side Navigation Sidebar */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Identity Card */}
          <div className="bg-gradient-to-b from-[#004d2b] to-[#012515] text-white rounded-2xl p-6 shadow-xs space-y-4 relative overflow-hidden border border-emerald-900/10">
            <div className="absolute inset-0 bg-[radial-gradient(#10b981_0.7px,transparent_0.7px)] [background-size:24px_24px] opacity-15 pointer-events-none z-0" />
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-emerald-400/10 rounded-full blur-xl pointer-events-none z-0" />
            
            <div className="relative z-10 flex items-center gap-3">
              <span className="p-2.5 bg-white/10 border border-white/15 text-[#86efac] rounded-xl flex items-center justify-center shrink-0">
                <CheckSquare className="w-5 h-5 stroke-[2.2]" />
              </span>
              <div className="overflow-hidden w-full text-left">
                <strong className="block text-sm font-black truncate text-white tracking-tight">{reviewerName}</strong>
                <span className="block text-[9px] text-[#86efac] font-mono font-black uppercase tracking-wider mt-0.5">Assigned Validator</span>
              </div>
            </div>

            {/* Sandbox Mode Switcher drops */}
            {!currentUser && (
              <div className="relative z-10 space-y-1.5 text-left">
                <label className="block text-[8px] font-mono uppercase tracking-widest text-[#86efac] font-bold">SIMULATED IDENTITY (SANDBOX MODE):</label>
                <select
                  value={reviewerEmail}
                  onChange={(e) => setSimulatedReviewerEmail(e.target.value)}
                  className="w-full bg-[#003823] border border-emerald-800/80 hover:border-emerald-700 text-white rounded px-2.5 py-1.5 text-[11px] font-medium focus:outline-none cursor-pointer"
                >
                  {AVAILABLE_REVIEWERS.map(av => (
                    <option key={av.id} value={av.email} className="bg-slate-900 text-white text-xs">
                      {av.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="relative z-10 pt-3.5 border-t border-white/10 flex justify-between items-center text-[10px] font-mono font-bold text-emerald-300">
              <span>Reviews Filed:</span>
              <span className="text-[#a3f7bf] font-black">{countCompleted} Complete</span>
            </div>
          </div>

          {/* MY ASSIGNMENTS TAB GROUP */}
          <div className="space-y-1.5 text-left">
            <span className="block text-[9px] font-mono uppercase tracking-widest text-slate-400 font-extrabold mb-2.5 px-4 select-none">
              My Active Assignments
            </span>
            
            <div className="space-y-1.5">
              <button
                id="tab-rev-action-req"
                onClick={() => setActiveTab('ACTION_REQUIRED')}
                className={tabBtnClass('ACTION_REQUIRED')}
              >
                <span className="flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-500" /> Action Required
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold ${isTabActive('ACTION_REQUIRED') ? 'bg-[#004d2b] text-[#86efac]' : 'bg-slate-100 text-slate-600'}`}>
                  {countActionRequired}
                </span>
              </button>

              <button
                id="tab-rev-all-assign"
                onClick={() => setActiveTab('ALL_ASSIGNMENTS')}
                className={tabBtnClass('ALL_ASSIGNMENTS')}
              >
                <span className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4 text-[#008751]" /> All Assignments
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold ${isTabActive('ALL_ASSIGNMENTS') ? 'bg-[#004d2b] text-[#86efac]' : 'bg-slate-100 text-slate-600'}`}>
                  {countAll}
                </span>
              </button>

              <button
                id="tab-rev-completed"
                onClick={() => setActiveTab('COMPLETED')}
                className={tabBtnClass('COMPLETED')}
              >
                <span className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Completed
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold ${isTabActive('COMPLETED') ? 'bg-[#004d2b] text-[#86efac]' : 'bg-slate-100 text-slate-600'}`}>
                  {countCompleted}
                </span>
              </button>

              <button
                id="tab-rev-declined"
                onClick={() => setActiveTab('DECLINED')}
                className={tabBtnClass('DECLINED')}
              >
                <span className="flex items-center gap-2.5">
                  <XCircle className="w-4 h-4 text-red-500" /> Declined Reports
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold ${isTabActive('DECLINED') ? 'bg-[#004d2b] text-[#86efac]' : 'bg-slate-100 text-slate-600'}`}>
                  {countDeclined}
                </span>
              </button>

              <button
                id="tab-rev-published"
                onClick={() => setActiveTab('PUBLISHED')}
                className={tabBtnClass('PUBLISHED')}
              >
                <span className="flex items-center gap-2.5">
                  <BookOpen className="w-4 h-4 text-blue-500" /> Published Papers
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold ${isTabActive('PUBLISHED') ? 'bg-[#004d2b] text-[#86efac]' : 'bg-slate-100 text-slate-600'}`}>
                  {countPublished}
                </span>
              </button>

              <button
                id="tab-rev-archived"
                onClick={() => setActiveTab('ARCHIVED')}
                className={tabBtnClass('ARCHIVED')}
              >
                <span className="flex items-center gap-2.5">
                  <Compass className="w-4 h-4 text-slate-500" /> Closed Records
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold ${isTabActive('ARCHIVED') ? 'bg-[#004d2b] text-[#86efac]' : 'bg-slate-100 text-slate-600'}`}>
                  {countArchived}
                </span>
              </button>
            </div>

            <span className={navSectionHeaderClass}>
              Additional Modules
            </span>

            <div className="space-y-1.5">
              <button
                id="tab-reviewer-requests"
                onClick={() => setActiveTab('REVIEW_REQUESTS')}
                className={tabBtnClass('REVIEW_REQUESTS')}
              >
                <span className="flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-[#008751]" /> Active Review Invites
                </span>
              </button>

              <button
                id="tab-reviewer-history"
                onClick={() => setActiveTab('REVIEW_HISTORY')}
                className={tabBtnClass('REVIEW_HISTORY')}
              >
                <span className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4 text-[#008751]" /> Historic Logs
                </span>
              </button>

              <button
                id="tab-reviewer-templates"
                onClick={() => setActiveTab('REVIEW_TEMPLATES')}
                className={tabBtnClass('REVIEW_TEMPLATES')}
              >
                <span className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-4 h-4 text-[#008751]" /> Scoring Rubric
                </span>
              </button>

              <button
                id="tab-reviewer-performance"
                onClick={() => setActiveTab('REVIEW_PERFORMANCE')}
                className={tabBtnClass('REVIEW_PERFORMANCE')}
              >
                <span className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-[#008751]" /> Performance Score
                </span>
              </button>

              <button
                id="tab-reviewer-certs"
                onClick={() => setActiveTab('CERTIFICATES')}
                className={tabBtnClass('CERTIFICATES')}
              >
                <span className="flex items-center gap-2.5">
                  <Award className="w-4 h-4 text-[#008751]" /> Referee Credentials
                </span>
              </button>

              <button
                id="tab-reviewer-messages"
                onClick={() => setActiveTab('MESSAGES')}
                className={tabBtnClass('MESSAGES')}
              >
                <span className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-[#008751]" /> Correspondence
                </span>
              </button>

              <button
                id="tab-reviewer-notifications"
                onClick={() => setActiveTab('NOTIFICATIONS')}
                className={tabBtnClass('NOTIFICATIONS')}
              >
                <span className="flex items-center gap-2.5">
                  <BellRing className="w-4 h-4 text-[#008751]" /> Alerts & Updates
                </span>
              </button>

              <button
                id="tab-reviewer-settings"
                onClick={() => setActiveTab('SETTINGS')}
                className={tabBtnClass('SETTINGS')}
              >
                <span className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4 text-[#008751]" /> Profile Settings
                </span>
              </button>
            </div>

          </div>
        </div>

        {/* Right Active View Card */}
        <div className="lg:col-span-9 space-y-6 text-left">
          
          {/* ASSIGNMENTS SUB-DASHBOARD LISTS */}
          {(activeTab === 'ACTION_REQUIRED' ||
            activeTab === 'ALL_ASSIGNMENTS' ||
            activeTab === 'COMPLETED' ||
            activeTab === 'DECLINED' ||
            activeTab === 'PUBLISHED' ||
            activeTab === 'ARCHIVED') && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-[0_12px_40px_rgba(4,120,87,0.03)] space-y-6">
              
              <div className="border-b border-slate-100 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="font-sans font-black text-slate-900 text-lg sm:text-xl tracking-tight leading-none uppercase">
                    {activeTab === 'ACTION_REQUIRED' && 'Action Required Assignments'}
                    {activeTab === 'ALL_ASSIGNMENTS' && 'All Assignments Portfolio'}
                    {activeTab === 'COMPLETED' && 'Completed Evaluation Reviews'}
                    {activeTab === 'DECLINED' && 'Declined Referee Requests'}
                    {activeTab === 'PUBLISHED' && 'Indexed Published Contributions'}
                    {activeTab === 'ARCHIVED' && 'Archived Records Journal'}
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold mt-2">Select items below to accept, decline, or compose consensus reviews.</p>
                </div>
              </div>

              {/* FILTER DISPATCH */}
              {(() => {
                const filtered = assignedPapers.filter((m) => {
                  const r = m.reviewers.find(x => x.email === reviewerEmail || x.id === reviewerId);
                  if (!r) return false;

                  switch (activeTab) {
                    case 'ACTION_REQUIRED':
                      return r.status === 'INVITED' || r.status === 'ACCEPTED';
                    case 'ALL_ASSIGNMENTS':
                      return true;
                    case 'COMPLETED':
                      return r.status === 'SUBMITTED';
                    case 'DECLINED':
                      return r.status === 'DECLINED';
                    case 'PUBLISHED':
                      return m.status === 'PUBLISHED';
                    case 'ARCHIVED':
                      return m.status === 'PUBLISHED' || m.status === 'REJECTED';
                    default:
                      return true;
                  }
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-10 text-center text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200/60 rounded-2xl font-semibold animate-fade-in">
                      No matching manuscript assignments reported in this state.
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {filtered.map((m) => {
                      const r = m.reviewers.find(x => x.email === reviewerEmail || x.id === reviewerId);
                      const isInvited = r?.status === 'INVITED';
                      const isAccepted = r?.status === 'ACCEPTED';
                      const isCompletedReport = r?.status === 'SUBMITTED';
                      const isSelected = selectedPaperId === m.id;

                      return (
                        <div 
                          key={m.id} 
                          onClick={() => setSelectedPaperId(m.id)}
                          className={`border rounded-2xl p-5 hover:border-slate-300 transition-all duration-150 space-y-4 cursor-pointer relative ${
                            isSelected 
                              ? 'border-[#008751] bg-[#f4faf7]/65 shadow-xs' 
                              : 'border-slate-100 bg-white shadow-xs'
                          }`}
                        >
                          
                          <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
                            <span className="font-mono bg-[#f0fdf4] border border-[#bbf7d0]/60 text-[#008751] px-3 py-1 rounded-md text-[10px] font-black uppercase">
                              ID: {m.id}
                            </span>
                            <span className={`px-3 py-1 rounded-md text-[9px] font-mono font-black uppercase tracking-wider ${
                              isInvited ? 'bg-amber-50 border border-amber-200 text-amber-800' :
                              isAccepted ? 'bg-blue-50 border border-blue-200 text-blue-800' :
                              isCompletedReport ? 'bg-[#f0fdf4] border border-[#bbf7d0]/60 text-[#008751]' : 'bg-slate-100 border border-slate-200 text-slate-600'
                            }`}>
                              Assignment Status: {r?.status}
                            </span>
                          </div>

                          <div className="space-y-2 pointer-events-none">
                            <strong className="block text-slate-900 font-sans text-base tracking-tight font-black leading-tight">{m.title}</strong>
                            <p className="text-xs text-slate-500 leading-relaxed font-semibold">{m.abstract}</p>
                          </div>

                          {/* ANONYMITY SAFEGUARDS DISPLAY */}
                          <div className="p-4 bg-white border border-slate-100 rounded-xl text-xs font-sans tracking-tight space-y-1.5 shadow-2xs pointer-events-none">
                            <span className="block text-[9px] font-mono uppercase tracking-widest text-[#008751] font-black">Double-Blind Protocol State:</span>
                            {m.isDoubleBlind ? (
                              <div className="text-emerald-900 font-bold flex items-center gap-1.5">
                                <ShieldCheck className="w-4.5 h-4.5 text-[#008751]" />
                                <span>Double-Blind Seal Active. Author metadata sanitized.</span>
                              </div>
                            ) : (
                              <div className="text-slate-700 font-bold flex items-center gap-1.5">
                                <Sliders className="w-4.5 h-4.5 text-slate-400" />
                                <span>Open Review Model. Lead Author: <strong className="text-[#008751]">{m.authorName}</strong></span>
                              </div>
                            )}
                          </div>

                          {/* INVITATION GATES (IF INVITED) */}
                          {isInvited && (
                            <div className="flex items-center gap-2.5 pt-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleAcceptMutation(m.id)}
                                className="bg-[#008751] hover:bg-[#007043] text-white font-mono font-black uppercase text-[10px] tracking-wider px-5 py-3 rounded-lg transition-all duration-150 cursor-pointer shadow-xs"
                              >
                                Accept Review Invitation
                              </button>
                              <button
                                onClick={() => handleDeclineInvitation(m.id)}
                                className="border border-slate-200 text-slate-500 hover:text-slate-800 font-mono font-black uppercase text-[10px] tracking-wider hover:bg-slate-50 px-4 py-3 rounded-lg transition-all duration-150 cursor-pointer"
                              >
                                Decline
                              </button>
                            </div>
                          )}

                          {/* FORM GATES (IF ACCEPTED BUT NOT SUBMITTED) */}
                          {isAccepted && isSelected && (
                            <div className="pt-5 border-t border-dashed border-slate-200/80 text-xs text-slate-800 space-y-5" onClick={(e) => e.stopPropagation()}>
                              <div className="bg-[#f0fdf4] p-5 rounded-2xl border border-[#bbf7d0]/60 space-y-3.5 shadow-xs">
                                <div className="flex items-center gap-2">
                                  <Award className="w-5 h-5 text-[#008751] shrink-0" />
                                  <strong className="text-slate-900 font-sans font-black text-sm">Reviewer Evaluation Pending Submission</strong>
                                </div>
                                <p className="text-slate-500 text-xs font-semibold leading-relaxed">
                                  This manuscript is waiting for your manual scholarly critique. Please review the blinded PDF galley proof thoroughly and compile your assessment score indices, recommendation and reports.
                                </p>
                                <div className="flex flex-wrap gap-2.5 pt-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setShowEvaluationWorkspace(true)}
                                    className="bg-[#008751] hover:bg-[#007043] animate-pulse-subtle text-white font-mono font-black uppercase text-[10px] tracking-wider px-5 py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-lg transition-all"
                                  >
                                    ✍️ Open Reviewer Evaluation Workspace <ArrowRight className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => alert(`Simulating safe document download: ${m.fileName || 'sanitized_manuscript.pdf'}`)}
                                    className="text-slate-700 hover:text-[#008751] bg-white hover:bg-emerald-50 border border-slate-200 hover:border-[#bbf7d0]/50 font-sans font-bold text-xs flex items-center gap-1.5 px-4 py-2.5 rounded-xl cursor-pointer transition-all"
                                  >
                                    <Download className="w-4 h-4 shrink-0 text-[#008751]" /> Download PDF Galley Proof ({m.fileSize || '3.2 MB'})
                                  </button>
                                </div>
                              </div>

                              {/* MODAL: STUNNING PEER-REVIEW SYSTEM GRADE REVIEWER EVALUATION WORKSPACE */}
                              {showEvaluationWorkspace && (
                                <div className="fixed inset-0 bg-[#001f11]/60 backdrop-blur-md z-50 flex items-center justify-center p-4 text-left font-sans">
                                  <div className="bg-white rounded-[24px] shadow-2xl border border-emerald-100 max-w-6xl w-full h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    
                                    {/* Modal Title Banner */}
                                    <div className="bg-[#004d2b] p-6 text-white shrink-0 relative">
                                      <button 
                                        type="button"
                                        onClick={() => setShowEvaluationWorkspace(false)}
                                        className="absolute top-5 right-5 text-emerald-100 hover:text-white bg-white/10 hover:bg-white/20 px-3.5 py-1.5 rounded-full transition cursor-pointer text-xs font-mono font-bold"
                                      >
                                        ✕ Close
                                      </button>
                                      <div className="flex items-center gap-2 text-emerald-300 font-mono text-[10px] uppercase font-bold tracking-widest leading-none">
                                        <Award className="w-4 h-4" /> Reviewer Evaluation Workspace
                                      </div>
                                      <h2 className="text-xl font-black tracking-tight text-white mt-1.5 truncate pr-16 leading-tight">
                                        Manuscript: {m.title}
                                      </h2>
                                      <div className="mt-2 text-xs text-emerald-100 flex items-center gap-1.5">
                                        <span>Status:</span> <span className="bg-emerald-800 text-white font-black px-2 py-0.5 rounded text-[10px] uppercase">ACCEPTED FOR REVIEW</span>
                                        <span className="text-emerald-300">|</span>
                                        <span>Referee: <strong>{reviewerName}</strong></span>
                                      </div>
                                    </div>

                                    {/* Main Scroll Content Area */}
                                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">
                                      
                                      {/* Alert banner */}
                                      <div className="mb-6 p-4 bg-amber-50/65 border border-amber-200/60 rounded-2xl flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                        <div className="text-xs">
                                          <strong className="block text-amber-900 font-bold mb-1">Your Expert Evaluation is Desired</strong>
                                          <p className="text-amber-800 leading-relaxed font-semibold">
                                            Please provide your direct expert assessment by scoring each criterion and drafting qualitative critiques. All scores must be entered manually; no automated suggestions are applied.
                                          </p>
                                        </div>
                                      </div>

                                      {/* Two column split layout */}
                                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                        
                                        {/* Left Column: Criteria & Main comments */}
                                        <div className="lg:col-span-8 space-y-6">
                                          
                                          {/* Criteria ratings */}
                                          <div className="space-y-4">
                                            <div className="border-b border-emerald-100 pb-3 flex items-center justify-between">
                                              <div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Evaluation Criteria</h3>
                                                <p className="text-xs text-slate-400 mt-0.5 font-semibold">Scale: 1 (Poor) to 10 (Excellent), or mark as Not Applicable.</p>
                                              </div>
                                              <span className="text-xs font-bold text-slate-500 font-mono bg-slate-100 px-3 py-1 rounded-lg">8 Metrics Required</span>
                                            </div>

                                            <div className="space-y-4">
                                              {[
                                                { key: 'scientificMerit', label: '1. Scientific Merit', desc: 'Original contribution study rigor, hypotheses soundness, and scientific logic.' },
                                                { key: 'noveltyInnovation', label: '2. Novelty & Innovation', desc: 'Breakthrough contributions, conceptual uniqueness, and modern relevance.' },
                                                { key: 'methodologyQuality', label: '3. Methodology Quality', desc: 'Experimental setup, database design parameters, and verification rigor.' },
                                                { key: 'dataReliability', label: '4. Validity of Results', desc: 'Mathematical reproducibility, statistical proof margins, and validation accuracy.' },
                                                { key: 'literatureAdequacy', label: '5. Literature Review', desc: 'Framing of historical state of the art and high quality citation completeness.' },
                                                { key: 'writingQuality', label: '6. Clarity & Presentation', desc: 'Grammar fluidity, structure clarity, clear displaying typography, and organizational flow.' },
                                                { key: 'ethicalCompliance', label: '7. Ethical Standards', desc: 'Dual-Blind seal protection, potential conflicts check, and strict moral bounds.' },
                                                { key: 'overallRecommendationScore', label: '8. Overall Recommendation Score', desc: 'Manual comprehensive peer rating evaluating overall scientific substance.' },
                                              ].map((item) => {
                                                const getVal = () => {
                                                  switch(item.key) {
                                                    case 'scientificMerit': return scientificMerit;
                                                    case 'noveltyInnovation': return noveltyInnovation;
                                                    case 'methodologyQuality': return methodologyQuality;
                                                    case 'dataReliability': return dataReliability;
                                                    case 'literatureAdequacy': return literatureAdequacy;
                                                    case 'writingQuality': return writingQuality;
                                                    case 'ethicalCompliance': return ethicalCompliance;
                                                    case 'overallRecommendationScore': return overallRecommendationScore;
                                                    default: return null;
                                                  }
                                                };
                                                const activeVal = getVal();
                                                const isDisabled = !!naStates[item.key];

                                                return (
                                                  <div key={item.key} className="p-4 bg-white rounded-2xl border border-slate-100 hover:border-slate-200/80 transition-all duration-150 space-y-3 shadow-3xs">
                                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                                                      <div>
                                                        <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-tight">{item.label}</h4>
                                                        <p className="text-[11px] text-slate-500 leading-normal mt-0.5">{item.desc}</p>
                                                      </div>
                                                      <div className="flex items-center gap-1.5 self-start shrink-0 select-none bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/50">
                                                        <input
                                                          type="checkbox"
                                                          id={`na-${item.key}`}
                                                          checked={isDisabled}
                                                          onChange={() => handleNaToggle(item.key)}
                                                          className="w-3.5 h-3.5 rounded text-[#008751] focus:ring-[#008751] border-slate-300 cursor-pointer"
                                                        />
                                                        <label htmlFor={`na-${item.key}`} className="text-[10px] font-bold text-slate-500 cursor-pointer">
                                                          N/A
                                                        </label>
                                                      </div>
                                                    </div>
                                                    
                                                    <div className="flex flex-wrap gap-1">
                                                      {[1,2,3,4,5,6,7,8,9,10].map((score) => {
                                                        const isSelected = activeVal === score;
                                                        return (
                                                          <button
                                                            type="button"
                                                            key={score}
                                                            disabled={isDisabled}
                                                            onClick={() => handleScoreClick(item.key, score)}
                                                            className={`w-8 h-8 text-[11px] font-bold rounded-md border transition-all cursor-pointer flex items-center justify-center ${
                                                              isDisabled 
                                                                ? 'bg-slate-50 text-slate-200 border-slate-100 cursor-not-allowed'
                                                                : isSelected
                                                                  ? 'bg-[#008751] text-white border-[#008751] ring-2 ring-[#008751]/20 font-black shadow-2xs scale-105'
                                                                  : 'bg-white hover:bg-emerald-50 text-slate-600 hover:text-[#008751] border-slate-200'
                                                            }`}
                                                          >
                                                            {score}
                                                          </button>
                                                        );
                                                      })}
                                                    </div>
                                                    {!isDisabled && (
                                                      <div className="text-[10px] text-slate-400 font-bold font-mono">
                                                        {activeVal ? `SCORE SELECTION: ${activeVal} / 10` : "MANUAL SCORE REQUIRED"}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>

                                          {/* Key comment cards */}
                                          <div className="space-y-4">
                                            <div className="border-b border-emerald-100 pb-2">
                                              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Qualitative Appraisals</h3>
                                              <p className="text-xs text-slate-400 mt-0.5">Provide detailed, comprehensive reports inside these specific comments gates.</p>
                                            </div>

                                            <div className="space-y-4 text-xs font-semibold">
                                              <div>
                                                <label className="block text-slate-700 font-bold mb-1.5 flex items-center justify-between">
                                                  <span>1. Comments to Authors <span className="text-rose-500">*</span></span>
                                                  <span className="text-[10px] text-slate-400 font-mono">Visible to authors</span>
                                                </label>
                                                <textarea
                                                  value={commentsToAuthor}
                                                  onChange={(e) => setCommentsToAuthor(e.target.value)}
                                                  rows={4}
                                                  placeholder="Provide a thorough, comprehensive technical or layout critique. Highlight citation limits, reasoning errors, etc..."
                                                  className="w-full bg-white border border-slate-200 focus:border-[#008751] focus:ring-1 focus:ring-[#008751] rounded-xl p-3.5 text-xs font-medium focus:outline-none placeholder-slate-400 text-slate-800 shadow-3xs leading-relaxed"
                                                />
                                              </div>

                                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div>
                                                  <label className="block text-slate-700 font-bold mb-1.5">Strengths of Manuscript <span className="text-rose-500">*</span></label>
                                                  <textarea
                                                    value={strengths}
                                                    onChange={(e) => setStrengths(e.target.value)}
                                                    rows={3}
                                                    placeholder="Scientific breakthroughs, sound equations evidence..."
                                                    className="w-full bg-white border border-slate-200 focus:border-[#008751] focus:ring-1 focus:ring-[#008751] rounded-xl p-3 text-xs font-medium focus:outline-none placeholder-slate-400 text-slate-800 shadow-3xs"
                                                  />
                                                </div>

                                                <div>
                                                  <label className="block text-slate-700 font-bold mb-1.5">Weaknesses of Manuscript <span className="text-rose-500">*</span></label>
                                                  <textarea
                                                    value={weaknesses}
                                                    onChange={(e) => setWeaknesses(e.target.value)}
                                                    rows={3}
                                                    placeholder="Vulnerable control conditions, loose bounds configurations..."
                                                    className="w-full bg-white border border-slate-200 focus:border-[#008751] focus:ring-1 focus:ring-[#008751] rounded-xl p-3 text-xs font-medium focus:outline-none placeholder-slate-400 text-slate-800 shadow-3xs"
                                                  />
                                                </div>

                                                <div>
                                                  <label className="block text-slate-700 font-bold mb-1.5">Mandatory Revisions <span className="text-rose-500">*</span></label>
                                                  <textarea
                                                    value={mandatoryRevisions}
                                                    onChange={(e) => setMandatoryRevisions(e.target.value)}
                                                    rows={3}
                                                    placeholder="1. Configure baseline parameter bounds\n2. Align equation reference index..."
                                                    className="w-full bg-white border border-slate-200 focus:border-[#008751] focus:ring-1 focus:ring-[#008751] rounded-xl p-3 text-xs font-medium focus:outline-none placeholder-slate-400 text-slate-800 shadow-3xs"
                                                  />
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Right Column: Recommendation & Confidential Notes */}
                                        <div className="lg:col-span-4 space-y-6">
                                          
                                          {/* Technical Recommendation Selection panel */}
                                          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-3xs">
                                            <div>
                                              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Reviewer Recommendation</h3>
                                              <p className="text-[11px] text-slate-400 mt-0.5">Please choose your definitive recommendation.</p>
                                            </div>

                                            <div className="space-y-2">
                                              {[
                                                { value: 'ACCEPT', label: 'Accept Manuscript', desc: 'Suitable for immediate publication as is' },
                                                { value: 'MINOR_REVISION', label: 'Minor Revisions', desc: 'Requires petty refinements or polishing' },
                                                { value: 'MAJOR_REVISION', label: 'Major Revisions', desc: 'Requires substantial conceptual refinements' },
                                                { value: 'REJECT', label: 'Reject Manuscript', desc: 'Not suitable for presentation or publication' },
                                                { value: 'ADDITIONAL_REVIEW', label: 'Additional Review Required', desc: 'Requires further rounds of expert assessment' }
                                              ].map((choice) => {
                                                const isChoiceSelected = recommendation === choice.value;
                                                return (
                                                  <div
                                                    key={choice.value}
                                                    onClick={() => setRecommendation(choice.value as ReviewerRecommendation)}
                                                    className={`border rounded-xl p-3 flex items-start gap-3 transition-all cursor-pointer ${
                                                      isChoiceSelected 
                                                        ? 'border-[#008751] bg-[#f0fcf5] shadow-3xs' 
                                                        : 'border-slate-100 bg-white hover:bg-slate-50'
                                                    }`}
                                                  >
                                                    <input
                                                      type="radio"
                                                      name="reviewer_rec"
                                                      checked={isChoiceSelected}
                                                      onChange={() => setRecommendation(choice.value as ReviewerRecommendation)}
                                                      className="w-4 h-4 text-[#008751] focus:ring-[#008751] border-slate-300 cursor-pointer mt-0.5 self-start"
                                                    />
                                                    <div>
                                                      <span className="text-xs font-extrabold text-slate-800 block leading-tight">{choice.label}</span>
                                                      <span className="text-[10px] text-slate-400 font-semibold block leading-tight mt-1">{choice.desc}</span>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>

                                          {/* Confidential to Editor comments */}
                                          <div className="bg-[#f0fcf6] border border-emerald-100 rounded-2xl p-5 space-y-3.5 shadow-3xs">
                                            <div className="flex items-center gap-2">
                                              <Sliders className="w-4 h-4 text-[#008751]" />
                                              <label className="text-xs font-bold text-slate-800 block">Confidential Editor Note</label>
                                            </div>
                                            <p className="text-[10px] text-slate-500 font-semibold leading-normal">
                                              Private feedback regarding manuscript novelty or scientific validity problems. Locked strictly to editors.
                                            </p>
                                            <textarea
                                              value={commentsToEditor}
                                              onChange={(e) => setCommentsToEditor(e.target.value)}
                                              rows={4}
                                              placeholder="Provide private comments, reasoning or caveats..."
                                              className="w-full bg-white border border-slate-200 focus:border-[#008751] focus:ring-1 focus:ring-[#008751] rounded-xl p-3.5 text-xs font-medium focus:outline-none placeholder-slate-400 text-slate-800 shadow-3xs leading-relaxed"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Sticky Footer actions bar */}
                                    <div className="bg-slate-50 border-t border-gray-200 p-4 shrink-0 flex flex-wrap items-center justify-between gap-4">
                                      <div className="text-xs text-slate-400 font-semibold italic">
                                        All edits draft-saved inside local memory.
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <button
                                          type="button"
                                          onClick={() => setShowEvaluationWorkspace(false)}
                                          className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={handleSaveDraft}
                                          className="px-4 py-2 bg-indigo-50 border border-indigo-150 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition cursor-pointer"
                                        >
                                          Save Draft
                                        </button>
                                        <button
                                          type="button"
                                          onClick={handleFormSubmission}
                                          className="px-6 py-2 bg-[#008751] hover:bg-[#007043] text-white font-mono font-black uppercase text-[10px] tracking-wider rounded-xl transition cursor-pointer shadow-md"
                                        >
                                          Submit Evaluation
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {isCompletedReport && isSelected && (
                            <div className="pt-4 border-t border-dashed border-slate-100 bg-[#f4faf7]/80 p-5 rounded-2xl text-xs space-y-3.5 text-slate-850">
                              <span className="block text-[9px] font-mono uppercase tracking-widest text-[#008751] font-black">Your Submitted Evaluation Report & Rubric:</span>
                              
                              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs border-b pb-3">
                                <div>Recommendation: <span className="text-[#008751] font-black uppercase text-[10px] bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded">{r?.recommendation}</span></div>
                                {r?.evaluation?.expertiseArea && (
                                  <div>Expertise Area: <strong className="text-slate-700 font-bold">{r.evaluation.expertiseArea}</strong></div>
                                )}
                              </div>

                              {r?.evaluation && (
                                <div className="space-y-3 pt-1">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3 text-center">
                                    <div className="p-2 bg-white rounded-lg border border-emerald-100/80">
                                      <span className="text-[9px] text-slate-400 block font-mono">Merit</span>
                                      <strong className="text-[#008751] font-black text-sm">
                                        {r.evaluation.scientificMerit && r.evaluation.scientificMerit > 0 ? r.evaluation.scientificMerit : 'N/A'}
                                      </strong>
                                    </div>
                                    <div className="p-2 bg-white rounded-lg border border-emerald-100/80">
                                      <span className="text-[9px] text-slate-400 block font-mono">Novelty</span>
                                      <strong className="text-[#008751] font-black text-sm">
                                        {r.evaluation.noveltyInnovation && r.evaluation.noveltyInnovation > 0 ? r.evaluation.noveltyInnovation : 'N/A'}
                                      </strong>
                                    </div>
                                    <div className="p-2 bg-white rounded-lg border border-emerald-100/80">
                                      <span className="text-[9px] text-slate-400 block font-mono">Method</span>
                                      <strong className="text-[#008751] font-black text-sm">
                                        {r.evaluation.methodologyQuality && r.evaluation.methodologyQuality > 0 ? r.evaluation.methodologyQuality : 'N/A'}
                                      </strong>
                                    </div>
                                    <div className="p-2 bg-white rounded-lg border border-emerald-100/80">
                                      <span className="text-[9px] text-slate-400 block font-mono">Lit</span>
                                      <strong className="text-[#008751] font-black text-sm">
                                        {r.evaluation.literatureAdequacy && r.evaluation.literatureAdequacy > 0 ? r.evaluation.literatureAdequacy : 'N/A'}
                                      </strong>
                                    </div>
                                    <div className="p-2 bg-white rounded-lg border border-emerald-100/80">
                                      <span className="text-[9px] text-slate-400 block font-mono">Ethics</span>
                                      <strong className="text-[#008751] font-black text-sm">
                                        {r.evaluation.ethicalCompliance && r.evaluation.ethicalCompliance > 0 ? r.evaluation.ethicalCompliance : 'N/A'}
                                      </strong>
                                    </div>
                                    <div className="p-2 bg-white rounded-lg border border-emerald-100/80">
                                      <span className="text-[9px] text-slate-400 block font-mono">Data</span>
                                      <strong className="text-[#008751] font-black text-sm">
                                        {r.evaluation.dataReliability && r.evaluation.dataReliability > 0 ? r.evaluation.dataReliability : 'N/A'}
                                      </strong>
                                    </div>
                                    <div className="p-2 bg-white rounded-lg border border-emerald-100/80">
                                      <span className="text-[9px] text-slate-400 block font-mono">Writing</span>
                                      <strong className="text-[#008751] font-black text-sm">
                                        {r.evaluation.writingQuality && r.evaluation.writingQuality > 0 ? r.evaluation.writingQuality : 'N/A'}
                                      </strong>
                                    </div>
                                    <div className="p-2 bg-white rounded-lg border border-emerald-100/80">
                                      <span className="text-[9px] text-slate-400 block font-mono">Overall Rec</span>
                                      <strong className="text-indigo-600 font-black text-sm">
                                        {r.evaluation.overallRecommendationScore && r.evaluation.overallRecommendationScore > 0 ? r.evaluation.overallRecommendationScore : 'N/A'}
                                      </strong>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 text-[11px] leading-relaxed">
                                    <div className="p-3 bg-white rounded-xl border">
                                      <span className="block font-bold text-slate-700 mb-1">💪 Key Strengths:</span>
                                      <p className="text-slate-600 font-medium">{r.evaluation.strengths}</p>
                                    </div>
                                    <div className="p-3 bg-white rounded-xl border">
                                      <span className="block font-bold text-slate-700 mb-1">⚠️ Key Weaknesses:</span>
                                      <p className="text-slate-600 font-medium">{r.evaluation.weaknesses}</p>
                                    </div>
                                    <div className="p-3 bg-white rounded-xl border">
                                      <span className="block font-bold text-slate-700 mb-1">🛠️ Mandatory Revisions:</span>
                                      <p className="text-slate-600 font-medium">{r.evaluation.mandatoryRevisions}</p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="border-t pt-3 space-y-1.5 text-slate-600">
                                <p className="font-bold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-[#008751]" /> Qualitative Author Remarks:</p>
                                <p className="italic font-medium text-slate-700">"Comments: {r?.commentsToAuthor}"</p>
                                {r?.commentsToEditor && (
                                  <p className="text-[11px] text-slate-500 font-semibold mt-1">Confidential Note to Editor: "{r.commentsToEditor}"</p>
                                )}
                              </div>
                            </div>
                          )}

                          {(isAccepted || isCompletedReport) && (
                            <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[10px] italic font-semibold text-slate-400 flex items-center gap-1.5 select-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Double-blind consensus mailbox active
                              </span>
                              <button
                                type="button"
                                onClick={() => setExpandedDiscussionId(expandedDiscussionId === m.id ? null : m.id)}
                                className="text-[10px] bg-white hover:bg-[#f0fdf4] border border-slate-200 hover:border-[#bbf7d0]/60 text-slate-700 hover:text-[#008751] px-3.5 py-1.5 rounded-lg transition-all duration-150 font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-[#008751] stroke-[2.2]" />
                                {expandedDiscussionId === m.id ? 'Hide Conversation' : 'Open Discussion Portal'}
                              </button>
                            </div>
                          )}

                          {expandedDiscussionId === m.id && (isAccepted || isCompletedReport) && (
                            <div className="mt-4 pt-4 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                              <ManuscriptDiscussion
                                manuscript={m}
                                onUpdateManuscript={onUpdateManuscript}
                                currentUser={{ name: reviewerName, email: reviewerEmail }}
                                currentRole="REVIEWER"
                              />
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                );
              })()}

            </div>
          )}

          {/* ADDITIONAL REQUISITE MODULES */}
          {activeTab === 'REVIEW_REQUESTS' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-[0_12px_40px_rgba(4,120,87,0.03)] space-y-5">
              <h3 className="font-sans font-black text-slate-900 text-lg uppercase tracking-tight">Awaiting Evaluation Review Invites</h3>
              <p className="text-xs text-slate-400 font-semibold">List of requested referee invitations. Click 'Accept' or 'Decline' in Action Required to initiate checklists.</p>
              
              <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/40">
                {assignedPapers.filter(m => m.reviewers.some(x => (x.email === reviewerEmail || x.id === reviewerId) && x.status === 'INVITED')).map((m) => (
                  <div key={m.id} className="p-4 flex items-center justify-between hover:bg-white transition-all duration-150 border-b border-slate-100 last:border-b-0 text-slate-800">
                    <div className="space-y-1.5">
                      <strong className="block text-slate-900 text-sm font-black tracking-tight">{m.title}</strong>
                      <span className="text-[10px] text-slate-400 font-mono font-black uppercase">Double-Blind Verification Active</span>
                    </div>
                    <button 
                      onClick={() => setActiveTab('ACTION_REQUIRED')} 
                      className="bg-[#008751] hover:bg-[#007043] text-white font-mono text-[9px] font-black uppercase tracking-wider px-3.5 py-2 rounded-lg transition-all"
                    >
                      Process Invitation
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'REVIEW_HISTORY' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-[0_12px_40px_rgba(4,120,87,0.03)] space-y-5">
              <h3 className="font-sans font-black text-slate-900 text-lg uppercase tracking-tight">Historic Peer Evaluation Reviews Logs</h3>
              <p className="text-xs text-slate-400 font-semibold">Immutable logs representing prior completed peer evaluations.</p>
              
              <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/40">
                {assignedPapers.filter(m => m.reviewers.some(x => (x.email === reviewerEmail || x.id === reviewerId) && x.status === 'SUBMITTED')).map((m) => {
                  const r = m.reviewers.find(x => x.email === reviewerEmail || x.id === reviewerId);
                  return (
                    <div key={m.id} className="p-4 flex items-center justify-between hover:bg-white transition-all duration-150 border-b border-slate-100 last:border-b-0">
                      <div className="space-y-1">
                        <strong className="block text-slate-900 text-sm font-black tracking-tight">{m.title}</strong>
                        <span className="text-[10px] text-slate-400 font-semibold block">Report Dispatched: {r?.completedAt ? new Date(r.completedAt).toLocaleDateString() : 'N/A'}</span>
                      </div>
                      <span className="bg-[#f0fdf4] border border-[#bbf7d0]/60 text-[#008751] font-mono font-black text-[9px] px-3 py-1 rounded-md uppercase tracking-wider">{r?.recommendation}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'REVIEW_TEMPLATES' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-[0_12px_40px_rgba(4,120,87,0.03)] space-y-5">
              <h3 className="font-sans font-black text-slate-900 text-lg uppercase tracking-tight">Scoring Rubrics & Guidelines</h3>
              <p className="text-xs text-slate-400 font-semibold">Clinical evaluation parameters and metrics benchmarks to reinforce supreme peer review integrity.</p>
              
              <div className="text-xs text-slate-600 space-y-5 leading-relaxed font-semibold">
                <div className="p-4 rounded-xl bgcolor bg-slate-50 border border-slate-100">
                  <p className="font-bold text-slate-900 text-sm mb-1.5">1. Clinical & Analytical Novelty Pricing</p>
                  <p className="text-slate-500 font-medium">Evaluate if the clinical trials or analytical concurrency modeling demonstrate actual paradigm advancements or simply duplicate existing database architecture.</p>
                </div>
                <div className="p-4 rounded-xl bgcolor bg-slate-50 border border-slate-100">
                  <p className="font-bold text-slate-900 text-sm mb-1.5">2. Citation & References Verification</p>
                  <p className="text-slate-500 font-medium">Verify that high-tenure authors, foundational papers, and academic reference indices are systematically indexed without cherry-picking metrics.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'REVIEW_PERFORMANCE' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-[0_12px_40px_rgba(4,120,87,0.03)] space-y-5">
              <h3 className="font-sans font-black text-slate-900 text-lg uppercase tracking-tight">Continuous Performance Analytics</h3>
              <p className="text-xs text-slate-400 font-semibold">Real-time statistics indicating compliance, report speed, and peer rating accuracy.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 font-mono text-xs">
                <div className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50 text-center space-y-1">
                  <span className="block text-slate-400 text-[10px] font-black uppercase">REVIEWS IN TIME</span>
                  <strong className="block text-2xl text-[#008751] font-black">100%</strong>
                  <span className="text-[9px] text-slate-400 font-bold block">Zero Late Dispatches</span>
                </div>
                <div className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50 text-center space-y-1">
                  <span className="block text-slate-400 text-[10px] font-black uppercase">MEAN TURNAROUND</span>
                  <strong className="block text-2xl text-[#008751] font-black">4.5 Days</strong>
                  <span className="text-[9px] text-slate-400 font-bold block">Exceeds 21 Days threshold</span>
                </div>
                <div className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50 text-center space-y-1">
                  <span className="block text-slate-400 text-[10px] font-black uppercase">CONSENSUS SCORE</span>
                  <strong className="block text-2xl text-[#008751] font-black">9.8 / 10</strong>
                  <span className="text-[9px] text-slate-400 font-bold block">Supreme Referee Standing</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'CERTIFICATES' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-[0_12px_40px_rgba(4,120,87,0.03)] space-y-5">
              <h3 className="font-sans font-black text-slate-900 text-lg uppercase tracking-tight">Referee Merit Credentials</h3>
              <p className="text-xs text-slate-400 font-semibold font-sans">Continuous verification certificates denoting services towards peer reviews and publication standard validation.</p>
              
              <div className="border border-[#bbf7d0] rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs bg-[#f4faf7]/60">
                <div className="space-y-1.5 text-center sm:text-left">
                  <strong className="block text-slate-900 text-sm font-black tracking-tight">JMS Gold Merit Citation</strong>
                  <span className="text-slate-500 font-semibold block">Issued to {reviewerName} indicating continuous support during academic validations.</span>
                </div>
                <button
                  onClick={() => alert("Verification Certificate successfully downloaded.")}
                  className="bg-[#008751] hover:bg-[#007043] text-white font-mono text-[9px] font-black uppercase tracking-wider px-4 py-2.5 rounded-lg transition-all shrink-0 cursor-pointer shadow-xs"
                >
                  Download PDF Certificate
                </button>
              </div>
            </div>
          )}

          {activeTab === 'MESSAGES' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-[0_12px_40px_rgba(4,120,87,0.03)] space-y-5">
              <h3 className="font-sans font-black text-slate-900 text-lg uppercase tracking-tight">Editorial Security Mailbox</h3>
              <p className="text-xs text-slate-400 font-semibold">Decentralized dialogue room connected with Chief Editors.</p>
              
              <div className="border border-slate-100 rounded-2xl p-5 bg-slate-50 text-xs max-h-72 overflow-y-auto space-y-4">
                <div className="bg-white border border-slate-100 p-3.5 rounded-xl max-w-lg space-y-1.5 shadow-2xs font-semibold">
                  <strong className="text-[#008751] block font-mono text-[9px] font-black uppercase tracking-wider">Chief Editorial Desk</strong>
                  <p className="text-slate-700 font-medium">Dear Colleague, thank you for accepting the Sybil defense manuscript. We look forward to receiving your validation report soon.</p>
                </div>
              </div>

              <div className="flex gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Draft editorial memo..."
                  className="flex-grow border border-slate-200 rounded-lg px-4 py-3 bg-white focus:outline-none focus:border-[#008751] focus:ring-1 focus:ring-[#008751] text-slate-800 font-semibold placeholder-slate-400 shadow-xs"
                />
                <button
                  onClick={() => alert("Simulated response submitted.")}
                  className="bg-[#008751] hover:bg-[#007043] text-white font-mono font-black uppercase text-[10px] px-4 py-3 rounded-lg transition-all shrink-0 cursor-pointer shadow-xs"
                >
                  Dispatch Memo
                </button>
              </div>
            </div>
          )}

          {activeTab === 'NOTIFICATIONS' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-[0_12px_40px_rgba(4,120,87,0.03)] space-y-5">
              <h3 className="font-sans font-black text-slate-900 text-lg uppercase tracking-tight">Platform Notifications</h3>
              
              <div className="bg-[#f0fdf4] border border-[#bbf7d0]/80 p-4 rounded-xl text-xs text-slate-800 flex items-start gap-3 animate-fade-in font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-[#008751] mt-1 shrink-0 animate-pulse"></span>
                <div className="space-y-1">
                  <strong className="block text-slate-900 font-black">New Peer Evaluation Assigned</strong>
                  <p className="text-slate-500 font-medium">You have been allocated as Referee Validator for manuscript ID: #JMS-2026-B202.</p>
                  <span className="text-[9px] text-slate-400 block font-mono font-black">Received: 1 Day Ago</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'SETTINGS' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-[0_12px_40px_rgba(4,120,87,0.03)] space-y-5">
              <h3 className="font-sans font-black text-slate-900 text-lg uppercase tracking-tight">Referee Profile Coordinates</h3>
              <p className="text-xs text-slate-400 font-semibold">Update your academic affiliations, research keywords, and email coordinates.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-500 font-extrabold pb-1.5 uppercase font-mono text-[9px] tracking-wider">Lead Referee Name</label>
                  <input
                    type="text"
                    disabled
                    value={reviewerName}
                    className="w-full border border-slate-100 rounded-lg p-3 bg-slate-50 text-slate-400 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-extrabold pb-1.5 uppercase font-mono text-[9px] tracking-wider">Email Coordinates</label>
                  <input
                    type="text"
                    disabled
                    value={reviewerEmail}
                    className="w-full border border-slate-100 rounded-lg p-3 bg-slate-50 text-slate-400 font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
