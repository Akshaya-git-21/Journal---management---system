import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  Circle,
  FileText,
  Upload,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  UserPlus,
  ArrowRight,
  AlertCircle,
  FileDown,
  Info,
  Check,
  Calendar,
  Layers,
  ArrowDown,
  ArrowUp,
  User,
  CheckSquare,
  ShieldAlert,
  Award,
  Globe,
  HelpCircle,
  FileCheck,
  Download
} from 'lucide-react';
import { Contributor, Manuscript } from '../types';
import { supabase } from '../lib/supabase';

interface NewSubmissionFlowProps {
  currentUser: { name: string; email: string; role: any } | null;
  onCancel: () => void;
  onSubmit: (paperDetails: any) => void;
}

// Full list of steps representing OJS 3 editorial setup
const STEPS = [
  { number: 1, label: 'Preparation', desc: 'Requirements & checklist' },
  { number: 2, label: 'Manuscript Upload', desc: 'PDF galley file' },
  { number: 3, label: 'Metadata Entry', desc: 'Title & Abstract' },
  { number: 4, label: 'List of Authors', desc: 'Co-authors directory' },
  { number: 5, label: 'Additional Files', desc: 'Supps & Cover Letter' },
  { number: 6, label: 'Reviewers', desc: 'Suggestions panel' },
  { number: 7, label: 'Publication Details', desc: 'Open access options' },
  { number: 8, label: 'Confirmation', desc: 'Review & submit' },
  { number: 9, label: 'Completion', desc: 'MSS ID issued' }
];

