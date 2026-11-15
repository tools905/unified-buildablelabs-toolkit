// The application form's backdrop: a faint grid that fades out at the edges, two slow drifting glows in
// the brand blue and violet, and a soft light at the top. Decoration only.
export function ApplyBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden bg-[#06070a]">
      <div className="apply-grid absolute inset-0" />
      <div className="apply-aurora absolute -left-1/4 top-[-20%] h-[70vh] w-[70vw] rounded-full bg-[#0b3fde] opacity-[0.22] blur-[120px]" />
      <div className="apply-aurora apply-aurora-slow absolute -right-1/4 bottom-[-25%] h-[60vh] w-[60vw] rounded-full bg-[#7c8cff] opacity-[0.14] blur-[120px]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#275bff]/70 to-transparent" />
      <div className="apply-scan absolute inset-x-0 h-40 bg-gradient-to-b from-transparent via-[#275bff]/[0.04] to-transparent" />
    </div>
  );
}
