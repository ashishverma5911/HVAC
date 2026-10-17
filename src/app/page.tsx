import React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { HeroSection } from '@/components/landing/HeroSection';
import { ReceptionistDemo } from '@/components/receptionist/ReceptionistDemo';
import { TrustSection } from '@/components/landing/TrustSection';
import { Footer } from '@/components/landing/Footer';

export default function Home() {
  return (
    <AppShell pageTitle="Demo Preview" badge="INTERACTIVE">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Hero Section */}
        <HeroSection />

        {/* Interactive Receptionist Demo (2-Column Workspace) */}
        <ReceptionistDemo />

        {/* Contractor Capabilities & Trust */}
        <TrustSection />

        {/* Footer */}
        <Footer />
      </div>
    </AppShell>
  );
}