export default function NewSubmissionFlow({ currentUser, onCancel, onSubmit }: NewSubmissionFlowProps) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  // Step 1: Preparation State
  const [checklist1, setChecklist1] = useState(false);
  const [checklist2, setChecklist2] = useState(false);
  const [checklist3, setChecklist3] = useState(false);
  const [checklist4, setChecklist4] = useState(false);
  const [checklist5, setChecklist5] = useState(false);
  const [subLanguage, setSubLanguage] = useState('English');
  const [subSection, setSubSection] = useState('Articles');
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeContact, setAgreeContact] = useState(false);
  const [agreeInstructions, setAgreeInstructions] = useState(false);

  // Step 2: Manuscript State
  const [selectedFileType, setSelectedFileType] = useState('Article Text');
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  // Step 2: Individual upload states for the 3 mandatory files
  const [isUploadingTitlePage, setIsUploadingTitlePage] = useState(false);
  const [isUploadingBlindManuscript, setIsUploadingBlindManuscript] = useState(false);
  const [isUploadingAuthorForm, setIsUploadingAuthorForm] = useState(false);
  const [uploadProgressTitlePage, setUploadProgressTitlePage] = useState(0);
  const [uploadProgressBlindManuscript, setUploadProgressBlindManuscript] = useState(0);
  const [uploadProgressAuthorForm, setUploadProgressAuthorForm] = useState(0);
  const [dragActiveTitle, setDragActiveTitle] = useState(false);
  const [dragActiveBlind, setDragActiveBlind] = useState(false);
  const [dragActiveAuthor, setDragActiveAuthor] = useState(false);

  // Step 3: Metadata Entry State
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [keywords, setKeywords] = useState('');
  const [supportingAgencies, setSupportingAgencies] = useState('');

  // Step 4: Contributors State
  const [contributors, setContributors] = useState<any[]>([]);
  const [contributorFormOpen, setContributorFormOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [contribFirst, setContribFirst] = useState('');
  const [contribLast, setContribLast] = useState('');
  const [contribEmail, setContribEmail] = useState('');
  const [contribAffiliation, setContribAffiliation] = useState('');
  const [contribCountry, setContribCountry] = useState('United States');
  const [contribRole, setContribRole] = useState('Author');
  const [contribPrincipal, setContribPrincipal] = useState(false);

  // Step 5: Additional Files State
  const [coverLetter, setCoverLetter] = useState('');
  const [additionalFiles, setAdditionalFiles] = useState<any[]>([]);
  const [isUploadingAddFile, setIsUploadingAddFile] = useState(false);
  const [addFileProgress, setAddFileProgress] = useState(0);

  // New Step 5.3+ detailed form elements
  const [coverLetterFile, setCoverLetterFile] = useState<{ name: string; size: string } | null>(null);
  const [isUploadingCoverLetter, setIsUploadingCoverLetter] = useState(false);

  // Funding Information
  const [isFunded, setIsFunded] = useState<'Yes' | 'No'>('No');
  const [funderName, setFunderName] = useState('');
  const [grantNumber, setGrantNumber] = useState('');
  const [fundingDesc, setFundingDesc] = useState('');
  const [additionalFunders, setAdditionalFunders] = useState<{ id: string; name: string; grant: string; desc: string }[]>([]);

  // Previously Submitted Manuscript
  const [previouslySubmitted, setPreviouslySubmitted] = useState<'Yes' | 'No'>('No');
  const [prevJournalName, setPrevJournalName] = useState('');
  const [prevManuscriptId, setPrevManuscriptId] = useState('');
  const [prevSubmissionDate, setPrevSubmissionDate] = useState('');
  const [prevDecisionStatus, setPrevDecisionStatus] = useState('');
  const [prevComments, setPrevComments] = useState('');

  // Clinical Trial Registration
  const [isClinicalTrial, setIsClinicalTrial] = useState<'Yes' | 'No'>('No');
  const [trialRegNumber, setTrialRegNumber] = useState('');
  const [registryName, setRegistryName] = useState('');
  const [trialRegDate, setTrialRegDate] = useState('');

  // Patient Consent for Publication
  const [patientConsent, setPatientConsent] = useState<'Yes' | 'No' | 'Not Applicable'>('Not Applicable');

  // Ethical Approval – Human Studies
  const [ethicalApprovalHuman, setEthicalApprovalHuman] = useState<'Yes' | 'No' | 'Not Applicable'>('Not Applicable');
  const [ethicsCommitteeHuman, setEthicsCommitteeHuman] = useState('');
  const [ethicsApprovalNoHuman, setEthicsApprovalNoHuman] = useState('');
  const [ethicsApprovalDateHuman, setEthicsApprovalDateHuman] = useState('');

  // Ethical Approval – Animal Studies
  const [ethicalApprovalAnimal, setEthicalApprovalAnimal] = useState<'Yes' | 'No' | 'Not Applicable'>('Not Applicable');
  const [ethicsCommitteeAnimal, setEthicsCommitteeAnimal] = useState('');
  const [ethicsApprovalNoAnimal, setEthicsApprovalNoAnimal] = useState('');
  const [ethicsApprovalDateAnimal, setEthicsApprovalDateAnimal] = useState('');

  // Permission to Use Images
  const [imagesPermissionRequired, setImagesPermissionRequired] = useState<'Yes' | 'No'>('No');
  const [permissionDesc, setPermissionDesc] = useState('');
  const [permissionDocs, setPermissionDocs] = useState<{ id: string; name: string; size: string }[]>([]);
  const [isUploadingPermissionDoc, setIsUploadingPermissionDoc] = useState(false);

  // Third-Party Text / Publication Usage
  const [copyrightedContent, setCopyrightedContent] = useState<'Yes' | 'No'>('No');
  const [copyrightSourceInfo, setCopyrightSourceInfo] = useState('');
  const [copyrightDocs, setCopyrightDocs] = useState<{ id: string; name: string; size: string }[]>([]);
  const [isUploadingCopyrightDoc, setIsUploadingCopyrightDoc] = useState(false);

  // Social Media Promotion
  const [socialMediaPromotion, setSocialMediaPromotion] = useState<'Yes' | 'No'>('No');
  const [promoPlatforms, setPromoPlatforms] = useState<string[]>([]);

  // Color Figures
  const [colorFigures, setColorFigures] = useState<'Yes' | 'No'>('No');
  const [colorFiguresCount, setColorFiguresCount] = useState('');
  const [colorFiguresDetails, setColorFiguresDetails] = useState('');

  // Creative Commons License Selection (configured in Step 5 & syncs to Step 7)
  const [pubLicense, setPubLicense] = useState('CC BY');

  // Step 6: Reviewer Suggestions State
  const [reviewerSuggestions, setReviewerSuggestions] = useState<any[]>([]);
  const [revName, setRevName] = useState('');
  const [revEmail, setRevEmail] = useState('');
  const [revAffiliation, setRevAffiliation] = useState('');
  const [revReason, setRevReason] = useState('');

  // Step 7: Publishing preferences State
  const [acceptLicense, setAcceptLicense] = useState(true);
  const [licenseType, setLicenseType] = useState('CC BY 4.0');
  const [isOpenAccess, setIsOpenAccess] = useState(true);
  const [feeWaiverRequest, setFeeWaiverRequest] = useState('');

  // Step 9: Completion State Info
  const [generatedId, setGeneratedId] = useState('');
  const [estimatedDecisionDate, setEstimatedDecisionDate] = useState('');

  // Trigger form validation warnings
  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize author details when mounted
  useEffect(() => {
    const authorName = currentUser?.name || "Dr. Ada Lovelace";
    const nameParts = authorName.split(' ');
    const first = nameParts[0] || '';
    const last = nameParts.slice(1).join(' ') || '';
    
    // Default Principal Contributor
    setContributors([
      {
        id: 'c-default',
        firstName: first,
        lastName: last,
        email: currentUser?.email || 'ada@computing.org',
        affiliation: 'OJS Partner Institution',
        country: 'United States',
        role: 'Primary Author',
        isPrincipalContact: true
      }
    ]);

    // Calculate dynamic decision date (4 weeks from now)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 28);
    const options: any = { year: 'numeric', month: 'long', day: 'numeric' };
    setEstimatedDecisionDate(futureDate.toLocaleDateString('en-US', options));
  }, [currentUser]);

  // Load incomplete draft if exists in LocalStorage to demonstrate real-time auto-saving
  useEffect(() => {
    const cachedDraft = localStorage.getItem('ojs_submission_cached_draft');
    if (cachedDraft) {
      try {
        const parsed = JSON.parse(cachedDraft);
        if (parsed.currentStep) {
          // Preset cache details optionally, but let's let author start with clean state unless they want to reload.
          console.log("Cached submission draft identified.");
        }
      } catch (err) {
        console.error(err);
      }
    }
  }, []);

  // Save draft dynamically on every step transition or state update
  const saveStateDraft = (targetStepNumber: number) => {
    const draftData = {
      currentStep: targetStepNumber,
      checklist1, checklist2, checklist3, checklist4, checklist5,
      subLanguage, subSection, agreePrivacy, agreeContact, agreeInstructions,
      title, subtitle, abstract, keywords, supportingAgencies,
      contributors, coverLetter, reviewerSuggestions,
      acceptLicense, licenseType, isOpenAccess, feeWaiverRequest,
      uploadedFiles, additionalFiles
    };
    localStorage.setItem('ojs_submission_cached_draft', JSON.stringify(draftData));
  };

  // Step navigation helper with strict visual validation guards
  const handleNext = () => {
    setValidationError(null);

    if (currentStep === 1) {
      if (!checklist1 || !checklist2 || !checklist3 || !checklist4 || !checklist5) {
        setValidationError('You must acknowledge and accept all 5 Submission Checklist items before proceeding.');
        return;
      }
      if (!agreePrivacy) {
        setValidationError('You must review and agree to the Privacy Statement terms.');
        return;
      }
      if (!agreeInstructions) {
        setValidationError('You must read and agree to the Author Instructions and Submission Guidelines.');
        return;
      }
    }

    if (currentStep === 2) {
      const hasTitlePage = uploadedFiles.some(f => f.componentType === 'Title Page');
      const hasBlindManuscript = uploadedFiles.some(f => f.componentType === 'Blind Manuscript');
      const hasAuthorForm = uploadedFiles.some(f => f.componentType === 'Author Form');
      
      if (!hasTitlePage || !hasBlindManuscript || !hasAuthorForm) {
        setValidationError('All three submission files are mandatory before proceeding.');
        return;
      }
    }

    if (currentStep === 3) {
      if (!title.trim()) {
        setValidationError('The manuscript title is required.');
        return;
      }
      if (!abstract.trim()) {
        setValidationError('The abstract summary is required.');
        return;
      }
      const wordCount = abstract.trim().split(/\s+/).length;
      if (wordCount < 10) {
        setValidationError(`Your abstract is too short (${wordCount} words). Please provide a response of at least 10 words.`);
        return;
      }
    }

    if (currentStep === 4) {
      if (contributors.length === 0) {
        setValidationError('Please specify at least one Author for this submission.');
        return;
      }
      const hasPrimary = contributors.some(c => c.isPrincipalContact || c.role === 'Primary Author' || c.role === 'Author');
      if (!hasPrimary) {
        setValidationError('At least one author must be flagged as the principal contact.');
        return;
      }
    }

    // Capture completion database transition at Step 8
    if (currentStep === 8) {
      triggerSubmitFinal();
      return;
    }

    const nextStep = currentStep + 1;
    setCompletedSteps(prev => [...Array.from(new Set([...prev, currentStep]))]);
    setCurrentStep(nextStep);
    saveStateDraft(nextStep);
  };

  const handleBack = () => {
    setValidationError(null);
    if (currentStep > 1) {
      const backStep = currentStep - 1;
      setCurrentStep(backStep);
      saveStateDraft(backStep);
    }
  };

  // Skip or go to specific step directly if previous steps are completed (interactive stepper)
  const jumpToStep = (stepNo: number) => {
    if (stepNo >= 9) return; // Cannot jump directly to completion page without full validation
    
    // Check if step is allowed (either is first, or previously completed, or current)
    const isAllowed = stepNo === 1 || completedSteps.includes(stepNo - 1) || stepNo < currentStep;
    if (isAllowed) {
      setValidationError(null);
      setCurrentStep(stepNo);
      saveStateDraft(stepNo);
    }
  };

  // Mock Upload simulation
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isSuppFile: boolean = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    simulateUploadProcess(files[0], isSuppFile);
  };

  const handleDownloadTemplate = () => {
    const dummyContent = `JOURNAL OF AI IN MEDICINE\nAUTHOR DECLARATION FORM TEMPLATE\n\nPlease complete the following and sign:\n1. Manuscript Title:\n2. All Author Names & Signatures:\n3. Ethical Compliance Statement:\n4. Conflict of Interest Disclosure:\n\nAccepted Formats for submission: PDF, DOC, DOCX`;
    const blob = new Blob([dummyContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'author_declaration_form_template.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const performRealUpload = async (
    file: File,
    componentType: string,
    setProgress: (progress: number) => void,
    setIsUploadingState: (isUploading: boolean) => void,
    onSuccess?: (fileObj: any) => void
  ) => {
    console.log("Selected file:", file);
    console.log("Upload started for:", file.name);
    setIsUploadingState(true);
    setProgress(15);

    try {
      // 1. Get authenticated user
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        throw new Error(authError?.message || "User session not found. Please log in again.");
      }
      const user = authData.user;
      setProgress(40);

      // 2. Perform upload using required path: ${user.id}/${Date.now()}-${file.name}
      const fileKey = `${user.id}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from("manuscript-files")
        .upload(fileKey, file);

      if (error) {
        console.error("Upload error:", error);
        throw error;
      }

      console.log("Upload success:", data);
      console.log("Storage path:", data.path);
      setProgress(85);

      // 3. Get Public URL
      const { data: urlData } = supabase.storage
        .from("manuscript-files")
        .getPublicUrl(data.path);

      const publicUrl = urlData.publicUrl;
      console.log("Public URL:", publicUrl);
      setProgress(100);

      const newFileObj = {
        id: 'file-' + componentType.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
        fileName: file.name,
        fileSize: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        uploadedAt: new Date().toLocaleDateString(),
        componentType: componentType,
        storagePath: data.path,
        publicUrl: publicUrl
      };

      if (onSuccess) {
        onSuccess(newFileObj);
      } else {
        setUploadedFiles(prev => [...prev.filter(f => f.componentType !== componentType), newFileObj]);
      }
      setValidationError(null);
    } catch (err: any) {
      console.error("Upload error:", err);
      // Show the real Supabase error. Do not continue saving.
      setValidationError(`Upload failed: ${err.message || err.toString()}`);
    } finally {
      setIsUploadingState(false);
    }
  };

  const simulateTitlePageUpload = (file: File) => {
    performRealUpload(file, 'Title Page', setUploadProgressTitlePage, setIsUploadingTitlePage);
  };

  const simulateBlindManuscriptUpload = (file: File) => {
    performRealUpload(file, 'Blind Manuscript', setUploadProgressBlindManuscript, setIsUploadingBlindManuscript);
  };

  const simulateAuthorFormUpload = (file: File) => {
    performRealUpload(file, 'Author Form', setUploadProgressAuthorForm, setIsUploadingAuthorForm);
  };

  const simulateCoverLetterUpload = (file: File) => {
    performRealUpload(file, 'Cover Letter', (p) => {}, setIsUploadingCoverLetter, (newFile) => {
      setCoverLetterFile({ name: file.name, size: (file.size / 1024).toFixed(1) + ' KB' });
    });
  };

  const simulatePermissionUpload = (file: File) => {
    performRealUpload(file, 'Permission Document', (p) => {}, setIsUploadingPermissionDoc, (newFile) => {
      setPermissionDocs(prev => [...prev, { id: newFile.id, name: file.name, size: (file.size / 1024).toFixed(1) + ' KB' }]);
    });
  };

  const simulateCopyrightUpload = (file: File) => {
    performRealUpload(file, 'Copyright Document', (p) => {}, setIsUploadingCopyrightDoc, (newFile) => {
      setCopyrightDocs(prev => [...prev, { id: newFile.id, name: file.name, size: (file.size / 1024).toFixed(1) + ' KB' }]);
    });
  };

  const simulateUploadProcess = (file: File, isSuppFile: boolean) => {
    const compType = isSuppFile ? 'Supplementary Material' : selectedFileType;
    const progressSetter = isSuppFile ? setAddFileProgress : setUploadProgress;
    const uploadSetter = isSuppFile ? setIsUploadingAddFile : setIsUploading;

    performRealUpload(file, compType, progressSetter, uploadSetter, (newFile) => {
      if (isSuppFile) {
        setAdditionalFiles(prev => [...prev, newFile]);
      } else {
        setUploadedFiles(prev => [...prev, newFile]);
      }
    });
  };

  const deleteUploadedFile = (id: string, isSuppFile: boolean = false) => {
    if (isSuppFile) {
      setAdditionalFiles(prev => prev.filter(f => f.id !== id));
    } else {
      setUploadedFiles(prev => prev.filter(f => f.id !== id));
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent, isSuppFile: boolean = false) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      simulateUploadProcess(e.dataTransfer.files[0], isSuppFile);
    }
  };

  // Contributor actions
  const handleOpenAddContributor = () => {
    setEditingIndex(null);
    setContribFirst('');
    setContribLast('');
    setContribEmail('');
    setContribAffiliation('');
    setContribCountry('United States');
    setContribRole('Author');
    setContribPrincipal(false);
    setContributorFormOpen(true);
  };

  const handleOpenEditContributor = (index: number) => {
    const c = contributors[index];
    setEditingIndex(index);
    setContribFirst(c.firstName);
    setContribLast(c.lastName);
    setContribEmail(c.email);
    setContribAffiliation(c.affiliation);
    setContribCountry(c.country || 'United States');
    setContribRole(c.role);
    setContribPrincipal(c.isPrincipalContact || false);
    setContributorFormOpen(true);
  };

  const handleSaveContributor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contribFirst.trim() || !contribLast.trim() || !contribEmail.trim() || !contribAffiliation.trim()) {
      alert('Please fill out all required fields marked with *');
      return;
    }

    // If principal is check, turn it off on all others since there can only be 1 principal contact!
    let updated = [...contributors];
    if (contribPrincipal) {
      updated = updated.map(c => ({ ...c, isPrincipalContact: false }));
    }

    const payload = {
      id: editingIndex !== null ? contributors[editingIndex].id : 'c-' + Date.now(),
      firstName: contribFirst.trim(),
      lastName: contribLast.trim(),
      email: contribEmail.trim(),
      affiliation: contribAffiliation.trim(),
      country: contribCountry,
      role: contribRole,
      isPrincipalContact: contribPrincipal
    };

    if (editingIndex !== null) {
      updated[editingIndex] = payload;
    } else {
      updated.push(payload);
    }

    setContributors(updated);
    setContributorFormOpen(false);
  };

  const handleDeleteContributor = (index: number) => {
    if (contributors.length <= 1) {
      alert("At least one contributor is required.");
      return;
    }
    setContributors(prev => prev.filter((_, i) => i !== index));
  };

  const moveContributor = (index: number, direction: 'up' | 'down') => {
    const nextIdx = direction === 'up' ? index - 1 : index + 1;
    if (nextIdx < 0 || nextIdx >= contributors.length) return;
    const updated = [...contributors];
    const temp = updated[index];
    updated[index] = updated[nextIdx];
    updated[nextIdx] = temp;
    setContributors(updated);
  };

  // Reviewer Suggestion handlers
  const handleAddReviewer = () => {
    if (!revName.trim() || !revEmail.trim() || !revAffiliation.trim() || !revReason.trim()) {
      alert('Please fill out all reviewer fields: Name, Email, Affiliation, and Reason.');
      return;
    }
    const newRev = {
      id: 'rev-' + Date.now(),
      name: revName.trim(),
      email: revEmail.trim(),
      affiliation: revAffiliation.trim(),
      reason: revReason.trim()
    };
    setReviewerSuggestions(prev => [...prev, newRev]);
    setRevName('');
    setRevEmail('');
    setRevAffiliation('');
    setRevReason('');
  };

  const handleRemoveReviewer = (id: string) => {
    setReviewerSuggestions(prev => prev.filter(r => r.id !== id));
  };

  // Final submit dispatcher
  const triggerSubmitFinal = () => {
    const nextIdVal = String(Math.floor(Math.random() * (9999 - 1000 + 1) + 1000));
    setGeneratedId(nextIdVal);

    // Find the Blind Manuscript file details (or whichever was uploaded)
    const blindManuscriptFile = uploadedFiles.find(f => f.componentType === 'Blind Manuscript');

    // Save final state
    const paperObj = {
      id: nextIdVal,
      author: contributors[0]?.lastName || (currentUser?.name ? currentUser.name.split(' ').slice(-1)[0] : "Lovelace"),
      title: title.trim(),
      stage: "Submission",
      language: subLanguage,
      section: subSection,
      abstract: abstract.trim(),
      receivedAt: new Date().toISOString().split('T')[0],
      contributors: contributors,
      additionalFiles: additionalFiles,
      uploadedFileNames: uploadedFiles.map(f => f.fileName),
      coverLetter: coverLetter,
      reviewerSuggestions: reviewerSuggestions,
      license: licenseType,
      isOpenAccess: isOpenAccess,
      // Pass the specific metadata for the manuscripts table
      storagePath: blindManuscriptFile?.storagePath || null,
      publicUrl: blindManuscriptFile?.publicUrl || null,
      fileName: blindManuscriptFile?.fileName || null,
      fileSize: blindManuscriptFile?.fileSize || null
    };

    // Callback back to AuthorWorkspace state synchronizer
    onSubmit(paperObj);
    localStorage.removeItem('ojs_submission_cached_draft');

    // Move to completion screen
    setCurrentStep(9);
  };

  return (
    <div id="new-submission-module-layout" className="w-full flex flex-col md:flex-row gap-8 text-left font-sans text-slate-800">
      
      {/* ======================= SIDEBAR ACCORDION WORKFLOW STEPPER ======================= */}
      <aside id="new-submission-sidebar-stepper" className="w-full md:w-72 bg-gradient-to-b from-slate-50 to-white border border-[#cfdde5] rounded-xl p-5 shadow-xs shrink-0 self-start">
        
        <div className="mb-4">
          <span className="text-[10px] font-mono font-bold tracking-widest text-[#005c7a] uppercase block">
            Submission Steps
          </span>
          <h3 className="text-base font-bold text-slate-900 mt-1">
            Publishing Process
          </h3>
          <p className="text-[11px] text-gray-500 mt-1">
            Progress autosaves dynamically. You can click on previous completed steps to review inputs.
          </p>
        </div>

        {/* Dynamic Multi-Step Stepper List */}
        <div className="space-y-1 mt-4">
          {STEPS.map((step) => {
            const isCurrent = step.number === currentStep;
            const isCompleted = completedSteps.includes(step.number) || step.number < currentStep;
            const isPending = !isCurrent && !isCompleted;
            const isClickable = (isCompleted || step.number === 1) && step.number < 9 && currentStep < 9;

            return (
              <button
                key={step.number}
                id={`stepper-node-${step.number}`}
                onClick={() => isClickable && jumpToStep(step.number)}
                disabled={!isClickable}
                className={`w-full flex items-start gap-3.5 p-3 rounded-lg text-left transition duration-150 relative ${
                  isCurrent
                    ? 'bg-emerald-50 border border-emerald-200/60 text-slate-900 shadow-sm font-semibold'
                    : isCompleted
                    ? 'hover:bg-slate-50 text-slate-700 cursor-pointer'
                    : 'text-slate-400 cursor-not-allowed opacity-75'
                }`}
              >
                {/* Visual Step Marker State */}
                <div className="mt-0.5 shrink-0">
                  {isCurrent ? (
                    <div className="h-5 w-5 rounded-full bg-[#008751] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                      {step.number}
                    </div>
                  ) : isCompleted ? (
                    <div className="h-5 w-5 rounded-full bg-emerald-100 text-[#008751] flex items-center justify-center border border-emerald-300">
                      <Check className="w-3.5 h-3.5 stroke-[3px]" />
                    </div>
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-200 text-xs font-mono font-bold">
                      {step.number}
                    </div>
                  )}
                </div>

                <div className="leading-tight">
                  <span className={`block text-xs font-bold ${isCurrent ? 'text-[#008751] font-black' : 'text-slate-800'}`}>
                    {step.label}
                  </span>
                  <span className={`block text-[10px] ${isCurrent ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                    {step.desc}
                  </span>
                </div>

                {/* Left Active border bar indicator */}
                {isCurrent && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <ChevronRight className="w-4 h-4 text-[#008751]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Informational Help Box */}
        <div className="mt-6 bg-emerald-50/45 border border-dashed border-emerald-200/60 rounded-xl p-4 text-[11px] leading-relaxed text-slate-550">
          <h4 className="font-bold text-[#008751] flex items-center gap-1.5 mb-1.5 text-xs">
            <Info className="w-3.5 h-3.5 text-[#008751]" />
            Double-Blind Standard
          </h4>
          <p className="text-slate-600 leading-normal font-medium">
            For peer review validation, do NOT put your names, affiliations, or identifier blocks directly anywhere inside the uploaded manuscript file body text.
          </p>
        </div>

      </aside>

      {/* ======================= MAIN WORKING PANE CARD ======================= */}
      <main id="new-submission-panel-card" className="flex-grow bg-white border border-[#e2e8f0] rounded-xl shadow-xs overflow-hidden flex flex-col min-h-[580px]">
        
        {/* Header Indicator Header Banner */}
        <div className="bg-gradient-to-r from-[#004d2b] to-[#008751] text-white px-6 py-6.5 flex items-center justify-between border-b border-emerald-800/20 relative overflow-hidden">
          
          {/* Subtle grid backdrop decoration */}
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none" />

          <div className="relative z-10">
            <span className="text-[10px] font-mono tracking-widest text-[#a7f3d0] uppercase font-black block">
              Step {currentStep} of 9
            </span>
            <h2 className="text-2xl font-black text-white tracking-tight mt-1 font-sans">
              {STEPS[currentStep - 1]?.label}
            </h2>
          </div>

          <button 
            type="button" 
            onClick={() => alert("Index checklist validations configured. Your changes are autosaved.")}
            className="relative z-10 text-xs font-bold bg-white/10 hover:bg-white/20 active:bg-white/30 text-white px-4 py-2 rounded-lg border border-white/20 transition flex items-center gap-2 cursor-pointer"
          >
            <FileText className="w-4 h-4 text-[#a7f3d0]" />
            <span>Requirements & checklist</span>
          </button>
        </div>

        {/* Validation Alert Callout */}
        {validationError && (
          <div id="submission-validation-error" className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in duration-100">
            <AlertCircle className="w-4.5 h-4.5 text-red-655 text-red-600 shrink-0 mt-0.5" />
            <div className="grow">
              <strong className="block font-bold">Incomplete step requirement check:</strong>
              <span>{validationError}</span>
            </div>
          </div>
        )}

        {/* DYNAMIC SCROLL CONTAINER FOR FORM STEP CHUNKS */}
        <div className="p-6 sm:p-8 flex-grow overflow-y-auto max-h-[660px]">

          {/* ----------------- STEP 1 CONTENT: SUBMISSION PREPARATION ----------------- */}
          {currentStep === 1 && (
            <div id="step-1-preparation" className="space-y-6 text-sm text-slate-800 leading-relaxed max-w-4xl mx-auto">
              
              <div className="bg-emerald-50/30 border border-emerald-100 rounded-2xl p-6 leading-relaxed text-slate-650 space-y-4 relative overflow-hidden">
                <div className="absolute right-4 top-4 text-emerald-600/10 pointer-events-none">
                  <FileCheck className="w-18 h-18 stroke-[1.5]" />
                </div>
                <h3 className="font-extrabold text-base text-[#002b3d] flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-[#008751]">
                    <FileCheck className="w-4.5 h-4.5" />
                  </div>
                  Welcome to the Article Submission Wizard
                </h3>
                <p className="text-slate-600 font-normal leading-relaxed text-sm">
                  Thank you for submitting your work to <strong className="text-[#008751]">Tulatics</strong>. In the next few pages, you will provide the manuscript files, define co-authors metadata, insert abstracts, and record suggestion contacts.
                </p>
                <p className="text-slate-600 font-normal leading-relaxed text-sm">
                  Please review files thoroughly prior to completing confirmation. You may save the draft or resume updates dynamically.
                </p>
              </div>

              {/* Sub-section 1: Settings Check */}
              <div className="space-y-4">
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-[#008751] font-sans border-b border-emerald-100 pb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#008751]" />
                  STEP 1.1: STANDARD LANGUAGE & SCOPE SECTION
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-800 uppercase tracking-wide">
                      Submission Language *
                    </label>
                    <select
                      id="subLanguage"
                      value={subLanguage}
                      onChange={(e) => setSubLanguage(e.target.value)}
                      className="w-full bg-[#f8fbfe] border border-gray-300 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-[#008751] focus:border-[#008751] focus:bg-white focus:outline-none transition-all placeholder:text-gray-400 font-semibold"
                    >
                      <option value="English">English (United States)</option>
                      <option value="Spanish">Spanish (Castilian)</option>
                      <option value="Malay">Malay (Bahasa Melayu)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-800 uppercase tracking-wide">
                      Primary Section Category *
                    </label>
                    <select
                      id="subSection"
                      value={subSection}
                      onChange={(e) => setSubSection(e.target.value)}
                      className="w-full bg-[#f8fbfe] border border-gray-300 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-[#008751] focus:border-[#008751] focus:bg-white focus:outline-none transition-all placeholder:text-gray-400 font-semibold"
                    >
                      <option value="Articles">Articles (Standard double-blind manuscript)</option>
                      <option value="Editorial">Editorial (Invited editor comment columns)</option>
                      <option value="Reviews">Reviews (Evaluations of literature)</option>
                      <option value="Interview">Interview (Professional dialogue sheets)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Checkbox table */}
              <div className="space-y-4 pt-2">
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-[#008751] font-sans border-b border-emerald-100 pb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#008751]" />
                  STEP 1.2: MANDATORY SUBMISSION CHECKLISTS *
                </h4>
                <p className="text-sm text-slate-500 font-medium">
                  Please acknowledge that this current manuscript conforms to all 5 foundational parameters below before proceeding to manuscript upload:
                </p>

                <div className="space-y-3 pt-1">
                  
                  {/* Checklist 1 */}
                  <div className={`border rounded-2xl p-4.5 flex items-start justify-between hover:border-emerald-300 hover:bg-emerald-50/5 transition duration-150 group min-h-[72px] ${checklist1 ? 'border-emerald-300 bg-emerald-50/5' : 'border-slate-200 bg-white'}`}>
                    <label className="flex items-start gap-4 cursor-pointer select-none grow">
                      <input
                        id="checklist1"
                        type="checkbox"
                        checked={checklist1}
                        onChange={(e) => setChecklist1(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-[#008751] focus:ring-[#008751] mt-0.5 shrink-0 accent-[#008751] cursor-pointer"
                      />
                      <span className="text-slate-700 leading-relaxed font-semibold text-sm pr-4">
                        The submission has not been previously published, nor is it before another journal for consideration (or an explanation has been provided in Comments to the Editor).
                      </span>
                    </label>
                    <div className="p-2.5 rounded-xl bg-emerald-50 text-[#008751] group-hover:bg-emerald-100 transition shrink-0 self-center">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Checklist 2 */}
                  <div className={`border rounded-2xl p-4.5 flex items-start justify-between hover:border-emerald-300 hover:bg-emerald-50/5 transition duration-150 group min-h-[72px] ${checklist2 ? 'border-emerald-300 bg-emerald-50/5' : 'border-slate-200 bg-white'}`}>
                    <label className="flex items-start gap-4 cursor-pointer select-none grow">
                      <input
                        id="checklist2"
                        type="checkbox"
                        checked={checklist2}
                        onChange={(e) => setChecklist2(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-[#008751] focus:ring-[#008751] mt-0.5 shrink-0 accent-[#008751] cursor-pointer"
                      />
                      <span className="text-slate-700 leading-relaxed font-semibold text-sm pr-4">
                        The submission file is in Microsoft Word, RTF, or PDF galley file format.
                      </span>
                    </label>
                    <div className="p-2.5 rounded-xl bg-emerald-50 text-[#008751] group-hover:bg-emerald-100 transition shrink-0 self-center">
                      <FileText className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Checklist 3 */}
                  <div className={`border rounded-2xl p-4.5 flex items-start justify-between hover:border-emerald-300 hover:bg-emerald-50/5 transition duration-150 group min-h-[72px] ${checklist3 ? 'border-emerald-300 bg-emerald-50/5' : 'border-slate-200 bg-white'}`}>
                    <label className="flex items-start gap-4 cursor-pointer select-none grow">
                      <input
                        id="checklist3"
                        type="checkbox"
                        checked={checklist3}
                        onChange={(e) => setChecklist3(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-[#008751] focus:ring-[#008751] mt-0.5 shrink-0 accent-[#008751] cursor-pointer"
                      />
                      <span className="text-slate-700 leading-relaxed font-semibold text-sm pr-4">
                        Where available, URLs for the references have been provided. All citations are authentic and verifiable.
                      </span>
                    </label>
                    <div className="p-2.5 rounded-xl bg-emerald-50 text-[#008751] group-hover:bg-emerald-100 transition shrink-0 self-center">
                      <Globe className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Checklist 4 */}
                  <div className={`border rounded-2xl p-4.5 flex items-start justify-between hover:border-emerald-300 hover:bg-emerald-50/5 transition duration-150 group min-h-[72px] ${checklist4 ? 'border-emerald-300 bg-emerald-50/5' : 'border-slate-200 bg-white'}`}>
                    <label className="flex items-start gap-4 cursor-pointer select-none grow">
                      <input
                        id="checklist4"
                        type="checkbox"
                        checked={checklist4}
                        onChange={(e) => setChecklist4(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-[#008751] focus:ring-[#008751] mt-0.5 shrink-0 accent-[#008751] cursor-pointer"
                      />
                      <span className="text-slate-700 leading-relaxed font-semibold text-sm pr-4">
                        The text is single-spaced; uses 12-point font; employs italics rather than underlining (except with URL addresses); and all illustrations are placed in appropriate contexts.
                      </span>
                    </label>
                    <div className="p-2.5 rounded-xl bg-emerald-50 text-[#008751] group-hover:bg-emerald-100 transition shrink-0 self-center">
                      <Award className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Checklist 5 */}
                  <div className={`border rounded-2xl p-4.5 flex items-start justify-between hover:border-emerald-300 hover:bg-emerald-50/5 transition duration-150 group min-h-[72px] ${checklist5 ? 'border-emerald-300 bg-emerald-50/5' : 'border-slate-200 bg-white'}`}>
                    <label className="flex items-start gap-4 cursor-pointer select-none grow">
                      <input
                        id="checklist5"
                        type="checkbox"
                        checked={checklist5}
                        onChange={(e) => setChecklist5(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-[#008751] focus:ring-[#008751] mt-0.5 shrink-0 accent-[#008751] cursor-pointer"
                      />
                      <span className="text-slate-700 leading-relaxed font-semibold text-sm pr-4">
                        The text meets stylistic and bibliographic guidelines. Reviewers can examine non-indexed manuscript components.
                      </span>
                    </label>
                    <div className="p-2.5 rounded-xl bg-emerald-50 text-[#008751] group-hover:bg-emerald-100 transition shrink-0 self-center">
                      <HelpCircle className="w-5 h-5" />
                    </div>
                  </div>

                </div>
              </div>

              {/* Sub-section 3: Author Instructions & Submission Guidelines */}
              <div className="space-y-4 pt-2">
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-[#008751] font-sans border-b border-emerald-100 pb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#008751]" />
                  STEP 1.3: AUTHOR INSTRUCTIONS & SUBMISSION GUIDELINES
                </h4>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-650 space-y-3 leading-relaxed scrollbar-thin">
                    <p className="font-bold text-[#002b3d] text-sm mb-1">
                      Please read the following guidelines carefully before preparing your submission:
                    </p>
                    <ul className="list-disc pl-5 space-y-2 text-slate-600 font-medium">
                      <li><strong>Originality:</strong> Manuscripts must be original and not under review elsewhere.</li>
                      <li><strong>Formatting:</strong> Authors must follow journal formatting guidelines.</li>
                      <li><strong>Author Details:</strong> All author details should be included only in the Title Page document.</li>
                      <li><strong>Double-Blind Anonymization:</strong> The manuscript file must be blinded and should not contain author information.</li>
                      <li><strong>Disclosures & Approvals:</strong> Ethics approval and conflict of interest declarations must be included where applicable.</li>
                      <li><strong>Citations:</strong> References should follow the journal citation format.</li>
                      <li><strong>Copyright:</strong> Authors are responsible for obtaining permissions for copyrighted material.</li>
                      <li><strong>AI Disclosures:</strong> AI-generated content usage must be disclosed appropriately.</li>
                      <li><strong>Complete Documentation:</strong> All required files must be uploaded before proceeding to the next step.</li>
                    </ul>
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer font-bold text-slate-800 text-sm select-none">
                    <input
                      id="agreeInstructions"
                      type="checkbox"
                      checked={agreeInstructions}
                      onChange={(e) => setAgreeInstructions(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-[#008751] focus:ring-[#008751] mt-0.5 accent-[#008751] cursor-pointer shrink-0"
                    />
                    <span className="text-slate-700 font-bold">I have read and agree to the Author Instructions and Submission Guidelines. *</span>
                  </label>
                </div>
              </div>

              {/* Sub-section 4: Privacy Statement */}
              <div className="space-y-4 pt-2">
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-[#008751] font-sans border-b border-emerald-100 pb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#008751]" />
                  STEP 1.4: PRIVACY STATEMENT & PRINCIPAL CONTACT AGREEMENT *
                </h4>
                <div className="bg-emerald-50/10 border border-emerald-100 p-6 rounded-2xl space-y-4">
                  <p className="text-slate-600 leading-relaxed text-sm font-medium">
                    The names and email addresses entered in this journal site will be used exclusively for the stated purposes of this journal and will not be made available for any other purpose or to any other party.
                  </p>
                  
                  <div className="space-y-3.5 border-t pt-4 border-emerald-100 flex flex-col">
                    <label className="flex items-center gap-3 cursor-pointer font-bold text-slate-850 text-sm">
                      <input
                        id="agreePrivacy"
                        type="checkbox"
                        checked={agreePrivacy}
                        onChange={(e) => setAgreePrivacy(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-[#008751] focus:ring-[#008751] accent-[#008751]"
                      />
                      <span>Yes, I agree to the conditions outlined in the journal privacy statement.</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer font-bold text-slate-850 text-sm">
                      <input
                        id="agreeContact"
                        type="checkbox"
                        checked={agreeContact}
                        onChange={(e) => setAgreeContact(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-[#008751] focus:ring-[#008751] accent-[#008751]"
                      />
                      <span>I wish to represent myself as the Primary Contact for this submission block.</span>
                    </label>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ----------------- STEP 2 CONTENT: MANUSCRIPT UPLOAD ----------------- */}
          {currentStep === 2 && (
            <div id="step-2-upload" className="space-y-6 text-sm text-slate-800 font-sans max-w-4xl mx-auto">
              
              <div className="bg-[#f0fcf6] border border-emerald-100 rounded-2xl p-5 leading-relaxed text-slate-700 flex items-start gap-4 animate-in fade-in duration-150">
                <Info className="w-5.5 h-5.5 text-[#008751] shrink-0 mt-0.5" />
                <div className="space-y-1 text-left">
                  <h4 className="font-extrabold text-[#002b3d] text-sm uppercase">Mandatory Submission Files</h4>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed">
                    This journal enforces a strict double-blind review process. Authors are required to upload three separate, mandatory documents to proceed. Please ensure your files adhere to the formatting criteria listed below.
                  </p>
                </div>
              </div>

              {/* A. Title Page Upload */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5.5 space-y-4 shadow-xs text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="space-y-0.5 text-left">
                    <h4 className="font-extrabold text-sm text-[#002b3d] flex items-center gap-1.5 uppercase">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#008751]/10 text-[#008751] text-xs font-bold">A</span>
                      Title Page Upload *
                    </h4>
                    <p className="text-xs text-slate-550 font-medium">
                      Must contain: Article Title, Running Title, Author Names, Affiliations, Corresponding Author Details, Acknowledgements, Funding Information, Conflict of Interest Declaration.
                    </p>
                  </div>
                  <span className="text-slate-400 font-mono text-[10px] uppercase font-bold bg-slate-100 px-2 py-0.5 rounded-md self-start sm:self-center">DOC, DOCX, PDF</span>
                </div>

                {/* File Upload Slot A */}
                {uploadedFiles.some(f => f.componentType === 'Title Page') ? (
                  <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-[#008751]" />
                      <div className="text-left">
                        <p className="font-bold text-[#002b3d] text-sm">{uploadedFiles.find(f => f.componentType === 'Title Page')?.fileName}</p>
                        <p className="text-xs text-slate-500 font-mono">{uploadedFiles.find(f => f.componentType === 'Title Page')?.fileSize} • Uploaded on {uploadedFiles.find(f => f.componentType === 'Title Page')?.uploadedAt}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const fileId = uploadedFiles.find(f => f.componentType === 'Title Page')?.id;
                        if (fileId) deleteUploadedFile(fileId, false);
                      }}
                      className="text-red-500 hover:text-red-700 p-2 rounded-xl hover:bg-red-50 transition cursor-pointer"
                      title="Remove file"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragActiveTitle(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setDragActiveTitle(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActiveTitle(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        simulateTitlePageUpload(e.dataTransfer.files[0]);
                      }
                    }}
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition duration-150 relative ${
                      dragActiveTitle
                        ? 'border-[#008751] bg-[#008751]/5'
                        : 'border-[#cbd8df] bg-[#fafbfd] hover:border-[#008751] hover:bg-[#fafbfd]/20'
                    }`}
                  >
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          simulateTitlePageUpload(e.target.files[0]);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Upload className="w-8 h-8 text-slate-400 stroke-[1.5]" />
                      <p className="text-slate-700 font-bold text-xs">
                        Drag & drop Title Page here, or <span className="text-[#008751] underline hover:text-[#005c7a]">browse files</span>
                      </p>
                    </div>
                  </div>
                )}

                {isUploadingTitlePage && (
                  <div className="bg-sky-50/50 border border-[#008751]/20 p-4 rounded-xl space-y-2 text-left">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#008751] animate-ping"></span>
                        Uploading Title Page document to server...
                      </span>
                      <span>{uploadProgressTitlePage}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-[#008751] h-2 transition-all duration-300" style={{ width: `${uploadProgressTitlePage}%` }}></div>
                    </div>
                  </div>
                )}
              </div>

              {/* B. Blind Manuscript Upload */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5.5 space-y-4 shadow-xs text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="space-y-0.5 text-left">
                    <h4 className="font-extrabold text-sm text-[#002b3d] flex items-center gap-1.5 uppercase">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#008751]/10 text-[#008751] text-xs font-bold">B</span>
                      Blind Manuscript Upload *
                    </h4>
                    <p className="text-xs text-slate-550 font-medium">
                      Must contain: Abstract, Keywords, Main Manuscript, References, Tables. <strong className="text-red-650">Important: No author names, affiliations, acknowledgements, or identifying info.</strong>
                    </p>
                  </div>
                  <span className="text-slate-400 font-mono text-[10px] uppercase font-bold bg-slate-100 px-2 py-0.5 rounded-md self-start sm:self-center">DOC, DOCX, PDF</span>
                </div>

                {/* File Upload Slot B */}
                {uploadedFiles.some(f => f.componentType === 'Blind Manuscript') ? (
                  <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-[#008751]" />
                      <div className="text-left">
                        <p className="font-bold text-[#002b3d] text-sm">{uploadedFiles.find(f => f.componentType === 'Blind Manuscript')?.fileName}</p>
                        <p className="text-xs text-slate-500 font-mono">{uploadedFiles.find(f => f.componentType === 'Blind Manuscript')?.fileSize} • Uploaded on {uploadedFiles.find(f => f.componentType === 'Blind Manuscript')?.uploadedAt}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const fileId = uploadedFiles.find(f => f.componentType === 'Blind Manuscript')?.id;
                        if (fileId) deleteUploadedFile(fileId, false);
                      }}
                      className="text-red-500 hover:text-red-700 p-2 rounded-xl hover:bg-red-50 transition cursor-pointer"
                      title="Remove file"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragActiveBlind(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setDragActiveBlind(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActiveBlind(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        simulateBlindManuscriptUpload(e.dataTransfer.files[0]);
                      }
                    }}
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition duration-150 relative ${
                      dragActiveBlind
                        ? 'border-[#008751] bg-[#008751]/5'
                        : 'border-[#cbd8df] bg-[#fafbfd] hover:border-[#008751] hover:bg-[#fafbfd]/20'
                    }`}
                  >
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          simulateBlindManuscriptUpload(e.target.files[0]);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Upload className="w-8 h-8 text-slate-400 stroke-[1.5]" />
                      <p className="text-slate-700 font-bold text-xs">
                        Drag & drop Blind Manuscript here, or <span className="text-[#008751] underline hover:text-[#005c7a]">browse files</span>
                      </p>
                    </div>
                  </div>
                )}

                {isUploadingBlindManuscript && (
                  <div className="bg-sky-50/50 border border-[#008751]/20 p-4 rounded-xl space-y-2 text-left">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#008751] animate-ping"></span>
                        Uploading Blind Manuscript document to server...
                      </span>
                      <span>{uploadProgressBlindManuscript}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-[#008751] h-2 transition-all duration-300" style={{ width: `${uploadProgressBlindManuscript}%` }}></div>
                    </div>
                  </div>
                )}
              </div>

              {/* C. Author Form Upload */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5.5 space-y-4 shadow-xs text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="space-y-0.5 text-left">
                    <h4 className="font-extrabold text-sm text-[#002b3d] flex items-center gap-1.5 uppercase">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#008751]/10 text-[#008751] text-xs font-bold">C</span>
                      Author Form Upload (Template Based) *
                    </h4>
                    <p className="text-xs text-slate-550 font-medium">
                      Please download our template, complete the required information, obtain signatures, and upload the signed form here.
                    </p>
                  </div>
                  <span className="text-slate-400 font-mono text-[10px] uppercase font-bold bg-slate-100 px-2 py-0.5 rounded-md self-start sm:self-center">PDF, DOC, DOCX</span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-left">
                  <div className="grow text-left">
                    <p className="font-bold text-slate-800 text-sm">Author Declaration Form Template</p>
                    <p className="text-xs text-slate-500">Download, complete and sign this declaration document before uploading.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="bg-[#008751] hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 self-start sm:self-center"
                  >
                    <Download className="w-4 h-4" />
                    Download Form
                  </button>
                </div>

                {/* File Upload Slot C */}
                {uploadedFiles.some(f => f.componentType === 'Author Form') ? (
                  <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-[#008751]" />
                      <div className="text-left">
                        <p className="font-bold text-[#002b3d] text-sm">{uploadedFiles.find(f => f.componentType === 'Author Form')?.fileName}</p>
                        <p className="text-xs text-slate-500 font-mono">{uploadedFiles.find(f => f.componentType === 'Author Form')?.fileSize} • Uploaded on {uploadedFiles.find(f => f.componentType === 'Author Form')?.uploadedAt}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const fileId = uploadedFiles.find(f => f.componentType === 'Author Form')?.id;
                        if (fileId) deleteUploadedFile(fileId, false);
                      }}
                      className="text-red-500 hover:text-red-700 p-2 rounded-xl hover:bg-red-50 transition cursor-pointer"
                      title="Remove file"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragActiveAuthor(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setDragActiveAuthor(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActiveAuthor(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        simulateAuthorFormUpload(e.dataTransfer.files[0]);
                      }
                    }}
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition duration-150 relative ${
                      dragActiveAuthor
                        ? 'border-[#008751] bg-[#008751]/5'
                        : 'border-[#cbd8df] bg-[#fafbfd] hover:border-[#008751] hover:bg-[#fafbfd]/20'
                    }`}
                  >
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          simulateAuthorFormUpload(e.target.files[0]);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Upload className="w-8 h-8 text-slate-400 stroke-[1.5]" />
                      <p className="text-slate-700 font-bold text-xs">
                        Drag & drop Signed Form here, or <span className="text-[#008751] underline hover:text-[#005c7a]">browse files</span>
                      </p>
                    </div>
                  </div>
                )}

                {isUploadingAuthorForm && (
                  <div className="bg-sky-50/50 border border-[#008751]/20 p-4 rounded-xl space-y-2 text-left">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#008751] animate-ping"></span>
                        Uploading Author Form document to server...
                      </span>
                      <span>{uploadProgressAuthorForm}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-[#008751] h-2 transition-all duration-300" style={{ width: `${uploadProgressAuthorForm}%` }}></div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ----------------- STEP 3 CONTENT: METADATA ENTRY ----------------- */}
          {currentStep === 3 && (
            <div id="step-3-metadata" className="space-y-6 text-sm text-slate-800 font-sans max-w-4xl mx-auto">
              
              <div className="space-y-4">
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-[#008751] font-sans border-b border-emerald-100 pb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#008751]" />
                  STEP 3.1: ACADEMIC TITLE BLOCK
                </h4>

                <div className="space-y-2">
                  <label className="block text-sm font-bold uppercase tracking-wide text-slate-850">
                    Primary Title *
                  </label>
                  <p className="text-xs text-gray-500">
                    Include a prefix, target topic, and methodological variables reflecting the peer investigation.
                  </p>
                  <input
                    type="text"
                    id="submission-title-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Distributed Lockless Graph Ingestion with Regional Clock Synchronization"
                    className="w-full bg-[#f8fbfe] border border-gray-300 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-[#008751] focus:bg-white focus:outline-none transition-all placeholder:text-gray-400 font-semibold text-slate-800"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-800 uppercase tracking-wide">
                    Subtitle (Optional)
                  </label>
                  <input
                    type="text"
                    id="submission-subtitle-input"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="e.g. A Comparative Framework on Multi-Cloud Ephemeral Registers"
                    className="w-full bg-[#f8fbfe] border border-gray-300 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-[#008751] focus:bg-white focus:outline-none transition-all placeholder:text-gray-400 font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div id="abstract-desc-block" className="space-y-3.5 pt-2">
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-[#008751] font-sans border-b border-emerald-100 pb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#008751]" />
                  STEP 3.2: SUBMISSION ABSTRACT
                </h4>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-bold uppercase tracking-wide text-slate-850">
                      Manuscript Abstract Summary *
                    </label>
                    <span className="text-xs text-slate-500 font-mono font-bold">
                      Word Count: {abstract.trim() === '' ? 0 : abstract.trim().split(/\s+/).length} words
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-normal">
                    Provide a concise summary block (minimum 10 words, standard OJS requirements recommend between 150 to 300 words).
                  </p>
                  <textarea
                    id="submission-abstract-input"
                    value={abstract}
                    onChange={(e) => setAbstract(e.target.value)}
                    rows={8}
                    placeholder="Write or copy-paste your abstract details covering introduction, scientific methodology, outcomes, and conclusions."
                    className="w-full bg-[#f8fbfe] border border-gray-300 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-[#008751] focus:bg-white focus:outline-none transition-all placeholder:text-gray-400 font-normal text-slate-800 leading-relaxed font-sans"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-[#008751] font-sans border-b border-emerald-100 pb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#008751]" />
                  STEP 3.3: INDEXING TAGS
                </h4>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-800 uppercase tracking-wide">
                    Keywords
                  </label>
                  <p className="text-xs text-slate-500 mb-1">
                    Separate terms with commas (e.g. distributed systems, clocks).
                  </p>
                  <input
                    type="text"
                    id="submission-keywords-input"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="distributed-computing, lockless-graph, ojs3"
                    className="w-full bg-[#f8fbfe] border border-gray-300 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-[#008751] focus:bg-white focus:outline-none transition-all placeholder:text-gray-400 font-semibold"
                  />
                </div>
              </div>

            </div>
          )}

          {/* ----------------- STEP 4 CONTENT: CONTRIBUTORS ----------------- */}
          {currentStep === 4 && (
            <div id="step-4-contributors" className="space-y-6 text-sm text-slate-800 font-sans max-w-4xl mx-auto">
              
              <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-[#008751] font-sans flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#008751]" />
                  STEP 4.1: LIST OF AUTHORS
                </h4>
                
                <button
                  type="button"
                  onClick={handleOpenAddContributor}
                  className="bg-[#008751] hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <UserPlus className="w-4 h-4" />
                  Add Author
                </button>
              </div>

              {/* Table of current authors */}
              <div className="bg-white border rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b text-slate-800 font-bold uppercase tracking-wider text-xs">
                      <th className="px-5 py-3.5 w-16 text-center">Order</th>
                      <th className="px-5 py-3.5">Name</th>
                      <th className="px-5 py-3.5">Email</th>
                      <th className="px-5 py-3.5">Affiliation</th>
                      <th className="px-5 py-3.5 w-28">Role</th>
                      <th className="px-5 py-3.5 w-28 text-center">Principal?</th>
                      <th className="px-5 py-3.5 w-36 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-medium text-slate-705 text-sm">
                    {contributors.map((contrib, idx) => (
                      <tr key={contrib.id} className="hover:bg-slate-50 transition">
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveContributor(idx, 'up')}
                              disabled={idx === 0}
                              className="text-slate-400 hover:text-[#008751] disabled:opacity-30 cursor-pointer"
                              title="Move Up"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <span className="font-mono text-sm font-bold text-slate-700">{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => moveContributor(idx, 'down')}
                              disabled={idx === contributors.length - 1}
                              className="text-slate-400 hover:text-[#008751] disabled:opacity-30 cursor-pointer"
                              title="Move Down"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm">
                          <span className="font-bold text-slate-900 block text-sm">
                            {contrib.firstName} {contrib.lastName}
                          </span>
                          <span className="text-xs text-gray-400 font-mono block mt-0.5">
                            Country: {contrib.country || 'USA'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-gray-500 text-sm whitespace-nowrap">{contrib.email}</td>
                        <td className="px-5 py-3.5 italic text-sm">{contrib.affiliation}</td>
                        <td className="px-5 py-3.5 font-bold text-slate-700 text-sm">{contrib.role}</td>
                        <td className="px-5 py-3.5 text-center">
                          {contrib.isPrincipalContact ? (
                            <span className="inline-flex bg-emerald-50 border border-emerald-300 text-[#008751] text-xs font-mono px-2 py-0.5 rounded-lg font-extrabold shadow-xs">
                              ★ Principal
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEditContributor(idx)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#008751] rounded-lg font-bold cursor-pointer transition text-xs"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteContributor(idx)}
                              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-bold cursor-pointer transition text-xs"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Collapsed Modal Add/Edit contributor card style in-flight */}
              {contributorFormOpen && (
                <form
                  id="add-contributor-inline-form"
                  onSubmit={handleSaveContributor}
                  className="bg-slate-50 border border-sky-100 rounded-xl p-5 space-y-4 text-left animate-in slide-in-from-top-4 duration-150"
                >
                  <h3 className="font-semibold text-xs text-[#002b3d] uppercase tracking-wide">
                    {editingIndex !== null ? '🖊️ Edit Author Metadata' : '➕ Add Author'}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-800 uppercase">
                        First Name *
                      </label>
                      <input
                        type="text"
                        value={contribFirst}
                        onChange={(e) => setContribFirst(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#008751] outline-none font-semibold text-slate-800"
                        placeholder="Ada"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-800 uppercase">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        value={contribLast}
                        onChange={(e) => setContribLast(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#008751] outline-none font-semibold text-slate-800"
                        placeholder="Lovelace"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-800 uppercase">
                        Active Email *
                      </label>
                      <input
                        type="email"
                        value={contribEmail}
                        onChange={(e) => setContribEmail(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#008751] outline-none font-semibold text-slate-800"
                        placeholder="ada@computing.org"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-800 uppercase">
                        Institutional Affiliation *
                      </label>
                      <input
                        type="text"
                        value={contribAffiliation}
                        onChange={(e) => setContribAffiliation(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#008751] outline-none font-semibold text-slate-800"
                        placeholder="e.g. University of London"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-800 uppercase">
                        Country / Jurisdiction *
                      </label>
                      <input
                        type="text"
                        value={contribCountry}
                        onChange={(e) => setContribCountry(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#008751] outline-none font-semibold text-slate-800"
                        placeholder="e.g. United Kingdom"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-800 uppercase">
                        Role Type *
                      </label>
                      <select
                        value={contribRole}
                        onChange={(e) => setContribRole(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#008751] outline-none font-semibold text-slate-800"
                      >
                        <option value="Author">Author (Principal researcher)</option>
                        <option value="Translator">Translator (Multi-language copywriter)</option>
                        <option value="Co-investigator">Co-investigator (Data validator)</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-3">
                    <label className="flex items-center gap-3 cursor-pointer font-bold text-slate-850 text-sm">
                      <input
                        type="checkbox"
                        checked={contribPrincipal}
                        onChange={(e) => setContribPrincipal(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-[#008751] focus:ring-[#008751] accent-[#008751]"
                      />
                      <span>Principal contact for editorial correspondence regarding this paper.</span>
                    </label>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setContributorFormOpen(false)}
                      className="px-3 py-1.5 border border-gray-300 hover:bg-slate-100/60 rounded-md transition font-semibold text-slate-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#005c7a] hover:bg-[#00415a] rounded-md transition font-bold text-white cursor-pointer"
                    >
                      Save Author Changes
                    </button>
                  </div>
                </form>
              )}

            </div>
          )}

          {/* ----------------- STEP 5 CONTENT: ADDITIONAL FILES ----------------- */}
          {currentStep === 5 && (
            <div id="step-5-additional-files" className="space-y-6 text-sm text-slate-800 font-sans max-w-4xl mx-auto">
              
              {/* Cover Letter Panel */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4 text-left">
                <label className="block text-base font-extrabold uppercase tracking-wide text-slate-850 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#008751]" />
                  Step 5.1: Cover Letter (Strictly Confidential - Editor Eyes Only)
                </label>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Provide any explanatory notes, declarations, potential conflicts of interest, or professional background statements intended exclusively for the review overseers and Editorial Board members. You can either type the cover letter using our editor or upload a document directly.
                </p>

                {/* Cover letter choice / input */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-100 max-w-xs">
                    <span className="text-[11px] font-bold text-slate-600 pl-2 uppercase">Format:</span>
                    <div className="flex gap-1 text-xs">
                      <button 
                        type="button"
                        onClick={() => {
                          // Simple mock rich format helper
                          setCoverLetter(prev => prev + ' **[Bold Text]**');
                        }}
                        className="px-2 py-1 bg-white hover:bg-slate-100 border rounded font-bold text-slate-700"
                        title="Add Bold Formatting"
                      >
                        B
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          setCoverLetter(prev => prev + ' *[Italic Text]*');
                        }}
                        className="px-2 py-1 bg-white hover:bg-slate-100 border rounded italic font-bold text-slate-700"
                        title="Add Italic Formatting"
                      >
                        I
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          setCoverLetter(prev => prev + '\n- [List Item]');
                        }}
                        className="px-2 py-1 bg-white hover:bg-slate-100 border rounded font-bold text-slate-700"
                        title="Add Bullet List Item"
                      >
                        • List
                      </button>
                    </div>
                  </div>

                  <textarea
                    id="coverLetter-textarea"
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    rows={6}
                    placeholder="Type or paste your cover letter details here..."
                    className="w-full bg-[#f8fbfe] border border-gray-300 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-[#008751] focus:bg-white focus:outline-none transition-all placeholder:text-gray-400 font-normal text-slate-800 leading-relaxed"
                  />

                  {/* Cover letter file upload */}
                  <div className="pt-2 border-t border-dashed border-slate-200">
                    <span className="block text-xs font-bold text-slate-700 uppercase mb-2">Or Upload Cover Letter File:</span>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <input
                          type="file"
                          id="cover-letter-uploader"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) simulateCoverLetterUpload(file);
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <button type="button" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-750 text-xs font-bold rounded-lg border border-slate-300 flex items-center gap-2 cursor-pointer transition">
                          <Upload className="w-4 h-4 text-slate-500" />
                          Choose Document File
                        </button>
                      </div>

                      {isUploadingCoverLetter && (
                        <span className="text-xs text-[#008751] font-mono animate-pulse">Uploading file and performing anti-virus scan...</span>
                      )}

                      {coverLetterFile && (
                        <div className="flex items-center gap-2 bg-emerald-50 text-[#008751] px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-100">
                          <CheckCircle className="w-4 h-4" />
                          <span>{coverLetterFile.name} ({coverLetterFile.size})</span>
                          <button 
                            type="button" 
                            onClick={() => setCoverLetterFile(null)}
                            className="ml-1 text-emerald-800 hover:text-red-500 font-bold"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 5.2 Auxiliary Files */}
              <div id="supp-files-sub-card" className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4 text-left">
                <h4 className="font-extrabold text-base uppercase tracking-wide text-slate-850 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#008751]" />
                  Step 5.2: Auxiliary Files, Figures & Dataset Materials
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Authors are strongly encouraged to upload raw data tables, high-resolution figures, supplementary appendices, and scientific assets to increase Citation potential.
                </p>

                {/* Additional file upload component */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, true)}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition duration-150 relative ${
                    dragActive
                      ? 'border-[#008751] bg-[#008751]/5'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-white'
                  }`}
                >
                  <input
                    type="file"
                    id="supp-file-input"
                    onChange={(e) => handleFileUpload(e, true)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Upload className="w-9 h-9 text-[#008751]/75" />
                    <p className="text-slate-700 font-bold text-xs">
                      Drag supplementary files here, or <span className="text-[#008751] underline">choose file</span>
                    </p>
                    <p className="text-slate-400 text-[10px]">CSV, ZIP, XLSX, PNG, TIFF up to 50MB</p>
                  </div>
                </div>

                {isUploadingAddFile && (
                  <div className="bg-emerald-50/40 p-3 rounded-lg border space-y-1">
                    <div className="flex justify-between text-xs text-slate-700 font-mono">
                      <span>Loading supplementary material...</span>
                      <span>{addFileProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                      <div className="bg-[#008751] h-1" style={{ width: `${addFileProgress}%` }}></div>
                    </div>
                  </div>
                )}

                {/* Uploaded supplementary files directory board */}
                <div className="bg-white border border-slate-150 rounded-xl overflow-hidden mt-2">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f8fafc] text-slate-700 font-bold border-b text-[10px] uppercase">
                      <tr>
                        <th className="px-4 py-3 w-10">#</th>
                        <th className="px-4 py-3">File Name</th>
                        <th className="px-4 py-3">File Type</th>
                        <th className="px-4 py-3 w-24 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-700">
                      {additionalFiles.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-5 text-center text-gray-400 italic font-mono">
                            No auxiliary attachments added.
                          </td>
                        </tr>
                      ) : (
                        additionalFiles.map((addF, idx) => (
                          <tr key={addF.id} className="hover:bg-[#f8fafc]/50">
                            <td className="px-4 py-3 font-mono text-slate-400">{idx + 1}</td>
                            <td className="px-4 py-3 font-semibold text-slate-800">{addF.fileName}</td>
                            <td className="px-4 py-3 text-slate-500 font-mono">{addF.fileSize}</td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => deleteUploadedFile(addF.id, true)}
                                className="text-red-500 hover:text-red-700 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dynamic Additional Form Steps (Comprehensive SaaS checklist) */}
              <div className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-xs text-left space-y-6">
                <span className="text-sm font-extrabold text-[#008751] uppercase tracking-wide block border-b pb-2">
                  Step 5.3: Mandatory Scholarly Disclosures & Compliance Declarations
                </span>

                {/* Funding Panel */}
                <div className="space-y-3 pt-2">
                  <label className="block text-sm font-bold text-slate-800">
                    Was this research funded? *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="isFunded" 
                        value="Yes" 
                        checked={isFunded === 'Yes'} 
                        onChange={() => setIsFunded('Yes')} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>Yes, this project received financial sponsorship</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="isFunded" 
                        value="No" 
                        checked={isFunded === 'No'} 
                        onChange={() => setIsFunded('No')} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>No, self-financed / unfunded</span>
                    </label>
                  </div>

                  {isFunded === 'Yes' && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-2 animate-in fade-in-80 duration-150">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Funding Agency / Funder Name *</label>
                          <input 
                            type="text" 
                            value={funderName} 
                            onChange={(e) => setFunderName(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                            placeholder="e.g. National Science Foundation (NSF)"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Grant / Award Number *</label>
                          <input 
                            type="text" 
                            value={grantNumber} 
                            onChange={(e) => setGrantNumber(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                            placeholder="e.g. NSF-IIS-2026-95"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-700">Funding Support Description</label>
                        <textarea 
                          value={fundingDesc} 
                          onChange={(e) => setFundingDesc(e.target.value)} 
                          rows={2}
                          className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                          placeholder="Provide details on matching funds, co-investigator divisions or institutional provisions..."
                        />
                      </div>

                      {/* Multiple Funder Support */}
                      <div className="pt-2">
                        <span className="block text-xs font-bold text-slate-700 mb-2">Multiple Funder Support:</span>
                        <div className="space-y-2">
                          {additionalFunders.map((f, i) => (
                            <div key={f.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border text-xs">
                              <div>
                                <span className="font-bold text-slate-800">{f.name}</span>
                                <span className="text-slate-400 mx-2 font-mono">—</span>
                                <span className="font-mono text-slate-600">{f.grant}</span>
                              </div>
                              <button 
                                type="button" 
                                onClick={() => setAdditionalFunders(prev => prev.filter(item => item.id !== f.id))}
                                className="text-red-500 text-xs font-bold"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const addName = prompt("Enter additional Funder Name:");
                            if (!addName) return;
                            const addGrant = prompt("Enter additional Grant Number:") || "N/A";
                            setAdditionalFunders(prev => [...prev, { id: 'fund-' + Date.now(), name: addName, grant: addGrant, desc: '' }]);
                          }}
                          className="mt-2 text-xs text-[#008751] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          + Register another co-funder agency / grant
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Previously Submitted Manuscript */}
                <div className="space-y-3 pt-2 border-t">
                  <label className="block text-sm font-bold text-slate-800">
                    Has this manuscript been submitted elsewhere previously? *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="previouslySubmitted" 
                        value="Yes" 
                        checked={previouslySubmitted === 'Yes'} 
                        onChange={() => setPreviouslySubmitted('Yes')} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>Yes, originally presented to another journal</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="previouslySubmitted" 
                        value="No" 
                        checked={previouslySubmitted === 'No'} 
                        onChange={() => setPreviouslySubmitted('No')} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>No, original submission</span>
                    </label>
                  </div>

                  {previouslySubmitted === 'Yes' && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-2 animate-in fade-in-80 duration-150">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Previous Journal Name *</label>
                          <input 
                            type="text" 
                            value={prevJournalName} 
                            onChange={(e) => setPrevJournalName(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                            placeholder="e.g. Nature Microbiology"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Manuscript ID (if applicable)</label>
                          <input 
                            type="text" 
                            value={prevManuscriptId} 
                            onChange={(e) => setPrevManuscriptId(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                            placeholder="e.g. NAT-MB-2025-08"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Submission Date</label>
                          <input 
                            type="date" 
                            value={prevSubmissionDate} 
                            onChange={(e) => setPrevSubmissionDate(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Decision Status</label>
                          <select 
                            value={prevDecisionStatus} 
                            onChange={(e) => setPrevDecisionStatus(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm"
                          >
                            <option value="">-- Choose Status --</option>
                            <option value="Rejected after review">Rejected after review</option>
                            <option value="Rejected without review (Desk reject)">Rejected without review (Desk reject)</option>
                            <option value="Withdrawn by author">Withdrawn by author</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-700">Comments detailing changes made since that submission</label>
                        <textarea 
                          value={prevComments} 
                          onChange={(e) => setPrevComments(e.target.value)} 
                          rows={2}
                          className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                          placeholder="Explain what additions, extra experiments, or text improvements were performed..."
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Clinical Trial Registration */}
                <div className="space-y-3 pt-2 border-t">
                  <label className="block text-sm font-bold text-slate-800">
                    Is this study registered as a clinical trial? *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="isClinicalTrial" 
                        value="Yes" 
                        checked={isClinicalTrial === 'Yes'} 
                        onChange={() => setIsClinicalTrial('Yes')} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>Yes, registered clinical trial</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="isClinicalTrial" 
                        value="No" 
                        checked={isClinicalTrial === 'No'} 
                        onChange={() => setIsClinicalTrial('No')} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>No, observational / in-vitro / animal / theoretical</span>
                    </label>
                  </div>

                  {isClinicalTrial === 'Yes' && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-2 animate-in fade-in-80 duration-150">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Trial Registration Number *</label>
                          <input 
                            type="text" 
                            value={trialRegNumber} 
                            onChange={(e) => setTrialRegNumber(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                            placeholder="e.g. NCT04958172"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Registry Name *</label>
                          <input 
                            type="text" 
                            value={registryName} 
                            onChange={(e) => setRegistryName(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                            placeholder="e.g. ClinicalTrials.gov"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Registration Date *</label>
                          <input 
                            type="date" 
                            value={trialRegDate} 
                            onChange={(e) => setTrialRegDate(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Patient Consent for Publication */}
                <div className="space-y-3 pt-2 border-t">
                  <label className="block text-sm font-bold text-slate-800">
                    Patient consent for publication obtained? (If humans involved) *
                  </label>
                  <select
                    value={patientConsent}
                    onChange={(e: any) => setPatientConsent(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm font-medium text-slate-800 focus:ring-1 focus:ring-[#008751] outline-none"
                  >
                    <option value="Yes">Yes, signed patient consent forms have been archived safely</option>
                    <option value="No">No, process pending or not obtained</option>
                    <option value="Not Applicable">Not Applicable (No human case reports or patient metadata)</option>
                  </select>
                </div>

                {/* Ethical Approval – Human Studies */}
                <div className="space-y-3 pt-2 border-t">
                  <label className="block text-sm font-bold text-slate-800">
                    Was ethical approval obtained for human participant research? *
                  </label>
                  <select
                    value={ethicalApprovalHuman}
                    onChange={(e: any) => setEthicalApprovalHuman(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm font-medium text-[#002b3d] focus:ring-1 focus:ring-[#008751] outline-none mb-2"
                  >
                    <option value="Yes">Yes, approval granted by designated institutional review board (IRB)</option>
                    <option value="No">No, exempt or waived</option>
                    <option value="Not Applicable">Not Applicable (No human study / research data)</option>
                  </select>

                  {ethicalApprovalHuman === 'Yes' && (
                    <div className="p-4 bg-[#f8fafc] border border-slate-200 rounded-xl space-y-3 animate-in fade-in-80 duration-150">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Ethics Committee Name *</label>
                          <input 
                            type="text" 
                            value={ethicsCommitteeHuman} 
                            onChange={(e) => setEthicsCommitteeHuman(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                            placeholder="e.g. Biomedical IRB of Seattle"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Approval / Protocol Number *</label>
                          <input 
                            type="text" 
                            value={ethicsApprovalNoHuman} 
                            onChange={(e) => setEthicsApprovalNoHuman(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                            placeholder="e.g. IRB-2025-F83"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Approval Date *</label>
                          <input 
                            type="date" 
                            value={ethicsApprovalDateHuman} 
                            onChange={(e) => setEthicsApprovalDateHuman(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Ethical Approval – Animal Studies */}
                <div className="space-y-3 pt-2 border-t">
                  <label className="block text-sm font-bold text-slate-800">
                    Was ethical approval obtained for animal research? *
                  </label>
                  <select
                    value={ethicalApprovalAnimal}
                    onChange={(e: any) => setEthicalApprovalAnimal(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm font-medium text-slate-805 focus:ring-1 focus:ring-[#008751] outline-none mb-2"
                  >
                    <option value="Yes">Yes, animal care/use ethics committee approval obtained</option>
                    <option value="No">No, exempt / not requested</option>
                    <option value="Not Applicable">Not Applicable (No animal experimentation / data)</option>
                  </select>

                  {ethicalApprovalAnimal === 'Yes' && (
                    <div className="p-4 bg-[#f8fafc] border border-slate-200 rounded-xl space-y-3 animate-in fade-in-80 duration-150">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Ethics Committee Name *</label>
                          <input 
                            type="text" 
                            value={ethicsCommitteeAnimal} 
                            onChange={(e) => setEthicsCommitteeAnimal(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                            placeholder="e.g. IACUC University Hospital"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Approval / Protocol Number *</label>
                          <input 
                            type="text" 
                            value={ethicsApprovalNoAnimal} 
                            onChange={(e) => setEthicsApprovalNoAnimal(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                            placeholder="e.g. IACUC-AN-2026-11b"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-700">Approval Date *</label>
                          <input 
                            type="date" 
                            value={ethicsApprovalDateAnimal} 
                            onChange={(e) => setEthicsApprovalDateAnimal(e.target.value)} 
                            className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Permission to Use Images */}
                <div className="space-y-3 pt-2 border-t">
                  <label className="block text-sm font-bold text-slate-800">
                    Does the manuscript contain images requiring copyright clearance or usage permission? *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="imagesPermissionRequired" 
                        value="Yes" 
                        checked={imagesPermissionRequired === 'Yes'} 
                        onChange={() => setImagesPermissionRequired('Yes')} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>Yes, copyrighted figures or patient imagery included</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="imagesPermissionRequired" 
                        value="No" 
                        checked={imagesPermissionRequired === 'No'} 
                        onChange={() => setImagesPermissionRequired('No')} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>No images require external permission</span>
                    </label>
                  </div>

                  {imagesPermissionRequired === 'Yes' && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-2 animate-in fade-in-80 duration-150">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-700">Permission details & descriptive listing</label>
                        <textarea 
                          value={permissionDesc} 
                          onChange={(e) => setPermissionDesc(e.target.value)} 
                          rows={2}
                          className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                          placeholder="List figures (such as Fig 1, Fig 3) and who or which publisher granted usage authorization..."
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="block text-xs font-bold text-slate-700">Permission Documentation Upload:</span>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <input 
                              type="file" 
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) simulatePermissionUpload(f);
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <button type="button" className="px-3.5 py-1.5 bg-white border text-xs font-bold rounded hover:bg-slate-50 text-slate-700 transition">
                              Upload Permission Proof
                            </button>
                          </div>
                          {isUploadingPermissionDoc && <span className="text-[11px] text-[#008751] animate-pulse">Running checksum scan...</span>}
                        </div>

                        {permissionDocs.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between text-xs bg-white px-2 py-1.5 rounded border border-emerald-100 text-emerald-800">
                            <span className="truncate">{doc.name} ({doc.size})</span>
                            <button type="button" onClick={() => setPermissionDocs(prev => prev.filter(p => p.id !== doc.id))} className="text-red-500 font-bold ml-2">×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Third-Party Text / Publication Usage */}
                <div className="space-y-3 pt-2 border-t">
                  <label className="block text-sm font-bold text-slate-800">
                    Does the manuscript contain copyrighted third-party text or publication content? *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="copyrightedContent" 
                        value="Yes" 
                        checked={copyrightedContent === 'Yes'} 
                        onChange={() => setCopyrightedContent('Yes')} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>Yes, text blocks, datasets, or code charts require licensure</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="copyrightedContent" 
                        value="No" 
                        checked={copyrightedContent === 'No'} 
                        onChange={() => setCopyrightedContent('No')} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>No, purely original authorship</span>
                    </label>
                  </div>

                  {copyrightedContent === 'Yes' && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-2 animate-in fade-in-80 duration-150">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-700">Source Citations & Rights Information</label>
                        <textarea 
                          value={copyrightSourceInfo} 
                          onChange={(e) => setCopyrightSourceInfo(e.target.value)} 
                          rows={2}
                          className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                          placeholder="Provide citation details of the copyrighted text or original book sources..."
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="block text-xs font-bold text-slate-700">Permission Documentation Upload:</span>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <input 
                              type="file" 
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) simulateCopyrightUpload(f);
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <button type="button" className="px-3.5 py-1.5 bg-white border text-xs font-bold rounded hover:bg-slate-50 text-slate-700 transition">
                              Upload Copyright License
                            </button>
                          </div>
                          {isUploadingCopyrightDoc && <span className="text-[11px] text-[#008751] animate-pulse">Scanning server limits...</span>}
                        </div>

                        {copyrightDocs.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between text-xs bg-white px-2 py-1.5 rounded border border-emerald-100 text-emerald-800">
                            <span className="truncate">{doc.name} ({doc.size})</span>
                            <button type="button" onClick={() => setCopyrightDocs(prev => prev.filter(p => p.id !== doc.id))} className="text-red-500 font-bold ml-2">×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Social Media Promotion */}
                <div className="space-y-3 pt-2 border-t font-sans">
                  <label className="block text-sm font-bold text-slate-800">
                    Would you like the publisher to promote this article on social media after publication? *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="socialMediaPromotion" 
                        value="Yes" 
                        checked={socialMediaPromotion === 'Yes'} 
                        onChange={() => {
                          setSocialMediaPromotion('Yes');
                          setPromoPlatforms(['LinkedIn', 'X (Twitter)', 'ResearchGate']); // defaults helper
                        }} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>Yes, maximize scientific dissemination via media channels</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="socialMediaPromotion" 
                        value="No" 
                        checked={socialMediaPromotion === 'No'} 
                        onChange={() => {
                          setSocialMediaPromotion('No');
                          setPromoPlatforms([]);
                        }} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>No, publish silently</span>
                    </label>
                  </div>

                  {socialMediaPromotion === 'Yes' && (
                    <div className="p-4 bg--50 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-2 animate-in fade-in-80 duration-150">
                      <span className="block text-xs font-bold text-slate-750">Preferred Indexing & Dissemination Platforms:</span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {['LinkedIn', 'Facebook', 'X (Twitter)', 'Instagram', 'ResearchGate'].map(platform => {
                          const exists = promoPlatforms.includes(platform);
                          return (
                            <label key={platform} className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                              <input 
                                type="checkbox" 
                                checked={exists}
                                onChange={() => {
                                  if (exists) {
                                    setPromoPlatforms(prev => prev.filter(p => p !== platform));
                                  } else {
                                    setPromoPlatforms(prev => [...prev, platform]);
                                  }
                                }}
                                className="w-4 h-4 text-[#008751] focus:ring-[#008751] rounded border-gray-300"
                              />
                              <span>{platform}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Color Figures */}
                <div className="space-y-3 pt-2 border-t">
                  <label className="block text-sm font-bold text-slate-800">
                    Does the manuscript contain color figures? *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="colorFigures" 
                        value="Yes" 
                        checked={colorFigures === 'Yes'} 
                        onChange={() => setColorFigures('Yes')} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>Yes, color diagrams/plates included</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input 
                        type="radio" 
                        name="colorFigures" 
                        value="No" 
                        checked={colorFigures === 'No'} 
                        onChange={() => setColorFigures('No')} 
                        className="w-4 h-4 text-[#008751] focus:ring-[#008751]"
                      />
                      <span>No, simple black & white figures only</span>
                    </label>
                  </div>

                  {colorFigures === 'Yes' && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-2 animate-in fade-in-80 duration-150">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-700">Number of Color Figures *</label>
                        <input 
                          type="number" 
                          min={1}
                          value={colorFiguresCount} 
                          onChange={(e) => setColorFiguresCount(e.target.value)} 
                          className="w-full sm:w-48 bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                          placeholder="e.g. 3"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-700">Figure Details (Specific print options/captions)</label>
                        <textarea 
                          value={colorFiguresDetails} 
                          onChange={(e) => setColorFiguresDetails(e.target.value)} 
                          rows={2}
                          className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm" 
                          placeholder="Briefly state format e.g. RGB 300DPI, print vs online versions requirement..."
                        />
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* ----------------- STEP 6 CONTENT: REVIEWER SUGGESTIONS ----------------- */}
          {currentStep === 6 && (
            <div id="step-6-reviewers" className="space-y-6 text-sm text-slate-800 font-sans max-w-4xl mx-auto">
              
              <div className="bg-sky-50 border border-sky-100 p-5 rounded-2xl space-y-2">
                <h4 className="font-bold text-[#002b3d] flex items-center gap-1.5 text-sm">
                  <ShieldAlert className="w-5 h-5 text-sky-600" />
                  Reviewer Recommendation Protocols (Optional)
                </h4>
                <p className="text-slate-600 leading-relaxed text-sm font-normal">
                  To expedite the double-blind dispatch sequence, suggestions of competent experts are appreciated. Suggested individuals must not represent co-authors, recent research collaborators, or academic teachers within the last 5 years to maintain pure objectivity.
                </p>
              </div>

              {/* Suggestions adding panel */}
              <div className="bg-slate-50 p-6 border border-emerald-100 rounded-2xl space-y-4">
                <span className="text-sm uppercase font-sans font-extrabold text-[#008751] block border-b border-emerald-100 pb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#008751]" />
                  Add Peer Recommendation Row
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-800">Reviewer Full Name</label>
                    <input
                      type="text"
                      value={revName}
                      onChange={(e) => setRevName(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm font-semibold"
                      placeholder="e.g. Dr. Richard Feynman"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-800">Official Email Endpoint</label>
                    <input
                      type="email"
                      value={revEmail}
                      onChange={(e) => setRevEmail(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm font-semibold"
                      placeholder="richard@caltech.edu"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-800">Affiliated Association</label>
                    <input
                      type="text"
                      value={revAffiliation}
                      onChange={(e) => setRevAffiliation(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm font-semibold"
                      placeholder="California Institute of Technology"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-800">Reason / Subject Expertise Focus</label>
                    <input
                      type="text"
                      value={revReason}
                      onChange={(e) => setRevReason(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl p-3 text-sm font-semibold"
                      placeholder="Leading theorist in distributed quantum electrodynamics"
                    />
                  </div>
                </div>

                <div className="pt-2 text-right">
                  <button
                    type="button"
                    onClick={handleAddReviewer}
                    className="px-5 py-2.5 bg-[#008751] hover:bg-emerald-700 rounded-xl text-white text-sm font-bold transition cursor-pointer shadow-xs"
                  >
                    Insert suggested peer records
                  </button>
                </div>
              </div>

              {/* Table of recommended peers */}
              <div className="space-y-4 pt-2">
                <span className="text-sm uppercase font-sans font-extrabold text-[#008751] block border-b border-emerald-100 pb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#008751]" />
                  Suggested Peer Reviewer Board
                </span>

                <div className="bg-white border rounded-2xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-800 font-bold uppercase tracking-wider text-xs border-b">
                      <tr>
                        <th className="px-5 py-3.5 w-16 text-center">Row</th>
                        <th className="px-5 py-3.5">Suggested Contact</th>
                        <th className="px-5 py-3.5">Affiliation</th>
                        <th className="px-5 py-3.5">Statement of Reason</th>
                        <th className="px-5 py-3.5 w-20 text-center">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-750 text-sm font-medium">
                      {reviewerSuggestions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-10 text-center text-gray-400 italic bg-slate-50/50">
                            No peer suggestions recorded. (You can skip or add as required).
                          </td>
                        </tr>
                      ) : (
                        reviewerSuggestions.map((rev, index) => (
                          <tr key={rev.id} className="hover:bg-slate-50 transition">
                            <td className="px-5 py-3.5 text-center font-mono text-gray-400 text-sm">{index + 1}</td>
                            <td className="px-5 py-3.5">
                              <strong className="block text-slate-900 text-sm">{rev.name}</strong>
                              <span className="block text-xs text-gray-400 font-mono mt-0.5">{rev.email}</span>
                            </td>
                            <td className="px-5 py-3.5 italic text-sm">{rev.affiliation}</td>
                            <td className="px-5 py-3.5 text-slate-600 font-normal leading-relaxed text-sm">{rev.reason}</td>
                            <td className="px-5 py-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveReviewer(rev.id)}
                                className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

           {/* ----------------- STEP 7 CONTENT: PUBLICATION DETAILS ----------------- */}
          {currentStep === 7 && (
            <div id="step-7-publication" className="space-y-6 text-sm text-slate-800 font-sans max-w-4xl mx-auto">
              
              <div className="space-y-4">
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-[#008751] font-sans flex items-center gap-2 border-b border-emerald-100 pb-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#008751]" />
                  STEP 7.1: PUBLICATION TYPE
                </h4>
                
                <div className="bg-emerald-50/50 border border-[#008751]/20 rounded-2xl p-6 space-y-4 text-left">
                  <div className="flex items-center gap-2 text-[#008751]">
                    <CheckCircle className="w-5 h-5 shrink-0" />
                    <span className="font-extrabold text-sm uppercase tracking-wider">Open Access Publication Enabled</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed font-semibold">
                    This journal operates on a platinum Open Access model. All accepted manuscripts are published immediately upon production with unrestricted public access worldwide.
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 font-medium">
                    <li>No Article Processing Charges (APC) or publication fees.</li>
                    <li>Immediate global indexing and search visibility.</li>
                    <li>Authors retain copyright and grant the journal first-publishing rights.</li>
                  </ul>
                </div>
              </div>

            </div>
          )}

          {/* ----------------- STEP 8 CONTENT: CONFIRMATION ----------------- */}
          {currentStep === 8 && (
            <div id="step-8-confirmation" className="space-y-6 text-sm text-slate-800 font-sans max-w-4xl mx-auto">
              
              <div className="bg-sky-50 border border-sky-100 p-5 rounded-2xl flex items-start gap-4">
                <Info className="w-6 h-6 text-sky-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <h4 className="font-bold text-[#002b3d] text-base">Verify your structural inputs before submittal</h4>
                  <p className="text-slate-600 font-normal leading-relaxed text-sm">
                    Once you hit the submit manuscript button, lock criteria are enforced on the core files. The double-blind pipeline will automatically sanitize co-author records, issue a unique tracking ticket identifier code, and notify the editorial central dashboard.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-[#008751] font-sans flex items-center gap-2 border-b border-emerald-100 pb-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#008751]" />
                  CONSOLIDATED DRAFT CHECKSHEET DETAILS
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  
                  {/* Category A: Basic configuration */}
                  <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-3 shadow-xs">
                    <span className="text-xs font-mono font-bold uppercase bg-slate-200 px-2.5 py-1 rounded-lg text-slate-700">
                      Scope Criteria
                    </span>

                    <div className="pt-2 text-sm space-y-2 text-slate-700 leading-relaxed font-normal">
                      <div>Language choice: <strong className="text-slate-900">{subLanguage}</strong></div>
                      <div>Assigned Scope: <strong className="text-slate-900">{subSection}</strong></div>
                      <div>CC License framework: <strong className="text-slate-900">CC BY 4.0 (Default Open Access)</strong></div>
                      <div>Open Access paradigm: <strong className="text-[#008751] font-bold">Immediate Open Access</strong></div>
                    </div>
                  </div>

                  {/* Category B: Draft assets */}
                  <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-3 shadow-xs">
                    <span className="text-xs font-mono font-bold uppercase bg-slate-200 px-2.5 py-1 rounded-lg text-slate-700">
                      Manuscript Galley Files
                    </span>

                    <div className="pt-2 text-sm space-y-2 text-slate-700 leading-relaxed">
                      {uploadedFiles.map((f, i) => (
                        <div key={f.id} className="flex items-center gap-2 text-slate-800">
                          <Check className="w-4 h-4 text-[#008751] stroke-[3]" />
                          <span className="font-bold truncate max-w-xs">{f.fileName} ({f.componentType})</span>
                        </div>
                      ))}
                      {uploadedFiles.length === 0 && (
                        <span className="text-red-600 font-bold italic block">No files added!</span>
                      )}
                    </div>
                  </div>

                  {/* Category C: Metadata status */}
                  <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-3 shadow-xs">
                    <span className="text-xs font-mono font-bold uppercase bg-slate-200 px-2.5 py-1 rounded-lg text-slate-700">
                      Scientific Metadata
                    </span>

                    <div className="pt-2 text-sm space-y-2 text-slate-700 font-normal leading-relaxed">
                      <div className="truncate">Title: <em className="text-slate-900 font-bold italic">"{title}"</em></div>
                      <div>Abstract length: <strong className="text-slate-900">{abstract.trim().split(/\s+/).length} words</strong></div>
                    </div>
                  </div>

                  {/* Category D: Authors & suggestions */}
                  <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-3 shadow-xs font-normal">
                    <span className="text-xs font-mono font-bold uppercase bg-slate-200 px-2.5 py-1 rounded-lg text-slate-700">
                      Team & Peer Suggestions
                    </span>

                    <div className="pt-2 text-sm space-y-2 text-slate-700">
                      <div>Total Authors: <strong className="text-emerald-700 font-bold">{contributors.length}</strong></div>
                      <div>Suggested Reviewers: <strong className="text-[#008751] font-bold">{reviewerSuggestions.length} candidates</strong></div>
                      <div>Confidential Cover Letter: <strong className="text-slate-900 font-bold">{coverLetter.trim() ? `${coverLetter.length} chars` : 'Absent'}</strong></div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Explicit acknowledgement of finality */}
              <div className="p-5 bg-slate-100/50 border border-dashed border-emerald-300 rounded-2xl max-w-xl mx-auto space-y-2 text-center mt-4">
                <p className="text-xs text-gray-500 font-normal leading-relaxed">
                  Clicking the button below verifies that you have verified conformity with our double-blind instructions and that all listed co-authors agree to this action.
                </p>
              </div>

            </div>
          )}

          {/* ----------------- STEP 9 CONTENT: SUBMISSION COMPLETION ----------------- */}
          {currentStep === 9 && (
            <div id="step-9-completion" className="space-y-6 text-sm text-slate-800 font-sans p-4 sm:p-6 text-center max-w-4xl mx-auto">
              
              {/* Visual celebration banner */}
              <div className="flex flex-col items-center justify-center space-y-4 max-w-xl mx-auto">
                <div className="h-16 w-16 rounded-full bg-emerald-100 text-[#008751] border border-emerald-300 flex items-center justify-center animate-bounce shadow-xs">
                  <CheckCircle className="w-10 h-10 stroke-[2.5]" />
                </div>
                
                <h3 className="text-xl font-extrabold text-[#002b3d] tracking-tight">
                  Academic Manuscript Successfully Dispatched!
                </h3>
                
                <p className="text-slate-600 font-medium leading-relaxed text-sm max-w-md">
                  Thank you for submitting to the journal. The submission processing engine has loaded your draft successfully.
                </p>
              </div>

              {/* Dynamic Information Card details */}
              <div className="bg-gradient-to-br from-slate-50 to-white border border-emerald-100 p-8 rounded-2xl max-w-xl mx-auto shadow-sm space-y-5 text-left">
                
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-xs uppercase font-sans text-[#008751] tracking-widest block font-bold">
                      Assigned Tracking Code
                    </span>
                    <strong className="text-base font-extrabold text-[#002b3d] font-mono block mt-1">
                      MSS ID: #{generatedId}
                    </strong>
                  </div>

                  <div className="text-right">
                    <span className="text-xs uppercase font-sans text-[#008751] font-bold block">
                      Status State
                    </span>
                    <span className="inline-block bg-emerald-50 border border-emerald-200 text-[#008751] text-xs uppercase font-mono tracking-wider px-3 py-1 rounded-lg mt-1 font-bold shadow-xs">
                      Submission Received
                    </span>
                  </div>
                </div>

                {/* Tracking steps timeline */}
                <div className="space-y-4 pt-1">
                  <span className="text-xs uppercase font-sans tracking-wider text-slate-400 block font-bold">
                    Follow-up Editorial Timeline
                  </span>

                  <div className="space-y-4 pl-1.5">
                    
                    {/* Node 1 */}
                    <div className="flex gap-4 items-start relative">
                      <div className="w-0.5 bg-[#cfdde5] absolute left-[7px] top-4 bottom-[-14px]"></div>
                      <div className="h-5 w-5 rounded-full bg-emerald-500 border border-emerald-300 flex items-center justify-center text-white text-xs mt-0.5 shrink-0">
                        ✓
                      </div>
                      <div className="text-sm leading-normal">
                        <strong className="block text-slate-800 font-extrabold">Submission Received & Synced</strong>
                        <span className="text-gray-500 text-xs font-mono block mt-0.5">Today (Completed)</span>
                      </div>
                    </div>

                    {/* Node 2 */}
                    <div className="flex gap-4 items-start relative">
                      <div className="w-0.5 bg-[#cfdde5] absolute left-[7px] top-4 bottom-[-14px]"></div>
                      <div className="h-5 w-5 rounded-full bg-emerald-50 text-[#008751] border border-emerald-300 flex items-center justify-center text-xs mt-0.5 shrink-0 font-mono font-bold">
                        2
                      </div>
                      <div className="text-sm leading-normal">
                        <strong className="block text-slate-800 font-bold">Editorial Board Pre-screening</strong>
                        <span className="text-gray-500 text-xs block mt-0.5">Estimated completion within 3 business days</span>
                      </div>
                    </div>

                    {/* Node 3 */}
                    <div className="flex gap-4 items-start relative">
                      <div className="w-0.5 bg-dashed absolute left-[7px] top-4 bottom-[-14px]"></div>
                      <div className="h-5 w-5 rounded-full bg-slate-100 border text-slate-400 flex items-center justify-center text-xs mt-0.5 shrink-0 font-mono">
                        3
                      </div>
                      <div className="text-sm leading-normal">
                        <strong className="block text-slate-400 font-bold">Double-blind Peer Review Sequence</strong>
                        <span className="text-slate-400 text-xs block mt-0.5">Typically occupies between 2 to 4 weeks</span>
                      </div>
                    </div>

                    {/* Node 4 */}
                    <div className="flex gap-4 items-start">
                      <div className="h-5 w-5 rounded-full bg-slate-100 border text-slate-400 flex items-center justify-center text-xs mt-0.5 shrink-0 font-mono">
                        4
                      </div>
                      <div className="text-sm leading-normal">
                        <strong className="block text-slate-400 font-bold">Decision Notification Email</strong>
                        <span className="text-slate-400 text-xs block mt-0.5">Estimated on or before: <strong className="text-slate-500 font-bold">{estimatedDecisionDate}</strong></span>
                      </div>
                    </div>

                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 text-center font-mono text-[10px] text-slate-500">
                  A verification confirmation receipt has been dispatched to: <strong className="text-[#005c7a] block mt-0.5">{currentUser?.email || 'your-address@publishing.net'}</strong>
                </div>

              </div>

            </div>
          )}

        </div>

        {/* ======================= COMPONENT ACTION STEER PATHS (FOOTER) ======================= */}
        {currentStep < 9 && (
          <div className="bg-[#f8fafc] border-t border-[#e2e8f0] px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => alert("Draft saved successfully. Progressive state saved to system memory.")}
                type="button"
                className="px-4 py-2 bg-white border border-slate-350 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer flex items-center gap-2 shadow-xs"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Save Draft
              </button>

              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                <Check className="w-3.5 h-3.5 stroke-[3.5px]" />
                Autosaved just now
              </span>
            </div>

            <div className="flex items-center gap-3">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-4 py-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}

              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 bg-[#008751] hover:bg-[#007043] text-white rounded-lg font-bold text-xs shadow-md shadow-emerald-100/80 transition cursor-pointer flex items-center gap-1.5"
              >
                {currentStep === 8 ? (
                  <>
                    <FileCheck className="w-4 h-4 text-emerald-200" />
                    Submit Academic Manuscript
                  </>
                ) : (
                  <>
                    Save & Continue
                    <ChevronRight className="w-4 h-4 text-emerald-100" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 9 Complete Footer Button */}
        {currentStep === 9 && (
          <div className="bg-[#f5f8fa] border-t border-[#cfdde5] px-6 py-4 text-center">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2.5 bg-[#002b3d] hover:bg-[#001f2c] text-white font-extrabold text-xs tracking-wide rounded-lg shadow transition cursor-pointer"
            >
              Return to Submissions Dashboard
            </button>
          </div>
        )}

      </main>

    </div>
  );
}
