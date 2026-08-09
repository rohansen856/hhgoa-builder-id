import IdCardStudio from "@/components/IdCardStudio";

export default function Home() {
  return (
    <main className="page">
      <div className="topbar">
        <div className="topbar-brand">
          <div className="topbar-mark" aria-hidden>
            गो
          </div>
          <div>
            <strong>HACKER GOA HOUSE</strong>
            <span>Builder Social Card Generator</span>
          </div>
        </div>
        <div className="topbar-meta">Studio</div>
      </div>

      <IdCardStudio />

      <footer className="page-footer">
        <span>Hacker House Goa 2026</span>
        <span aria-hidden>•</span>
        <span>#FrameInGoa</span>
      </footer>
    </main>
  );
}
