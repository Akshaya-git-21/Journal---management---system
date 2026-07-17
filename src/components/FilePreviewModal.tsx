import React, { useState } from 'react';
import { 
  X, ZoomIn, ZoomOut, Download, FileText, ChevronLeft, ChevronRight, 
  RotateCw, RefreshCw, Folder, File, FolderOpen, Table, Image as ImageIcon, 
  Check, Printer, Search, FileSpreadsheet, Eye, Info, List
} from 'lucide-react';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileType?: string;
  fileSize?: string;
}

export default function FilePreviewModal({ 
  isOpen, 
  onClose, 
  fileName, 
  fileType = "Document",
  fileSize = "1.2 MB"
}: FilePreviewModalProps) {
  if (!isOpen) return null;

  const [zoom, setZoom] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [xlsxActiveTab, setXlsxActiveTab] = useState<string>('EXP_DATA');
  const [zipSelectedFile, setZipSelectedFile] = useState<string>('readme_first.txt');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Infer actual file extension/type
  const lowercaseName = fileName.toLowerCase();
  const isPdf = lowercaseName.endsWith('.pdf');
  const isDocx = lowercaseName.endsWith('.docx') || lowercaseName.endsWith('.doc');
  const isZip = lowercaseName.endsWith('.zip') || lowercaseName.endsWith('.rar');
  const isXlsx = lowercaseName.endsWith('.xlsx') || lowercaseName.endsWith('.xls') || lowercaseName.endsWith('.csv');
  const isImage = lowercaseName.endsWith('.png') || lowercaseName.endsWith('.jpg') || lowercaseName.endsWith('.jpeg') || lowercaseName.endsWith('.gif');

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  // Generate simulated file contents based on file extension
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-250">
      <div className="bg-slate-900 text-white rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-700/50">
        
        {/* Top Control Bar */}
        <header className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800/80 rounded-xl border border-slate-700/40">
              {isPdf && <FileText className="w-5 h-5 text-rose-500" />}
              {isDocx && <FileText className="w-5 h-5 text-blue-500" />}
              {isZip && <FolderOpen className="w-5 h-5 text-amber-500" />}
              {isXlsx && <FileSpreadsheet className="w-5 h-5 text-emerald-500" />}
              {isImage && <ImageIcon className="w-5 h-5 text-cyan-500" />}
              {!isPdf && !isDocx && !isZip && !isXlsx && !isImage && <FileText className="w-5 h-5 text-slate-400" />}
            </div>
            <div className="text-left">
              <h2 className="font-extrabold text-sm text-slate-100 tracking-tight flex items-center gap-2">
                {fileName}
                <span className="text-[10px] bg-slate-800 text-slate-350 border border-slate-700 font-mono px-2 py-0.5 rounded-full uppercase">
                  {fileType}
                </span>
              </h2>
              <p className="text-[10.5px] text-slate-400 font-mono font-medium mt-0.5">
                Simulated Document Workspace • {fileSize} • Read-Only Sandbox
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Contextual actions */}
            {(isPdf || isDocx) && (
              <div className="hidden sm:flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 mr-2">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-1 px-2 text-xs hover:bg-slate-700 disabled:opacity-40 rounded transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10.5px] font-mono px-2.5 text-slate-350">
                  Page {currentPage} of {isPdf ? '6' : '3'}
                </span>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(isPdf ? 6 : 3, prev + 1))}
                  disabled={currentPage === (isPdf ? 6 : 3)}
                  className="p-1 px-2 text-xs hover:bg-slate-700 disabled:opacity-40 rounded transition"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Zoom Controls */}
            {!isZip && (
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-slate-300">
                <button onClick={handleZoomOut} className="p-1.5 hover:bg-slate-750 hover:text-white rounded transition" title="Zoom Out">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono w-11 text-center select-none font-bold">{zoom}%</span>
                <button onClick={handleZoomIn} className="p-1.5 hover:bg-slate-750 hover:text-white rounded transition" title="Zoom In">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {isImage && (
              <button onClick={handleRotate} className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition" title="Rotate 90°">
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            )}

            <button 
              onClick={() => alert(`Simulating safe download of: ${fileName}`)}
              className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition flex items-center gap-1 text-[11px] font-bold"
              title="Download asset"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Download</span>
            </button>

            <button 
              onClick={onClose}
              className="p-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-200 rounded-lg border border-rose-900/40 transition"
              title="Close Preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Preview Container */}
        <div className="flex-grow flex overflow-hidden bg-slate-950/45 relative">
          
          {/* PDF/Word Sidebar Panel (Optional Thumbnail list) */}
          {(isPdf || isDocx) && isSidebarOpen && (
            <aside className="hidden lg:flex w-52 bg-slate-950 border-r border-slate-800 flex-col p-4 shrink-0 overflow-y-auto">
              <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Page Outlines</span>
                <List className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: isPdf ? 6 : 3 }).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentPage(idx + 1)}
                    className={`w-full p-2.5 rounded-xl border text-left transition flex flex-col gap-1.5 ${
                      currentPage === idx + 1 
                        ? 'border-emerald-600 bg-emerald-950/20 text-emerald-400' 
                        : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[9.5px] font-mono uppercase font-black">Page {idx + 1}</span>
                    <div className="h-10 bg-slate-950/60 rounded-md border border-slate-800/40 flex items-center justify-center">
                      <FileText className="w-4 h-4 opacity-35" />
                    </div>
                  </button>
                ))}
              </div>
            </aside>
          )}

          {/* Core Document Stage */}
          <main className="flex-grow overflow-auto p-8 flex justify-center items-start">
            
            <div 
              style={{ 
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease'
              }}
              className="w-full max-w-4xl shrink-0"
            >

              {/* ----------------- PDF VIEWER LAYOUT ----------------- */}
              {isPdf && (
                <div className="bg-white text-slate-800 p-12 sm:p-16 rounded-lg shadow-xl border border-slate-200 text-left min-h-[900px] leading-relaxed font-serif">
                  {/* Running Header */}
                  <div className="border-b border-slate-200 pb-3 mb-8 flex justify-between text-[10px] font-mono uppercase text-slate-400 font-extrabold tracking-wider">
                    <span>Journal of Medical Systems • Research Article</span>
                    <span>Received: June 2026</span>
                  </div>

                  {currentPage === 1 && (
                    <div className="animate-in fade-in duration-200">
                      <h1 className="text-3xl font-bold font-sans text-slate-900 tracking-tight leading-tight">
                        Deep Learning-Driven Segmentations of Thoracic Rib-Cages via Ambient Dense-Nets
                      </h1>
                      
                      <div className="my-6 text-sm font-sans text-slate-600 space-y-1">
                        <p className="font-bold text-slate-800">Akshaya G.<sup>1*</sup>, Dr. Ada Lovelace<sup>1</sup>, Dr. John Smith<sup>2</sup></p>
                        <p className="text-xs"><sup>1</sup> Department of Advanced Biomedical Intelligence, Stanford University, USA</p>
                        <p className="text-xs"><sup>2</sup> Clinical Radiology Center, Massachusetts General Hospital, USA</p>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl my-6 font-sans">
                        <h4 className="text-xs font-mono uppercase font-black text-[#008751] tracking-widest mb-2">Abstract</h4>
                        <p className="text-xs text-slate-700 leading-relaxed font-medium">
                          Accurate, non-invasive boundary detection of thoracic rib structures remains a foundational bottleneck in computer-aided pulmonary diagnostics and orthopedic trauma profiling. Traditional convolutional approaches often fail in high-density sternum zones due to overlapping soft tissues. In this manuscript, we present <i>RibDenseNet</i>, an ambient densely-connected neural architecture engineered specifically for low-contrast radiographic projection slicing. Using a custom clinical dataset of 4,200 chest CT scans, our methodology achieves an average Dice-Similarity Coefficient (DSC) of 0.942, demonstrating a 3.1% diagnostic enhancement over state-of-the-art UNet models.
                        </p>
                        <p className="text-[11px] text-slate-600 mt-3">
                          <b>Keywords:</b> Radiographic segmentation, Deep Learning, DenseNet, Thoracic Rib-Cages, Clinical CT.
                        </p>
                      </div>

                      <h3 className="text-lg font-bold font-sans text-slate-900 mt-8 mb-3 border-b pb-1">1. Introduction</h3>
                      <p className="text-[13px] text-slate-700 leading-relaxed text-justify">
                        Automated chest radiology interpretation plays a critical role in rapid triage systems. However, segmenting the skeletal framework remains complex due to the varying calcification stages across patient cohorts. Rib cage modeling provides the reference frame for cardiac position calculations and respiratory displacement curves. 
                      </p>
                      <p className="text-[13px] text-slate-700 leading-relaxed text-justify mt-3">
                        Prior investigations have utilized active shape models (ASM) and basic edge-filtering algorithms. While computationally lightweight, these heuristics suffer from high failure rates when structural fractures or metal bone stabilization plates are present. This work addresses these challenges by introducing a densely linked feature map stream.
                      </p>
                    </div>
                  )}

                  {currentPage === 2 && (
                    <div className="animate-in fade-in duration-200">
                      <h3 className="text-lg font-bold font-sans text-slate-900 mb-3 border-b pb-1">2. Methodology</h3>
                      <p className="text-[13px] text-slate-700 leading-relaxed text-justify">
                        Our model architecture, <i>RibDenseNet</i>, utilizes feed-forward dense connectivity. Let <i>x<sub>l</sub></i> represent the output of the <i>l</i>-th layer. The transformation is expressed via recursive activation cascades:
                      </p>
                      
                      <div className="my-6 bg-slate-50 p-4 rounded-lg font-mono text-xs text-center border">
                        x<sub>l</sub> = H<sub>l</sub>([x<sub>0</sub>, x<sub>1</sub>, ..., x<sub>l-1</sub>])
                      </div>

                      <p className="text-[13px] text-slate-700 leading-relaxed text-justify">
                        Where [x<sub>0</sub>, x<sub>1</sub>, ...] refers to the concatenation of feature maps generated in layers 0, 1, ..., l-1, and H<sub>l</sub> represents a composite operation of Batch Normalization, Rectified Linear Units (ReLU), and 3x3 convolution operators.
                      </p>

                      <h4 className="text-sm font-bold font-sans text-slate-800 mt-6 mb-2">2.1 Network Hyperparameters</h4>
                      <p className="text-[13px] text-slate-700 leading-relaxed text-justify">
                        To maintain gradient stability during backpropagation, we implement standard dropout rates of 0.2 across all dense blocks. The bottleneck blocks generate a growth rate of k=32. Optimization is driven via the Adam optimizer with initial learning rate &eta; = 10<sup>-4</sup>.
                      </p>
                    </div>
                  )}

                  {currentPage >= 3 && (
                    <div className="animate-in fade-in duration-200">
                      <h3 className="text-lg font-bold font-sans text-slate-900 mb-3 border-b pb-1">Page {currentPage}</h3>
                      <p className="text-[13px] text-slate-700 leading-relaxed text-justify">
                        [SIMULATED ACADEMIC TEXT CONTENT]
                      </p>
                      <p className="text-[13px] text-slate-700 leading-relaxed text-justify mt-3">
                        Continued theoretical discussion and secondary research proof sheets. Detailed performance breakdowns demonstrate high correlation coefficients across clinical benchmarks. Cross-validation indices indicate strong reproducibility in independent patient cohorts.
                      </p>

                      {currentPage === 4 && (
                        <div className="mt-6 border p-4 rounded-lg bg-slate-50 text-xs">
                          <h4 className="font-bold text-slate-800 mb-2">Table 2: Comparison of mean segment boundaries</h4>
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b font-bold text-slate-600">
                                <th className="p-1.5 text-left">Model Variant</th>
                                <th className="p-1.5 text-right">Dice Score</th>
                                <th className="p-1.5 text-right">Jaccard Ind.</th>
                                <th className="p-1.5 text-right">Inference (ms)</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b">
                                <td className="p-1.5">Classic UNet</td>
                                <td className="p-1.5 text-right">0.891</td>
                                <td className="p-1.5 text-right">0.812</td>
                                <td className="p-1.5 text-right">45 ms</td>
                              </tr>
                              <tr className="border-b">
                                <td className="p-1.5">Attention UNet</td>
                                <td className="p-1.5 text-right">0.915</td>
                                <td className="p-1.5 text-right">0.843</td>
                                <td className="p-1.5 text-right">62 ms</td>
                              </tr>
                              <tr className="border-b font-bold text-emerald-700 bg-emerald-50/50">
                                <td className="p-1.5">RibDenseNet (Ours)</td>
                                <td className="p-1.5 text-right">0.942</td>
                                <td className="p-1.5 text-right">0.895</td>
                                <td className="p-1.5 text-right">38 ms</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="mt-12 text-[11px] text-slate-400 font-sans border-t pt-4">
                        * Corresponding author: akshaya.g@stanford.edu
                      </div>
                    </div>
                  )}

                  {/* Footnote / Page Count footer */}
                  <div className="mt-16 border-t border-slate-100 pt-3 flex justify-between text-[10px] font-mono text-slate-400">
                    <span>Stanford Biomedical AI Lab</span>
                    <span>Page {currentPage} of 6</span>
                  </div>
                </div>
              )}


              {/* ----------------- WORD DOCUMENT LAYOUT ----------------- */}
              {isDocx && (
                <div className="bg-white text-slate-800 p-12 sm:p-16 rounded-lg shadow-xl border border-slate-350 text-left min-h-[850px] leading-relaxed font-sans">
                  {/* Word-style blue banner at top */}
                  <div className="bg-blue-800 text-white p-3 -mx-12 sm:-mx-16 -mt-12 sm:-mt-16 mb-8 flex items-center justify-between text-xs font-mono rounded-t-lg">
                    <span className="font-extrabold flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-white" />
                      MICROSOFT WORD - COMPATIBILITY LAYOUT
                    </span>
                    <span>EDITING IS LOCKED</span>
                  </div>

                  {currentPage === 1 && (
                    <div className="animate-in fade-in duration-200">
                      <h1 className="text-2xl font-bold text-blue-900 border-b pb-1.5 mb-4">
                        Experimental Figures & Flow Diagrams
                      </h1>
                      <p className="text-xs text-slate-500 mb-6 italic">
                        Document reference: EX_FIG_V2.DOCX • Status: FINALIZED • Checked on 08 Jun 2026
                      </p>

                      <p className="text-sm text-slate-700">
                        This supplemental file contains the core visual assets, flowchart definitions, and diagnostic tables referenced in Section 3 of the main submission.
                      </p>

                      <div className="my-8 p-6 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center">
                        <span className="text-[10px] font-mono text-slate-400 font-bold mb-4 uppercase">Figure 1: Ambient Convolution Dense Blocks Connection Topology</span>
                        
                        {/* Interactive Vector Graphic */}
                        <svg viewBox="0 0 500 120" className="w-full max-w-lg">
                          {/* Node 1 */}
                          <rect x="10" y="30" width="80" height="40" rx="5" fill="#f8fafc" stroke="#334155" strokeWidth="2" />
                          <text x="50" y="55" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#0f172a">Layer x0</text>
                          
                          {/* Arrow 1 */}
                          <path d="M 90 50 L 140 50" stroke="#475569" strokeWidth="2" fill="none" />
                          <polygon points="140,50 133,46 133,54" fill="#475569" />

                          {/* Node 2 */}
                          <rect x="140" y="30" width="80" height="40" rx="5" fill="#e2e8f0" stroke="#0284c7" strokeWidth="2" />
                          <text x="180" y="55" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#0369a1">Layer x1 (Conv)</text>

                          {/* Dense Link */}
                          <path d="M 50 30 Q 135 5 180 30" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
                          <polygon points="180,30 172,25 177,33" fill="#f43f5e" />

                          {/* Arrow 2 */}
                          <path d="M 220 50 L 270 50" stroke="#475569" strokeWidth="2" fill="none" />
                          <polygon points="270,50 263,46 263,54" fill="#475569" />

                          {/* Node 3 */}
                          <rect x="270" y="30" width="80" height="40" rx="5" fill="#f1f5f9" stroke="#10b981" strokeWidth="2" />
                          <text x="310" y="55" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#047857">Layer x2 (Conv)</text>

                          {/* Double Dense Link */}
                          <path d="M 50 70 Q 180 115 310 70" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
                          <polygon points="310,70 306,75 301,69" fill="#f43f5e" />
                        </svg>

                        <p className="text-xs text-slate-500 mt-4 text-center max-w-md">
                          <b>Figure 1:</b> Recursive dense feedback loops. Dotted red curves illustrate direct connection bypass pathways preserving original input gradients.
                        </p>
                      </div>
                    </div>
                  )}

                  {currentPage >= 2 && (
                    <div className="animate-in fade-in duration-200">
                      <h2 className="text-xl font-bold text-blue-900 border-b pb-1.5 mb-4">
                        Page {currentPage}: Supplemental Charts
                      </h2>
                      <p className="text-sm text-slate-700">
                        The charts demonstrate deep neural layer stability under extreme radiographic noise environments (simulating high-radiation exposure artifacts).
                      </p>

                      <div className="my-8 p-6 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center">
                        <span className="text-[10px] font-mono text-slate-400 font-bold mb-4 uppercase">Figure 2: Training Convergence Curve (Loss vs Epochs)</span>
                        
                        <div className="w-full max-w-md h-40 flex items-end justify-between border-b border-l border-slate-350 p-4 relative">
                          <span className="absolute -left-6 top-0 text-[9px] font-mono text-slate-400 font-bold">1.0</span>
                          <span className="absolute -left-6 bottom-0 text-[9px] font-mono text-slate-400 font-bold">0.0</span>
                          
                          {/* Simple bar visual to represent a chart curve */}
                          <div className="w-3 bg-red-400 h-full rounded-t-sm" title="Epoch 1: Loss 0.95" />
                          <div className="w-3 bg-red-400 h-[85%] rounded-t-sm" />
                          <div className="w-3 bg-red-400 h-[65%] rounded-t-sm" />
                          <div className="w-3 bg-red-450 h-[45%] rounded-t-sm" />
                          <div className="w-3 bg-red-450 h-[30%] rounded-t-sm" />
                          <div className="w-3 bg-red-500 h-[22%] rounded-t-sm" />
                          <div className="w-3 bg-red-500 h-[15%] rounded-t-sm" />
                          <div className="w-3 bg-emerald-600 h-[8%] rounded-t-sm" title="Epoch 100: Loss 0.08" />
                          <div className="w-3 bg-emerald-600 h-[5%] rounded-t-sm" />
                        </div>
                        <div className="w-full max-w-md flex justify-between text-[9px] text-slate-400 font-mono mt-2 px-1">
                          <span>Epoch 0</span>
                          <span>Epoch 50</span>
                          <span>Epoch 100</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}


              {/* ----------------- SPREADSHEET (EXCEL) VIEWER ----------------- */}
              {isXlsx && (
                <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-left overflow-hidden">
                  
                  {/* Excel Top Menu Bar */}
                  <div className="bg-emerald-800 text-white p-3 border-b border-emerald-900 flex items-center justify-between text-xs">
                    <span className="font-extrabold flex items-center gap-1.5 font-mono">
                      <FileSpreadsheet className="w-4.5 h-4.5 text-white" />
                      MICROSOFT EXCEL ONLINE - READ-ONLY VIEW
                    </span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setXlsxActiveTab('EXP_DATA')}
                        className={`px-3 py-1 rounded font-bold text-[11px] transition ${
                          xlsxActiveTab === 'EXP_DATA' ? 'bg-emerald-950 text-emerald-200 border border-emerald-700' : 'hover:bg-emerald-750'
                        }`}
                      >
                        Experimental Data
                      </button>
                      <button 
                        onClick={() => setXlsxActiveTab('METRICS')}
                        className={`px-3 py-1 rounded font-bold text-[11px] transition ${
                          xlsxActiveTab === 'METRICS' ? 'bg-emerald-950 text-emerald-200 border border-emerald-700' : 'hover:bg-emerald-750'
                        }`}
                      >
                        Model Metrics
                      </button>
                    </div>
                  </div>

                  {/* Formula Bar */}
                  <div className="bg-slate-950 border-b border-slate-800 p-2 text-xs flex items-center gap-2 font-mono">
                    <span className="bg-slate-800 border border-slate-700 text-slate-400 px-2.5 py-0.5 rounded text-[10px] font-black">fx</span>
                    <input 
                      type="text" 
                      readOnly 
                      value={xlsxActiveTab === 'EXP_DATA' ? "=AVERAGE(D2:D11) [Result: 94.2%]" : "=STDEV(C2:C5) [Result: 0.015]"}
                      className="bg-slate-900/40 border border-slate-800 rounded px-2.5 py-0.5 text-slate-300 w-full text-[11px] outline-none"
                    />
                  </div>

                  {/* Spreadsheet Grid */}
                  <div className="overflow-x-auto bg-slate-950">
                    <table className="w-full border-collapse font-mono text-[11px]">
                      <thead>
                        <tr className="bg-slate-900 text-slate-400 select-none">
                          <th className="border border-slate-800 p-1.5 text-center w-10"></th>
                          <th className="border border-slate-800 p-1.5 text-left w-24">A</th>
                          <th className="border border-slate-800 p-1.5 text-left w-36">B</th>
                          <th className="border border-slate-800 p-1.5 text-right w-28">C</th>
                          <th className="border border-slate-800 p-1.5 text-right w-28">D</th>
                          <th className="border border-slate-800 p-1.5 text-center w-28">E</th>
                        </tr>
                      </thead>
                      <tbody>
                        {xlsxActiveTab === 'EXP_DATA' ? (
                          [
                            { id: "SampleID", colA: "PATIENT_001", colB: "Lobar Segment 1A", colC: "3.24 MB", colD: "0.941", colE: "VALIDATED" },
                            { id: "PATIENT_002", colA: "PATIENT_002", colB: "Posterior S2", colC: "4.15 MB", colD: "0.952", colE: "VALIDATED" },
                            { id: "PATIENT_003", colA: "PATIENT_003", colB: "Anterior S3", colC: "2.89 MB", colD: "0.923", colE: "FLAGGED_LOW" },
                            { id: "PATIENT_004", colA: "PATIENT_004", colB: "Lateral S4", colC: "3.90 MB", colD: "0.961", colE: "VALIDATED" },
                            { id: "PATIENT_005", colA: "PATIENT_005", colB: "Medial S5", colC: "3.42 MB", colD: "0.938", colE: "VALIDATED" },
                            { id: "PATIENT_006", colA: "PATIENT_006", colB: "Apical S6", colC: "4.01 MB", colD: "0.947", colE: "VALIDATED" },
                            { id: "PATIENT_007", colA: "PATIENT_007", colB: "Medial Basal S7", colC: "2.12 MB", colD: "0.919", colE: "VALIDATED" },
                            { id: "PATIENT_008", colA: "PATIENT_008", colB: "Ant. Basal S8", colC: "3.55 MB", colD: "0.944", colE: "VALIDATED" },
                          ].map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-900 border-b border-slate-900">
                              <td className="bg-slate-900 text-slate-400 p-1.5 border border-slate-800 text-center select-none font-bold">{idx + 1}</td>
                              <td className="border border-slate-800 p-1.5 text-slate-300 font-bold">{row.colA}</td>
                              <td className="border border-slate-800 p-1.5 text-slate-400">{row.colB}</td>
                              <td className="border border-slate-800 p-1.5 text-slate-400 text-right">{row.colC}</td>
                              <td className="border border-slate-800 p-1.5 text-right font-black text-emerald-400 bg-emerald-950/20">{row.colD}</td>
                              <td className="border border-slate-800 p-1.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  row.colE === 'VALIDATED' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                                }`}>
                                  {row.colE}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          [
                            { metric: "Dice Similarity", val: "0.942", min: "0.912", max: "0.968", std: "0.015" },
                            { metric: "Jaccard Index", val: "0.895", min: "0.854", max: "0.923", std: "0.021" },
                            { metric: "Sensitivity", val: "0.958", min: "0.931", max: "0.982", std: "0.011" },
                            { metric: "Specificity", val: "0.989", min: "0.978", max: "0.995", std: "0.004" },
                          ].map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-900 border-b border-slate-900">
                              <td className="bg-slate-900 text-slate-400 p-1.5 border border-slate-800 text-center select-none font-bold">{idx + 1}</td>
                              <td className="border border-slate-800 p-1.5 text-slate-300 font-bold">{row.metric}</td>
                              <td className="border border-slate-800 p-1.5 text-right text-emerald-400 font-black">{row.val}</td>
                              <td className="border border-slate-800 p-1.5 text-right text-slate-400">{row.min}</td>
                              <td className="border border-slate-800 p-1.5 text-right text-slate-400">{row.max}</td>
                              <td className="border border-slate-800 p-1.5 text-center text-slate-400">{row.std}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Worksheet tabs at bottom */}
                  <footer className="bg-slate-950 p-2.5 border-t border-slate-800 text-[10.5px] text-slate-400 flex items-center gap-3">
                    <span className="font-bold uppercase tracking-wider text-slate-500 font-mono">Worksheets:</span>
                    <button className="bg-slate-850 hover:bg-slate-800 text-slate-300 px-3 py-1 rounded font-bold border border-slate-700/50">
                      Sheet 1 - Raw Clinical Datasets
                    </button>
                    <button className="hover:bg-slate-900 text-slate-500 px-3 py-1 rounded font-bold">
                      Sheet 2 - Graphs Data
                    </button>
                  </footer>
                </div>
              )}


              {/* ----------------- ZIP FILE EXPLORER ----------------- */}
              {isZip && (
                <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-left overflow-hidden">
                  
                  {/* WINZIP Header */}
                  <div className="bg-amber-850 text-white p-3 border-b border-amber-900 flex items-center justify-between text-xs">
                    <span className="font-extrabold flex items-center gap-1.5 font-mono">
                      <FolderOpen className="w-4.5 h-4.5 text-white animate-pulse" />
                      SECURE ARCHIVE EXTRACTOR - SANDBOX CONTEXT
                    </span>
                    <span className="text-[10px] font-mono bg-amber-950 text-amber-200 border border-amber-800 px-2 py-0.5 rounded">
                      ROOT ARCHIVE
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 min-h-[400px]">
                    
                    {/* Zip Directory Tree */}
                    <aside className="border-r border-slate-800 bg-slate-950 p-4 space-y-2">
                      <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-widest font-mono">Archive Structure</span>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2 text-amber-400 font-bold p-1">
                          <FolderOpen className="w-4 h-4" />
                          <span>Supplementary.zip</span>
                        </div>
                        <div className="pl-6 space-y-1">
                          {[
                            { name: "readme_first.txt", icon: FileText },
                            { name: "raw_simulation_log.csv", icon: Table },
                            { name: "model_inference.py", icon: FileText },
                            { name: "calibration_data.json", icon: File },
                          ].map((item, idx) => (
                            <button
                              key={idx}
                              onClick={() => setZipSelectedFile(item.name)}
                              className={`w-full flex items-center gap-2 p-1.5 rounded transition text-left ${
                                zipSelectedFile === item.name 
                                  ? 'bg-amber-950/40 text-amber-400 font-bold border-l-2 border-amber-500' 
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                              }`}
                            >
                              <item.icon className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{item.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </aside>

                    {/* File Content Previewer Pane */}
                    <main className="md:col-span-2 bg-slate-950/80 p-5 flex flex-col justify-between">
                      <div>
                        <div className="border-b border-slate-800 pb-2.5 mb-4 flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-300 flex items-center gap-1.5 font-mono">
                            <File className="w-4 h-4 text-slate-500" />
                            File Content: <b className="text-amber-400">{zipSelectedFile}</b>
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">Sandbox Buffer</span>
                        </div>

                        <div className="bg-slate-950 border border-slate-850 p-4 rounded-lg font-mono text-xs text-slate-350 min-h-[220px] max-h-[300px] overflow-y-auto leading-relaxed">
                          {zipSelectedFile === 'readme_first.txt' && (
                            <div className="space-y-2 text-justify">
                              <p className="text-amber-400"># RibDenseNet Supplementary Datasets Archive</p>
                              <p className="text-[11px] text-slate-400">Author: Akshaya G • Date: June 2026</p>
                              <p className="mt-4">This folder contains the calibration scripts, sample CSV outputs, and hyperparameter logs required to run RibDenseNet locally.</p>
                              <p>Prerequisites: Python 3.10+, PyTorch 2.1+, CUDA 12.1.</p>
                            </div>
                          )}
                          {zipSelectedFile === 'raw_simulation_log.csv' && (
                            <table className="w-full text-[10px] border-collapse">
                              <thead>
                                <tr className="border-b border-slate-800 text-slate-500 text-left">
                                  <th className="p-1">Epoch</th>
                                  <th className="p-1">Loss_Train</th>
                                  <th className="p-1">Loss_Val</th>
                                  <th className="p-1">DSC_Score</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr><td className="p-1">0</td><td className="p-1">1.2402</td><td className="p-1">1.1921</td><td className="p-1">0.452</td></tr>
                                <tr><td className="p-1">10</td><td className="p-1">0.5210</td><td className="p-1">0.5401</td><td className="p-1">0.781</td></tr>
                                <tr><td className="p-1">20</td><td className="p-1">0.2190</td><td className="p-1">0.2450</td><td className="p-1">0.892</td></tr>
                                <tr><td className="p-1">50</td><td className="p-1">0.0984</td><td className="p-1">0.1102</td><td className="p-1">0.938</td></tr>
                                <tr className="text-amber-400"><td className="p-1">100</td><td className="p-1">0.0341</td><td className="p-1">0.0521</td><td className="p-1">0.942</td></tr>
                              </tbody>
                            </table>
                          )}
                          {zipSelectedFile === 'model_inference.py' && (
                            <pre className="text-cyan-400 text-[10.5px]">
{`import torch
import torch.nn as nn
from model import RibDenseNet

def run_segmentation(radiograph_tensor):
    # Initialize our DenseNet weights
    model = RibDenseNet(growth_rate=32, num_classes=1)
    model.load_state_dict(torch.load("weights.pt"))
    model.eval()
    
    with torch.no_grad():
        output = model(radiograph_tensor)
        probabilities = torch.sigmoid(output)
        return (probabilities > 0.5).float()
`}
                            </pre>
                          )}
                          {zipSelectedFile === 'calibration_data.json' && (
                            <pre className="text-amber-300 text-[10.5px]">
{`{
  "dataset_version": "1.4.2",
  "num_radiographs": 4200,
  "normalization_mean": [0.485, 0.456, 0.406],
  "normalization_std": [0.229, 0.224, 0.225],
  "augmentation_flips_enabled": true,
  "affine_translations_range": 0.15
}`}
                            </pre>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-slate-800 pt-3 flex justify-between items-center">
                        <span className="text-[10.5px] text-slate-500 font-bold">File weight: {zipSelectedFile === 'readme_first.txt' ? '8.4 KB' : '1.4 MB'}</span>
                        <button 
                          onClick={() => alert(`Simulating safe extraction of: ${zipSelectedFile}`)}
                          className="bg-amber-600 hover:bg-amber-500 text-slate-900 px-3.5 py-1 rounded text-[10.5px] font-black tracking-wide transition cursor-pointer"
                        >
                          Extract Single File
                        </button>
                      </div>
                    </main>

                  </div>
                </div>
              )}


              {/* ----------------- IMAGE VIEWER ----------------- */}
              {isImage && (
                <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-center p-8 overflow-hidden flex flex-col items-center">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-4">Aesthetic Diagram Previewer</span>
                  
                  {/* Generates a gorgeous visual block-diagram using SVG */}
                  <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 w-full max-w-xl shadow-inner my-3 flex items-center justify-center">
                    <svg viewBox="0 0 400 300" className="w-full">
                      {/* Definitions for arrow markers */}
                      <defs>
                        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
                        </marker>
                      </defs>

                      <rect x="0" y="0" width="400" height="300" rx="15" fill="#030712" />
                      
                      {/* Header title */}
                      <text x="200" y="30" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#34d399" letterSpacing="1">METHODOLOGY PIPELINE FLOW</text>
                      
                      {/* Block 1 */}
                      <rect x="30" y="70" width="100" height="40" rx="8" fill="#1e1b4b" stroke="#4f46e5" strokeWidth="1.5" />
                      <text x="80" y="94" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#c7d2fe">1. Image Input</text>
                      <text x="80" y="104" textAnchor="middle" fontSize="7" fill="#818cf8">Chest Radiographs</text>

                      {/* Connection 1 */}
                      <path d="M 130 90 L 174 90" stroke="#10b981" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />

                      {/* Block 2 */}
                      <rect x="180" y="70" width="100" height="40" rx="8" fill="#062f4f" stroke="#0284c7" strokeWidth="1.5" />
                      <text x="230" y="94" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#bae6fd">2. Dense-Net</text>
                      <text x="230" y="104" textAnchor="middle" fontSize="7" fill="#38bdf8">Recursive Connection</text>

                      {/* Connection 2 */}
                      <path d="M 280 90 L 324 90" stroke="#10b981" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />

                      {/* Block 3 */}
                      <rect x="180" y="170" width="100" height="40" rx="8" fill="#022c22" stroke="#059669" strokeWidth="1.5" />
                      <text x="230" y="194" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#a7f3d0">4. Refinement</text>
                      <text x="230" y="204" textAnchor="middle" fontSize="7" fill="#34d399">Morphological Fill</text>

                      {/* Connection 3 (Diagonal) */}
                      <path d="M 330 110 L 280 166" stroke="#10b981" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />

                      {/* Block 4 */}
                      <rect x="290" y="70" width="80" height="40" rx="8" fill="#581c0c" stroke="#ea580c" strokeWidth="1.5" />
                      <text x="330" y="94" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#ffedd5">3. Prediction</text>
                      <text x="330" y="104" textAnchor="middle" fontSize="7" fill="#f97316">Boundary Softmax</text>

                      {/* Connection 4 */}
                      <path d="M 180 190 L 136 190" stroke="#10b981" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />

                      {/* Block 5 */}
                      <rect x="30" y="170" width="100" height="40" rx="8" fill="#14532d" stroke="#15803d" strokeWidth="1.5" />
                      <text x="80" y="194" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#bbf7d0">5. Output Segment</text>
                      <text x="80" y="204" textAnchor="middle" fontSize="7" fill="#4ade80">Rib-Cage Boundary</text>
                    </svg>
                  </div>

                  <p className="text-xs text-slate-400 mt-4 max-w-md">
                    <b>Vector Flow:</b> This high-res methodology schematic demonstrates recursive feeding between Dense-Net and prediction modules, finalized by morphological filters.
                  </p>
                </div>
              )}

            </div>
          </main>

        </div>

        {/* Footer info banner */}
        <footer className="bg-slate-950 px-5 py-3 border-t border-slate-800 text-[10.5px] text-slate-400 flex items-center justify-between shrink-0 font-mono">
          <span>Active Session ID: <b>SES-7047-921</b></span>
          <span className="text-emerald-400 flex items-center gap-1.5 font-bold">
            <Check className="w-3.5 h-3.5" />
            Verified Encrypted PDF/Doc Sandbox
          </span>
        </footer>

      </div>
    </div>
  );
}
