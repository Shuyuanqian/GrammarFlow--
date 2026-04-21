/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { 
  ArrowRight, 
  CheckCircle2, 
  XCircle, 
  Lightbulb, 
  BookOpen, 
  RefreshCcw, 
  Home, 
  ChevronRight,
  MessageSquare,
  Sparkles,
  Loader2,
  AlertCircle,
  HelpCircle,
  Trophy,
  Award,
  RotateCcw,
  Hand,
  Mic,
  MicOff
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { cn } from './lib/utils';
import { mockQuestions } from './data/questions';
import { mockPassages } from './data/passages';
import { evaluateExplanation, generateDailyReport } from './services/geminiService';
import { Question, QuizStep, Chapter, ViewMode, Passage } from './types';
import { PassageView } from './components/PassageView';

// --- Constants ---

const EVALUATION_MESSAGES = [
  "正在链接赛博导师...",
  "正在解析你的逻辑迷雾...",
  "正在为你点亮语法之光...",
  "正在编织治愈系反馈...",
  "即将为你揭晓答案..."
];

// --- Components ---

const Field = ({ content, fieldName }: { content: string; fieldName: string }) => (
  <span data-field={fieldName}>{content}</span>
);

const StarMap = ({ starMap, className, title }: { starMap: Record<string, { s: number; a: number }>; className?: string; title?: string }) => {
  const masteredCount = Object.values(starMap).filter(v => v.s >= 3).length;
  
  return (
    <div className={cn("p-6 rounded-[40px] bg-white/5 border border-white/10 backdrop-blur-md relative overflow-hidden group", className)}>
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-500" />
          <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em]">{title || '星图进度 · Star Map'}</h3>
        </div>
        <span className="text-[10px] font-mono text-yellow-500/50">
          {masteredCount} / 50 Mastered
        </span>
      </div>
      <div className="grid grid-cols-10 gap-2 relative z-10">
        {Array.from({ length: 50 }).map((_, i) => {
          const id = (i + 1).toString();
          const data = starMap[id] || { s: 0, a: 0 };
          const isMastered = data.s >= 3;
          const isPracticed = data.a > 0;
          
          return (
            <div 
              key={id}
              className={cn(
                "w-3 h-3 rounded-full flex items-center justify-center transition-all duration-700 relative group/star",
                !isPracticed && "bg-white/10",
                isPracticed && !isMastered && "bg-yellow-500/40 scale-110 shadow-[0_0_8px_rgba(234,179,8,0.3)]",
                isMastered && "bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.8)] scale-125 animate-pulse-gold"
              )}
            >
              {isMastered ? (
                <span className="text-[8px] leading-none select-none">🌟</span>
              ) : isPracticed ? (
                <span className="text-[6px] leading-none text-yellow-200 select-none">★</span>
              ) : (
                <div className="w-0.5 h-0.5 bg-white/20 rounded-full" />
              )}
              
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/95 text-[8px] text-white rounded-lg opacity-0 group-hover/star:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50 border border-white/10 shadow-2xl translate-y-1 group-hover/star:translate-y-0">
                考点 #{id}: {isMastered ? '已歼灭' : isPracticed ? `成功 ${data.s}/3` : '未练过'}
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 blur-[60px] group-hover:bg-yellow-500/10 transition-all" />
    </div>
  );
};

const DailyReport = ({ summary, isLoading, onClose }: { summary: string; isLoading: boolean; onClose: () => void }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="fixed inset-x-4 bottom-24 z-50 p-8 rounded-[40px] bg-black/90 border border-yellow-500/30 backdrop-blur-2xl shadow-[0_0_50px_rgba(234,179,8,0.2)]"
  >
    <div className="flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-full bg-yellow-500/20 flex items-center justify-center mb-6 animate-bounce">
        <Hand className="w-10 h-10 text-yellow-500" />
      </div>
      <h3 className="text-xl font-bold text-white mb-4">今日战报 · Daily Report</h3>
      {isLoading ? (
        <div className="flex items-center gap-2 text-yellow-500/50 italic animate-pulse">
          <Sparkles className="w-4 h-4" />
          <span>教练正在为你生成总结...</span>
        </div>
      ) : (
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-lg text-white/80 leading-relaxed mb-8 font-medium"
        >
          {summary}
        </motion.p>
      )}
      <button
        onClick={onClose}
        className="px-8 py-4 bg-yellow-500 text-black font-bold rounded-2xl active-shrink hover:bg-yellow-400 transition-colors"
      >
        收下鼓励，明天见
      </button>
    </div>
  </motion.div>
);

export default function App() {
  // --- State ---
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [currentPassageId, setCurrentPassageId] = useState<string | null>(null);
  const [step, setStep] = useState<QuizStep>('question');
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [userExplanation, setUserExplanation] = useState('');
  const [aiFeedback, setAiFeedback] = useState<{ status: string; comment: string; reasoning?: string } | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [hintLevel, setHintLevel] = useState(0); // 0: none, 1: concept, 2: clue, 3: template
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [evalMessageIndex, setEvalMessageIndex] = useState(0);
  const [showMedal, setShowMedal] = useState(false);
  const lastClickTime = useRef(0);
  const DEBOUNCE_DELAY = 500;

  const isDebounced = () => {
    const now = Date.now();
    if (now - lastClickTime.current < DEBOUNCE_DELAY) return true;
    lastClickTime.current = now;
    return false;
  };

  const [completedQuestions, setCompletedQuestions] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('grammarflow_progress');
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load progress', e);
      }
    }
    return new Set();
  });

  const [failedQuestionIds, setFailedQuestionIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('grammarflow_failed');
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load errors', e);
      }
    }
    return new Set();
  });

  const [starMap, setStarMap] = useState<Record<string, { s: number; a: number }>>(() => {
    const saved = localStorage.getItem('grammarflow_starmap_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load starMap', e);
      }
    }
    // Migration from old starMap if exists
    const oldSaved = localStorage.getItem('grammarflow_starmap');
    if (oldSaved) {
      try {
        const oldData = JSON.parse(oldSaved);
        const newData: Record<string, { s: number; a: number }> = {};
        Object.entries(oldData).forEach(([id, count]) => {
          newData[id] = { s: Number(count), a: Number(count) };
        });
        return newData;
      } catch (e) {
        console.error('Failed to migrate starMap', e);
      }
    }
    return {};
  });

  const [showStarMapOverlay, setShowStarMapOverlay] = useState(false);
  
  const [initialStarMap] = useState<Record<string, { s: number; a: number }>>(() => {
    const saved = localStorage.getItem('grammarflow_starmap_v2');
    return saved ? JSON.parse(saved) : {};
  });
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [reportSummary, setReportSummary] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

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
        setUserExplanation(transcript);
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

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('grammarflow_starmap_v2', JSON.stringify(starMap));
  }, [starMap]);
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isEvaluating) {
      setEvalMessageIndex(0);
      interval = setInterval(() => {
        setEvalMessageIndex(prev => (prev + 1) % EVALUATION_MESSAGES.length);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isEvaluating]);

  useEffect(() => {
    localStorage.setItem('grammarflow_progress', JSON.stringify(Array.from(completedQuestions)));
  }, [completedQuestions]);

  useEffect(() => {
    localStorage.setItem('grammarflow_failed', JSON.stringify(Array.from(failedQuestionIds)));
  }, [failedQuestionIds]);

  // --- Derived Data ---
  const chapters = useMemo(() => {
    const map = new Map<string, Chapter & { completedCount: number }>();
    mockQuestions.forEach(q => {
      if (!map.has(q.chapterId)) {
        map.set(q.chapterId, {
          id: q.chapterId,
          name: q.chapterName,
          questionIds: [],
          completedCount: 0
        });
      }
      const chapter = map.get(q.chapterId)!;
      chapter.questionIds.push(q.id);
      if (completedQuestions.has(q.id)) {
        chapter.completedCount++;
      }
    });
    return Array.from(map.values());
  }, [completedQuestions, failedQuestionIds]);

  const filteredQuestions = useMemo(() => {
    if (!currentChapterId) return [];
    return mockQuestions.filter(q => q.chapterId === currentChapterId);
  }, [currentChapterId]);

  const currentQuestion = filteredQuestions[currentIndex] || mockQuestions[0];

  const currentPassage = useMemo(() => {
    return mockPassages.find(p => p.id === currentPassageId) || mockPassages[0];
  }, [currentPassageId]);

  const passageQuestions = useMemo(() => {
    if (!currentPassage) return [];
    return currentPassage.questionIds.map(id => mockQuestions.find(q => q.id === id)).filter(Boolean) as Question[];
  }, [currentPassage]);

  const currentChapter = chapters.find(c => c.id === currentChapterId);
  const remainingRedDots = currentChapter?.questionIds.filter(id => failedQuestionIds.has(id)).length || 0;

  // Confetti effect when mastering a chapter
  useEffect(() => {
    if (step === 'wrapUp' && currentChapterId) {
      const currentChapter = chapters.find(c => c.id === currentChapterId);
      const isMastered = currentChapter && currentChapter.completedCount >= currentChapter.questionIds.length && currentChapter.questionIds.length > 0;
      
      if (isMastered) {
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function() {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            return clearInterval(interval);
          }

          const particleCount = 50 * (timeLeft / duration);
          confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
          confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
      }
    }
  }, [step, currentChapterId, chapters]);

  // --- Handlers ---
  const handleStartChapter = (id: string, isReview: boolean = false, startIndex: number = 0) => {
    if (isDebounced()) return;
    setCurrentChapterId(id);
    setCurrentIndex(startIndex);
    setStep('question');
    resetQuestionState();
    setIsReviewMode(isReview);
    setViewMode('quiz');
  };

  const handleStartPassage = (id: string) => {
    if (isDebounced()) return;
    setCurrentPassageId(id);
    setViewMode('passage');
  };

  const resetQuestionState = () => {
    setUserAnswer(null);
    setUserExplanation('');
    setAiFeedback(null);
    setShowReasoning(false);
    setHintLevel(0);
    setConsecutiveFailures(0);
  };

  const handleAnswer = (option: string) => {
    setUserAnswer(option);
    setStep('feedback');
    
    // Error Reinforcement: Add to failed list if wrong
    if (option !== currentQuestion.correctAnswer) {
      setFailedQuestionIds(prev => {
        const next = new Set(prev);
        next.add(currentQuestion.id);
        return next;
      });
      // Scaffolding: Increment hint level on failure
      setConsecutiveFailures(prev => {
        const next = prev + 1;
        if (next >= 1) setHintLevel(h => Math.min(h + 1, 3));
        return next;
      });
    } else {
      setConsecutiveFailures(0);
    }
  };

  const handleExplain = async () => {
    if (!userExplanation.trim() || isEvaluating) return;
    if (isDebounced()) return;
    
    setIsEvaluating(true);
    setAiFeedback({ status: 'fail', comment: '', reasoning: '' });

    try {
      const result = await evaluateExplanation(
        userExplanation,
        currentQuestion,
        currentQuestion.passKeywords,
        consecutiveFailures,
        (text) => {
          // Streaming update: clean markers progressively
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
            status: currentStatus as any,
            comment: cleaned
          }));
        }
      );

      // --- Data Capture ---
      const comment = result.comment;
      const pointMatch = comment.match(/命中考点：#(\d+)/);
      const statusMatch = comment.match(/\[STATUS\]\s*[：:]\s*(PASS|FAIL|CORRECT|INCORRECT)/i);
      
      let extractedStatus = result.status;
      if (statusMatch) {
        const statusStr = statusMatch[1].toUpperCase();
        if (statusStr === 'CORRECT' || statusStr === 'PASS') extractedStatus = 'pass';
        if (statusStr === 'INCORRECT' || statusStr === 'FAIL') extractedStatus = 'fail';
      }
      const extractedPointId = pointMatch ? pointMatch[1] : null;

      if (extractedPointId) {
        setStarMap(prev => {
          const current = prev[extractedPointId] || { s: 0, a: 0 };
          const isSuccess = extractedStatus === 'pass';
          const newSuccessCount = isSuccess ? current.s + 1 : current.s;
          const newAttemptCount = current.a + 1;

          if (isSuccess && newSuccessCount === 3) {
            confetti({
              particleCount: 200,
              spread: 100,
              origin: { y: 0.6 },
              colors: ['#FFD700', '#FFA500']
            });
          }
          return { 
            ...prev, 
            [extractedPointId]: { s: newSuccessCount, a: newAttemptCount } 
          };
        });
      }

      // Final cleanup and state sync
      const finalCleanedComment = comment
        .replace(/\[TECHNICAL\]\s*[：:]\s*/gi, '')
        .replace(/命中考点：#\d+.*?\n?/g, '')
        .replace(/\[STATUS\]\s*[：:]\s*(PASS|FAIL|CORRECT|INCORRECT)\n?/gi, '')
        .replace(/\[REASONING\]\s*[：:]\s*.*?\n/gi, '')
        .replace(/\[COMMENT\]\s*[：:]\s*\n?/gi, '')
        .replace(/\[DONE\]/gi, '')
        .trim();

      setAiFeedback({
        status: extractedStatus,
        comment: finalCleanedComment,
        reasoning: result.reasoning
      });

      if (extractedStatus === 'pass') {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#22c55e', '#3b82f6', '#a855f7']
        });
        setConsecutiveFailures(0);
        setCompletedQuestions(prev => {
          const next = new Set(prev);
          next.add(currentQuestion.id);
          return next;
        });

        // Remove from failed list if passed
        setFailedQuestionIds(prev => {
          const next = new Set(prev);
          next.delete(currentQuestion.id);
          return next;
        });
      } else {
        // Add to failed list if explanation is weak or wrong
        setFailedQuestionIds(prev => {
          const next = new Set(prev);
          next.add(currentQuestion.id);
          return next;
        });
        // Scaffolding: Increment hint level on failure
        setConsecutiveFailures(prev => {
          const next = prev + 1;
          if (next >= 1) setHintLevel(h => Math.min(h + 1, 3));
          return next;
        });
      }
    } catch (error) {
      console.error(error);
      setAiFeedback({ status: 'fail', comment: '评价过程出现了一点小问题，请重试。' });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleNextQuestion = () => {
    if (isReviewMode) {
      const currentChapter = chapters.find(c => c.id === currentChapterId);
      const remainingFailedIds = currentChapter?.questionIds.filter(id => failedQuestionIds.has(id)) || [];
      
      if (remainingFailedIds.length > 0) {
        // Go to the next failed question
        const nextFailedIdx = filteredQuestions.findIndex(q => q.id === remainingFailedIds[0]);
        setCurrentIndex(nextFailedIdx);
        setStep('question');
        resetQuestionState();
      } else {
        // No more failed questions in this chapter
        setStep('wrapUp');
      }
    } else {
      if (currentIndex < filteredQuestions.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setStep('question');
        resetQuestionState();
      } else {
        setStep('wrapUp');
      }
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setStep('question');
    resetQuestionState();
    setIsReviewMode(false);
  };

  const handleBackToHome = () => {
    setCurrentChapterId(null);
    setIsReviewMode(false);
    setShowDailyReport(false);
  };

  const handleEndPractice = async () => {
    setIsGeneratingReport(true);
    setShowDailyReport(true);
    
    const initialMastered = Object.values(initialStarMap).filter(v => v.s >= 3).length;
    const currentMastered = Object.values(starMap).filter(v => v.s >= 3).length;
    const newStars = Math.max(0, currentMastered - initialMastered);
    
    const initialPracticed = Object.keys(initialStarMap).length;
    const currentPracticed = Object.keys(starMap).length;
    const practicedPoints = Math.max(0, currentPracticed - initialPracticed);

    const summary = await generateDailyReport(newStars, practicedPoints);
    setReportSummary(summary);
    setIsGeneratingReport(false);
    
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.8 }
    });
  };

  const handleNextChapter = () => {
    const currentIdx = chapters.findIndex(c => c.id === currentChapterId);
    setIsReviewMode(false);
    if (currentIdx < chapters.length - 1) {
      handleStartChapter(chapters[currentIdx + 1].id);
    } else {
      handleBackToHome();
    }
  };

  // --- Render Helpers ---

  if (viewMode === 'passage' && currentPassage) {
    return (
      <PassageView 
        passage={currentPassage}
        questions={passageQuestions}
        onComplete={(results) => {
          console.log('Passage complete', results);
          setViewMode('map');
        }}
        onBack={() => setViewMode('map')}
        evaluateExplanation={(explanation, question, keywords, failures, onChunk) => 
          evaluateExplanation(explanation, question, keywords, failures, onChunk)
        }
      />
    );
  }

  if (!currentChapterId || viewMode === 'map') {
    return (
      <div className="min-h-[100dvh] bg-[#050505] text-white p-4 md:p-12 overflow-x-hidden relative cyber-grid">
        <div className="cyber-scanline" />
        <div className="max-w-6xl mx-auto relative z-10">
          <header className="mb-12 md:mb-16 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <h1 className="text-5xl md:text-6xl font-black tracking-tighter italic mb-2 neon-text">GRAMMAR<span className="text-blue-500">FLOW</span></h1>
              <p className="text-white/40 font-medium tracking-[0.3em] uppercase text-[10px] md:text-xs">SZ Zhongkao Soul · 赛博治愈系</p>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-left md:text-right"
            >
              <div className="text-3xl md:text-4xl font-mono font-bold text-blue-500/50">{completedQuestions.size}</div>
              <div className="text-[10px] text-white/20 tracking-widest uppercase">Mastered Nodes</div>
            </motion.div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12">
            <div className="lg:col-span-2 space-y-12">
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-1 h-8 bg-blue-500" />
                  <h2 className="text-2xl font-bold tracking-tight">星系图谱 · Chapter Map</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {chapters.map((chapter, idx) => {
                    const isCompleted = chapter.questionIds.every(id => completedQuestions.has(id));
                    const progress = chapter.questionIds.filter(id => completedQuestions.has(id)).length;
                    
                    return (
                      <button
                        key={chapter.id}
                        onClick={() => handleStartChapter(chapter.id)}
                        className="group relative p-8 rounded-[40px] bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/50 transition-all text-left overflow-hidden active:scale-[0.98]"
                      >
                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-6">
                            <span className="text-[10px] font-bold tracking-[0.3em] text-white/20 uppercase">Node {chapter.id}</span>
                            {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                          </div>
                          <h3 className="text-2xl font-bold mb-2 group-hover:text-blue-400 transition-colors">{chapter.name}</h3>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 transition-all duration-1000" 
                                style={{ width: `${(progress / chapter.questionIds.length) * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-white/20">{progress}/{chapter.questionIds.length}</span>
                          </div>
                        </div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[60px] group-hover:bg-blue-500/10 transition-all" />
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-1 h-8 bg-purple-500" />
                  <h2 className="text-2xl font-bold tracking-tight">星系实战 · Passage Mode</h2>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {mockPassages.map((passage) => (
                    <button
                      key={passage.id}
                      onClick={() => handleStartPassage(passage.id)}
                      className="group relative p-8 rounded-[40px] bg-white/5 border border-white/10 hover:bg-white/10 hover:border-purple-500/50 transition-all text-left overflow-hidden active:scale-[0.98]"
                    >
                      <div className="relative z-10 flex justify-between items-center">
                        <div>
                          <div className="text-[10px] font-bold tracking-[0.3em] text-white/20 uppercase mb-2">Passage Challenge</div>
                          <h3 className="text-2xl font-bold group-hover:text-purple-400 transition-colors">{passage.title}</h3>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-purple-500 transition-colors">
                          <ChevronRight className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-[60px] group-hover:bg-purple-500/10 transition-all" />
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-8">
              <StarMap starMap={starMap} />
              <div className="p-8 rounded-[40px] bg-blue-600/10 border border-blue-500/20">
                <div className="flex items-center gap-3 mb-6">
                  <Trophy className="w-6 h-6 text-blue-500" />
                  <h3 className="font-bold tracking-tight">成就系统 · Medals</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-3xl bg-white/5 border border-white/10">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                      <Award className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">识破者 · Trap Cracker</div>
                      <div className="text-[10px] text-white/40">识破 10 个中考陷阱</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-3xl bg-white/5 border border-white/10">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-purple-500" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">掌控者 · Text Master</div>
                      <div className="text-[10px] text-white/40">完成 1 篇语篇实战</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#050505] p-4 sm:p-8 font-sans text-white touch-manipulation overflow-x-hidden relative cyber-grid">
      <div className="cyber-scanline" />
      {isReviewMode && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="review-bar fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 py-3 shadow-lg text-sm"
        >
          🔥 正在攻克错题：本站还剩 {remainingRedDots} 处迷雾待清扫 🔥
        </motion.div>
      )}
      <div className={cn("max-w-3xl mx-auto", isReviewMode && "pt-12")}>
        {/* Progress Bar */}
        <div className="mb-8 flex items-center gap-4">
          <button 
            onClick={handleBackToHome} 
            className="touch-target hover:bg-white/10 rounded-full transition-colors active-shrink"
          >
            <Home className="w-5 h-5 text-white/40" />
          </button>
          <div className="flex-1 flex gap-2 overflow-x-auto py-2 no-scrollbar scroll-snap-x">
            {filteredQuestions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (isDebounced()) return;
                  setCurrentIndex(idx);
                  setStep('question');
                  resetQuestionState();
                }}
                className={cn(
                  "shrink-0 w-11 h-11 rounded-xl text-xs font-bold flex items-center justify-center transition-all duration-200 relative active-shrink scroll-snap-align-center",
                  idx === currentIndex ? "bg-blue-600 text-white shadow-lg shadow-blue-500/50 scale-110" : 
                  completedQuestions.has(filteredQuestions[idx].id) ? "bg-green-500/20 text-green-400 border border-green-500/20" :
                  idx < currentIndex ? "bg-blue-500/20 text-blue-400 border border-blue-500/20" : 
                  "bg-white/5 border border-white/10 text-white/40 hover:border-blue-500/50 hover:text-blue-400"
                )}
              >
                {idx + 1}
                {completedQuestions.has(filteredQuestions[idx].id) && idx !== currentIndex && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#050505] flex items-center justify-center">
                    <CheckCircle2 className="w-2 h-2 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setShowStarMapOverlay(!showStarMapOverlay)}
            className={cn(
              "touch-target rounded-full transition-all active-shrink relative",
              showStarMapOverlay ? "bg-yellow-500/20 text-yellow-500" : "hover:bg-white/10 text-white/40"
            )}
          >
            <Sparkles className="w-5 h-5" />
            {Object.values(starMap).some(v => v.a > 0) && !showStarMapOverlay && (
              <div className="absolute top-2 right-2 w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            )}
          </button>
        </div>

        <AnimatePresence>
          {showStarMapOverlay && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 32 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="overflow-hidden"
            >
              <StarMap starMap={starMap} title="实时星图 · Live Progress" className="bg-white/10 border-yellow-500/20" />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* Step 1: Question */}
          {step === 'question' && (
            <motion.div 
              key="question"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white/5 rounded-[40px] p-8 sm:p-12 shadow-2xl border border-white/10 relative overflow-hidden"
            >
              {currentQuestion.isZhongkao && (
                <div className="absolute top-0 right-0 p-6">
                  <div className="px-4 py-1.5 rounded-full bg-blue-600/10 backdrop-blur-md border border-blue-600/20 text-blue-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 animate-pulse-glow">
                    <Award className="w-3 h-3" />
                    Zhongkao Special · 中考真题
                  </div>
                </div>
              )}
              <div className="mb-10">
                <span className="inline-block px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest mb-6">
                  {currentQuestion.grammarPoint}
                </span>
                <h2 className="text-3xl sm:text-4xl font-bold leading-tight hyphens-auto text-white">
                  <Field content={currentQuestion.stem} fieldName="stem" />
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {currentQuestion.options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(option)}
                    className="group flex items-center justify-between p-6 rounded-2xl border-2 border-white/5 hover:border-blue-500 hover:bg-blue-500/10 transition-all text-left active-shrink"
                  >
                    <span className="text-lg font-bold group-hover:text-blue-400 text-white/80">{option}</span>
                    <div className="w-8 h-8 rounded-full border-2 border-white/10 group-hover:border-blue-500 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2: Feedback */}
          {step === 'feedback' && (
            <motion.div 
              key="feedback"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className={cn(
                "rounded-[40px] p-8 sm:p-12 border-2 shadow-2xl",
                userAnswer === currentQuestion.correctAnswer 
                  ? "bg-green-500/10 border-green-500/20" 
                  : "bg-red-500/10 border-red-500/20"
              )}>
                <div className="flex items-center gap-4 mb-6">
                  {userAnswer === currentQuestion.correctAnswer ? (
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  ) : (
                    <XCircle className="w-10 h-10 text-red-600" />
                  )}
                  <h3 className={cn(
                    "text-2xl font-bold",
                    userAnswer === currentQuestion.correctAnswer ? "text-green-800" : "text-red-800"
                  )}>
                    {userAnswer === currentQuestion.correctAnswer 
                      ? <Field content={currentQuestion.correctTitle} fieldName="correctTitle" />
                      : <Field content={currentQuestion.incorrectTitle} fieldName="incorrectTitle" />
                    }
                  </h3>
                </div>

                <div className="bg-white/60 rounded-3xl p-6 backdrop-blur-sm border border-white/40">
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" /> <Field content={currentQuestion.explanationTitle} fieldName="explanationTitle" />
                  </h4>
                  <p className="text-lg leading-relaxed font-medium">
                    <Field content={currentQuestion.explanationSummary} fieldName="explanationSummary" />
                  </p>
                </div>

                {userAnswer === currentQuestion.correctAnswer ? (
                  <button
                    onClick={() => setStep('explain')}
                    className="mt-10 w-full py-6 bg-blue-600 text-white rounded-2xl font-bold text-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-3 active-shrink"
                  >
                    进入解释挑战 <ArrowRight className="w-6 h-6" />
                  </button>
                ) : (
                  <button
                    onClick={() => setStep('question')}
                    className="mt-10 w-full py-6 bg-red-600 text-white rounded-2xl font-bold text-xl hover:bg-red-700 transition-all shadow-xl shadow-red-100 flex items-center justify-center gap-3 active-shrink"
                  >
                    重新尝试 <RefreshCcw className="w-6 h-6" />
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: Explain Challenge */}
          {step === 'explain' && (
            <motion.div 
              key="explain"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-[40px] p-8 sm:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold">
                    <Field content={currentQuestion.explainTitle} fieldName="explainTitle" />
                  </h3>
                </div>

                <div className="bg-gray-50 rounded-3xl p-6 mb-8 border border-gray-100">
                  <p className="text-gray-600 font-medium leading-relaxed">
                    <Field content={currentQuestion.explainPrompt} fieldName="explainPrompt" />
                  </p>
                </div>

                <div className="relative">
                  <textarea
                    value={userExplanation}
                    onChange={(e) => setUserExplanation(e.target.value)}
                    placeholder={currentQuestion.explainPlaceholder}
                    className="w-full h-40 p-6 bg-gray-50 rounded-3xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none text-lg text-gray-900 resize-none pr-16"
                  />
                  {isSpeechSupported && (
                    <button
                      onClick={toggleListening}
                      className={cn(
                        "absolute top-4 right-4 p-4 rounded-2xl transition-all active:scale-95 z-20",
                        isListening 
                          ? "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse" 
                          : "bg-white text-gray-400 hover:text-blue-600 hover:bg-blue-50 border border-gray-100 shadow-sm"
                      )}
                    >
                      {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </button>
                  )}
                  {isEvaluating && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-white/80 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center gap-6 z-10"
                    >
                      <div className="relative">
                        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="absolute inset-0 bg-blue-100 rounded-full -z-10 blur-xl opacity-50"
                        />
                      </div>
                      <div className="h-6 flex items-center justify-center">
                        <AnimatePresence mode="wait">
                          <motion.p
                            key={evalMessageIndex}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="text-sm font-bold text-blue-600 uppercase tracking-widest"
                          >
                            {EVALUATION_MESSAGES[evalMessageIndex]}
                          </motion.p>
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* AI Feedback */}
                {aiFeedback && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "mt-6 p-8 rounded-[32px] border-2 transition-all duration-500",
                      aiFeedback.status === 'pass' ? "bg-green-50/50 border-green-200 cyber-glow-pass" : 
                      aiFeedback.status === 'partial' ? "bg-orange-50/50 border-orange-200 cyber-glow-partial" :
                      "bg-red-50/50 border-red-200 cyber-glow-fail"
                    )}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center",
                          aiFeedback.status === 'pass' ? "bg-green-500 text-white" : 
                          aiFeedback.status === 'partial' ? "bg-orange-500 text-white" :
                          "bg-red-500 text-white"
                        )}>
                          {aiFeedback.status === 'pass' ? <CheckCircle2 className="w-5 h-5" /> : 
                           aiFeedback.status === 'partial' ? <AlertCircle className="w-5 h-5" /> :
                           <AlertCircle className="w-5 h-5" />}
                        </div>
                        <span className={cn(
                          "font-black uppercase tracking-[0.2em] text-xs",
                          aiFeedback.status === 'pass' ? "text-green-600" : 
                          aiFeedback.status === 'partial' ? "text-orange-600" :
                          "text-red-600"
                        )}>
                          {aiFeedback.status === 'pass' ? '挑战通过' : 
                           aiFeedback.status === 'partial' ? '仍需完善' : 
                           aiFeedback.status === 'error' ? '无效输入' : '挑战未通过'}
                        </span>
                      </div>

                      {aiFeedback.reasoning && (
                        <button 
                          onClick={() => setShowReasoning(!showReasoning)}
                          className="text-[10px] font-bold text-gray-400 hover:text-blue-500 transition-colors flex items-center gap-1 touch-target -m-2 active-shrink"
                        >
                          <HelpCircle className="w-3 h-3" /> {showReasoning ? '隐藏思考' : '查看思考'}
                        </button>
                      )}
                    </div>

                    <div className="text-gray-800 text-lg font-medium leading-relaxed mb-4 markdown-body">
                      <Markdown
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            if (!inline && match && match[1] === 'diff') {
                              return (
                                <div className="bg-green-600/20 border border-green-500/50 rounded-xl p-4 my-4 font-mono text-green-600 text-sm whitespace-pre-wrap">
                                  {String(children).replace(/\n$/, '')}
                                </div>
                              );
                            }
                            if (!inline && match && match[1] === 'yaml') {
                              return (
                                <div className="bg-blue-600/10 border border-blue-500/30 rounded-xl p-4 my-4 font-mono text-blue-600 text-sm whitespace-pre-wrap">
                                  {String(children).replace(/\n$/, '')}
                                </div>
                              );
                            }
                            return <code className={className} {...props}>{children}</code>;
                          }
                        }}
                      >
                        {aiFeedback.comment}
                      </Markdown>
                    </div>

                    <AnimatePresence>
                      {showReasoning && aiFeedback.reasoning && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-4 mt-4 border-t border-gray-200/50">
                            <div className="flex items-center gap-2 mb-2">
                              <Sparkles className="w-3 h-3 text-blue-400" />
                              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">AI 老师的思考逻辑</span>
                            </div>
                            <p className="text-xs text-gray-400 italic leading-relaxed">
                              {aiFeedback.reasoning}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                <div className="mt-10 flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={handleExplain}
                    disabled={isEvaluating || !userExplanation.trim()}
                    className="flex-1 py-6 bg-blue-600 text-white rounded-2xl font-bold text-xl hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-xl shadow-blue-100 active-shrink"
                  >
                    <Field content={currentQuestion.submitExplainBtnLabel} fieldName="submitExplainBtnLabel" />
                  </button>
                  
                  {aiFeedback?.status === 'pass' && (
                    <button
                      onClick={handleNextQuestion}
                      className="flex-1 py-6 bg-[#1a1a1a] text-white rounded-2xl font-bold text-xl hover:bg-gray-800 transition-all shadow-xl shadow-gray-200 flex items-center justify-center gap-3 active-shrink"
                    >
                      <Field content={currentQuestion.nextQuestionBtnLabel} fieldName="nextQuestionBtnLabel" /> <ArrowRight className="w-6 h-6" />
                    </button>
                  )}

                  {/* Skip Button - Safety Valve after 3 failures */}
                  {consecutiveFailures >= 3 && aiFeedback?.status !== 'pass' && (
                    <button
                      onClick={handleNextQuestion}
                      className="flex-1 py-6 bg-gray-100 text-gray-500 rounded-2xl font-bold text-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-3 active-shrink"
                    >
                      暂时跳过 <ArrowRight className="w-6 h-6" />
                    </button>
                  )}
                </div>
              </div>

              {/* Scaffolding / Hints */}
              <div className="bg-white rounded-[40px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" /> <Field content={currentQuestion.scaffoldLabel} fieldName="scaffoldLabel" />
                  </h4>
                  {hintLevel < 3 && (
                    <button 
                      onClick={() => setHintLevel(prev => prev + 1)}
                      className="touch-target text-xs font-bold text-blue-600 hover:underline active-shrink"
                    >
                      <Field content={currentQuestion.getHintBtnLabel} fieldName="getHintBtnLabel" />
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  {hintLevel >= 1 && (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-4">
                      <span className="shrink-0 w-16 text-[10px] font-bold text-gray-300 uppercase mt-1">
                        <Field content={currentQuestion.conceptLabel} fieldName="conceptLabel" />
                      </span>
                      <p className="text-sm font-medium text-gray-600">{currentQuestion.hintLevel1Concepts}</p>
                    </motion.div>
                  )}
                  {hintLevel >= 2 && (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-4">
                      <span className="shrink-0 w-16 text-[10px] font-bold text-gray-300 uppercase mt-1">
                        <Field content={currentQuestion.clueLabel} fieldName="clueLabel" />
                      </span>
                      <p className="text-sm font-medium text-gray-600">{currentQuestion.hintLevel2Clues}</p>
                    </motion.div>
                  )}
                  {hintLevel >= 3 && (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-4">
                      <span className="shrink-0 w-16 text-[10px] font-bold text-gray-300 uppercase mt-1">
                        <Field content={currentQuestion.templateLabel} fieldName="templateLabel" />
                      </span>
                      <p className="text-sm font-medium text-gray-600 italic">{currentQuestion.hintLevel3Template}</p>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 4: Wrap Up */}
          {step === 'wrapUp' && (
            <motion.div 
              key="wrapUp"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glow-border-wrap"
            >
              <div className="glass-card rounded-[40px] p-8 sm:p-12 shadow-2xl relative overflow-hidden">
                <div className="text-center mb-10 relative">
                  {/* Mastered Badge in Wrap Up */}
                  {(() => {
                    const currentChapter = chapters.find(c => c.id === currentChapterId);
                    const isMastered = currentChapter && currentChapter.completedCount >= currentChapter.questionIds.length && currentChapter.questionIds.length > 0;
                    return isMastered && (
                      <motion.div 
                        initial={{ scale: 0, rotate: -20, y: 20 }}
                        animate={{ scale: 1, rotate: 0, y: 0 }}
                        className="absolute -top-16 left-1/2 -translate-x-1/2 z-20"
                      >
                        <div className="relative group animate-float">
                          <div className="bg-gradient-to-br from-yellow-300 via-yellow-500 to-amber-600 text-white px-8 py-3 rounded-full text-sm font-black uppercase tracking-[0.3em] shadow-[0_0_30px_rgba(245,158,11,0.5)] flex items-center gap-2 overflow-hidden">
                            <Sparkles className="w-5 h-5" /> Mastered
                            {/* Shine Effect */}
                            <div className="absolute top-0 h-full w-12 bg-white/40 skew-x-[-25deg] animate-shine" />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })()}
                  
                  <div className="inline-block p-6 bg-white/10 rounded-full mb-6 backdrop-blur-sm border border-white/10">
                    <CheckCircle2 className="w-12 h-12 text-blue-400" />
                  </div>
                  
                  <h3 className="text-4xl font-black text-white text-glow mb-2">
                    {isReviewMode && remainingRedDots === 0 && "迷雾终结者，欢迎凯旋！"}
                    <Field content={currentQuestion.wrapUpTitle} fieldName="wrapUpTitle" />
                  </h3>
                  <p className="text-blue-200/70 font-medium uppercase tracking-widest text-xs">
                    Mission Accomplished
                  </p>
                </div>

                <div className="bg-white/5 rounded-[32px] p-10 mb-12 relative overflow-hidden border border-white/10">
                  <div className="absolute top-0 right-0 p-6 opacity-5">
                    <BookOpen className="w-32 h-32 text-white" />
                  </div>
                  <h4 className="text-blue-300 font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-widest">
                    <Lightbulb className="w-4 h-4" /> <Field content={currentQuestion.wrapUpPrompt} fieldName="wrapUpPrompt" />
                  </h4>
                  <p className="text-white text-xl leading-relaxed font-medium relative z-10">
                    <Field content={currentQuestion.wrapUpRule} fieldName="wrapUpRule" />
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  {(() => {
                    const currentChapter = chapters.find(c => c.id === currentChapterId);
                    const chapterFailedIds = currentChapter?.questionIds.filter(id => failedQuestionIds.has(id)) || [];
                    
                    if (chapterFailedIds.length > 0) {
                      return (
                        <button
                          onClick={() => {
                            if (isDebounced()) return;
                            const firstFailedId = currentChapter?.questionIds.find(id => failedQuestionIds.has(id));
                            const firstFailedIdx = filteredQuestions.findIndex(q => q.id === firstFailedId);
                            handleStartChapter(currentChapterId!, true, firstFailedIdx);
                          }}
                          className="w-full py-6 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-2xl font-bold text-xl transition-all flex items-center justify-center gap-3 active-shrink"
                        >
                          优先重练本章错题 ({chapterFailedIds.length}) <RefreshCcw className="w-6 h-6" />
                        </button>
                      );
                    }
                    return null;
                  })()}

                  <button
                    onClick={() => {
                      if (isDebounced()) return;
                      handleNextChapter();
                    }}
                    className="w-full py-6 bg-white text-slate-900 rounded-2xl font-bold text-xl hover:bg-blue-50 transition-all shadow-xl flex items-center justify-center gap-3 active-shrink"
                  >
                    {currentIndex < filteredQuestions.length - 1 ? "继续挑战" : "开启下一章"} <ChevronRight className="w-6 h-6" />
                  </button>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => {
                        if (isDebounced()) return;
                        handleRestart();
                      }}
                      className="py-4 border border-white/20 text-white/60 rounded-2xl font-bold text-sm hover:bg-white/5 transition-all flex items-center justify-center gap-2 active-shrink"
                    >
                      <RefreshCcw className="w-4 h-4" /> 重练本章
                    </button>
                    <button
                      onClick={() => {
                        if (isDebounced()) return;
                        handleBackToHome();
                      }}
                      className="py-4 bg-white/5 text-white/60 rounded-2xl font-bold text-sm hover:bg-white/10 transition-all flex items-center justify-center gap-2 active-shrink"
                    >
                      <Home className="w-4 h-4" /> 返回地图
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      if (isDebounced()) return;
                      handleEndPractice();
                    }}
                    className="w-full py-6 bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 rounded-2xl font-bold text-xl hover:bg-yellow-500/20 transition-all flex items-center justify-center gap-3 active-shrink mt-4"
                  >
                    <Hand className="w-6 h-6" /> 结束练习 · 查看战报
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {showDailyReport && (
          <DailyReport 
            summary={reportSummary} 
            isLoading={isGeneratingReport} 
            onClose={() => setShowDailyReport(false)} 
          />
        )}

        {/* Footer */}
        <footer className="mt-16 text-center">
          <p className="text-[10px] text-gray-300 font-bold tracking-[0.3em] uppercase">
            专为深度学习设计 • GrammarFlow v1.2
          </p>
        </footer>
      </div>
      {/* Medal Overlay */}
      <AnimatePresence>
        {showMedal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-6"
            onClick={() => setShowMedal(false)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="relative flex flex-col items-center text-center max-w-sm"
            >
              <div className="relative w-48 h-48 mb-8">
                <div className="absolute inset-0 bg-blue-500/30 blur-3xl animate-pulse" />
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-600 to-purple-600 animate-fluid opacity-80" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Trophy className="w-24 h-24 text-white animate-float" />
                </div>
              </div>
              
              <h2 className="text-4xl font-black text-white mb-4 tracking-tight">
                中考识破者
              </h2>
              <p className="text-blue-200/80 font-mono text-sm uppercase tracking-[0.2em] mb-8">
                Trap-Cracker Unlocked
              </p>
              
              <div className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm mb-8">
                <p className="text-white/90 text-lg italic leading-relaxed">
                  "洞察秋毫，直击考点。你已具备识破中考陷阱的顶级直觉。"
                </p>
              </div>

              <button
                onClick={() => setShowMedal(false)}
                className="px-8 py-4 rounded-full bg-white text-slate-950 font-bold text-sm uppercase tracking-widest hover:scale-105 transition-transform active-shrink"
              >
                继续征途
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Utils ---
