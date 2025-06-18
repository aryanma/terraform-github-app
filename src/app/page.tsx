"use client";
import React, { useState } from 'react';

export default function Home() {
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    const form = e.currentTarget;
    const repo = (form.repo as HTMLInputElement).value.trim();
    const priorities = (form.priorities as HTMLTextAreaElement).value.trim();
    if (!repo || !priorities) {
      setLoading(false);
      return;
    }
    const res = await fetch('/api/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, priorities })
    });
    setLoading(false);
    if (res.ok) setSuccess(true);
  };

  return (
    <div className="relative min-h-screen">
      {/* Background Dot Grid */}
      <div className="dot-grid" />
      
      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center">
        {/* Title and Content */}
        <div className="flex flex-col items-center mb-16">
          <h1 className="text-4xl font-serif font-light tracking-tight mb-2">a37</h1>
          <p className="text-gray-500 text-lg font-sans font-light">The R&amp;P lab reimagining DevOps</p>
        </div>

        {/* Minimal Form Card */}
        <div className="w-full max-w-md bg-white/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 p-8 flex flex-col gap-6">
          <h2 className="text-xl font-serif font-light mb-2 text-center">Terraform PR Reviewer</h2>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="repo" className="block text-gray-700 font-light mb-1">Repository Name</label>
              <input
                id="repo"
                name="repo"
                type="text"
                placeholder="e.g. aryanma/test"
                className="w-full px-4 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
              />
            </div>
            <div>
              <label htmlFor="priorities" className="block text-gray-700 font-light mb-1">Scan Priorities</label>
              <textarea
                id="priorities"
                name="priorities"
                rows={3}
                placeholder="e.g. Optimize costs, harden security, check compliance..."
                className="w-full px-4 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 transition resize-none"
              />
            </div>
            <button
              type="submit"
              className="mt-2 w-full py-2 rounded-md bg-black text-white font-light tracking-wide hover:bg-gray-800 transition disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Preferences'}
            </button>
            {success && <div className="text-green-600 text-center mt-2">Preferences saved!</div>}
          </form>
        </div>
      </main>
    </div>
  );
}
