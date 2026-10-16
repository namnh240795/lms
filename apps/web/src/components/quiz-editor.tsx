import { Plus, Trash2 } from 'lucide-react';
import type { Quiz, QuizQuestion } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NumberInput } from '@/components/ui/number-input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
function question(): QuizQuestion {
  const options = Array.from({ length: 4 }, () => ({ id: crypto.randomUUID(), text: '' }));
  return {
    id: crypto.randomUUID(),
    prompt: '',
    options,
    correctOptionId: options[0].id,
    explanation: '',
  };
}
export function QuizEditor({
  quiz,
  onChange,
}: {
  quiz?: Quiz | null;
  onChange: (quiz: Quiz | null) => void;
}) {
  function patchQuestion(id: string, values: Partial<QuizQuestion>) {
    if (quiz)
      onChange({
        ...quiz,
        questions: quiz.questions.map((q) => (q.id === id ? { ...q, ...values } : q)),
      });
  }
  return (
    <section className="quiz-editor">
      <div className="quiz-heading">
        <div>
          <h3>Lesson quiz</h3>
          <p className="small muted">Check understanding with multiple-choice questions.</p>
        </div>
        {quiz ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm('Remove this quiz from the lesson?')) onChange(null);
            }}
          >
            <Trash2 size={14} />
            Remove quiz
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({
                title: 'Check your understanding',
                passingScore: 70,
                questions: [question()],
              })
            }
          >
            <Plus size={14} />
            Add quiz
          </Button>
        )}
      </div>
      {quiz && (
        <>
          <label>
            Quiz title
            <Input
              value={quiz.title}
              required
              minLength={3}
              maxLength={150}
              onChange={(e) => onChange({ ...quiz, title: e.target.value })}
            />
          </label>
          <div className="form-field">
            <label htmlFor="quiz-passing-score">Passing score (%)</label>
            <NumberInput
              id="quiz-passing-score"
              label="passing score"
              min="1"
              max="100"
              step="1"
              value={String(quiz.passingScore)}
              onValueChange={(value) => onChange({ ...quiz, passingScore: Number(value) })}
            />
          </div>
          {quiz.questions.map((q, index) => (
            <div className="quiz-question-editor" key={q.id}>
              <div className="quiz-heading">
                <strong>Question {index + 1}</strong>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove question ${index + 1}`}
                  disabled={quiz.questions.length === 1}
                  onClick={() =>
                    onChange({
                      ...quiz,
                      questions: quiz.questions.filter((item) => item.id !== q.id),
                    })
                  }
                >
                  <Trash2 size={14} />
                </Button>
              </div>
              <label>
                Question {index + 1} prompt
                <Textarea
                  value={q.prompt}
                  required
                  minLength={5}
                  maxLength={1000}
                  onChange={(e) => patchQuestion(q.id, { prompt: e.target.value })}
                />
              </label>
              <div className="quiz-options-editor">
                {q.options.map((option, i) => (
                  <label key={option.id}>
                    Option {String.fromCharCode(65 + i)}
                    <Input
                      value={option.text}
                      required
                      maxLength={1000}
                      onChange={(e) =>
                        patchQuestion(q.id, {
                          options: q.options.map((o) =>
                            o.id === option.id ? { ...o, text: e.target.value } : o,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label>
                Correct answer
                <Select
                  value={q.correctOptionId}
                  onValueChange={(correctOptionId) => patchQuestion(q.id, { correctOptionId })}
                >
                  <SelectTrigger aria-label={`Question ${index + 1} correct answer`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {q.options.map((o, i) => (
                      <SelectItem key={o.id} value={o.id}>
                        Option {String.fromCharCode(65 + i)}
                        {o.text ? ` · ${o.text}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label>
                Answer explanation
                <Textarea
                  value={q.explanation || ''}
                  maxLength={2000}
                  placeholder="Explain why this answer is correct. Shown after submission."
                  onChange={(e) => patchQuestion(q.id, { explanation: e.target.value })}
                />
              </label>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={quiz.questions.length >= 25}
            onClick={() => onChange({ ...quiz, questions: [...quiz.questions, question()] })}
          >
            <Plus size={15} />
            Add question
          </Button>
          <p className="small muted">
            Students must pass to complete this lesson. They can retry as often as needed.
          </p>
        </>
      )}
    </section>
  );
}
