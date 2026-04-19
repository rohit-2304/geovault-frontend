import React from 'react';

const Layout = ({ children }) => (
  <div className="bg-surface text-primary font-body selection:bg-primary selection:text-surface overflow-x-hidden min-h-screen flex flex-col">

    {/* ── Top App Bar ── */}
    <header className="flex justify-between items-center w-full px-4 md:px-8 h-20 sticky top-0 z-50 bg-stone-50 border-b-4 border-black brutalist-shadow">
      <div className="flex items-center gap-8">
        <h1 className="text-3xl font-black text-black tracking-tighter uppercase font-headline">GeoVault</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden lg:block font-label font-bold uppercase tracking-tight text-sm text-black">
          Zero-Knowledge Encryption
        </span>
        <div className="p-2 border-2 border-black bg-white brutalist-shadow-hover cursor-default">
          <span className="material-symbols-outlined block" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
        </div>
      </div>
    </header>

    {/* ── Page Content ── */}
    <main className="flex-grow">
      {children}
    </main>

    {/* ── Footer ── */}
    <footer className="w-full py-6 px-4 md:px-12 flex flex-col md:flex-row justify-between items-center bg-stone-50 border-t-4 border-black font-label text-xs uppercase tracking-widest gap-4 mt-12">
      <div className="font-black text-black">© 2026 GEOVAULT </div>
      <div className="flex gap-8">
        {/* <a className="opacity-70 hover:opacity-100 transition-opacity" href="#protocol">Protocol</a>
        <a className="opacity-70 hover:opacity-100 transition-opacity" href="#security">Security</a>
        <a className="opacity-70 hover:opacity-100 underline font-bold transition-opacity" href="#terminal">Terminal</a> */}
      </div>
    </footer>

    {/* ── Fixed Help Button ── */}
    {/* <div className="fixed bottom-4 right-4 hidden md:block">
      <div className="w-16 h-16 border-2 border-primary bg-white flex flex-col items-center justify-center gap-1 cursor-help hover:bg-primary hover:text-white transition-all brutalist-shadow">
        <span className="material-symbols-outlined">help</span>
        <span className="text-[8px] font-label font-bold">HELP</span>
      </div>
    </div> */}

  </div>
);

export default Layout;