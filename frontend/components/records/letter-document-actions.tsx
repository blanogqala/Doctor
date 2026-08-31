'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Copy, FileDown, FileText, Mail, MoreHorizontal, Printer } from 'lucide-react';

const MAILTO_SAFE_LEN = 1800;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function extractEmail(contact?: string): string {
  if (!contact) return '';
  const match = contact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : '';
}

export function buildLetterDocumentHtml(params: {
  documentTitle: string;
  patientDisplayName: string;
  referredTo?: string;
  urgency?: string;
  reason?: string;
  letter: string;
}): string {
  const body = escapeHtml(params.letter).replace(/\n/g, '<br/>');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(params.documentTitle)} — ${escapeHtml(params.patientDisplayName)}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #111; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.55; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    .meta { color: #444; font-size: 13px; margin-bottom: 24px; }
    .letter { white-space: pre-wrap; font-size: 14px; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(params.documentTitle)}</h1>
  <div class="meta">
    <div><strong>Patient:</strong> ${escapeHtml(params.patientDisplayName)}</div>
    ${params.referredTo ? `<div><strong>Referred to:</strong> ${escapeHtml(params.referredTo)}</div>` : ''}
    ${params.urgency ? `<div><strong>Urgency:</strong> ${escapeHtml(params.urgency)}</div>` : ''}
    ${params.reason ? `<div><strong>Subject:</strong> ${escapeHtml(params.reason)}</div>` : ''}
  </div>
  <div class="letter">${body}</div>
</body>
</html>`;
}

export function openPrintWindow(html: string) {
  const win = window.open('', '_blank', 'noopener,noreferrer,width=800,height=900');
  if (!win) {
    throw new Error('Pop-up blocked. Allow pop-ups to print or export PDF.');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 250);
}

export function downloadWordDoc(params: {
  documentTitle: string;
  filenamePrefix: string;
  patientDisplayName: string;
  referredTo?: string;
  urgency?: string;
  reason?: string;
  letter: string;
}) {
  const paragraphs = escapeHtml(params.letter)
    .split(/\n/)
    .map((line) => `<p>${line || '&nbsp;'}</p>`)
    .join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(params.documentTitle)}</title></head>
<body>
  <h2>${escapeHtml(params.documentTitle)}</h2>
  <p><strong>Patient:</strong> ${escapeHtml(params.patientDisplayName)}</p>
  ${params.referredTo ? `<p><strong>Referred to:</strong> ${escapeHtml(params.referredTo)}</p>` : ''}
  ${params.urgency ? `<p><strong>Urgency:</strong> ${escapeHtml(params.urgency)}</p>` : ''}
  ${params.reason ? `<p><strong>Subject:</strong> ${escapeHtml(params.reason)}</p>` : ''}
  <hr/>
  ${paragraphs}
</body>
</html>`;

  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = params.patientDisplayName.replace(/[^\w\- ]+/g, '').trim() || 'Patient';
  a.href = url;
  a.download = `${params.filenamePrefix}-${safeName}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface LetterDocumentActionsMenuProps {
  letter: string;
  patientDisplayName: string;
  documentTitle: string;
  filenamePrefix: string;
  emailTo?: string;
  emailSubject?: string;
  referredTo?: string;
  urgency?: string;
  reason?: string;
  disabled?: boolean;
  requireApproved?: boolean;
  approved?: boolean;
}

export function LetterDocumentActionsMenu({
  letter,
  patientDisplayName,
  documentTitle,
  filenamePrefix,
  emailTo,
  emailSubject,
  referredTo,
  urgency,
  reason,
  disabled,
  requireApproved,
  approved,
}: LetterDocumentActionsMenuProps) {
  const { toast } = useToast();

  const ensureLetter = () => {
    if (!letter.trim()) {
      toast({ title: 'Nothing to use', description: 'Write or generate a letter first.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const ensureApproved = () => {
    if (requireApproved && !approved) {
      toast({
        title: 'Approve first',
        description: 'Approve the document before printing, emailing, or exporting.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const letterHtml = () =>
    buildLetterDocumentHtml({
      documentTitle,
      patientDisplayName,
      referredTo,
      urgency,
      reason,
      letter,
    });

  const handleCopy = async () => {
    if (!ensureLetter()) return;
    try {
      await navigator.clipboard.writeText(letter);
      toast({ title: 'Copied', description: 'Letter copied to clipboard.' });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Clipboard access was denied.',
        variant: 'destructive',
      });
    }
  };

  const handleMailto = () => {
    if (!ensureLetter() || !ensureApproved()) return;
    const subject = emailSubject || `${documentTitle}: ${patientDisplayName}`;
    let body = letter;
    if (body.length > MAILTO_SAFE_LEN) {
      body = `${body.slice(0, MAILTO_SAFE_LEN)}\n\n[Letter truncated for email — use Copy all text for the full letter.]`;
      toast({
        title: 'Letter truncated for email',
        description: 'Use Copy all text if the recipient needs the full body.',
      });
    }
    const href = `mailto:${emailTo ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  };

  const handlePrint = () => {
    if (!ensureLetter() || !ensureApproved()) return;
    try {
      openPrintWindow(letterHtml());
    } catch (err) {
      toast({
        title: 'Print failed',
        description: err instanceof Error ? err.message : 'Could not open print view',
        variant: 'destructive',
      });
    }
  };

  const handleExportPdf = () => {
    if (!ensureLetter() || !ensureApproved()) return;
    try {
      openPrintWindow(letterHtml());
      toast({
        title: 'Save as PDF',
        description: 'In the print dialog, choose “Save as PDF” or “Microsoft Print to PDF”.',
      });
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Could not open print view',
        variant: 'destructive',
      });
    }
  };

  const handleExportWord = () => {
    if (!ensureLetter() || !ensureApproved()) return;
    try {
      downloadWordDoc({
        documentTitle,
        filenamePrefix,
        patientDisplayName,
        referredTo,
        urgency,
        reason,
        letter,
      });
      toast({ title: 'Word download started' });
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Could not download Word file',
        variant: 'destructive',
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={disabled}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">More letter actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => void handleCopy()}>
          <Copy className="mr-2 h-4 w-4" />
          Copy all text
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleMailto}>
          <Mail className="mr-2 h-4 w-4" />
          Email to
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FileDown className="mr-2 h-4 w-4" />
            Export as
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={handleExportPdf}>
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportWord}>
              <FileText className="mr-2 h-4 w-4" />
              Word
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
