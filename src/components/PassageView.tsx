import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  Loader2, 
  ArrowRight,
  Trophy,
  HelpCircle,
  MessageSquare,
  Mic,
  MicOff
} from 'lucide-react';
import { Question, Passage, ExplainStatus } from '../types';

interface PassageViewProps {
  passage: Passage;
  questions: Question[];
  onComplete: (results: { questionId: string; isCorrect: boolean }[]) => void;
  onBack: () => void;
  evaluateExplanation: (
    explanation: string, 
    question: Question, 
    keywords: string[], 
    failures: number, 
    onChunk?: (text: string) => void
  ) => Promise<{ status: string; comment: string; reasoning?: string }>;
}

export const PassageView: React.FC<PassageViewProps> = ({ 
  passage, 
  questions, 
  onComplete, 
  onBack,
  evaluateExplanation 
}) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeBlank, setActiveBlank] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showdownQuestion, setShowdownQuestion] = useState<Question | null>(null);
  const [explanation, setExplanation] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<{ status: string; comment: string; reasoning?: string } | null>(null);

  // --- Speech Recognition ---
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'zh-CN';

      recognitionRef.current.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setExplanation(transcript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const isSpeechSupported = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const [showMedal, setShowMedal] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const allAnswered = useMemo(() => {
    return passage.questionIds.every(id => answers[id]);
  }, [passage.questionIds, answers]);

  const handleSelectOption = (questionId: string, option: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: option }));
    setActiveBlank(null);
  };

  const startScan = async () => {
    setIsScanning(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsScanning(false);

    // Find core nodes (Zhongkao questions)
    const coreQuestions = questions.filter(q => q.isZhongkao);
    // Pick the most challenging one (or just the first one for now)
    const target = coreQuestions[0] || questions[0];
    setShowdownQuestion(target);
  };

  const handleSubmitExplanation = async () => {
    if (!showdownQuestion || !explanation.trim()) return;
    setIsEvaluating(true);
    setAiFeedback({ status: 'evaluating', comment: '' });
    try {
      const result = await evaluateExplanation(
        explanation, 
        showdownQuestion, 
        showdownQuestion.passKeywords || [],
        0,
        (text) => {
          const statusMatch = text.match(/\[STATUS\]\s*[：:]\s*(PASS|FAIL|CORRECT|INCORRECT)/i);
          let currentStatus = 'evaluating';
          if (statusMatch) {
            const s = statusMatch[1].toUpperCase();
            currentStatus = (s === 'PASS' || s === 'CORRECT') ? 'pass' : 'fail';
          }

          const cleaned = text
            .replace(/\[TECHNICAL\]\s*[：:]\s*/gi, '')
            .replace(/命中考点：#\d+.*?\n?/g, '')
            .replace(/\[STATUS\]\s*[：:]\s*(PASS|FAIL|CORRECT|INCORRECT)\s*\n?/gi, '')
            .replace(/\[REASONING\]\s*[：:]\s*.*?\n/gi, '')
            .replace(/\[COMMENT\]\s*[：:]\s*\n?/gi, '')
            .replace(/\[DONE\]/gi, '')
            .trim();

          setAiFeedback(prev => ({
            ...prev,
            status: currentStatus,
            comment: cleaned
          }));
        }
      );

      const statusMatch = result.comment.match(/\[STATUS\]\s*[：:]\s*(PASS|FAIL|CORRECT|INCORRECT)/i);
      let finalStatus = result.status;
      if (statusMatch) {
          const s = statusMatch[1].toUpperCase();
          finalStatus = (s === 'PASS' || s === 'CORRECT') ? 'pass' : 'fail';
      }

      const finalCleaned = result.comment
        .replace(/\[TECHNICAL\]\s*[：:]\s*/gi, '')
        .replace(/命中考点：#\d+.*?\n?/g, '')
        .replace(/\[STATUS\]\s*[：:]\s*(PASS|FAIL|CORRECT|INCORRECT)\s*\n?/gi, '')
        .replace(/\[REASONING\]\s*[：:]\s*.*?\n/gi, '')
        .replace(/\[COMMENT\]\s*[：:]\s*\n?/gi, '')
        .replace(/\[DONE\]/gi, '')
        .trim();

      setAiFeedback({
        ...result,
        status: finalStatus,
        comment: finalCleaned
      });

      if (finalStatus === 'pass') {
        setShowMedal(true);
      }
    } catch (error) {
      console.error('Evaluation failed', error);
    } finally {
      setIsEvaluating(false);
    }
  };

  const renderContent = () => {
    const parts = passage.content.split(/(\[\[.*?\]\])/g);
    return parts.map((part, index) => {
      const match = part.match(/\[\[(.*?)(?:-(.*?))?\]\]/);
      if (match) {
        const questionId = match[1];
        const partIndex = match[2]; // for split questions like zk30
        const question = questions.find(q => q.id === questionId);
        if (!question) return part;

        const isSelected = answers[questionId];
        const isActive = activeBlank === questionId;

        // Special handling for split stems like zk30
        let displayValue = isSelected ? isSelected : `[${passage.questionIds.indexOf(questionId) + 1}]`;
        if (partIndex && isSelected) {
          const parts = isSelected.split(';').map(s => s.trim());
          displayValue = parts[parseInt(partIndex) - 1] || isSelected;
        }

        return (
          <button
            key={index}
            onClick={() => setActiveBlank(questionId)}
            className={`
              inline-flex items-center justify-center px-3 py-0.5 mx-1 rounded-lg border transition-all duration-300
              ${isActive ? 'bg-blue-500/20 border-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.3)] scale-105' : 
                isSelected ? 'bg-white/10 border-white/20 text-blue-400' : 'bg-white/5 border-white/10 text-white/40'}
              hover:border-blue-400/50 hover:bg-blue-500/10
            `}
          >
            <span className="font-mono font-bold">{displayValue}</span>
          </button>
        );
      }
      return <span key={index} className="text-white/80 leading-relaxed">{part}</span>;
    });
  };

  const progress = Object.keys(answers).length / passage.questionIds.length;

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-6 flex flex-col items-center relative overflow-hidden cyber-grid">
      <div className="cyber-scanline" />
      {/* Optimized Fluid Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <motion.div 
          className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] rounded-full blur-[120px]"
          animate={{
            background: `radial-gradient(circle, rgba(59, 130, 246, ${0.05 + progress * 0.15}), transparent 70%)`,
            scale: [1, 1.1, 1],
            x: [0, 50, 0],
            y: [0, 30, 0],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-[-20%] right-[-10%] w-[80%] h-[80%] rounded-full blur-[120px]"
          animate={{
            background: `radial-gradient(circle, rgba(147, 51, 234, ${0.05 + progress * 0.15}), transparent 70%)`,
            scale: [1.1, 1, 1.1],
            x: [0, -50, 0],
            y: [0, -30, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Header */}
      <div className="w-full max-w-3xl flex justify-between items-center mb-12 relative z-10">
        <button onClick={onBack} className="text-white/40 hover:text-white transition-colors flex items-center gap-2">
          <ArrowRight className="w-4 h-4 rotate-180" /> 返回地图
        </button>
        <div className="text-right">
          <h2 className="text-blue-400 font-bold tracking-widest text-xs uppercase mb-1">{passage.vibeTitle}</h2>
          <p className="text-white/40 text-[10px]">{passage.vibeSubtitle}</p>
        </div>
      </div>

      <div className="w-full max-w-3xl flex-1 flex flex-col relative z-10">
        {/* Passage Area */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`
            relative p-8 rounded-[40px] bg-white/5 border border-white/10 backdrop-blur-xl mb-8
            transition-all duration-1000
            ${isScanning ? 'shadow-[0_0_50px_rgba(59,130,246,0.2)]' : ''}
          `}
        >
          {isScanning && (
            <motion.div 
              initial={{ top: '0%' }}
              animate={{ top: '100%' }}
              transition={{ duration: 1.5, ease: "linear" }}
              className="absolute left-0 right-0 h-[2px] bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.8)] z-10 will-change-[top]"
            />
          )}
          
          <div className="relative z-0 text-xl font-serif leading-loose">
            {renderContent()}
          </div>

          {allAnswered && !isScanning && !showdownQuestion && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={startScan}
              className="mt-12 w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 font-bold tracking-[0.2em] transition-all active:scale-95 shadow-lg shadow-blue-600/20"
            >
              提交全文 · SUBMIT THE FLOW
            </motion.button>
          )}
        </motion.div>

        {/* Options Area */}
        <AnimatePresence mode="wait">
          {activeBlank && (
            <motion.div
              key="options"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="grid grid-cols-2 gap-4"
            >
              {questions.find(q => q.id === activeBlank)?.options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectOption(activeBlank, option)}
                  className="p-6 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-400/50 transition-all text-left group"
                >
                  <div className="flex items-center gap-4">
                    <span className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-white/40 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-lg">{option}</span>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Showdown Area */}
        <AnimatePresence>
          {showdownQuestion && !showMedal && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
            >
              <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-[40px] p-10 shadow-2xl">
                <div className="flex items-center gap-3 mb-6 text-blue-400 font-bold text-xs tracking-[0.3em] uppercase">
                  <Sparkles className="w-4 h-4" />
                  降维打击 · Feynman Showdown
                </div>
                
                <h3 className="text-2xl font-bold mb-8 leading-relaxed">
                  语篇已补全，但此处的逻辑 <span className="text-blue-400">"{showdownQuestion.grammarPoint}"</span> 暗藏杀机。请解释你识破它的逻辑。
                </h3>

                <div className="relative mb-8">
                  <textarea
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder={showdownQuestion.explainPlaceholder}
                    className="w-full h-40 bg-white/5 border border-white/10 rounded-3xl p-6 text-lg text-white focus:outline-none focus:border-blue-500/50 transition-colors resize-none pr-16"
                  />
                  {isSpeechSupported && (
                    <button
                      onClick={toggleListening}
                      className={`
                        absolute top-4 right-4 p-4 rounded-2xl transition-all active:scale-95 z-20
                        ${isListening 
                          ? "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse" 
                          : "bg-white/5 text-white/40 hover:text-blue-400 hover:bg-blue-500/10 border border-white/10 shadow-sm"}
                      `}
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                  )}
                  <div className="absolute bottom-4 right-6 text-white/20 text-xs font-mono">
                    FEYNMAN MODE ACTIVE
                  </div>
                </div>

                {aiFeedback && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mb-8 p-6 rounded-3xl whitespace-pre-wrap ${aiFeedback.status === 'pass' ? 'bg-green-500/10 border border-green-500/20' : 'bg-blue-500/10 border border-blue-500/20'}`}
                  >
                    <p className="text-lg leading-relaxed italic">"{aiFeedback.comment}"</p>
                  </motion.div>
                )}

                <button
                  onClick={handleSubmitExplanation}
                  disabled={isEvaluating || !explanation.trim()}
                  className="w-full py-5 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-bold tracking-[0.2em] transition-all flex items-center justify-center gap-3"
                >
                  {isEvaluating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      正在解析逻辑迷雾...
                    </>
                  ) : (
                    <>
                      提交解释 · SUBMIT LOGIC
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Medal Area */}
        <AnimatePresence>
          {showMedal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-blue-600 overflow-hidden"
            >
              {/* Fluid Background Animation */}
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-white rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-400 rounded-full blur-[120px] animate-pulse delay-700" />
              </div>

              <motion.div
                initial={{ scale: 0.5, opacity: 0, y: 50 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: "spring", damping: 15 }}
                className="relative z-10 flex flex-col items-center text-center px-6"
              >
                <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-8 shadow-2xl">
                  <Trophy className="w-16 h-16 text-blue-600" />
                </div>
                <h2 className="text-5xl font-black text-white mb-4 tracking-tighter italic">TEXT MASTER</h2>
                <p className="text-blue-100 text-xl font-medium mb-12 max-w-md">
                  语篇掌控者：你已识破语境中的所有陷阱，逻辑之光已照亮全文。
                </p>
                <button
                  onClick={() => {
                    const results = passage.questionIds.map(id => ({
                      questionId: id,
                      isCorrect: answers[id] === questions.find(q => q.id === id)?.correctAnswer
                    }));
                    onComplete(results);
                  }}
                  className="px-12 py-4 bg-white text-blue-600 rounded-full font-bold tracking-widest hover:bg-blue-50 hover:scale-105 transition-all shadow-xl"
                >
                  领取勋章并返回
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
