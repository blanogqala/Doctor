import { MarketingContainer } from './marketing-container';
import { MarketingHeading } from './marketing-heading';

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-16 sm:py-20">
      <MarketingContainer className="max-w-2xl">
        <MarketingHeading as="h1">{title}</MarketingHeading>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-[color:var(--ms-muted)]">
          {children}
        </div>
      </MarketingContainer>
    </section>
  );
}
