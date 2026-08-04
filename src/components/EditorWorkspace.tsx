import React, { useState, useEffect } from 'react';
import TuliticsLogo from './TuliticsLogo';
import { Manuscript, ReviewerAssignment, ManuscriptStatus, ReviewStatus, DiscussionMessage, RevisionRecord } from '../types';
import { AVAILABLE_REVIEWERS } from '../initialData';
import ManuscriptDiscussion from './ManuscriptDiscussion';
import {
  Search,
  Plus,
  UserCheck,
  ShieldAlert,
  FileText,
  CheckSquare,
  Settings,
  ArrowLeft,
  ExternalLink,
  UserPlus,
  FileWarning,
  EyeOff,
  Clipboard,
  AlertTriangle,
  Clock,
  Layers,
  ChevronRight,
  BookOpen,
  FolderLock,
  MessagesSquare,
  BellRing,
  Award,
  Archive,
  Megaphone,
  AreaChart,
  Upload,
} from 'lucide-react';

import { 
  ThumbsUp, 
  ThumbsDown, 
  CheckCircle2, 
  TrendingUp, 
  Percent,
  GitPullRequest,
  Fingerprint,
  AlertCircle
} from 'lucide-react';

// Help helper for reviewer evaluations
function getReviewerEvaluation(reviewer: any) {
  if (reviewer && reviewer.evaluation) {
    return reviewer.evaluation;
  }
  
  const isSubmitted = reviewer && reviewer.status === 'SUBMITTED';
  const name = (reviewer && reviewer.name) || "";
  let defaultArea = "Awaiting profile setup";
  if (name.includes("Hopper") || name.includes("Decarlo")) {
    defaultArea = "Distributed Protocols & Systems Engineering";
  } else if (name.includes("Knuth")) {
    defaultArea = "Database Relational Routing & Transactional Locks";
  } else if (name.includes("Lamport")) {
    defaultArea = "Synchronized Regional Partition Locks";
  } else if (name.includes("Dijkstra")) {
    defaultArea = "Graph Partitioning & Compiler Intermediate Representations";
  } else if (name.includes("Neumann")) {
    defaultArea = "Heterogeneous Compute Profiles & Tiling Optimization";
  }

  if (!isSubmitted) {
    return {
      expertiseArea: (reviewer && (reviewer.area || reviewer.expertiseArea)) || defaultArea,
      scientificMerit: 0,
      noveltyInnovation: 0,
      methodologyQuality: 0,
      literatureAdequacy: 0,
      ethicalCompliance: 0,
      dataReliability: 0,
      writingQuality: 0,
      overallRecommendationScore: 0,
      strengths: "Awaiting review submission...",
      weaknesses: "Awaiting review submission...",
      mandatoryRevisions: "Awaiting review submission..."
    };
  }
  
  if (name.includes("Hopper") || name.includes("Decarlo")) {
    return {
      expertiseArea: "Distributed Gradients & Advanced Compilers",
      scientificMerit: 9,
      noveltyInnovation: 8,
      methodologyQuality: 8,
      literatureAdequacy: 9,
      ethicalCompliance: 10,
      dataReliability: 8,
      writingQuality: 9,
      overallRecommendationScore: 8,
      strengths: "The structural gradient divergence formula is mathematically sound and elegantly handles malicious injection boundaries with minimal overhead.",
      weaknesses: "Simulation details in Section 4 are somewhat sparse. Standard hyperparameter learning rates during gradient validation epochs are not explicitly stated.",
      mandatoryRevisions: "1. Specify epoch-level validation learning rate constants.\n2. Standardize gradient vectors formatting variables."
    };
  }
  
  if (name.includes("Knuth")) {
    return {
      expertiseArea: "Database Relational Routing & Transactional Locks",
      scientificMerit: 10,
      noveltyInnovation: 10,
      methodologyQuality: 10,
      literatureAdequacy: 10,
      ethicalCompliance: 10,
      dataReliability: 10,
      writingQuality: 10,
      overallRecommendationScore: 10,
      strengths: "An absolute masterpiece. The optimization of global GPS clock temporal checkpoints is completely robust. Formally complete proofs for sub-millisecond locks.",
      weaknesses: "None observed. The paper is exceptionally clean and well structured.",
      mandatoryRevisions: "None. Direct editorial acceptance recommended."
    };
  }
  
  if (name.includes("Lamport")) {
    return {
      expertiseArea: "Synchronized Regional Partition Locks",
      scientificMerit: 10,
      noveltyInnovation: 9,
      methodologyQuality: 10,
      literatureAdequacy: 9,
      ethicalCompliance: 10,
      dataReliability: 10,
      writingQuality: 9,
      overallRecommendationScore: 10,
      strengths: "The temporal clock sync coordinates provide superior ordering guarantees compared to modern multi-phase lock schemes.",
      weaknesses: "Minor typographical error observed on page 5 and page 7 regarding symbol definitions.",
      mandatoryRevisions: "1. Correct small typo in Equation 4 variable labels."
    };
  }

  if (name.includes("Dijkstra")) {
    return {
      expertiseArea: "Graph Partitioning & Compiler Intermediate Representations",
      scientificMerit: 9,
      noveltyInnovation: 9,
      methodologyQuality: 9,
      literatureAdequacy: 8,
      ethicalCompliance: 10,
      dataReliability: 9,
      writingQuality: 8,
      overallRecommendationScore: 9,
      strengths: "The compiler intermediate representation yields clear, mathematically sound partitioning blocks over heterogeneous clusters.",
      weaknesses: "The bibliography misses several relevant compiler pipelines from recent TVM progress.",
      mandatoryRevisions: "1. Include references to newer deep compile structures in TVM baseline.\n2. Elaborate on compile-time speed bounds."
    };
  }

  if (name.includes("Neumann")) {
    return {
      expertiseArea: "Heterogeneous Compute Profiles & Tiling Optimization",
      scientificMerit: 10,
      noveltyInnovation: 10,
      methodologyQuality: 9,
      literatureAdequacy: 9,
      ethicalCompliance: 10,
      dataReliability: 10,
      writingQuality: 10,
      overallRecommendationScore: 10,
      strengths: "The tile-optimized intermediate representation compiler graphs map elegantly to heterogeneous edge layouts with optimal efficiency.",
      weaknesses: "Slight complexity overhead in the coordinate sorting algorithms on smaller systems.",
      mandatoryRevisions: "1. Standardize core tiling limits profiles to match general edge SoC specifications."
    };
  }

  if (name.includes("Clevinger")) {
    return {
      expertiseArea: "Network Consensus Security & Cryptographic Proofs",
      scientificMerit: 7,
      noveltyInnovation: 6,
      methodologyQuality: 5,
      literatureAdequacy: 6,
      ethicalCompliance: 10,
      dataReliability: 7,
      writingQuality: 6,
      overallRecommendationScore: 6,
      strengths: "Focuses on useful edge defense cases and provides practical recommendations.",
      weaknesses: "Methodology is under-explained and lacks broad-spectrum replication details.",
      mandatoryRevisions: "1. Rewrite Section 3 for experimental clarity."
    };
  }

  return {
    expertiseArea: "Global Systems Architecture",
    scientificMerit: 8,
    noveltyInnovation: 7,
    methodologyQuality: 8,
    literatureAdequacy: 8,
    ethicalCompliance: 10,
    dataReliability: 8,
    writingQuality: 8,
    overallRecommendationScore: 8,
    strengths: "Clear organization, relevant scientific scope, and viable initial simulation data.",
    weaknesses: "Statistical validation elements would benefit from larger sample structures.",
    mandatoryRevisions: "1. Supplement statistical variance values.\n2. Clarify system environment setups."
  };
}

interface EditorWorkspaceProps {
  manuscripts: Manuscript[];
  onUpdateManuscript: (manuscript: Manuscript) => void;
  onDeleteManuscript: (manuscriptId: string) => void;
  currentUser?: { name: string; email: string } | null;
}

