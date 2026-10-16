export function FormMessage({ id, message }: { id?: string; message?: string }) {
  return message ? (
    <p id={id} className="field-error" role="alert">
      {message}
    </p>
  ) : null;
}
export function ValidationSummary({ messages }: { messages: string[] }) {
  return messages.length ? (
    <div className="validation-summary" role="alert">
      <strong>Check the highlighted fields.</strong>
      <ul>
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  ) : null;
}
