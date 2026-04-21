/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Question {
  id: string;
  chapterId: string;
  chapterName: string;
  chapterLabel: string;
  progressLabel: string;
  sortOrder: number;
  grammarPoint: string;
  stem: string;
  options: string[];
  correctAnswer: string;
  correctTitle: string;
  incorrectTitle: string;
  explanationTitle: string;
  explanationSummary: string;
  explainTitle: string;
  explainPassLabel: string;
  explainHintLabel: string;
  explainPrompt: string;
  explainPlaceholder: string;
  noAttemptFeedback: string;
  weakFeedback: string;
  hintLabel: string;
  scaffoldLabel: string;
  getHintBtnLabel: string;
  conceptLabel: string;
  clueLabel: string;
  templateLabel: string;
  submitExplainBtnLabel: string;
  passChallengeBtnLabel: string;
  nextQuestionBtnLabel: string;
  congratsTitle: string;
  congratsSubtitle: string;
  restartBtnLabel: string;
  hintLevel1Concepts: string;
  hintLevel2Clues: string;
  hintLevel3Template: string;
  passKeywords: string[];
  passFeedback: string;
  wrapUpTitle: string;
  wrapUpPrompt: string;
  wrapUpRule: string;
  isZhongkao?: boolean;
  trapAnalysis?: string;
}

export type QuizStep = 'question' | 'feedback' | 'explain' | 'wrapUp';

export type ExplainStatus = 'empty' | 'no_attempt' | 'weak' | 'pass';

export interface Chapter {
  id: string;
  name: string;
  questionIds: string[];
}

export interface Passage {
  id: string;
  title: string;
  content: string; // e.g., "Last week, our school held its annual Science Festival. My teacher [[zk22]] a STEM booth..."
  questionIds: string[]; // The questions that fill the blanks
  vibeTitle: string;
  vibeSubtitle: string;
}

export type ViewMode = 'map' | 'quiz' | 'passage';
