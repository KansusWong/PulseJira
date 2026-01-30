"use client";

import React, { useState, useEffect } from "react";
import { usePulseStore } from "@/store/usePulseStore";
import { 
  Edit2,
  Save,
  Download,
  Activity, 
  ArrowRight, 
  BrainCircuit, 
  CheckCircle2, 
  Circle, 
  Globe, 
  Layers, 
  Zap,
  Terminal,
  ShieldAlert,
  ShieldCheck,
  Scale,
  Sword,
  Construction,
  History,
  Plus,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

// --- Hooks ---

import jsPDF from 'jspdf';

const useHasMounted = () => {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);
  return hasMounted;
};

// --- Components ---

const Panel = ({ children, className, title, icon: Icon }: any) => (
  <div className={clsx("flex flex-col h-full border-r border-border bg-background last:border-r-0", className)}>
    <div className="h-12 border-b border-border flex items-center px-4 bg-paper/50 backdrop-blur-sm sticky top-0 z-10">
      {Icon && <Icon className="w-4 h-4 mr-2 text-zinc-500" />}
      <span className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase">{title}</span>
    </div>
    <div className="flex-1 overflow-y-auto p-4 relative">
      {children}
    </div>
  </div>
);

const SignalLog = () => {
  const logs = usePulseStore((s) => s.signals);
  const endRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const hasMounted = useHasMounted();
  if (!hasMounted) return null;

  return (
    <div className="font-mono text-xs space-y-2 text-green-500/80">
      <AnimatePresence>
        {logs.map((log, i) => (
          <motion.div 
            key={i} 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0 }}
            className="flex items-start"
          >
            <span className="mr-2 opacity-50 text-[10px]">{new Date().toLocaleTimeString()}</span>
            <span>{log}</span>
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={endRef} />
    </div>
  );
};

const PrepareCard = ({ onProceed }: { onProceed: () => void }) => {
  const result = usePulseStore((s) => s.prepareResult);
  const setPrepareResult = usePulseStore((s) => s.setPrepareResult);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(result);

  useEffect(() => {
    setEditForm(result);
  }, [result]);

  if (!result || !editForm) return null;

  const isProceed = editForm.decision === "PROCEED";

  const handleSave = () => {
    setPrepareResult(editForm);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditForm(result);
    setIsEditing(false);
  };

  const updateField = (path: string, value: any) => {
    const newData = JSON.parse(JSON.stringify(editForm));
    const parts = path.split('.');
    let current = newData;
    for (let i = 0; i < parts.length - 1; i++) {
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    setEditForm(newData);
  };

  return (
    <motion.div 
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="w-full bg-paper border border-border rounded-xl p-6 shadow-2xl relative overflow-hidden group space-y-6"
    >
      <div className={clsx("absolute top-0 left-0 w-full h-1", isProceed ? "bg-blue-500" : "bg-red-500")} />

      {/* Header: Arbitrator Decision */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-zinc-900 rounded-lg">
            <Scale className="w-6 h-6 text-yellow-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Arbitrator&apos;s Ruling</h2>
            {isEditing ? (
              <select 
                value={editForm.decision}
                onChange={(e) => updateField('decision', e.target.value)}
                className="mt-1 bg-black border border-zinc-700 rounded px-2 py-1 text-xs text-white"
              >
                <option value="PROCEED">PROCEED</option>
                <option value="CIRCUIT_BREAK">CIRCUIT_BREAK</option>
              </select>
            ) : (
              <div className={clsx("text-xs font-mono px-2 py-0.5 rounded inline-block mt-1", 
                isProceed ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
                {editForm.decision}
              </div>
            )}
          </div>
        </div>
        
        {/* Edit Controls */}
        <div className="flex space-x-2">
           {isEditing ? (
             <>
               <button onClick={handleCancel} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400">
                 <X className="w-4 h-4" />
               </button>
               <button onClick={handleSave} className="p-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 rounded-lg">
                 <Save className="w-4 h-4" />
               </button>
             </>
           ) : (
             <button onClick={() => setIsEditing(true)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400">
               <Edit2 className="w-4 h-4" />
             </button>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {/* Blue Team */}
        <div className="p-4 bg-blue-900/10 border border-blue-900/30 rounded-lg space-y-2 flex flex-col">
          <div className="flex items-center space-x-2 text-blue-400 mb-2">
            <Construction className="w-4 h-4" />
            <h3 className="font-bold uppercase text-xs">Blue Team (Builder)</h3>
          </div>
          {isEditing ? (
            <textarea 
              value={editForm.blue_case.proposal}
              onChange={(e) => updateField('blue_case.proposal', e.target.value)}
              className="flex-1 bg-black/50 border border-blue-900/30 rounded p-2 text-xs text-zinc-300 resize-none focus:outline-none focus:border-blue-500"
            />
          ) : (
            <p className="text-zinc-300 italic">&quot;{editForm.blue_case.proposal}&quot;</p>
          )}
          
          <div className="pt-2 border-t border-blue-900/30 text-xs text-blue-300 flex items-center justify-between">
            <span>Vision Alignment:</span>
            {isEditing ? (
              <input 
                type="number" 
                min="0" max="100"
                value={editForm.blue_case.vision_alignment_score}
                onChange={(e) => updateField('blue_case.vision_alignment_score', parseInt(e.target.value))}
                className="w-16 bg-black border border-blue-900/30 rounded px-1 text-right"
              />
            ) : (
              <span>{editForm.blue_case.vision_alignment_score}/100</span>
            )}
          </div>
        </div>

        {/* Red Team */}
        <div className="p-4 bg-red-900/10 border border-red-900/30 rounded-lg space-y-2 flex flex-col">
          <div className="flex items-center space-x-2 text-red-400 mb-2">
            <Sword className="w-4 h-4" />
            <h3 className="font-bold uppercase text-xs">Red Team (Critic)</h3>
          </div>
          {isEditing ? (
            <textarea 
              value={editForm.red_case.critique}
              onChange={(e) => updateField('red_case.critique', e.target.value)}
              className="flex-1 bg-black/50 border border-red-900/30 rounded p-2 text-xs text-zinc-300 resize-none focus:outline-none focus:border-red-500"
            />
          ) : (
            <p className="text-zinc-300 italic">&quot;{editForm.red_case.critique}&quot;</p>
          )}
          
          {(editForm.red_case.risks.length > 0 || isEditing) && (
             <div className="pt-2 border-t border-red-900/30">
                {isEditing ? (
                  <textarea 
                     value={editForm.red_case.risks.join('\n')}
                     onChange={(e) => updateField('red_case.risks', e.target.value.split('\n'))}
                     placeholder="Risks (one per line)"
                     className="w-full h-20 bg-black/50 border border-red-900/30 rounded p-2 text-xs text-red-300 resize-none focus:outline-none focus:border-red-500"
                  />
                ) : (
                  <ul className="list-disc list-inside text-xs text-red-300">
                    {editForm.red_case.risks.slice(0, 3).map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                )}
             </div>
          )}
        </div>
      </div>

      {/* Rationale */}
      <div className="text-sm text-zinc-400 bg-black/20 p-4 rounded-lg border border-border">
        <span className="font-bold text-zinc-300 block mb-1">Verdict Summary:</span>
        {isEditing ? (
          <textarea 
            value={editForm.arbitrator_rationale}
            onChange={(e) => updateField('arbitrator_rationale', e.target.value)}
            className="w-full h-20 bg-black/50 border border-zinc-700 rounded p-2 text-xs text-zinc-300 resize-none focus:outline-none focus:border-blue-500"
          />
        ) : (
          editForm.arbitrator_rationale
        )}
      </div>

      {!isEditing && (
        <button
          onClick={onProceed}
          className={clsx(
            "w-full flex items-center justify-center py-3 text-sm font-bold rounded-lg transition-all",
            isProceed
              ? "bg-white text-black hover:bg-zinc-200"
              : "bg-red-900/20 text-red-500 border border-red-900/50 hover:bg-red-900/30"
          )}
        >
          {isProceed ? (
            <>Generate PRD & Plan <ArrowRight className="w-4 h-4 ml-2" /></>
          ) : (
            <>Force Proceed (Override Circuit Breaker) <ShieldAlert className="w-4 h-4 ml-2" /></>
          )}
        </button>
      )}
    </motion.div>
  );
};

const FeatureCard = () => {
  const result = usePulseStore((s) => s.analysisResult);
  const deploy = usePulseStore((s) => s.deployToKanban);
  const [deployed, setDeployed] = useState(false);

  if (!result) return null;

  const handleDeploy = () => {
    deploy();
    setDeployed(true);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(22);
    doc.text(result.featureName, 20, 20);
    
    // Metadata
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Decision: ${result.decision}`, 20, 30);
    doc.text(`Confidence Score: ${result.score}%`, 20, 35);
    
    // Rationale
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Rationale & Overview", 20, 45);
    
    doc.setFontSize(11);
    doc.setTextColor(60);
    const splitText = doc.splitTextToSize(result.rationale, 170);
    doc.text(splitText, 20, 55);

    // If tasks exist, list them
    if (result.tasks && result.tasks.length > 0) {
       let yPos = 55 + (splitText.length * 5) + 10;
       
       doc.setFontSize(14);
       doc.setTextColor(0);
       doc.text("Planned Tasks", 20, yPos);
       yPos += 10;
       
       doc.setFontSize(10);
       doc.setTextColor(60);
       result.tasks.forEach((task: any, i: number) => {
         // Check for page break
         if (yPos > 270) {
           doc.addPage();
           yPos = 20;
         }
         doc.text(`${i + 1}. [${task.priority.toUpperCase()}] ${task.title}`, 20, yPos);
         yPos += 5;
         
         if (task.description) {
           const descText = doc.splitTextToSize(task.description, 160);
           doc.text(descText, 25, yPos);
           yPos += (descText.length * 4) + 5;
         } else {
           yPos += 5;
         }
       });
    }
    
    doc.save(`${result.featureName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_prd.pdf`);
  };

  return (
    <motion.div 
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="w-full bg-paper border border-border rounded-xl p-6 shadow-2xl relative overflow-hidden group"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-purple-600" />
      
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">{result.featureName}</h2>
          <div className="flex items-center mt-1 space-x-2">
            <span className={clsx(
              "text-xs px-2 py-0.5 rounded font-mono",
              result.decision === 'GO' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
            )}>
              {result.decision}
            </span>
            <span className="text-xs text-zinc-500">Confidence: {result.score}%</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleExportPDF}
            className="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-full border border-zinc-800 transition-colors"
            title="Export to PDF"
          >
            <Download className="w-5 h-5 text-zinc-400" />
          </button>
          <div className="p-2 bg-zinc-900 rounded-full border border-zinc-800">
            <BrainCircuit className="w-5 h-5 text-purple-500" />
          </div>
        </div>
      </div>

      <p className="text-sm text-zinc-400 leading-relaxed mb-6">
        {result.rationale}
      </p>

      <button
        onClick={handleDeploy}
        disabled={deployed}
        className={clsx(
          "w-full flex items-center justify-center py-3 text-sm font-bold rounded-lg transition-all",
          deployed 
            ? "bg-green-600/20 text-green-500 border border-green-600/50 cursor-default"
            : "bg-white text-black hover:bg-zinc-200"
        )}
      >
        {deployed ? (
          <>
            <CheckCircle2 className="w-4 h-4 mr-2" /> Deployed to Kanban
          </>
        ) : (
          <>
            Deploy Feature <ArrowRight className="w-4 h-4 ml-2" />
          </>
        )}
      </button>
    </motion.div>
  );
};

const KanbanColumn = ({ title, tasks }: { title: string, tasks: any[] }) => (
  <div className="min-w-[200px] bg-paper/30 border border-border rounded-lg flex flex-col mb-4">
    <div className="p-3 text-xs font-bold text-zinc-500 border-b border-border uppercase tracking-wide">
      {title} <span className="ml-1 opacity-50">({tasks.length})</span>
    </div>
    <div className="p-2 space-y-2">
      {tasks.map(task => (
        <motion.div 
          layoutId={task.id}
          key={task.id} 
          className="bg-black border border-border p-3 rounded text-sm hover:border-zinc-600 transition-colors cursor-move"
        >
          {task.title}
          <div className="mt-2 flex items-center justify-between">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[10px] text-zinc-600 font-mono">MVP-1</span>
          </div>
        </motion.div>
      ))}
      {tasks.length === 0 && (
        <div className="h-20 flex items-center justify-center text-zinc-700 text-xs italic">
          No tasks
        </div>
      )}
    </div>
  </div>
);

// --- New Components ---

const StartScreen = ({ onNew, onHistory }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl px-4">
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onNew}
      className="p-8 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:bg-zinc-800 hover:border-zinc-700 transition-all group text-left"
    >
      <div className="p-3 bg-blue-500/10 w-fit rounded-xl mb-4 group-hover:bg-blue-500/20 transition-colors">
        <Zap className="w-8 h-8 text-blue-500" />
      </div>
      <h3 className="text-xl font-bold mb-2 text-zinc-100">Create New Idea</h3>
      <p className="text-sm text-zinc-500">
        Start a new project from a raw idea or a competitor URL. The AI will analyze and plan it.
      </p>
    </motion.button>

    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onHistory}
      className="p-8 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:bg-zinc-800 hover:border-zinc-700 transition-all group text-left"
    >
      <div className="p-3 bg-purple-500/10 w-fit rounded-xl mb-4 group-hover:bg-purple-500/20 transition-colors">
        <History className="w-8 h-8 text-purple-500" />
      </div>
      <h3 className="text-xl font-bold mb-2 text-zinc-100">Continue History</h3>
      <p className="text-sm text-zinc-500">
        Review existing tasks, track progress, and manage your Kanban board.
      </p>
    </motion.button>
  </div>
);

const NewIdeaForm = ({ onSubmit, onBack, isAnalyzing, initialValues }: any) => {
  const [description, setDescription] = useState(initialValues?.description || "");
  const [urls, setUrls] = useState<string[]>(initialValues?.urls || [""]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Filter out empty URLs
    const validUrls = urls.filter(u => u.trim() !== "");
    onSubmit({ description, urls: validUrls });
  };

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const addUrl = () => {
    setUrls([...urls, ""]);
  };

  const removeUrl = (index: number) => {
    const newUrls = urls.filter((_, i) => i !== index);
    setUrls(newUrls.length ? newUrls : [""]);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-lg"
    >
      <button onClick={onBack} className="mb-6 text-xs text-zinc-500 hover:text-zinc-300 flex items-center">
        <ArrowRight className="w-3 h-3 rotate-180 mr-1" /> Back to Menu
      </button>

      <h2 className="text-2xl font-bold mb-6">Describe your idea</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Core Concept / Requirement</label>
          <textarea
            required
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full h-32 bg-black border border-border rounded-lg p-4 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-800 resize-none"
            placeholder="e.g. A personal finance app that gamifies saving money..."
          />
        </div>

        <div>
          <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Competitor / Reference URLs (Optional)</label>
          <div className="space-y-2">
            {urls.map((url, index) => (
              <div key={index} className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-3 w-4 h-4 text-zinc-600" />
                  <input
                    type="url"
                    value={url}
                    onChange={e => handleUrlChange(index, e.target.value)}
                    className="w-full bg-black border border-border rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-800"
                    placeholder="https://..."
                  />
                </div>
                {urls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeUrl(index)}
                    className="p-3 bg-zinc-900 hover:bg-red-900/30 text-zinc-500 hover:text-red-500 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex justify-between items-center mt-2">
            <button
              type="button"
              onClick={addUrl}
              className="text-xs flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Plus className="w-3 h-3 mr-1" /> Add another URL
            </button>

          </div>
        </div>

        <button
          type="submit"
          disabled={isAnalyzing || !description}
          className="w-full py-4 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center mt-6"
        >
          {isAnalyzing ? (
            <>Processing <Zap className="w-4 h-4 ml-2 animate-spin" /></>
          ) : (
            <>Analyze & Plan <ArrowRight className="w-4 h-4 ml-2" /></>
          )}
        </button>
      </form>
    </motion.div>
  );
};

// --- Main Page ---

export default function Home() {
  const hasMounted = useHasMounted();
  // State for View Mode
  const [viewMode, setViewMode] = useState<'start' | 'create' | 'analyze' | 'history'>('start');
  
  const { addSignal, setAnalysisResult, setPrepareResult, clearSignals, clearTasks, setContext, context } = usePulseStore();
  
  // 修复：始终调用 Hooks，无论 hasMounted 状态如何
  const rawTasks = usePulseStore(s => s.tasks);
  const rawIsAnalyzing = usePulseStore(s => s.isAnalyzing);
  const rawAnalysisResult = usePulseStore(s => s.analysisResult);
  const rawPrepareResult = usePulseStore(s => s.prepareResult);

  // Safe access to store values only after mount to prevent hydration mismatch
  const tasks = hasMounted ? rawTasks : [];
  const isAnalyzing = hasMounted ? rawIsAnalyzing : false;
  const analysisResult = hasMounted ? rawAnalysisResult : null;
  const prepareResult = hasMounted ? rawPrepareResult : null;
  
  const setAnalyzing = usePulseStore(s => s.setAnalyzing);

  // Restore view mode based on store state to handle page refresh
  useEffect(() => {
    if (hasMounted) {
      if (isAnalyzing || prepareResult || analysisResult) {
        setViewMode('analyze');
      }
    }
  }, [hasMounted, isAnalyzing, prepareResult, analysisResult]);

  // 1. Prepare Step
  const handleAnalyze = async (input: { description: string, urls: string[] }) => {
    // Switch to analyze view
    setViewMode('analyze');
    
    // Update Store Context
    setContext(input);

    // Reset
    clearSignals();
    clearTasks();
    setAnalysisResult(null);
    setPrepareResult(null);
    setAnalyzing(true);

    addSignal(`> Initializing Red/Blue Team Protocol...`);
    await new Promise(r => setTimeout(r, 800));
    if (input.urls && input.urls.length > 0) {
        input.urls.forEach(u => addSignal(`> GET ${u}`));
    }
    addSignal(`> Analyzing Request: "${input.description.slice(0, 50)}..."`);
    
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: input.urls, description: input.description, stage: 'prepare' })
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      
      if (data.success) {
        if (data.data.logs && Array.isArray(data.data.logs)) {
          data.data.logs.forEach((log: string) => addSignal(log));
        }
        addSignal(`> Prepare Phase Complete.`);
        addSignal(`> Arbitrator Decision: ${data.data.decision}`);
        setPrepareResult(data.data);
      } else {
        addSignal(`> Error: ${data.error}`);
      }
    } catch (err) {
      addSignal(`> System Error: Connection failed.`);
    } finally {
      setAnalyzing(false);
    }
  };

  // 2. Plan Step (Proceed)
  const handleProceed = async () => {
    // Restore context from store if local state is lost (e.g. after refresh)
    const activeContext = context;
    
    // Check either description or urls exist
    if (!activeContext.description && (!activeContext.urls || activeContext.urls.length === 0) && !activeContext.url) {
      addSignal("> Error: Context lost. Please restart analysis.");
      return;
    }

      setAnalyzing(true);
    addSignal(`> User Confirmed. Proceeding to PM & Tech Lead Agents...`);

    // Construct refined proposal from the edited PrepareResult
    // We prefer the Blue Team's proposal as it contains the constructive feature definition
    const confirmedProposal = prepareResult?.blue_case?.proposal 
      ? `Proposal: ${prepareResult.blue_case.proposal}\n\nContext/Rationale: ${prepareResult.arbitrator_rationale}`
      : activeContext.description;

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          urls: activeContext.urls || (activeContext.url ? [activeContext.url] : []), 
          description: activeContext.description, 
          stage: 'plan',
          signalId: prepareResult?.signalId,
          confirmed_proposal: confirmedProposal
        })
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();

      if (data.success) {
        addSignal(`> Planning Complete. Score: ${data.data.score}`);
        setAnalysisResult(data.data);
        // Clear prepare result to show the final card
        setPrepareResult(null);
      } else {
        addSignal(`> Error: ${data.error}`);
      }
    } catch (err) {
      addSignal(`> System Error: Connection failed.`);
    } finally {
      setAnalyzing(false);
    }
  };

  // View Controller
  const renderCenterContent = () => {
    switch (viewMode) {
      case 'start':
        return (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="mb-12 text-center">
              <h1 className="text-4xl font-bold mb-2 tracking-tighter">PulseJira</h1>
              <p className="text-zinc-500">Breathing Project Management.</p>
            </div>
            <StartScreen 
              onNew={() => setViewMode('create')} 
              onHistory={() => setViewMode('history')} 
            />
          </div>
        );
      
      case 'create':
        return (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
             <NewIdeaForm 
               onSubmit={handleAnalyze} 
               onBack={() => {
                 setPrepareResult(null);
                 setAnalysisResult(null);
                 setViewMode('start');
               }}
               isAnalyzing={isAnalyzing}
               initialValues={context}
             />
          </div>
        );

      case 'history':
        return (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
             <div className="w-full max-w-lg">
                <button onClick={() => setViewMode('start')} className="mb-6 text-xs text-zinc-500 hover:text-zinc-300 flex items-center">
                  <ArrowRight className="w-3 h-3 rotate-180 mr-1" /> Back to Menu
                </button>

                <div className="text-center">
                  <h2 className="text-2xl font-bold mb-4">Dashboard</h2>
                  <p className="text-zinc-500 mb-8">View your Kanban board on the right to track progress.</p>
                </div>
             </div>
          </div>
        );

      case 'analyze':
        return (
          <div className="flex flex-col items-center justify-center min-h-[50vh] transition-all duration-500">
             <div className="w-full max-w-md mb-8 text-center">
                <button 
                  onClick={() => {
                    if (prepareResult && !isAnalyzing) {
                      setViewMode('create');
                    } else {
                      // Clear state when cancelling to avoid restoring on refresh
                      setPrepareResult(null);
                      setAnalysisResult(null);
                      setViewMode('start');
                    }
                  }}
                  className="mb-4 text-xs text-zinc-500 hover:text-zinc-300 flex items-center justify-center mx-auto"
                >
                  <ArrowRight className="w-3 h-3 rotate-180 mr-1" />
                  {prepareResult && !isAnalyzing ? "Back to Edit" : "Cancel Analysis"}
                </button>
                <div className="flex justify-center mb-4">
                  <div className={clsx("p-4 rounded-full bg-zinc-900 border border-zinc-800", isAnalyzing && "animate-pulse")}>
                    <BrainCircuit className={clsx("w-8 h-8", isAnalyzing ? "text-blue-500" : "text-zinc-500")} />
                  </div>
                </div>
                {isAnalyzing && <p className="text-zinc-400 animate-pulse">Analyzing signals...</p>}
             </div>

            <AnimatePresence mode="wait">
              {prepareResult && !analysisResult && (
                <div className="w-full max-w-xl">
                   <PrepareCard onProceed={handleProceed} />
                </div>
              )}
              {analysisResult && (
                <div className="w-full max-w-md">
                  <FeatureCard />
                </div>
              )}
            </AnimatePresence>
          </div>
        );
    }
  };

  return (
    <main className="flex h-screen w-screen bg-background text-foreground overflow-hidden">
      
      {/* 1. Left Panel: Sensing */}
      {(viewMode === 'analyze' || viewMode === 'history') && (
        <Panel title="Signals" className="w-[300px] hidden md:flex" icon={Activity}>
          <SignalLog />
        </Panel>
      )}

      {/* 2. Center Panel: Brain & Input */}
      {viewMode === 'start' ? (
        <div className="flex-1 flex flex-col h-full items-center justify-center bg-background p-4">
          {renderCenterContent()}
        </div>
      ) : (
        <Panel title="CPO Brain" className="flex-1 min-w-[400px]" icon={BrainCircuit}>
          {renderCenterContent()}
        </Panel>
      )}

      {/* 3. Right Panel: Kanban */}
      {(viewMode === 'analyze' || viewMode === 'history') && (
        <Panel title="Kanban" className="w-[350px] bg-black" icon={Layers}>
          <div className="h-full overflow-y-auto pr-2">
            <KanbanColumn title="To Do" tasks={tasks.filter(t => t.status === 'todo')} />
            <KanbanColumn title="In Progress" tasks={tasks.filter(t => t.status === 'in-progress')} />
            <KanbanColumn title="Done" tasks={tasks.filter(t => t.status === 'done')} />
          </div>
        </Panel>
      )}

    </main>
  );
}
