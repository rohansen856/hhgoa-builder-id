import Image from "next/image";
import IdCardStudio from "@/components/IdCardStudio";

export default function Home() {
  return (
    <main className="page">
      <div className="topbar">
        <div className="topbar-brand">
          <Image
            src="/hhgoa-icon.png"
            alt="Hacker House Goa"
            width={56}
            height={40}
            className="topbar-logo"
            priority
          />
          <div>
            <strong>HACKER HOUSE GOA</strong>
            <span>Builder Social Card Generator</span>
          </div>
        </div>
        <div className="topbar-meta">By team <u>CtrlCrew</u> </div>
      </div>

      <IdCardStudio />

      <footer className="page-footer">
        <span>Hacker House Goa 2026</span>
        <span aria-hidden>•</span>
        <span>#FrameInGoa</span>
        <span aria-hidden>•</span>
        <a
          href="https://github.com/rohansen856/hhgoa-builder-id"
          target="_blank"
          rel="noopener noreferrer"
        >
          See Source Code
        </a>
        <a
          href="https://www.figma.com/design/3Qe6v9TrgcTaVcCiEwRnaq/HHGoa-IdCard?node-id=0-1&t=Qieg44GF0xpyyj0C-1"
          target="_blank"
          rel="noopener noreferrer"
        >
          See Figma Design
        </a>
      </footer>
    </main>
  );
}
