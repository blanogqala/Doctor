export const SITE_ORIGIN = 'https://medspace.co.za';

export const DEFAULT_MARKETING_TITLE = 'MedSpace | Modern Practice Software for Doctors';

export const DEFAULT_MARKETING_DESCRIPTION =
  'Manage appointments, patient folders, clinical documentation and practice workflows in one modern workspace.';

export function marketingMetadata(input: {
  title: string;
  description: string;
  path: string;
}) {
  const url = `${SITE_ORIGIN}${input.path}`;
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: 'MedSpace',
      type: 'website' as const,
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: input.title,
      description: input.description,
    },
  };
}
