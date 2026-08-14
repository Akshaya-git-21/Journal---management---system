import { ManuscriptRow } from '../../../lib/workflow';

interface Props {
  manuscript: ManuscriptRow;
  contributors: any[];
}

export function ManuscriptTab({ manuscript, contributors }: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
      <div>
        <h3 className="text-sm font-black text-slate-900 mb-3">Title</h3>
        <p className="text-base text-slate-700">{manuscript.title}</p>
      </div>

      <div>
        <h3 className="text-sm font-black text-slate-900 mb-3">Abstract</h3>
        <p className="text-sm text-slate-700 leading-relaxed">{manuscript.abstract || 'No abstract provided'}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-black text-slate-900 mb-2">Keywords</h3>
          <p className="text-sm text-slate-700">{manuscript.keywords || 'Not provided'}</p>
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-900 mb-2">Manuscript Type</h3>
          <p className="text-sm text-slate-700">{manuscript.manuscript_type || 'Original Research'}</p>
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-900 mb-2">Section</h3>
          <p className="text-sm text-slate-700">{manuscript.section || 'General'}</p>
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-900 mb-2">Word Count</h3>
          <p className="text-sm text-slate-700">{manuscript.word_count || 'Not provided'}</p>
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-900 mb-2">Figures</h3>
          <p className="text-sm text-slate-700">{manuscript.num_figures || '0'}</p>
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-900 mb-2">Tables</h3>
          <p className="text-sm text-slate-700">{manuscript.num_tables || '0'}</p>
        </div>
      </div>

      {contributors.length > 0 && (
        <div>
          <h3 className="text-sm font-black text-slate-900 mb-3">Contributors</h3>
          <div className="space-y-3">
            {contributors.map((c, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3">
                <p className="font-semibold text-slate-900">{c.name}</p>
                <p className="text-xs text-slate-600">{c.contributor_role}</p>
                {c.affiliation && <p className="text-xs text-slate-600 mt-1">{c.affiliation}</p>}
                {c.email && <p className="text-xs text-slate-600">{c.email}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
