import { mockQuestions } from './src/data/questions';
import { validateQuestionBank } from './src/lib/validator';

const errors = validateQuestionBank(mockQuestions);
if (Object.keys(errors).length > 0) {
  console.log(JSON.stringify(errors, null, 2));
} else {
  console.log('No errors found');
}
