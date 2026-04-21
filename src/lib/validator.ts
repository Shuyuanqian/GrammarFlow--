import { Question } from '../types';

/**
 * Validates a single question object against the required schema.
 * Returns an array of missing or invalid field names.
 */
export function validateQuestion(q: Question): string[] {
  const missingFields: string[] = [];

  // Core fields
  if (!q.id) missingFields.push('id');
  if (!q.chapterId) missingFields.push('chapterId');
  if (!q.chapterName) missingFields.push('chapterName');
  if (!q.chapterLabel) missingFields.push('chapterLabel');
  if (!q.progressLabel) missingFields.push('progressLabel');
  if (typeof q.sortOrder !== 'number') missingFields.push('sortOrder');
  if (!q.grammarPoint) missingFields.push('grammarPoint');
  if (!q.stem) missingFields.push('stem');
  if (!q.options || q.options.length === 0) missingFields.push('options');
  if (!q.correctAnswer) missingFields.push('correctAnswer');
  if (!q.correctTitle) missingFields.push('correctTitle');
  if (!q.incorrectTitle) missingFields.push('incorrectTitle');
  if (!q.explanationTitle) missingFields.push('explanationTitle');
  if (!q.explanationSummary) missingFields.push('explanationSummary');
  if (!q.explainTitle) missingFields.push('explainTitle');
  if (!q.explainPassLabel) missingFields.push('explainPassLabel');
  if (!q.explainHintLabel) missingFields.push('explainHintLabel');
  if (!q.explainPrompt) missingFields.push('explainPrompt');
  if (!q.explainPlaceholder) missingFields.push('explainPlaceholder');
  if (!q.noAttemptFeedback) missingFields.push('noAttemptFeedback');
  if (!q.weakFeedback) missingFields.push('weakFeedback');
  if (!q.hintLevel1Concepts) missingFields.push('hintLevel1Concepts');
  if (!q.hintLevel2Clues) missingFields.push('hintLevel2Clues');
  if (!q.hintLevel3Template) missingFields.push('hintLevel3Template');
  if (!q.passKeywords || q.passKeywords.length === 0) missingFields.push('passKeywords');
  if (!q.passFeedback) missingFields.push('passFeedback');
  if (!q.wrapUpTitle) missingFields.push('wrapUpTitle');
  if (!q.wrapUpPrompt) missingFields.push('wrapUpPrompt');
  if (!q.wrapUpRule) missingFields.push('wrapUpRule');

  // UI Labels (Often missing in older questions)
  if (!q.hintLabel) missingFields.push('hintLabel');
  if (!q.scaffoldLabel) missingFields.push('scaffoldLabel');
  if (!q.getHintBtnLabel) missingFields.push('getHintBtnLabel');
  if (!q.conceptLabel) missingFields.push('conceptLabel');
  if (!q.clueLabel) missingFields.push('clueLabel');
  if (!q.templateLabel) missingFields.push('templateLabel');
  if (!q.submitExplainBtnLabel) missingFields.push('submitExplainBtnLabel');
  if (!q.passChallengeBtnLabel) missingFields.push('passChallengeBtnLabel');
  if (!q.nextQuestionBtnLabel) missingFields.push('nextQuestionBtnLabel');
  if (!q.congratsTitle) missingFields.push('congratsTitle');
  if (!q.congratsSubtitle) missingFields.push('congratsSubtitle');
  if (!q.restartBtnLabel) missingFields.push('restartBtnLabel');

  return missingFields;
}

/**
 * Validates the entire question bank.
 */
export function validateQuestionBank(questions: Question[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  
  questions.forEach(q => {
    const missing = validateQuestion(q);
    if (missing.length > 0) {
      errors[q.id || 'unknown'] = missing;
    }
  });

  return errors;
}
