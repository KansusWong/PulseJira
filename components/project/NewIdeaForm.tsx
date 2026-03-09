"use client";

import { useState } from "react";
import { ArrowRight, Globe, Plus, X, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from '@/lib/i18n';

const MotionDiv = motion.div;

interface NewIdeaFormProps {
  onSubmit: (data: { name: string; description: string; urls: string[] }) => void;
  isSubmitting?: boolean;
}

export function NewIdeaForm({ onSubmit, isSubmitting = false }: NewIdeaFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [urls, setUrls] = useState<string[]>([""]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validUrls = urls.filter((u) => u.trim() !== "");
    onSubmit({ name: name || description.slice(0, 30), description, urls: validUrls });
  };

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const addUrl = () => setUrls([...urls, ""]);

  const removeUrl = (index: number) => {
    const newUrls = urls.filter((_, i) => i !== index);
    setUrls(newUrls.length ? newUrls : [""]);
  };

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <h2 className="text-2xl font-bold mb-6">{t('newIdea.title')}</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">
            {t('newIdea.projectName')}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-black border border-border rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-800"
            placeholder={t('newIdea.projectNamePlaceholder')}
          />
        </div>

        <div>
          <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">
            {t('newIdea.coreConcept')} <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full h-32 bg-black border border-border rounded-lg p-4 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-800 resize-none"
            placeholder={t('newIdea.coreConceptPlaceholder')}
          />
        </div>

        <div>
          <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">
            {t('newIdea.referenceUrls')}
          </label>
          <div className="space-y-2">
            {urls.map((url, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-3 w-4 h-4 text-zinc-600" />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => handleUrlChange(index, e.target.value)}
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
          <button
            type="button"
            onClick={addUrl}
            className="mt-2 text-xs flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Plus className="w-3 h-3 mr-1" /> {t('newIdea.addAnotherUrl')}
          </button>
        </div>

        {!description && (
          <p className="text-xs text-zinc-500 mt-4 text-center">
            {t('newIdea.fillConcept')}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting || !description}
          className="w-full py-4 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center mt-2"
        >
          {isSubmitting ? (
            <>
              {t('newIdea.creatingProject')} <Zap className="w-4 h-4 ml-2 animate-spin" />
            </>
          ) : (
            <>
              {t('newIdea.createAnalyze')} <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </button>
      </form>
    </MotionDiv>
  );
}
