'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ds/status-badge';
import { LetterDocumentActionsMenu } from '@/components/records/letter-document-actions';
import { RECORD_TAB_TRIGGER_CLASS } from '@/components/records/record-sub-tabs';
import { DOC_LABELS } from '@/components/records/clinical-letter-composer';
import { parseClinicalLetterSave } from '@/lib/clinical/consultation-save-payload';
import type { MedicalRecord, Referral } from '@/lib/types';
import type { ClinicalLetterDocumentType } from '@/lib/clinical/consultation-save-payload';

function ReferralLetterCard({
  referral,
  patientDisplayName,
}: {
  referral: Referral;
  patientDisplayName: string;
}) {
  const letter = referral.clinical_summary?.trim() || '';
  return (
    <Card>
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <p>
              Referred to <strong>{referral.referred_to}</strong>
              {referral.specialty ? ` (${referral.specialty})` : ''}
            </p>
            {referral.referred_to_institution && (
              <p className="text-muted-foreground">{referral.referred_to_institution}</p>
            )}
            <StatusBadge
              tone={referral.urgency === 'URGENT' ? 'danger' : 'info'}
              label={referral.urgency.toLowerCase()}
            />
            {referral.reason && referral.reason !== 'Referral' && (
              <p className="whitespace-pre-line">{referral.reason}</p>
            )}
          </div>
          {letter ? (
            <LetterDocumentActionsMenu
              letter={letter}
              patientDisplayName={patientDisplayName}
              documentTitle="Referral Letter"
              filenamePrefix="Referral-Letter"
              emailTo={referral.referred_to_contact ?? undefined}
              emailSubject={`Referral: ${patientDisplayName}`}
              referredTo={referral.referred_to}
              urgency={referral.urgency}
              reason={referral.reason}
            />
          ) : null}
        </div>
        {letter ? (
          <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">{letter}</pre>
        ) : (
          <p className="text-muted-foreground">No referral letter text was saved.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function LettersReadView({
  record,
  patientDisplayName,
}: {
  record: MedicalRecord;
  patientDisplayName: string;
}) {
  const referrals = record.referrals ?? [];
  const clinical = parseClinicalLetterSave(record.clinical_letters);
  const docType = clinical.document_type as ClinicalLetterDocumentType;
  const hasClinical = Boolean(clinical.letter.trim());

  return (
    <Tabs defaultValue="referral" className="space-y-4">
      <TabsList className="grid h-auto w-full max-w-md grid-cols-2 gap-1 border-2 border-primary bg-primary-soft">
        <TabsTrigger value="referral" className={RECORD_TAB_TRIGGER_CLASS}>
          Referral
        </TabsTrigger>
        <TabsTrigger value="other-letters" className={RECORD_TAB_TRIGGER_CLASS}>
          Others Letter
        </TabsTrigger>
      </TabsList>

      <TabsContent value="referral" className="mt-0 space-y-3">
        {!referrals.length ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            No referrals on this medical record.
          </div>
        ) : (
          referrals.map((r) => (
            <ReferralLetterCard key={r.id} referral={r} patientDisplayName={patientDisplayName} />
          ))
        )}
      </TabsContent>

      <TabsContent value="other-letters" className="mt-0">
        {!hasClinical ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            No other letters on this medical record.
          </div>
        ) : (
          <Card>
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{DOC_LABELS[docType] ?? 'Clinical letter'}</p>
                  {clinical.approved ? (
                    <p className="text-xs text-muted-foreground">Approved</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Draft</p>
                  )}
                </div>
                <LetterDocumentActionsMenu
                  letter={clinical.letter}
                  patientDisplayName={patientDisplayName}
                  documentTitle={DOC_LABELS[docType] ?? 'Clinical letter'}
                  filenamePrefix="Clinical-Letter"
                  emailSubject={`${DOC_LABELS[docType] ?? 'Letter'}: ${patientDisplayName}`}
                />
              </div>
              <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
                {clinical.letter}
              </pre>
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}
