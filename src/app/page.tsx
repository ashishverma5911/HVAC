import React from 'react';
import { Navbar } from '@/components/landing/Navbar';
import { HeroSection } from '@/components/landing/HeroSection';
import { TrustSection } from '@/components/landing/TrustSection';
import { ReceptionistDemo } from '@/components/receptionist/ReceptionistDemo';
import { Footer } from '@/components/landing/Footer';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* Header Navigation */}
      <Navbar currentRoute="home" />

      {/* Hero Section */}
      <HeroSection />

      {/* Interactive AI Receptionist Demo */}
      <ReceptionistDemo />

      {/* Trust & Capabilities Section */}
      <TrustSection />

      {/* Footer */}
      <Footer />
    </div>
  );
}
