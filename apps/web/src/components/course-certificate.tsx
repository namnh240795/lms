import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Award, Download, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QueryState } from '@/components/query-state';
type Certificate = {
  id: string;
  learner_name: string;
  course_title: string;
  tutor_name: string;
  issued_at: string;
  lesson_count: number;
  pdf: string;
};
export function CourseCertificate({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const certificate = useMutation({
    mutationFn: () => api<Certificate>(`/learning/${courseId}/certificate`, 'POST', {}),
  });
  const data = certificate.data;
  function download() {
    if (!data) return;
    const bytes = Uint8Array.from(atob(data.pdf), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `learnly-certificate-${data.id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <Button
        variant="outline"
        className="certificate-action"
        onClick={() => {
          setOpen(true);
          certificate.mutate();
        }}
      >
        <Award size={17} />
        View certificate
      </Button>
      {open && (
        <Modal
          title="Completion certificate"
          className="certificate-modal"
          onClose={() => setOpen(false)}
        >
          <button
            className="modal-close"
            aria-label="Close certificate"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
          {certificate.isPending || certificate.isError ? (
            <QueryState
              loading={certificate.isPending}
              error={certificate.error}
              onRetry={() => certificate.mutate()}
            />
          ) : (
            data && (
              <>
                <div className="completion-certificate">
                  <div className="certificate-topline">
                    <span className="certificate-brand">learnly.</span>
                    <span className="certificate-seal" aria-hidden="true">
                      <Award size={28} />
                    </span>
                  </div>
                  <div className="certificate-heading">
                    <p className="certificate-kicker">A LEARNING MILESTONE</p>
                    <h2>Certificate of Completion</h2>
                  </div>
                  <div className="certificate-recipient">
                    <p>Presented to</p>
                    <h3>{data.learner_name}</h3>
                  </div>
                  <div className="certificate-course">
                    <p>For completing all lessons and required quizzes in</p>
                    <h4>{data.course_title}</h4>
                  </div>
                  <div className="certificate-details">
                    <div>
                      <span>ISSUED ON</span>
                      <strong>
                        {new Date(data.issued_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </strong>
                    </div>
                    <div>
                      <span>COURSE TUTOR</span>
                      <strong>{data.tutor_name}</strong>
                    </div>
                    <div>
                      <span>ACHIEVEMENT</span>
                      <strong>
                        {data.lesson_count} {data.lesson_count === 1 ? 'lesson' : 'lessons'}{' '}
                        completed
                      </strong>
                    </div>
                  </div>
                  <p className="certificate-id">Certificate ID · {data.id}</p>
                </div>
                <div className="certificate-footer">
                  <p className="muted small">
                    Issued by Learnly for course completion. This is not an accredited
                    qualification.
                  </p>
                  <Button onClick={download}>
                    <Download size={16} />
                    Download PDF
                  </Button>
                </div>
              </>
            )
          )}
        </Modal>
      )}
    </>
  );
}
