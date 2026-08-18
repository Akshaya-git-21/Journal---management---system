import React from 'react';
import { AuthorManuscriptDetails } from '../lib/authorManuscriptDetails';
import { FileText, Users, Layers, AlertCircle } from 'lucide-react';

interface ViewSubmissionContentProps {
  activeTab: string;
  manuscriptDetails: AuthorManuscriptDetails | null;
}

export default function ViewSubmissionContent({
  activeTab,
  manuscriptDetails
}: ViewSubmissionContentProps) {
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
                    <a href={f.public_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-700 hover:underline">
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <EmptyState message="No manuscript file uploaded" />
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
    const suppFiles = (manuscriptDetails.files || []).filter(f =>
      f.file_type?.toLowerCase().includes('supplementary') ||
      f.file_type?.toLowerCase().includes('additional')
    );
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
                    <a href={f.public_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-700 hover:underline">
                      View
                    </a>
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

  return (
    <div className="flex-grow flex flex-col p-6 overflow-y-auto">
      {activeTab === 'title_abstract' && renderTitleAbstract()}
      {activeTab === 'authors' && renderAuthors()}
      {activeTab === 'manuscript' && renderManuscript()}
      {activeTab === 'references' && renderReferences()}
      {activeTab === 'supplementary' && renderSupplementary()}
      {activeTab === 'cover_letter' && renderCoverLetter()}
      {activeTab === 'metadata' && renderMetadata()}
      {activeTab === 'copyediting' && renderCopyediting()}
      {activeTab === 'production' && renderProduction()}
      {activeTab === 'galleys' && renderGalleys()}
      {activeTab === 'publication_details' && renderPublicationDetails()}
    </div>
  );
}
