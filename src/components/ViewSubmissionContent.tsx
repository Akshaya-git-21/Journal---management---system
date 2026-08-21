import React, { useState } from 'react';
import { AuthorManuscriptDetails } from '../lib/authorManuscriptDetails';
import { FileText, Users, Layers, AlertCircle, Eye, Download } from 'lucide-react';
import DiscussionsTab from './DiscussionsTab';
import FilePreviewModal from './FilePreviewModal';

interface RevisionFileEntry {
  id: string;
  name: string;
  type: string;
  size: string;
  date: string;
  publicUrl?: string | null;
}

interface ViewSubmissionContentProps {
  activeTab: string;
  manuscriptDetails: AuthorManuscriptDetails | null;
  currentUserId?: string;
  onRefreshData?: () => void;
  revisionFiles?: RevisionFileEntry[];
  latestRevisionNumber?: number;
}

export default function ViewSubmissionContent({
  activeTab,
  manuscriptDetails,
  currentUserId,
  onRefreshData,
  revisionFiles = [],
  latestRevisionNumber
}: ViewSubmissionContentProps) {
  const [previewFile, setPreviewFile] = useState<any>(null);

  if (!manuscriptDetails) {
    return (
      <div className="flex-grow flex items-center justify-center p-8">
        <div className="text-center text-slate-500">Loading submission details...</div>
      </div>
    );
  }

  const m = manuscriptDetails.manuscript;
  const EmptyState = ({ message }: { message: string }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
      <p className="text-slate-500 text-sm">{message}</p>
    </div>
  );

  const renderTitleAbstract = () => (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">Title</h3>
        {m?.title ? (
          <p className="text-base text-slate-800 leading-relaxed">{m.title}</p>
        ) : (
          <EmptyState message="No title provided" />
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">Abstract</h3>
        {m?.abstract ? (
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{m.abstract}</p>
        ) : (
          <EmptyState message="No abstract provided" />
        )}
      </div>
    </div>
  );

  const renderAuthors = () => (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">Authors & Contributors</h3>
      {manuscriptDetails.contributors && manuscriptDetails.contributors.length > 0 ? (
        <div className="space-y-3">
          {manuscriptDetails.contributors.map((c) => (
            <div key={c.id} className="border-l-2 border-emerald-600 pl-3 py-2">
              <p className="text-sm font-semibold text-slate-900">{c.name}</p>
              {c.email && <p className="text-xs text-slate-600">{c.email}</p>}
              {c.affiliation && <p className="text-xs text-slate-600">{c.affiliation}</p>}
              {c.contributor_role && <p className="text-xs text-emerald-700 font-medium">{c.contributor_role}</p>}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No contributors provided" />
      )}
    </div>
  );

  const renderManuscript = () => (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">Manuscript File</h3>
      {manuscriptDetails.files && manuscriptDetails.files.length > 0 ? (
        <div className="space-y-3">
          {manuscriptDetails.files
            .filter(f => f.file_type?.toLowerCase().includes('manuscript'))
            .map((f) => (
              <div key={f.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{f.file_name}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      {f.file_type} • {f.file_size}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Uploaded: {new Date(f.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                  {f.public_url && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewFile(f)}
                        className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition"
                        title="Preview file"
                      >
                        <Eye className="w-4 h-4" />
                        Preview
                      </button>
                      <a
                        href={f.public_url}
                        download={f.file_name}
                        className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-800 transition"
                        title="Download file"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <EmptyState message="No manuscript file uploaded" />
      )}

      {latestRevisionNumber !== undefined && (
        <div className="mt-6 pt-6 border-t border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">
            Revision {latestRevisionNumber} File
          </h3>
          {revisionFiles.length > 0 ? (
            <div className="space-y-3">
              {revisionFiles.map((f) => (
                <div key={f.id} className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{f.name}</p>
                      <p className="text-xs text-slate-600 mt-1">{f.type} • {f.size}</p>
                      <p className="text-xs text-slate-500 mt-1">Uploaded: {f.date}</p>
                    </div>
                    {f.publicUrl && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPreviewFile({ file_name: f.name, public_url: f.publicUrl })}
                          className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition"
                          title="Preview file"
                        >
                          <Eye className="w-4 h-4" />
                          Preview
                        </button>
                        <a
                          href={f.publicUrl}
                          download={f.name}
                          className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-800 transition"
                          title="Download file"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No file uploaded for this revision yet" />
          )}
        </div>
      )}
    </div>
  );

  const renderReferences = () => (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">References</h3>
      {m?.references ? (
        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {m.references}
        </div>
      ) : (
        <EmptyState message="No references provided" />
      )}
    </div>
  );

  const renderSupplementary = () => {
    const suppFiles = (manuscriptDetails.files || []).filter(f => {
      if (!f.file_type) return false;
      const type = f.file_type.toLowerCase();
      return (
        type.includes('supplementary') ||
        type.includes('additional') ||
        type.includes('dataset') ||
        type.includes('data set') ||
        type.includes('figure') ||
        type.includes('appendix')
      );
    });
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">Supplementary Files</h3>
        {suppFiles.length > 0 ? (
          <div className="space-y-3">
            {suppFiles.map((f) => (
              <div key={f.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{f.file_name}</p>
                    <p className="text-xs text-slate-600 mt-1">{f.file_type} • {f.file_size}</p>
                  </div>
                  {f.public_url && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewFile(f)}
                        className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition"
                        title="Preview file"
                      >
                        <Eye className="w-4 h-4" />
                        Preview
                      </button>
                      <a
                        href={f.public_url}
                        download={f.file_name}
                        className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-800 transition"
                        title="Download file"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No supplementary files" />
        )}
      </div>
    );
  };

  const renderCoverLetter = () => (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">Cover Letter</h3>
      {m?.cover_letter ? (
        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {m.cover_letter}
        </div>
      ) : (
        <EmptyState message="No cover letter provided" />
      )}
    </div>
  );

  const renderMetadata = () => (
    <div className="space-y-4">
      {m?.keywords && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Keywords</h3>
          <p className="text-sm text-slate-700">{m.keywords}</p>
        </div>
      )}
      {m?.language && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Language</h3>
          <p className="text-sm text-slate-700">{m.language}</p>
        </div>
      )}
      {m?.word_count && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Word Count</h3>
          <p className="text-sm text-slate-700">{m.word_count}</p>
        </div>
      )}
      {!m?.keywords && !m?.language && !m?.word_count && (
        <EmptyState message="No metadata available" />
      )}
    </div>
  );

  const renderCopyediting = () => (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">Copyediting Status</h3>
      {m?.status === 'ACCEPTED' ? (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900 font-medium">Copyediting in preparation</p>
            <p className="text-xs text-blue-700 mt-1">Manuscript has been accepted. Copyediting will begin soon.</p>
          </div>
        </div>
      ) : (
        <EmptyState message="Copyediting has not started yet" />
      )}
    </div>
  );

  const renderProduction = () => (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">Production Status</h3>
      {m?.production_stage ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">Status: {m.production_stage}</p>
          {m.production_stage === 'SENT_TO_PUBLISHER' && (
            <p className="text-sm text-slate-700">Manuscript has been sent to the publisher for production.</p>
          )}
          {m.production_stage === 'PUBLISHED' && (
            <p className="text-sm text-slate-700">Manuscript is published.</p>
          )}
        </div>
      ) : (
        <EmptyState message="No production stage available" />
      )}
    </div>
  );

  const renderGalleys = () => {
    const galleyFiles = (manuscriptDetails.files || []).filter(f =>
      f.file_type?.toLowerCase().includes('galley')
    );
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">Galley Files</h3>
        {galleyFiles.length > 0 ? (
          <div className="space-y-3">
            {galleyFiles.map((f) => (
              <div key={f.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{f.file_name}</p>
                    <p className="text-xs text-slate-600 mt-1">{f.file_type} • {f.file_size}</p>
                  </div>
                  {f.public_url && (
                    <a href={f.public_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-700 hover:underline">
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No galley files available" />
        )}
      </div>
    );
  };

  const renderPublicationDetails = () => (
    <div className="space-y-4">
      {m?.doi || m?.volume || m?.issue || m?.published_at ? (
        <>
          {m?.doi && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-2">DOI</h3>
              <p className="text-sm text-slate-700 font-mono">{m.doi}</p>
            </div>
          )}
          {m?.volume && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Volume</h3>
              <p className="text-sm text-slate-700">{m.volume}</p>
            </div>
          )}
          {m?.issue && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Issue</h3>
              <p className="text-sm text-slate-700">{m.issue}</p>
            </div>
          )}
          {m?.published_at && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Published Date</h3>
              <p className="text-sm text-slate-700">{new Date(m.published_at).toLocaleDateString()}</p>
            </div>
          )}
        </>
      ) : (
        <EmptyState message="Publication details are not yet available" />
      )}
    </div>
  );

  const renderOverview = () => (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">Submission Overview</h3>
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-slate-900 mb-2">{m?.title || 'Untitled Manuscript'}</p>
          <p className="text-xs text-slate-600">Manuscript ID: {m?.id}</p>
          <p className="text-xs text-slate-600 mt-1">Status: <span className="font-semibold text-emerald-700">{m?.status || 'Not submitted'}</span></p>
          <p className="text-xs text-slate-600 mt-1">Submitted: {m?.submitted_at ? new Date(m.submitted_at).toLocaleDateString() : 'Not yet submitted'}</p>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          Use the navigation menu on the left to view and edit different sections of your submission, including content, publication details, and more.
        </p>
      </div>
    </div>
  );

  const renderSubmissionTimeline = () => (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-6 uppercase tracking-wide">Submission Timeline</h3>
      <div className="space-y-4">
        {manuscriptDetails?.statusHistory && manuscriptDetails.statusHistory.length > 0 ? (
          manuscriptDetails.statusHistory.map((event, idx) => (
            <div key={event.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  idx === 0 ? 'bg-emerald-600 border-emerald-600' : 'bg-slate-100 border-slate-300'
                }`}>
                  {idx === 0 && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
                {idx < (manuscriptDetails.statusHistory?.length ?? 0) - 1 && (
                  <div className="w-0.5 h-8 bg-slate-200 mt-2" />
                )}
              </div>
              <div className="pb-4 flex-1">
                <p className="font-semibold text-slate-900">{event.to_status?.replace(/_/g, ' ')}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {new Date(event.created_at).toLocaleString()}
                </p>
                {event.note && <p className="text-xs text-slate-600 mt-2">{event.note}</p>}
              </div>
            </div>
          ))
        ) : (
          <p className="text-slate-500 text-sm">No timeline events yet</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-grow flex flex-col p-6 overflow-y-auto">
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'submission_timeline' && renderSubmissionTimeline()}
      {activeTab === 'title_abstract' && renderTitleAbstract()}
      {activeTab === 'authors' && renderAuthors()}
      {activeTab === 'manuscript' && renderManuscript()}
      {activeTab === 'references' && renderReferences()}
      {activeTab === 'supplementary' && renderSupplementary()}
      {activeTab === 'cover_letter' && renderCoverLetter()}
      {activeTab === 'discussions' && manuscriptDetails && (
        <DiscussionsTab
          manuscriptId={manuscriptDetails.manuscript.id}
          discussions={manuscriptDetails.discussions}
          currentUserId={currentUserId}
          profiles={Object.fromEntries(manuscriptDetails.profiles)}
          onMessageSent={onRefreshData}
        />
      )}
      {activeTab === 'metadata' && renderMetadata()}
      {activeTab === 'copyediting' && renderCopyediting()}
      {activeTab === 'production' && renderProduction()}
      {activeTab === 'galleys' && renderGalleys()}
      {activeTab === 'publication_details' && renderPublicationDetails()}

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          isOpen={true}
          onClose={() => setPreviewFile(null)}
          fileName={previewFile.file_name}
          fileType={previewFile.file_type}
          fileSize={previewFile.file_size}
          publicUrl={previewFile.public_url}
        />
      )}
    </div>
  );
}
