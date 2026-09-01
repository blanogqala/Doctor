import { ProductFrame } from './product-frame';

export function DoctorDashboardPreview({ compact = false }: { compact?: boolean }) {
  return (
    <ProductFrame title="Doctor dashboard" className={compact ? '' : 'min-h-[340px]'}>
      <div className="flex gap-4">
        <aside className="hidden w-24 shrink-0 space-y-2 sm:block" aria-hidden>
          {['Queue', 'Folder', 'Notes'].map((item) => (
            <div
              key={item}
              className="rounded-lg bg-slate-50 px-2 py-2 text-[10px] font-medium text-slate-500"
            >
              {item}
            </div>
          ))}
        </aside>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-slate-500">Tuesday · Demo clinic</p>
          <p className="mt-1 text-base font-semibold">Today’s queue</p>
          <ul className="mt-4 space-y-2.5">
            {[
              { time: '09:00', name: 'Jordan Hale (demo)', status: 'Arrived' },
              { time: '09:20', name: 'Sam Okoye (demo)', status: 'Waiting' },
              { time: '09:40', name: 'Riley Chen (demo)', status: 'Booked' },
              { time: '10:00', name: 'Alex Moreau (demo)', status: 'Booked' },
            ]
              .slice(0, compact ? 3 : 4)
              .map((row) => (
                <li
                  key={row.time}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs"
                >
                  <span className="font-medium text-slate-800">
                    {row.time} · {row.name}
                  </span>
                  <span className="text-[color:var(--ms-teal)]">{row.status}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </ProductFrame>
  );
}

export function PatientFolderPreview() {
  return (
    <ProductFrame title="Patient folder">
      <p className="text-base font-semibold">Jordan Hale · Demo patient</p>
      <p className="text-[11px] text-slate-500">Longitudinal record · fictional data</p>
      <ol className="mt-4 space-y-3 border-l-2 border-[color:var(--ms-aqua)] pl-4">
        <li className="text-sm">
          <span className="font-medium">Consult</span>
          <span className="block text-xs text-slate-500">12 Aug · Finalised SOAP</span>
        </li>
        <li className="text-sm">
          <span className="font-medium">Prescription</span>
          <span className="block text-xs text-slate-500">12 Aug</span>
        </li>
        <li className="text-sm">
          <span className="font-medium">Referral</span>
          <span className="block text-xs text-slate-500">19 Aug</span>
        </li>
        <li className="text-sm">
          <span className="font-medium">Amendment</span>
          <span className="block text-xs text-slate-500">20 Aug</span>
        </li>
      </ol>
    </ProductFrame>
  );
}

export function QueueCardPreview() {
  return (
    <ProductFrame title="Reception appointments">
      <p className="text-base font-semibold">Arrivals</p>
      <p className="text-[11px] text-slate-500">Operational view · no clinical notes</p>
      <div className="mt-4 space-y-2.5">
        <div className="rounded-xl bg-[color:var(--ms-aqua)] px-4 py-3 text-sm">
          Jordan Hale (demo) · Arrived 08:54
        </div>
        <div className="rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600">
          Sam Okoye (demo) · Waiting
        </div>
        <div className="rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600">
          Riley Chen (demo) · Booked 09:40
        </div>
      </div>
    </ProductFrame>
  );
}

export function CopilotPreview() {
  return (
    <ProductFrame title="Clinical AI Assistant" dark className="min-h-[320px]">
      <p className="text-[11px] text-white/55">Consent recorded · demo consult</p>
      <p className="mt-2 text-lg font-semibold">Structured draft</p>
      <div className="mt-5 space-y-3 text-sm text-white/80">
        <p>
          <span className="mr-2 text-white/40">S</span>
          Follow-up for hypertension (demo)
        </p>
        <p>
          <span className="mr-2 text-white/40">A</span>
          Draft suggestion — review required
        </p>
        <p>
          <span className="mr-2 text-white/40">P</span>
          Clinician decides what enters the record
        </p>
      </div>
      <div className="mt-8 flex gap-2">
        <span className="rounded-md bg-[#2F63F5] px-3 py-1.5 text-xs">Accept</span>
        <span className="rounded-md bg-white/10 px-3 py-1.5 text-xs">Edit</span>
        <span className="rounded-md bg-white/10 px-3 py-1.5 text-xs">Dismiss</span>
      </div>
    </ProductFrame>
  );
}

export function BrandingPreview() {
  return (
    <ProductFrame title="Patient portal">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2F63F5] text-sm font-semibold text-white">
          RP
        </span>
        <div>
          <p className="text-base font-semibold">River Practice (demo)</p>
          <p className="text-xs text-slate-500">your-practice.MediNathi.co.za</p>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs">
        {['Book', 'Messages', 'Visit'].map((item) => (
          <div key={item} className="rounded-xl bg-slate-50 py-6 font-medium text-slate-600">
            {item}
          </div>
        ))}
      </div>
    </ProductFrame>
  );
}
