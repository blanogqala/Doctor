'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { submitInquiry } from '@/lib/api/public';
import {
  inquirySchema,
  isConsumerEmail,
  type InquiryFormValues,
} from '@/lib/marketing/inquiry-schema';
import { SA_PROVINCES, REFERRAL_SOURCES } from '@/lib/marketing/constants';
import {
  SUBSCRIPTION_PLANS,
  marketingPlanLabel,
  marketingSeatDescription,
  type SubscriptionPlan,
} from '@/lib/subscription-plans';
import { trialHref } from '@/lib/marketing/routes';
import { SectionReveal } from './section-reveal';
import { MarketingContainer } from './marketing-container';
import { MarketingHeading } from './marketing-heading';

const inputFocusClass = 'text-base';

const ROLES = ['Doctor', 'Practice owner', 'Reception / admin', 'Other'] as const;

interface JoinFormSectionProps {
  requestedPlan?: SubscriptionPlan | null;
  onRequestedPlanChange?: (plan: SubscriptionPlan) => void;
  intent?: string | null;
}

export function JoinFormSection({
  requestedPlan,
  onRequestedPlanChange,
  intent,
}: JoinFormSectionProps) {
  const [submitted, setSubmitted] = useState(false);
  const [role, setRole] = useState<string>('');

  const form = useForm<InquiryFormValues>({
    resolver: zodResolver(inquirySchema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      practice_name: '',
      hpcsa_number: '',
      province: undefined,
      city: '',
      requested_subscription_plan: undefined,
      referral_source: '',
      message: '',
    },
  });

  useEffect(() => {
    if (requestedPlan) {
      form.setValue('requested_subscription_plan', requestedPlan, { shouldValidate: true });
    }
  }, [requestedPlan, form]);

  const onSubmit = async (values: InquiryFormValues) => {
    if (isConsumerEmail(values.email)) {
      toast.warning('We recommend using a professional email address for your practice.');
    }

    const extras = [
      role ? `Role: ${role}` : '',
      intent === 'demo' ? 'Request: demo' : '',
      values.message || '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await submitInquiry({ ...values, message: extras || undefined });
      setSubmitted(true);
      form.reset();
      setRole('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    }
  };

  if (submitted) {
    return (
      <section id="join" className="py-16 sm:py-20">
        <MarketingContainer className="max-w-xl text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-[color:var(--ms-teal)]" />
          <MarketingHeading className="mt-6">Thank you — we received your request.</MarketingHeading>
          <p className="mt-4 text-base text-[color:var(--ms-muted)]">
            We will follow up using the contact details you provided.
          </p>
          <Button className="mt-6" variant="outline" onClick={() => setSubmitted(false)}>
            Submit another inquiry
          </Button>
        </MarketingContainer>
      </section>
    );
  }

  return (
    <section id="join" className="ms-bg-hero py-16 sm:py-20 border-b-2 border-b-[#12A89D]">
      <MarketingContainer>
        <div className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionReveal>
            <MarketingHeading>Let’s talk about your practice.</MarketingHeading>
            <p className="mt-4 max-w-sm text-base text-slate-600">
              Tell us how your practice works today and we’ll show you where MediNathi can fit.
            </p>
            <p className="mt-6 text-sm text-slate-500">14-day trial · No setup fees</p>
            <p className="mt-2 text-sm text-slate-500">
              <a href="mailto:support@MediNathi.co.za" className="hover:underline">
                support@MediNathi.co.za
              </a>
            </p>
            <p className="mt-6 text-sm text-slate-600">
              Prefer to explore first?{' '}
              <Link href={trialHref()} className="font-medium text-[#2F63F5] underline-offset-2 hover:underline">
                Start a trial inquiry
              </Link>
              .
            </p>
          </SectionReveal>

          <SectionReveal delayMs={80}>
          <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Your name" className={inputFocusClass} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="practice_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Practice name</FormLabel>
                      <FormControl>
                        <Input placeholder="Practice name" className={inputFocusClass} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <Input type="email" className={inputFocusClass} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone *</FormLabel>
                        <FormControl>
                          <Input type="tel" className={inputFocusClass} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="role" className={`mt-2 ${inputFocusClass}`}>
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="hpcsa_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>HPCSA registration number *</FormLabel>
                        <FormControl>
                          <Input placeholder="MP0123456" className={`${inputFocusClass} uppercase`} {...field} />
                        </FormControl>
                        <FormDescription>
                          Required for practice onboarding. Find your number at{' '}
                          <a
                            href="https://www.hpcsa.co.za"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline-offset-2 hover:underline"
                          >
                            hpcsa.co.za
                          </a>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="province"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Province *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={inputFocusClass}>
                              <SelectValue placeholder="Select province" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SA_PROVINCES.map((province) => (
                              <SelectItem key={province} value={province}>
                                {province}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City / Town *</FormLabel>
                      <FormControl>
                        <Input className={inputFocusClass} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="requested_subscription_plan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Practice size *</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={(value) => {
                            field.onChange(value);
                            onRequestedPlanChange?.(value as SubscriptionPlan);
                          }}
                          value={field.value}
                          className="space-y-2"
                        >
                          {SUBSCRIPTION_PLANS.map((plan) => (
                            <div key={plan.plan} className="flex items-center space-x-2">
                              <RadioGroupItem value={plan.plan} id={`plan-${plan.plan}`} />
                              <Label htmlFor={`plan-${plan.plan}`} className="font-normal">
                                {marketingPlanLabel(plan.plan)} — {marketingSeatDescription(plan.plan)}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="referral_source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How did you hear about us?</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger className={inputFocusClass}>
                            <SelectValue placeholder="Select an option" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REFERRAL_SOURCES.map((source) => (
                            <SelectItem key={source} value={source}>
                              {source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What do you want help with?</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us how your practice works today."
                          className={`min-h-[100px] ${inputFocusClass}`}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-[#2F63F5] text-white hover:bg-[#2F63F5]/90"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    'Request a demo'
                  )}
                </Button>
              </form>
            </Form>
          </div>
          </SectionReveal>
        </div>
      </MarketingContainer>
    </section>
  );
}