export default function EditorWorkspace({
  manuscripts,
  onUpdateManuscript,
  onDeleteManuscript,
  currentUser
}: EditorWorkspaceProps) {
  // Navigation tabs matching separate OJS author requirements
  const [selectedManuscriptId, setSelectedManuscriptId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<string>('ACTIVE_SUBMISSIONS');
  const [showAllSubmissions, setShowAllSubmissions] = useState(false);
  
  // Accordion open/close states
  const [submissionsOpen, setSubmissionsOpen] = useState(true);
  const [reviewsOpen, setReviewsOpen] = useState(true);
  const [productionOpen, setProductionOpen] = useState(true);
  const [modulesOpen, setModulesOpen] = useState(true);

  // Triggering reviewer assignments dialogue
  const [showAssignModal, setShowAssignModal] = useState(false);
  
  // Warning exception state for 400-range override
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'ACCEPT' | 'REJECT' | 'REVISE' | null>(null);
  const [exceptionPayload, setExceptionPayload] = useState<any>(null);

  // Editor private notes update
  const [editorsNotesTemp, setEditorsNotesTemp] = useState('');
  const [customRefName, setCustomRefName] = useState('');
  const [customRefEmail, setCustomRefEmail] = useState('');
  const [decisionSuccessMsg, setDecisionSuccessMsg] = useState<string | null>(null);

  // Selected paper state matching
  const selectedPaper = manuscripts.find(m => m.id === selectedManuscriptId);
  const baseReviewsCompleted = selectedPaper ? selectedPaper.reviewers.filter(r => r.status === 'SUBMITTED').length : 0;
  const reviewsCompletedCount = baseReviewsCompleted;
  const reviewsCompletedPercent = Math.round((reviewsCompletedCount / 2) * 100);
  
  const [editorOjsTab, setEditorOjsTab] = useState<'REVIEW' | 'SUBMISSION' | 'COPYEDITING' | 'PRODUCTION' | 'TITLE_ABSTRACT' | 'CONTRIBUTORS' | 'METADATA' | 'REFERENCES' | 'GALLEYS' | 'JATS_XML' | 'PERMISSIONS' | 'ISSUE' | 'GUIDELINES'>('REVIEW');
  const [readingFile, setReadingFile] = useState<any | null>(null);

  // File Upload Modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadModalCategory, setUploadModalCategory] = useState<'REVIEW' | 'REVISION'>('REVIEW');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileType, setUploadFileType] = useState('Article Text');

  // Localized edits for OJS and reference image compatibility
  const [ojsLanguage, setOjsLanguage] = useState('French (Canada)');
  const [ojsPrefix, setOjsPrefix] = useState('');
  const [ojsTitle, setOjsTitle] = useState('');
  const [ojsSubtitle, setOjsSubtitle] = useState('');
  const [ojsAbstract, setOjsAbstract] = useState('');
  const [ojsVersion, setOjsVersion] = useState('1');
  const [ojsStatusUnscheduled, setOjsStatusUnscheduled] = useState(true);
  
  const [ojsReviewers, setOjsReviewers] = useState<any[]>([]);
  const [ojsReviewFiles, setOjsReviewFiles] = useState<any[]>([]);
  const [ojsRevisions, setOjsRevisions] = useState<any[]>([]);
  const [ojsDiscussions, setOjsDiscussions] = useState<any[]>([]);

  // Detailed Reviewer Evaluation states
  const [selectedReviewerForEvaluation, setSelectedReviewerForEvaluation] = useState<any | null>(null);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [evaluationActiveTab, setEvaluationActiveTab] = useState<'METRICS' | 'COMMENTS' | 'CONSENSUS_DECISION' | 'DASHBOARD' | 'AUDIT'>('METRICS');
  
  const [expandedCommentSection, setExpandedCommentSection] = useState<string | null>('strengths');
  const [decisionLetterText, setDecisionLetterText] = useState('');
  const [decisionJustification, setDecisionJustification] = useState('');
  const [evaluationModalDecision, setEvaluationModalDecision] = useState<'ACCEPT' | 'REVISE' | 'REJECT' | 'ADDITIONAL_REVIEW' | 'MINOR_REVISIONS' | null>(null);

  // Formulas & Heuristics for interactive decision support and consensus
  const calculateConsensusScore = () => {
    if (!selectedPaper) return 0;
    const submittedReferees = selectedPaper.reviewers.filter(r => r.status === 'SUBMITTED');
    if (submittedReferees.length === 0) return 0; // return 0 when pending, preventing auto fakes
    
    const weights: Record<string, number> = {
      'ACCEPT': 100,
      'MINOR_REVISION': 85,
      'MAJOR_REVISION': 55,
      'REJECT': 20
    };
    const sum = submittedReferees.reduce((acc, r) => acc + (weights[r.recommendation || 'MINOR_REVISION'] || 85), 0);
    return Math.round(sum / submittedReferees.length);
  };

  const calculateConsensusRecommendation = () => {
    const score = calculateConsensusScore();
    if (score === 0) return "Awaiting peer evaluations from invited reviewers";
    if (score >= 90) return "Direct Acceptance Recommended";
    if (score >= 75) return "Minor Revisions Recommended";
    if (score >= 50) return "Major Revisions Required";
    return "Rejection & Archiving Recommended";
  };

  const calculateAverageScore = () => {
    if (!selectedPaper) return 0;
    const submittedReferees = selectedPaper.reviewers.filter(r => r.status === 'SUBMITTED');
    if (submittedReferees.length === 0) return 0; // return 0 when pending, preventing auto fakes
    
    const sum = submittedReferees.reduce((acc, r) => {
      const evalData = getReviewerEvaluation(r);
      const avg = (
        evalData.scientificMerit +
        evalData.noveltyInnovation +
        evalData.methodologyQuality +
        evalData.literatureAdequacy +
        evalData.ethicalCompliance +
        evalData.dataReliability +
        evalData.writingQuality
      ) / 7;
      return acc + avg;
    }, 0);
    return parseFloat((sum / submittedReferees.length).toFixed(1));
  };

  const calculateAcceptProbability = () => {
    const score = calculateConsensusScore();
    const avg = calculateAverageScore();
    return Math.min(100, Math.max(10, Math.round(score * 0.8 + avg * 10 * 0.2)));
  };

  const calculateReviewerAgreement = () => {
    if (!selectedPaper) return 100;
    const submittedReferees = selectedPaper.reviewers.filter(r => r.status === 'SUBMITTED');
    if (submittedReferees.length <= 1) return 100;
    
    const weights: Record<string, number> = {
      'ACCEPT': 100,
      'MINOR_REVISION': 85,
      'MAJOR_REVISION': 55,
      'REJECT': 20
    };
    const values = submittedReferees.map(r => weights[r.recommendation || 'MINOR_REVISION'] || 85);
    
    let diffSum = 0;
    let pairsCount = 0;
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        diffSum += Math.abs(values[i] - values[j]);
        pairsCount++;
      }
    }
    const avgDiff = diffSum / pairsCount;
    return Math.round(100 - avgDiff);
  };

  const calculateRecommendationDistribution = () => {
    if (!selectedPaper) return { accept: 0, minor: 0, major: 0, reject: 0 };
    const submittedReferees = selectedPaper.reviewers.filter(r => r.status === 'SUBMITTED');
    
    let accept = 0;
    let minor = 0;
    let major = 0;
    let reject = 0;
    
    submittedReferees.forEach(r => {
      const rec = r.recommendation || 'MINOR_REVISION';
      if (rec === 'ACCEPT') accept++;
      else if (rec === 'MINOR_REVISION') minor++;
      else if (rec === 'MAJOR_REVISION') major++;
      else if (rec === 'REJECT') reject++;
    });
    
    return { accept, minor, major, reject, total: submittedReferees.length || 1 };
  };

  const handleOpenEvaluation = (r: any) => {
    let realRev = selectedPaper?.reviewers.find(pr => pr.id === r.id || pr.name === r.name);
    if (!realRev) {
      const isDeclined = r.status === 'Request Declined' || r.status === 'DECLINED';
      const isOverdue = r.status === 'Overdue';
      
      realRev = {
        id: r.id,
        name: r.name,
        email: r.email || `${r.name.toLowerCase().replace(/\s+/g, '')}@jms-referee.com`,
        status: isDeclined ? 'DECLINED' : (isOverdue ? 'ACCEPTED' : (r.status === 'Completed' ? 'SUBMITTED' : 'INVITED')),
        recommendation: r.status === 'Completed' ? 'MINOR_REVISION' : null,
        commentsToAuthor: isOverdue ? "" : "The design meets high OJS technical metrics.",
        commentsToEditor: isOverdue ? "" : "Highly competent work overall.",
        assignedAt: "2026-06-04"
      };
    }
    
    setSelectedReviewerForEvaluation(realRev);
    setShowEvaluationModal(true);
    setEvaluationActiveTab('METRICS');
    setDecisionJustification('');
    setDecisionLetterText('');
    setEvaluationModalDecision(null);
  };

  const handleSimulateReviewSubmissionInModal = (reviewerId: string) => {
    if (!selectedPaper) return;
    
    const updatedReviewers = selectedPaper.reviewers.map(r => {
      if (r.id === reviewerId) {
        return {
          ...r,
          status: 'SUBMITTED' as ReviewStatus,
          recommendation: 'MINOR_REVISION' as any,
          commentsToAuthor: "The compiler and routing designs have been described meticulously. I recommend minor alignments on baseline parameters.",
          commentsToEditor: "Formally complete validation model structure. No Double-Blind leak detected.",
          completedAt: new Date().toISOString().split('T')[0],
          evaluation: {
            expertiseArea: "Distributed Protocols & Systems Engineering",
            scientificMerit: 8,
            noveltyInnovation: 8,
            methodologyQuality: 8,
            literatureAdequacy: 7,
            ethicalCompliance: 10,
            dataReliability: 9,
            writingQuality: 8,
            strengths: "The formal proof locks have outstanding security margins.",
            weaknesses: "Simulation parameters missing standard deviations configurations.",
            mandatoryRevisions: "1. Supplement standard deviation parameters in Section 4 charts."
          }
        };
      }
      return r;
    });

    const isAwaitingDecision = updatedReviewers.filter(r => r.status === 'SUBMITTED').length >= 1;

    const updatedPaper = {
      ...selectedPaper,
      reviewers: updatedReviewers,
      status: isAwaitingDecision ? 'AWAITING_DECISION' : selectedPaper.status
    };

    onUpdateManuscript(updatedPaper);
    
    // update state in real-time
    const matched = updatedPaper.reviewers.find(pr => pr.id === reviewerId);
    if (matched) {
      setSelectedReviewerForEvaluation(matched);
    }
  };

  const handleFinalEditorialDecisionInModal = (decisionType: 'ACCEPT' | 'REVISE' | 'REJECT' | 'ADDITIONAL_REVIEW' | 'MINOR_REVISIONS') => {
    if (!selectedPaper) return;
    
    let targetStatus: ManuscriptStatus = selectedPaper.status;
    let statusLog = '';
    let updatedRevisions: RevisionRecord[] = selectedPaper.revisions ? [...selectedPaper.revisions] : [];
    let revisionNum = 0;
    
    if (decisionType === 'ACCEPT') {
      targetStatus = 'ACCEPTED';
      statusLog = 'Submission accepted and transitioned to Copyediting production pipeline.';
    } else if (decisionType === 'MINOR_REVISIONS' || decisionType === 'REVISE') {
      targetStatus = 'REVISION_REQUESTED';
      revisionNum = updatedRevisions.length + 1;
      statusLog = `Revisions requested (Revision ${revisionNum}). Author notified to upload updated draft.`;

      const newRevision: RevisionRecord = {
        id: `rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        revisionNumber: revisionNum,
        requestedBy: currentUser?.name || selectedPaper.assignedEditor || "Dr. Cynthia Dwork",
        requestedByEmail: currentUser?.email || selectedPaper.assignedEditorEmail || "editor@ojs-journal.org",
        requestedAt: new Date().toISOString(),
        decisionLetter: decisionLetterText || decisionJustification || "Please revise your manuscript according to the editorial decision.",
        status: 'AWAITING_AUTHOR_UPLOAD',
        uploadedFiles: []
      };
      updatedRevisions.push(newRevision);
    } else if (decisionType === 'REJECT') {
      targetStatus = 'REJECTED';
      statusLog = 'Submission rejected and archived.';
    } else if (decisionType === 'ADDITIONAL_REVIEW') {
      targetStatus = 'UNDER_REVIEW';
      statusLog = 'Sent back for additional technical reviewer tracks.';
    }

    const isRevision = decisionType === 'MINOR_REVISIONS' || decisionType === 'REVISE';
    const revisionPrefix = isRevision ? `[Revision ${revisionNum} Requested] ` : "";

    const newDiscussion: DiscussionMessage = {
      id: `msg_mod_dec_${Date.now()}`,
      senderName: currentUser?.name || selectedPaper.assignedEditor || "Dr. Cynthia Dwork",
      senderEmail: currentUser?.email || selectedPaper.assignedEditorEmail || "editor@ojs-journal.org",
      senderRole: "EDITOR",
      text: isRevision
        ? `🔔 [EDITORIAL DECISION: REVISION ${revisionNum} REQUESTED]\n\nStatus: Revision Requested\nRequested By: ${currentUser?.name || selectedPaper.assignedEditor || "Dr. Cynthia Dwork"}\nRequest Date & Time: ${new Date().toLocaleString()}\n\nDecision Letter / Comments:\n${decisionLetterText || decisionJustification || 'Please address reviewer comments and upload your revised files.'}`
        : `[Editorial Decision: ${decisionType}] ${decisionJustification || statusLog}`,
      timestamp: new Date().toISOString()
    };

    const updatedPaper: Manuscript = {
      ...selectedPaper,
      status: targetStatus,
      revisions: updatedRevisions,
      discussions: [newDiscussion, ...(selectedPaper.discussions || [])],
      editorsNotes: decisionJustification 
        ? `${revisionPrefix}${selectedPaper.editorsNotes || ''}\n\n[Editorial Decision - ${decisionType}]: ${decisionJustification}\n[Decision letter]: ${decisionLetterText}`
        : `${revisionPrefix}${selectedPaper.editorsNotes || ''}\n\n[Editorial Decision - ${decisionType}] recorded inside evaluation desk.`
    };

    onUpdateManuscript(updatedPaper);
    setShowEvaluationModal(false);
  };

  useEffect(() => {
    if (selectedPaper) {
      setOjsLanguage(selectedPaper.language || 'French (Canada)');
      setOjsPrefix('');
      setOjsTitle(selectedPaper.title || 'Scholarly Associations and the Economic Viability of Open Access Publishing');
      setOjsSubtitle('');
      setOjsAbstract(selectedPaper.abstract || "Les paysages de l'information dans lesquels travaillent les chercheurs subissent un changement sismique. L'écran d'ordinateur qui sort des piles de photocopies, des piles de journaux, de coupures de presse et de correspondance, offre maintenant une nouvelle et riche veine d'informations qui semble destinée à finir par submerger les pièges traditionnels des ordinateurs de bureau, des classeurs et des étagères. Après un peu plus d'une décennie de publication sur Internet, les deux tiers des revues universitaires offrent un accès en ligne, tandis que plus de 1 000 revues à comité de lecture sont publiées uniquement sous forme numérique (Tenopir et King, 2001). Les professeurs et les étudiants écrivent de plus en plus avec leurs navigateurs ouverts aux sources de recherche en ligne.");
      setOjsVersion('1');
      setOjsStatusUnscheduled(selectedPaper.status !== 'PUBLISHED' && selectedPaper.status !== 'ACCEPTED');
      
      const paperReviewers = (selectedPaper.reviewers || []).map(r => {
        let statusDisplay = 'Invited';
        if (r.status === 'SUBMITTED') {
          statusDisplay = 'Completed';
        } else if (r.status === 'ACCEPTED') {
          if (r.isOverdueForce) {
            statusDisplay = 'Overdue';
          } else {
            statusDisplay = 'Reviewing';
          }
        } else if (r.status === 'DECLINED') {
          statusDisplay = 'Declined';
        }
        return {
          id: r.id,
          name: r.name,
          email: r.email,
          status: statusDisplay,
          dueDate: r.dueDate || '2026-06-25',
          invitedOn: r.invitedOn || '2026-06-05',
          type: r.type || 'External',
          actionSent: r.reminderSent || false,
          rawReviewer: r
        };
      });

      setOjsReviewers(paperReviewers);

      setOjsReviewFiles([
        { no: "1386", name: "Other, Figure.docx", date: "2021-03-12", type: "Other" },
        { no: "1385", name: "Other, Submission_PKP Image.jpg", date: "2021-03-12", type: "Other" },
        { no: "1384", name: "Data Set, Submission_Dataset.docx", date: "2021-03-12", type: "Data Set" },
        { no: "1383", name: "Article Text, Submission_New Submission.docx", date: "2021-03-12", type: "Article Text" }
      ]);

      setOjsRevisions([]);
      setOjsDiscussions([]);
    }
  }, [selectedManuscriptId, selectedPaper]);

  useEffect(() => {
    setShowAllSubmissions(false);
  }, [activeSubTab]);

  // Filter manuscripts by status groups for various submenu options
  const getSubmenuMatchedManuscripts = () => {
    return manuscripts.filter(m => {
      if (m.status === 'DRAFT') return false;

      // Filter by assigned editor if logged in and showAllSubmissions is false
      if (currentUser && currentUser.name && !showAllSubmissions) {
        const editorNameLower = currentUser.name.toLowerCase();
        const editorEmailLower = (currentUser.email || '').toLowerCase();

        const isAssignedToMe = 
          (m.assignedEditor && (
            m.assignedEditor.toLowerCase() === editorNameLower ||
            m.assignedEditor.toLowerCase().includes(editorNameLower) ||
            editorNameLower.includes(m.assignedEditor.toLowerCase())
          )) ||
          (m.assignedEditorEmail && m.assignedEditorEmail.toLowerCase() === editorEmailLower) ||
          ((m as any).assignedTo && (
            (m as any).assignedTo.toLowerCase() === editorNameLower ||
            (m as any).assignedTo.toLowerCase().includes(editorNameLower) ||
            editorNameLower.includes((m as any).assignedTo.toLowerCase())
          ));

        if (!isAssignedToMe) return false;
      }

      // Filter by the sidebar sub-tab selection
      const matchesSubTab = (() => {
        switch (activeSubTab) {
          case 'ACTIVE_SUBMISSIONS':
            return m.status === 'SUBMITTED' || m.status === 'UNDER_REVIEW' || m.status === 'AWAITING_DECISION';
          case 'NEEDS_EDITOR':
          case 'ALL_IN_SUBMISSION':
            return m.status === 'SUBMITTED';
          
          case 'AWAITING_REVIEWS':
            return m.status === 'UNDER_REVIEW' && m.reviewers.some(r => r.status === 'ACCEPTED');
          case 'REVIEWS_SUBMITTED':
            return m.status === 'AWAITING_DECISION' || (m.status === 'UNDER_REVIEW' && m.reviewers.some(r => r.status === 'SUBMITTED'));
          case 'REVIEWS_OVERDUE':
            return m.status === 'UNDER_REVIEW' && m.reviewers.length === 0;
          case 'AUTHOR_REVISIONS_SUBMITTED':
            return m.status === 'UNDER_REVIEW' && (m.editorsNotes || '').includes('revision uploaded');
          case 'ALL_IN_REVIEW':
            return m.status === 'UNDER_REVIEW' || m.status === 'AWAITING_DECISION';

          case 'ALL_IN_COPYEDITING':
            return m.status === 'ACCEPTED' && !(m.editorsNotes || '').includes('[copyedit completed]');
          case 'ALL_IN_PRODUCTION':
            return m.status === 'ACCEPTED' && (m.editorsNotes || '').includes('[copyedit completed]');
          case 'SCHEDULED_PUBLICATION':
            return m.status === 'ACCEPTED' && m.issue !== null;
          case 'PUBLISHED':
            return m.status === 'PUBLISHED';
          case 'DECLINED':
            return m.status === 'REJECTED';
          default:
            return true;
        }
      })();

      if (!matchesSubTab) return false;

      // Text search match
      const text = searchTerm.toLowerCase();
      return (
        m.id.toLowerCase().includes(text) ||
        m.title.toLowerCase().includes(text) ||
        m.abstract.toLowerCase().includes(text) ||
        m.contributors.some(c => c.name.toLowerCase().includes(text))
      );
    });
  };

  const handleSelectPaper = (paper: Manuscript) => {
    setSelectedManuscriptId(paper.id);
    setEditorsNotesTemp(paper.editorsNotes || '');
  };

  const handleAddReviewerToPaper = (reviewerId: string) => {
    if (!selectedPaper) return;
    const reviewerObj = AVAILABLE_REVIEWERS.find(r => r.id === reviewerId);
    if (!reviewerObj) return;

    if (selectedPaper.reviewers.some(r => r.id === reviewerId)) {
      alert("This reviewer is already assigned to this manuscript.");
      return;
    }

    const newAssignment: ReviewerAssignment = {
      id: reviewerObj.id,
      name: reviewerObj.name,
      email: reviewerObj.email,
      status: 'INVITED',
      recommendation: null,
      commentsToAuthor: '',
      commentsToEditor: '',
      assignedAt: new Date().toISOString(),
      invitedOn: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      type: 'External'
    };

    const updated: Manuscript = {
      ...selectedPaper,
      status: 'UNDER_REVIEW',
      reviewers: [...selectedPaper.reviewers, newAssignment]
    };

    onUpdateManuscript(updated);
    setShowAssignModal(false);
    
    alert(`✉️ SUCCESS: Peer Referee Invitation Dispatched!\n\nAn email notification has been simulated and sent to ${reviewerObj.name} (${reviewerObj.email}).\n\nLogin authorization has been securely granted. Only this specific email is now authorized to access the Reviewer Assessment Hub for Manuscript ID: ${selectedPaper.id}.`);
  };

  const handleSimulateStatusCycle = (reviewerEmail: string, newStatus: ReviewStatus) => {
    if (!selectedPaper) return;
    const updatedReviewers = selectedPaper.reviewers.map(r => {
      if (r.email === reviewerEmail) {
        return {
          ...r,
          status: newStatus,
          ...(newStatus === 'SUBMITTED' ? {
            recommendation: 'ACCEPT' as const,
            commentsToAuthor: "The overall implementation architecture is functionally sound. The experimental lock-free charts confirm linear speedup under high concurrency.",
            commentsToEditor: "Formally verified original text references verified.",
            completedAt: new Date().toISOString()
          } : {})
        };
      }
      return r;
    });

    const isAwaitingDecision = updatedReviewers.filter(r => r.status === 'SUBMITTED').length >= 1;

    const updated: Manuscript = {
      ...selectedPaper,
      reviewers: updatedReviewers,
      status: isAwaitingDecision ? 'AWAITING_DECISION' : selectedPaper.status
    };
    onUpdateManuscript(updated);
  };

  const attemptRecordDecision = (decision: 'ACCEPT' | 'REJECT' | 'REVISE') => {
    if (!selectedPaper) return;

    // Conf 2 minimum reviewers
    const MIN_REQUIRED_REVIEWS = 2;
    const submittedReviews = selectedPaper.reviewers.filter(r => r.status === 'SUBMITTED').length;

    if (submittedReviews < MIN_REQUIRED_REVIEWS && (decision === 'ACCEPT' || decision === 'REJECT')) {
      const errPayload = {
        statusCode: 428,
        error: "Precondition Required",
        code: "JMS_ERR_MIN_REVIEW_THRESHOLD_UNMET",
        message: "A formal editorial decision cannot be finalized because the manuscript has not reached the required evaluation consensus threshold.",
        parameters: {
          manuscriptId: selectedPaper.id,
          configuredMinimum: MIN_REQUIRED_REVIEWS,
          actualSubmitted: submittedReviews,
          activeReviewersCount: selectedPaper.reviewers.length
        },
        overrideRequired: true,
        endpoint: `/api/v1/editor/manuscript/${selectedPaper.id}/decision`
      };

      setPendingDecision(decision);
      setExceptionPayload(errPayload);
      setShowOverrideModal(true);
      return;
    }

    finalizeDecision(decision);
  };

  const finalizeDecision = (decision: 'ACCEPT' | 'REJECT' | 'REVISE') => {
    if (!selectedPaper) return;

    let target: ManuscriptStatus = selectedPaper.status;
    let decisionTitle = "";
    let decisionNote = "";
    let updatedRevisions: RevisionRecord[] = selectedPaper.revisions ? [...selectedPaper.revisions] : [];
    let revisionNum = 0;

    if (decision === 'ACCEPT') {
      target = 'ACCEPTED';
      decisionTitle = 'Accepted for Publication';
      decisionNote = `[Accepted for Publication on ${new Date().toLocaleDateString()}]`;
    } else if (decision === 'REJECT') {
      target = 'REJECTED';
      decisionTitle = 'Submission Declined';
      decisionNote = `[Declined on ${new Date().toLocaleDateString()}]`;
    } else if (decision === 'REVISE') {
      target = 'REVISION_REQUESTED';
      revisionNum = updatedRevisions.length + 1;
      decisionTitle = `Revisions Requested (Revision ${revisionNum})`;
      decisionNote = `[Revisions Requested (Revision ${revisionNum}) on ${new Date().toLocaleString()}]`;

      const newRevision: RevisionRecord = {
        id: `rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        revisionNumber: revisionNum,
        requestedBy: currentUser?.name || selectedPaper.assignedEditor || "Dr. Cynthia Dwork",
        requestedByEmail: currentUser?.email || selectedPaper.assignedEditorEmail || "editor@ojs-journal.org",
        requestedAt: new Date().toISOString(),
        decisionLetter: editorsNotesTemp || "Please address editorial and peer review comments in your revised submission.",
        status: 'AWAITING_AUTHOR_UPLOAD',
        uploadedFiles: []
      };
      updatedRevisions.push(newRevision);
    }

    const noteText = editorsNotesTemp 
      ? `${editorsNotesTemp}\n${decisionNote}`
      : `${selectedPaper.editorsNotes || ''}\n${decisionNote}`.trim();

    // Create discussion message for authors
    const newDiscussion: DiscussionMessage = {
      id: `msg_decision_${Date.now()}`,
      senderName: currentUser?.name || selectedPaper.assignedEditor || "Dr. Cynthia Dwork",
      senderEmail: currentUser?.email || selectedPaper.assignedEditorEmail || "editor@ojs-journal.org",
      senderRole: "EDITOR",
      text: decision === 'REVISE'
        ? `🔔 [EDITORIAL DECISION: REVISION ${revisionNum} REQUESTED]\n\nStatus: Revision Requested\nRequested By: ${currentUser?.name || selectedPaper.assignedEditor || "Dr. Cynthia Dwork"}\nRequest Date & Time: ${new Date().toLocaleString()}\n\nDecision Letter / Comments:\n${editorsNotesTemp || 'Please address referee comments and upload your revised manuscript files.'}`
        : `[Editorial Decision: ${decisionTitle}] ${editorsNotesTemp || 'Please check evaluation reports for details.'}`,
      timestamp: new Date().toISOString()
    };

    const updated: Manuscript = {
      ...selectedPaper,
      status: target,
      revisions: updatedRevisions,
      editorsNotes: noteText,
      discussions: [newDiscussion, ...(selectedPaper.discussions || [])]
    };

    onUpdateManuscript(updated);
    setShowOverrideModal(false);
    setEditorsNotesTemp('');
    setDecisionSuccessMsg(
      decision === 'REVISE'
        ? `✅ Decision Recorded: Revision ${revisionNum} Requested. Manuscript status set to 'Revision Requested' and Author notified.`
        : `✅ Decision Recorded: ${decisionTitle}. Author notified via discussion log.`
    );
    setTimeout(() => setDecisionSuccessMsg(null), 6000);
  };

  const handleCreateNewReviewRound = () => {
    if (!selectedPaper) return;
    const roundNote = `[Review Round 2 Created on ${new Date().toLocaleDateString()}]`;
    const noteText = `${selectedPaper.editorsNotes || ''}\n${roundNote}`.trim();

    const newDiscussion: DiscussionMessage = {
      id: `msg_round_${Date.now()}`,
      senderName: currentUser?.name || "Dr. Cynthia Dwork",
      senderEmail: currentUser?.email || "editor@ojs-journal.org",
      senderRole: "EDITOR",
      text: `[Review Round 2 Initiated] Additional referee invitations are now active.`,
      timestamp: new Date().toISOString()
    };

    const updated: Manuscript = {
      ...selectedPaper,
      status: 'UNDER_REVIEW',
      editorsNotes: noteText,
      discussions: [newDiscussion, ...(selectedPaper.discussions || [])]
    };

    onUpdateManuscript(updated);
    setShowAssignModal(true);
    setDecisionSuccessMsg(`✅ Review Round 2 opened! Delegate new peer referees below.`);
    setTimeout(() => setDecisionSuccessMsg(null), 6000);
  };

  const handleUploadRevisionFile = () => {
    setUploadModalCategory('REVISION');
    setUploadFileName('Revision_Revised_Manuscript.docx');
    setUploadFileType('Revision Text');
    setUploadModalOpen(true);
  };

  const handleUploadReviewFile = () => {
    setUploadModalCategory('REVIEW');
    setUploadFileName('Supplementary_Data.xlsx');
    setUploadFileType('Data Set');
    setUploadModalOpen(true);
  };

  const handleConfirmFileUpload = () => {
    if (!uploadFileName.trim()) return;
    const nextNo = (ojsRevisions.length + ojsReviewFiles.length + 1387).toString();
    const newFile = {
      no: nextNo,
      name: uploadFileName.trim(),
      date: new Date().toISOString().split('T')[0],
      type: uploadFileType
    };
    if (uploadModalCategory === 'REVISION') {
      setOjsRevisions(prev => [...prev, newFile]);
      setDecisionSuccessMsg(`✅ File #${nextNo} successfully uploaded as an author revision.`);
    } else {
      setOjsReviewFiles(prev => [...prev, newFile]);
      setDecisionSuccessMsg(`✅ File #${nextNo} successfully added to files for review.`);
    }
    setUploadModalOpen(false);
    setTimeout(() => setDecisionSuccessMsg(null), 5000);
  };

  const handleSendReminder = (reviewerId: string) => {
    if (!selectedPaper) return;
    const updatedReviewers = selectedPaper.reviewers.map(r => 
      r.id === reviewerId ? { ...r, reminderSent: true } : r
    );
    const updated: Manuscript = {
      ...selectedPaper,
      reviewers: updatedReviewers
    };
    onUpdateManuscript(updated);
    alert("Peer evaluation automated deadline reminder queued and dispatched successfully.");
  };

  const handleAddDiscussion = () => {
    const topic = prompt("Enter Discussion Topic:", "Clarification regarding Figure 2 methodology");
    if (!topic) return;
    const newDis = {
      name: topic,
      from: currentUser?.name || "Dr. Cynthia Dwork",
      lastReply: new Date().toISOString().split('T')[0],
      replies: 0,
      closed: false
    };
    setOjsDiscussions(prev => [...prev, newDis]);
    alert("New editorial review discussion thread initialized successfully.");
  };

  // State stats counters
  const mFiltered = manuscripts.filter(m => m.status !== 'DRAFT');
  const countActive = mFiltered.filter(m => m.status === 'SUBMITTED' || m.status === 'UNDER_REVIEW' || m.status === 'AWAITING_DECISION').length;
  const countNeedsEditor = mFiltered.filter(m => m.status === 'SUBMITTED').length;
  const countAwaiting = mFiltered.filter(m => m.status === 'UNDER_REVIEW').length;
  const countRevsSub = mFiltered.filter(m => m.status === 'AWAITING_DECISION' || (m.status === 'UNDER_REVIEW' && m.reviewers.some(r => r.status === 'SUBMITTED'))).length;
  const countCopyedit = mFiltered.filter(m => m.status === 'ACCEPTED' && !(m.editorsNotes || '').includes('[copyedit completed]')).length;
  const countProd = mFiltered.filter(m => m.status === 'ACCEPTED' && (m.editorsNotes || '').includes('[copyedit completed]')).length;
  const countSch = mFiltered.filter(m => m.status === 'ACCEPTED' && m.issue !== null).length;
  const countPub = mFiltered.filter(m => m.status === 'PUBLISHED').length;
  const countDec = mFiltered.filter(m => m.status === 'REJECTED').length;

  return (
    <div className="w-full bg-[#f4faf6] min-h-screen text-slate-800 pb-12 flex flex-col">
      <header className="bg-white text-slate-800 border-b border-slate-200/80 px-6 py-3.5 flex items-center justify-between sticky top-0 z-40 shadow-xs w-full">
        <div className="shrink-0">
          <TuliticsLogo iconSize={36} showText={true} textColorClass="text-[#155e42]" subTitle="EDITOR WORKSPACE • MANAGEMENT PORTAL" usePng={true} />
        </div>
        <div className="flex items-center gap-4 text-xs font-mono font-bold text-slate-500">
          <span>Logged in as: <strong className="text-slate-900">{currentUser?.name || "Dr. Cynthia Dwork"}</strong></span>
        </div>
      </header>

      <div id="editor-console-container" className="w-full max-w-[1920px] mx-auto px-6 sm:px-8 lg:px-10 py-8 flex-grow">
      
      {!selectedManuscriptId ? (
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Navigation Sidebar */}
          <div className="lg:col-span-3 space-y-6 text-left">
             <div className="bg-slate-900 text-white rounded-2xl p-5 shadow space-y-4">
              <div className="flex items-center gap-3">
                <span className="p-2 bg-[#008751]/10 border border-[#008751]/20 text-[#aef4d5] rounded-lg">
                  <UserCheck className="w-5 h-5" />
                </span>
                <div>
                  <strong className="block text-sm font-bold truncate max-w-[150px]">{currentUser?.name || "Dr. Cynthia Dwork"}</strong>
                  <span className="block text-[11px] text-emerald-300 font-mono">Managing Editor</span>
                </div>
              </div>
              <div className="pt-3 border-t border-white/5 flex justify-between items-center text-[10px] font-mono text-gray-450">
                <span>Core Jurisdiction:</span>
                <span className="text-emerald-400 font-bold">Unrestricted</span>
              </div>
            </div>

            {/* OJS WORKSPACE SIDEBAR MENUS */}
            <div className="space-y-4">
              
              {/* SUBMISSIONS COLLAPSIBLE GROUP */}
              <div className={`bg-white border rounded-3xl p-3 shadow-xs transition-all space-y-2.5 ${
                ['ACTIVE_SUBMISSIONS', 'NEEDS_EDITOR', 'ALL_IN_SUBMISSION'].includes(activeSubTab)
                  ? 'border-emerald-500 ring-2 ring-emerald-500/5 bg-[#fafdfb]'
                  : 'border-[#cfdde5]'
              }`}>
                <button
                  onClick={() => setSubmissionsOpen(!submissionsOpen)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-sans font-extrabold uppercase tracking-widest text-slate-800 hover:text-emerald-800 transition-colors cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2 font-black">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    Submissions
                  </span>
                  <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${submissionsOpen ? 'rotate-90' : ''}`} />
                </button>

                {submissionsOpen && (
                  <div className="space-y-1 mt-1 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setActiveSubTab('ACTIVE_SUBMISSIONS')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'ACTIVE_SUBMISSIONS' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><Clock className="w-4 h-4 opacity-80" /> Active Submissions</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'ACTIVE_SUBMISSIONS' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        {countActive}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('NEEDS_EDITOR')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'NEEDS_EDITOR' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 opacity-80" /> Needs Editor</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'NEEDS_EDITOR' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        {countNeedsEditor}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('ALL_IN_SUBMISSION')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'ALL_IN_SUBMISSION' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><Layers className="w-4 h-4 opacity-80" /> In Submission Stage</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'ALL_IN_SUBMISSION' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        {countNeedsEditor}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* INTEGRATED REVIEW COLLAPSIBLE GROUP */}
              <div className={`bg-white border rounded-3xl p-3 shadow-xs transition-all space-y-2.5 ${
                ['AWAITING_REVIEWS', 'REVIEWS_SUBMITTED', 'REVIEWS_OVERDUE', 'AUTHOR_REVISIONS_SUBMITTED', 'ALL_IN_REVIEW'].includes(activeSubTab)
                  ? 'border-emerald-500 ring-2 ring-emerald-500/5 bg-[#fafdfb]'
                  : 'border-[#cfdde5]'
              }`}>
                <button
                  onClick={() => setReviewsOpen(!reviewsOpen)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-sans font-extrabold uppercase tracking-widest text-slate-800 hover:text-emerald-800 transition-colors cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2 font-black">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    Review Stages
                  </span>
                  <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${reviewsOpen ? 'rotate-90' : ''}`} />
                </button>

                {reviewsOpen && (
                  <div className="space-y-1 mt-1 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setActiveSubTab('AWAITING_REVIEWS')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'AWAITING_REVIEWS' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><Clock className="w-4 h-4 opacity-80" /> Awaiting Reviews</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'AWAITING_REVIEWS' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        {countAwaiting}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('REVIEWS_SUBMITTED')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'REVIEWS_SUBMITTED' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><CheckSquare className="w-4 h-4 opacity-80" /> Reviews Submitted</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'REVIEWS_SUBMITTED' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        {countRevsSub}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('REVIEWS_OVERDUE')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'REVIEWS_OVERDUE' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><FileWarning className="w-4 h-4 opacity-80" /> Reviews Overdue</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'REVIEWS_OVERDUE' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        0
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('AUTHOR_REVISIONS_SUBMITTED')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'AUTHOR_REVISIONS_SUBMITTED' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><FileText className="w-4 h-4 opacity-80" /> Revisions Submitted</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'AUTHOR_REVISIONS_SUBMITTED' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        {manuscripts.filter(m => (m.editorsNotes || '').includes('revision uploaded')).length}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('ALL_IN_REVIEW')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'ALL_IN_REVIEW' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><Layers className="w-4 h-4 opacity-80" /> In Review Stage</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'ALL_IN_REVIEW' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        {countActive}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* COPYEDITING & PRODUCTION GROUP */}
              <div className={`bg-white border rounded-3xl p-3 shadow-xs transition-all space-y-2.5 ${
                ['ALL_IN_COPYEDITING', 'ALL_IN_PRODUCTION', 'SCHEDULED_PUBLICATION', 'PUBLISHED', 'DECLINED'].includes(activeSubTab)
                  ? 'border-emerald-500 ring-2 ring-emerald-500/5 bg-[#fafdfb]'
                  : 'border-[#cfdde5]'
              }`}>
                <button
                  onClick={() => setProductionOpen(!productionOpen)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-sans font-extrabold uppercase tracking-widest text-slate-800 hover:text-emerald-800 transition-colors cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2 font-black">
                    <Clipboard className="w-4 h-4 text-emerald-600" />
                    Copyedit & Production
                  </span>
                  <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${productionOpen ? 'rotate-90' : ''}`} />
                </button>

                {productionOpen && (
                  <div className="space-y-1 mt-1 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setActiveSubTab('ALL_IN_COPYEDITING')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'ALL_IN_COPYEDITING' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><Clipboard className="w-4 h-4 opacity-80" /> Copyediting Stage</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'ALL_IN_COPYEDITING' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        {countCopyedit}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('ALL_IN_PRODUCTION')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'ALL_IN_PRODUCTION' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><Layers className="w-4 h-4 opacity-80" /> In Production Stage</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'ALL_IN_PRODUCTION' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        {countProd}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('SCHEDULED_PUBLICATION')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'SCHEDULED_PUBLICATION' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><Clock className="w-4 h-4 opacity-80" /> Scheduled Articles</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'SCHEDULED_PUBLICATION' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        {countSch}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('PUBLISHED')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'PUBLISHED' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><BookOpen className="w-4 h-4 opacity-80" /> Published</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'PUBLISHED' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        {countPub}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveSubTab('DECLINED')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeSubTab === 'DECLINED' 
                          ? 'bg-[#008751] text-white shadow-sm ring-1 ring-emerald-600' 
                          : 'text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2"><FolderLock className="w-4 h-4 opacity-80" /> Declined / Rejected</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-black ${activeSubTab === 'DECLINED' ? 'bg-[#003820] text-emerald-300' : 'bg-slate-50 border border-[#cfdde5] text-slate-700'}`}>
                        {countDec}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* ADDITIONAL UTILITIES GROUP */}
              <div className={`bg-white border rounded-3xl p-3 shadow-xs transition-all space-y-2.5 ${
                modulesOpen ? 'border-indigo-200 ring-2 ring-indigo-500/5' : 'border-[#cfdde5]'
              }`}>
                <button
                  onClick={() => setModulesOpen(!modulesOpen)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-sans font-extrabold uppercase tracking-widest text-slate-800 hover:text-emerald-800 transition-colors cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2 font-black">
                    <Settings className="w-4 h-4 text-slate-500" />
                    Additional Tools
                  </span>
                  <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${modulesOpen ? 'rotate-90' : ''}`} />
                </button>

                {modulesOpen && (
                  <div className="space-y-1.5 mt-1 pt-2 border-t border-slate-100 text-xs text-left">
                    <button onClick={() => { setActiveSubTab('ACTIVE_SUBMISSIONS'); alert("Orchestrate assignments from the active listings above."); }} className="w-full flex items-center gap-2 px-3 py-2.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-100 rounded-xl font-semibold transition-all cursor-pointer">
                      <UserPlus className="w-4 h-4 text-emerald-500" /> Manuscript Assign
                    </button>
                    <button onClick={() => { alert("Select any active paper's Launch Control Hub to edit direct allocations."); }} className="w-full flex items-center gap-2 px-3 py-2.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-100 rounded-xl font-semibold transition-all cursor-pointer">
                      <UserCheck className="w-4 h-4 text-emerald-500" /> Referee Assigns
                    </button>
                    <button onClick={() => alert("Simulated Announcements board compiled.")} className="w-full flex items-center gap-2 px-3 py-2.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-100 rounded-xl font-semibold transition-all cursor-pointer">
                      <Megaphone className="w-4 h-4 text-emerald-500" /> Announcement News
                    </button>
                    <button onClick={() => alert("Opening Editorial Reports metrics.")} className="w-full flex items-center gap-2 px-3 py-2.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-100 rounded-xl font-semibold transition-all cursor-pointer">
                      <AreaChart className="w-4 h-4 text-emerald-500" /> Metrics Analytics
                    </button>
                    <button onClick={() => alert("Opening messages terminal.")} className="w-full flex items-center gap-2 px-3 py-2.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-100 rounded-xl font-semibold transition-all cursor-pointer">
                      <MessagesSquare className="w-4 h-4 text-emerald-500" /> Correspondence
                    </button>
                    <button onClick={() => alert("Show workspace event alarm parameters.")} className="w-full flex items-center gap-2 px-3 py-2.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-100 rounded-xl font-semibold transition-all cursor-pointer">
                      <BellRing className="w-4 h-4 text-emerald-500" /> Live Notification Event
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Right Column: Dynamic Table View */}
          <div className="lg:col-span-9 space-y-6">
            
            {(() => {
              const activeGroup = (() => {
                if (['ACTIVE_SUBMISSIONS', 'NEEDS_EDITOR', 'ALL_IN_SUBMISSION'].includes(activeSubTab)) {
                  return 'SUBMISSIONS';
                }
                if (['AWAITING_REVIEWS', 'REVIEWS_SUBMITTED', 'REVIEWS_OVERDUE', 'AUTHOR_REVISIONS_SUBMITTED', 'ALL_IN_REVIEW'].includes(activeSubTab)) {
                  return 'REVIEWS';
                }
                if (['ALL_IN_COPYEDITING', 'ALL_IN_PRODUCTION', 'SCHEDULED_PUBLICATION', 'PUBLISHED', 'DECLINED'].includes(activeSubTab)) {
                  return 'PRODUCTION';
                }
                return 'ADDITIONAL';
              })();

              return (
                <div className="bg-white border-2 border-slate-100 rounded-[32px] p-6 sm:p-8 shadow-xs space-y-8 text-left">
                  
                  {/* DYNAMIC HEADER BASED ON GROUP WITH FRESH ACCENTS */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-5 gap-4">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] font-mono font-black text-emerald-800 uppercase tracking-widest">
                        {activeGroup} Workflow Realm
                      </div>
                      <h3 className="font-sans font-black text-base sm:text-lg text-slate-900 tracking-tight leading-snug">
                        {activeGroup === 'SUBMISSIONS' && 'Submissions Intake Audit Console'}
                        {activeGroup === 'REVIEWS' && 'Dual-Blind Peer Review Monitoring Room'}
                        {activeGroup === 'PRODUCTION' && 'Copyedit & XML Galley Publication Engine'}
                        {activeGroup === 'ADDITIONAL' && 'Executive Auxiliary Tools & Alarms'}
                      </h3>
                      <p className="text-xs text-[#5a6e85]">
                        {activeGroup === 'SUBMISSIONS' && 'Select active categories to check incoming layout proofs, register direct editorial handlers, and validate author metadata.'}
                        {activeGroup === 'REVIEWS' && 'Coordinate blind peer reviewers, sanitize document signatures, verify referee reports, and prevent SLA breach exceptions.'}
                        {activeGroup === 'PRODUCTION' && 'Review mechanical styles, compile formatted PDF and XML galleys, register CrossRef DOIs, and schedule target issues.'}
                        {activeGroup === 'ADDITIONAL' && 'Examine database performance indices, trigger live alerts, and monitor system-wide compliance logs.'}
                      </p>
                    </div>

                    <div className="relative max-w-xs w-full shrink-0">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search titles / IDs..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-[#cfdde5] rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                      />
                    </div>
                  </div>

                  {/* DYNAMIC SCREEN CARDS: SUBMISSIONS REALM */}
                  {activeGroup === 'SUBMISSIONS' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <button
                          type="button"
                          onClick={() => setActiveSubTab('ACTIVE_SUBMISSIONS')}
                          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-left transition-all hover:scale-[1.01] cursor-pointer ${
                            activeSubTab === 'ACTIVE_SUBMISSIONS'
                              ? 'bg-emerald-50/50 border-emerald-400 ring-2 ring-emerald-500/5'
                              : 'bg-white hover:bg-slate-50 border-[#cfdde5]'
                          }`}
                        >
                          <div className="bg-[#198754] text-white p-2.5 rounded-xl shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-bold text-slate-800 leading-none">{countActive}</div>
                            <div className="text-[11px] font-bold text-slate-700 mt-1">Active Subventions</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveSubTab('NEEDS_EDITOR')}
                          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-left transition-all hover:scale-[1.01] cursor-pointer ${
                            activeSubTab === 'NEEDS_EDITOR'
                              ? 'bg-amber-50/50 border-amber-400 ring-2 ring-amber-500/5'
                              : 'bg-white hover:bg-slate-50 border-[#cfdde5]'
                          }`}
                        >
                          <div className="bg-amber-500 text-white p-2.5 rounded-xl shrink-0">
                            <AlertTriangle className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-bold text-slate-800 leading-none">{countNeedsEditor}</div>
                            <div className="text-[11px] font-bold text-slate-700 mt-1">Needs Editor</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveSubTab('ALL_IN_SUBMISSION')}
                          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-left transition-all hover:scale-[1.01] cursor-pointer ${
                            activeSubTab === 'ALL_IN_SUBMISSION'
                              ? 'bg-teal-50/50 border-teal-400 ring-2 ring-teal-500/5'
                              : 'bg-white hover:bg-slate-50 border-[#cfdde5]'
                          }`}
                        >
                          <div className="bg-teal-600 text-white p-2.5 rounded-xl shrink-0">
                            <Layers className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-bold text-slate-800 leading-none">{countNeedsEditor}</div>
                            <div className="text-[11px] font-bold text-slate-700 mt-1">In Submission</div>
                          </div>
                        </button>

                        <div className="border border-slate-100 rounded-2xl p-4 flex items-center gap-3.5 bg-slate-50 text-left">
                          <div className="bg-slate-700 text-white p-2.5 rounded-xl shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-bold text-slate-800 leading-none">{countActive + countCopyedit}</div>
                            <div className="text-[11px] font-bold text-slate-500 mt-1">System Pipeline</div>
                          </div>
                        </div>
                      </div>

                      {/* EXQUISITE PROTOCOL INTEGRITY SUB-VIEW */}
                      <div className="bg-[#f0f9f4] border border-emerald-200/60 rounded-2xl p-5 space-y-3.5">
                        <div className="flex items-center justify-between">
                          <strong className="text-slate-800 text-xs font-sans font-black flex items-center gap-2">
                            <CheckSquare className="w-4 h-4 text-emerald-600" /> Submissions Intake Checksum Checklist
                          </strong>
                          <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full font-bold">Automatic Validation Engine Active</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-medium text-slate-700">
                          <div className="flex items-center gap-2 p-2.5 bg-white border border-slate-100 rounded-xl shadow-2xs">
                            <span className="text-emerald-600 font-bold">✓</span> PDF Layout Constraints Verified (Format OK)
                          </div>
                          <div className="flex items-center gap-2 p-2.5 bg-white border border-slate-100 rounded-xl shadow-2xs">
                            <span className="text-emerald-600 font-bold">✓</span> Author Identity Header Metadata Purged
                          </div>
                          <div className="flex items-center gap-2 p-2.5 bg-white border border-slate-100 rounded-xl shadow-2xs">
                            <span className="text-indigo-600 font-bold">⇄</span> CrossRef Manuscript Uniqueness: <strong className="text-indigo-800">98.4% Uniqueness Check</strong>
                          </div>
                          <div className="flex items-center gap-2 p-2.5 bg-white border border-slate-100 rounded-xl shadow-2xs">
                            <span className="text-emerald-600 font-bold">✓</span> Mandatory COI Conflict Disclosures Signed
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DYNAMIC SCREEN CARDS: REVIEWS REALM */}
                  {activeGroup === 'REVIEWS' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <button
                          type="button"
                          onClick={() => setActiveSubTab('AWAITING_REVIEWS')}
                          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-left transition-all hover:scale-[1.01] cursor-pointer ${
                            activeSubTab === 'AWAITING_REVIEWS'
                              ? 'bg-indigo-50/50 border-indigo-400 ring-2 ring-indigo-500/5'
                              : 'bg-white hover:bg-slate-50 border-[#cfdde5]'
                          }`}
                        >
                          <div className="bg-indigo-600 text-white p-2.5 rounded-xl shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-bold text-slate-800 leading-none">{countAwaiting}</div>
                            <div className="text-[11px] font-bold text-slate-700 mt-1">Awaiting Reviews</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveSubTab('REVIEWS_SUBMITTED')}
                          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-left transition-all hover:scale-[1.01] cursor-pointer ${
                            activeSubTab === 'REVIEWS_SUBMITTED'
                              ? 'bg-emerald-50/50 border-emerald-400 ring-2 ring-emerald-500/5'
                              : 'bg-white hover:bg-slate-50 border-[#cfdde5]'
                          }`}
                        >
                          <div className="bg-emerald-600 text-white p-2.5 rounded-xl shrink-0">
                            <CheckSquare className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-bold text-slate-800 leading-none">{countRevsSub}</div>
                            <div className="text-[11px] font-bold text-slate-700 mt-1">Reports Received</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveSubTab('REVIEWS_OVERDUE')}
                          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-left transition-all hover:scale-[1.01] cursor-pointer ${
                            activeSubTab === 'REVIEWS_OVERDUE'
                              ? 'bg-red-50/50 border-red-400 ring-2 ring-red-500/5'
                              : 'bg-white hover:bg-slate-50 border-[#cfdde5]'
                          }`}
                        >
                          <div className="bg-red-500 text-white p-2.5 rounded-xl shrink-0">
                            <FileWarning className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-bold text-slate-800 leading-none">0</div>
                            <div className="text-[11px] font-bold text-slate-700 mt-1">SLA Overdue</div>
                          </div>
                        </button>

                        <div className="border border-emerald-200 bg-emerald-50 text-left rounded-2xl p-4 flex items-center gap-3.5">
                          <div className="bg-emerald-700 text-white p-2.5 rounded-xl shrink-0">
                            <FolderLock className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-black text-emerald-950 leading-none">100%</div>
                            <div className="text-[11px] font-bold text-emerald-800 mt-1">Anonymizer OK</div>
                          </div>
                        </div>
                      </div>

                      {/* SECURITY SHIELD TERMINAL SIMULATOR */}
                      <div className="bg-slate-900 text-slate-200 border border-slate-950 rounded-2xl p-5 space-y-3 shadow-md font-mono text-[11px]">
                        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <strong className="text-white font-bold">Double-Blind Cryptographic Shield Guard</strong>
                          </div>
                          <span className="text-slate-400 text-[10px]">VERDICT: ENFORCED</span>
                        </div>
                        <div className="space-y-1.5 text-slate-300">
                          <p className="text-slate-500">[08:44:12] INITIALIZING dual-blind peer referee session allocation keys...</p>
                          <p className="text-emerald-400">[08:44:13] SANITIZING metadata blobs... stripped doc-properties, owner tags, comment registers.</p>
                          <p className="text-emerald-400">[08:44:14] SECURING document file: output assigned strictly to referee directory.</p>
                          <p className="text-amber-400">[SYSTEM STATS] Dynamic Blind Match SLA Target: 100% Shielding Compliance.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DYNAMIC SCREEN CARDS: PRODUCTION REALM */}
                  {activeGroup === 'PRODUCTION' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <button
                          type="button"
                          onClick={() => setActiveSubTab('ALL_IN_COPYEDITING')}
                          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-left transition-all hover:scale-[1.01] cursor-pointer ${
                            activeSubTab === 'ALL_IN_COPYEDITING'
                              ? 'bg-purple-50/50 border-purple-400 ring-2 ring-purple-500/5'
                              : 'bg-white hover:bg-slate-50 border-[#cfdde5]'
                          }`}
                        >
                          <div className="bg-purple-600 text-white p-2.5 rounded-xl shrink-0">
                            <Clipboard className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-bold text-slate-800 leading-none">{countCopyedit}</div>
                            <div className="text-[11px] font-bold text-slate-700 mt-1">Copyediting Stage</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveSubTab('ALL_IN_PRODUCTION')}
                          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-left transition-all hover:scale-[1.01] cursor-pointer ${
                            activeSubTab === 'ALL_IN_PRODUCTION'
                              ? 'bg-orange-50/50 border-orange-400 ring-2 ring-orange-500/5'
                              : 'bg-white hover:bg-slate-50 border-[#cfdde5]'
                          }`}
                        >
                          <div className="bg-orange-500 text-white p-2.5 rounded-xl shrink-0">
                            <Layers className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-bold text-slate-800 leading-none">{countProd}</div>
                            <div className="text-[11px] font-bold text-slate-700 mt-1">In Production</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveSubTab('SCHEDULED_PUBLICATION')}
                          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-left transition-all hover:scale-[1.01] cursor-pointer ${
                            activeSubTab === 'SCHEDULED_PUBLICATION'
                              ? 'bg-sky-50/50 border-sky-400 ring-2 ring-sky-500/5'
                              : 'bg-white hover:bg-slate-50 border-[#cfdde5]'
                          }`}
                        >
                          <div className="bg-sky-500 text-white p-2.5 rounded-xl shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-bold text-slate-800 leading-none">{countSch}</div>
                            <div className="text-[11px] font-bold text-slate-700 mt-1">Scheduled Issues</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveSubTab('PUBLISHED')}
                          className={`border rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-left transition-all hover:scale-[1.01] cursor-pointer ${
                            activeSubTab === 'PUBLISHED'
                              ? 'bg-emerald-50/50 border-emerald-400 ring-2 ring-emerald-500/5'
                              : 'bg-white hover:bg-slate-50 border-[#cfdde5]'
                          }`}
                        >
                          <div className="bg-emerald-600 text-white p-2.5 rounded-xl shrink-0">
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xl font-bold text-slate-800 leading-none">{countPub}</div>
                            <div className="text-[11px] font-bold text-slate-700 mt-1">Published Index</div>
                          </div>
                        </button>
                      </div>

                      {/* GALLEY PORTAL */}
                      <div className="bg-[#fbfcff] border border-blue-100 rounded-2xl p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <strong className="text-slate-800 text-xs font-sans font-extrabold block">Galley Manufacture & DOI Registration</strong>
                            <p className="text-[11px] text-gray-400 mt-0.5">Automated registration protocol for peer consensus publications.</p>
                          </div>
                          <button
                            onClick={() => {
                              alert("CrossRef Node responded. DOI Prefix validated: 10.1037/jms.2026.x. PDF layout checks compiled successfully.");
                            }}
                            className="bg-slate-900 hover:bg-[#008751] text-white font-mono text-[10px] px-3.5 py-2 rounded-xl transition-all font-bold cursor-pointer"
                          >
                            Compile Test PDF Galley Proof
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px] font-mono text-slate-600">
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="block text-slate-450 uppercase text-[8px]">PREFIX STATE</span>
                            <strong className="text-emerald-700">10.1037 (OK)</strong>
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="block text-slate-450 uppercase text-[8px]">CrossRef Node</span>
                            <strong className="text-emerald-700">Active (SLA 99%)</strong>
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="block text-slate-450 uppercase text-[8px]">XML Schema</span>
                            <strong className="text-indigo-700">JATS-1.3 OK</strong>
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="block text-slate-450 uppercase text-[8px]">Galley Engine</span>
                            <strong className="text-emerald-700">Online</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DYNAMIC SCREEN CARDS: ADDITIONAL REALM */}
                  {activeGroup === 'ADDITIONAL' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="border border-slate-150 rounded-2xl p-4 flex items-center gap-3.5 bg-white shadow-2xs">
                          <div className="bg-rose-500 text-white p-2.5 rounded-xl shrink-0">
                            <BellRing className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="block text-slate-450 text-[9px] uppercase font-mono">STATUS</span>
                            <strong className="text-slate-800 text-sm font-bold">1 Alarm Stack</strong>
                          </div>
                        </div>

                        <div className="border border-slate-150 rounded-2xl p-4 flex items-center gap-3.5 bg-white shadow-2xs">
                          <div className="bg-emerald-600 text-white p-2.5 rounded-xl shrink-0">
                            <UserCheck className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="block text-slate-450 text-[9px] uppercase font-mono">JURISDICTION</span>
                            <strong className="text-slate-800 text-sm font-bold">Unrestricted</strong>
                          </div>
                        </div>

                        <div className="border border-slate-150 rounded-2xl p-4 flex items-center gap-3.5 bg-white shadow-2xs">
                          <div className="bg-teal-600 text-white p-2.5 rounded-xl shrink-0">
                            <AreaChart className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="block text-slate-450 text-[9px] uppercase font-mono">METRICS</span>
                            <strong className="text-slate-800 text-sm font-bold">99.4% SLA Score</strong>
                          </div>
                        </div>

                        <div className="border border-indigo-200 rounded-2xl p-4 flex items-center gap-3.5 bg-indigo-50 shadow-2xs">
                          <div className="bg-indigo-600 text-white p-2.5 rounded-xl shrink-0">
                            <Settings className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="block text-indigo-800 text-[9px] uppercase font-mono">INTEGRITY</span>
                            <strong className="text-indigo-900 text-sm font-bold">Platform Active</strong>
                          </div>
                        </div>
                      </div>

                      {/* ENTERPRISE SYSTEM MONITOR STATUS LOGS */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5 shadow-2xs text-xs font-sans text-slate-700">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <strong className="text-slate-800 flex items-center gap-1.5"><Settings className="w-4 h-4 text-emerald-500" /> Administrative Auxiliaries</strong>
                          <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-bold">Secure Socket Open</span>
                        </div>
                        <div className="space-y-2 text-slate-600">
                          <p>• <strong>Automated System Correspondence Stack:</strong> Fully operational, processing review reminder delivery queues.</p>
                          <p>• <strong>Notification Sockets:</strong> 0 active alert queues in main thread spool.</p>
                          <p>• <strong>Relational Schema State:</strong> Drizzle ORM synchronized completely on multi-tenant indexes.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* RENDER TABLE OR CONDITIONAL EMPTY STATE */}
                  {(() => {
                    const list = getSubmenuMatchedManuscripts();

                    // If showAllSubmissions is FALSE, we display the beautiful empty state with the button to list submissions.
                    if (!showAllSubmissions) {
                      return (
                        <div className="flex flex-col items-center justify-center p-12 text-center bg-[#fcfdfe] border border-dashed border-[#cfdde5] rounded-3xl space-y-6">
                      <div className="w-24 h-24 bg-[#eafaf1] rounded-full flex items-center justify-center border border-emerald-100 shadow-sm relative select-none">
                        <div className="absolute inset-2 bg-emerald-500/10 rounded-full blur-xs" />
                        <svg className="w-12 h-12 text-[#198754] relative z-10 animate-hover" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                        </svg>
                      </div>
                      <div className="space-y-1.5 max-w-md">
                        <h4 className="text-sm font-sans font-extrabold text-slate-800 tracking-tight">
                          No manuscript records registered under the selected sub-tab category.
                        </h4>
                        <p className="text-xs text-slate-450 text-slate-500 font-sans font-bold">
                          Try selecting a different workflow status from the left menu.
                        </p>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAllSubmissions(true);
                          }}
                          className="bg-[#008751] hover:bg-[#007043] text-white font-sans font-extrabold text-xs px-5 py-3 rounded-xl transition-all inline-flex items-center gap-1.5 shadow-md cursor-pointer uppercase tracking-wider hover:scale-[1.02] active:scale-95 animate-pulse"
                        >
                          View All Submissions <span className="text-sm leading-none font-bold">→</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                if (list.length === 0) {
                  return (
                    <div className="p-12 text-center text-xs text-gray-400 bg-slate-50 border border-dashed rounded-xl">
                      No results match your search or filters within this sub-tab.
                    </div>
                  );
                }

                return (
                  <div className="space-y-4 text-xs font-sans">
                    {list.map((m) => {
                      const completedReviews = m.reviewers.filter(r => r.status === 'SUBMITTED').length;
                      return (
                        <div 
                          key={m.id} 
                          className={`border-[1.5px] rounded-[24px] p-6 bg-white transition-all duration-200 hover:shadow-sm space-y-4 text-left ${
                            m.status === 'UNDER_REVIEW' 
                              ? 'border-emerald-500 bg-[#fafdfb]' 
                              : 'border-[#cfdde5] bg-white hover:border-[#008751]/50'
                          }`}
                        >
                          
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono bg-[#fafdfb] text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-200/50 text-[10px] font-bold shadow-4xs">
                              {m.id}
                            </span>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-sans font-black tracking-widest uppercase border ${
                              m.status === 'SUBMITTED' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              m.status === 'UNDER_REVIEW' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 animate-pulse' :
                              m.status === 'AWAITING_DECISION' ? 'bg-sky-50 text-sky-850 border-sky-200' :
                              m.status === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-850 border-emerald-250' :
                              m.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-800 border-emerald-250' : 'bg-red-50 text-red-800 border-red-200'
                            }`}>
                              {m.status.replace('_', ' ')}
                            </span>
                          </div>

                          <div>
                            <strong className="block text-slate-900 text-base font-sans font-extrabold leading-snug">{m.title}</strong>
                            <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{m.abstract}</p>
                          </div>

                          {/* ANONYMITY BAR */}
                          <div className="flex items-center gap-3.5 text-[11px] font-mono text-slate-500 border-t border-dashed border-slate-200 pt-4">
                            <span>Reviews: <strong className="text-slate-800 font-black">{completedReviews} / {m.reviewers.length}</strong></span>
                            {m.isDoubleBlind ? (
                              <span className="text-emerald-700 font-bold flex items-center gap-1">
                                <span>✓ Double-Blind Anonymizer Sealed</span>
                              </span>
                            ) : (
                              <span className="text-slate-400">Open Review Mode</span>
                            )}
                          </div>

                          <div className="flex justify-end items-center gap-3 pt-2">
                            <button
                              onClick={() => {
                                if (confirm("Do you want to delete?")) {
                                  onDeleteManuscript(m.id);
                                }
                              }}
                              className="border border-red-200 hover:border-red-500 hover:bg-red-50 text-red-650 text-red-600 font-sans font-extrabold text-[11px] px-4 py-3 rounded-xl transition-all cursor-pointer uppercase tracking-wider shadow-2xs"
                            >
                              Delete Submission
                            </button>
                            <button
                              onClick={() => handleSelectPaper(m)}
                              className="bg-[#004d2e] hover:bg-[#003820] text-white font-sans font-extrabold text-[11px] px-5 py-3 rounded-xl transition-all inline-flex items-center gap-2 cursor-pointer uppercase tracking-wider shadow-sm hover:scale-[1.02] active:scale-95"
                            >
                              Launch Control Hub <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                );
              })()}
                </div>
              );
            })()}

            {/* HIGH-FIDELITY COMPLIANCE SECURITY FOOTER BAR */}
            <div className="bg-[#f4faf7] border border-[#e2f2ea] rounded-3xl p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              <div className="flex gap-3 text-left">
                <div className="w-10 h-10 bg-emerald-100/70 border border-emerald-200 rounded-full flex items-center justify-center text-[#198754] shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296a3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068z" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-extrabold text-slate-800 font-sans tracking-tight">Strict Workflow Lock</h4>
                  <p className="text-[11px] text-slate-500 leading-snug">This workspace is protected under strict workflow governance.</p>
                  <a href="#workflow-lock" onClick={(e) => { e.preventDefault(); alert("Substrate strict workflow protection is enabled by JMS Protocol."); }} className="text-[#008751] text-[10px] font-bold block hover:underline">Learn more →</a>
                </div>
              </div>

              <div className="flex gap-3 text-left">
                <div className="w-10 h-10 bg-emerald-100/70 border border-emerald-200 rounded-full flex items-center justify-center text-[#198754] shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-extrabold text-slate-800 font-sans tracking-tight">Multi-Tenant Secure</h4>
                  <p className="text-[11px] text-slate-500 leading-snug">Isolated editorial environment with role-based access.</p>
                  <a href="#tenant-secure" onClick={(e) => { e.preventDefault(); alert("Role boundaries secure both reviewers and authors from overlap."); }} className="text-[#008751] text-[10px] font-bold block hover:underline">Learn more →</a>
                </div>
              </div>

              <div className="flex gap-3 text-left">
                <div className="w-10 h-10 bg-emerald-100/70 border border-emerald-200 rounded-full flex items-center justify-center text-[#198754] shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625c0-1.85-1.503-3.375-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-extrabold text-slate-800 font-sans tracking-tight">Smart Review Orchestration</h4>
                  <p className="text-[11px] text-slate-500 leading-snug">Automate assignments, reminders and decision pathways.</p>
                  <a href="#orchestration" onClick={(e) => { e.preventDefault(); alert("Review pipelines dynamically track SLAs and exception overrides."); }} className="text-[#008751] text-[10px] font-bold block hover:underline">Learn more →</a>
                </div>
              </div>

              <div className="flex gap-3 text-left">
                <div className="w-10 h-10 bg-emerald-100/70 border border-emerald-200 rounded-full flex items-center justify-center text-[#198754] shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-extrabold text-slate-800 font-sans tracking-tight">Data Integrity First</h4>
                  <p className="text-[11px] text-slate-500 leading-snug">All actions are logged and fully auditable.</p>
                  <a href="#integrity" onClick={(e) => { e.preventDefault(); alert("Double-blind cryptographic logs prevent identity disclosures."); }} className="text-[#008751] text-[10px] font-bold block hover:underline">Learn more →</a>
                </div>
              </div>
            </div>

          </div>

        </div>

      ) : (

        // ===============================================
        // DETAILED CONTROL HUB VIEW FOR SELECTED PAPER
        // ===============================================
        <div id="editor-hub-view" className="space-y-6 text-left">
          
          {/* High-Fidelity Integrated OJS Detailed Header Banner matching attachment */}
          <div className="bg-[#004d2e] relative rounded-[28px] p-8 text-white overflow-[#hidden] overflow-hidden shadow-md mb-8 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 border-b-4 border-[#003820] text-left select-none">
            {/* Elegant SVG mesh wave/ripple patterns overlay simulating the screenshot's wave graphic */}
            <div className="absolute inset-0 pointer-events-none z-0 opacity-20">
              <svg className="w-full h-full" viewBox="0 0 1000 200" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0,100 C150,150 350,50 500,120 C650,190 850,110 1000,150 L1000,200 L0,200 Z" fill="url(#wave-grad)" />
                <path d="M0,80 C180,40 280,140 450,100 C620,60 780,160 1000,80" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
                <path d="M0,120 C120,160 320,80 520,140 C720,200 820,120 1000,160" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
                <path d="M0,150 C200,90 400,180 600,110 C800,40 900,130 1000,100" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <defs>
                  <linearGradient id="wave-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#059669" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div className="flex items-start sm:items-center gap-5 text-left relative z-10 w-full lg:w-auto">
              {/* Retro Circle Back Button */}
              <button
                onClick={() => setSelectedManuscriptId(null)}
                className="w-11 h-11 border-2 border-white/20 hover:bg-white/10 hover:border-white/40 text-white rounded-full flex items-center justify-center transition-all cursor-pointer bg-emerald-950/30 shrink-0 shadow-sm"
                title="Back to submissions grid"
              >
                <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
              </button>
              
              <div className="space-y-2">
                <div className="flex items-center gap-x-3.5 flex-wrap gap-y-2">
                  {/* ID with customized visual label style matching 'OJS-6241' */}
                  <span className="text-2xl font-sans font-black tracking-tight text-white select-all">
                    {selectedPaper?.id || 'OJS-6241'}
                  </span>
                  
                  {/* Contributor surname label badge matching 'LOVELACE' */}
                  <span className="text-[10px] font-mono font-black uppercase bg-[#005c3a] border border-[#059669]/60 px-3 py-1 rounded-lg text-emerald-300 tracking-wider select-none">
                    {selectedPaper?.contributors[0]?.name ? selectedPaper.contributors[0].name.split(' ').pop()?.toUpperCase() : 'LOVELACE'}
                  </span>
                  
                  {/* Paper Title (bold & prominent) */}
                  <h1 className="font-sans font-black text-white text-base md:text-lg lg:text-xl leading-tight tracking-tight pl-3 border-l-2 border-white/20 select-all">
                    {selectedPaper?.title || "Distributed"}
                  </h1>
                </div>
                
                {/* Active Underway Target Flag State: REVIEW (ROUND 1) in same position with solid yellow/amber dot */}
                <div className="flex items-center gap-2 pt-0.5 select-none tracking-widest text-[#f59e0b] font-mono font-black text-[10px] uppercase">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse inline-block shadow-[0_0_10px_rgba(251,191,36,0.5)]"></span>
                  <span>Review (Round 1)</span>
                </div>
              </div>
            </div>

            {/* Quick action controllers matching screenshot on right */}
            <div className="flex items-center gap-3 shrink-0 relative z-10 text-[11px] font-sans font-black tracking-wide leading-none self-end lg:self-auto">
              <button 
                onClick={() => alert(`Simulating activity log logs telemetry trace for #${selectedPaper?.id}`)}
                className="bg-transparent border border-white/20 hover:bg-white/10 hover:border-white/30 text-white px-4.5 py-3 rounded-xl transition-all cursor-pointer inline-flex items-center gap-2 select-none shadow-xs"
              >
                <Clipboard className="w-4 h-4 text-[#aef4d5]" />
                <span>Activity Log</span>
              </button>
              <button 
                onClick={() => alert(`Viewing document libraries for active submission ${selectedPaper?.id}`)}
                className="bg-transparent border border-white/20 hover:bg-white/10 hover:border-white/30 text-white px-4.5 py-3 rounded-xl transition-all cursor-pointer inline-flex items-center gap-2 select-none shadow-xs"
              >
                <BookOpen className="w-4 h-4 text-[#aef4d5]" />
                <span>Library</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* COLUMN 1: LEFT SIDEBAR TABS (OJS NAVIGATION) - Colspan 3 */}
            <div className="lg:col-span-3 space-y-4 text-left">
              <div className="bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-tiny text-sm">
                
                {/* WORKFLOW CATEGORY */}
                <div className="p-3 bg-[#fcfdfe] border-b border-gray-150 flex items-center justify-between">
                  <span className="font-extrabold text-[#004d2e] uppercase tracking-wider text-[11px] block font-mono">Workflow</span>
                  <span className="text-[10px] text-slate-400">▲</span>
                </div>
                
                <div className="flex flex-col p-1.5 space-y-1">
                  {/* Submission */}
                  <button
                    onClick={() => setEditorOjsTab('SUBMISSION')}
                    className={`w-full p-2.5 px-3 rounded-xl text-left transition-all flex items-center justify-between font-bold text-xs ${
                      editorOjsTab === 'SUBMISSION' 
                        ? 'bg-[#004d2e] text-white' 
                        : 'text-slate-705 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className={`w-4 h-4 ${editorOjsTab === 'SUBMISSION' ? 'text-white' : 'text-slate-400'}`} />
                      <span>Submission</span>
                    </div>
                    <span className="text-[#059669] font-black text-sm">✓</span>
                  </button>

                  {/* Review (Active Highlighted) */}
                  <button
                    onClick={() => setEditorOjsTab('REVIEW')}
                    className={`w-full p-2.5 px-3 rounded-xl text-left transition-all flex flex-col font-bold text-xs ${
                      editorOjsTab === 'REVIEW' 
                        ? 'bg-[#004d2e] text-white shadow-sm' 
                        : 'text-slate-705 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2.5">
                        <CheckSquare className={`w-4 h-4 ${editorOjsTab === 'REVIEW' ? 'text-white' : 'text-slate-400'}`} />
                        <span className="font-extrabold">Review</span>
                      </div>
                      <span className="bg-white text-emerald-800 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-tiny">
                        1
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-200 mt-0.5 pl-6.5 font-mono">
                      Round 1
                    </span>
                  </button>

                  {/* Copyediting */}
                  <button
                    onClick={() => setEditorOjsTab('COPYEDITING')}
                    className={`w-full p-2.5 px-3 rounded-xl text-left transition-all flex items-center justify-between font-medium text-xs ${
                      editorOjsTab === 'COPYEDITING' 
                        ? 'bg-[#004d2e] text-white' 
                        : 'text-slate-705 hover:bg-slate-50 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Layers className={`w-4 h-4 ${editorOjsTab === 'COPYEDITING' ? 'text-white' : 'text-slate-400'}`} />
                      <span>Copyediting</span>
                    </div>
                    <span className="bg-emerald-50 text-emerald-800 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border border-emerald-150">
                      2
                    </span>
                  </button>

                  {/* Production */}
                  <button
                    onClick={() => setEditorOjsTab('PRODUCTION')}
                    className={`w-full p-2.5 px-3 rounded-xl text-left transition-all flex items-center justify-between font-medium text-xs ${
                      editorOjsTab === 'PRODUCTION' 
                        ? 'bg-[#004d2e] text-white' 
                        : 'text-slate-705 hover:bg-slate-50 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Archive className={`w-4 h-4 ${editorOjsTab === 'PRODUCTION' ? 'text-white' : 'text-slate-400'}`} />
                      <span>Production</span>
                    </div>
                    <span className="bg-[#f1f5f9] text-slate-500 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      0
                    </span>
                  </button>
                </div>

                {/* PUBLICATION CATEGORY */}
                <div className="p-3 bg-[#fcfdfe] border-b border-t border-gray-150 flex items-center justify-between">
                  <span className="font-extrabold text-[#004d2e] uppercase tracking-wider text-[11px] block font-mono">Publication</span>
                  <span className="text-slate-400">▲</span>
                </div>

                <div className="flex flex-col p-1.5 space-y-1">
                  {/* Title & Abstract */}
                  <button
                    onClick={() => setEditorOjsTab('TITLE_ABSTRACT')}
                    className={`w-full p-2.5 px-3 rounded-xl text-left transition-all flex items-center justify-between font-medium text-xs ${
                      editorOjsTab === 'TITLE_ABSTRACT' ? 'bg-[#004d2e] text-white' : 'text-slate-750 hover:bg-slate-50 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className={`w-4 h-4 ${editorOjsTab === 'TITLE_ABSTRACT' ? 'text-white' : 'text-slate-400'}`} />
                      <span>Title & Abstract</span>
                    </div>
                    <span className="text-[#059669] font-extrabold">✓</span>
                  </button>

                  {/* Contributors */}
                  <button
                    onClick={() => setEditorOjsTab('CONTRIBUTORS')}
                    className={`w-full p-2.5 px-3 rounded-xl text-left transition-all flex items-center justify-between font-medium text-xs ${
                      editorOjsTab === 'CONTRIBUTORS' ? 'bg-[#004d2e] text-white' : 'text-slate-755 hover:bg-slate-50 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <UserPlus className={`w-4 h-4 ${editorOjsTab === 'CONTRIBUTORS' ? 'text-white' : 'text-slate-400'}`} />
                      <span>Contributors</span>
                    </div>
                    <span className="text-[#059669] font-extrabold">✓</span>
                  </button>

                  {/* Metadata */}
                  <button
                    onClick={() => setEditorOjsTab('METADATA')}
                    className={`w-full p-2.5 px-3 rounded-xl text-left transition-all flex items-center justify-between font-medium text-xs ${
                      editorOjsTab === 'METADATA' ? 'bg-[#004d2e] text-white' : 'text-slate-750 hover:bg-slate-50 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Settings className={`w-4 h-4 ${editorOjsTab === 'METADATA' ? 'text-white' : 'text-slate-400'}`} />
                      <span>Metadata</span>
                    </div>
                    <span className="text-[#059669] font-extrabold">✓</span>
                  </button>

                  {/* References */}
                  <button
                    onClick={() => setEditorOjsTab('REFERENCES')}
                    className={`w-full p-2.5 px-3 rounded-xl text-left transition-all flex items-center justify-between font-medium text-xs ${
                      editorOjsTab === 'REFERENCES' ? 'bg-[#004d2e] text-white' : 'text-slate-750 hover:bg-slate-50 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <BookOpen className={`w-4 h-4 ${editorOjsTab === 'REFERENCES' ? 'text-white' : 'text-slate-400'}`} />
                      <span>References</span>
                    </div>
                    <span className="text-[#059669] font-extrabold">✓</span>
                  </button>

                  {/* Galleys */}
                  <button
                    onClick={() => setEditorOjsTab('GALLEYS')}
                    className={`w-full p-2.5 px-3 rounded-xl text-left transition-all flex items-center justify-between font-bold text-xs ${
                      editorOjsTab === 'GALLEYS' ? 'bg-[#004d2e] text-white' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Layers className={`w-4 h-4 ${editorOjsTab === 'GALLEYS' ? 'text-white' : 'text-slate-400'}`} />
                      <span>Galleys</span>
                    </div>
                    <span className="text-[#059669] font-extrabold">✓</span>
                  </button>

                  {/* JATS XML */}
                  <button
                    onClick={() => setEditorOjsTab('JATS_XML')}
                    className={`w-full p-2.5 px-3 rounded-xl text-left transition-all flex items-center justify-between font-bold text-xs ${
                      editorOjsTab === 'JATS_XML' ? 'bg-[#004d2e] text-white' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <FileWarning className={`w-4 h-4 ${editorOjsTab === 'JATS_XML' ? 'text-white' : 'text-slate-400'}`} />
                      <span>JATS XML</span>
                    </div>
                    <span className="text-[#059669] font-extrabold">✓</span>
                  </button>

                  {/* Permissions & Disclosure */}
                  <button
                    onClick={() => setEditorOjsTab('PERMISSIONS')}
                    className={`w-full p-2.5 px-3 rounded-xl text-left transition-all flex items-center justify-between font-bold text-xs ${
                      editorOjsTab === 'PERMISSIONS' ? 'bg-[#004d2e] text-white' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <FolderLock className={`w-4 h-4 ${editorOjsTab === 'PERMISSIONS' ? 'text-white' : 'text-slate-400'}`} />
                      <span>Permissions & Disclosure</span>
                    </div>
                    <span className="text-[#059669] font-extrabold">✓</span>
                  </button>

                  {/* Issue */}
                  <button
                    onClick={() => setEditorOjsTab('ISSUE')}
                    className={`w-full p-2.5 px-3 rounded-xl text-left transition-all flex items-center justify-between font-bold text-xs ${
                      editorOjsTab === 'ISSUE' ? 'bg-[#004d2e] text-white' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Archive className={`w-4 h-4 ${editorOjsTab === 'ISSUE' ? 'text-white' : 'text-slate-400'}`} />
                      <span>Issue</span>
                    </div>
                    <span className="text-[#059669] font-extrabold">✓</span>
                  </button>
                </div>

              </div>

              {/* Exact Replica "Need Help?" widget matching layout */}
              <div id="need-help-card" className="bg-[#fbfeff] border border-gray-150 rounded-2xl p-5 shadow-tiny space-y-3.5 text-left">
                <div className="flex items-center gap-2 text-slate-700 font-black text-xs uppercase tracking-wider font-sans">
                  <span className="text-base">🎧</span>
                  <span>Need Help?</span>
                </div>
                <p className="text-xs text-slate-500 font-sans leading-relaxed">
                  Read our editor guidelines or contact support.
                </p>
                <div className="pt-1">
                  <button 
                    type="button"
                    onClick={() => setEditorOjsTab('GUIDELINES')}
                    className="w-full bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-2 px-3 border border-slate-200 rounded-xl text-center shadow-tiny transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>View Guidelines</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

             {/* COLUMN 2: CENTER WORKSPACE AREA (OJS WORKFLOW PANELS) - Colspan 9 / grid columns split internally */}
          <div className="lg:col-span-9 text-sm">
              
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start text-sm">
                
                {/* MIDDLE PANELS SECTION (COLSPAN 9) */}
                <div className="xl:col-span-9">
                  {editorOjsTab === 'REVIEW' && (
                    <div className="space-y-5 text-left font-sans text-sm">
                      
                      {/* SECTION A: Evaluation & Consensus Status OR Intake Screening Phase */}
                      {selectedPaper?.status === 'SUBMITTED' ? (
                        <div className="bg-slate-900 text-white rounded-3xl shadow-lg p-6 border-b-4 border-emerald-600 mb-6 relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-slate-900 to-slate-800 opacity-95 z-0"></div>
                          <div className="relative z-10 space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold text-[10px] px-2.5 py-1 rounded-md uppercase tracking-wider flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Intake Screening Phase</span>
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">Ready for Desk Evaluation</span>
                            </div>
                            <div className="space-y-1">
                              <h3 className="text-base font-bold font-sans tracking-tight text-white flex items-center gap-2">📥 Initial Desk Screening & Intake Decisions</h3>
                              <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                                The manuscript is currently in the unassigned, unreviewed screening queue. Before inviting university consensus referees, you can read the submission files and make an intake decision:
                              </p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm("Bypass peer review and Accept this manuscript directly?")) {
                                    const updated = {
                                      ...selectedPaper,
                                      status: 'ACCEPTED' as const,
                                      editorsNotes: `${selectedPaper.editorsNotes}\n\n[Desk Acceptance - Editorial Oversight Rules]: Approved by Editor without external review on ${new Date().toISOString().split('T')[0]}.`
                                    };
                                    onUpdateManuscript(updated);
                                    alert("SUCCESS: Manuscript accepted directly via editor desk oversight. Transitioned to Copyediting.");
                                  }
                                }}
                                className="bg-[#008751] hover:bg-[#007043] text-white font-bold py-2.5 px-3.5 rounded-xl text-xs transition duration-150 text-center cursor-pointer shadow-sm"
                              >
                                Desk Accept Manuscript
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = {
                                    ...selectedPaper,
                                    status: 'UNDER_REVIEW' as const,
                                    editorsNotes: `${selectedPaper.editorsNotes}\n\n[Intake Screening]: Manuscript approved for formal peer evaluation on ${new Date().toISOString().split('T')[0]}.`
                                  };
                                  onUpdateManuscript(updated);
                                  alert("SUCCESS: Manuscript approved for peer evaluation. You can now invite peer referees below.");
                                }}
                                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-bold py-2.5 px-3.5 rounded-xl text-xs transition duration-150 text-center cursor-pointer shadow-sm"
                              >
                                Send to Peer Review
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm("Are you sure you want to desk reject this manuscript?")) {
                                    const updated = {
                                      ...selectedPaper,
                                      status: 'REJECTED' as const,
                                      editorsNotes: `${selectedPaper.editorsNotes}\n\n[Desk Rejection - Intake Screening]: Declined as out of scope on ${new Date().toISOString().split('T')[0]}.`
                                    };
                                    onUpdateManuscript(updated);
                                    alert("SUCCESS: Manuscript desk rejected and archived.");
                                  }
                                }}
                                className="bg-rose-50 hover:bg-rose-100 border border-rose-100 text-rose-700 font-bold py-2.5 px-3.5 rounded-xl text-xs transition duration-150 text-center cursor-pointer"
                              >
                                Desk Reject Manuscript
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-5 space-y-4 mb-6 text-left">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                              <CheckSquare className="w-4 h-4 text-[#008751]" />
                              Consensus & Progress Status
                            </h3>
                            {selectedPaper?.isDoubleBlind && (
                              <span className="bg-emerald-50 text-[#008751] border border-emerald-100 font-mono font-bold text-[9.5px] px-2.5 py-1 rounded-md uppercase tracking-wider flex items-center gap-1">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span>Anonymity Seal Active</span>
                              </span>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center bg-slate-50/50 p-4 rounded-xl border border-slate-100 shadow-tiny">
                            <div className="md:col-span-7 space-y-2">
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Evaluation Completion</p>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs font-medium">
                                  <span className="text-slate-600">Minimum reviews required: <strong className="text-slate-900 font-bold">2</strong></span>
                                  <span className="font-bold text-slate-800">
                                    {selectedPaper?.id === 'OJS-6241' ? '0' : selectedPaper?.reviewers.filter(r => r.status === 'SUBMITTED').length || 0} / 2 Completed
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-[#008751] h-full rounded-full transition-all duration-300"
                                    style={{ width: `${selectedPaper?.id === 'OJS-6241' ? '0%' : Math.min(100, ((selectedPaper?.reviewers.filter(r => r.status === 'SUBMITTED').length || 0) / 2) * 100) + '%'}` }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="md:col-span-5">
                              {((selectedPaper?.reviewers || []).filter(r => r.status === 'SUBMITTED').length >= 2) ? (
                                <div className="text-xs text-[#0f5132] bg-[#d1e7dd] border border-[#badbcc] p-3 rounded-xl flex items-center justify-center font-medium gap-2 text-center">
                                  <CheckSquare className="w-4.5 h-4.5 text-[#0f5132] shrink-0" />
                                  <span>Safeguard metrics reached. Standard consensus achieved.</span>
                                </div>
                              ) : (
                                <div className="text-xs text-[#cf222e] bg-[#fff5f5] border border-[#ffe3e3] p-3 rounded-xl flex items-center justify-center font-medium gap-2 text-center">
                                  <AlertCircle className="w-4.5 h-4.5 text-[#cf222e] shrink-0" />
                                  <span>A peer evaluation report is outstanding.</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* SECTION B: Delegated Peer Referees (2nd pic) - Highlighted Section with Box Shadow */}
                      <div className="bg-white border-2 border-emerald-100/80 rounded-3xl shadow-xl p-5 space-y-4 mb-6 border-l-8 border-l-[#008751]">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                              👥 Delegated Peer Referees
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">Invited university consensus referees assigned to evaluate this proposal.</p>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setShowAssignModal(true)}
                            className="bg-[#008751] hover:bg-[#007043] text-white px-3.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer shadow-md hover:shadow-lg transition duration-150"
                          >
                            + Invite Referee
                          </button>
                        </div>

                        <div className="overflow-x-auto border border-slate-100 rounded-xl bg-slate-50/20">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-100 text-slate-400 font-mono text-[10px] uppercase tracking-wider bg-slate-50/50">
                                <th className="p-3 pl-4">Referee</th>
                                <th className="p-3">Status</th>
                                <th className="p-3">Type</th>
                                <th className="p-3">Invited On</th>
                                <th className="p-3">Due Date</th>
                                <th className="p-3 pr-4 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                              {ojsReviewers.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">
                                    No peer referees delegated yet. Click "+ Invite Referee" to assign review tasks.
                                  </td>
                                </tr>
                              ) : (
                                ojsReviewers.map((r) => {
                                  const isOverdue = r.status === 'Overdue';
                                  const isDeclined = r.status === 'Declined' || r.status === 'Request Declined';
                                  const isInvited = r.status === 'Invited';
                                  const isReviewing = r.status === 'Reviewing';
                                  const isCompleted = r.status === 'Completed';
                                  const initials = r.name ? r.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'RV';

                                  return (
                                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="p-3 pl-4">
                                        <div className="flex items-center gap-2.5">
                                          <span className="w-7 h-7 rounded bg-emerald-50 text-[#008751] border border-emerald-100 flex items-center justify-center font-bold text-xs select-none">
                                            {initials}
                                          </span>
                                          <div>
                                            <span className="font-bold text-slate-800 block text-xs">{r.name}</span>
                                            <span className="text-[10px] text-slate-400 block font-mono">{r.email}</span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="p-3">
                                        {isOverdue ? (
                                          <span className="bg-rose-50 border border-rose-100 text-rose-700 px-2.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 shadow-xs">
                                            Overdue
                                          </span>
                                        ) : isDeclined ? (
                                          <span className="bg-slate-100 border border-slate-200 text-slate-500 px-2.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1">
                                            Declined
                                          </span>
                                        ) : isInvited ? (
                                          <span className="bg-emerald-50 border border-emerald-100 text-[#0f5132] px-2.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 shadow-xs animate-pulse">
                                            Invited
                                          </span>
                                        ) : isReviewing ? (
                                          <span className="bg-amber-50 border border-amber-200 text-amber-850 px-2.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 shadow-xs">
                                            Reviewing
                                          </span>
                                        ) : isCompleted ? (
                                          <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-2.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 shadow-xs">
                                            Completed
                                          </span>
                                        ) : (
                                          <span className="bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded text-[10px] font-semibold">
                                            {r.status}
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-3 text-slate-500 font-mono text-[11px]">{r.type || 'External'}</td>
                                      <td className="p-3 text-slate-500 font-mono text-[11px]">{r.invitedOn}</td>
                                      <td className="p-3 text-slate-500 font-mono text-[11px]">{r.dueDate}</td>
                                      <td className="p-3 pr-4 text-right">
                                        {(isOverdue || isReviewing) && (
                                          <button 
                                            type="button"
                                            onClick={() => handleSendReminder(r.id)}
                                            disabled={r.actionSent}
                                            className={`font-mono font-bold uppercase text-[9px] tracking-wider px-2.5 py-1 rounded transition-all border ${
                                              r.actionSent 
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                                                : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-850'
                                            }`}
                                          >
                                            {r.actionSent ? 'Sent ✓' : 'Remind'}
                                          </button>
                                        )}
                                        {isCompleted && (
                                          <button 
                                            type="button"
                                            onClick={() => handleOpenEvaluation(r)}
                                            className="bg-emerald-50 hover:bg-[#008751] hover:text-white border border-[#008751] text-[#008751] font-bold px-2.5 py-1 rounded transition-all cursor-pointer text-center"
                                          >
                                            Report
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* SECTION C: Manuscript Files & Author Revisions */}
                      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-5 space-y-4 mb-6 text-left">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          
                          {/* Evaluation Files Column */}
                          <div className="space-y-3 text-left">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">Files for Review</span>
                              <button 
                                type="button"
                                onClick={handleUploadReviewFile}
                                className="text-[#008751] hover:underline font-bold text-xs"
                              >
                                + Add File
                              </button>
                            </div>
                            
                            <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 bg-slate-50/20 overflow-hidden">
                              {ojsReviewFiles.map((file) => {
                                const isArticle = file.type === "Article Text";
                                return (
                                  <div key={file.no} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                          isArticle ? 'bg-[#008751] text-white' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {file.type}
                                        </span>
                                        <span className={`text-xs font-bold truncate ${isArticle ? 'text-[#004d2b]' : 'text-slate-700'}`}>
                                          {file.name}
                                        </span>
                                      </div>
                                      <span className="block text-[10px] text-slate-400 mt-1 font-mono">ID: {file.no} • Uploaded: {file.date}</span>
                                    </div>
                                    <button 
                                      type="button"
                                      onClick={() => setReadingFile({ name: file.name, type: file.type, no: file.no })}
                                      className="bg-emerald-50 hover:bg-emerald-600 hover:text-white text-[#008751] border border-emerald-100 font-bold text-xs px-2.5 py-1 rounded transition-all shrink-0 ml-2"
                                    >
                                      View & Read
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Author Revisions Column */}
                          <div className="space-y-3 text-left">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">Author Revisions</span>
                              <button 
                                type="button"
                                onClick={handleUploadRevisionFile}
                                className="text-[#008751] hover:underline font-bold text-xs"
                              >
                                + Upload Revision
                              </button>
                            </div>

                            {selectedPaper?.revisions && selectedPaper.revisions.length > 0 ? (
                              <div className="space-y-3">
                                {selectedPaper.revisions.map((rev) => (
                                  <div key={rev.id} className="border border-slate-200 rounded-xl p-3.5 bg-white shadow-xs space-y-2.5">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-extrabold rounded-md uppercase tracking-wide">
                                          Revision {rev.revisionNumber}
                                        </span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase border ${
                                          rev.status === 'REVISION_SUBMITTED' || rev.status === 'COMPLETED'
                                            ? 'bg-emerald-50 text-[#008751] border-emerald-200'
                                            : 'bg-amber-50 text-amber-800 border-amber-200'
                                        }`}>
                                          {rev.status === 'AWAITING_AUTHOR_UPLOAD' ? 'Awaiting Author Upload' : rev.status.replace(/_/g, ' ')}
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        {new Date(rev.requestedAt).toLocaleDateString()}
                                      </span>
                                    </div>

                                    <div className="text-xs text-slate-600 space-y-1">
                                      <div className="flex items-center justify-between">
                                        <span className="font-semibold text-slate-500">Requested By:</span>
                                        <span className="font-medium text-slate-800">{rev.requestedBy}</span>
                                      </div>
                                      <div>
                                        <span className="font-semibold text-slate-500 block mb-0.5">Decision Letter / Comments:</span>
                                        <p className="bg-slate-50 border border-slate-100 rounded-lg p-2 font-mono text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                                          {rev.decisionLetter}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Uploaded files for this revision */}
                                    <div className="pt-1">
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Revision Files ({rev.uploadedFiles?.length || 0})
                                      </span>
                                      {(!rev.uploadedFiles || rev.uploadedFiles.length === 0) ? (
                                        <p className="text-[11px] italic text-slate-400 bg-slate-50/50 p-2 rounded-lg border border-dashed border-slate-200">
                                          No revision files uploaded yet for Revision {rev.revisionNumber}.
                                        </p>
                                      ) : (
                                        <div className="divide-y divide-slate-100 border border-slate-150 rounded-lg overflow-hidden bg-slate-50/30">
                                          {rev.uploadedFiles.map((file, idx) => (
                                            <div key={idx} className="p-2 flex items-center justify-between hover:bg-slate-50">
                                              <div className="min-w-0 flex items-center gap-2">
                                                <FileText className="w-4 h-4 text-[#008751] shrink-0" />
                                                <div className="truncate">
                                                  <span className="text-xs font-semibold text-slate-800 block truncate">{file.name}</span>
                                                  <span className="text-[10px] text-slate-400 font-mono">{file.size} • {file.date}</span>
                                                </div>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => setReadingFile({ name: file.name, type: 'Author Revision', no: `Rev${rev.revisionNumber}` })}
                                                className="bg-emerald-50 hover:bg-emerald-600 hover:text-white text-[#008751] border border-emerald-100 font-bold text-[10px] px-2 py-1 rounded transition-all shrink-0 ml-2"
                                              >
                                                View
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : ojsRevisions.length === 0 ? (
                              <div className="border border-dashed border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center text-center h-full min-h-[140px] bg-slate-50/10">
                                <FileText className="w-6 h-6 text-slate-300 stroke-[1.5] mb-2" />
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Awaiting Revision</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Authors have not uploaded updated drafts yet.</p>
                              </div>
                            ) : (
                              <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 bg-slate-50/20 overflow-hidden">
                                {ojsRevisions.map((rev) => (
                                  <div key={rev.no} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] bg-emerald-50 text-emerald-850 border border-emerald-100 font-bold px-1.5 py-0.5 rounded uppercase">
                                          Revision
                                        </span>
                                        <span className="text-xs font-semibold text-slate-700 truncate">{rev.name}</span>
                                      </div>
                                      <span className="block text-[10px] text-slate-400 mt-1 font-mono">Uploaded: {rev.date}</span>
                                    </div>
                                    <button 
                                      type="button"
                                      onClick={() => setReadingFile({ name: rev.name, type: 'Author Revision', no: rev.no })}
                                      className="bg-emerald-50 hover:bg-emerald-600 hover:text-white text-[#008751] border border-emerald-100 font-bold text-xs px-2.5 py-1 rounded transition-all shrink-0 ml-2"
                                    >
                                      View & Read
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                        </div>
                      </div>
                    </div>
                  )}

                  {editorOjsTab === 'SUBMISSION' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-sm space-y-5 text-left">
                      <h3 className="font-sans font-black text-[#004d2b] text-base border-b pb-2.5">Submission Cover Letter & Details</h3>
                      <div>
                        <span className="block text-xs font-mono uppercase tracking-widest text-[#004d2b]/80 font-bold text-left">Confidential Cover Letter to Editor</span>
                        <p className="text-sm text-slate-800 bg-slate-50 border p-4.5 rounded-xl leading-relaxed mt-2 whitespace-pre-wrap font-sans font-medium">
                          {selectedPaper?.coverLetter || "No confidential cover letter was submitted with this manuscript."}
                        </p>
                      </div>
                      <div>
                        <span className="block text-xs font-mono uppercase tracking-widest text-emerald-800 font-bold text-left">Submission Filename</span>
                        <p className="text-sm font-semibold font-mono text-emerald-950 bg-emerald-50/50 border border-emerald-200 p-3.5 rounded-xl mt-2 flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          {selectedPaper?.fileName || 'manuscript_draft.docx'} ({selectedPaper?.fileSize || '1.8 MB'})
                        </p>
                      </div>
                    </div>
                  )}

                  {editorOjsTab === 'COPYEDITING' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-sm space-y-5 text-left">
                      <h3 className="font-sans font-black text-[#004d2b] text-base border-b pb-2.5">Copyediting Workspace Phase</h3>
                      <p className="text-gray-700 leading-relaxed text-sm text-left font-sans font-medium">
                        Once a paper is formally Accepted, the editorial pipeline shifts variables to the Publisher desk. Publishers can refine word usage, inject DOI links, and map articles into active issue releases.
                      </p>
                      <div className="p-4 border rounded-xl bg-emerald-50 border-emerald-250 text-emerald-950 font-mono text-xs font-black tracking-wide">
                        STATUS: {selectedPaper?.status === 'ACCEPTED' || selectedPaper?.status === 'PUBLISHED' ? 'READY IN COPYEDIT PORTAL' : 'AWAITING FINAL ACCEPTANCE DECISION'}
                      </div>
                    </div>
                  )}

                  {editorOjsTab === 'PRODUCTION' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-sm space-y-5 text-left font-sans">
                      <h3 className="font-sans font-black text-[#004d2b] text-base border-b pb-2.5">Production XML Compilation Registry</h3>
                      <p className="text-gray-750 text-sm leading-relaxed text-left font-sans font-medium">
                        The publisher generates CC BY 4.0 compliant metadata, formats JATS XML outputs, and coordinates issue placement during this production stage.
                      </p>
                      <div className="bg-emerald-900 border border-emerald-950 text-white p-4 rounded-xl font-mono text-xs font-extrabold uppercase tracking-widest text-center shadow-xs">
                        Active stage status flag: {selectedPaper?.status}
                      </div>
                    </div>
                  )}

                  {editorOjsTab === 'TITLE_ABSTRACT' && (
                    <div className="bg-white border border-gray-250 rounded-2xl p-6 shadow-xs text-sm space-y-6 text-left font-sans">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 gap-4">
                        <div>
                          <h3 className="font-sans font-black text-[#004d2b] text-base uppercase tracking-wide">
                            Title & Abstract metadata
                          </h3>
                          <p className="text-sm text-gray-505 font-medium mt-1">Manage editorial indexing variables & localized translations.</p>
                        </div>
                        {/* Quick language tabs */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          {['English', 'Spanish', 'Malay', 'Portuguese (Brazil)', 'French (Canada)'].map((lang) => {
                            const isActive = ojsLanguage === lang;
                            return (
                              <button
                                key={lang}
                                onClick={() => setOjsLanguage(lang)}
                                className={`px-2.5 py-1 rounded transition-all font-semibold cursor-pointer ${
                                  isActive ? 'bg-[#008751] text-white' : 'bg-slate-50 border hover:bg-slate-100 text-slate-650'
                                }`}
                              >
                                {lang}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Sub-bar for version and schedule */}
                      <div className="bg-[#f8f9fa] border border-[#e2e8f0] p-4 rounded-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 text-[11px]">
                        <div className="flex flex-wrap items-center gap-4 text-slate-600">
                          <div>
                            Current Submission Language: <span className="font-bold text-slate-800">{ojsLanguage}</span>
                            <button onClick={() => {
                              const newLang = prompt("Change publication language:", ojsLanguage);
                              if (newLang) setOjsLanguage(newLang);
                            }} className="text-emerald-700 font-bold hover:underline ml-2">Change</button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            Status: 
                            <span className={`inline-flex items-center gap-1 font-extrabold text-[9px] uppercase border px-2 py-0.5 rounded ${
                              ojsStatusUnscheduled ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${ojsStatusUnscheduled ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                              {ojsStatusUnscheduled ? 'Unscheduled' : 'Scheduled'}
                            </span>
                          </div>
                          <div>
                            Version: <strong className="text-slate-800 font-mono">{ojsVersion}</strong>
                          </div>
                          <div className="flex items-center gap-1">
                            All Versions:
                            <select 
                              value={ojsVersion} 
                              onChange={(e) => setOjsVersion(e.target.value)}
                              className="border border-slate-300 rounded px-1.5 py-0.5 bg-white font-mono"
                            >
                              <option value="1">Version 1</option>
                              <option value="2">Version 2 (Revision)</option>
                            </select>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setOjsStatusUnscheduled(prev => !prev);
                            alert(ojsStatusUnscheduled ? "Submission scheduling checklist satisfied. Metadata locked into current issue queue." : "Submission pulled from issue catalog schedule.");
                          }}
                          className="bg-white border border-gray-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-md transition-all font-semibold font-mono text-[10.5px] cursor-pointer shadow-sm text-center"
                        >
                          {ojsStatusUnscheduled ? 'Schedule For Publication' : 'Unschedule Publication'}
                        </button>
                      </div>

                      {/* Main input form */}
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          {/* Prefix */}
                          <div className="space-y-1 md:col-span-1 text-left">
                            <label className="text-slate-700 font-bold text-[11px] block">Prefix</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-2.5 text-gray-400">🌐</span>
                              <input
                                type="text"
                                value={ojsPrefix}
                                onChange={(e) => setOjsPrefix(e.target.value)}
                                placeholder=""
                                className="w-full border border-gray-300 rounded-lg p-2 pl-8 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-slate-800"
                              />
                            </div>
                            <span className="text-[9.5px] text-gray-400 block font-sans">Examples: A, The</span>
                          </div>

                          {/* Title */}
                          <div className="space-y-1 md:col-span-3 text-left">
                            <label className="text-slate-700 font-bold text-[11px] block">Title *</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-2.5 text-gray-400">🏷️</span>
                              <input
                                type="text"
                                value={ojsTitle}
                                onChange={(e) => setOjsTitle(e.target.value)}
                                required
                                className="w-full border border-gray-300 rounded-lg p-2 pl-8 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans font-semibold text-slate-900"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Subtitle */}
                        <div className="space-y-1 text-left">
                          <label className="text-slate-700 font-bold text-[11px] block">Subtitle</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2.5 text-gray-400">🌐</span>
                            <input
                              type="text"
                              value={ojsSubtitle}
                              onChange={(e) => setOjsSubtitle(e.target.value)}
                              className="w-full border border-gray-300 rounded-lg p-2 pl-8 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans text-slate-800"
                            />
                          </div>
                        </div>

                        {/* Abstract */}
                        <div className="space-y-1 text-left">
                          <label className="text-slate-700 font-bold text-[11px] block">Abstract *</label>
                          <div className="border border-gray-300 rounded-xl overflow-hidden shadow-2xs">
                            {/* Rich text formatting bar placeholder */}
                            <div className="bg-slate-50 border-b border-gray-200 p-2 flex items-center gap-1 text-[11px] text-gray-500 select-none">
                              {['B', 'I', 'x²', 'x₂', '🔗', '¶'].map((tool) => (
                                <button
                                  key={tool}
                                  type="button"
                                  onClick={() => alert(`Styling option '${tool}' is simulated under index metadata translation logs.`)}
                                  className="w-7 h-7 flex items-center justify-center hover:bg-slate-200 hover:text-slate-800 rounded font-bold font-mono transition-all cursor-pointer"
                                >
                                  {tool}
                                </button>
                              ))}
                              <div className="h-4 w-px bg-gray-300 mx-2"></div>
                              <span className="text-[9px] font-mono tracking-wide text-gray-400">Translation: {ojsLanguage} enabled</span>
                            </div>
                            <textarea
                              rows={8}
                              value={ojsAbstract}
                              onChange={(e) => setOjsAbstract(e.target.value)}
                              required
                              className="w-full p-4 focus:outline-none font-sans text-slate-800 text-[11.5px] leading-relaxed block overflow-y-auto"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Action save button */}
                      <div className="pt-4 border-t flex justify-end gap-2 text-xs font-mono">
                        <button
                          onClick={() => {
                            if (selectedPaper) {
                              onUpdateManuscript({
                                ...selectedPaper,
                                title: ojsPrefix ? `${ojsPrefix} ${ojsTitle}` : ojsTitle,
                                abstract: ojsAbstract,
                                language: ojsLanguage
                              });
                              alert("Editorial metadata dictionary localized, indexed, and synchronized into retrieve DB.");
                            }
                          }}
                          className="bg-[#008751] hover:bg-[#007042] text-white font-extrabold px-5 py-2.5 rounded-lg transition-all cursor-pointer shadow-sm text-center font-mono"
                        >
                          Save metadata dictionary
                        </button>
                      </div>
                    </div>
                  )}

                  {editorOjsTab === 'CONTRIBUTORS' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs text-xs space-y-4 text-left">
                      <h3 className="font-sans font-bold text-[#003d52] text-sm border-b pb-2">Authors & Organization Affiliations</h3>
                      
                      {selectedPaper?.isDoubleBlind && (
                        <div className="bg-emerald-50 border border-emerald-150 p-3 rounded-xl text-emerald-950 text-[10px] leading-relaxed text-left">
                          <strong>Dual-Blind Safeguards Enabled:</strong>
                          <p className="text-slate-500 mt-1">Co-author names, institutional credentials, and correspondence records have been stripped from referee terminals.</p>
                        </div>
                      )}

                      <div className="divide-y border rounded-xl overflow-hidden bg-slate-50 text-[11px] text-left">
                        {selectedPaper?.contributors.map(c => (
                          <div key={c.id} className="p-3 flex items-center justify-between">
                            <div>
                              <strong className="block text-slate-800">{c.name}</strong>
                              <span className="text-[10px] text-slate-400 block mt-0.5">{c.affiliation} • {c.email}</span>
                            </div>
                            <span className="font-mono text-[9px] bg-white border px-2 py-0.5 rounded font-bold uppercase text-slate-550 text-gray-500">{c.role}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {editorOjsTab === 'METADATA' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm text-xs space-y-4 text-left">
                      <h3 className="font-sans font-bold text-slate-850 text-sm border-b pb-2">Indexed Taxonomy Metadata</h3>
                      <div className="grid grid-cols-2 gap-4 text-[10px] font-mono leading-relaxed text-slate-600">
                        <div className="bg-slate-50 p-3 rounded-xl border">
                          <strong>Submission Category:</strong>
                          <span className="block text-slate-900 font-bold mt-1 uppercase text-[11px]">Research Article</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border font-mono">
                          <strong>Copyright License:</strong>
                          <span className="block text-slate-900 font-bold mt-1 uppercase text-[11px]">CC BY 4.0 Open Access</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {editorOjsTab === 'REFERENCES' && (
                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm text-xs space-y-4 text-left">
                      <h3 className="font-sans font-bold text-slate-850 text-sm border-b pb-2">Bibliography Citations</h3>
                      <div className="bg-slate-50 border p-3 rounded-xl text-[10px] space-y-2 text-slate-600 font-mono leading-relaxed text-left">
                        <p>1. Rowell, A. (2025). Clinical Neural Models: Optimizing Biopsy Image Seeding. Journal of Artificial Intelligence in Medicine.</p>
                        <p>2. Willinksy, J. (2021). Scholarly Associations and the Economic Viability of Open Access Publishing.</p>
                        <p>3. Cha, J. (2024). Multi-Tenant Namespace Separation Protocols in Modern Health Registries.</p>
                      </div>
                    </div>
                  )}

                  {editorOjsTab === 'GALLEYS' && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-sm space-y-5 text-left">
                      <div className="flex items-center justify-between border-b pb-3">
                        <div>
                          <h3 className="font-sans font-extrabold text-[#004d2e] text-base uppercase tracking-wide flex items-center gap-2">
                            <Layers className="w-5 h-5" />
                            Galley Proofs & Production Formats
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">Manage PDF, HTML, and EPUB galleys generated for publication.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadModalCategory('REVIEW');
                            setUploadFileName('Galley_Final_Layout_Proof.pdf');
                            setUploadFileType('PDF Galley Proof');
                            setUploadModalOpen(true);
                          }}
                          className="bg-[#008751] hover:bg-[#007042] text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm cursor-pointer transition-all"
                        >
                          + Add Galley Proof
                        </button>
                      </div>

                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                        <div className="p-4 flex items-center justify-between hover:bg-slate-100/60 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="bg-rose-100 text-rose-800 font-bold text-xs px-2.5 py-1 rounded-md uppercase font-mono">PDF</span>
                            <div>
                              <strong className="block text-slate-800 text-sm font-bold">{selectedPaper?.title || 'Manuscript'}_Final_Galley.pdf</strong>
                              <span className="text-xs text-slate-500 font-mono">Uploaded: {new Date().toISOString().split('T')[0]} • Size: 2.4 MB • Status: Approved</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReadingFile({ name: `${selectedPaper?.title || 'Manuscript'}_Final_Galley.pdf`, type: 'PDF Galley', no: 'G-101' })}
                            className="bg-emerald-50 hover:bg-[#008751] hover:text-white text-[#008751] border border-emerald-200 font-bold text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                          >
                            Preview Galley
                          </button>
                        </div>

                        <div className="p-4 flex items-center justify-between hover:bg-slate-100/60 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="bg-sky-100 text-sky-800 font-bold text-xs px-2.5 py-1 rounded-md uppercase font-mono">HTML</span>
                            <div>
                              <strong className="block text-slate-800 text-sm font-bold">{selectedPaper?.title || 'Manuscript'}_Web_Fulltext.html</strong>
                              <span className="text-xs text-slate-500 font-mono">Uploaded: {new Date().toISOString().split('T')[0]} • Size: 420 KB • Status: Ready</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReadingFile({ name: `${selectedPaper?.title || 'Manuscript'}_Web_Fulltext.html`, type: 'HTML Galley', no: 'G-102' })}
                            className="bg-emerald-50 hover:bg-[#008751] hover:text-white text-[#008751] border border-emerald-200 font-bold text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                          >
                            Preview Galley
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {editorOjsTab === 'JATS_XML' && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-sm space-y-5 text-left">
                      <div className="flex items-center justify-between border-b pb-3">
                        <div>
                          <h3 className="font-sans font-extrabold text-[#004d2e] text-base uppercase tracking-wide flex items-center gap-2">
                            <FileWarning className="w-5 h-5" />
                            JATS XML Metadata Compiler
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">NLM Journal Article Tag Suite v1.2 markup validation engine.</p>
                        </div>
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono font-bold text-xs px-3 py-1 rounded-full uppercase">
                          ✓ NLM JATS v1.2 Validated
                        </span>
                      </div>

                      <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800 shadow-inner max-h-80">
                        {`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archival and Interchange DTD v1.2 20190208//EN" "JATS-archivearticle1.dtd">
<article article-type="research-article" dtd-version="1.2" xml:lang="en">
  <front>
    <journal-meta>
      <journal-id journal-id-type="publisher-id">JAIMPH</journal-id>
      <journal-title-group>
        <journal-title>Journal of Artificial Intelligence in Medicine &amp; Public Health</journal-title>
      </journal-title-group>
      <issn pub-type="epub">2765-9821</issn>
    </journal-meta>
    <article-meta>
      <article-id pub-id-type="doi">10.1016/j.aimed.2026.${selectedPaper?.id || '001'}</article-id>
      <title-group>
        <article-title>${selectedPaper?.title || 'Untitled Manuscript'}</article-title>
      </title-group>
      <abstract>
        <p>${selectedPaper?.abstract || 'No abstract provided.'}</p>
      </abstract>
    </article-meta>
  </front>
</article>`}
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`JATS XML for ${selectedPaper?.id}`);
                            setDecisionSuccessMsg("✅ JATS XML copied to clipboard.");
                            setTimeout(() => setDecisionSuccessMsg(null), 4000);
                          }}
                          className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer"
                        >
                          Copy JATS XML
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDecisionSuccessMsg("✅ JATS XML file downloaded successfully.");
                            setTimeout(() => setDecisionSuccessMsg(null), 4000);
                          }}
                          className="bg-[#008751] hover:bg-[#007042] text-white font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
                        >
                          Download .xml File
                        </button>
                      </div>
                    </div>
                  )}

                  {editorOjsTab === 'PERMISSIONS' && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-sm space-y-5 text-left">
                      <div className="border-b pb-3">
                        <h3 className="font-sans font-extrabold text-[#004d2e] text-base uppercase tracking-wide flex items-center gap-2">
                          <FolderLock className="w-5 h-5" />
                          Permissions & Rights Disclosure
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Verify open access licensing and copyright permissions for publication.</p>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Copyright License Agreement</label>
                          <select className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-800 bg-white">
                            <option value="CC-BY-4">Creative Commons Attribution 4.0 International (CC BY 4.0)</option>
                            <option value="CC-BY-NC-4">Creative Commons Non-Commercial 4.0 (CC BY-NC 4.0)</option>
                            <option value="PUBLIC_DOMAIN">Public Domain / CC0 1.0 Universal</option>
                          </select>
                        </div>

                        <div className="bg-emerald-50/60 border border-emerald-200/80 p-4 rounded-xl space-y-2">
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
                            <input type="checkbox" defaultChecked className="rounded text-[#008751] focus:ring-emerald-500 w-4 h-4" />
                            <span>Institutional Review Board (IRB) Ethics Approval Signed</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
                            <input type="checkbox" defaultChecked className="rounded text-[#008751] focus:ring-emerald-500 w-4 h-4" />
                            <span>Conflict of Interest (COI) Disclosures Verified</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
                            <input type="checkbox" defaultChecked className="rounded text-[#008751] focus:ring-emerald-500 w-4 h-4" />
                            <span>Author Open Access Copyright Retention Granted</span>
                          </label>
                        </div>

                        <div className="pt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setDecisionSuccessMsg("✅ Rights and disclosures updated and saved to journal records.");
                              setTimeout(() => setDecisionSuccessMsg(null), 4000);
                            }}
                            className="bg-[#008751] hover:bg-[#007042] text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
                          >
                            Save Rights & Disclosures
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {editorOjsTab === 'ISSUE' && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-sm space-y-5 text-left">
                      <div className="border-b pb-3">
                        <h3 className="font-sans font-extrabold text-[#004d2e] text-base uppercase tracking-wide flex items-center gap-2">
                          <Archive className="w-5 h-5" />
                          Journal Issue Placement & Metadata
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Assign article to a published or upcoming journal release.</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Target Journal Release / Issue</label>
                          <select className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-800 bg-white">
                            <option value="vol14no2">Vol. 14 No. 2 (2026): Advances in Medical AI & Public Health</option>
                            <option value="vol14no3">Vol. 14 No. 3 (2026): Special Issue on Clinical NLP</option>
                            <option value="vol15no1">Vol. 15 No. 1 (2027): Future Trends in Global Health</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Journal Section</label>
                          <select className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-800 bg-white">
                            <option value="research">Original Research Articles</option>
                            <option value="review">Systematic Review & Meta-Analysis</option>
                            <option value="case">Clinical Case Study</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Page Range</label>
                          <input type="text" defaultValue="102 - 118" className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-800" />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">CrossRef Assigned DOI</label>
                          <input type="text" defaultValue={`10.1016/j.aimed.2026.${selectedPaper?.id || '001'}`} className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono font-semibold text-slate-800" />
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedPaper) {
                              onUpdateManuscript({ ...selectedPaper, issue: 'Vol. 14 No. 2 (2026)' });
                            }
                            setDecisionSuccessMsg("✅ Manuscript successfully assigned to Vol. 14 No. 2 (2026).");
                            setTimeout(() => setDecisionSuccessMsg(null), 4000);
                          }}
                          className="bg-[#008751] hover:bg-[#007042] text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
                        >
                          Save Issue Placement
                        </button>
                      </div>
                    </div>
                  )}

                  {editorOjsTab === 'GUIDELINES' && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-sm space-y-5 text-left">
                      <div className="border-b pb-3 flex items-center justify-between">
                        <div>
                          <h3 className="font-sans font-extrabold text-[#004d2e] text-base uppercase tracking-wide flex items-center gap-2">
                            📘 Editor Guidelines & Standard Operating Procedures
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">Official editorial guidelines for managing peer review and desk decisions.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditorOjsTab('REVIEW')}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                        >
                          Close Guidelines
                        </button>
                      </div>

                      <div className="space-y-4 text-xs text-slate-700 leading-relaxed font-sans">
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                          <strong className="block text-slate-900 text-sm font-bold">1. Intake Screening & Desk Evaluation</strong>
                          <p>All incoming submissions must undergo plagiarism checks and preliminary scope alignment verification before being assigned to double-blind peer reviewers.</p>
                        </div>

                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                          <strong className="block text-slate-900 text-sm font-bold">2. Peer Referee Assignment Protocols</strong>
                          <p>A minimum of 2 independent expert referees must evaluate each manuscript. Double-blind anonymization must be preserved throughout all review stages.</p>
                        </div>

                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                          <strong className="block text-slate-900 text-sm font-bold">3. Editorial Decision Desk Thresholds</strong>
                          <p>Decisions must synthesize referee consensus scores, ethical disclosures, and author revision compliance prior to final acceptance or publication scheduling.</p>
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                {/* COLUMN 3: RIGHT SIDEBAR PANEL (ACTION ITEMS AND PARTICIPANTS) - Compact Professional Sidebar */}
                <div className="xl:col-span-3 space-y-4 text-sm font-sans text-left">
                  
                  <>
                      {/* OJS Action Buttons based on Design Specification */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-sm space-y-3 font-sans">
                        <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                          <strong className="block text-slate-800 font-bold uppercase tracking-wider text-xs">
                            Decision Desk
                          </strong>
                          <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-bold uppercase">
                            ACTIVE
                          </span>
                        </div>

                        {decisionSuccessMsg && (
                          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-sans font-medium leading-normal animate-in fade-in duration-200">
                            {decisionSuccessMsg}
                          </div>
                        )}

                        <button
                          onClick={() => {
                            if (window.confirm("Request revisions for this manuscript? Author will be notified and decision logged in discussion threads.")) {
                              attemptRecordDecision('REVISE');
                            }
                          }}
                          className="w-full bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 font-bold py-2 px-3 rounded-xl text-xs block transition-all text-center cursor-pointer shadow-tiny"
                        >
                          Request Revisions
                        </button>

                        <button
                          onClick={() => attemptRecordDecision('ACCEPT')}
                          className="w-full bg-[#008751] hover:bg-[#007042] text-white font-extrabold py-2.5 px-3 rounded-xl text-xs block transition-all text-center cursor-pointer shadow-sm"
                        >
                          Accept Submission
                        </button>

                        <button
                          onClick={handleCreateNewReviewRound}
                          className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold py-2 px-3 rounded-xl text-xs block transition-all text-center cursor-pointer shadow-tiny"
                        >
                          Create New Review Round
                        </button>

                        <button
                          onClick={() => {
                            if (window.confirm("Decline submission and log rejection notice?")) {
                              attemptRecordDecision('REJECT');
                            }
                          }}
                          className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 font-semibold py-2 px-3 rounded-xl text-xs block transition-all text-center cursor-pointer"
                        >
                          Decline Submission
                        </button>

                        <div className="pt-1">
                          <label className="block text-slate-400 font-mono text-[9px] uppercase tracking-wider mb-1">
                            Override / Decision Notes:
                          </label>
                          <textarea
                            rows={2}
                            value={editorsNotesTemp}
                            onChange={(e) => setEditorsNotesTemp(e.target.value)}
                            placeholder="e.g. Please address referee comments in Section 3"
                            className="w-full border border-slate-200 rounded-xl p-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-slate-800 bg-slate-50/50"
                          />
                        </div>
                      </div>

                      {/* Dynamic Workflow Participants Card */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3.5">
                        <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                          <strong className="text-slate-800 font-bold uppercase tracking-wide text-xs">
                            Participants
                          </strong>
                          <button
                            onClick={() => setShowAssignModal(true)}
                            className="text-[10px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <UserPlus className="w-3 h-3 text-emerald-700" /> + Invite
                          </button>
                        </div>

                        <div className="space-y-2.5">
                          {/* Assigned Editor */}
                          <div className="flex items-center gap-2.5 text-left p-2 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="w-7 h-7 rounded-full bg-[#004d2b] text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                              {selectedPaper?.assignedEditor 
                                ? selectedPaper.assignedEditor.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                                : currentUser?.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'ED'}
                            </span>
                            <div className="leading-tight flex-grow min-w-0">
                              <span className="font-bold text-slate-800 text-xs block truncate">
                                {selectedPaper?.assignedEditor || currentUser?.name || 'Dr. Cynthia Dwork'}
                              </span>
                              <span className="text-[9.5px] text-emerald-700 font-bold block mt-0.5">Assigned Editor</span>
                            </div>
                          </div>

                          {/* Corresponding Author */}
                          <div className="flex items-center gap-2.5 text-left p-2 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="w-7 h-7 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center font-bold text-[11px] shrink-0">
                              {selectedPaper?.authorName ? selectedPaper.authorName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'AU'}
                            </span>
                            <div className="leading-tight flex-grow min-w-0">
                              <span className="font-bold text-slate-800 text-xs block truncate">{selectedPaper?.authorName || 'Corresponding Author'}</span>
                              <span className="text-[9.5px] text-amber-800 font-semibold block mt-0.5 truncate">Corresponding Author ({selectedPaper?.authorEmail || 'author@univ.edu'})</span>
                            </div>
                          </div>

                          {/* Co-Authors / Contributors */}
                          {selectedPaper?.contributors && selectedPaper.contributors.length > 0 && (
                            <div className="space-y-1 pt-1 border-t border-slate-100">
                              <span className="block text-[9.5px] font-mono font-bold text-slate-400 uppercase tracking-wider">Co-Authors</span>
                              {selectedPaper.contributors.map((c, i) => (
                                <div key={i} className="flex items-center gap-2 text-left p-1.5 rounded-lg bg-slate-50">
                                  <span className="w-5 h-5 rounded bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[9px] shrink-0">
                                    {c.name ? c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'CA'}
                                  </span>
                                  <div className="leading-tight min-w-0">
                                    <span className="font-bold text-slate-800 text-[11px] block truncate">{c.name}</span>
                                    <span className="text-[9px] text-slate-400 block truncate">{c.affiliation || c.email}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Active Peer Referees */}
                          <div className="pt-2 border-t border-slate-100 space-y-2">
                            <span className="block text-[9.5px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                              Delegated Peer Referees ({selectedPaper?.reviewers?.length || 0})
                            </span>

                            {(!selectedPaper?.reviewers || selectedPaper.reviewers.length === 0) ? (
                              <p className="text-[11px] text-slate-400 italic">No peer referees invited yet. Click + Invite above to send invitations.</p>
                            ) : (
                              selectedPaper.reviewers.map((rev) => {
                                const initials = rev.name ? rev.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'RV';
                                const statusColors: Record<string, string> = {
                                  INVITED: 'bg-amber-100 text-amber-900 border-amber-300',
                                  ACCEPTED: 'bg-sky-100 text-sky-900 border-sky-300',
                                  SUBMITTED: 'bg-emerald-100 text-emerald-900 border-emerald-300',
                                  COMPLETED: 'bg-emerald-100 text-emerald-900 border-emerald-300',
                                  DECLINED: 'bg-rose-100 text-rose-900 border-rose-300'
                                };
                                const badgeClass = statusColors[rev.status] || 'bg-slate-100 text-slate-700 border-slate-300';

                                return (
                                  <div key={rev.id || rev.email} className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-left">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[9px] shrink-0">
                                          {initials}
                                        </span>
                                        <div className="min-w-0 leading-tight">
                                          <span className="font-bold text-slate-800 text-[11px] block truncate">{rev.name}</span>
                                          <span className="text-[9px] text-slate-400 block truncate">{rev.email}</span>
                                        </div>
                                      </div>
                                      <span className={`px-1.5 py-0.5 text-[8.5px] font-mono font-extrabold rounded border uppercase shrink-0 ${badgeClass}`}>
                                        {rev.status === 'SUBMITTED' ? 'COMPLETED' : rev.status}
                                      </span>
                                    </div>

                                    {/* Interactive Status Selector */}
                                    <div className="flex items-center justify-between border-t border-slate-200/60 pt-1 text-[10px]">
                                      <span className="text-slate-400 font-medium text-[9px]">Status:</span>
                                      <select
                                        value={rev.status}
                                        onChange={(e) => handleSimulateStatusCycle(rev.email, e.target.value as ReviewStatus)}
                                        className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-700 outline-none hover:border-emerald-600 transition cursor-pointer"
                                      >
                                        <option value="INVITED">INVITED</option>
                                        <option value="ACCEPTED">ACCEPTED</option>
                                        <option value="SUBMITTED">COMPLETED</option>
                                        <option value="DECLINED">DECLINED</option>
                                      </select>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                </div>

              </div>

              {/* SECTION D: Wide, Full-Width Integrated Discussion Thread */}
              {selectedPaper && (
                <div className="mt-8 border-t border-slate-150 pt-8 w-full text-left">
                  <ManuscriptDiscussion
                    manuscript={selectedPaper}
                    onUpdateManuscript={onUpdateManuscript}
                    currentUser={currentUser}
                    currentRole="EDITOR"
                    title="Review Discussions & Logged Threads"
                  />
                </div>
              )}

            </div>

          </div>
          </div>
      )}

      {/* RENDER AVAILABLE REVIEWERS & CUSTOM PARTICIPANT DIALOG */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6 text-xs relative animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-sans font-bold text-base text-slate-900 flex items-center gap-1.5"><UserPlus className="w-5 h-5 text-emerald-600" /> Delegate Peer Referee / Participant</h3>
            <p className="text-xs text-gray-500 mt-1">Select an active referee or enter custom participant credentials to dispatch invitation.</p>

            {/* Preset Reviewers */}
            <div className="space-y-2 mt-4 max-h-48 overflow-y-auto pr-1">
              <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Select Preset Referee</span>
              {AVAILABLE_REVIEWERS.map((r) => (
                <div key={r.id} className="border p-2.5 rounded-2xl flex items-center justify-between hover:bg-slate-50 transition-all">
                  <div>
                    <strong className="block text-slate-800 text-xs">{r.name}</strong>
                    <span className="text-[10px] text-gray-400 block font-mono">{r.email}</span>
                    <span className="text-[9px] bg-slate-100 text-slate-800 font-bold px-1.5 rounded font-mono block mt-0.5 w-fit">{r.affiliation}</span>
                  </div>
                  <button
                    onClick={() => handleAddReviewerToPaper(r.id)}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold font-mono text-[10px] px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    Invite
                  </button>
                </div>
              ))}
            </div>

            {/* Custom Participant Form */}
            <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Or Invite Custom Participant</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Full Name (e.g. Dr. John Doe)"
                  value={customRefName}
                  onChange={(e) => setCustomRefName(e.target.value)}
                  className="border border-slate-300 rounded-xl p-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                />
                <input
                  type="email"
                  placeholder="Email Address"
                  value={customRefEmail}
                  onChange={(e) => setCustomRefEmail(e.target.value)}
                  className="border border-slate-300 rounded-xl p-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
              <button
                onClick={() => {
                  if (!customRefName || !customRefEmail) {
                    alert("Please enter both Name and Email for the custom participant.");
                    return;
                  }
                  if (!selectedPaper) return;
                  const newRef: ReviewerAssignment = {
                    id: `rev_${Date.now()}`,
                    name: customRefName,
                    email: customRefEmail,
                    status: 'INVITED',
                    recommendation: null,
                    commentsToAuthor: '',
                    commentsToEditor: '',
                    assignedAt: new Date().toISOString(),
                    invitedOn: new Date().toISOString().split('T')[0],
                    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    type: 'External'
                  };
                  const updated: Manuscript = {
                    ...selectedPaper,
                    status: 'UNDER_REVIEW',
                    reviewers: [...selectedPaper.reviewers, newRef]
                  };
                  onUpdateManuscript(updated);
                  setCustomRefName('');
                  setCustomRefEmail('');
                  setShowAssignModal(false);
                  alert(`✉️ SUCCESS: Participant ${customRefName} invited! Login authorization granted for ${customRefEmail}.`);
                }}
                className="w-full bg-slate-900 hover:bg-emerald-700 text-white font-bold text-xs py-2 rounded-xl transition cursor-pointer"
              >
                Send Custom Invitation
              </button>
            </div>

            <div className="flex justify-end pt-3 border-t mt-3">
              <button onClick={() => setShowAssignModal(false)} className="border text-gray-600 font-semibold px-4 py-1.5 rounded-xl text-xs">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* IMMERSIVE DOCUMENT READING WORKSPACE */}
      {readingFile && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] shadow-2xl border border-slate-200 max-w-5xl w-full h-[85vh] flex flex-col relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-left">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="space-y-1 text-left">
                <span className="bg-emerald-50 text-[#008751] border border-emerald-100 font-mono font-bold text-[9px] px-2.5 py-1 rounded uppercase tracking-wider">
                  {readingFile.type || "Article File"} • Document Review
                </span>
                <h3 className="font-sans font-black text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                  {readingFile.name}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setReadingFile(null)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Immersive Reading Workspace */}
            <div className="flex-grow flex overflow-hidden">
              {/* Left Outline Sidebar */}
              <div className="w-52 bg-slate-50/50 border-r border-slate-100 p-5 hidden md:block text-left overflow-y-auto shrink-0">
                <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-3">Document Outline</span>
                <nav className="space-y-2.5 font-medium text-xs text-slate-500">
                  <a href="#title" className="block text-[#008751] font-bold border-l-2 border-[#008751] pl-2">1. Title & Abstract</a>
                  <span className="block hover:text-slate-900 pl-2 cursor-pointer">2. Introduction</span>
                  <span className="block hover:text-slate-900 pl-2 cursor-pointer">3. Methodology</span>
                  <span className="block hover:text-slate-900 pl-2 cursor-pointer">4. Analysis & Results</span>
                  <span className="block hover:text-slate-900 pl-2 cursor-pointer">5. Discussion</span>
                  <span className="block hover:text-slate-900 pl-2 cursor-pointer">6. Bibliography</span>
                </nav>
                <div className="mt-8 pt-6 border-t border-slate-100 space-y-2.5">
                  <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Anonymity Seal</span>
                  <div className="text-[10px] text-slate-500 space-y-1 leading-normal font-medium">
                    <div>Blind Parity: <span className="font-bold text-slate-700">Verified</span></div>
                    <div>Anonymized: <span className="font-bold text-[#008751]">Yes (Standard)</span></div>
                    <div className="text-slate-400 break-all">ID: {readingFile.no}</div>
                  </div>
                </div>
              </div>

              {/* Serif Body Text Page Container */}
              <div className="flex-grow overflow-y-auto p-6 sm:p-10 bg-white flex flex-col items-center">
                <div className="max-w-2xl w-full text-left space-y-6 text-slate-800 leading-relaxed text-sm sm:text-base">
                  <h1 className="text-xl sm:text-2xl font-black font-sans text-slate-900 leading-tight">
                    {selectedPaper?.title || "Manuscript Title Proposal"}
                  </h1>
                  <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                    JMS Open Access Registry • ID: {selectedPaper?.id || 'OJS-6241'}
                  </div>
                  
                  <hr className="border-slate-100" />
                  
                  <h2 className="text-sm font-black font-sans text-slate-900 uppercase tracking-wider">Abstract</h2>
                  <p className="italic text-slate-600 bg-slate-50 border p-4 rounded-xl leading-relaxed text-xs sm:text-sm font-medium">
                    {selectedPaper?.abstract || "Abstract goes here..."}
                  </p>

                  <h2 className="text-sm font-black font-sans text-slate-900 uppercase tracking-wider pt-4">1. Background & Introduction</h2>
                  <p className="text-slate-700 leading-relaxed font-sans text-sm">
                    In modern medical imaging and bioinformatics, processing clinical scans with lock-free algorithms requires high reliability and minimal resource overhead. Typical decentralized architectures guarantee transactional integrity but fail to address double-blind anonymity constraints during peer evaluations. This paper introduces an optimized, multi-tenant consensus ledger framework tailored specifically for peer-reviewed healthcare publications.
                  </p>
                  <p className="text-slate-700 leading-relaxed font-sans text-sm">
                    The principal challenge in peer review platforms lies in decoupling researcher credentials from evaluation sheets. By maintaining an active, cryptographic anonymity seal during initial editorial intake phases, our proposed system completely eliminates citation leakage risk.
                  </p>

                  <h2 className="text-sm font-black font-sans text-slate-900 uppercase tracking-wider pt-4">2. Methodology & Design Patterns</h2>
                  <p className="text-slate-700 leading-relaxed font-sans text-sm">
                    We propose a formal state machine containing explicit nodes for unassigned screening, invitation cycles, and consensus metrics check. During screening, editors can trigger desk acceptances or rejections without incurring secondary review overheads. Upon invitation, assigned peer referees receive access tokens valid for exactly fifteen days.
                  </p>

                  <h2 className="text-sm font-black font-sans text-slate-900 uppercase tracking-wider pt-4">3. Preliminary Results</h2>
                  <p className="text-slate-700 leading-relaxed font-sans text-sm">
                    The experimental simulation shows that implementing a centralized intake dashboard allows editors to bypass unnecessary coordination delays. Decision latency dropped by 42% under concurrent submission workloads.
                  </p>
                  
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 font-mono text-[11px] leading-normal text-slate-600 space-y-1">
                    <span className="font-bold text-slate-800 block mb-1">Table 1. Consensus latency benchmarks</span>
                    <div>• Intake Decision (Desk): 2.4 hrs</div>
                    <div>• Standard Peer Review: 14.2 days</div>
                    <div>• Override Exceptions: 1.1 hrs</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer with reading metrics */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 bg-slate-50 font-mono shrink-0">
              <span>Status: Secure Sandbox Reading Mode</span>
              <span>JMS v3.4 Compliant Web Reader</span>
            </div>
          </div>
        </div>
      )}

      {/* RENDER EXCEPTION PAYLOAD OVERRIDE DIALOG */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left">
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-amber-200 max-w-lg w-full p-6 text-xs relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-6 h-6 text-amber-500 shrink-0" />
              <div>
                <span className="font-mono text-[10px] text-amber-600 font-bold block uppercase tracking-wider">{exceptionPayload?.error} — STATUS {exceptionPayload?.statusCode}</span>
                <strong className="font-sans text-base text-slate-900 block mt-0.5">Automated Oversight Precondition Exception Guard</strong>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl space-y-3.5 text-amber-950 font-mono leading-relaxed mt-4">
              <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-amber-600" /> CODE: {exceptionPayload?.code}</p>
              <p className="text-[11px] font-sans text-gray-650 text-gray-600">{exceptionPayload?.message}</p>
              
              <div className="grid grid-cols-2 gap-2 text-[11px] border-t border-dashed border-amber-200 pt-3 text-amber-900">
                <div>
                  Min Configured Limit: <strong className="font-semibold">{exceptionPayload?.parameters?.configuredMinimum} Reviews</strong>
                </div>
                <div>
                  Actual Logged Reviews: <strong className="font-bold">{exceptionPayload?.parameters?.actualSubmitted} Reviews</strong>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-gray-400 mt-4 leading-normal">
              WARNING: Finalizing decision bypass triggers automatic compliance alarms in our telemetry logs. Ensure executive editorial board authorization exists prior to authorization.
            </p>

            <div className="mt-6 flex justify-end gap-2 text-xs font-mono">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-3.5 py-1.5 border hover:bg-gray-150 rounded-xl text-gray-600 font-semibold cursor-pointer"
              >
                Abort Decision
              </button>
              <button
                onClick={() => {
                  if (pendingDecision) {
                    finalizeDecision(pendingDecision);
                  }
                }}
                className="px-4 py-1.5 bg-amber-500 hover:bg-slate-900 hover:text-white font-bold text-amber-950 rounded-xl transition-all cursor-pointer border border-amber-203"
              >
                Override Consensus Safeguards
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENDER REVIEWER EVALUATION & DETAILED EDITORIAL DECISION MODAL */}
      {showEvaluationModal && selectedReviewerForEvaluation && (
        (() => {
          const evalData = getReviewerEvaluation(selectedReviewerForEvaluation);
          const name = selectedReviewerForEvaluation.name;
          const isPending = selectedReviewerForEvaluation.status !== 'SUBMITTED';
          const recBadgeColors = selectedReviewerForEvaluation.recommendation === 'ACCEPT' ? 'bg-emerald-100 text-emerald-850' :
                                selectedReviewerForEvaluation.recommendation === 'MINOR_REVISION' ? 'bg-teal-50 text-[#008751] border border-teal-150' :
                                selectedReviewerForEvaluation.recommendation === 'MAJOR_REVISION' ? 'bg-amber-100 text-amber-950' :
                                selectedReviewerForEvaluation.recommendation === 'REJECT' ? 'bg-rose-100 text-rose-850' : 'bg-gray-100 text-gray-800';

          const scoringMetrics = [
            { label: 'Scientific Merit', val: evalData.scientificMerit, desc: 'Original contribution & core scientific rigor' },
            { label: 'Novelty & Innovation', val: evalData.noveltyInnovation, desc: 'Breakthrough contributions & uniqueness' },
            { label: 'Methodology Quality', val: evalData.methodologyQuality, desc: 'Experimental setup & data integrity' },
            { label: 'Literature Adequacy', val: evalData.literatureAdequacy, desc: 'Context & references completeness' },
            { label: 'Ethical Compliance', val: evalData.ethicalCompliance, desc: 'Dual-Blind alignment & ethics approval' },
            { label: 'Data Reliability', val: evalData.dataReliability, desc: 'Mathematical robustness & reproducibility' },
            { label: 'Writing Quality', val: evalData.writingQuality, desc: 'Flow, layout grammar and structural readability' },
            { label: 'Overall Rec Score', val: evalData.overallRecommendationScore, desc: 'Manuscript consolidated peer recommendation score' }
          ];

          const overallRecommendScore = evalData.overallRecommendationScore && evalData.overallRecommendationScore > 0
            ? evalData.overallRecommendationScore
            : Math.round(
                (evalData.scientificMerit + evalData.noveltyInnovation + evalData.methodologyQuality +
                evalData.literatureAdequacy + evalData.ethicalCompliance + evalData.dataReliability +
                evalData.writingQuality) / 7 * 10
              ) / 10;

          // Audit Timeline calculations
          const auditLogs = [
            { event: "Reviewer Assigned Track", date: selectedReviewerForEvaluation.assignedAt || "2026-06-04", desc: `Assigned to standard peer-review pipeline by editor.` },
            { event: "OJS Invitation Dispatched", date: selectedReviewerForEvaluation.assignedAt || "2026-06-04", desc: `Formal invitation systems email sent with dual-blind instructions.` }
          ];

          if (selectedReviewerForEvaluation.status === 'SUBMITTED') {
            auditLogs.push(
              { event: "Invitation Confirmed", date: "2026-06-04", desc: `Referee accepted peer-review invitation and downloaded manuscript files.` },
              { event: "Formal Evaluation Filed", date: selectedReviewerForEvaluation.completedAt || "2026-06-05", desc: `Review report, grading matrices and comments submitted.` },
              { event: "Recommendation Certified", date: selectedReviewerForEvaluation.completedAt || "2026-06-05", desc: `Formal recommendation locked: ${selectedReviewerForEvaluation.recommendation || 'MINOR_REVISION'}` }
            );
          } else if (selectedReviewerForEvaluation.status === 'ACCEPTED') {
            auditLogs.push(
              { event: "Invitation Confirmed", date: "2026-06-04", desc: `Referee accepted and committed standard review timeline.` },
              { event: "Manuscript Evaluation Pending", date: "2026-06-11", desc: `Referee is currently assessing the research.` }
            );
          } else if (selectedReviewerForEvaluation.status === 'DECLINED') {
            auditLogs.push(
              { event: "Invitation Declined", date: "2026-06-05", desc: `Referee declined the assignment due to competing schedule constraints.` }
            );
          } else {
            auditLogs.push(
              { event: "Invitation Confirmed", date: "2026-05-10", desc: `Referee accepted standard review timeline.` },
              { event: "SLA Deadline Overflowed", date: "2026-05-20", desc: `Review milestone triggered overdue status. Automated friendly reminder logs recorded.` }
            );
          }

          const distribution = calculateRecommendationDistribution();
          const consensusScore = calculateConsensusScore();
          const avgScore = calculateAverageScore();
          const acceptProb = calculateAcceptProbability();
          const agreementCoherence = calculateReviewerAgreement();

          const handlePresetLetterLoad = (type: any) => {
            setEvaluationModalDecision(type);
            const paperTitle = selectedPaper?.title || "Manuscript";
            const authorName = selectedPaper?.authorName || "Author";
            
            if (type === 'ACCEPT') {
              setDecisionLetterText(`Dear ${authorName},\n\nWe are pleased to inform you that your manuscript titled "${paperTitle}" has been accepted for publication in the Journal of Management Systems.\n\nYour paper has been transitioned to our XML pre-production copyedit queue. The publisher will reach out soon regarding proofs and DOI variable injection details.\n\nSincerely,\nManaging Editor`);
            } else if (type === 'MINOR_REVISIONS') {
              setDecisionLetterText(`Dear ${authorName},\n\nOur reviewers have completed their analysis of your manuscript titled "${paperTitle}".\n\nThey recommend publication subject to minor modifications. Please address each reviewer comment and submit your revised file within 14 days.\n\nSincerely,\nManaging Editor`);
            } else if (type === 'REVISE') {
              setDecisionLetterText(`Dear ${authorName},\n\nYour manuscript titled "${paperTitle}" has been evaluated by our peer referees.\n\nMajor revisions are requested before we can make a final determination. Please submit a comprehensive response grid detailing how you addressed their feedback.\n\nSincerely,\nManaging Editor`);
            } else if (type === 'REJECT') {
              setDecisionLetterText(`Dear ${authorName},\n\nThank you for submitting your work titled "${paperTitle}".\n\nAfter matching your work against our active peer review scoring indices, we regret to inform you that we cannot accept it for publication on this occasion.\n\nSincerely,\nManaging Editor`);
            } else if (type === 'ADDITIONAL_REVIEW') {
              setDecisionLetterText(`Dear Review Board,\n\nWe require an additional round of expert peer evaluation for manuscript "${paperTitle}" to resolve scoring disparities.\n\nSincerely,\nManaging Editor`);
            }
          };

          return (
            <div className="fixed inset-0 bg-[#001f11]/60 backdrop-blur-md z-50 flex items-center justify-center p-4 text-left font-sans">
              <div className="bg-white rounded-[24px] shadow-2xl border border-emerald-100 max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                
                {/* Modal Title Banner */}
                <div className="bg-[#004d2b] p-6 text-white shrink-0 relative">
                  <button 
                    onClick={() => setShowEvaluationModal(false)}
                    className="absolute top-5 right-5 text-emerald-100 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition cursor-pointer text-xs font-mono font-bold"
                  >
                    ✕ Close
                  </button>
                  <div className="flex items-center gap-2 text-emerald-300 font-mono text-[10px] uppercase font-bold tracking-widest leading-none">
                    <Award className="w-4 h-4" /> Editorial Review Evaluation Desk
                  </div>
                  <h2 className="text-xl font-black tracking-tight text-white mt-1.5 truncate pr-16 leading-tight">
                    Assessment Portfolio: {name}
                  </h2>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-emerald-100">
                    <div>Expertise: <strong className="text-white font-bold">{evalData.expertiseArea}</strong></div>
                    <div className="h-3 w-px bg-emerald-700 hidden sm:inline" />
                    <div>Status: <span className="text-white font-black uppercase text-[10px] bg-emerald-800 px-2 py-0.5 rounded-md">{selectedReviewerForEvaluation.status}</span></div>
                    {selectedReviewerForEvaluation.completedAt && (
                      <>
                        <div className="h-3 w-px bg-emerald-700 hidden sm:inline" />
                        <div>Submitted: <strong className="text-white font-medium">{selectedReviewerForEvaluation.completedAt}</strong></div>
                      </>
                    )}
                  </div>
                </div>

                {/* Sub-Tabs Selector Navigation Row */}
                <div className="bg-slate-50 border-b border-gray-200 p-2.5 flex flex-wrap gap-1 shrink-0">
                  <button
                    onClick={() => setEvaluationActiveTab('METRICS')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      evaluationActiveTab === 'METRICS' 
                        ? 'bg-[#008751] text-white shadow-xs' 
                        : 'text-slate-600 hover:bg-emerald-50 hover:text-[#008751]'
                    }`}
                  >
                    📊 Quality Metrics
                  </button>
                  <button
                    onClick={() => setEvaluationActiveTab('COMMENTS')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      evaluationActiveTab === 'COMMENTS' 
                        ? 'bg-[#008751] text-white shadow-xs' 
                        : 'text-slate-600 hover:bg-emerald-50 hover:text-[#008751]'
                    }`}
                  >
                    💬 Comments & Reports
                  </button>
                  <button
                    onClick={() => setEvaluationActiveTab('CONSENSUS_DECISION')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      evaluationActiveTab === 'CONSENSUS_DECISION' 
                        ? 'bg-[#008751] text-white shadow-xs' 
                        : 'text-slate-600 hover:bg-emerald-50 hover:text-[#008751]'
                    }`}
                  >
                    🤝 Consensus AI summary
                  </button>
                  <button
                    onClick={() => setEvaluationActiveTab('DASHBOARD')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      evaluationActiveTab === 'DASHBOARD' 
                        ? 'bg-[#008751] text-white shadow-xs' 
                        : 'text-slate-600 hover:bg-emerald-50 hover:text-[#008751]'
                    }`}
                  >
                    📈 Decision Support Desk
                  </button>
                  <button
                    onClick={() => {
                      setEvaluationActiveTab('AUDIT');
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      evaluationActiveTab === 'AUDIT' 
                        ? 'bg-[#008751] text-white shadow-xs' 
                        : 'text-slate-600 hover:bg-emerald-50 hover:text-[#008751]'
                    }`}
                  >
                    📜 Timeline Audit Log
                  </button>
                </div>

                {/* Main Content Area Scroll Container */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">

                  {/* TAB 1: METRICS */}
                  {evaluationActiveTab === 'METRICS' && (
                    <div className="space-y-6">
                      
                      {isPending && (
                        <div className="bg-amber-50 text-amber-950 p-4 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs">
                          <div>
                            <strong className="block text-sm font-semibold text-amber-900">Evaluation Pending Simulation Mode Ready</strong>
                            <p className="text-amber-800 mt-1">This reviewer has not submitted their final report. You can trigger an interactive mock peer submission simulation to populate their ratings, comments, and metrics.</p>
                          </div>
                          <button
                            onClick={() => handleSimulateReviewSubmissionInModal(selectedReviewerForEvaluation.id)}
                            className="bg-amber-500 hover:bg-[#004d2b] hover:text-white text-white font-extrabold px-4 py-2 rounded-xl text-center cursor-pointer transition shrink-0 whitespace-nowrap"
                          >
                            ⚡ Run Peer Submission Simulation
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* Progressive Metrics progress bars */}
                        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-150 shadow-xs space-y-4 text-xs font-sans text-left">
                          <h4 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-1.5 border-b pb-2">
                            <TrendingUp className="w-4 h-4 text-[#008751]" /> Core Peer Diagnostic Parameters
                          </h4>
                          
                          <div className="space-y-4">
                            {scoringMetrics.map((sm, idx) => (
                              <div key={idx} className="space-y-1">
                                <div className="flex justify-between items-center text-[11px]">
                                  <div>
                                    <strong className="text-slate-700 font-bold">{sm.label}</strong>
                                    <span className="text-[10px] text-slate-400 block font-normal">{sm.desc}</span>
                                  </div>
                                  <span className="font-mono text-emerald-800 font-bold bg-[#e6f4ea] px-2 py-0.5 rounded text-[10px]">
                                    {isPending || !sm.val ? 'N/A' : `${sm.val} / 10`}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-[#008751] h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${isPending || !sm.val ? 0 : sm.val * 10}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Recommendation badge & circular overall indicator */}
                        <div className="bg-white rounded-3xl p-6 border border-slate-150 shadow-xs flex flex-col justify-between text-center font-sans space-y-4">
                          <div>
                            <h4 className="font-bold text-slate-800 text-xs tracking-wider uppercase font-mono border-b pb-2 text-left">
                              Result Portfolio
                            </h4>
                            <div className="mt-8 flex flex-col items-center justify-center">
                              {/* circular overall score */}
                              <div className="relative w-36 h-36 flex items-center justify-center rounded-full bg-gradient-to-tr from-emerald-50 to-white border-4 border-emerald-50 shadow-inner">
                                <div className="text-center">
                                  <span className="text-[#004d2b] text-[38px] font-black tracking-tight leading-none">
                                    {isPending ? '—' : overallRecommendScore}
                                  </span>
                                  <span className="block text-slate-400 font-mono text-[9px] tracking-widest uppercase mt-0.5">Rating Score</span>
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-3 max-w-[200px]">Computed overall recommendation mean against Elsevier peer compliance indices.</p>
                            </div>
                          </div>

                          <div className="border-t pt-4 space-y-1.5 text-left">
                            <span className="text-[9px] font-mono tracking-wider font-extrabold text-slate-400 uppercase">Scientific Recommendation</span>
                            <div className="flex items-center gap-2">
                              {isPending ? (
                                <span className="bg-yellow-50 text-xs text-yellow-800 px-3 py-1.5 font-bold rounded-lg uppercase block text-center w-full border border-yellow-150">Awaiting Submission</span>
                              ) : (
                                <span className={`text-xs px-3 py-1.5 font-bold rounded-lg uppercase block text-center w-full ${recBadgeColors}`}>
                                  {selectedReviewerForEvaluation.recommendation || 'MINOR_REVISION'}
                                </span>
                              )}
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                  )}
                                   {/* TAB 2: COMMENTS */}
                  {evaluationActiveTab === 'COMMENTS' && (
                    <div className="space-y-6 text-left font-sans text-xs">
                      {isPending ? (
                        <div className="bg-slate-50 rounded-3xl p-8 border border-dashed border-slate-300 text-center space-y-4 max-w-xl mx-auto my-6">
                          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xl font-bold">💬</div>
                          <div>
                            <h4 className="font-bold text-slate-800 text-sm">Qualitative Peer Review Report Pending</h4>
                            <p className="text-slate-500 mt-1.5 leading-relaxed">This referee has accepted the invitation but has not yet submitted their final qualitative assessment and grading rubric comments. You can trigger simulated data by clicking and running the simulation above.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {/* Left Column: Structured Author Feedback */}
                          <div className="lg:col-span-2 space-y-6">
                            
                            {/* Card 1: Author-Facing comments */}
                            <div className="bg-white rounded-3xl border border-slate-150 p-6 shadow-xs space-y-4">
                              <div className="flex items-center gap-2 border-b pb-3">
                                <span className="text-lg">📖</span>
                                <div>
                                  <h4 className="font-bold text-slate-800 text-sm">Primary Qualitative Feedback for Authors</h4>
                                  <p className="text-[10px] text-slate-400 font-medium">Author-facing developmental copyedit comments & constructive directions.</p>
                                </div>
                              </div>
                              <div className="p-4 bg-emerald-50/20 border border-emerald-150/50 rounded-2xl text-slate-700 font-mono text-[11px] leading-relaxed whitespace-pre-wrap italic">
                                "{selectedReviewerForEvaluation.commentsToAuthor || "The main structural aspects of the manuscript have been described thoroughly."}"
                              </div>
                            </div>

                            {/* Card 2: Peer Diagnostic Rubrics */}
                            <div className="bg-white rounded-3xl border border-slate-150 p-6 shadow-xs space-y-4">
                              <div className="flex items-center gap-2 border-b pb-3">
                                <span className="text-lg">📋</span>
                                <div>
                                  <h4 className="font-bold text-slate-800 text-sm">Structured Peer Diagnostic Rubric Comments</h4>
                                  <p className="text-[10px] text-slate-400 font-medium">Categorized critiques aligned with COPE scientific validation metrics.</p>
                                </div>
                              </div>
                              
                              <div className="space-y-4 text-xs font-sans">
                                <div className="space-y-1 bg-slate-50/55 p-4 rounded-2xl border border-slate-150">
                                  <strong className="block text-slate-800 text-[10px] font-mono uppercase tracking-wider">💪 Core Research Strengths</strong>
                                  <p className="text-slate-650 font-medium leading-relaxed font-mono whitespace-pre-wrap">{evalData.strengths || "No strengths entries registered."}</p>
                                </div>
                                
                                <div className="space-y-1 bg-slate-50/55 p-4 rounded-2xl border border-slate-150">
                                  <strong className="block text-slate-800 text-[10px] font-mono uppercase tracking-wider">⚠️ Critical Methodological Weaknesses</strong>
                                  <p className="text-slate-650 font-medium leading-relaxed font-mono whitespace-pre-wrap">{evalData.weaknesses || "No weaknesses entries registered."}</p>
                                </div>
                                
                                <div className="space-y-1 bg-slate-50/55 p-4 rounded-2xl border border-slate-150">
                                  <strong className="block text-slate-800 text-[10px] font-mono uppercase tracking-wider">🛠️ Mandatory Re-evaluation Revision Tasks</strong>
                                  <p className="text-slate-650 font-medium leading-relaxed font-mono whitespace-pre-wrap">{evalData.mandatoryRevisions || "No revision items registered."}</p>
                                </div>
                              </div>
                            </div>

                          </div>

                          {/* Right Column: Confidential Editorial Remarks */}
                          <div className="space-y-6">
                            
                            {/* Confidential Remarks to Editor */}
                            <div className="bg-amber-50/50 border border-amber-200/80 rounded-3xl p-6 shadow-xs space-y-4">
                              <div className="flex items-center gap-2 border-b border-amber-200/50 pb-3">
                                <span className="text-lg">🔒</span>
                                <div>
                                  <h4 className="font-bold text-amber-950 text-xs font-mono uppercase tracking-wider">Confidential Editor Note</h4>
                                  <p className="text-[9px] text-amber-700 font-sans font-medium">Strictly shielded and masked from Author access endpoints.</p>
                                </div>
                              </div>
                              <div className="p-3.5 bg-white border border-amber-200/55 rounded-2xl text-amber-900 font-mono text-[11px] leading-relaxed whitespace-pre-wrap italic">
                                "{selectedReviewerForEvaluation.commentsToEditor || "No private remarks registered by this referee."}"
                              </div>
                            </div>

                            {/* Double-Blind Purge compliance block */}
                            <div className="bg-slate-100 border border-slate-200 rounded-3xl p-5 space-y-2 text-[10px] text-slate-500 leading-relaxed font-sans">
                              <div className="flex items-center gap-1.5 font-bold font-mono text-slate-700 uppercase">
                                🛡️ Double-Blind Validation Approved
                              </div>
                              <p>This qualitative report has been fully audited. All traces of author's metadata, locations, funding sources, and institutional identifiers have been scrubbed to prevent disclosure bias.</p>
                              <div className="border-t pt-2 border-slate-200 text-right text-[9px] font-mono">
                                COMPLIANT WITH COPE GUIDELINES
                              </div>
                            </div>

                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: CONSENSUS */}
                  {evaluationActiveTab === 'CONSENSUS_DECISION' && (
                    <div className="space-y-6 text-left font-sans">
                      
                      {/* AI Consensus Overview Block */}
                      <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs relative overflow-hidden">
                        
                        <div className="absolute top-0 right-0 h-40 w-40 bg-emerald-50 rounded-full blur-2xl -mr-10 -mt-10 opacity-60 pointer-events-none" />

                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-emerald-50 text-[#008751] font-bold">
                            ✨
                          </div>
                          <div>
                            <span className="text-[10px] font-mono tracking-wider text-emerald-600 font-extrabold block uppercase">SYSTEM CONSENSUS DECISION ANALYSIS</span>
                            <h3 className="text-base font-black text-slate-900 mt-0.5">Automated Referee Consensus Aggregator</h3>
                          </div>
                        </div>

                        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                          <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-50">
                            <span className="text-slate-400 block font-mono text-[9px] uppercase tracking-wider">Consensus Score</span>
                            <strong className="text-3xl font-black text-[#008751] block mt-1">{consensusScore}%</strong>
                            <span className="text-[10px] text-emerald-800 font-medium block mt-1.5">Slightly Above Compliance</span>
                          </div>
                          <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-50">
                            <span className="text-slate-400 block font-mono text-[9px] uppercase tracking-wider">Coherence Accuracy</span>
                            <strong className="text-3xl font-black text-[#008751] block mt-1">{agreementCoherence}%</strong>
                            <span className="text-[10px] text-emerald-800 font-medium block mt-1.5">Cohesive Referees Alignment</span>
                          </div>
                          <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-50 md:col-span-2">
                            <span className="text-slate-400 block font-mono text-[9px] uppercase tracking-wider">Automated Support Suggestion</span>
                            <strong className="text-base font-extrabold text-[#004d2b] block mt-2 text-wrap leading-tight">{calculateConsensusRecommendation()}</strong>
                            <span className="text-[10px] text-emerald-800 block mt-1">Calculated following standard scientific merit formulas.</span>
                          </div>
                        </div>

                        <div className="mt-6 border-t pt-5">
                          <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 font-mono flex items-center gap-1">
                            🤖 AI-Synthesized Referee Narrative Summary
                          </h4>
                          <div className="bg-slate-50 rounded-2xl border p-4 text-xs font-mono text-slate-600 mt-3 leading-relaxed">
                            <strong>[Summary Prompt Generation Complete - Compliance Checked]:</strong>
                            <p className="mt-2 text-slate-700 font-sans text-xs">
                              The submitted work titled <strong className="text-slate-900">"{selectedPaper?.title}"</strong> has been checked for structural validity. Referees express uniform appreciation for the core algorithmic validation framework. Major strengths highlighted point to highly mathematical proofs representing sub-millisecond locks and resilient federal compilation. Key weaknesses centers around Section 4's hyperparameter declarations. Minor modifications and epoch-level parameter alignments are highly suggested. Total alignment indexes represent {agreementCoherence}% cohesion, reducing subsequent oversight risk. Override procedures remain locked for security threshold compliance.
                            </p>
                          </div>
                        </div>

                      </div>

                    </div>
                  )}

                  {/* TAB 4: DASHBOARD */}
                  {evaluationActiveTab === 'DASHBOARD' && (
                    <div className="space-y-6 text-left font-sans text-xs">
                      
                      {/* Glassmorphism Gauges container */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        
                        <div className="bg-gradient-to-tr from-white to-emerald-50/20 rounded-3xl border border-emerald-100 p-5 shadow-xs relative overflow-hidden">
                          <div className="flex justify-between items-center text-slate-400 font-mono text-[9px] uppercase tracking-wider">
                            <span>Acceptance Index</span>
                            <Percent className="w-3.5 h-3.5 text-[#008751]" />
                          </div>
                          <strong className="text-3xl font-black text-[#004d2b] block mt-2 tracking-tight">{acceptProb}%</strong>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                            <div className="bg-[#008751] h-1.5 rounded-full" style={{ width: `${acceptProb}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-450 text-slate-400 block mt-2 leading-tight">Acceptance likelihood projection.</span>
                        </div>

                        <div className="bg-gradient-to-tr from-white to-emerald-50/20 rounded-3xl border border-emerald-100 p-5 shadow-xs relative overflow-hidden">
                          <div className="flex justify-between items-center text-slate-400 font-mono text-[9px] uppercase tracking-wider">
                            <span>Mean Referee Score</span>
                            <Award className="w-3.5 h-3.5 text-[#008751]" />
                          </div>
                          <strong className="text-3xl font-black text-[#004d2b] block mt-2 tracking-tight">{avgScore} <span className="text-sm text-slate-450 text-slate-400">/ 10</span></strong>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                            <div className="bg-[#008751] h-1.5 rounded-full" style={{ width: `${avgScore * 10}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-450 text-slate-400 block mt-2 leading-tight">Average of active criteria grades.</span>
                        </div>

                        <div className="bg-gradient-to-tr from-white to-[#008751]/5 rounded-3xl border border-emerald-100 p-5 shadow-xs relative overflow-hidden col-span-1 sm:col-span-2">
                          <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider block">Decision Safeguard Status</span>
                          <div className="flex items-center gap-3 mt-2.5">
                            <span className="h-4 w-4 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                            <div>
                              <strong className="font-bold text-slate-800 text-xs block leading-tight">Safe Decision Room Locked</strong>
                              <p className="text-[10px] text-slate-400 mt-0.5">Dual-Review minimum submission requirement verified. Standard peer evaluation criteria successfully satisfied.</p>
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* Distribution chart bar */}
                      <div className="bg-white rounded-3xl border border-slate-150 p-6 space-y-4">
                        <h4 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-1 pb-1.5 border-b">
                          <span>📊</span> Recommendation Distribution Chart
                        </h4>
                        
                        <div className="space-y-3 pt-2">
                          <div>
                            <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                              <span>Direct Accept</span>
                              <strong className="font-bold">{distribution.accept} Recs</strong>
                            </div>
                            <div className="bg-slate-100 h-3.5 rounded-md overflow-hidden">
                              <div className="bg-[#137333] h-full rounded-md" style={{ width: `${(distribution.accept / distribution.total) * 100}%` }} />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                              <span>Minor Revision</span>
                              <strong className="font-bold">{distribution.minor} Recs</strong>
                            </div>
                            <div className="bg-slate-100 h-3.5 rounded-md overflow-hidden">
                              <div className="bg-[#137333]/70 h-full rounded-md" style={{ width: `${(distribution.minor / distribution.total) * 100}%` }} />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                              <span>Major Revision</span>
                              <strong className="font-bold">{distribution.major} Recs</strong>
                            </div>
                            <div className="bg-slate-100 h-3.5 rounded-md overflow-hidden">
                              <div className="bg-amber-500 h-full rounded-md" style={{ width: `${(distribution.major / distribution.total) * 100}%` }} />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                              <span>Decline / Reject</span>
                              <strong className="font-bold">{distribution.reject} Recs</strong>
                            </div>
                            <div className="bg-slate-100 h-3.5 rounded-md overflow-hidden">
                              <div className="bg-rose-500 h-full rounded-md" style={{ width: `${(distribution.reject / distribution.total) * 100}%` }} />
                            </div>
                          </div>
                        </div>

                      </div>

                    </div>
                  )}

                  {/* TAB 5: AUDIT */}
                  {evaluationActiveTab === 'AUDIT' && (
                    <div className="bg-white rounded-3xl border border-slate-150 p-6 text-left font-sans text-xs">
                      <h4 className="font-bold text-slate-800 text-sm tracking-tight border-b pb-2 mb-6 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-[#008751]" /> Referee Lifecycle Audit Trail
                      </h4>
                      
                      <div className="relative border-l border-slate-200 ml-4 pl-6 space-y-6">
                        {auditLogs.map((log, lidx) => (
                          <div key={lidx} className="relative">
                            <span className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-emerald-500 bg-white" />
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <strong className="font-bold text-slate-850 text-xs">{log.event}</strong>
                                <span className="font-mono text-[9px] text-[#008751] bg-[#e6f4ea] px-1.5 py-0.5 rounded leading-none">{log.date}</span>
                              </div>
                              <p className="text-slate-500 text-[11px]">{log.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* EDITORIAL DECISION SECTION FOOTER FOR FINALIZING */}
                <div className="bg-white border-t border-gray-200 p-5 shrink-0 text-left font-sans text-xs space-y-4">
                  <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/50">
                    <strong className="font-extrabold text-xs uppercase tracking-wider text-slate-700 font-mono block mb-3">
                      ✍️ Record Final Editorial Decision
                    </strong>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      <button
                        onClick={() => handlePresetLetterLoad('ACCEPT')}
                        className={`p-2.5 rounded-xl border font-bold text-xs cursor-pointer text-center transition ${
                          evaluationModalDecision === 'ACCEPT' 
                            ? 'bg-emerald-700 text-white border-emerald-700' 
                            : 'bg-white hover:bg-emerald-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        Accept Manuscript
                      </button>
                      <button
                        onClick={() => handlePresetLetterLoad('MINOR_REVISIONS')}
                        className={`p-2.5 rounded-xl border font-bold text-xs cursor-pointer text-center transition ${
                          evaluationModalDecision === 'MINOR_REVISIONS' 
                            ? 'bg-teal-700 text-white border-teal-700' 
                            : 'bg-white hover:bg-emerald-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        Minor Revisions
                      </button>
                      <button
                        onClick={() => handlePresetLetterLoad('REVISE')}
                        className={`p-2.5 rounded-xl border font-bold text-xs cursor-pointer text-center transition ${
                          evaluationModalDecision === 'REVISE' 
                            ? 'bg-amber-600 text-white border-amber-600' 
                            : 'bg-white hover:bg-emerald-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        Major Revisions
                      </button>
                      <button
                        onClick={() => handlePresetLetterLoad('REJECT')}
                        className={`p-2.5 rounded-xl border font-bold text-xs cursor-pointer text-center transition ${
                          evaluationModalDecision === 'REJECT' 
                            ? 'bg-rose-700 text-white border-rose-700' 
                            : 'bg-white hover:bg-rose-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        Reject & Archive
                      </button>
                      <button
                        onClick={() => handlePresetLetterLoad('ADDITIONAL_REVIEW')}
                        className={`p-2.5 rounded-xl border font-bold text-xs cursor-pointer text-center transition ${
                          evaluationModalDecision === 'ADDITIONAL_REVIEW' 
                            ? 'bg-slate-700 text-white border-slate-700' 
                            : 'bg-white hover:bg-emerald-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        Additional Review
                      </button>
                    </div>

                    {evaluationModalDecision && (
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-150">
                        <div className="space-y-1.5">
                          <label className="font-mono text-[9px] uppercase tracking-wider font-extrabold text-slate-450 block text-slate-400">Justify Editorial Discretion (Confidential)</label>
                          <textarea
                            value={decisionJustification}
                            onChange={(e) => setDecisionJustification(e.target.value)}
                            placeholder="Write your decision logic here..."
                            rows={4}
                            className="w-full bg-white border border-gray-300 rounded-xl p-3 text-xs font-mono focus:ring-1 focus:ring-[#008751] outline-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="font-mono text-[9px] uppercase tracking-wider font-extrabold text-slate-450 block text-slate-400">Decision Letter (Editable Email Notification)</label>
                          <textarea
                            value={decisionLetterText}
                            onChange={(e) => setDecisionLetterText(e.target.value)}
                            rows={4}
                            className="w-full bg-white border border-gray-300 rounded-xl p-3 text-xs font-mono focus:ring-1 focus:ring-[#008751] outline-none"
                          />
                        </div>

                        <div className="md:col-span-2 flex justify-end gap-2.5 border-t border-dashed border-emerald-150/50 pt-3">
                          <button
                            onClick={() => {
                              setSelectedReviewerForEvaluation(null);
                              setEvaluationModalDecision(null);
                            }}
                            className="text-slate-500 font-bold px-4 py-2 hover:bg-slate-100 rounded-xl cursor-pointer"
                          >
                            Cancel Selection
                          </button>
                          <button
                            onClick={() => handleFinalEditorialDecisionInModal(evaluationModalDecision)}
                            className="bg-[#008751] hover:bg-[#004d2b] text-white font-extrabold px-6 py-2 rounded-xl text-center cursor-pointer shadow-sm transition"
                          >
                            Dispatched Decision & Terminate Workflow ✔
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          );
        })()
      )}

      {/* FILE UPLOAD MODAL DIALOG */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 space-y-5 text-left font-sans">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-[#008751]" />
                  Upload {uploadModalCategory === 'REVISION' ? 'Author Revision' : 'Review File'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Specify file title and descriptor category for journal records.</p>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">File Display Name</label>
                <input
                  type="text"
                  value={uploadFileName}
                  onChange={(e) => setUploadFileName(e.target.value)}
                  placeholder="e.g. Revised_Manuscript_Clean.docx"
                  className="w-full border border-slate-300 rounded-xl p-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#008751]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">File Component Type</label>
                <select
                  value={uploadFileType}
                  onChange={(e) => setUploadFileType(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-800 bg-white"
                >
                  <option value="Article Text">Article Text / Main Manuscript</option>
                  <option value="Revision Text">Author Revision Text</option>
                  <option value="Data Set">Data Set / Supplementary Spreadsheet</option>
                  <option value="Figure / Image">Figure / High-Res Image</option>
                  <option value="PDF Galley Proof">PDF Galley Proof</option>
                  <option value="Other">Other Supplementary Material</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t pt-4">
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFileUpload}
                disabled={!uploadFileName.trim()}
                className="px-5 py-2.5 text-xs font-bold bg-[#008751] hover:bg-[#007042] text-white rounded-xl shadow-sm cursor-pointer transition-all disabled:opacity-50"
              >
                Confirm File Upload
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  </div>
  );
}
