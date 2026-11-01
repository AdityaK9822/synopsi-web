/** Decorative typing indicator — the adjacent text label carries the
 *  state (motion is never the only feedback channel). */
export default function TypingDots() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1">
      <span className="typing-dot size-1.5 rounded-full bg-primary" />
      <span className="typing-dot size-1.5 rounded-full bg-primary" />
      <span className="typing-dot size-1.5 rounded-full bg-primary" />
    </span>
  );
}
